// controllers/migracionMensualidadesController.js
import { pool } from '../db/pool.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

const MESES_CUOTA = [
  'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre'
];

/**
 * Normaliza y aplana la lista de pagos de JSON soportando cuotas simples, pagos múltiples y pago anual
 */
function aplanarPagosJson(pagosList, montoBaseDefault = 330) {
  const result = [];
  if (!Array.isArray(pagosList)) return result;

  for (const p of pagosList) {
    if (!p) continue;
    // Si contiene cuotas_cubiertas (pago_multiple_meses o pago_anual)
    if (p.cuotas_cubiertas && Array.isArray(p.cuotas_cubiertas) && p.cuotas_cubiertas.length > 0) {
      const cantCuotas = p.cuotas_cubiertas.length;
      let montoIndividual = montoBaseDefault;
      if (p.monto_por_cuota !== undefined) {
        montoIndividual = Number(p.monto_por_cuota);
      } else if (p.monto_total !== undefined) {
        montoIndividual = Math.round((Number(p.monto_total) / cantCuotas) * 100) / 100;
      } else if (p.monto !== undefined) {
        montoIndividual = Number(p.monto);
      }

      const numComp = p.numero_comprobante ? String(p.numero_comprobante).trim() : null;
      const numFact = p.numero_factura ? String(p.numero_factura).trim() : null;
      const entFact = !!(p.entrego_factura || numFact);
      const metodoPago = p.metodo_pago || 'efectivo';
      const obs = p.nota || p.observaciones || (p.tipo === 'pago_anual' ? 'Pago anual anticipado' : 'Pago múltiple de cuotas');

      for (const c of p.cuotas_cubiertas) {
        const numCuota = Number(c);
        if (numCuota >= 1 && numCuota <= 10) {
          result.push({
            numero_cuota: numCuota,
            mes_correspondiente: MESES_CUOTA[numCuota - 1],
            monto: montoIndividual,
            metodo_pago: metodoPago,
            numero_comprobante: numComp,
            numero_factura: numFact,
            entrego_factura: entFact,
            fecha_pago: p.fecha_pago,
            observaciones: obs
          });
        }
      }
    } else {
      // Cuota individual o simple
      let numCuota = p.numero_cuota || p.cuota;
      if (!numCuota && p.mes_correspondiente) {
        const idx = MESES_CUOTA.findIndex(m => m.toLowerCase() === String(p.mes_correspondiente).toLowerCase().trim());
        if (idx !== -1) numCuota = idx + 1;
      }

      if (numCuota && numCuota >= 1 && numCuota <= 10) {
        const numComp = p.numero_comprobante ? String(p.numero_comprobante).trim() : null;
        const numFact = p.numero_factura ? String(p.numero_factura).trim() : null;
        const entFact = !!(p.entrego_factura || numFact);

        result.push({
          numero_cuota: Number(numCuota),
          mes_correspondiente: p.mes_correspondiente || MESES_CUOTA[numCuota - 1],
          monto: Number(p.monto !== undefined ? p.monto : (p.monto_pagado !== undefined ? p.monto_pagado : montoBaseDefault)),
          metodo_pago: p.metodo_pago || 'efectivo',
          numero_comprobante: numComp,
          numero_factura: numFact,
          entrego_factura: entFact,
          fecha_pago: p.fecha_pago,
          observaciones: p.nota || p.observaciones || 'Migrado vía JSON'
        });
      }
    }
  }
  return result;
}

