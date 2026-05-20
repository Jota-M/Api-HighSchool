// controllers/sipCallbackController.js
// Webhook que recibe la confirmación de pago desde el banco Bisa - SIP
// Maneja tanto QR de pago único como QR de pago múltiple (mismo alias, varias mensualidades)

import { pool } from '../db/pool.js';
import { validarCallbackAuth } from '../services/sipService.js';

function normalizarMonto(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Number(numero.toFixed(2)) : null;
}

class SipCallbackController {

  /**
   * POST /api/sip/callback
   *
   * SIP llama a esta ruta cuando un padre pagó exitosamente.
   * Soporta dos casos:
   *
   * CASO 1 — QR de pago único (alias: "mens-{id}-{timestamp}")
   *   Un solo pago_mensualidad con ese alias → una sola mensualidad se paga
   *
   * CASO 2 — QR de pago múltiple (alias: "multi-{matricula_id}-{timestamp}")
   *   Varios pago_mensualidad con ese mismo alias → todas se pagan de una vez
   */
  static async confirmarPago(req, res) {

    // ── 1. VALIDAR QUE VIENE DE SIP ──────────────────────────────────────
    const authHeader = req.headers['authorization'];

    if (!validarCallbackAuth(authHeader)) {
      console.warn('[SIP Callback] Request rechazado: credenciales inválidas');
      return res.status(401).json({
        codigo:  '9999',
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
      fechaproceso,
      cuentaCliente,
      nombreCliente,
      documentoCliente,
    } = req.body;

    if (!alias) {
      console.error('[SIP Callback] Body sin alias:', req.body);
      return res.status(400).json({
        codigo:  '9999',
        mensaje: 'Alias requerido',
      });
    }

    console.log(`[SIP Callback] Pago recibido. Alias: ${alias} | Monto: ${monto} ${moneda}`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // ── 3. BUSCAR TODOS LOS PAGOS CON ESE ALIAS ──────────────────────
      // Para pago único → 1 registro
      // Para pago múltiple → N registros (uno por mensualidad)
      const resultPagos = await client.query(
        `SELECT pm.id, pm.mensualidad_id, pm.qr_estado, pm.monto_pagado,
                pm.transaccion_id AS id_qr_guardado,
                m.estado AS mensualidad_estado, m.monto_final
         FROM pago_mensualidad pm
         INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
         WHERE pm.qr_data = $1
           AND pm.anulado = false
         ORDER BY pm.id ASC`,
        [alias]
      );

      if (resultPagos.rows.length === 0) {
        console.error(`[SIP Callback] No se encontraron pagos con alias: ${alias}`);
        await client.query('ROLLBACK');
        // Respondemos 0000 para que SIP no mande alertas — el dinero entró igual
        return res.json({
          codigo:  '0000',
          mensaje: 'Recibido - alias no encontrado en sistema',
        });
      }

      const pagos = resultPagos.rows;
      const esPagoMultiple = pagos.length > 1;

      console.log(
        `[SIP Callback] ${esPagoMultiple ? 'Pago MÚLTIPLE' : 'Pago único'} — ` +
        `${pagos.length} mensualidad(es) | Alias: ${alias}`
      );

      // ── 4. VALIDAR QUE EL CALLBACK COINCIDE CON EL QR GENERADO ─────────
      // No basta con alias + Basic Auth: en pruebas/SIP pueden llegar callbacks
      // prematuros o de verificación. Solo procesamos si idQr y monto coinciden.
      const idQrEsperado = pagos[0].id_qr_guardado;
      const idsQrConsistentes = pagos.every(p => p.id_qr_guardado === idQrEsperado);
      const montoEsperado = normalizarMonto(
        pagos.reduce((total, p) => total + Number(p.monto_pagado || p.monto_final || 0), 0)
      );
      const montoRecibido = normalizarMonto(monto);
      const monedaRecibida = typeof moneda === 'string' ? moneda.toUpperCase() : null;

      if (!idsQrConsistentes || !idQr || idQr !== idQrEsperado) {
        console.warn(
          `[SIP Callback] Callback recibido pero NO procesado por idQr inválido. ` +
          `Alias: ${alias} | Esperado: ${idQrEsperado || 'N/D'} | Recibido: ${idQr || 'N/D'}`
        );
        await client.query('ROLLBACK');
        return res.json({
          codigo:  '0000',
          mensaje: 'Recibido - idQr no coincide, pago no procesado',
        });
      }

      if (montoRecibido === null || montoEsperado === null || Math.abs(montoRecibido - montoEsperado) > 0.01) {
        console.warn(
          `[SIP Callback] Callback recibido pero NO procesado por monto inválido. ` +
          `Alias: ${alias} | Esperado: ${montoEsperado} | Recibido: ${monto}`
        );
        await client.query('ROLLBACK');
        return res.json({
          codigo:  '0000',
          mensaje: 'Recibido - monto no coincide, pago no procesado',
        });
      }

      if (monedaRecibida && monedaRecibida !== 'BOB') {
        console.warn(
          `[SIP Callback] Callback recibido pero NO procesado por moneda inválida. ` +
          `Alias: ${alias} | Moneda: ${moneda}`
        );
        await client.query('ROLLBACK');
        return res.json({
          codigo:  '0000',
          mensaje: 'Recibido - moneda no coincide, pago no procesado',
        });
      }

      // ── 5. VERIFICAR QUE NO ESTÉN YA PROCESADOS ──────────────────────
      const yasProcesados = pagos.every(
        p => p.qr_estado === 'pagado' || p.mensualidad_estado === 'pagado'
      );

      if (yasProcesados) {
        console.warn(`[SIP Callback] Todos los pagos ya procesados para alias: ${alias}`);
        await client.query('ROLLBACK');
        return res.json({
          codigo:  '0000',
          mensaje: 'Pagos ya procesados anteriormente',
        });
      }

      // ── 6. PROCESAR CADA PAGO ─────────────────────────────────────────
      const observacionPagador = ` | Pagador: ${nombreCliente || 'N/D'} CI:${documentoCliente || 'N/D'} Cuenta:${cuentaCliente || 'N/D'}`;

      for (const pago of pagos) {
        // Saltar los que ya estén procesados (por si el callback llegó dos veces)
        if (pago.qr_estado === 'pagado' || pago.mensualidad_estado === 'pagado') {
          console.log(`[SIP Callback] Mensualidad ${pago.mensualidad_id} ya estaba pagada, saltando...`);
          continue;
        }

        // Actualizar el registro de pago_mensualidad
        await client.query(
          `UPDATE pago_mensualidad
           SET qr_estado         = 'pagado',
               transaccion_id    = $1,
               numero_referencia = $2,
               banco_origen      = $3,
               observaciones     = COALESCE(observaciones, '') || $4,
               updated_at        = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [
            idQr                  || null,
            numeroOrdenOriginante || null,
            nombreCliente         || null,
            observacionPagador,
            pago.id,
          ]
        );

        // Marcar la mensualidad como PAGADA
        await client.query(
          `UPDATE mensualidad
           SET estado     = 'pagado',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [pago.mensualidad_id]
        );

        console.log(`[SIP Callback] ✅ Mensualidad ${pago.mensualidad_id} marcada como PAGADA`);
      }

      await client.query('COMMIT');

      console.log(
        `[SIP Callback] ✅ ${pagos.length} mensualidad(es) procesada(s). ` +
        `Cliente: ${nombreCliente || 'N/D'} | Monto total: ${monto} ${moneda}`
      );

      // ── 7. RESPONDER 0000 A SIP ───────────────────────────────────────
      return res.json({
        codigo:  '0000',
        mensaje: 'Pago confirmado exitosamente',
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[SIP Callback] Error al procesar pago:', error.message);

      return res.status(500).json({
        codigo:  '9999',
        mensaje: 'Error interno al procesar el pago',
      });

    } finally {
      client.release();
    }
  }
}

export default SipCallbackController;
