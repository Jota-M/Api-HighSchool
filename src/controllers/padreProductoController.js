// controllers/padreProductoController.js
// El padre puede: ver el catálogo, armar un pedido para un hijo, pagarlo por QR
// y verificar el estado del pago. Calca el flujo de padreFamiliaPayController.js

import { pool } from '../db/pool.js';
import { Producto, PedidoProducto, PagoProducto } from '../models/Producto.js';
import { crearPedidoConReservaStock, PedidoProductoError } from '../services/pedidoProductoService.js';
import { generarQR, formatearFechaSIP, truncarGlosa } from '../services/sipService.js';

const CALLBACK_URL = process.env.CALLBACK_URL || 'https://api-highschool-5ujz.onrender.com';

function generarAliasProducto(pedidoId) {
    const ts = Date.now();
    return `prod-${pedidoId}-${ts}`;
}

function calcularExpiracionQR(fechaLimitePago) {
    const ahora = new Date();
    const limite = fechaLimitePago ? new Date(fechaLimitePago) : null;
    return limite && limite > ahora ? limite : new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
}

// Resuelve el padre_familia_id a partir del usuario logueado
async function obtenerPadreFamiliaId(usuario_id) {
    const result = await pool.query(
        `SELECT id FROM padre_familia WHERE usuario_id = $1 AND deleted_at IS NULL`,
        [usuario_id]
    );
    return result.rows[0]?.id ?? null;
}

// Verifica que el estudiante sea hijo del padre logueado y devuelve su matrícula activa
async function verificarAccesoEstudiante(estudiante_id, padre_familia_id) {
    const result = await pool.query(
        `SELECT mat.id AS matricula_id, mat.periodo_academico_id
     FROM estudiante_tutor et
     INNER JOIN matricula mat ON et.estudiante_id = mat.estudiante_id
     WHERE et.estudiante_id = $1
       AND et.padre_familia_id = $2
       AND mat.estado = 'activo'
       AND mat.deleted_at IS NULL
     ORDER BY mat.created_at DESC
     LIMIT 1`,
        [estudiante_id, padre_familia_id]
    );
    return result.rows[0] || null;
}

class PadreProductoController {
    // ══════════════════════════════════════════════════════════════════════
    // 0. GET /padre-p/productos/mis-hijos
    // Lista de hijos del padre logueado, con resumen de pedidos de productos
    // (mismo criterio que PadreFamiliaPayController.obtenerHijos, pero
    // contando pedido_producto en lugar de mensualidad)
    // ══════════════════════════════════════════════════════════════════════
    static async obtenerHijos(req, res) {
        try {
            const resultPadre = await pool.query(
                `SELECT id FROM padre_familia WHERE usuario_id = $1 AND deleted_at IS NULL`,
                [req.user.id]
            );

            if (resultPadre.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'No se encontró perfil de padre de familia para este usuario' });
            }

            const padre_familia_id = resultPadre.rows[0].id;

            const result = await pool.query(
                `SELECT
           e.id                  AS estudiante_id,
           e.codigo              AS estudiante_codigo,
           e.nombres,
           e.apellidos,
           e.foto_url,
           et.es_tutor_principal,
           mat.id                AS matricula_id,
           mat.estado            AS matricula_estado,
           g.nombre              AS grado,
           p.nombre              AS paralelo,
           n.nombre              AS nivel,
           COUNT(pp.id)                                                    AS total_pedidos,
           COUNT(CASE WHEN pp.estado = 'pendiente_pago' THEN 1 END)        AS pedidos_pendientes,
           COUNT(CASE WHEN pp.estado = 'pagado' THEN 1 END)                AS pedidos_pagados,
           COALESCE(SUM(CASE WHEN pp.estado = 'pendiente_pago' THEN pp.monto_total END), 0) AS monto_pendiente
         FROM estudiante_tutor et
         INNER JOIN estudiante e       ON et.estudiante_id     = e.id
         LEFT  JOIN matricula mat      ON e.id                 = mat.estudiante_id
                                      AND mat.estado           = 'activo'
                                      AND mat.deleted_at       IS NULL
                                      AND mat.periodo_academico_id = (
                                        SELECT id FROM periodo_academico
                                        WHERE activo = true AND deleted_at IS NULL
                                        ORDER BY fecha_inicio DESC
                                        LIMIT 1
                                      )
         LEFT  JOIN paralelo p         ON mat.paralelo_id      = p.id
         LEFT  JOIN grado g            ON p.grado_id           = g.id
         LEFT  JOIN nivel_academico n  ON g.nivel_academico_id = n.id
         LEFT  JOIN pedido_producto pp ON mat.id                = pp.matricula_id AND pp.deleted_at IS NULL
         WHERE et.padre_familia_id = $1
           AND e.activo            = true
           AND e.deleted_at        IS NULL
         GROUP BY
           e.id, e.codigo, e.nombres, e.apellidos, e.foto_url,
           et.es_tutor_principal, mat.id, mat.estado, g.nombre, p.nombre, n.nombre
         ORDER BY et.es_tutor_principal DESC, e.apellidos ASC`,
                [padre_familia_id]
            );