export class MigracionMensualidadesController {
  /**
   * Obtiene la matriz completa de un curso (paralelo) con sus estudiantes
   * y las 10 cuotas con estado de pago, documentos y becas.
   */
  static async obtenerMatrizCurso(req, res) {
    const client = await pool.connect();
    try {
      const { paralelo_id } = req.params;
      let { periodo_academico_id } = req.query;

      if (!paralelo_id) {
        return res.status(400).json({ success: false, message: 'Se requiere paralelo_id' });
      }

      // Si no se envía periodo_academico_id, obtener el período activo
      if (!periodo_academico_id) {
        const perRes = await client.query(`SELECT id FROM periodo_academico WHERE estado = 'abierto' OR estado = 'activo' ORDER BY id DESC LIMIT 1`);
        if (perRes.rows.length > 0) {
          periodo_academico_id = perRes.rows[0].id;
        } else {
          const perUltimo = await client.query(`SELECT id FROM periodo_academico ORDER BY id DESC LIMIT 1`);
          periodo_academico_id = perUltimo.rows[0]?.id;
        }
      }

      // Obtener info del curso (grado, paralelo, nivel)
      const cursoInfoRes = await client.query(`
        SELECT 
          p.id AS paralelo_id,
          p.nombre AS paralelo_nombre,
          g.id AS grado_id,
          g.nombre AS grado_nombre,
          n.id AS nivel_id,
          n.nombre AS nivel_nombre,
          pa.id AS periodo_academico_id,
          pa.nombre AS periodo_nombre,
          COALESCE(cm.monto_base, 0) AS monto_base_cuota
        FROM paralelo p
        JOIN grado g ON g.id = p.grado_id
        JOIN nivel_academico n ON n.id = g.nivel_academico_id
        JOIN periodo_academico pa ON pa.id = $2
        LEFT JOIN costo_mensualidad cm ON cm.periodo_academico_id = pa.id AND cm.nivel_academico_id = n.id AND cm.activo = true
        WHERE p.id = $1
      `, [paralelo_id, periodo_academico_id]);

      if (cursoInfoRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Curso o paralelo no encontrado' });
      }

      const cursoInfo = cursoInfoRes.rows[0];

      // Obtener todos los estudiantes matriculados en este paralelo y período
      const estudiantesRes = await client.query(`
        SELECT 
          e.id AS estudiante_id,
          e.ci,
          e.codigo AS codigo_estudiante,
          e.nombres,
          e.apellido_paterno,
          e.apellido_materno,
          TRIM(CONCAT(e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''), ' ', e.nombres)) AS nombre_completo,
          m.id AS matricula_id,
          m.estado AS estado_matricula,
          m.es_becado,
          m.porcentaje_beca,
          m.tipo_beca
        FROM matricula m
        JOIN estudiante e ON e.id = m.estudiante_id
        WHERE m.paralelo_id = $1
          AND m.periodo_academico_id = $2
          AND m.deleted_at IS NULL
        ORDER BY e.apellido_paterno ASC, e.apellido_materno ASC, e.nombres ASC
      `, [paralelo_id, periodo_academico_id]);

      const matriculaIds = estudiantesRes.rows.map(e => e.matricula_id);

      let mensualidadesPorMatricula = {};
      let pagosPorMensualidad = {};

      if (matriculaIds.length > 0) {
        // Consultar mensualidades
        const mensRes = await client.query(`
          SELECT 
            id,
            matricula_id,
            numero_cuota,
            mes_correspondiente,
            fecha_vencimiento,
            monto_original,
            monto_beca,
            monto_recargo,
            monto_final,
            estado,
            observaciones
          FROM mensualidad
          WHERE matricula_id = ANY($1::int[])
          ORDER BY numero_cuota ASC
        `, [matriculaIds]);

        const mensualidadIds = mensRes.rows.map(m => m.id);

        for (const m of mensRes.rows) {
          if (!mensualidadesPorMatricula[m.matricula_id]) {
            mensualidadesPorMatricula[m.matricula_id] = { porNumero: {}, porMes: {} };
          }
          mensualidadesPorMatricula[m.matricula_id].porNumero[m.numero_cuota] = m;
          if (m.mes_correspondiente) {
            mensualidadesPorMatricula[m.matricula_id].porMes[m.mes_correspondiente.toLowerCase().trim()] = m;
          }
        }

        if (mensualidadIds.length > 0) {
          // Consultar pagos asociados a estas mensualidades
          const pagosRes = await client.query(`
            SELECT 
              p.id,
              p.codigo_pago,
              p.mensualidad_id,
              p.monto_pagado,
              p.metodo_pago,
              p.numero_comprobante,
              p.entrego_factura,
              p.numero_factura,
              p.fecha_pago,
              p.observaciones,
              p.anulado,
              u.username AS registrado_por_nombre
            FROM pago_mensualidad p
            LEFT JOIN usuarios u ON u.id = p.registrado_por
            WHERE p.mensualidad_id = ANY($1::int[])
              AND p.anulado = false
            ORDER BY p.fecha_pago ASC, p.id ASC
          `, [mensualidadIds]);

          for (const p of pagosRes.rows) {
            if (!pagosPorMensualidad[p.mensualidad_id]) {
              pagosPorMensualidad[p.mensualidad_id] = [];
            }
            pagosPorMensualidad[p.mensualidad_id].push(p);
          }
        }
      }

      // Estructurar respuesta con las 10 cuotas por estudiante
      const estudiantesData = estudiantesRes.rows.map(est => {
        const matData = mensualidadesPorMatricula[est.matricula_id];
        const cuotas = [];

        for (let i = 1; i <= 10; i++) {
          const mesNombre = MESES_CUOTA[i - 1];
          // Priorizar búsqueda por mes_correspondiente (ej. 'marzo') para estudiantes con ingreso tardío
          const m = matData?.porMes?.[mesNombre] || matData?.porNumero?.[i] || null;
          const pagos = m ? (pagosPorMensualidad[m.id] || []) : [];

          cuotas.push({
            numero_cuota: m ? m.numero_cuota : i,
            mes: m?.mes_correspondiente || mesNombre,
            mensualidad_id: m ? m.id : null,
            monto_original: m ? Number(m.monto_original) : Number(cursoInfo.monto_base_cuota),
            monto_beca: m ? Number(m.monto_beca) : 0,
            monto_recargo: m ? Number(m.monto_recargo) : 0,
            monto_final: m ? Number(m.monto_final) : Number(cursoInfo.monto_base_cuota),
            estado: m ? m.estado : 'no_aplica',
            observaciones: m ? m.observaciones : null,
            fecha_vencimiento: m ? m.fecha_vencimiento : null,
            pagos: pagos.map(p => ({
              id: p.id,
              codigo_pago: p.codigo_pago,
              monto_pagado: Number(p.monto_pagado),
              metodo_pago: p.metodo_pago,
              numero_comprobante: p.numero_comprobante,
              entrego_factura: p.entrego_factura,
              numero_factura: p.numero_factura,
              fecha_pago: p.fecha_pago,
              observaciones: p.observaciones,
              registrado_por_nombre: p.registrado_por_nombre
            }))
          });
        }

        return {
          ...est,
          cuotas
        };
      });

      res.json({
        success: true,
        data: {
          curso: cursoInfo,
          total_estudiantes: estudiantesData.length,
          estudiantes: estudiantesData
        }
      });
    } catch (error) {
      console.error('Error al obtener matriz de curso:', error);
      res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene la ficha histórica detallada de un estudiante específico
   */
  static async obtenerEstudianteHistorial(req, res) {
    const client = await pool.connect();
    try {
      const { estudiante_id } = req.params;
      let { periodo_academico_id } = req.query;

      if (!periodo_academico_id) {
        const perRes = await client.query(`SELECT id FROM periodo_academico WHERE estado = 'abierto' OR estado = 'activo' ORDER BY id DESC LIMIT 1`);
        periodo_academico_id = perRes.rows[0]?.id;
      }

      const estRes = await client.query(`
        SELECT 
          e.id AS estudiante_id,
          e.ci,
          e.codigo AS codigo_estudiante,
          e.nombres,
          e.apellido_paterno,
          e.apellido_materno,
          TRIM(CONCAT(e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''), ' ', e.nombres)) AS nombre_completo,
          m.id AS matricula_id,
          m.estado AS estado_matricula,
          m.es_becado,
          m.porcentaje_beca,
          m.tipo_beca,
          m.paralelo_id,
          p.nombre AS paralelo_nombre,
          g.id AS grado_id,
          g.nombre AS grado_nombre,
          n.id AS nivel_id,
          n.nombre AS nivel_nombre,
          COALESCE(cm.monto_base, 0) AS monto_base_cuota
        FROM estudiante e
        JOIN matricula m ON m.estudiante_id = e.id AND m.periodo_academico_id = $2 AND m.deleted_at IS NULL
        JOIN paralelo p ON p.id = m.paralelo_id
        JOIN grado g ON g.id = p.grado_id
        JOIN nivel_academico n ON n.id = g.nivel_academico_id
        LEFT JOIN costo_mensualidad cm ON cm.periodo_academico_id = $2 AND cm.nivel_academico_id = n.id AND cm.activo = true
        WHERE e.id = $1 AND e.deleted_at IS NULL
      `, [estudiante_id, periodo_academico_id]);

      if (estRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Estudiante con matrícula activa no encontrado' });
      }

      const estudiante = estRes.rows[0];

      // Cuotas
      const mensRes = await client.query(`
        SELECT 
          m.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', p.id,
                'codigo_pago', p.codigo_pago,
                'monto_pagado', p.monto_pagado,
                'metodo_pago', p.metodo_pago,
                'numero_comprobante', p.numero_comprobante,
                'entrego_factura', p.entrego_factura,
                'numero_factura', p.numero_factura,
                'fecha_pago', p.fecha_pago,
                'observaciones', p.observaciones,
                'registrado_por_nombre', u.username
              ) ORDER BY p.fecha_pago ASC, p.id ASC
            ) FILTER (WHERE p.id IS NOT NULL AND p.anulado = false), '[]'
          ) AS pagos
        FROM mensualidad m
        LEFT JOIN pago_mensualidad p ON p.mensualidad_id = m.id
        LEFT JOIN usuarios u ON u.id = p.registrado_por
        WHERE m.matricula_id = $1
        GROUP BY m.id
        ORDER BY m.numero_cuota ASC
      `, [estudiante.matricula_id]);

      res.json({
        success: true,
        data: {
          estudiante,
          mensualidades: mensRes.rows
        }
      });
    } catch (error) {
      console.error('Error al obtener historial de estudiante:', error);
      res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Registra o actualiza el pago histórico de una cuota
   */
  static async registrarPagoHistorico(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        matricula_id,
        numero_cuota,
        monto_pagado,
        metodo_pago = 'efectivo',
        tipo_documento = 'recibo', // 'factura', 'recibo', 'ambos', 'sin_documento'
        numero_comprobante,
        numero_factura,
        entrego_factura = false,
        fecha_pago,
        observaciones
      } = req.body;

      if (!matricula_id || !numero_cuota) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'matricula_id y numero_cuota son requeridos' });
      }

      // Asegurar que la mensualidad exista
      let mensualidadRes = await client.query(`
        SELECT * FROM mensualidad WHERE matricula_id = $1 AND numero_cuota = $2
      `, [matricula_id, numero_cuota]);

      let mensualidadId;
      let montoFinal = 0;

      if (mensualidadRes.rows.length === 0) {
        // Consultar nivel y costo para generar la mensualidad
        const matInfo = await client.query(`
          SELECT m.periodo_academico_id, g.nivel_academico_id
          FROM matricula m
          JOIN paralelo p ON p.id = m.paralelo_id
          JOIN grado g ON g.id = p.grado_id
          WHERE m.id = $1
        `, [matricula_id]);

        if (matInfo.rows.length === 0) {
          throw new Error('Matrícula no encontrada');
        }

        const { periodo_academico_id, nivel_academico_id } = matInfo.rows[0];
        const mesNombre = MESES_CUOTA[numero_cuota - 1] || `Cuota ${numero_cuota}`;
        
        const costoRes = await client.query(`
          SELECT monto_base FROM costo_mensualidad
          WHERE periodo_academico_id = $1 AND nivel_academico_id = $2 AND activo = true LIMIT 1
        `, [periodo_academico_id, nivel_academico_id]);

        const montoBase = costoRes.rows[0]?.monto_base || monto_pagado || 330;
        const fechaVencimiento = new Date(new Date().getFullYear(), numero_cuota + 1, 10);

        const nuevaMens = await client.query(`
          INSERT INTO mensualidad 
            (matricula_id, numero_cuota, mes_correspondiente, fecha_vencimiento, monto_original, monto_beca, monto_recargo, monto_final, estado)
          VALUES ($1, $2, $3, $4, $5, 0, 0, $5, 'pendiente')
          RETURNING *
        `, [matricula_id, numero_cuota, mesNombre, fechaVencimiento, montoBase]);

        mensualidadId = nuevaMens.rows[0].id;
        montoFinal = Number(nuevaMens.rows[0].monto_final);
      } else {
        mensualidadId = mensualidadRes.rows[0].id;
        montoFinal = Number(mensualidadRes.rows[0].monto_final);
      }

      // Procesar documento según tipo_documento
      let numComprobanteFinal = null;
      let numFacturaFinal = null;
      let entregaFacturaFinal = false;

      if (tipo_documento === 'factura') {
        numFacturaFinal = numero_factura ? String(numero_factura).trim() : null;
        entregaFacturaFinal = true;
      } else if (tipo_documento === 'recibo') {
        numComprobanteFinal = numero_comprobante ? String(numero_comprobante).trim() : null;
        entregaFacturaFinal = false;
      } else if (tipo_documento === 'ambos') {
        numComprobanteFinal = numero_comprobante ? String(numero_comprobante).trim() : null;
        numFacturaFinal = numero_factura ? String(numero_factura).trim() : null;
        entregaFacturaFinal = true;
      } else if (tipo_documento === 'sin_documento') {
        entregaFacturaFinal = false;
      } else {
        numComprobanteFinal = numero_comprobante || null;
        numFacturaFinal = numero_factura || null;
        entregaFacturaFinal = !!entrego_factura;
      }

      const montoFinalPago = Number(monto_pagado !== undefined ? monto_pagado : (montoFinal || 330));
      const fechaPagoFinal = fecha_pago ? new Date(fecha_pago) : new Date();
      const codigoPago = `HIST-${matricula_id}-${numero_cuota}-${Date.now().toString(36).toUpperCase()}`;
      const userId = req.user?.id || 1;

      const pagoRes = await client.query(`
        INSERT INTO pago_mensualidad
          (codigo_pago, mensualidad_id, monto_pagado, metodo_pago, numero_comprobante,
           entrego_factura, numero_factura, fecha_pago, registrado_por, observaciones)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        codigoPago,
        mensualidadId,
        montoFinalPago,
        metodo_pago,
        numComprobanteFinal,
        entregaFacturaFinal,
        numFacturaFinal,
        fechaPagoFinal,
        userId,
        observaciones || 'Pago histórico registrado vía panel de migración'
      ]);

      const nuevoPago = pagoRes.rows[0];

      // Recalcular estado de la mensualidad
      const totalPagadoRes = await client.query(`
        SELECT COALESCE(SUM(monto_pagado), 0) AS total_pagado
        FROM pago_mensualidad
        WHERE mensualidad_id = $1 AND anulado = false
      `, [mensualidadId]);

      const totalPagado = Number(totalPagadoRes.rows[0].total_pagado);
      let nuevoEstado = 'pendiente';
      if (totalPagado >= montoFinal) {
        nuevoEstado = 'pagado';
      } else if (totalPagado > 0) {
        nuevoEstado = 'pagado_parcial';
      }

      await client.query(`
        UPDATE mensualidad SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
      `, [nuevoEstado, mensualidadId]);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: userId,
        accion: 'crear',
        modulo: 'migracion_mensualidades',
        tabla_afectada: 'pago_mensualidad',
        registro_id: nuevoPago.id,
        datos_nuevos: nuevoPago,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Pago histórico cuota ${numero_cuota} registrado: Bs ${montoFinalPago}`
      });

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: `Pago de la cuota ${numero_cuota} registrado exitosamente`,
        data: {
          pago: nuevoPago,
          mensualidad_id: mensualidadId,
          nuevo_estado: nuevoEstado
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al registrar pago histórico:', error);
      res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Actualiza los datos de un pago histórico ya registrado
   */
  static async actualizarPagoHistorico(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { pago_id } = req.params;
      const {
        monto_pagado,
        metodo_pago,
        tipo_documento,
        numero_comprobante,
        numero_factura,
        entrego_factura,
        fecha_pago,
        observaciones
      } = req.body;

      const pagoExistenteRes = await client.query(`
        SELECT p.*, m.id AS mensualidad_id, m.monto_final
        FROM pago_mensualidad p
        JOIN mensualidad m ON m.id = p.mensualidad_id
        WHERE p.id = $1
      `, [pago_id]);

      if (pagoExistenteRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

      const pagoExistente = pagoExistenteRes.rows[0];

      let numComprobanteFinal = pagoExistente.numero_comprobante;
      let numFacturaFinal = pagoExistente.numero_factura;
      let entregaFacturaFinal = pagoExistente.entrego_factura;

      if (tipo_documento === 'factura') {
        numFacturaFinal = numero_factura ? String(numero_factura).trim() : null;
        numComprobanteFinal = null;
        entregaFacturaFinal = true;
      } else if (tipo_documento === 'recibo') {
        numComprobanteFinal = numero_comprobante ? String(numero_comprobante).trim() : null;
        numFacturaFinal = null;
        entregaFacturaFinal = false;
      } else if (tipo_documento === 'ambos') {
        numComprobanteFinal = numero_comprobante ? String(numero_comprobante).trim() : null;
        numFacturaFinal = numero_factura ? String(numero_factura).trim() : null;
        entregaFacturaFinal = true;
      } else if (tipo_documento === 'sin_documento') {
        numComprobanteFinal = null;
        numFacturaFinal = null;
        entregaFacturaFinal = false;
      } else {
        if (numero_comprobante !== undefined) numComprobanteFinal = numero_comprobante || null;
        if (numero_factura !== undefined) numFacturaFinal = numero_factura || null;
        if (entrego_factura !== undefined) entregaFacturaFinal = !!entrego_factura;
      }

      const montoPagadoFinal = monto_pagado !== undefined ? Number(monto_pagado) : Number(pagoExistente.monto_pagado);
      const metodoPagoFinal = metodo_pago || pagoExistente.metodo_pago;
      const fechaPagoFinal = fecha_pago ? new Date(fecha_pago) : pagoExistente.fecha_pago;
      const obsFinal = observaciones !== undefined ? observaciones : pagoExistente.observaciones;

      const updRes = await client.query(`
        UPDATE pago_mensualidad
        SET 
          monto_pagado = $1,
          metodo_pago = $2,
          numero_comprobante = $3,
          numero_factura = $4,
          entrego_factura = $5,
          fecha_pago = $6,
          observaciones = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *
      `, [
        montoPagadoFinal,
        metodoPagoFinal,
        numComprobanteFinal,
        numFacturaFinal,
        entregaFacturaFinal,
        fechaPagoFinal,
        obsFinal,
        pago_id
      ]);

      // Recalcular estado de la mensualidad
      const totalPagadoRes = await client.query(`
        SELECT COALESCE(SUM(monto_pagado), 0) AS total_pagado
        FROM pago_mensualidad
        WHERE mensualidad_id = $1 AND anulado = false
      `, [pagoExistente.mensualidad_id]);

      const totalPagado = Number(totalPagadoRes.rows[0].total_pagado);
      const montoFinal = Number(pagoExistente.monto_final);

      let nuevoEstado = 'pendiente';
      if (totalPagado >= montoFinal) {
        nuevoEstado = 'pagado';
      } else if (totalPagado > 0) {
        nuevoEstado = 'pagado_parcial';
      }

      await client.query(`
        UPDATE mensualidad SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
      `, [nuevoEstado, pagoExistente.mensualidad_id]);

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Pago actualizado exitosamente',
        data: {
          pago: updRes.rows[0],
          nuevo_estado: nuevoEstado
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al actualizar pago histórico:', error);
      res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Elimina un pago histórico y restaura la mensualidad
   */
  static async eliminarPagoHistorico(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { pago_id } = req.params;

      const pagoExistente = await client.query(`
        SELECT p.*, m.id AS mensualidad_id, m.monto_final, m.monto_beca
        FROM pago_mensualidad p
        JOIN mensualidad m ON m.id = p.mensualidad_id
        WHERE p.id = $1
      `, [pago_id]);

      if (pagoExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

      const { mensualidad_id, monto_final, monto_beca, codigo_pago } = pagoExistente.rows[0];

      // 1. Eliminar ingresos centralizados asociados al pago
      await client.query(`
        DELETE FROM ingreso 
        WHERE (referencia_tipo = 'mensualidad' OR tipo_ingreso = 'ING-MENS') 
          AND (referencia_id = $1 OR codigo_referencia = $2)
      `, [pago_id, codigo_pago]);

      // 2. Eliminar solicitudes de factura si las hubiera
      await client.query(`
        DELETE FROM solicitud_factura 
        WHERE pago_mensualidad_id = $1 OR $1 = ANY(pago_mensualidad_ids)
      `, [pago_id]);

      // 3. Eliminar el pago
      await client.query(`DELETE FROM pago_mensualidad WHERE id = $1`, [pago_id]);

      // Recalcular estado de la mensualidad
      const totalPagadoRes = await client.query(`
        SELECT COALESCE(SUM(monto_pagado), 0) AS total_pagado
        FROM pago_mensualidad
        WHERE mensualidad_id = $1 AND anulado = false
      `, [mensualidad_id]);

      const totalPagado = Number(totalPagadoRes.rows[0].total_pagado);
      let nuevoEstado = 'pendiente';
      if (Number(monto_beca) > 0 && Number(monto_final) === 0) {
        nuevoEstado = 'cancelado';
      } else if (totalPagado >= Number(monto_final) && Number(monto_final) > 0) {
        nuevoEstado = 'pagado';
      } else if (totalPagado > 0) {
        nuevoEstado = 'pagado_parcial';
      }

      await client.query(`
        UPDATE mensualidad SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
      `, [nuevoEstado, mensualidad_id]);

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Pago eliminado exitosamente',
        data: {
          mensualidad_id,
          nuevo_estado: nuevoEstado
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al eliminar pago histórico:', error);
      res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Configura beca y exonera cuotas seleccionadas
   */
  static async configurarBeca(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const {
        matricula_id,
        es_becado,
        porcentaje_beca = 100,
        tipo_beca = 'becado (carga histórica)',
        cuotas_exoneradas = [] // array de números [1, 2, 3.. 10]
      } = req.body;

      if (!matricula_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'matricula_id es requerido' });
      }

      // Actualizar estado de beca en matrícula
      await client.query(`
        UPDATE matricula
        SET 
          es_becado = $1,
          porcentaje_beca = $2,
          tipo_beca = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [!!es_becado, es_becado ? porcentaje_beca : 0, es_becado ? tipo_beca : null, matricula_id]);

      // Asegurar que las 10 mensualidades existan
      const matInfo = await client.query(`
        SELECT m.periodo_academico_id, g.nivel_academico_id
        FROM matricula m
        JOIN paralelo p ON p.id = m.paralelo_id
        JOIN grado g ON g.id = p.grado_id
        WHERE m.id = $1
      `, [matricula_id]);

      const { periodo_academico_id, nivel_academico_id } = matInfo.rows[0];
      const costoRes = await client.query(`
        SELECT monto_base FROM costo_mensualidad
        WHERE periodo_academico_id = $1 AND nivel_academico_id = $2 AND activo = true LIMIT 1
      `, [periodo_academico_id, nivel_academico_id]);

      const montoBase = costoRes.rows[0]?.monto_base || 330;

      for (let i = 1; i <= 10; i++) {
        const existe = await client.query(`SELECT id FROM mensualidad WHERE matricula_id = $1 AND numero_cuota = $2`, [matricula_id, i]);
        if (existe.rows.length === 0) {
          const mesNombre = MESES_CUOTA[i - 1];
          const fechaVencimiento = new Date(new Date().getFullYear(), i + 1, 10);
          await client.query(`
            INSERT INTO mensualidad (matricula_id, numero_cuota, mes_correspondiente, fecha_vencimiento, monto_original, monto_beca, monto_recargo, monto_final, estado)
            VALUES ($1, $2, $3, $4, $5, 0, 0, $5, 'pendiente')
          `, [matricula_id, i, mesNombre, fechaVencimiento, montoBase]);
        }
      }

      // Aplicar o revertir exoneraciones
      const cuotasExoneradasSet = new Set(cuotas_exoneradas.map(Number));

      for (let i = 1; i <= 10; i++) {
        const mensRes = await client.query(`
          SELECT m.*, COALESCE(SUM(p.monto_pagado), 0) AS total_pagado
          FROM mensualidad m
          LEFT JOIN pago_mensualidad p ON p.mensualidad_id = m.id AND p.anulado = false
          WHERE m.matricula_id = $1 AND m.numero_cuota = $2
          GROUP BY m.id
        `, [matricula_id, i]);

        if (mensRes.rows.length === 0) continue;
        const mens = mensRes.rows[0];
        const totalPagado = Number(mens.total_pagado);

        if (es_becado && cuotasExoneradasSet.has(i)) {
          // Si no tiene pagos, exonerar por completo
          if (totalPagado === 0) {
            await client.query(`
              UPDATE mensualidad
              SET 
                monto_beca = monto_original,
                monto_final = 0,
                estado = 'cancelado',
                observaciones = CASE 
                  WHEN observaciones IS NULL OR observaciones = '' THEN 'Exonerado por beca (carga histórica)'
                  ELSE observaciones
                END,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [mens.id]);
          }
        } else if (mens.estado === 'cancelado' && Number(mens.monto_beca) > 0 && totalPagado === 0) {
          // Revertir a pendiente si ya no está exonerado
          await client.query(`
            UPDATE mensualidad
            SET 
              monto_beca = 0,
              monto_final = monto_original,
              estado = 'pendiente',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [mens.id]);
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: es_becado ? 'Beca configurada y cuotas exoneradas actualizadas' : 'Beca removida y cuotas restauradas'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al configurar beca:', error);
      res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Genera cuotas pendientes para todos los estudiantes de un curso que no las tengan
   */
  static async generarCuotasPendientesCurso(req, res) {
    const client = await pool.connect();
    try {
      const { paralelo_id } = req.body;
      let { periodo_academico_id } = req.body;

      if (!paralelo_id) {
        return res.status(400).json({ success: false, message: 'paralelo_id es requerido' });
      }

      if (!periodo_academico_id) {
        const perRes = await client.query(`SELECT id FROM periodo_academico WHERE estado = 'abierto' OR estado = 'activo' ORDER BY id DESC LIMIT 1`);
        periodo_academico_id = perRes.rows[0]?.id;
      }

      const matRes = await client.query(`
        SELECT m.id AS matricula_id, g.nivel_academico_id, e.nombres, e.apellido_paterno
        FROM matricula m
        JOIN estudiante e ON e.id = m.estudiante_id
        JOIN paralelo p ON p.id = m.paralelo_id
        JOIN grado g ON g.id = p.grado_id
        WHERE m.paralelo_id = $1
          AND m.periodo_academico_id = $2
          AND m.deleted_at IS NULL
          AND m.estado = 'activo'
      `, [paralelo_id, periodo_academico_id]);

      let generadosCount = 0;

      for (const mat of matRes.rows) {
        const countRes = await client.query(`SELECT COUNT(*) FROM mensualidad WHERE matricula_id = $1`, [mat.matricula_id]);
        if (parseInt(countRes.rows[0].count) === 0) {
          await client.query(`SELECT * FROM generar_mensualidades($1, $2, $3, 0)`, [
            mat.matricula_id,
            periodo_academico_id,
            mat.nivel_academico_id
          ]);
          generadosCount++;
        }
      }

      res.json({
        success: true,
        message: `Generación completada: ${generadosCount} estudiante(s) con nuevas cuotas`,
        data: { generados_count: generadosCount }
      });
    } catch (error) {
      console.error('Error al generar cuotas de curso:', error);
      res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Registra pagos múltiples o lote de cuotas para un estudiante
   */
  static async registrarLoteEstudiante(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const {
        matricula_id,
        cuotas = [], // array de { numero_cuota, monto, metodo_pago, tipo_documento, numero_factura, numero_comprobante, fecha_pago, observaciones }
      } = req.body;

      if (!matricula_id || cuotas.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'matricula_id y lista de cuotas son requeridos' });
      }

      const userId = req.user?.id || 1;
      const resultados = [];

      for (const c of cuotas) {
        const {
          numero_cuota,
          monto = 330,
          metodo_pago = 'efectivo',
          tipo_documento = 'recibo',
          numero_factura,
          numero_comprobante,
          fecha_pago,
          observaciones
        } = c;

        // Asegurar mensualidad
        let mensRes = await client.query(`SELECT id, monto_final FROM mensualidad WHERE matricula_id = $1 AND numero_cuota = $2`, [matricula_id, numero_cuota]);
        let mensualidadId;
        let montoFinal = monto;

        if (mensRes.rows.length === 0) {
          const matInfo = await client.query(`
            SELECT m.periodo_academico_id, g.nivel_academico_id
            FROM matricula m
            JOIN paralelo p ON p.id = m.paralelo_id
            JOIN grado g ON g.id = p.grado_id
            WHERE m.id = $1
          `, [matricula_id]);

          const mesNombre = MESES_CUOTA[numero_cuota - 1] || `Cuota ${numero_cuota}`;
          const fechaVencimiento = new Date(new Date().getFullYear(), numero_cuota + 1, 10);

          const nuevaM = await client.query(`
            INSERT INTO mensualidad (matricula_id, numero_cuota, mes_correspondiente, fecha_vencimiento, monto_original, monto_beca, monto_recargo, monto_final, estado)
            VALUES ($1, $2, $3, $4, $5, 0, 0, $5, 'pendiente')
            RETURNING id, monto_final
          `, [matricula_id, numero_cuota, mesNombre, fechaVencimiento, monto]);

          mensualidadId = nuevaM.rows[0].id;
          montoFinal = Number(nuevaM.rows[0].monto_final);
        } else {
          mensualidadId = mensRes.rows[0].id;
          montoFinal = Number(mensRes.rows[0].monto_final);
        }

        let numComp = null;
        let numFact = null;
        let entFact = false;

        if (tipo_documento === 'factura') {
          numFact = numero_factura ? String(numero_factura).trim() : null;
          entFact = true;
        } else if (tipo_documento === 'recibo') {
          numComp = numero_comprobante ? String(numero_comprobante).trim() : null;
          entFact = false;
        } else if (tipo_documento === 'ambos') {
          numComp = numero_comprobante ? String(numero_comprobante).trim() : null;
          numFact = numero_factura ? String(numero_factura).trim() : null;
          entFact = true;
        }

        const codigoPago = `HIST-${matricula_id}-${numero_cuota}-${Date.now().toString(36).toUpperCase()}`;

        const insPago = await client.query(`
          INSERT INTO pago_mensualidad
            (codigo_pago, mensualidad_id, monto_pagado, metodo_pago, numero_comprobante,
             entrego_factura, numero_factura, fecha_pago, registrado_por, observaciones)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `, [
          codigoPago,
          mensualidadId,
          monto,
          metodo_pago,
          numComp,
          entFact,
          numFact,
          fecha_pago ? new Date(fecha_pago) : new Date(),
          userId,
          observaciones || 'Pago histórico en lote'
        ]);

        // Actualizar mensualidad a pagado
        await client.query(`UPDATE mensualidad SET estado = 'pagado', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [mensualidadId]);

        resultados.push(insPago.rows[0]);
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: `${resultados.length} pago(s) registrado(s) en lote exitosamente`,
        data: { pagos: resultados }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en registro en lote:', error);
      res.status(500).json({ success: false, message: 'Error interno: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Importa directamente un JSON de pagos / becas para un estudiante
   */
  static async importarJsonEstudiante(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { matricula_id, json_data } = req.body;

      if (!matricula_id || !json_data) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'matricula_id y json_data son requeridos' });
      }

      let parsed = json_data;
      if (typeof json_data === 'string') {
        try {
          parsed = JSON.parse(json_data);
        } catch (e) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'El JSON proporcionado tiene errores de sintaxis' });
        }
      }

      // Si el JSON viene dentro de un array de 1 elemento
      if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'object' && parsed[0].pagos) {
        parsed = parsed[0];
      }

      // Extraer pagos y beca
      let pagosList = [];
      let becaInfo = null;

      if (Array.isArray(parsed)) {
        pagosList = parsed;
      } else if (typeof parsed === 'object') {
        if (Array.isArray(parsed.pagos)) {
          pagosList = parsed.pagos;
        }
        if (parsed.beca && typeof parsed.beca === 'object') {
          becaInfo = parsed.beca;
        }
      }

      const userId = req.user?.id || 1;

      // 1. Procesar Beca si existe
      if (becaInfo && becaInfo.es_becado) {
        const porcentaje = becaInfo.porcentaje_beca || 100;
        const tipo = becaInfo.tipo_beca || 'becado (carga JSON)';
        const exoneradas = Array.isArray(becaInfo.cuotas_exoneradas) ? becaInfo.cuotas_exoneradas.map(Number) : [];

        await client.query(`
          UPDATE matricula
          SET es_becado = true, porcentaje_beca = $1, tipo_beca = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [porcentaje, tipo, matricula_id]);

        // Asegurar que existan las mensualidades
        const matInfo = await client.query(`
          SELECT m.periodo_academico_id, g.nivel_academico_id
          FROM matricula m
          JOIN paralelo p ON p.id = m.paralelo_id
          JOIN grado g ON g.id = p.grado_id
          WHERE m.id = $1
        `, [matricula_id]);

        if (matInfo.rows.length > 0) {
          const { periodo_academico_id, nivel_academico_id } = matInfo.rows[0];
          const costoRes = await client.query(`
            SELECT monto_base FROM costo_mensualidad
            WHERE periodo_academico_id = $1 AND nivel_academico_id = $2 AND activo = true LIMIT 1
          `, [periodo_academico_id, nivel_academico_id]);
          const montoBase = costoRes.rows[0]?.monto_base || 330;

          for (let i = 1; i <= 10; i++) {
            const existe = await client.query(`SELECT id FROM mensualidad WHERE matricula_id = $1 AND numero_cuota = $2`, [matricula_id, i]);
            if (existe.rows.length === 0) {
              const mesNombre = MESES_CUOTA[i - 1];
              const fechaVencimiento = new Date(new Date().getFullYear(), i + 1, 10);
              await client.query(`
                INSERT INTO mensualidad (matricula_id, numero_cuota, mes_correspondiente, fecha_vencimiento, monto_original, monto_beca, monto_recargo, monto_final, estado)
                VALUES ($1, $2, $3, $4, $5, 0, 0, $5, 'pendiente')
              `, [matricula_id, i, mesNombre, fechaVencimiento, montoBase]);
            }
          }

          // Aplicar exoneraciones
          for (const numCuota of exoneradas) {
            await client.query(`
              UPDATE mensualidad
              SET monto_beca = monto_original, monto_final = 0, estado = 'cancelado',
                  observaciones = 'Exonerado por beca (JSON)', updated_at = CURRENT_TIMESTAMP
              WHERE matricula_id = $1 AND numero_cuota = $2
            `, [matricula_id, numCuota]);
          }
        }
      }

      // 2. Procesar Pagos
      const pagosProcesados = [];
      const matInfo = await client.query(`
        SELECT m.periodo_academico_id, g.nivel_academico_id
        FROM matricula m
        JOIN paralelo p ON p.id = m.paralelo_id
        JOIN grado g ON g.id = p.grado_id
        WHERE m.id = $1
      `, [matricula_id]);

      const periodoId = matInfo.rows[0]?.periodo_academico_id;
      const nivelId = matInfo.rows[0]?.nivel_academico_id;
      const costoRes = await client.query(`
        SELECT monto_base FROM costo_mensualidad
        WHERE periodo_academico_id = $1 AND nivel_academico_id = $2 AND activo = true LIMIT 1
      `, [periodoId, nivelId]);
      const montoBaseCurso = costoRes.rows[0]?.monto_base || 330;

      const pagosListAplanada = aplanarPagosJson(pagosList, montoBaseCurso);

      for (const p of pagosListAplanada) {
        const numCuota = p.numero_cuota;
        if (!numCuota || numCuota < 1 || numCuota > 10) continue;

        const monto = Number(p.monto !== undefined ? p.monto : montoBaseCurso);
        const metodoPago = p.metodo_pago || 'efectivo';
        const numComprobante = p.numero_comprobante ? String(p.numero_comprobante).trim() : null;
        const numFactura = p.numero_factura ? String(p.numero_factura).trim() : null;
        const entFactura = !!(p.entrego_factura || numFactura);
        const fechaPago = p.fecha_pago ? new Date(p.fecha_pago) : new Date(new Date().getFullYear(), numCuota, 10);
        const obs = p.observaciones || 'Migrado vía JSON';

        // Asegurar mensualidad
        let mensRes = await client.query(`SELECT id, monto_final FROM mensualidad WHERE matricula_id = $1 AND numero_cuota = $2`, [matricula_id, numCuota]);
        let mensualidadId;

        if (mensRes.rows.length === 0) {
          const mesNombre = MESES_CUOTA[numCuota - 1] || `Cuota ${numCuota}`;
          const fechaVencimiento = new Date(new Date().getFullYear(), numCuota + 1, 10);
          const nuevaM = await client.query(`
            INSERT INTO mensualidad (matricula_id, numero_cuota, mes_correspondiente, fecha_vencimiento, monto_original, monto_beca, monto_recargo, monto_final, estado)
            VALUES ($1, $2, $3, $4, $5, 0, 0, $5, 'pendiente')
            RETURNING id, monto_final
          `, [matricula_id, numCuota, mesNombre, fechaVencimiento, monto]);
          mensualidadId = nuevaM.rows[0].id;
        } else {
          mensualidadId = mensRes.rows[0].id;
        }

        // Evitar duplicar si ya tiene un pago idéntico
        const pagoExiste = await client.query(`
          SELECT id FROM pago_mensualidad 
          WHERE mensualidad_id = $1 AND anulado = false LIMIT 1
        `, [mensualidadId]);

        let pagoGuardado;
        if (pagoExiste.rows.length > 0) {
          // Actualizar pago existente
          const updPago = await client.query(`
            UPDATE pago_mensualidad
            SET monto_pagado = $1, metodo_pago = $2, numero_comprobante = $3,
                entrego_factura = $4, numero_factura = $5, fecha_pago = $6,
                observaciones = $7, updated_at = CURRENT_TIMESTAMP
            WHERE id = $8
            RETURNING *
          `, [monto, metodoPago, numComprobante, entFactura, numFactura, fechaPago, obs, pagoExiste.rows[0].id]);
          pagoGuardado = updPago.rows[0];
        } else {
          // Insertar nuevo pago
          const codigoPago = `HIST-JSON-${matricula_id}-${numCuota}-${Date.now().toString(36).toUpperCase()}`;
          const insPago = await client.query(`
            INSERT INTO pago_mensualidad
              (codigo_pago, mensualidad_id, monto_pagado, metodo_pago, numero_comprobante,
               entrego_factura, numero_factura, fecha_pago, registrado_por, observaciones)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
          `, [codigoPago, mensualidadId, monto, metodoPago, numComprobante, entFactura, numFactura, fechaPago, userId, obs]);
          pagoGuardado = insPago.rows[0];
        }

        await client.query(`UPDATE mensualidad SET estado = 'pagado', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [mensualidadId]);
        pagosProcesados.push(pagoGuardado);
      }

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        message: `JSON procesado: ${pagosProcesados.length} pagos registrados ${becaInfo ? 'y beca configurada' : ''}`,
        data: {
          pagos: pagosProcesados,
          beca: becaInfo
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al importar JSON de estudiante:', error);
      res.status(500).json({ success: false, message: 'Error interno al procesar JSON: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Importa un JSON de curso completo con múltiples estudiantes
   */
  static async importarJsonCurso(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { paralelo_id, periodo_academico_id, json_data } = req.body;

      if (!paralelo_id || !json_data) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'paralelo_id y json_data son requeridos' });
      }

      let parsed = json_data;
      if (typeof json_data === 'string') {
        try {
          parsed = JSON.parse(json_data);
        } catch (e) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'El JSON tiene errores de sintaxis' });
        }
      }

      const estudiantesJson = Array.isArray(parsed) ? parsed : (parsed.estudiantes || []);
      if (estudiantesJson.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'No se encontraron estudiantes en el JSON' });
      }

      let periodoId = periodo_academico_id || parsed.periodo_academico_id;
      if (!periodoId) {
        const perRes = await client.query(`SELECT id FROM periodo_academico WHERE estado = 'abierto' OR estado = 'activo' ORDER BY id DESC LIMIT 1`);
        periodoId = perRes.rows[0]?.id;
      }

      // Obtener costo base del nivel del curso
      const paraleloInfoRes = await client.query(`
        SELECT g.nivel_academico_id
        FROM paralelo p
        JOIN grado g ON g.id = p.grado_id
        WHERE p.id = $1
      `, [paralelo_id]);
      const nivelId = paraleloInfoRes.rows[0]?.nivel_academico_id;
      const costoRes = await client.query(`
        SELECT monto_base FROM costo_mensualidad
        WHERE periodo_academico_id = $1 AND nivel_academico_id = $2 AND activo = true LIMIT 1
      `, [periodoId, nivelId]);
      const montoBaseCurso = costoRes.rows[0]?.monto_base || 330;

      // Obtener matrículas del curso
      const matriculasRes = await client.query(`
        SELECT m.id AS matricula_id, e.id AS estudiante_id, e.ci, e.nombres, e.apellido_paterno, e.apellido_materno
        FROM matricula m
        JOIN estudiante e ON e.id = m.estudiante_id
        WHERE m.paralelo_id = $1 AND m.periodo_academico_id = $2 AND m.deleted_at IS NULL AND m.estado = 'activo'
      `, [paralelo_id, periodoId]);

      const matriculasMapByCi = {};
      const matriculasList = matriculasRes.rows;
      for (const m of matriculasList) {
        if (m.ci) matriculasMapByCi[String(m.ci).trim()] = m;
      }

      let totalEstudiantesProcesados = 0;
      let totalPagosRegistrados = 0;
      const userId = req.user?.id || 1;

      for (const estJson of estudiantesJson) {
        let matEncontrada = null;
        if (estJson.ci && matriculasMapByCi[String(estJson.ci).trim()]) {
          matEncontrada = matriculasMapByCi[String(estJson.ci).trim()];
        } else if (estJson.nombre) {
          // Buscar por coincidencia aproximada de nombre
          const nomClean = String(estJson.nombre).toLowerCase().replace(/\s+/g, ' ').trim();
          matEncontrada = matriculasList.find(m => {
            const fullName = `${m.apellido_paterno} ${m.apellido_materno || ''} ${m.nombres}`.toLowerCase().replace(/\s+/g, ' ').trim();
            const fullNameInv = `${m.nombres} ${m.apellido_paterno} ${m.apellido_materno || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
            return nomClean.includes(m.apellido_paterno.toLowerCase()) && nomClean.includes(m.nombres.toLowerCase())
                || fullName === nomClean || fullNameInv === nomClean;
          });
        }

        if (!matEncontrada) continue;

        const matriculaId = matEncontrada.matricula_id;

        // Procesar beca si existe
        if (estJson.beca && estJson.beca.es_becado) {
          const exoneradas = Array.isArray(estJson.beca.cuotas_exoneradas) ? estJson.beca.cuotas_exoneradas.map(Number) : [];
          await client.query(`
            UPDATE matricula SET es_becado = true, porcentaje_beca = $1, tipo_beca = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3
          `, [estJson.beca.porcentaje_beca || 100, estJson.beca.tipo_beca || 'becado', matriculaId]);

          for (const numCuota of exoneradas) {
            await client.query(`
              UPDATE mensualidad SET monto_beca = monto_original, monto_final = 0, estado = 'cancelado', observaciones = 'Exonerado por beca (JSON Curso)' WHERE matricula_id = $1 AND numero_cuota = $2
            `, [matriculaId, numCuota]);
          }
        }

        // Procesar pagos aplanados (cuota simple, pagos múltiples o pago anual)
        const pagosAplanados = aplanarPagosJson(estJson.pagos || [], montoBaseCurso);
        for (const p of pagosAplanados) {
          const numCuota = p.numero_cuota;
          if (!numCuota || numCuota < 1 || numCuota > 10) continue;

          const monto = Number(p.monto !== undefined ? p.monto : montoBaseCurso);
          const metodoPago = p.metodo_pago || 'efectivo';
          const numComp = p.numero_comprobante ? String(p.numero_comprobante).trim() : null;
          const numFact = p.numero_factura ? String(p.numero_factura).trim() : null;
          const entFact = !!(p.entrego_factura || numFact);
          const fechaPago = p.fecha_pago ? new Date(p.fecha_pago) : new Date(new Date().getFullYear(), numCuota, 10);
          const obs = p.observaciones || 'Migrado JSON Curso';

          // Mensualidad
          let mensRes = await client.query(`SELECT id FROM mensualidad WHERE matricula_id = $1 AND numero_cuota = $2`, [matriculaId, numCuota]);
          let mensualidadId;
          if (mensRes.rows.length === 0) {
            const mesNombre = MESES_CUOTA[numCuota - 1] || `Cuota ${numCuota}`;
            const fechaVencimiento = new Date(new Date().getFullYear(), numCuota + 1, 10);
            const nuevaM = await client.query(`
              INSERT INTO mensualidad (matricula_id, numero_cuota, mes_correspondiente, fecha_vencimiento, monto_original, monto_beca, monto_recargo, monto_final, estado)
              VALUES ($1, $2, $3, $4, $5, 0, 0, $5, 'pendiente')
              RETURNING id
            `, [matriculaId, numCuota, mesNombre, fechaVencimiento, monto]);
            mensualidadId = nuevaM.rows[0].id;
          } else {
            mensualidadId = mensRes.rows[0].id;
          }

          const existePago = await client.query(`SELECT id FROM pago_mensualidad WHERE mensualidad_id = $1 AND anulado = false LIMIT 1`, [mensualidadId]);
          if (existePago.rows.length > 0) {
            await client.query(`
              UPDATE pago_mensualidad SET monto_pagado = $1, metodo_pago = $2, numero_comprobante = $3, entrego_factura = $4, numero_factura = $5, fecha_pago = $6, observaciones = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8
            `, [monto, metodoPago, numComp, entFact, numFact, fechaPago, obs, existePago.rows[0].id]);
          } else {
            const codigoPago = `HIST-JSON-${matriculaId}-${numCuota}-${Date.now().toString(36).toUpperCase()}`;
            await client.query(`
              INSERT INTO pago_mensualidad (codigo_pago, mensualidad_id, monto_pagado, metodo_pago, numero_comprobante, entrego_factura, numero_factura, fecha_pago, registrado_por, observaciones)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [codigoPago, mensualidadId, monto, metodoPago, numComp, entFact, numFact, fechaPago, userId, obs]);
          }

          await client.query(`UPDATE mensualidad SET estado = 'pagado', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [mensualidadId]);
          totalPagosRegistrados++;
        }

        totalEstudiantesProcesados++;
      }

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        message: `Curso importado exitosamente: ${totalEstudiantesProcesados} estudiantes y ${totalPagosRegistrados} pagos registrados`,
        data: {
          estudiantes_procesados: totalEstudiantesProcesados,
          pagos_registrados: totalPagosRegistrados
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al importar JSON de curso:', error);
      res.status(500).json({ success: false, message: 'Error al importar JSON de curso: ' + error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene la lista de mensualidades observadas, sin documento o pendientes
   * con soporte de filtros por periodo, nivel, grado, paralelo, tipo y búsqueda de texto.
   */
  static async obtenerObservadasYPendientes(req, res) {
    const client = await pool.connect();
    try {
      const {
        periodo_academico_id,
        nivel_id,
        grado_id,
        paralelo_id,
        tipo = 'todos', // 'todos' | 'sin_documento' | 'pendientes' | 'parciales' | 'con_observacion'
        search = ''
      } = req.query;

      let whereConditions = [
        'mat.estado = \'activo\'',
        'mat.deleted_at IS NULL'
      ];
      let queryParams = [];
      let paramCounter = 1;

      if (periodo_academico_id) {
        whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
        queryParams.push(Number(periodo_academico_id));
        paramCounter++;
      } else {
        const pActivo = await client.query('SELECT id FROM periodo_academico WHERE activo = true LIMIT 1');
        if (pActivo.rows.length > 0) {
          whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
          queryParams.push(pActivo.rows[0].id);
          paramCounter++;
        }
      }

      if (nivel_id) {
        whereConditions.push(`g.nivel_academico_id = $${paramCounter}`);
        queryParams.push(Number(nivel_id));
        paramCounter++;
      }

      if (grado_id) {
        whereConditions.push(`g.id = $${paramCounter}`);
        queryParams.push(Number(grado_id));
        paramCounter++;
      }

      if (paralelo_id) {
        whereConditions.push(`p.id = $${paramCounter}`);
        queryParams.push(Number(paralelo_id));
        paramCounter++;
      }

      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        whereConditions.push(`(
          e.nombres ILIKE $${paramCounter} OR
          e.apellidos ILIKE $${paramCounter} OR
          e.ci ILIKE $${paramCounter} OR
          e.codigo ILIKE $${paramCounter} OR
          pm.numero_comprobante ILIKE $${paramCounter} OR
          pm.numero_factura ILIKE $${paramCounter}
        )`);
        queryParams.push(term);
        paramCounter++;
      }

      // Condición de observación: SOLO registros que tengan alguna observación o documento pendiente
      // Excluyendo explícitamente cuotas exoneradas por beca ("Exonerado por beca (carga histórica)") y canceladas por beca
      whereConditions.push(`(m.observaciones IS NULL OR (m.observaciones NOT ILIKE '%Exonerado por beca%' AND m.observaciones NOT ILIKE '%beca%'))`);
      whereConditions.push(`(pm.observaciones IS NULL OR (pm.observaciones NOT ILIKE '%Exonerado por beca%' AND pm.observaciones NOT ILIKE '%beca%'))`);
      whereConditions.push(`m.estado != 'cancelado'`);

      let filtroTipoSql = '';
      if (tipo === 'sin_documento') {
        filtroTipoSql = `AND (
          pm.id IS NOT NULL AND NOT pm.anulado AND
          (pm.numero_comprobante IS NULL OR pm.numero_comprobante = '') AND
          (pm.numero_factura IS NULL OR pm.numero_factura = '')
        )`;
      } else if (tipo === 'con_nota') {
        filtroTipoSql = `AND (
          (pm.observaciones IS NOT NULL AND TRIM(pm.observaciones) != '' AND pm.observaciones NOT ILIKE 'Migrado vía JSON') OR
          (m.observaciones IS NOT NULL AND TRIM(m.observaciones) != '')
        )`;
      } else {
        // 'todos': únicamente los observados o sin comprobante/factura, sin cuotas normales sin deuda ni becas
        filtroTipoSql = `AND (
          (pm.id IS NOT NULL AND NOT pm.anulado AND (pm.numero_comprobante IS NULL OR pm.numero_comprobante = '') AND (pm.numero_factura IS NULL OR pm.numero_factura = '')) OR
          (pm.observaciones IS NOT NULL AND TRIM(pm.observaciones) != '' AND pm.observaciones NOT ILIKE 'Migrado vía JSON') OR
          (m.observaciones IS NOT NULL AND TRIM(m.observaciones) != '')
        )`;
      }

      const query = `
        SELECT
          m.id AS mensualidad_id,
          m.numero_cuota,
          m.mes_correspondiente,
          m.fecha_vencimiento,
          m.monto_original,
          m.monto_beca,
          m.monto_recargo,
          m.monto_final,
          m.estado AS mensualidad_estado,
          m.observaciones AS mensualidad_observaciones,
          mat.id AS matricula_id,
          mat.periodo_academico_id,
          mat.es_becado,
          mat.porcentaje_beca,
          e.id AS estudiante_id,
          e.codigo AS estudiante_codigo,
          e.ci AS estudiante_ci,
          e.nombres AS estudiante_nombres,
          e.apellido_paterno AS estudiante_apellido_paterno,
          e.apellido_materno AS estudiante_apellido_materno,
          e.apellidos AS estudiante_apellidos,
          TRIM(CONCAT(COALESCE(e.apellidos, CONCAT(e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''))), ' ', e.nombres)) AS estudiante_nombre_completo,
          p.id AS paralelo_id,
          p.nombre AS paralelo_nombre,
          g.id AS grado_id,
          g.nombre AS grado_nombre,
          n.id AS nivel_id,
          n.nombre AS nivel_nombre,
          pm.id AS pago_id,
          pm.codigo_pago,
          pm.monto_pagado,
          pm.metodo_pago,
          pm.numero_comprobante,
          pm.entrego_factura,
          pm.numero_factura,
          pm.fecha_pago,
          pm.observaciones AS pago_observaciones,
          pm.anulado AS pago_anulado,
          CASE
            WHEN pm.id IS NOT NULL AND (pm.numero_comprobante IS NULL OR pm.numero_comprobante = '') AND (pm.numero_factura IS NULL OR pm.numero_factura = '') THEN 'sin_documento'
            WHEN pm.observaciones ILIKE '%pendiente%' OR pm.observaciones ILIKE '%confirmar%' THEN 'comprobante_por_confirmar'
            ELSE 'observacion_general'
          END AS tipo_observacion
        FROM mensualidad m
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        INNER JOIN estudiante e ON mat.estudiante_id = e.id
        INNER JOIN paralelo p ON mat.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        LEFT JOIN nivel_academico n ON g.nivel_academico_id = n.id
        LEFT JOIN pago_mensualidad pm ON m.id = pm.mensualidad_id AND NOT pm.anulado
        WHERE ${whereConditions.join(' AND ')}
        ${filtroTipoSql}
        ORDER BY g.id ASC, p.nombre ASC, e.apellidos ASC, e.nombres ASC, m.numero_cuota ASC
      `;

      const result = await client.query(query, queryParams);
      const items = result.rows;

      // Calcular métricas
      const metricas = {
        total: items.length,
        sin_documento: items.filter(r => r.tipo_observacion === 'sin_documento' || r.tipo_observacion === 'comprobante_por_confirmar').length,
        con_nota: items.filter(r => (r.pago_observaciones && r.pago_observaciones !== 'Migrado vía JSON' && !r.pago_observaciones.includes('Exonerado por beca')) || (r.mensualidad_observaciones && !r.mensualidad_observaciones.includes('Exonerado por beca'))).length,
        monto_total_observado: items.reduce((sum, r) => sum + Number(r.monto_final || 0), 0),
        monto_pagado_observado: items.reduce((sum, r) => sum + Number(r.monto_pagado || 0), 0)
      };

      res.status(200).json({
        success: true,
        data: {
          items,
          metricas
        }
      });
    } catch (error) {
      console.error('Error al obtener mensualidades observadas y pendientes:', error);
      res.status(500).json({ success: false, message: 'Error al obtener datos: ' + error.message });
    } finally {
      client.release();
    }
  }
}
