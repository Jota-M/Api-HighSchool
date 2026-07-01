// controllers/solicitudFacturaController.js
import SolicitudFactura from '../models/SolicitudFactura.js';
import { pool } from '../db/pool.js';
import UploadFile from '../utils/uploadFile.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import { getAdminUser, getAdminWhatsapp } from '../utils/getAdminUser.js';
import whatsappService from '../utils/whatsappService.js';

// ─── helper: notificación interna ────────────────────────────────────────────
// Usa la tabla notificacion_institucional + notificacion_destinatario
// que ya tenés en el schema
async function crearNotificacionInterna({ usuario_id, titulo, mensaje, referencia_id, creada_por }) {
    try {
        // 1. Crear el registro principal
        const notif = await pool.query(
            `INSERT INTO notificacion_institucional (
         codigo, titulo, mensaje, tipo, prioridad,
         audiencia, destinatario_usuario_id,
         enviar_whatsapp, enviar_email, enviar_interno,
         estado, creada_por
       ) VALUES (
         $1, $2, $3, 'notificacion_individual', 'alta',
         'individual', $4,
         false, false, true,
         'enviada', $5
       ) RETURNING id`,
            [
                `FACT-${Date.now()}-${referencia_id}`,
                titulo,
                mensaje,
                usuario_id,
                creada_por
            ]
        );

        const notificacion_id = notif.rows[0].id;

        // 2. Crear el destinatario
        await pool.query(
            `INSERT INTO notificacion_destinatario (
         notificacion_id, usuario_id, canal,
         estado_envio, enviado_en
       ) VALUES ($1, $2, 'interno', 'enviado', CURRENT_TIMESTAMP)`,
            [notificacion_id, usuario_id]
        );

        return notificacion_id;
    } catch (error) {
        // No bloqueamos el flujo principal si falla la notificación
        console.error('[Notificacion] Error al crear notificación interna:', error.message);
        return null;
    }
}

// ─── helper: WhatsApp vía Evolution API ──────────────────────────────────────
async function enviarWhatsApp(numero, mensaje) {
    const resultado = await whatsappService.enviarMensaje({
        to: numero,
        body: mensaje
    });
    return resultado.success;
}

// ─── Controller ──────────────────────────────────────────────────────────────
class SolicitudFacturaController {

    // ══════════════════════════════════════════════════════════════════════════
    // [PADRE] POST /api/padre/pago/:pago_id/solicitar-factura
    // ══════════════════════════════════════════════════════════════════════════
    static async solicitarFactura(req, res) {
        try {
            const { pago_id } = req.params;

            // 1. Verificar que el pago pertenece a un hijo del padre autenticado
            const resultVerif = await pool.query(
                `SELECT
           pm.id,
           pm.codigo_pago,
           pm.monto_pagado,
           m.mes_correspondiente,
           e.nombres,
           e.apellidos
         FROM pago_mensualidad pm
         INNER JOIN mensualidad m       ON pm.mensualidad_id    = m.id
         INNER JOIN matricula mat       ON m.matricula_id       = mat.id
         INNER JOIN estudiante e        ON mat.estudiante_id    = e.id
         INNER JOIN estudiante_tutor et ON e.id                 = et.estudiante_id
         INNER JOIN padre_familia pf    ON et.padre_familia_id  = pf.id
         WHERE pm.id         = $1
           AND pf.usuario_id = $2
           AND pm.anulado    = false`,
                [pago_id, req.user.id]
            );

            if (resultVerif.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'No tenés acceso a este pago o el pago no existe'
                });
            }

            const pago = resultVerif.rows[0];

            // 2. Verificar que no exista ya una solicitud para este pago
            const existente = await SolicitudFactura.findByPago(pago_id);
            if (existente) {
                return res.status(409).json({
                    success: false,
                    message: existente.estado === 'completada'
                        ? 'Ya existe una factura disponible para este pago, podés descargarla desde tu historial'
                        : 'Ya enviaste una solicitud para este pago, está pendiente de respuesta'
                });
            }

            // 3. Crear la solicitud
            const solicitud = await SolicitudFactura.create(pago_id, req.user.id);

