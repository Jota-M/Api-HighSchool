// controllers/padreFamiliaTransportePayController.js
import { pool } from '../db/pool.js';
import {
    generarQR,
    inhabilitarQR,
    formatearFechaSIP,
    truncarGlosa,
} from '../services/sipService.js';

const CALLBACK_URL = process.env.CALLBACK_URL || 'https://api-highschool-5ujz.onrender.com';

function calcularExpiracionQR(fechaVencimientoCuota) {
    const ahora = new Date();
    const venc = new Date(fechaVencimientoCuota);
    return venc > ahora ? venc : new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
}

class PadreFamiliaTransportePayController {

    // ══════════════════════════════════════════════════════════════════════
    // 1. GET /api/padre/transporte/hijos
    //    Hijos que tienen asignación de transporte activa
    // ══════════════════════════════════════════════════════════════════════
    static async obtenerHijosConTransporte(req, res) {
        try {
            const resultPadre = await pool.query(
                `SELECT id FROM padre_familia WHERE usuario_id = $1 AND deleted_at IS NULL`,
                [req.user.id]
            );

            if (resultPadre.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'No se encontró perfil de padre de familia' });
            }

            const padreFamiliaId = resultPadre.rows[0].id;

            const result = await pool.query(
                `SELECT
           e.id AS estudiante_id,
           e.codigo AS estudiante_codigo,
           e.nombres,
           e.apellidos,
           e.foto_url,
           at.id AS asignacion_id,
           at.costo_mensual,
           r.nombre AS ruta_nombre,
           pr.nombre AS parada_nombre,
           COUNT(pt.id) AS total_cuotas,
           COUNT(CASE WHEN pt.estado = 'pagado' THEN 1 END) AS cuotas_pagadas,
           COUNT(CASE WHEN pt.estado IN ('pendiente', 'vencido') THEN 1 END) AS cuotas_pendientes
         FROM estudiante_tutor et
         INNER JOIN estudiante e ON et.estudiante_id = e.id
         INNER JOIN asignacion_transporte at ON at.estudiante_id = e.id AND at.activo = true
         INNER JOIN ruta_transporte r ON at.ruta_id = r.id
         LEFT JOIN parada_ruta pr ON at.parada_id = pr.id
         LEFT JOIN pago_transporte pt ON pt.asignacion_transporte_id = at.id AND pt.anulado = false
         WHERE et.padre_familia_id = $1
           AND e.activo = true
           AND e.deleted_at IS NULL
         GROUP BY e.id, e.codigo, e.nombres, e.apellidos, e.foto_url,
                  at.id, at.costo_mensual, r.nombre, pr.nombre
         ORDER BY e.apellidos ASC`,
                [padreFamiliaId]
            );