            res.json({ success: true, data: { hijos: result.rows, total: result.rows.length } });
        } catch (error) {
            console.error('Error al obtener hijos:', error);
            res.status(500).json({ success: false, message: 'Error al obtener hijos: ' + error.message });
        }
    }


    static async listarCatalogo(req, res) {
        try {
            const { categoria, nivel_academico_id } = req.query;
            const productos = await Producto.findAll({
                categoria,
                nivel_academico_id: nivel_academico_id ? parseInt(nivel_academico_id) : undefined,
            });

            res.json({ success: true, data: { productos, total: productos.length } });
        } catch (error) {
            console.error('Error al listar catálogo:', error);
            res.status(500).json({ success: false, message: 'Error al listar catálogo: ' + error.message });
        }
    }

    // GET /padre-p/productos/:id
    static async obtenerProducto(req, res) {
        try {
            const producto = await Producto.findByIdConVariantes(req.params.id);
            if (!producto) {
                return res.status(404).json({ success: false, message: 'Producto no encontrado' });
            }
            res.json({ success: true, data: { producto } });
        } catch (error) {
            console.error('Error al obtener producto:', error);
            res.status(500).json({ success: false, message: 'Error al obtener producto: ' + error.message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 2. GET /padre-p/hijos/:estudiante_id/pedidos-producto
    // ══════════════════════════════════════════════════════════════════════
    static async obtenerPedidosHijo(req, res) {
        try {
            const { estudiante_id } = req.params;
            const { estado } = req.query;

            const padre_familia_id = await obtenerPadreFamiliaId(req.user.id);
            if (!padre_familia_id) {
                return res.status(404).json({ success: false, message: 'No se encontró perfil de padre de familia para este usuario' });
            }

            const acceso = await verificarAccesoEstudiante(estudiante_id, padre_familia_id);
            if (!acceso) {
                return res.status(403).json({ success: false, message: 'No tenés acceso a este estudiante' });
            }

            const pedidos = await PedidoProducto.findByEstudiante(estudiante_id, { estado });
            res.json({ success: true, data: { pedidos, total: pedidos.length } });
        } catch (error) {
            console.error('Error al obtener pedidos:', error);
            res.status(500).json({ success: false, message: 'Error al obtener pedidos: ' + error.message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 3. POST /padre-p/hijos/:estudiante_id/pedidos-producto
    // body: { items: [{ producto_variante_id, cantidad }] }
    // ══════════════════════════════════════════════════════════════════════
    static async crearPedido(req, res) {
        try {
            const { estudiante_id } = req.params;
            const { items } = req.body;

            const padre_familia_id = await obtenerPadreFamiliaId(req.user.id);
            if (!padre_familia_id) {
                return res.status(404).json({ success: false, message: 'No se encontró perfil de padre de familia para este usuario' });
            }

            const acceso = await verificarAccesoEstudiante(estudiante_id, padre_familia_id);
            if (!acceso) {
                return res.status(403).json({ success: false, message: 'No tenés acceso a este estudiante' });
            }

            const pedido = await crearPedidoConReservaStock({
                matricula_id: acceso.matricula_id,
                padre_familia_id,
                periodo_academico_id: acceso.periodo_academico_id,
                items,
            });

            res.status(201).json({ success: true, message: 'Pedido creado exitosamente', data: { pedido } });
        } catch (error) {
            if (error instanceof PedidoProductoError) {
                return res.status(error.statusCode).json({ success: false, message: error.message });
            }
            console.error('Error al crear pedido:', error);
            res.status(500).json({ success: false, message: 'Error al crear pedido: ' + error.message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // POST /padre-p/pedidos-producto
    // Pedido libre: el hijo es OPCIONAL.
    // body: { items: [{ producto_variante_id, cantidad }], estudiante_id? }
    // Si se pasa estudiante_id, se busca su matrícula activa para registrarla.
    // Si no, el pedido queda como "compra general" (matricula_id = null).
    // ══════════════════════════════════════════════════════════════════════
    static async crearPedidoLibre(req, res) {
        try {
            const { items, estudiante_id } = req.body;

            const padre_familia_id = await obtenerPadreFamiliaId(req.user.id);
            if (!padre_familia_id) {
                return res.status(404).json({ success: false, message: 'No se encontró perfil de padre de familia' });
            }

            let matricula_id = null;
            let periodo_academico_id = null;

            // Si se indicó un estudiante, verificamos acceso y tomamos su matrícula
            if (estudiante_id) {
                const acceso = await verificarAccesoEstudiante(estudiante_id, padre_familia_id);
                if (!acceso) {
                    return res.status(403).json({ success: false, message: 'No tenés acceso a ese estudiante' });
                }
                matricula_id = acceso.matricula_id;
                periodo_academico_id = acceso.periodo_academico_id;
            }

            const pedido = await crearPedidoConReservaStock({
                matricula_id,
                padre_familia_id,
                periodo_academico_id,
                items,
            });

            res.status(201).json({ success: true, message: 'Pedido creado exitosamente', data: { pedido } });
        } catch (error) {
            if (error instanceof PedidoProductoError) {
                return res.status(error.statusCode).json({ success: false, message: error.message });
            }
            console.error('Error al crear pedido libre:', error);
            res.status(500).json({ success: false, message: 'Error al crear pedido: ' + error.message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // GET /padre-p/pedidos-producto
    // Todos los pedidos del padre logueado (con y sin estudiante)
    // ══════════════════════════════════════════════════════════════════════
    static async obtenerMisPedidos(req, res) {
        try {
            const { estado } = req.query;
            const padre_familia_id = await obtenerPadreFamiliaId(req.user.id);
            if (!padre_familia_id) {
                return res.status(404).json({ success: false, message: 'No se encontró perfil de padre de familia' });
            }

            const pedidos = await PedidoProducto.findByPadre(padre_familia_id, { estado });
            res.json({ success: true, data: { pedidos, total: pedidos.length } });
        } catch (error) {
            console.error('Error al obtener pedidos:', error);
            res.status(500).json({ success: false, message: 'Error al obtener pedidos: ' + error.message });
        }
    }

    // GET /padre-p/pedido-producto/:id
    static async obtenerPedido(req, res) {
        try {
            const { id } = req.params;
            const padre_familia_id = await obtenerPadreFamiliaId(req.user.id);

            const pedido = await PedidoProducto.findByIdConDetalle(id);
            if (!pedido || pedido.padre_familia_id !== padre_familia_id) {
                return res.status(403).json({ success: false, message: 'No tenés acceso a este pedido' });
            }

            res.json({ success: true, data: { pedido } });
        } catch (error) {
            console.error('Error al obtener pedido:', error);
            res.status(500).json({ success: false, message: 'Error al obtener pedido: ' + error.message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. POST /padre-p/pedido-producto/:id/generar-qr
    // ══════════════════════════════════════════════════════════════════════
    static async generarQRPago(req, res) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { id: pedido_producto_id } = req.params;

            const resultVerif = await client.query(
                `SELECT pp.id, pp.estado, pp.monto_total, pp.codigo_pedido, pp.fecha_limite_pago,
                e.nombres, e.apellidos
         FROM pedido_producto pp
         LEFT  JOIN matricula mat ON pp.matricula_id = mat.id
         LEFT  JOIN estudiante e  ON mat.estudiante_id = e.id
         INNER JOIN padre_familia pf ON pp.padre_familia_id = pf.id
         WHERE pp.id = $1 AND pf.usuario_id = $2 AND pp.deleted_at IS NULL`,
                [pedido_producto_id, req.user.id]
            );

            if (resultVerif.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, message: 'No tenés acceso a este pedido' });
            }

            const pedido = resultVerif.rows[0];

            if (pedido.estado === 'pagado' || pedido.estado === 'entregado') {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Este pedido ya está pagado' });
            }
            if (pedido.estado !== 'pendiente_pago') {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: `El pedido está en estado '${pedido.estado}'` });
            }

            // Reusar QR activo si ya existe uno vigente
            const qrExistente = await PagoProducto.findQrActivoPorPedido(pedido_producto_id, client);
            if (qrExistente) {
                await client.query('ROLLBACK');
                return res.json({
                    success: true,
                    qr_existente: true,
                    message: 'Ya existe un QR activo para este pedido',
                    data: {
                        imagenQr: qrExistente.qr_image_url,
                        alias: qrExistente.qr_data,
                        qr_expiracion: qrExistente.qr_expiracion,
                        monto: qrExistente.monto_pagado,
                        estudiante: pedido.nombres ? `${pedido.nombres} ${pedido.apellidos}` : null,
                    },
                });
            }

            const alias = generarAliasProducto(pedido_producto_id);
            const qrExpiracion = calcularExpiracionQR(pedido.fecha_limite_pago);
            const fechaVencimiento = formatearFechaSIP(qrExpiracion);
            const glosa = truncarGlosa(`Prod ${pedido.codigo_pedido}${pedido.apellidos ? ' ' + pedido.apellidos : ''}`);
            const callbackUrl = `${CALLBACK_URL}/api/sip/callback-productos`;

            let qrData;
            try {
                qrData = await generarQR({
                    alias,
                    monto: parseFloat(pedido.monto_total),
                    moneda: 'BOB',
                    glosa,
                    fechaVencimiento,
                    callbackUrl,
                });
            } catch (sipError) {
                await client.query('ROLLBACK');
                console.error('[GenerarQR-Producto] Error de SIP:', sipError.message);
                return res.status(502).json({
                    success: false,
                    message: 'No se pudo generar el QR en este momento. Intentá más tarde.',
                    detalle: sipError.message,
                });
            }

            await PagoProducto.createQrGenerado(
                {
                    pedido_producto_id,
                    monto_pagado: parseFloat(pedido.monto_total),
                    qr_data: alias,
                    qr_image_url: qrData.imagenQr,
                    qr_expiracion: qrExpiracion,
                    transaccion_id: qrData.idQr,
                    registrado_por: req.user.id,
                },
                client
            );

            await client.query('COMMIT');

            console.log(`[GenerarQR-Producto] ✅ QR generado. Pedido: ${pedido_producto_id} | Alias: ${alias}`);

            return res.status(201).json({
                success: true,
                message: 'QR generado exitosamente',
                data: {
                    imagenQr: qrData.imagenQr,
                    alias,
                    monto: pedido.monto_total,
                    estudiante: pedido.nombres ? `${pedido.nombres} ${pedido.apellidos}` : null,
                    bancoDestino: qrData.bancoDestino,
                    cuentaDestino: qrData.cuentaDestino,
                    qr_expiracion: qrExpiracion,
                    fechaVencimiento: qrData.fechaVencimiento,
                },
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al generar QR:', error);
            return res.status(500).json({ success: false, message: 'Error al generar el QR: ' + error.message });
        } finally {
            client.release();
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // 5. GET /padre-p/pedido-producto/:id/estado-qr (polling, solo lectura)
    // ══════════════════════════════════════════════════════════════════════
    static async verificarEstadoQR(req, res) {
        try {
            const { id: pedido_producto_id } = req.params;

            const resultVerif = await pool.query(
                `SELECT pp.id, pp.estado
         FROM pedido_producto pp
         INNER JOIN padre_familia pf ON pp.padre_familia_id = pf.id
         WHERE pp.id = $1 AND pf.usuario_id = $2 AND pp.deleted_at IS NULL`,
                [pedido_producto_id, req.user.id]
            );

            if (resultVerif.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'No tenés acceso a este pedido' });
            }

            if (resultVerif.rows[0].estado === 'pagado' || resultVerif.rows[0].estado === 'entregado') {
                return res.json({ success: true, estado: 'PAGADO', message: '¡Pago confirmado!' });
            }

            const resultPago = await pool.query(
                `SELECT qr_estado, qr_expiracion
         FROM pago_producto
         WHERE pedido_producto_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
                [pedido_producto_id]
            );

            if (resultPago.rows.length === 0) {
                return res.json({ success: true, estado: 'SIN_QR', message: 'No hay QR generado para este pedido' });
            }

            const pago = resultPago.rows[0];
            const estado = pago.qr_estado === 'pagado' ? 'PAGADO' : pago.qr_estado === 'expirado' ? 'INHABILITADO' : 'PENDIENTE';

            res.json({ success: true, estado, qr_expiracion: pago.qr_expiracion, message: 'OK' });
        } catch (error) {
            console.error('Error al verificar estado QR:', error);
            res.status(500).json({ success: false, message: 'Error al verificar estado del QR: ' + error.message });
        }
    }
}

export default PadreProductoController;