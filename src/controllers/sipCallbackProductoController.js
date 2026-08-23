// controllers/sipCallbackProductoController.js
// Webhook que recibe la confirmación de pago desde el banco Bisa - SIP
// para pedidos de productos (uniformes/deportivos). Calca sipCallbackController.js.

import { pool } from '../db/pool.js';
import { validarCallbackAuth } from '../services/sipService.js';
import { confirmarVentaYDescontarStock } from '../services/pedidoProductoService.js';
import { PedidoProducto } from '../models/Producto.js';

function normalizarMonto(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Number(numero.toFixed(2)) : null;
}

class SipCallbackProductoController {
    /**
     * POST /api/sip/callback-productos
     * Alias esperado: "prod-{pedido_producto_id}-{timestamp}"
     */
    static async confirmarPago(req, res) {
        const authHeader = req.headers['authorization'];
        if (!validarCallbackAuth(authHeader)) {
            console.warn('[SIP Callback Productos] Request rechazado: credenciales inválidas');
            return res.status(401).json({ codigo: '9999', mensaje: 'No autorizado' });
        }

        const { alias, numeroOrdenOriginante, monto, idQr, moneda, cuentaCliente, nombreCliente, documentoCliente } = req.body;

        if (!alias) {
            console.error('[SIP Callback Productos] Body sin alias:', req.body);
            return res.status(400).json({ codigo: '9999', mensaje: 'Alias requerido' });
        }

        console.log(`[SIP Callback Productos] Pago recibido. Alias: ${alias} | Monto: ${monto} ${moneda}`);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resultPago = await client.query(
                `SELECT pp.id, pp.pedido_producto_id, pp.qr_estado, pp.monto_pagado,
                pp.transaccion_id AS id_qr_guardado,
                ped.estado AS pedido_estado, ped.monto_total
         FROM pago_producto pp
         INNER JOIN pedido_producto ped ON pp.pedido_producto_id = ped.id
         WHERE pp.qr_data = $1 AND pp.anulado = false
         LIMIT 1`,
                [alias]
            );

            if (resultPago.rows.length === 0) {
                console.error(`[SIP Callback Productos] No se encontró pago con alias: ${alias}`);
                await client.query('ROLLBACK');
                return res.json({ codigo: '0000', mensaje: 'Recibido - alias no encontrado en sistema' });
            }

            const pago = resultPago.rows[0];

            // ── Validar que el callback coincide con el QR generado ──
            const idQrEsperado = pago.id_qr_guardado;
            const montoEsperado = normalizarMonto(pago.monto_pagado || pago.monto_total);
            const montoRecibido = normalizarMonto(monto);
            const monedaRecibida = typeof moneda === 'string' ? moneda.toUpperCase() : null;

            if (!idQr || idQr !== idQrEsperado) {
                console.warn(
                    `[SIP Callback Productos] Callback NO procesado por idQr inválido. ` +
                    `Alias: ${alias} | Esperado: ${idQrEsperado || 'N/D'} | Recibido: ${idQr || 'N/D'}`
                );
                await client.query('ROLLBACK');
                return res.json({ codigo: '0000', mensaje: 'Recibido - idQr no coincide, pago no procesado' });
            }

            if (montoRecibido === null || montoEsperado === null || Math.abs(montoRecibido - montoEsperado) > 0.01) {
                console.warn(`[SIP Callback Productos] Callback NO procesado por monto inválido. Alias: ${alias}`);
                await client.query('ROLLBACK');
                return res.json({ codigo: '0000', mensaje: 'Recibido - monto no coincide, pago no procesado' });
            }

            if (monedaRecibida && monedaRecibida !== 'BOB') {
                console.warn(`[SIP Callback Productos] Callback NO procesado por moneda inválida. Alias: ${alias}`);
                await client.query('ROLLBACK');
                return res.json({ codigo: '0000', mensaje: 'Recibido - moneda no coincide, pago no procesado' });
            }

            // ── Ya procesado (callback duplicado) ──
            if (pago.qr_estado === 'pagado' || pago.pedido_estado === 'pagado' || pago.pedido_estado === 'entregado') {
                console.warn(`[SIP Callback Productos] Pago ya procesado para alias: ${alias}`);
                await client.query('ROLLBACK');
                return res.json({ codigo: '0000', mensaje: 'Pago ya procesado anteriormente' });
            }

            // ── Confirmar pago (dispara el trigger de centralización a `ingreso`) ──
            const observacionPagador = ` | Pagador: ${nombreCliente || 'N/D'} CI:${documentoCliente || 'N/D'} Cuenta:${cuentaCliente || 'N/D'}`;
            await client.query(
                `UPDATE pago_producto
         SET qr_estado = 'pagado',
             transaccion_id = $1,
             numero_referencia = $2,
             banco_origen = $3,
             observaciones = COALESCE(observaciones, '') || $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
                [idQr || null, numeroOrdenOriginante || null, nombreCliente || null, observacionPagador, pago.id]
            );

            await confirmarVentaYDescontarStock(pago.pedido_producto_id, client);
            await PedidoProducto.updateEstado(pago.pedido_producto_id, 'pagado', client);

            await client.query('COMMIT');

            console.log(`[SIP Callback Productos] ✅ Pedido ${pago.pedido_producto_id} marcado como PAGADO`);

            return res.json({ codigo: '0000', mensaje: 'Pago confirmado exitosamente' });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[SIP Callback Productos] Error al procesar pago:', error.message);
            return res.status(500).json({ codigo: '9999', mensaje: 'Error interno al procesar el pago' });
        } finally {
            client.release();
        }
    }
}

export default SipCallbackProductoController;