            // 4. Obtener datos del admin
            const admin = await getAdminUser();
            const adminWhatsapp = getAdminWhatsapp();

            const tituloAdmin = '📄 Nueva solicitud de factura';
            const mensajeAdmin =
                `El padre solicitó factura del pago ${pago.codigo_pago} ` +
                `(${pago.mes_correspondiente}) de ` +
                `${pago.nombres} ${pago.apellidos} — ` +
                `Bs ${parseFloat(pago.monto_pagado).toFixed(2)}`;

            // 4a. Notificación interna al admin
            if (admin) {
                await crearNotificacionInterna({
                    usuario_id: admin.id,
                    titulo: tituloAdmin,
                    mensaje: mensajeAdmin,
                    referencia_id: solicitud.id,
                    creada_por: req.user.id
                });
            }

            // 4b. WhatsApp al admin
            if (adminWhatsapp) {
                const msgWA =
                    `📄 *Nueva solicitud de factura*\n\n` +
                    `👤 Estudiante: ${pago.nombres} ${pago.apellidos}\n` +
                    `📋 Pago: ${pago.codigo_pago}\n` +
                    `📅 Mes: ${pago.mes_correspondiente}\n` +
                    `💰 Monto: Bs ${parseFloat(pago.monto_pagado).toFixed(2)}\n\n` +
                    `Ingresá al panel de administración para subir la factura.`;

                await enviarWhatsApp(adminWhatsapp, msgWA);
            }

            // 5. Log
            const reqInfo = RequestInfo.extract(req);
            await ActividadLog.create({
                usuario_id: req.user.id,
                accion: 'crear',
                modulo: 'solicitud_factura',
                tabla_afectada: 'solicitud_factura',
                registro_id: solicitud.id,
                datos_nuevos: {
                    pago_id,
                    pago_codigo: pago.codigo_pago,
                    mes: pago.mes_correspondiente
                },
                ip_address: reqInfo.ip,
                user_agent: reqInfo.userAgent,
                resultado: 'exitoso',
                mensaje: `Padre solicitó factura del pago ${pago.codigo_pago}`
            });

