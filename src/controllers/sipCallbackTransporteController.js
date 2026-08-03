// controllers/sipCallbackTransporteController.js
// Webhook que recibe la confirmación de pago desde el banco Bisa - SIP
// Versión para transporte: maneja QR de pago único y QR familiar (mismo alias, varias cuotas)

import { pool } from '../db/pool.js';
import { validarCallbackAuth } from '../services/sipService.js';

function normalizarMonto(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Number(numero.toFixed(2)) : null;
}

class SipCallbackTransporteController {

    /**
     * POST /api/sip/callback-transporte
     *
     * CASO 1 — QR único (alias: "trans-{pago_id}-{timestamp}")
     *   Un solo pago_transporte con ese alias → una sola cuota se paga
     *
     * CASO 2 — QR familiar (alias: "transfam-{padre_familia_id}-{timestamp}")
     *   Varios pago_transporte con ese mismo alias → todas se pagan de una vez
     */
    static async confirmarPago(req, res) {

        // ── 1. VALIDAR QUE VIENE DE SIP ──────────────────────────────────────
        const authHeader = req.headers['authorization'];
        if (!validarCallbackAuth(authHeader)) {
            console.warn('[SIP Callback Transporte] Request rechazado: credenciales inválidas');
            return res.status(401).json({
                codigo: '9999',
                mensaje: 'No autorizado',
            });
        }

        // ── 2. LEER DATOS DEL BODY ────────────────────────────────────────────
        const {
            alias,
            numeroOrdenOriginante,
            monto,
            idQr,
            moneda,
            cuentaCliente,
            nombreCliente,
            documentoCliente,
        } = req.body;

        if (!alias) {
            console.error('[SIP Callback Transporte] Body sin alias:', req.body);
            return res.status(400).json({
                codigo: '9999',
                mensaje: 'Alias requerido',
            });
        }

        console.log(`[SIP Callback Transporte] Pago recibido. Alias: ${alias} | Monto: ${monto} ${moneda}`);

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // ── 3. BUSCAR TODOS LOS PAGOS CON ESE ALIAS ──────────────────────
            const resultPagos = await client.query(
                `SELECT pt.id, pt.qr_estado, pt.monto_final, pt.estado AS pago_estado,
                pt.transaccion_id AS id_qr_guardado
         FROM pago_transporte pt
         WHERE pt.qr_data = $1
           AND pt.anulado = false
         ORDER BY pt.id ASC`,
                [alias]
            );

            if (resultPagos.rows.length === 0) {
                console.error(`[SIP Callback Transporte] No se encontraron pagos con alias: ${alias}`);
                await client.query('ROLLBACK');
                // Respondemos 0000 para que SIP no mande alertas — el dinero entró igual
                return res.json({
                    codigo: '0000',
                    mensaje: 'Recibido - alias no encontrado en sistema',
                });
            }

            const pagos = resultPagos.rows;
            const esPagoMultiple = pagos.length > 1;

            console.log(
                `[SIP Callback Transporte] ${esPagoMultiple ? 'Pago FAMILIAR' : 'Pago único'} — ` +
                `${pagos.length} cuota(s) | Alias: ${alias}`
            );

            // ── 4. VALIDAR QUE EL CALLBACK COINCIDE CON EL QR GENERADO ─────────
            const idQrEsperado = pagos[0].id_qr_guardado;
            const idsQrConsistentes = pagos.every(p => p.id_qr_guardado === idQrEsperado);
            const montoEsperado = normalizarMonto(
                pagos.reduce((total, p) => total + Number(p.monto_final || 0), 0)
            );
            const montoRecibido = normalizarMonto(monto);
            const monedaRecibida = typeof moneda === 'string' ? moneda.toUpperCase() : null;

            if (!idsQrConsistentes || !idQr || idQr !== idQrEsperado) {
                console.warn(
                    `[SIP Callback Transporte] idQr inválido. Alias: ${alias} | ` +
                    `Esperado: ${idQrEsperado || 'N/D'} | Recibido: ${idQr || 'N/D'}`
                );
                await client.query('ROLLBACK');
                return res.json({
                    codigo: '0000',
                    mensaje: 'Recibido - idQr no coincide, pago no procesado',
                });
            }

            if (montoRecibido === null || montoEsperado === null || Math.abs(montoRecibido - montoEsperado) > 0.01) {
                console.warn(
                    `[SIP Callback Transporte] Monto inválido. Alias: ${alias} | ` +
                    `Esperado: ${montoEsperado} | Recibido: ${monto}`
                );
                await client.query('ROLLBACK');
                return res.json({
                    codigo: '0000',
                    mensaje: 'Recibido - monto no coincide, pago no procesado',
                });
            }

            if (monedaRecibida && monedaRecibida !== 'BOB') {
                console.warn(`[SIP Callback Transporte] Moneda inválida. Alias: ${alias} | Moneda: ${moneda}`);
                await client.query('ROLLBACK');
                return res.json({
                    codigo: '0000',
                    mensaje: 'Recibido - moneda no coincide, pago no procesado',
                });
            }

            // ── 5. VERIFICAR QUE NO ESTÉN YA PROCESADOS ──────────────────────
            const yaProcesados = pagos.every(
                p => p.qr_estado === 'pagado' || p.pago_estado === 'pagado'
            );

            if (yaProcesados) {
                console.warn(`[SIP Callback Transporte] Todos los pagos ya procesados para alias: ${alias}`);
                await client.query('ROLLBACK');
                return res.json({
                    codigo: '0000',
                    mensaje: 'Pagos ya procesados anteriormente',
                });
            }

            // ── 6. PROCESAR CADA PAGO ─────────────────────────────────────────
            // Nota: pago_transporte es tabla única (no separada como mensualidad/pago_mensualidad),
            // así que acá actualizamos qr_estado Y estado en la misma fila.
            // Este UPDATE dispara automáticamente el trigger auto_centralizar_pago_transporte
            // (ya existente) que registra el ingreso en la tabla centralizada.
            const observacionPagador = ` | Pagador: ${nombreCliente || 'N/D'} CI:${documentoCliente || 'N/D'} Cuenta:${cuentaCliente || 'N/D'}`;

            for (const pago of pagos) {
                if (pago.qr_estado === 'pagado' || pago.pago_estado === 'pagado') {
                    console.log(`[SIP Callback Transporte] Pago ${pago.id} ya estaba pagado, saltando...`);
                    continue;
                }

                await client.query(
                    `UPDATE pago_transporte
           SET qr_estado         = 'pagado',
               estado            = 'pagado',
               monto_pagado      = monto_final,
               metodo_pago       = 'qr',
               fecha_pago        = CURRENT_TIMESTAMP,
               numero_referencia = $1,
               banco_origen      = $2,
               observaciones     = COALESCE(observaciones, '') || $3,
               updated_at        = CURRENT_TIMESTAMP
           WHERE id = $4`,
                    [
                        numeroOrdenOriginante || null,
                        nombreCliente || null,
                        observacionPagador,
                        pago.id,
                    ]
                );

                console.log(`[SIP Callback Transporte] ✅ Pago ${pago.id} marcado como PAGADO`);
            }

            await client.query('COMMIT');

            console.log(
                `[SIP Callback Transporte] ✅ ${pagos.length} cuota(s) procesada(s). ` +
                `Cliente: ${nombreCliente || 'N/D'} | Monto total: ${monto} ${moneda}`
            );

            // ── 7. RESPONDER 0000 A SIP ───────────────────────────────────────
            return res.json({
                codigo: '0000',
                mensaje: 'Pago confirmado exitosamente',
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[SIP Callback Transporte] Error al procesar pago:', error.message);

            return res.status(500).json({
                codigo: '9999',
                mensaje: 'Error interno al procesar el pago',
            });

        } finally {
            client.release();
        }
    }
}

export default SipCallbackTransporteController;