            return res.json({ success: true, data: { hijos: result.rows, total: result.rows.length } });
        } catch (error) {
            console.error('Error al obtener hijos con transporte:', error);
            return res.status(500).json({ success: false, message: 'Error: ' + error.message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 2. GET /api/padre/transporte/hijos/:estudiante_id/cuotas
    // ══════════════════════════════════════════════════════════════════════
    static async obtenerCuotasHijo(req, res) {
        try {
            const { estudiante_id } = req.params;

            const resultAcceso = await pool.query(
                `SELECT pf.id FROM padre_familia pf
         INNER JOIN estudiante_tutor et ON pf.id = et.padre_familia_id
         WHERE pf.usuario_id = $1 AND et.estudiante_id = $2 AND pf.deleted_at IS NULL`,
                [req.user.id, estudiante_id]
            );

            if (resultAcceso.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'No tenés acceso a este estudiante' });
            }

            // Marcar vencidas, igual que se hace con mensualidad
            await pool.query(
                `UPDATE pago_transporte
         SET estado = 'vencido', updated_at = CURRENT_TIMESTAMP
         WHERE estado = 'pendiente'
           AND fecha_vencimiento < CURRENT_DATE
           AND asignacion_transporte_id IN (
             SELECT id FROM asignacion_transporte WHERE estudiante_id = $1 AND activo = true
           )`,
                [estudiante_id]
            );

            const result = await pool.query(
                `SELECT
           pt.id AS pago_id,
           pt.codigo_pago,
           pt.mes_correspondiente,
           pt.fecha_vencimiento,
           pt.monto_original,
           pt.monto_recargo,
           pt.monto_final,
           pt.estado,
           pt.qr_data AS alias_qr,
           pt.qr_estado,
           pt.qr_expiracion,
           pt.fecha_pago,
           pt.monto_pagado,
           CASE
             WHEN pt.qr_estado = 'generado' AND pt.qr_expiracion > CURRENT_TIMESTAMP
             THEN true ELSE false
           END AS tiene_qr_activo
         FROM pago_transporte pt
         INNER JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
         WHERE at.estudiante_id = $1
           AND at.activo = true
           AND pt.anulado = false
         ORDER BY pt.fecha_vencimiento ASC`,
                [estudiante_id]
            );

            const cuotas = result.rows;
            const resumen = {
                total: cuotas.length,
                pagadas: cuotas.filter(c => c.estado === 'pagado').length,
                pendientes: cuotas.filter(c => c.estado === 'pendiente').length,
                vencidas: cuotas.filter(c => c.estado === 'vencido').length,
                monto_pendiente: cuotas.filter(c => c.estado !== 'pagado')
                    .reduce((acc, c) => acc + parseFloat(c.monto_final), 0),
            };

            return res.json({ success: true, data: { cuotas, resumen } });
        } catch (error) {
            console.error('Error al obtener cuotas de transporte:', error);
            return res.status(500).json({ success: false, message: 'Error: ' + error.message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 3. POST /api/padre/transporte/:pago_id/generar-qr  (QR individual)
    // ══════════════════════════════════════════════════════════════════════
    static async generarQRPago(req, res) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { pago_id } = req.params;

            const resultVerif = await client.query(
                `SELECT
           pt.id, pt.estado, pt.monto_final, pt.mes_correspondiente, pt.fecha_vencimiento,
           e.nombres, e.apellidos
         FROM pago_transporte pt
         INNER JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
         INNER JOIN estudiante e ON at.estudiante_id = e.id
         INNER JOIN estudiante_tutor et ON e.id = et.estudiante_id
         INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
         WHERE pt.id = $1 AND pf.usuario_id = $2 AND pt.anulado = false`,
                [pago_id, req.user.id]
            );

            if (resultVerif.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: 'No tenés acceso a este pago' });
            }

            const pago = resultVerif.rows[0];

            if (pago.estado === 'pagado') {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Esta cuota ya está pagada' });
            }
            if (pago.estado === 'anulado' || pago.estado === 'cancelado') {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Esta cuota está anulada, contactá al administrador' });
            }

            // ── QR activo existente ──
            const resultQRExistente = await client.query(
                `SELECT qr_data, qr_expiracion, qr_image_url, monto_final
         FROM pago_transporte
         WHERE id = $1 AND qr_estado = 'generado' AND qr_expiracion > CURRENT_TIMESTAMP`,
                [pago_id]
            );

            if (resultQRExistente.rows.length > 0) {
                const p = resultQRExistente.rows[0];
                await client.query('ROLLBACK');
                return res.json({
                    success: true,
                    qr_existente: true,
                    message: 'Ya existe un QR activo para esta cuota',
                    data: {
                        imagenQr: p.qr_image_url,
                        alias: p.qr_data,
                        qr_expiracion: p.qr_expiracion,
                        monto: p.monto_final,
                        mes: pago.mes_correspondiente,
                        estudiante: `${pago.nombres} ${pago.apellidos}`,
                    },
                });
            }

            const alias = `trans-${pago_id}-${Date.now()}`;
            const qrExpiracion = calcularExpiracionQR(pago.fecha_vencimiento);
            const fechaVencimiento = formatearFechaSIP(qrExpiracion);
            const glosa = truncarGlosa(`Transp ${pago.mes_correspondiente} ${pago.apellidos}`);
            const callbackUrl = `${CALLBACK_URL}/api/sip/callback-transporte`;

            let qrData;
            try {
                qrData = await generarQR({
                    alias,
                    monto: parseFloat(pago.monto_final),
                    moneda: 'BOB',
                    glosa,
                    fechaVencimiento,
                    callbackUrl,
                });
            } catch (sipError) {
                await client.query('ROLLBACK');
                console.error('[GenerarQRTransporte] Error de SIP:', sipError.message);
                return res.status(502).json({
                    success: false,
                    message: 'No se pudo generar el QR en este momento. Intentá más tarde.',
                    detalle: sipError.message,
                });
            }

            await client.query(
                `UPDATE pago_transporte
         SET qr_data = $1, qr_image_url = $2, qr_expiracion = $3,
             transaccion_id = $4, qr_estado = 'generado',
             observaciones = COALESCE(observaciones, '') || $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
                [
                    alias, qrData.imagenQr, qrExpiracion, qrData.idQr,
                    ` | QR generado por padre. IdQr SIP: ${qrData.idQr}`,
                    pago_id,
                ]
            );

            await client.query('COMMIT');

            console.log(`[GenerarQRTransporte] ✅ Alias: ${alias} | Estudiante: ${pago.nombres} ${pago.apellidos}`);

            return res.status(201).json({
                success: true,
                message: 'QR generado exitosamente',
                data: {
                    imagenQr: qrData.imagenQr,
                    alias,
                    monto: pago.monto_final,
                    mes: pago.mes_correspondiente,
                    estudiante: `${pago.nombres} ${pago.apellidos}`,
                    bancoDestino: qrData.bancoDestino,
                    cuentaDestino: qrData.cuentaDestino,
                    qr_expiracion: qrExpiracion,
                    fechaVencimiento: qrData.fechaVencimiento,
                },
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al generar QR de transporte:', error);
            return res.status(500).json({ success: false, message: 'Error al generar el QR: ' + error.message });
        } finally {
            client.release();
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. GET /api/padre/transporte/:pago_id/estado-qr  (solo lectura, sin SIP)
    // ══════════════════════════════════════════════════════════════════════
    static async verificarEstadoQR(req, res) {
        try {
            const { pago_id } = req.params;

            const result = await pool.query(
                `SELECT pt.estado, pt.qr_estado, pt.qr_expiracion
         FROM pago_transporte pt
         INNER JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
         INNER JOIN estudiante e ON at.estudiante_id = e.id
         INNER JOIN estudiante_tutor et ON e.id = et.estudiante_id
         INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
         WHERE pt.id = $1 AND pf.usuario_id = $2`,
                [pago_id, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'No tenés acceso a este pago' });
            }

            const row = result.rows[0];

            if (row.estado === 'pagado') {
                return res.json({ success: true, estado: 'PAGADO', message: '¡Pago confirmado! Tu cuota de transporte está al día.' });
            }

            if (!row.qr_estado) {
                return res.json({ success: true, estado: 'SIN_QR', message: 'No hay un QR generado para esta cuota' });
            }

            if (new Date(row.qr_expiracion) < new Date()) {
                return res.json({ success: true, estado: 'EXPIRADO', qr_expiracion: row.qr_expiracion, message: 'El QR expiró. Cancelalo y generá uno nuevo.' });
            }

            return res.json({
                success: true,
                estado: row.qr_estado.toUpperCase(),
                qr_expiracion: row.qr_expiracion,
                message: 'Pago pendiente. Escaneá el QR con la app de tu banco.',
            });
        } catch (error) {
            console.error('Error al verificar estado QR de transporte:', error);
            return res.status(500).json({ success: false, message: 'Error: ' + error.message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 5. DELETE /api/padre/transporte/:pago_id/cancelar-qr
    // ══════════════════════════════════════════════════════════════════════
    static async cancelarQR(req, res) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { pago_id } = req.params;

            const resultVerif = await client.query(
                `SELECT pt.id, pt.qr_data
         FROM pago_transporte pt
         INNER JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
         INNER JOIN estudiante e ON at.estudiante_id = e.id
         INNER JOIN estudiante_tutor et ON e.id = et.estudiante_id
         INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
         WHERE pt.id = $1 AND pf.usuario_id = $2
           AND pt.qr_estado = 'generado' AND pt.anulado = false`,
                [pago_id, req.user.id]
            );

            if (resultVerif.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'No hay un QR activo para cancelar, o no tenés acceso' });
            }

            const { qr_data: alias } = resultVerif.rows[0];

            try {
                await inhabilitarQR(alias);
            } catch (sipError) {
                console.warn(`[CancelarQRTransporte] SIP no pudo inhabilitar (${sipError.message}), cancelando solo en BD`);
            }

            await client.query(
                `UPDATE pago_transporte
         SET qr_estado = 'cancelado', updated_at = CURRENT_TIMESTAMP
         WHERE qr_data = $1 AND anulado = false`,
                [alias]
            );

            await client.query('COMMIT');
            return res.json({ success: true, message: 'QR cancelado exitosamente. Podés generar uno nuevo cuando quieras.' });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al cancelar QR de transporte:', error);
            return res.status(500).json({ success: false, message: 'Error: ' + error.message });
        } finally {
            client.release();
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 6. POST /api/padre/transporte/cuotas/generar-qr-familiar
    //    Un QR para cuotas de transporte de VARIOS hijos (o varias cuotas de uno)
    // ══════════════════════════════════════════════════════════════════════
    static async generarQRFamiliar(req, res) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { pago_ids } = req.body; // array de pago_transporte.id

            if (!pago_ids || !Array.isArray(pago_ids) || pago_ids.length < 2) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Debés seleccionar al menos 2 cuotas' });
            }

            const resultPadre = await client.query(
                `SELECT id FROM padre_familia WHERE usuario_id = $1 AND deleted_at IS NULL`,
                [req.user.id]
            );

            if (resultPadre.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'Perfil de padre no encontrado' });
            }

            const padreFamiliaId = resultPadre.rows[0].id;

            const resultCuotas = await client.query(
                `SELECT
           pt.id, pt.estado, pt.monto_final, pt.mes_correspondiente, pt.fecha_vencimiento,
           e.id AS estudiante_id, e.nombres, e.apellidos,
           (pt.qr_estado = 'generado' AND pt.qr_expiracion > CURRENT_TIMESTAMP) AS tiene_qr_activo
         FROM pago_transporte pt
         INNER JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
         INNER JOIN estudiante e ON at.estudiante_id = e.id
         INNER JOIN estudiante_tutor et ON e.id = et.estudiante_id
         WHERE pt.id = ANY($1)
           AND et.padre_familia_id = $2
           AND at.activo = true
           AND pt.anulado = false`,
                [pago_ids, padreFamiliaId]
            );

            if (resultCuotas.rows.length !== pago_ids.length) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: 'Algunas cuotas no existen o no pertenecen a tus hijos' });
            }

            const cuotas = resultCuotas.rows;

            const noValidas = cuotas.filter(c => !['pendiente', 'vencido'].includes(c.estado));
            if (noValidas.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: `No se pueden pagar: ${noValidas.map(c => `${c.nombres} - ${c.mes_correspondiente}`).join(', ')}`,
                });
            }

            const conQRActivo = cuotas.filter(c => c.tiene_qr_activo);
            if (conQRActivo.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: `Ya tienen QR activo: ${conQRActivo.map(c => `${c.nombres} - ${c.mes_correspondiente}`).join(', ')}. Cancelalos primero.`,
                });
            }

            const montoTotal = cuotas.reduce((acc, c) => acc + parseFloat(c.monto_final), 0);
            const alias = `transfam-${padreFamiliaId}-${Date.now()}`;
            const glosa = truncarGlosa(`Transp familiar ${cuotas.length} cuotas`);

            const fechaMasProxima = cuotas.reduce((min, c) => {
                const f = new Date(c.fecha_vencimiento);
                return f < min ? f : min;
            }, new Date(cuotas[0].fecha_vencimiento));

            const qrExpiracion = calcularExpiracionQR(fechaMasProxima);
            const callbackUrl = `${CALLBACK_URL}/api/sip/callback-transporte`;

            let qrData;
            try {
                qrData = await generarQR({
                    alias,
                    monto: montoTotal,
                    moneda: 'BOB',
                    glosa,
                    fechaVencimiento: formatearFechaSIP(qrExpiracion),
                    callbackUrl,
                });
            } catch (sipError) {
                await client.query('ROLLBACK');
                console.error('[GenerarQRFamiliarTransporte] Error de SIP:', sipError.message);
                return res.status(502).json({ success: false, message: 'No se pudo generar el QR. Intentá más tarde.', detalle: sipError.message });
            }

            for (const cuota of cuotas) {
                await client.query(
                    `UPDATE pago_transporte
           SET qr_data = $1, qr_image_url = $2, qr_expiracion = $3,
               transaccion_id = $4, qr_estado = 'generado',
               observaciones = COALESCE(observaciones, '') || $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $6`,
                    [
                        alias, qrData.imagenQr, qrExpiracion, qrData.idQr,
                        ` | QR familiar: ${cuota.nombres} ${cuota.mes_correspondiente} | IdQr SIP: ${qrData.idQr}`,
                        cuota.id,
                    ]
                );
            }

            await client.query('COMMIT');

            const resumenPorHijo = cuotas.reduce((acc, c) => {
                const key = c.estudiante_id;
                if (!acc[key]) acc[key] = { nombres: c.nombres, apellidos: c.apellidos, meses: [], monto: 0 };
                acc[key].meses.push(c.mes_correspondiente);
                acc[key].monto += parseFloat(c.monto_final);
                return acc;
            }, {});

            return res.status(201).json({
                success: true,
                message: `QR familiar generado para ${cuotas.length} cuota(s) de transporte`,
                data: {
                    imagenQr: qrData.imagenQr,
                    alias,
                    monto_total: montoTotal,
                    hijos: Object.values(resumenPorHijo),
                    qr_expiracion: qrExpiracion,
                    pago_ids,
                },
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al generar QR familiar de transporte:', error);
            return res.status(500).json({ success: false, message: 'Error: ' + error.message });
        } finally {
            client.release();
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 7. GET /api/padre/transporte/cuotas/estado-qr-multiple?alias=transfam-123-456
    // ══════════════════════════════════════════════════════════════════════
    static async verificarEstadoQRMultiple(req, res) {
        try {
            const { alias } = req.query;

            if (!alias) {
                return res.status(400).json({ success: false, message: 'El alias es requerido' });
            }

            const resultPagos = await pool.query(
                `SELECT
           pt.id AS pago_id,
           pt.qr_estado,
           pt.qr_expiracion,
           pt.monto_final,
           pt.estado,
           pt.mes_correspondiente
         FROM pago_transporte pt
         WHERE pt.qr_data = $1
           AND pt.anulado = false
         ORDER BY pt.id ASC`,
                [alias]
            );

            if (resultPagos.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'No se encontró ningún QR con ese alias' });
            }

            const pagos = resultPagos.rows;
            const cuotas = pagos.map(p => ({
                pago_id: p.pago_id,
                mes: p.mes_correspondiente,
                monto: p.monto_final,
                estado: p.estado,
            }));

            const todosPagados = pagos.every(p => p.qr_estado === 'pagado' || p.estado === 'pagado');

            if (todosPagados) {
                return res.json({
                    success: true,
                    estado: 'PAGADO',
                    message: `¡${pagos.length} cuota(s) de transporte pagadas! Tu cuenta está al día.`,
                    cuotas,
                });
            }

            const qr_expiracion = pagos[0].qr_expiracion;

            if (new Date(qr_expiracion) < new Date()) {
                return res.json({
                    success: true,
                    estado: 'EXPIRADO',
                    qr_expiracion,
                    message: 'El QR expiró. Cancelalo y generá uno nuevo.',
                    cuotas,
                });
            }

            return res.json({
                success: true,
                estado: 'PENDIENTE',
                qr_expiracion,
                message: 'Pago pendiente. Escaneá el QR con la app de tu banco.',
                cuotas,
            });
        } catch (error) {
            console.error('Error al verificar estado QR múltiple de transporte:', error);
            return res.status(500).json({ success: false, message: 'Error: ' + error.message });
        }
    }
}

export default PadreFamiliaTransportePayController;