            return res.status(201).json({
                success: true,
                message: 'Solicitud enviada. El administrador la procesará a la brevedad.',
                data: { solicitud }
            });

        } catch (error) {
            console.error('[SolicitudFactura] Error al solicitar:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al solicitar factura: ' + error.message
            });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // [PADRE] GET /api/padre/solicitudes-factura
    // ══════════════════════════════════════════════════════════════════════════
    static async listarSolicitudesPadre(req, res) {
        try {
            const solicitudes = await SolicitudFactura.findByPadre(req.user.id);
            return res.json({
                success: true,
                data: { solicitudes, total: solicitudes.length }
            });
        } catch (error) {
            console.error('[SolicitudFactura] Error al listar (padre):', error);
            return res.status(500).json({
                success: false,
                message: 'Error al listar solicitudes: ' + error.message
            });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // [ADMIN] GET /api/solicitudes-factura
    // ══════════════════════════════════════════════════════════════════════════
    static async listarAdmin(req, res) {
        try {
            const { estado, page, limit } = req.query;

            const result = await SolicitudFactura.findAll({
                estado,
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 20
            });

            return res.json({ success: true, data: result });
        } catch (error) {
            console.error('[SolicitudFactura] Error al listar (admin):', error);
            return res.status(500).json({
                success: false,
                message: 'Error al listar solicitudes: ' + error.message
            });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // [ADMIN] GET /api/solicitudes-factura/pendientes/count  ← badge
    // ══════════════════════════════════════════════════════════════════════════
    static async countPendientes(req, res) {
        try {
            const total = await SolicitudFactura.countPendientes();
            return res.json({ success: true, data: { total } });
        } catch (error) {
            console.error('[SolicitudFactura] Error al contar pendientes:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al contar solicitudes: ' + error.message
            });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // [ADMIN] POST /api/solicitudes-factura/:id/subir-factura
    // multipart/form-data → campo: "factura" (PDF o imagen, máx 10MB)
    // ══════════════════════════════════════════════════════════════════════════
    static async subirFactura(req, res) {
        try {
            const { id } = req.params;
            const { observaciones } = req.body;

            // 1. Verificar que la solicitud existe y está pendiente
            const solicitud = await SolicitudFactura.findById(id);
            if (!solicitud) {
                return res.status(404).json({
                    success: false,
                    message: 'Solicitud no encontrada'
                });
            }
            if (solicitud.estado !== 'pendiente') {
                return res.status(400).json({
                    success: false,
                    message: 'Esta solicitud ya fue procesada anteriormente'
                });
            }

            // 2. Verificar que llegó el archivo
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'Debés adjuntar el archivo de factura (PDF o imagen)'
                });
            }

            // 3. Subir a Cloudinary en carpeta dedicada
            const resourceType = UploadFile.getResourceType(req.file.mimetype);
            const ext = req.file.originalname.split('.').pop();
            const fileName = resourceType === 'raw'
                ? `factura_${id}_${Date.now()}.${ext}`
                : `factura_${id}_${Date.now()}`;

            const uploadResult = await UploadFile.uploadFromBuffer(
                req.file.buffer,
                'facturas_mensualidad',
                fileName,
                resourceType
            );

            // 4. Actualizar la solicitud en BD
            const actualizada = await SolicitudFactura.subirFactura(id, {
                factura_url: uploadResult.url,
                factura_public_id: uploadResult.public_id,
                subido_por: req.user.id,
                observaciones
            });

            // 5. Notificar al padre — interno + WhatsApp
            // 5a. Notificación interna al padre
            await crearNotificacionInterna({
                usuario_id: solicitud.solicitado_por,
                titulo: '✅ Tu factura está lista',
                mensaje: `La factura del pago ${solicitud.codigo_pago} ` +
                    `(${solicitud.mes_correspondiente}) ya está disponible. ` +
                    `Ingresá a tu historial de pagos para descargarla.`,
                referencia_id: solicitud.id,
                creada_por: req.user.id
            });

            // 5b. Obtener el número de WhatsApp del padre desde padre_familia
            const resultPadre = await pool.query(
                `SELECT pf.telefono, pf.celular, pf.nombres, pf.apellidos
         FROM padre_familia pf
         INNER JOIN usuarios u ON pf.usuario_id = u.id
         WHERE u.id = $1
           AND pf.deleted_at IS NULL
         LIMIT 1`,
                [solicitud.solicitado_por]
            );

            if (resultPadre.rows.length > 0) {
                const padre = resultPadre.rows[0];
                // Preferir celular, si no telefono
                const numPadre = padre.celular || padre.telefono;

                if (numPadre) {
                    const msgWA =
                        `✅ *Tu factura está lista*\n\n` +
                        `📋 Pago: ${solicitud.codigo_pago}\n` +
                        `📅 Mes: ${solicitud.mes_correspondiente}\n` +
                        `👤 Estudiante: ${solicitud.estudiante_nombres} ${solicitud.estudiante_apellidos}\n` +
                        `💰 Monto: Bs ${parseFloat(solicitud.monto_pagado).toFixed(2)}\n\n` +
                        `Ingresá al portal para descargarla desde tu historial de pagos.`;

                    await enviarWhatsApp(numPadre, msgWA);
                }
            }

            // 6. Log
            const reqInfo = RequestInfo.extract(req);
            await ActividadLog.create({
                usuario_id: req.user.id,
                accion: 'subir_factura',
                modulo: 'solicitud_factura',
                tabla_afectada: 'solicitud_factura',
                registro_id: parseInt(id),
                datos_nuevos: {
                    factura_url: uploadResult.url,
                    public_id: uploadResult.public_id
                },
                ip_address: reqInfo.ip,
                user_agent: reqInfo.userAgent,
                resultado: 'exitoso',
                mensaje: `Factura subida para solicitud #${id} — pago ${solicitud.codigo_pago}`
            });

            return res.json({
                success: true,
                message: 'Factura subida y padre notificado exitosamente',
                data: { solicitud: actualizada }
            });

        } catch (error) {
            console.error('[SolicitudFactura] Error al subir factura:', error);
            return res.status(500).json({
                success: false,
                message: 'Error al subir factura: ' + error.message
            });
        }
    }
}

export default SolicitudFacturaController;
