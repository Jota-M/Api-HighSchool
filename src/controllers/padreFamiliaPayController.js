// controllers/padreFamiliaPayController.js
// Controlador de pagos para el padre de familia
// El padre puede: ver sus hijos, ver mensualidades, generar QR, verificar estado y cancelar QR

import { pool } from '../db/pool.js';
import {
  generarQR,
  consultarEstado,
  inhabilitarQR,
  generarAlias,
  formatearFechaSIP,
  truncarGlosa,
} from '../services/sipService.js';

const CALLBACK_URL = process.env.CALLBACK_URL || 'https://api-highschool-5ujz.onrender.com';

// =============================================
// HELPER: extrae el idQr guardado en observaciones
// Formato guardado: "QR generado por padre. IdQr SIP: XXXX"
// =============================================
function extraerIdQrDeObservaciones(observaciones) {
  if (!observaciones) return null;
  const match = observaciones.match(/IdQr SIP:\s*(\S+)/);
  return match ? match[1] : null;
}

function normalizarMonto(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Number(numero.toFixed(2)) : null;
}

class PadreFamiliaPayController {

  // ══════════════════════════════════════════════════════════════════════
  // 1. GET /padre-p/hijos
  // ══════════════════════════════════════════════════════════════════════
  static async obtenerHijos(req, res) {
    try {
      const resultPadre = await pool.query(
        `SELECT id FROM padre_familia WHERE usuario_id = $1 AND deleted_at IS NULL`,
        [req.user.id]
      );

      if (resultPadre.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró perfil de padre de familia para este usuario',
        });
      }

      const padreFamiliaId = resultPadre.rows[0].id;

      const result = await pool.query(
        `SELECT
           e.id                  AS estudiante_id,
           e.codigo              AS estudiante_codigo,
           e.nombres,
           e.apellidos,
           e.foto_url,
           e.fecha_nacimiento,
           et.es_tutor_principal,
           mat.id                AS matricula_id,
           mat.numero_matricula,
           mat.estado            AS matricula_estado,
           mat.es_becado,
           mat.porcentaje_beca,
           g.nombre              AS grado,
           p.nombre              AS paralelo,
           n.nombre              AS nivel,
           pa.nombre             AS periodo_academico,
           pa.id                 AS periodo_academico_id,
           COUNT(m.id)                                           AS total_mensualidades,
           COUNT(CASE WHEN m.estado = 'pagado'   THEN 1 END)    AS mensualidades_pagadas,
           COUNT(CASE WHEN m.estado IN ('pendiente','vencido')
                      THEN 1 END)                               AS mensualidades_pendientes
         FROM estudiante_tutor et
         INNER JOIN estudiante e       ON et.estudiante_id     = e.id
         LEFT  JOIN matricula mat      ON e.id                 = mat.estudiante_id
                                      AND mat.estado           = 'activo'
                                      AND mat.deleted_at       IS NULL
         LEFT  JOIN paralelo p         ON mat.paralelo_id      = p.id
         LEFT  JOIN grado g            ON p.grado_id           = g.id
         LEFT  JOIN nivel_academico n  ON g.nivel_academico_id = n.id
         LEFT  JOIN periodo_academico pa ON mat.periodo_academico_id = pa.id
         LEFT  JOIN mensualidad m      ON mat.id               = m.matricula_id
         WHERE et.padre_familia_id = $1
           AND e.activo            = true
           AND e.deleted_at        IS NULL
         GROUP BY
           e.id, e.codigo, e.nombres, e.apellidos, e.foto_url, e.fecha_nacimiento,
           et.es_tutor_principal,
           mat.id, mat.numero_matricula, mat.estado, mat.es_becado, mat.porcentaje_beca,
           g.nombre, p.nombre, n.nombre, pa.nombre, pa.id
         ORDER BY et.es_tutor_principal DESC, e.apellidos ASC`,
        [padreFamiliaId]
      );

