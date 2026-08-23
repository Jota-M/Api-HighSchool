// controllers/pedidoProductoController.js
// Administración de pedidos de productos: consulta, pago presencial y entrega

import { pool } from '../db/pool.js';
import { PedidoProducto, PagoProducto } from '../models/Producto.js';
import { PedidoProductoError, confirmarVentaYDescontarStock } from '../services/pedidoProductoService.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class PedidoProductoController {
    // GET /api/pedido-producto/:id
    static async obtenerPorId(req, res) {
        try {
            const { id } = req.params;
            const pedido = await PedidoProducto.findByIdConDetalle(id);

            if (!pedido) {
                return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
            }

            res.json({ success: true, data: { pedido } });
        } catch (error) {
            console.error('Error al obtener pedido:', error);
            res.status(500).json({ success: false, message: 'Error al obtener pedido: ' + error.message });
        }
    }

    // GET /api/estudiante/:estudiante_id/pedidos-producto
    static async listarPorEstudiante(req, res) {
        try {
            const { estudiante_id } = req.params;
            const { estado } = req.query;
            const pedidos = await PedidoProducto.findByEstudiante(estudiante_id, { estado });

            res.json({ success: true, data: { pedidos, total: pedidos.length } });
        } catch (error) {
            console.error('Error al listar pedidos:', error);
            res.status(500).json({ success: false, message: 'Error al listar pedidos: ' + error.message });
        }
    }

    // POST /api/pedido-producto/:id/pago-directo
    // Pago presencial (efectivo/transferencia/tarjeta) registrado por administración
    static async registrarPagoDirecto(req, res) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { id } = req.params;
            const { monto_pagado, metodo_pago, numero_comprobante, comprobante_url, observaciones } = req.body;

            const pedido = await PedidoProducto.findById(id, client, { forUpdate: true });
            if (!pedido) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
            }
            if (pedido.estado !== 'pendiente_pago') {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: `El pedido está en estado '${pedido.estado}', no se puede pagar` });
            }
            if (parseFloat(monto_pagado) < parseFloat(pedido.monto_total)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'El monto pagado es menor al total del pedido' });
            }

            const pago = await PagoProducto.createDirecto(
                {
                    pedido_producto_id: id,
                    monto_pagado,
                    metodo_pago,
                    numero_comprobante,
                    comprobante_url,
                    registrado_por: req.user.id,
                    observaciones,
                },
                client
            );
            // La centralización a `ingreso` corre sola vía el trigger auto_centralizar_pago_producto

            await confirmarVentaYDescontarStock(id, client);
            await PedidoProducto.updateEstado(id, 'pagado', client);

            const reqInfo = RequestInfo.extract(req);
            await ActividadLog.create({
                usuario_id: req.user.id,
                accion: 'crear',
                modulo: 'pago_producto',
                tabla_afectada: 'pago_producto',
                registro_id: pago.id,
                datos_nuevos: pago,
                ip_address: reqInfo.ip,
                user_agent: reqInfo.userAgent,
                resultado: 'exitoso',
                mensaje: `Pago de productos registrado: ${pago.codigo_pago} - ${pago.monto_pagado} Bs (pedido ${pedido.codigo_pedido})`,
            });

            await client.query('COMMIT');
            res.status(201).json({ success: true, message: 'Pago registrado exitosamente', data: { pago } });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al registrar pago:', error);
            res.status(500).json({ success: false, message: 'Error al registrar pago: ' + error.message });
        } finally {
            client.release();
        }
    }

    // PATCH /api/pedido-producto/:id/entregar
    static async marcarEntregado(req, res) {
        try {
            const { id } = req.params;
            const pedido = await PedidoProducto.marcarEntregado(id, req.user.id);

            if (!pedido) {
                return res.status(409).json({ success: false, message: 'El pedido no existe o no está en estado "pagado"' });
            }

            res.json({ success: true, message: 'Entrega registrada exitosamente', data: { pedido } });
        } catch (error) {
            if (error instanceof PedidoProductoError) {
                return res.status(error.statusCode).json({ success: false, message: error.message });
            }
            console.error('Error al marcar entrega:', error);
            res.status(500).json({ success: false, message: 'Error al marcar entrega: ' + error.message });
        }
    }
}

export default PedidoProductoController;