      return res.json({
        success: true,
        data: { hijos: result.rows, total: result.rows.length },
      });

    } catch (error) {
      console.error('Error al obtener hijos:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener hijos: ' + error.message,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2. GET /padre-p/hijos/:estudiante_id/mensualidades
  // ══════════════════════════════════════════════════════════════════════
  static async obtenerMensualidadesHijo(req, res) {
    try {
      const { estudiante_id } = req.params;

      const resultPadre = await pool.query(
        `SELECT pf.id FROM padre_familia pf
         INNER JOIN estudiante_tutor et ON pf.id = et.padre_familia_id
         WHERE pf.usuario_id    = $1
           AND et.estudiante_id = $2
           AND pf.deleted_at    IS NULL`,
        [req.user.id, estudiante_id]
      );

      if (resultPadre.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'No tenés acceso a las mensualidades de este estudiante',
        });
      }

      await pool.query(
        `UPDATE mensualidad
         SET estado = 'vencido', updated_at = CURRENT_TIMESTAMP
         WHERE estado = 'pendiente'
           AND fecha_vencimiento < CURRENT_DATE
           AND CURRENT_DATE > DATE_TRUNC('month', fecha_vencimiento) + INTERVAL '1 month' + INTERVAL '14 days'
           AND matricula_id IN (
             SELECT id FROM matricula
             WHERE estudiante_id = $1
               AND estado = 'activo'
               AND deleted_at IS NULL
           )`,
        [estudiante_id]
      );

      const result = await pool.query(
        `SELECT
           m.id                  AS mensualidad_id,
           m.numero_cuota,
           m.mes_correspondiente,
           m.fecha_vencimiento,
           m.monto_original,
           m.monto_beca,
           m.monto_final,
           m.estado,
           pm.id                 AS pago_id,
           pm.qr_data            AS alias_qr,
           pm.qr_estado,
           pm.qr_expiracion,
           pm.transaccion_id,
           pm.fecha_pago,
           pm.monto_pagado,
           CASE
             WHEN pm.qr_estado = 'generado'
              AND pm.qr_expiracion > CURRENT_TIMESTAMP
             THEN true
             ELSE false
           END AS tiene_qr_activo
         FROM mensualidad m
         INNER JOIN matricula mat ON m.matricula_id = mat.id
         LEFT JOIN pago_mensualidad pm
           ON pm.mensualidad_id = m.id
           AND pm.anulado       = false
           AND pm.qr_estado     IS NOT NULL
         WHERE mat.estudiante_id = $1
           AND mat.estado        = 'activo'
           AND mat.deleted_at    IS NULL
         ORDER BY m.numero_cuota ASC`,
        [estudiante_id]
      );

      const mensualidades = result.rows;
      const resumen = {
        total:      mensualidades.length,
        pagadas:    mensualidades.filter(m => m.estado === 'pagado').length,
        pendientes: mensualidades.filter(m => m.estado === 'pendiente').length,
        vencidas:   mensualidades.filter(m => m.estado === 'vencido').length,
        monto_pendiente: mensualidades
          .filter(m => m.estado !== 'pagado')
          .reduce((acc, m) => acc + parseFloat(m.monto_final), 0),
      };

      return res.json({
        success: true,
        data: { mensualidades, resumen },
      });

    } catch (error) {
      console.error('Error al obtener mensualidades del hijo:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener mensualidades: ' + error.message,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. POST /padre-p/mensualidad/:mensualidad_id/generar-qr
  // ══════════════════════════════════════════════════════════════════════
  static async generarQRPago(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { mensualidad_id } = req.params;

      const resultVerif = await client.query(
        `SELECT
           m.id, m.estado, m.monto_final, m.mes_correspondiente, m.fecha_vencimiento,
           e.nombres, e.apellidos,
           mat.id AS matricula_id
         FROM mensualidad m
         INNER JOIN matricula mat      ON m.matricula_id      = mat.id
         INNER JOIN estudiante e       ON mat.estudiante_id   = e.id
         INNER JOIN estudiante_tutor et ON e.id               = et.estudiante_id
         INNER JOIN padre_familia pf   ON et.padre_familia_id = pf.id
         WHERE m.id          = $1
           AND pf.usuario_id = $2
           AND mat.deleted_at IS NULL`,
        [mensualidad_id, req.user.id]
      );

      if (resultVerif.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'No tenés acceso a esta mensualidad' });
      }

      const mensualidad = resultVerif.rows[0];

      if (mensualidad.estado === 'pagado') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Esta mensualidad ya está pagada' });
      }

      if (mensualidad.estado === 'anulado') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Esta mensualidad está anulada, contactá al administrador' });
      }

      // ── Verificar si ya existe un QR activo ──
      const resultQRExistente = await client.query(
        `SELECT id, qr_data, qr_expiracion, qr_image_url, monto_pagado
         FROM pago_mensualidad
         WHERE mensualidad_id = $1
           AND qr_estado      = 'generado'
           AND qr_expiracion  > CURRENT_TIMESTAMP
           AND anulado        = false
         LIMIT 1`,
        [mensualidad_id]
      );

      if (resultQRExistente.rows.length > 0) {
        const p = resultQRExistente.rows[0];
        await client.query('ROLLBACK');
        return res.json({
          success:      true,
          qr_existente: true,
          message:      'Ya existe un QR activo para esta mensualidad',
          data: {
            imagenQr:      p.qr_image_url,
            alias:         p.qr_data,
            qr_expiracion: p.qr_expiracion,
            monto:         p.monto_pagado,
            mes:           mensualidad.mes_correspondiente,
            estudiante:    `${mensualidad.nombres} ${mensualidad.apellidos}`,
          },
        });
      }

      // ── Preparar y llamar a SIP ──
      const alias            = generarAlias(mensualidad_id);
      const fechaVencimiento = formatearFechaSIP(mensualidad.fecha_vencimiento);
      const glosa            = truncarGlosa(`Mens ${mensualidad.mes_correspondiente} ${mensualidad.apellidos}`);
      const callbackUrl      = `${CALLBACK_URL}/api/sip/callback`;

      let qrData;
      try {
        qrData = await generarQR({
          alias,
          monto:  parseFloat(mensualidad.monto_final),
          moneda: 'BOB',
          glosa,
          fechaVencimiento,
          callbackUrl,
        });
      } catch (sipError) {
        await client.query('ROLLBACK');
        console.error('[GenerarQR] Error de SIP:', sipError.message);
        return res.status(502).json({
          success: false,
          message: 'No se pudo generar el QR en este momento. Intentá más tarde.',
          detalle: sipError.message,
        });
      }

      const ahora           = new Date();
      const vencMensualidad = new Date(mensualidad.fecha_vencimiento);
      const qrExpiracion    = vencMensualidad > ahora
        ? vencMensualidad
        : new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

      const codigoPago = `QR-${Date.now()}-${mensualidad_id}`;

      // ── Guardamos idQr de SIP en transaccion_id para verificación posterior ──
      await client.query(
        `INSERT INTO pago_mensualidad (
           codigo_pago, mensualidad_id, monto_pagado, metodo_pago,
           registrado_por, qr_data, qr_image_url, qr_expiracion,
           transaccion_id, qr_estado, observaciones
         ) VALUES ($1, $2, $3, 'qr', $4, $5, $6, $7, $8, 'generado', $9)`,
        [
          codigoPago,
          mensualidad_id,
          parseFloat(mensualidad.monto_final),
          req.user.id,
          alias,
          qrData.imagenQr,
          qrExpiracion,
          qrData.idQr,    // ← idQr de SIP guardado desde el inicio
          `QR generado por padre. IdQr SIP: ${qrData.idQr}`,
        ]
      );

      await client.query('COMMIT');

      console.log(
        `[GenerarQR] ✅ QR generado. Mensualidad: ${mensualidad_id} | ` +
        `Alias: ${alias} | Estudiante: ${mensualidad.nombres} ${mensualidad.apellidos}`
      );

      return res.status(201).json({
        success: true,
        message: 'QR generado exitosamente',
        data: {
          imagenQr:        qrData.imagenQr,
          alias,
          monto:           mensualidad.monto_final,
          mes:             mensualidad.mes_correspondiente,
          estudiante:      `${mensualidad.nombres} ${mensualidad.apellidos}`,
          bancoDestino:    qrData.bancoDestino,
          cuentaDestino:   qrData.cuentaDestino,
          qr_expiracion:   qrExpiracion,
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
  // 4. GET /padre-p/mensualidad/:mensualidad_id/estado-qr
  // ══════════════════════════════════════════════════════════════════════
  static async verificarEstadoQR(req, res) {
    try {
      const { mensualidad_id } = req.params;

      const resultVerif = await pool.query(
        `SELECT m.id, m.estado
         FROM mensualidad m
         INNER JOIN matricula mat      ON m.matricula_id      = mat.id
         INNER JOIN estudiante e       ON mat.estudiante_id   = e.id
         INNER JOIN estudiante_tutor et ON e.id               = et.estudiante_id
         INNER JOIN padre_familia pf   ON et.padre_familia_id = pf.id
         WHERE m.id          = $1
           AND pf.usuario_id = $2`,
        [mensualidad_id, req.user.id]
      );

      if (resultVerif.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'No tenés acceso a esta mensualidad' });
      }

      // Si ya está pagada en BD, responder directo sin consultar SIP
      if (resultVerif.rows[0].estado === 'pagado') {
        return res.json({
          success:       true,
          estado:        'PAGADO',
          en_nuestra_bd: true,
          message:       '¡Pago confirmado! Tu mensualidad está al día.',
        });
      }

      const resultPago = await pool.query(
        `SELECT qr_data, qr_estado, qr_expiracion, transaccion_id, monto_pagado
         FROM pago_mensualidad
         WHERE mensualidad_id = $1
           AND qr_estado      IS NOT NULL
           AND anulado        = false
         ORDER BY created_at DESC
         LIMIT 1`,
        [mensualidad_id]
      );

      if (resultPago.rows.length === 0) {
        return res.json({ success: true, estado: 'SIN_QR', message: 'No hay un QR generado para esta mensualidad' });
      }

      const {
        qr_data: alias,
        qr_expiracion,
        transaccion_id: idQrGuardado,
        monto_pagado: montoEsperado,
      } = resultPago.rows[0];

      // Consultar estado real en SIP
      let estadoSIP;
      try {
        estadoSIP = await consultarEstado(alias);
      } catch (sipError) {
        console.error('[VerificarEstado] Error consultando SIP:', sipError.message);
        return res.json({
          success:       true,
          estado:        resultPago.rows[0].qr_estado.toUpperCase(),
          message:       'Estado obtenido desde base de datos local',
          qr_expiracion,
        });
      }

      // ── PROTECCIÓN CLAVE: solo sincronizar si el idQr coincide ──
      // Evita que un QR viejo o de otro alias dispare un falso PAGADO
      if (estadoSIP.estadoActual === 'PAGADO' && resultVerif.rows[0].estado !== 'pagado') {

        if (!idQrGuardado || idQrGuardado !== estadoSIP.idQr) {
          console.warn(
            `[VerificarEstado] ⚠️ idQr no coincide — NO se sincroniza. ` +
            `Guardado: ${idQrGuardado} | SIP devolvió: ${estadoSIP.idQr}`
          );
          return res.json({
            success:       true,
            estado:        'PENDIENTE',
            qr_expiracion,
            message:       'Pago pendiente. Escaneá el QR con la app de tu banco.',
          });
        }

        const montoLocal = normalizarMonto(montoEsperado);
        const montoSIP = normalizarMonto(estadoSIP.monto);

        if (montoLocal === null || montoSIP === null || Math.abs(montoLocal - montoSIP) > 0.01) {
          console.warn(
            `[VerificarEstado] Monto no coincide — NO se sincroniza. ` +
            `Guardado: ${montoLocal} | SIP devolvió: ${estadoSIP.monto}`
          );
          return res.json({
            success:       true,
            estado:        'PENDIENTE',
            qr_expiracion,
            message:       'Pago pendiente. Escaneá el QR con la app de tu banco.',
          });
        }

        console.log(`[VerificarEstado] ✅ idQr coincide. Sincronizando mensualidad ${mensualidad_id}`);

        await pool.query(
          `UPDATE pago_mensualidad
           SET qr_estado      = 'pagado',
               updated_at     = CURRENT_TIMESTAMP
           WHERE qr_data = $1 AND anulado = false`,
          [alias]
        );

        await pool.query(
          `UPDATE mensualidad
           SET estado = 'pagado', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [mensualidad_id]
        );
      }

      return res.json({
        success:       true,
        estado:        estadoSIP.estadoActual,
        qr_expiracion,
        datos_pago:    estadoSIP.estadoActual === 'PAGADO' ? {
          monto:         estadoSIP.monto,
          moneda:        estadoSIP.moneda,
          fecha:         estadoSIP.fechaProcesamiento,
          nombreCliente: estadoSIP.nombreCliente,
        } : null,
        message: estadoSIP.estadoActual === 'PAGADO'
          ? '¡Pago confirmado! Tu mensualidad está al día.'
          : 'Pago pendiente. Escaneá el QR con la app de tu banco.',
      });

    } catch (error) {
      console.error('Error al verificar estado QR:', error);
      return res.status(500).json({ success: false, message: 'Error al verificar el estado: ' + error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 5. DELETE /padre-p/mensualidad/:mensualidad_id/cancelar-qr
  // ══════════════════════════════════════════════════════════════════════
  static async cancelarQR(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { mensualidad_id } = req.params;

      const resultVerif = await client.query(
        `SELECT m.id
         FROM mensualidad m
         INNER JOIN matricula mat      ON m.matricula_id      = mat.id
         INNER JOIN estudiante e       ON mat.estudiante_id   = e.id
         INNER JOIN estudiante_tutor et ON e.id               = et.estudiante_id
         INNER JOIN padre_familia pf   ON et.padre_familia_id = pf.id
         WHERE m.id          = $1
           AND pf.usuario_id = $2`,
        [mensualidad_id, req.user.id]
      );

      if (resultVerif.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'No tenés acceso a esta mensualidad' });
      }

      const resultQR = await client.query(
        `SELECT id, qr_data
         FROM pago_mensualidad
         WHERE mensualidad_id = $1
           AND qr_estado      = 'generado'
           AND anulado        = false
         LIMIT 1`,
        [mensualidad_id]
      );

      if (resultQR.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'No hay un QR activo para cancelar' });
      }

      const { id: pagoId, qr_data: alias } = resultQR.rows[0];

      try {
        await inhabilitarQR(alias);
      } catch (sipError) {
        console.warn(`[CancelarQR] SIP no pudo inhabilitar (${sipError.message}), cancelando solo en BD`);
      }

      await client.query(
        `UPDATE pago_mensualidad
         SET qr_estado        = 'cancelado',
             anulado          = true,
             motivo_anulacion = 'Cancelado por el padre de familia',
             anulado_por      = $1,
             fecha_anulacion  = CURRENT_TIMESTAMP,
             updated_at       = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [req.user.id, pagoId]
      );

      await client.query('COMMIT');

      return res.json({
        success: true,
        message: 'QR cancelado exitosamente. Podés generar uno nuevo cuando quieras.',
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al cancelar QR:', error);
      return res.status(500).json({ success: false, message: 'Error al cancelar el QR: ' + error.message });
    } finally {
      client.release();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6. POST /padre-p/mensualidades/generar-qr-multiple
  // ══════════════════════════════════════════════════════════════════════
  static async generarQRMultiple(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { mensualidad_ids, estudiante_id } = req.body;

      if (!mensualidad_ids || !Array.isArray(mensualidad_ids) || mensualidad_ids.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Debés seleccionar al menos una mensualidad' });
      }

      if (mensualidad_ids.length === 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Para una sola mensualidad usá el endpoint de QR individual',
          redirect_to: `/padre/mensualidad/${mensualidad_ids[0]}/generar-qr`,
        });
      }

      if (!estudiante_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'El estudiante_id es requerido' });
      }

      const resultPadre = await client.query(
        `SELECT pf.id FROM padre_familia pf
         INNER JOIN estudiante_tutor et ON pf.id = et.padre_familia_id
         WHERE pf.usuario_id    = $1
           AND et.estudiante_id = $2
           AND pf.deleted_at    IS NULL`,
        [req.user.id, estudiante_id]
      );

      if (resultPadre.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'No tenés acceso a las mensualidades de este estudiante' });
      }

      const resultMensualidades = await client.query(
        `SELECT
           m.id, m.estado, m.monto_final, m.mes_correspondiente,
           m.fecha_vencimiento, m.matricula_id,
           e.nombres, e.apellidos,
           EXISTS (
             SELECT 1 FROM pago_mensualidad pm
             WHERE pm.mensualidad_id = m.id
               AND pm.qr_estado = 'generado'
               AND pm.qr_expiracion > CURRENT_TIMESTAMP
               AND pm.anulado = false
           ) AS tiene_qr_activo
         FROM mensualidad m
         INNER JOIN matricula mat      ON m.matricula_id      = mat.id
         INNER JOIN estudiante e       ON mat.estudiante_id   = e.id
         INNER JOIN estudiante_tutor et ON e.id               = et.estudiante_id
         INNER JOIN padre_familia pf   ON et.padre_familia_id = pf.id
         WHERE m.id = ANY($1)
           AND pf.usuario_id = $2
           AND mat.deleted_at IS NULL`,
        [mensualidad_ids, req.user.id]
      );

      if (resultMensualidades.rows.length !== mensualidad_ids.length) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'Algunas mensualidades no existen o no tenés acceso a ellas' });
      }

      const mensualidades = resultMensualidades.rows;

      const noValidas = mensualidades.filter(m => !['pendiente', 'vencido'].includes(m.estado));
      if (noValidas.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Las siguientes mensualidades no se pueden pagar: ${noValidas.map(m => m.mes_correspondiente).join(', ')}`,
        });
      }

      const conQRActivo = mensualidades.filter(m => m.tiene_qr_activo);
      if (conQRActivo.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Las siguientes mensualidades ya tienen un QR activo: ${conQRActivo.map(m => m.mes_correspondiente).join(', ')}. Cancelalos primero.`,
        });
      }

      const montoTotal   = mensualidades.reduce((acc, m) => acc + parseFloat(m.monto_final), 0);
      const matriculaId  = mensualidades[0].matricula_id;
      const alias        = `multi-${matriculaId}-${Date.now()}`;
      const mesesNombres = mensualidades.map(m => m.mes_correspondiente).join(', ');
      const glosa        = truncarGlosa(`Pago ${mensualidades.length} meses`);

      const fechaMasProxima = mensualidades.reduce((min, m) => {
        const fecha = new Date(m.fecha_vencimiento);
        return fecha < min ? fecha : min;
      }, new Date(mensualidades[0].fecha_vencimiento));

      const fechaVencimientoQR = formatearFechaSIP(fechaMasProxima);
      const callbackUrl        = `${CALLBACK_URL}/api/sip/callback`;

      let qrData;
      try {
        qrData = await generarQR({
          alias,
          monto:  montoTotal,
          moneda: 'BOB',
          glosa,
          fechaVencimiento: fechaVencimientoQR,
          callbackUrl,
        });
      } catch (sipError) {
        await client.query('ROLLBACK');
        console.error('[GenerarQRMultiple] Error de SIP:', sipError.message);
        return res.status(502).json({
          success: false,
          message: 'No se pudo generar el QR en este momento. Intentá más tarde.',
          detalle: sipError.message,
        });
      }

      const ahora        = new Date();
      const qrExpiracion = fechaMasProxima > ahora
        ? fechaMasProxima
        : new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

      // ── Guardamos idQr de SIP en transaccion_id para verificación posterior ──
      for (const mensualidad of mensualidades) {
        const codigoPago = `QR-MULTI-${Date.now()}-${mensualidad.id}`;

        await client.query(
          `INSERT INTO pago_mensualidad (
             codigo_pago, mensualidad_id, monto_pagado, metodo_pago,
             registrado_por, qr_data, qr_image_url, qr_expiracion,
             transaccion_id, qr_estado, observaciones
           ) VALUES ($1, $2, $3, 'qr', $4, $5, $6, $7, $8, 'generado', $9)`,
          [
            codigoPago,
            mensualidad.id,
            parseFloat(mensualidad.monto_final),
            req.user.id,
            alias,
            qrData.imagenQr,
            qrExpiracion,
            qrData.idQr,    // ← idQr de SIP guardado desde el inicio
            `QR múltiple: ${mesesNombres} | IdQr SIP: ${qrData.idQr}`,
          ]
        );
      }

      await client.query('COMMIT');

      console.log(
        `[GenerarQRMultiple] ✅ QR generado. Meses: ${mesesNombres} | ` +
        `Alias: ${alias} | Monto total: Bs ${montoTotal.toFixed(2)} | ` +
        `Estudiante: ${mensualidades[0].nombres} ${mensualidades[0].apellidos}`
      );

      return res.status(201).json({
        success: true,
        message: `QR generado para ${mensualidades.length} mensualidades`,
        data: {
          imagenQr:         qrData.imagenQr,
          alias,
          monto_total:      montoTotal,
          meses:            mesesNombres,
          cantidad_meses:   mensualidades.length,
          estudiante:       `${mensualidades[0].nombres} ${mensualidades[0].apellidos}`,
          bancoDestino:     qrData.bancoDestino,
          cuentaDestino:    qrData.cuentaDestino,
          qr_expiracion:    qrExpiracion,
          fechaVencimiento: qrData.fechaVencimiento,
          mensualidad_ids,
        },
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al generar QR múltiple:', error);
      return res.status(500).json({ success: false, message: 'Error al generar el QR: ' + error.message });
    } finally {
      client.release();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 7. GET /padre-p/mensualidades/estado-qr-multiple
  // ══════════════════════════════════════════════════════════════════════
  static async verificarEstadoQRMultiple(req, res) {
    try {
      const { alias } = req.query;

      if (!alias) {
        return res.status(400).json({ success: false, message: 'El alias es requerido' });
      }

      const resultPagos = await pool.query(
        `SELECT
           pm.id,
           pm.mensualidad_id,
           pm.qr_estado,
           pm.qr_expiracion,
           pm.monto_pagado,
           pm.transaccion_id AS id_qr_guardado,
           m.estado          AS mensualidad_estado,
           m.mes_correspondiente,
           m.monto_final
         FROM pago_mensualidad pm
         INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
         WHERE pm.qr_data = $1
           AND pm.anulado  = false
         ORDER BY pm.id ASC`,
        [alias]
      );

      if (resultPagos.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'No se encontró ningún QR con ese alias' });
      }

      const pagos = resultPagos.rows;

      const todosPagados = pagos.every(
        p => p.qr_estado === 'pagado' || p.mensualidad_estado === 'pagado'
      );

      if (todosPagados) {
        return res.json({
          success:       true,
          estado:        'PAGADO',
          en_nuestra_bd: true,
          message:       '¡Pago confirmado! Todas las mensualidades están al día.',
          mensualidades: pagos.map(p => ({
            mensualidad_id: p.mensualidad_id,
            mes:            p.mes_correspondiente,
            monto:          p.monto_pagado,
            estado:         p.mensualidad_estado,
          })),
        });
      }

      let estadoSIP;
      try {
        estadoSIP = await consultarEstado(alias);
      } catch (sipError) {
        console.error('[VerificarEstadoMultiple] Error consultando SIP:', sipError.message);
        return res.json({
          success:       true,
          estado:        pagos[0].qr_estado?.toUpperCase() || 'PENDIENTE',
          qr_expiracion: pagos[0].qr_expiracion,
          message:       'Estado obtenido desde base de datos local',
          mensualidades: pagos.map(p => ({
            mensualidad_id: p.mensualidad_id,
            mes:            p.mes_correspondiente,
            monto:          p.monto_pagado,
            estado:         p.mensualidad_estado,
          })),
        });
      }

      // ── PROTECCIÓN CLAVE: solo sincronizar si el idQr coincide ──
      if (estadoSIP.estadoActual === 'PAGADO') {
        const idQrGuardado = pagos[0].id_qr_guardado;
        const montoEsperado = normalizarMonto(
          pagos.reduce((total, p) => total + Number(p.monto_pagado || p.monto_final || 0), 0)
        );
        const montoSIP = normalizarMonto(estadoSIP.monto);

        if (!idQrGuardado || idQrGuardado !== estadoSIP.idQr) {
          console.warn(
            `[VerificarEstadoMultiple] ⚠️ idQr no coincide — NO se sincroniza. ` +
            `Guardado: ${idQrGuardado} | SIP devolvió: ${estadoSIP.idQr}`
          );
          return res.json({
            success:       true,
            estado:        'PENDIENTE',
            qr_expiracion: pagos[0].qr_expiracion,
            message:       'Pago pendiente. Escaneá el QR con la app de tu banco.',
            mensualidades: pagos.map(p => ({
              mensualidad_id: p.mensualidad_id,
              mes:            p.mes_correspondiente,
              monto:          p.monto_pagado,
              estado:         p.mensualidad_estado,
            })),
          });
        }

        if (montoEsperado === null || montoSIP === null || Math.abs(montoEsperado - montoSIP) > 0.01) {
          console.warn(
            `[VerificarEstadoMultiple] Monto no coincide — NO se sincroniza. ` +
            `Guardado: ${montoEsperado} | SIP devolvió: ${estadoSIP.monto}`
          );
          return res.json({
            success:       true,
            estado:        'PENDIENTE',
            qr_expiracion: pagos[0].qr_expiracion,
            message:       'Pago pendiente. Escaneá el QR con la app de tu banco.',
            mensualidades: pagos.map(p => ({
              mensualidad_id: p.mensualidad_id,
              mes:            p.mes_correspondiente,
              monto:          p.monto_pagado,
              estado:         p.mensualidad_estado,
            })),
          });
        }

        console.log(`[VerificarEstadoMultiple] ✅ idQr coincide. Sincronizando ${pagos.length} mensualidades`);

        for (const pago of pagos) {
          if (pago.qr_estado !== 'pagado') {
            await pool.query(
              `UPDATE pago_mensualidad
               SET qr_estado  = 'pagado', updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [pago.id]
            );
            await pool.query(
              `UPDATE mensualidad
               SET estado = 'pagado', updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [pago.mensualidad_id]
            );
          }
        }
      }

      return res.json({
        success:       true,
        estado:        estadoSIP.estadoActual,
        qr_expiracion: pagos[0].qr_expiracion,
        mensualidades: pagos.map(p => ({
          mensualidad_id: p.mensualidad_id,
          mes:            p.mes_correspondiente,
          monto:          p.monto_pagado,
          estado:         p.mensualidad_estado,
        })),
        datos_pago: estadoSIP.estadoActual === 'PAGADO' ? {
          monto:         estadoSIP.monto,
          moneda:        estadoSIP.moneda,
          fecha:         estadoSIP.fechaProcesamiento,
          nombreCliente: estadoSIP.nombreCliente,
        } : null,
        message: estadoSIP.estadoActual === 'PAGADO'
          ? `¡${pagos.length} mensualidades pagadas! Tu cuenta está al día.`
          : 'Pago pendiente. Escaneá el QR con la app de tu banco.',
      });

    } catch (error) {
      console.error('Error al verificar estado QR múltiple:', error);
      return res.status(500).json({ success: false, message: 'Error al verificar el estado: ' + error.message });
    }
  }
}

export default PadreFamiliaPayController;
