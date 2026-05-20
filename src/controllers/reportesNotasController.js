// controllers/reportesNotasController.js
import { pool }         from '../db/pool.js';
import PDFGenerator     from '../services/reportes/pdfGenerator.js';
import ExcelGenerator   from '../services/reportes/excelGenerator.js';
import { formatearFecha } from '../services/reportes/reportStyles.js';

class ReportesNotasController {

  // ══════════════════════════════════════════════
  // HELPER PRIVADO: cabecera de asignación
  // ══════════════════════════════════════════════
  static async _getCabecera(asignacion_docente_id) {
    const r = await pool.query(`
      SELECT
        mat.nombre   AS materia_nombre,
        mat.codigo   AS materia_codigo,
        g.nombre     AS grado_nombre,
        n.nombre     AS nivel_nombre,
        par.nombre   AS paralelo_nombre,
        par.aula,
        t.nombre     AS turno_nombre,
        pa.nombre    AS periodo_nombre,
        pa.id        AS periodo_academico_id,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente_nombre
      FROM asignacion_docente ad
      INNER JOIN grado_materia gm     ON ad.grado_materia_id    = gm.id
      INNER JOIN materia mat          ON gm.materia_id           = mat.id
      INNER JOIN paralelo par         ON ad.paralelo_id          = par.id
      INNER JOIN grado g              ON par.grado_id            = g.id
      INNER JOIN nivel_academico n    ON g.nivel_academico_id    = n.id
      INNER JOIN turno t              ON par.turno_id            = t.id
      INNER JOIN periodo_academico pa ON ad.periodo_academico_id = pa.id
      INNER JOIN docente d            ON ad.docente_id           = d.id
      WHERE ad.id = $1
    `, [asignacion_docente_id]);
    return r.rows[0] ?? null;
  }

  // ══════════════════════════════════════════════
  // 1️⃣  BOLETÍN DE NOTAS (clase completa)
  //     GET /api/reportes/notas/boletin
  //     ?asignacion_docente_id=X&periodo_evaluacion_id=Y&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reporteBoletin(req, res) {
    try {
      const { asignacion_docente_id, periodo_evaluacion_id, formato = 'pdf' } = req.query;
      if (!asignacion_docente_id || !periodo_evaluacion_id)
        return res.status(400).json({ success: false, message: 'Se requiere asignacion_docente_id y periodo_evaluacion_id' });

      const cabecera = await ReportesNotasController._getCabecera(asignacion_docente_id);
      if (!cabecera) return res.status(404).json({ success: false, message: 'Asignación no encontrada' });

      // Período de evaluación
      const peRes = await pool.query(
        `SELECT * FROM periodo_evaluacion WHERE id = $1`, [periodo_evaluacion_id]
      );
      const periodo_eval = peRes.rows[0];

      // Dimensiones activas
      const dimRes = await pool.query(
        `SELECT * FROM dimension_evaluacion WHERE activo = true ORDER BY orden`
      );
      const dimensiones = dimRes.rows;

      // Notas por estudiante × dimensión
      const notasRes = await pool.query(`
        SELECT
          m.id                 AS matricula_id,
          e.codigo             AS estudiante_codigo,
          e.nombres            AS estudiante_nombres,
          e.apellidos          AS estudiante_apellidos,
          de.codigo            AS dimension_codigo,
          de.nombre            AS dimension_nombre,
          de.porcentaje_ponderacion,
          nd.nota_promedio,
          cp.nota_final,
          cp.aprobado,
          cp.estado            AS estado_periodo,
          gm.nota_minima_aprobacion
        FROM asignacion_docente ad
        INNER JOIN matricula m
          ON  m.paralelo_id          = ad.paralelo_id
          AND m.periodo_academico_id = ad.periodo_academico_id
          AND m.estado = 'activo' AND m.deleted_at IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        CROSS JOIN dimension_evaluacion de
        LEFT JOIN nota_dimension nd
          ON  nd.matricula_id            = m.id
          AND nd.grado_materia_id        = ad.grado_materia_id
          AND nd.periodo_evaluacion_id   = $2
          AND nd.dimension_evaluacion_id = de.id
        LEFT JOIN calificacion_periodo cp
          ON  cp.matricula_id          = m.id
          AND cp.grado_materia_id      = ad.grado_materia_id
          AND cp.periodo_evaluacion_id = $2
        INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
        WHERE ad.id = $1 AND de.activo = true
        ORDER BY e.apellidos, e.nombres, de.orden
      `, [asignacion_docente_id, periodo_evaluacion_id]);

      // Agrupar por estudiante
      const porEstudiante = {};
      for (const fila of notasRes.rows) {
        const key = fila.matricula_id;
        if (!porEstudiante[key]) {
          porEstudiante[key] = {
            matricula_id:        key,
            codigo:              fila.estudiante_codigo,
            nombres:             fila.estudiante_nombres,
            apellidos:           fila.estudiante_apellidos,
            nota_final:          fila.nota_final,
            aprobado:            fila.aprobado,
            nota_minima:         fila.nota_minima_aprobacion,
            dimensiones:         {},
          };
        }
        porEstudiante[key].dimensiones[fila.dimension_codigo] = {
          nota:       fila.nota_promedio,
          porcentaje: fila.porcentaje_ponderacion,
        };
      }

      const estudiantes = Object.values(porEstudiante);

      // Estadísticas
      const aprobados  = estudiantes.filter(e => e.aprobado === true).length;
      const reprobados = estudiantes.filter(e => e.aprobado === false).length;
      const promedio   = estudiantes.length > 0
        ? Math.round(estudiantes.reduce((a, e) => a + Number(e.nota_final ?? 0), 0) / estudiantes.length * 10) / 10
        : 0;

      const data = { cabecera, periodo_eval, dimensiones, estudiantes, stats: { aprobados, reprobados, promedio, total: estudiantes.length } };

      return formato === 'excel'
        ? ReportesNotasController._excelBoletin(res, data)
        : ReportesNotasController._pdfBoletin(res, data);

    } catch (error) {
      console.error('Error reporte boletín:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 2️⃣  REPORTE POR EVALUACIÓN
  //     GET /api/reportes/notas/evaluacion
  //     ?evaluacion_id=X&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reporteEvaluacion(req, res) {
    try {
      const { evaluacion_id, formato = 'pdf' } = req.query;
      if (!evaluacion_id)
        return res.status(400).json({ success: false, message: 'Se requiere evaluacion_id' });

      // Datos de la evaluación
      const evRes = await pool.query(`
        SELECT ev.*, de.nombre AS dimension_nombre, de.codigo AS dimension_codigo,
               de.color AS dimension_color, de.porcentaje_ponderacion,
               pe.nombre AS periodo_nombre, pe.orden AS periodo_orden,
               mat.nombre AS materia_nombre, mat.codigo AS materia_codigo,
               CONCAT(d.nombres, ' ', d.apellidos) AS docente_nombre,
               g.nombre AS grado_nombre, n.nombre AS nivel_nombre,
               par.nombre AS paralelo_nombre
        FROM evaluacion ev
        INNER JOIN dimension_evaluacion de ON ev.dimension_evaluacion_id = de.id
        INNER JOIN periodo_evaluacion pe   ON ev.periodo_evaluacion_id   = pe.id
        INNER JOIN asignacion_docente ad   ON ev.asignacion_docente_id   = ad.id
        INNER JOIN grado_materia gm        ON ad.grado_materia_id        = gm.id
        INNER JOIN materia mat             ON gm.materia_id              = mat.id
        INNER JOIN paralelo par            ON ad.paralelo_id             = par.id
        INNER JOIN grado g                 ON par.grado_id               = g.id
        INNER JOIN nivel_academico n       ON g.nivel_academico_id       = n.id
        INNER JOIN docente d               ON ad.docente_id              = d.id
        WHERE ev.id = $1
      `, [evaluacion_id]);

      if (evRes.rows.length === 0)
        return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });

      const evaluacion = evRes.rows[0];

      // Notas de todos los estudiantes
      const notasRes = await pool.query(`
        SELECT
          m.id        AS matricula_id,
          e.codigo    AS estudiante_codigo,
          e.nombres   AS estudiante_nombres,
          e.apellidos AS estudiante_apellidos,
          c.puntaje_obtenido,
          c.esta_ausente,
          c.observacion,
          c.fecha_registro,
          CASE
            WHEN c.puntaje_obtenido IS NOT NULL AND ev.puntaje_maximo > 0
            THEN ROUND((c.puntaje_obtenido / ev.puntaje_maximo * 100)::NUMERIC, 1)
            ELSE NULL
          END AS nota_sobre_100
        FROM asignacion_docente ad
        INNER JOIN matricula m
          ON m.paralelo_id = ad.paralelo_id AND m.periodo_academico_id = ad.periodo_academico_id
          AND m.estado = 'activo' AND m.deleted_at IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        LEFT JOIN calificacion c ON c.matricula_id = m.id AND c.evaluacion_id = $1
        INNER JOIN evaluacion ev ON ev.id = $1
        WHERE ad.id = ev.asignacion_docente_id
        ORDER BY e.apellidos, e.nombres
      `, [evaluacion_id]);

      const lista = notasRes.rows;
      const conNota   = lista.filter(r => r.puntaje_obtenido !== null && !r.esta_ausente).length;
      const ausentes  = lista.filter(r => r.esta_ausente).length;
      const sinNota   = lista.length - conNota - ausentes;
      const promedio  = conNota > 0
        ? Math.round(lista.filter(r => r.nota_sobre_100 !== null && !r.esta_ausente)
            .reduce((a, r) => a + Number(r.nota_sobre_100), 0) / conNota * 10) / 10
        : 0;
      const aprobados = lista.filter(r => Number(r.nota_sobre_100) >= 51).length;

      const data = { evaluacion, lista, stats: { total: lista.length, conNota, ausentes, sinNota, promedio, aprobados } };

      return formato === 'excel'
        ? ReportesNotasController._excelEvaluacion(res, data)
        : ReportesNotasController._pdfEvaluacion(res, data);

    } catch (error) {
      console.error('Error reporte evaluación:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 3️⃣  REPORTE POR DIMENSIÓN
  //     GET /api/reportes/notas/dimension
  //     ?asignacion_docente_id=X&periodo_evaluacion_id=Y&dimension_id=Z&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reporteDimension(req, res) {
    try {
      const { asignacion_docente_id, periodo_evaluacion_id, dimension_id, formato = 'pdf' } = req.query;
      if (!asignacion_docente_id || !periodo_evaluacion_id || !dimension_id)
        return res.status(400).json({ success: false, message: 'Se requieren asignacion_docente_id, periodo_evaluacion_id y dimension_id' });

      const cabecera = await ReportesNotasController._getCabecera(asignacion_docente_id);
      if (!cabecera) return res.status(404).json({ success: false, message: 'Asignación no encontrada' });

      const dimRes = await pool.query(
        `SELECT * FROM dimension_evaluacion WHERE id = $1`, [dimension_id]
      );
      const peRes = await pool.query(
        `SELECT * FROM periodo_evaluacion WHERE id = $1`, [periodo_evaluacion_id]
      );
      if (!dimRes.rows[0]) return res.status(404).json({ success: false, message: 'Dimensión no encontrada' });

      const dimension   = dimRes.rows[0];
      const periodo_eval = peRes.rows[0];

      // Evaluaciones de esa dimensión
      const evalRes = await pool.query(`
        SELECT ev.id, ev.nombre, ev.tipo, ev.fecha, ev.puntaje_maximo, ev.peso_en_dimension
        FROM evaluacion ev
        WHERE ev.asignacion_docente_id = $1
          AND ev.periodo_evaluacion_id = $2
          AND ev.dimension_evaluacion_id = $3
          AND ev.activo = true
        ORDER BY ev.fecha, ev.nombre
      `, [asignacion_docente_id, periodo_evaluacion_id, dimension_id]);

      const evaluaciones = evalRes.rows;

      // Notas por estudiante × evaluación
      const notasRes = await pool.query(`
        SELECT
          m.id        AS matricula_id,
          e.codigo    AS estudiante_codigo,
          e.nombres   AS estudiante_nombres,
          e.apellidos AS estudiante_apellidos,
          ev.id       AS evaluacion_id,
          ev.nombre   AS evaluacion_nombre,
          ev.puntaje_maximo,
          ev.peso_en_dimension,
          c.puntaje_obtenido,
          c.esta_ausente,
          nd.nota_promedio
        FROM asignacion_docente ad
        INNER JOIN matricula m
          ON m.paralelo_id = ad.paralelo_id AND m.periodo_academico_id = ad.periodo_academico_id
          AND m.estado = 'activo' AND m.deleted_at IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        CROSS JOIN evaluacion ev
        LEFT JOIN calificacion c ON c.matricula_id = m.id AND c.evaluacion_id = ev.id
        LEFT JOIN nota_dimension nd
          ON nd.matricula_id = m.id AND nd.grado_materia_id = ad.grado_materia_id
          AND nd.periodo_evaluacion_id = $2 AND nd.dimension_evaluacion_id = $3
        WHERE ad.id = $1
          AND ev.asignacion_docente_id = $1
          AND ev.periodo_evaluacion_id = $2
          AND ev.dimension_evaluacion_id = $3
          AND ev.activo = true
        ORDER BY e.apellidos, e.nombres, ev.fecha
      `, [asignacion_docente_id, periodo_evaluacion_id, dimension_id]);

      // Agrupar por estudiante
      const porEstudiante = {};
      for (const fila of notasRes.rows) {
        const key = fila.matricula_id;
        if (!porEstudiante[key]) {
          porEstudiante[key] = {
            matricula_id: key, codigo: fila.estudiante_codigo,
            nombres: fila.estudiante_nombres, apellidos: fila.estudiante_apellidos,
            notas: {}, nota_dimension: fila.nota_promedio,
          };
        }
        porEstudiante[key].nota_dimension = fila.nota_promedio;
        porEstudiante[key].notas[fila.evaluacion_id] = {
          puntaje: fila.puntaje_obtenido,
          ausente: fila.esta_ausente,
          sobre100: fila.puntaje_obtenido !== null && fila.puntaje_maximo > 0
            ? Math.round((fila.puntaje_obtenido / fila.puntaje_maximo) * 100 * 10) / 10
            : null,
        };
      }

      const data = { cabecera, dimension, periodo_eval, evaluaciones, estudiantes: Object.values(porEstudiante) };

      return formato === 'excel'
        ? ReportesNotasController._excelDimension(res, data)
        : ReportesNotasController._pdfDimension(res, data);

    } catch (error) {
      console.error('Error reporte dimensión:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 4️⃣  COMPARATIVO TRIMESTRAL DE NOTAS
  //     GET /api/reportes/notas/comparativo-trimestral
  //     ?asignacion_docente_id=X&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reporteComparativoTrimestral(req, res) {
    try {
      const { asignacion_docente_id, formato = 'pdf' } = req.query;
      if (!asignacion_docente_id)
        return res.status(400).json({ success: false, message: 'Se requiere asignacion_docente_id' });

      const cabecera = await ReportesNotasController._getCabecera(asignacion_docente_id);
      if (!cabecera) return res.status(404).json({ success: false, message: 'Asignación no encontrada' });

      // Todos los trimestres del período académico
      const peRes = await pool.query(`
        SELECT pe.* FROM periodo_evaluacion pe
        INNER JOIN asignacion_docente ad ON ad.periodo_academico_id = pe.periodo_academico_id
        WHERE ad.id = $1 AND pe.activo = true
        ORDER BY pe.orden
      `, [asignacion_docente_id]);

      const trimestres = peRes.rows;

      // Nota final por estudiante × trimestre
      const notasRes = await pool.query(`
        SELECT
          m.id        AS matricula_id,
          e.codigo    AS estudiante_codigo,
          e.nombres   AS estudiante_nombres,
          e.apellidos AS estudiante_apellidos,
          pe.id       AS periodo_evaluacion_id,
          pe.nombre   AS periodo_nombre,
          pe.orden    AS periodo_orden,
          cp.nota_final,
          cp.aprobado,
          nd_ser.nota_promedio  AS nota_ser,
          nd_sab.nota_promedio  AS nota_saber,
          nd_hac.nota_promedio  AS nota_hacer,
          nd_aut.nota_promedio  AS nota_auto
        FROM asignacion_docente ad
        INNER JOIN matricula m
          ON m.paralelo_id = ad.paralelo_id AND m.periodo_academico_id = ad.periodo_academico_id
          AND m.estado = 'activo' AND m.deleted_at IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        INNER JOIN periodo_evaluacion pe
          ON pe.periodo_academico_id = ad.periodo_academico_id AND pe.activo = true
        LEFT JOIN calificacion_periodo cp
          ON cp.matricula_id = m.id AND cp.grado_materia_id = ad.grado_materia_id
          AND cp.periodo_evaluacion_id = pe.id
        LEFT JOIN nota_dimension nd_ser
          ON nd_ser.matricula_id = m.id AND nd_ser.grado_materia_id = ad.grado_materia_id
          AND nd_ser.periodo_evaluacion_id = pe.id
          AND nd_ser.dimension_evaluacion_id = (SELECT id FROM dimension_evaluacion WHERE codigo='SER' LIMIT 1)
        LEFT JOIN nota_dimension nd_sab
          ON nd_sab.matricula_id = m.id AND nd_sab.grado_materia_id = ad.grado_materia_id
          AND nd_sab.periodo_evaluacion_id = pe.id
          AND nd_sab.dimension_evaluacion_id = (SELECT id FROM dimension_evaluacion WHERE codigo='SAB' LIMIT 1)
        LEFT JOIN nota_dimension nd_hac
          ON nd_hac.matricula_id = m.id AND nd_hac.grado_materia_id = ad.grado_materia_id
          AND nd_hac.periodo_evaluacion_id = pe.id
          AND nd_hac.dimension_evaluacion_id = (SELECT id FROM dimension_evaluacion WHERE codigo='HAC' LIMIT 1)
        LEFT JOIN nota_dimension nd_aut
          ON nd_aut.matricula_id = m.id AND nd_aut.grado_materia_id = ad.grado_materia_id
          AND nd_aut.periodo_evaluacion_id = pe.id
          AND nd_aut.dimension_evaluacion_id = (SELECT id FROM dimension_evaluacion WHERE codigo='AUTO' LIMIT 1)
        WHERE ad.id = $1
        ORDER BY e.apellidos, e.nombres, pe.orden
      `, [asignacion_docente_id]);

      // Agrupar por estudiante
      const porEstudiante = {};
      for (const fila of notasRes.rows) {
        if (!porEstudiante[fila.matricula_id]) {
          porEstudiante[fila.matricula_id] = {
            matricula_id: fila.matricula_id, codigo: fila.estudiante_codigo,
            nombres: fila.estudiante_nombres, apellidos: fila.estudiante_apellidos,
            trimestres: {},
          };
        }
        porEstudiante[fila.matricula_id].trimestres[fila.periodo_nombre] = {
          nota_final: fila.nota_final, aprobado: fila.aprobado,
          ser: fila.nota_ser, saber: fila.nota_saber, hacer: fila.nota_hacer, auto: fila.nota_auto,
        };
      }

      const data = { cabecera, trimestres, estudiantes: Object.values(porEstudiante) };

      return formato === 'excel'
        ? ReportesNotasController._excelComparativoTrimestral(res, data)
        : ReportesNotasController._pdfComparativoTrimestral(res, data);

    } catch (error) {
      console.error('Error reporte comparativo trimestral:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 5️⃣  REPORTE ESTUDIANTE INDIVIDUAL
  //     GET /api/reportes/notas/estudiante
  //     ?asignacion_docente_id=X&matricula_id=Y&periodo_evaluacion_id=Z&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reporteEstudianteNotas(req, res) {
    try {
      const { asignacion_docente_id, matricula_id, periodo_evaluacion_id, formato = 'pdf' } = req.query;
      if (!asignacion_docente_id || !matricula_id || !periodo_evaluacion_id)
        return res.status(400).json({ success: false, message: 'Se requieren asignacion_docente_id, matricula_id y periodo_evaluacion_id' });

      const cabecera = await ReportesNotasController._getCabecera(asignacion_docente_id);
      if (!cabecera) return res.status(404).json({ success: false, message: 'Asignación no encontrada' });

      // Datos del estudiante
      const estRes = await pool.query(`
        SELECT e.codigo, e.nombres, e.apellidos, e.ci, m.numero_matricula
        FROM matricula m INNER JOIN estudiante e ON m.estudiante_id = e.id
        WHERE m.id = $1 AND m.deleted_at IS NULL
      `, [matricula_id]);
      if (!estRes.rows[0]) return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });

      const estudiante  = estRes.rows[0];

      // Período de evaluación
      const peRes = await pool.query(`SELECT * FROM periodo_evaluacion WHERE id = $1`, [periodo_evaluacion_id]);
      const periodo_eval = peRes.rows[0];

      // Calificaciones detalladas por evaluación
      const notasRes = await pool.query(`
        SELECT
          ev.id AS evaluacion_id, ev.nombre AS evaluacion_nombre, ev.tipo,
          ev.fecha, ev.puntaje_maximo, ev.peso_en_dimension,
          de.nombre AS dimension_nombre, de.codigo AS dimension_codigo, de.color AS dimension_color,
          c.puntaje_obtenido, c.esta_ausente, c.observacion, c.fecha_registro,
          CASE WHEN c.puntaje_obtenido IS NOT NULL AND ev.puntaje_maximo > 0
            THEN ROUND((c.puntaje_obtenido / ev.puntaje_maximo * 100)::NUMERIC, 1)
            ELSE NULL
          END AS nota_sobre_100
        FROM evaluacion ev
        INNER JOIN dimension_evaluacion de ON ev.dimension_evaluacion_id = de.id
        LEFT JOIN calificacion c ON c.evaluacion_id = ev.id AND c.matricula_id = $2
        WHERE ev.asignacion_docente_id = $1 AND ev.periodo_evaluacion_id = $3 AND ev.activo = true
        ORDER BY de.orden, ev.fecha
      `, [asignacion_docente_id, matricula_id, periodo_evaluacion_id]);

      // Nota por dimensión y nota final
      const adRes = await pool.query(`SELECT grado_materia_id FROM asignacion_docente WHERE id = $1`, [asignacion_docente_id]);
      const grado_materia_id = adRes.rows[0]?.grado_materia_id;

      const ndRes = await pool.query(`
        SELECT nd.*, de.nombre AS dimension_nombre, de.codigo AS dimension_codigo,
               de.color AS dimension_color, de.porcentaje_ponderacion
        FROM nota_dimension nd
        INNER JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
        WHERE nd.matricula_id = $1 AND nd.grado_materia_id = $2 AND nd.periodo_evaluacion_id = $3
        ORDER BY de.orden
      `, [matricula_id, grado_materia_id, periodo_evaluacion_id]);

      const cpRes = await pool.query(`
        SELECT * FROM calificacion_periodo
        WHERE matricula_id = $1 AND grado_materia_id = $2 AND periodo_evaluacion_id = $3
      `, [matricula_id, grado_materia_id, periodo_evaluacion_id]);

      const data = {
        cabecera, estudiante, periodo_eval,
        evaluaciones: notasRes.rows,
        notas_dimension: ndRes.rows,
        calificacion_periodo: cpRes.rows[0] ?? null,
      };

      return formato === 'excel'
        ? ReportesNotasController._excelEstudianteNotas(res, data)
        : ReportesNotasController._pdfEstudianteNotas(res, data);

    } catch (error) {
      console.error('Error reporte estudiante notas:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 6️⃣  RESUMEN GENERAL CLASE
  //     GET /api/reportes/notas/resumen-clase
  //     ?asignacion_docente_id=X&periodo_evaluacion_id=Y&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reporteResumenClase(req, res) {
    try {
      const { asignacion_docente_id, periodo_evaluacion_id, formato = 'pdf' } = req.query;
      if (!asignacion_docente_id || !periodo_evaluacion_id)
        return res.status(400).json({ success: false, message: 'Se requieren asignacion_docente_id y periodo_evaluacion_id' });

      const cabecera = await ReportesNotasController._getCabecera(asignacion_docente_id);
      if (!cabecera) return res.status(404).json({ success: false, message: 'Asignación no encontrada' });

      const peRes = await pool.query(`SELECT * FROM periodo_evaluacion WHERE id = $1`, [periodo_evaluacion_id]);
      const periodo_eval = peRes.rows[0];

      // Resumen: nota final + dimensiones de cada estudiante
      const resumenRes = await pool.query(`
        SELECT
          m.id        AS matricula_id,
          e.codigo    AS estudiante_codigo,
          e.nombres   AS estudiante_nombres,
          e.apellidos AS estudiante_apellidos,
          cp.nota_final, cp.aprobado, cp.estado AS estado_periodo,
          gm.nota_minima_aprobacion,
          nd_ser.nota_promedio AS nota_ser,
          nd_sab.nota_promedio AS nota_saber,
          nd_hac.nota_promedio AS nota_hacer,
          nd_aut.nota_promedio AS nota_auto
        FROM asignacion_docente ad
        INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
        INNER JOIN matricula m
          ON m.paralelo_id = ad.paralelo_id AND m.periodo_academico_id = ad.periodo_academico_id
          AND m.estado = 'activo' AND m.deleted_at IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        LEFT JOIN calificacion_periodo cp
          ON cp.matricula_id = m.id AND cp.grado_materia_id = ad.grado_materia_id
          AND cp.periodo_evaluacion_id = $2
        LEFT JOIN nota_dimension nd_ser
          ON nd_ser.matricula_id = m.id AND nd_ser.grado_materia_id = ad.grado_materia_id
          AND nd_ser.periodo_evaluacion_id = $2
          AND nd_ser.dimension_evaluacion_id = (SELECT id FROM dimension_evaluacion WHERE codigo='SER' LIMIT 1)
        LEFT JOIN nota_dimension nd_sab
          ON nd_sab.matricula_id = m.id AND nd_sab.grado_materia_id = ad.grado_materia_id
          AND nd_sab.periodo_evaluacion_id = $2
          AND nd_sab.dimension_evaluacion_id = (SELECT id FROM dimension_evaluacion WHERE codigo='SAB' LIMIT 1)
        LEFT JOIN nota_dimension nd_hac
          ON nd_hac.matricula_id = m.id AND nd_hac.grado_materia_id = ad.grado_materia_id
          AND nd_hac.periodo_evaluacion_id = $2
          AND nd_hac.dimension_evaluacion_id = (SELECT id FROM dimension_evaluacion WHERE codigo='HAC' LIMIT 1)
        LEFT JOIN nota_dimension nd_aut
          ON nd_aut.matricula_id = m.id AND nd_aut.grado_materia_id = ad.grado_materia_id
          AND nd_aut.periodo_evaluacion_id = $2
          AND nd_aut.dimension_evaluacion_id = (SELECT id FROM dimension_evaluacion WHERE codigo='AUTO' LIMIT 1)
        WHERE ad.id = $1
        ORDER BY e.apellidos, e.nombres
      `, [asignacion_docente_id, periodo_evaluacion_id]);

      const lista = resumenRes.rows;
      const aprobados  = lista.filter(r => r.aprobado === true).length;
      const reprobados = lista.filter(r => r.aprobado === false).length;
      const sinNota    = lista.filter(r => r.nota_final === null).length;
      const promedio   = lista.filter(r => r.nota_final !== null).length > 0
        ? Math.round(lista.filter(r => r.nota_final !== null)
            .reduce((a, r) => a + Number(r.nota_final), 0)
            / lista.filter(r => r.nota_final !== null).length * 10) / 10
        : 0;

      const data = { cabecera, periodo_eval, lista, stats: { total: lista.length, aprobados, reprobados, sinNota, promedio } };

      return formato === 'excel'
        ? ReportesNotasController._excelResumenClase(res, data)
        : ReportesNotasController._pdfResumenClase(res, data);

    } catch (error) {
      console.error('Error reporte resumen clase:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — BOLETÍN
  // ══════════════════════════════════════════════
  static _pdfBoletin(res, { cabecera, periodo_eval, dimensiones, estudiantes, stats }) {
    const pdf = new PDFGenerator({ margin: 40, landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=boletin-${cabecera.materia_codigo}-T${periodo_eval?.orden ?? ''}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader('BOLETÍN DE NOTAS', `${cabecera.nivel_nombre} — ${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre}`);
    pdf.drawInfoBox([
      { label: 'Docente',    value: cabecera.docente_nombre },
      { label: 'Período',    value: cabecera.periodo_nombre },
      { label: 'Trimestre',  value: periodo_eval?.nombre ?? '—' },
      { label: 'Materia',    value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
    ], 2);

    pdf.drawSection('RESUMEN GENERAL');
    pdf.drawStatsGrid([
      { label: 'Total Estudiantes', value: stats.total },
      { label: 'Aprobados',         value: stats.aprobados },
      { label: 'Reprobados',        value: stats.reprobados },
      { label: 'Promedio Clase',    value: stats.promedio },
      { label: '% Aprobación',      value: stats.total > 0 ? `${Math.round(stats.aprobados / stats.total * 100)}%` : '—' },
    ], 5);

    pdf.drawSection('DETALLE POR ESTUDIANTE');
    const dimCodigos = dimensiones.map(d => d.codigo);
    const headers    = ['#', 'Código', 'Estudiante', ...dimCodigos.map(c => `${c} (${dimensiones.find(d => d.codigo===c)?.porcentaje_ponderacion}%)`), 'Nota Final', 'Estado'];
    const colWidths  = [25, 65, 160, ...dimCodigos.map(() => 55), 70, 65];

    const rows = estudiantes.map((est, i) => [
      (i+1).toString(), est.codigo, `${est.apellidos}, ${est.nombres}`,
      ...dimCodigos.map(c => est.dimensiones[c]?.nota !== undefined ? Number(est.dimensiones[c].nota).toFixed(1) : '—'),
      est.nota_final !== null ? Number(est.nota_final).toFixed(1) : '—',
      est.aprobado === true ? 'Aprobado' : est.aprobado === false ? 'Reprobado' : 'Sin nota',
    ]);

    pdf.drawTable(headers, rows, { columnWidths: colWidths });
    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — POR EVALUACIÓN
  // ══════════════════════════════════════════════
  static _pdfEvaluacion(res, { evaluacion, lista, stats }) {
    const pdf = new PDFGenerator({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=evaluacion-${evaluacion.id}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(`NOTAS — ${evaluacion.nombre}`, `${evaluacion.nivel_nombre} — ${evaluacion.grado_nombre} "${evaluacion.paralelo_nombre}" · ${evaluacion.materia_nombre}`);
    pdf.drawInfoBox([
      { label: 'Evaluación',   value: evaluacion.nombre },
      { label: 'Tipo',         value: evaluacion.tipo ?? 'N/A' },
      { label: 'Dimensión',    value: evaluacion.dimension_nombre },
      { label: 'Trimestre',    value: evaluacion.periodo_nombre },
      { label: 'Fecha',        value: evaluacion.fecha ? formatearFecha(evaluacion.fecha + 'T12:00', 'corto') : '—' },
      { label: 'Puntaje Máx.', value: evaluacion.puntaje_maximo.toString() },
    ], 2);

    pdf.drawSection('ESTADÍSTICAS');
    pdf.drawStatsGrid([
      { label: 'Total Estud.',  value: stats.total },
      { label: 'Con Nota',      value: stats.conNota },
      { label: 'Sin Nota',      value: stats.sinNota },
      { label: 'Ausentes',      value: stats.ausentes },
      { label: 'Promedio',      value: `${stats.promedio}` },
      { label: 'Aprobados',     value: stats.aprobados },
    ], 3);

    pdf.drawSection('NOTAS POR ESTUDIANTE');
    const rows = lista.map((r, i) => [
      (i+1).toString(), r.estudiante_codigo, `${r.estudiante_apellidos}, ${r.estudiante_nombres}`,
      r.esta_ausente ? 'AUSENTE' : r.puntaje_obtenido !== null ? Number(r.puntaje_obtenido).toFixed(1) : 'Sin nota',
      r.nota_sobre_100 !== null && !r.esta_ausente ? `${r.nota_sobre_100}` : '—',
      r.observacion ?? '—',
    ]);
    pdf.drawTable(['#', 'Código', 'Estudiante', `Puntos (/${evaluacion.puntaje_maximo})`, 'Sobre 100', 'Observación'],
      rows, { columnWidths: [25, 65, 180, 80, 65, 125] });
    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — POR DIMENSIÓN
  // ══════════════════════════════════════════════
  static _pdfDimension(res, { cabecera, dimension, periodo_eval, evaluaciones, estudiantes }) {
    const pdf = new PDFGenerator({ margin: 40, landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=dimension-${dimension.codigo}-T${periodo_eval?.orden ?? ''}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(`DIMENSIÓN: ${dimension.nombre} (${dimension.porcentaje_ponderacion}%)`,
      `${cabecera.nivel_nombre} — ${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre}`);
    pdf.drawInfoBox([
      { label: 'Dimensión', value: `${dimension.nombre} — ${dimension.porcentaje_ponderacion}% de la nota final` },
      { label: 'Trimestre', value: periodo_eval?.nombre ?? '—' },
      { label: 'Docente',   value: cabecera.docente_nombre },
      { label: 'Materia',   value: cabecera.materia_nombre },
    ], 2);

    pdf.drawSection('DETALLE POR ESTUDIANTE');
    const headers    = ['#', 'Código', 'Estudiante', ...evaluaciones.map(ev => ev.nombre.slice(0,15)), `${dimension.nombre}`];
    const colWidths  = [25, 65, 160, ...evaluaciones.map(() => 70), 75];

    const rows = estudiantes.map((est, i) => [
      (i+1).toString(), est.codigo, `${est.apellidos}, ${est.nombres}`,
      ...evaluaciones.map(ev => {
        const n = est.notas[ev.id];
        if (!n) return '—';
        if (n.ausente) return 'AUS';
        return n.sobre100 !== null ? `${n.sobre100}` : '—';
      }),
      est.nota_dimension !== null ? Number(est.nota_dimension).toFixed(1) : '—',
    ]);

    pdf.drawTable(headers, rows, { columnWidths: colWidths });
    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — COMPARATIVO TRIMESTRAL
  // ══════════════════════════════════════════════
  static _pdfComparativoTrimestral(res, { cabecera, trimestres, estudiantes }) {
    const pdf = new PDFGenerator({ margin: 40, landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=comparativo-notas-${cabecera.materia_codigo}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader('COMPARATIVO TRIMESTRAL DE NOTAS', `${cabecera.nivel_nombre} — ${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre}`);
    pdf.drawInfoBox([
      { label: 'Docente',  value: cabecera.docente_nombre },
      { label: 'Período',  value: cabecera.periodo_nombre },
      { label: 'Materia',  value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
    ], 2);

    pdf.drawSection('NOTAS FINALES POR TRIMESTRE');
    const headers   = ['#', 'Código', 'Estudiante', ...trimestres.map(t => t.nombre), 'Promedio'];
    const colWidths = [25, 65, 170, ...trimestres.map(() => 75), 65];

    const rows = estudiantes.map((est, i) => {
      const notas = trimestres.map(t => {
        const td = est.trimestres[t.nombre];
        return td?.nota_final !== null && td?.nota_final !== undefined ? Number(td.nota_final).toFixed(1) : '—';
      });
      const validas = trimestres.map(t => est.trimestres[t.nombre]?.nota_final).filter(n => n !== null && n !== undefined);
      const promedio = validas.length > 0 ? (validas.reduce((a, n) => a + Number(n), 0) / validas.length).toFixed(1) : '—';
      return [(i+1).toString(), est.codigo, `${est.apellidos}, ${est.nombres}`, ...notas, promedio];
    });

    pdf.drawTable(headers, rows, { columnWidths: colWidths });
    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — ESTUDIANTE INDIVIDUAL
  // ══════════════════════════════════════════════
  static _pdfEstudianteNotas(res, { cabecera, estudiante, periodo_eval, evaluaciones, notas_dimension, calificacion_periodo }) {
    const pdf = new PDFGenerator({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=notas-${estudiante.codigo}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader('REPORTE INDIVIDUAL DE NOTAS', `${estudiante.apellidos}, ${estudiante.nombres} — ${cabecera.materia_nombre}`);
    pdf.drawInfoBox([
      { label: 'Estudiante', value: `${estudiante.nombres} ${estudiante.apellidos}` },
      { label: 'Código',     value: estudiante.codigo },
      { label: 'CI',         value: estudiante.ci ?? 'N/A' },
      { label: 'Materia',    value: cabecera.materia_nombre },
      { label: 'Docente',    value: cabecera.docente_nombre },
      { label: 'Trimestre',  value: periodo_eval?.nombre ?? '—' },
    ], 2);

    // Notas por dimensión
    pdf.drawSection('RESUMEN POR DIMENSIÓN');
    pdf.drawStatsGrid([
      ...notas_dimension.map(nd => ({
        label: `${nd.dimension_nombre} (${nd.porcentaje_ponderacion}%)`,
        value: nd.nota_promedio !== null ? Number(nd.nota_promedio).toFixed(1) : '—',
      })),
      {
        label: 'NOTA FINAL',
        value: calificacion_periodo?.nota_final !== null && calificacion_periodo?.nota_final !== undefined
          ? Number(calificacion_periodo.nota_final).toFixed(1) : '—',
      },
      {
        label: 'Estado',
        value: calificacion_periodo?.aprobado === true ? 'APROBADO' : calificacion_periodo?.aprobado === false ? 'REPROBADO' : 'Sin nota',
      },
    ], 3);

    // Detalle de evaluaciones
    pdf.drawSection('DETALLE POR EVALUACIÓN');
    const rows = evaluaciones.map((ev, i) => [
      (i+1).toString(),
      ev.evaluacion_nombre,
      ev.tipo ?? '—',
      ev.dimension_nombre,
      ev.fecha ? formatearFecha(ev.fecha + 'T12:00', 'corto') : '—',
      ev.esta_ausente ? 'AUSENTE' : ev.puntaje_obtenido !== null ? `${Number(ev.puntaje_obtenido).toFixed(1)} / ${ev.puntaje_maximo}` : 'Sin nota',
      ev.nota_sobre_100 !== null && !ev.esta_ausente ? `${ev.nota_sobre_100}` : '—',
    ]);
    pdf.drawTable(['#', 'Evaluación', 'Tipo', 'Dimensión', 'Fecha', 'Puntaje', 'Sobre 100'],
      rows, { columnWidths: [25, 160, 70, 80, 70, 80, 65] });
    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — RESUMEN GENERAL CLASE
  // ══════════════════════════════════════════════
  static _pdfResumenClase(res, { cabecera, periodo_eval, lista, stats }) {
    const pdf = new PDFGenerator({ margin: 40, landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=resumen-notas-${cabecera.materia_codigo}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader('RESUMEN DE NOTAS — CLASE COMPLETA', `${cabecera.nivel_nombre} — ${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre}`);
    pdf.drawInfoBox([
      { label: 'Docente',   value: cabecera.docente_nombre },
      { label: 'Trimestre', value: periodo_eval?.nombre ?? '—' },
      { label: 'Materia',   value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
    ], 2);

    pdf.drawSection('ESTADÍSTICAS');
    pdf.drawStatsGrid([
      { label: 'Total',      value: stats.total },
      { label: 'Aprobados',  value: stats.aprobados },
      { label: 'Reprobados', value: stats.reprobados },
      { label: 'Sin nota',   value: stats.sinNota },
      { label: 'Promedio',   value: stats.promedio },
      { label: '% Aprobación', value: stats.total > 0 ? `${Math.round((stats.aprobados / stats.total) * 100)}%` : '—' },
    ], 3);

    pdf.drawSection('DETALLE POR ESTUDIANTE');
    const rows = lista.map((r, i) => [
      (i+1).toString(), r.estudiante_codigo, `${r.estudiante_apellidos}, ${r.estudiante_nombres}`,
      r.nota_ser   !== null ? Number(r.nota_ser  ).toFixed(1) : '—',
      r.nota_saber !== null ? Number(r.nota_saber).toFixed(1) : '—',
      r.nota_hacer !== null ? Number(r.nota_hacer).toFixed(1) : '—',
      r.nota_auto  !== null ? Number(r.nota_auto ).toFixed(1) : '—',
      r.nota_final !== null ? Number(r.nota_final).toFixed(1) : '—',
      r.aprobado === true ? 'Aprobado' : r.aprobado === false ? 'Reprobado' : 'Sin nota',
    ]);
    pdf.drawTable(['#', 'Código', 'Estudiante', 'Ser (10%)', 'Saber (40%)', 'Hacer (45%)', 'Auto (5%)', 'Final', 'Estado'],
      rows, { columnWidths: [25, 65, 170, 60, 70, 70, 60, 55, 70] });
    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — BOLETÍN
  // ══════════════════════════════════════════════
  static async _excelBoletin(res, { cabecera, periodo_eval, dimensiones, estudiantes, stats }) {
    const excel = new ExcelGenerator();
    const ws    = excel.createSheet('Boletín de Notas');
    excel.addTitle(ws, 'BOLETÍN DE NOTAS', `${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre} · ${periodo_eval?.nombre ?? ''}`);
    excel.addInfoBox(ws, [
      { label: 'Docente',   value: cabecera.docente_nombre },
      { label: 'Trimestre', value: periodo_eval?.nombre ?? '—' },
      { label: 'Materia',   value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
    ]);
    excel.addStats(ws, [
      { label: 'Total',       value: stats.total },
      { label: 'Aprobados',   value: stats.aprobados },
      { label: 'Reprobados',  value: stats.reprobados },
      { label: 'Promedio',    value: stats.promedio },
      { label: '% Aprobación',value: stats.total > 0 ? `${Math.round(stats.aprobados / stats.total * 100)}%` : '—' },
    ], 5);

    const dimCodigos = dimensiones.map(d => d.codigo);
    const headers    = ['#', 'Código', 'Nombres', 'Apellidos', ...dimCodigos.map(c => `${c} (${dimensiones.find(d => d.codigo===c)?.porcentaje_ponderacion}%)`), 'Nota Final', 'Estado'];
    const rows = estudiantes.map((est, i) => [
      i+1, est.codigo, est.nombres, est.apellidos,
      ...dimCodigos.map(c => est.dimensiones[c]?.nota !== undefined ? parseFloat(Number(est.dimensiones[c].nota).toFixed(1)) : ''),
      est.nota_final !== null ? parseFloat(Number(est.nota_final).toFixed(1)) : '',
      est.aprobado === true ? 'Aprobado' : est.aprobado === false ? 'Reprobado' : 'Sin nota',
    ]);
    excel.addTable(ws, headers, rows, {
      sectionTitle: 'DETALLE POR ESTUDIANTE',
      columnWidths: [5, 12, 22, 22, ...dimCodigos.map(() => 14), 12, 12],
    });
    excel.addFooter(ws);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=boletin-${cabecera.materia_codigo}.xlsx`);
    await excel.write(res); res.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — POR EVALUACIÓN
  // ══════════════════════════════════════════════
  static async _excelEvaluacion(res, { evaluacion, lista, stats }) {
    const excel = new ExcelGenerator();
    const ws    = excel.createSheet('Notas Evaluación');
    excel.addTitle(ws, `NOTAS — ${evaluacion.nombre}`, `${evaluacion.grado_nombre} "${evaluacion.paralelo_nombre}" · ${evaluacion.materia_nombre}`);
    excel.addInfoBox(ws, [
      { label: 'Evaluación',   value: evaluacion.nombre },
      { label: 'Dimensión',    value: evaluacion.dimension_nombre },
      { label: 'Trimestre',    value: evaluacion.periodo_nombre },
      { label: 'Puntaje Máx.', value: evaluacion.puntaje_maximo.toString() },
    ]);
    excel.addStats(ws, [
      { label: 'Total',    value: stats.total },
      { label: 'Con Nota', value: stats.conNota },
      { label: 'Sin Nota', value: stats.sinNota },
      { label: 'Ausentes', value: stats.ausentes },
      { label: 'Promedio', value: stats.promedio },
    ], 5);
    const rows = lista.map((r, i) => [
      i+1, r.estudiante_codigo, r.estudiante_nombres, r.estudiante_apellidos,
      r.esta_ausente ? 'AUSENTE' : r.puntaje_obtenido !== null ? parseFloat(Number(r.puntaje_obtenido).toFixed(1)) : '',
      r.nota_sobre_100 !== null && !r.esta_ausente ? parseFloat(Number(r.nota_sobre_100).toFixed(1)) : '',
      r.observacion ?? '',
    ]);
    excel.addTable(ws, ['#', 'Código', 'Nombres', 'Apellidos', `Puntaje (/${evaluacion.puntaje_maximo})`, 'Sobre 100', 'Observación'],
      rows, { sectionTitle: 'NOTAS POR ESTUDIANTE', columnWidths: [5, 12, 22, 22, 16, 14, 30] });
    excel.addFooter(ws);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=evaluacion-${evaluacion.id}.xlsx`);
    await excel.write(res); res.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — POR DIMENSIÓN
  // ══════════════════════════════════════════════
  static async _excelDimension(res, { cabecera, dimension, periodo_eval, evaluaciones, estudiantes }) {
    const excel = new ExcelGenerator();
    const ws    = excel.createSheet(`Dimensión ${dimension.codigo}`);
    excel.addTitle(ws, `DIMENSIÓN: ${dimension.nombre} (${dimension.porcentaje_ponderacion}%)`, `${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre} · ${periodo_eval?.nombre ?? ''}`);
    excel.addInfoBox(ws, [
      { label: 'Dimensión', value: `${dimension.nombre} — ${dimension.porcentaje_ponderacion}% de la nota final` },
      { label: 'Trimestre', value: periodo_eval?.nombre ?? '—' },
      { label: 'Docente',   value: cabecera.docente_nombre },
    ]);
    const headers = ['#', 'Código', 'Nombres', 'Apellidos', ...evaluaciones.map(ev => ev.nombre), `${dimension.nombre}`];
    const rows    = estudiantes.map((est, i) => [
      i+1, est.codigo, est.nombres, est.apellidos,
      ...evaluaciones.map(ev => {
        const n = est.notas[ev.id];
        if (!n) return '';
        if (n.ausente) return 'AUS';
        return n.sobre100 !== null ? parseFloat(Number(n.sobre100).toFixed(1)) : '';
      }),
      est.nota_dimension !== null ? parseFloat(Number(est.nota_dimension).toFixed(1)) : '',
    ]);
    excel.addTable(ws, headers, rows, {
      sectionTitle: 'DETALLE POR ESTUDIANTE',
      columnWidths: [5, 12, 22, 22, ...evaluaciones.map(() => 16), 14],
    });
    excel.addFooter(ws);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=dimension-${dimension.codigo}.xlsx`);
    await excel.write(res); res.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — COMPARATIVO TRIMESTRAL
  // ══════════════════════════════════════════════
  static async _excelComparativoTrimestral(res, { cabecera, trimestres, estudiantes }) {
    const excel = new ExcelGenerator();

    // Hoja 1: Notas finales
    const ws1 = excel.createSheet('Notas Finales');
    excel.addTitle(ws1, 'COMPARATIVO TRIMESTRAL DE NOTAS', `${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre}`);
    excel.addInfoBox(ws1, [
      { label: 'Docente',  value: cabecera.docente_nombre },
      { label: 'Período',  value: cabecera.periodo_nombre },
      { label: 'Materia',  value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
    ]);
    const hFinal = ['#', 'Código', 'Nombres', 'Apellidos', ...trimestres.map(t => t.nombre), 'Promedio Anual'];
    const rFinal = estudiantes.map((est, i) => {
      const notas = trimestres.map(t => {
        const td = est.trimestres[t.nombre];
        return td?.nota_final !== null && td?.nota_final !== undefined ? parseFloat(Number(td.nota_final).toFixed(1)) : '';
      });
      const validas = notas.filter(n => typeof n === 'number');
      const prom = validas.length > 0 ? parseFloat((validas.reduce((a, n) => a + n, 0) / validas.length).toFixed(1)) : '';
      return [i+1, est.codigo, est.nombres, est.apellidos, ...notas, prom];
    });
    excel.addTable(ws1, hFinal, rFinal, {
      sectionTitle: 'NOTAS FINALES POR TRIMESTRE',
      columnWidths: [5, 12, 22, 22, ...trimestres.map(() => 18), 16],
    });
    excel.addFooter(ws1);

    // Hoja 2: Desglose Ser/Saber/Hacer por trimestre
    const ws2 = excel.createSheet('Desglose Dimensiones');
    excel.addTitle(ws2, 'DESGLOSE POR DIMENSIÓN Y TRIMESTRE');
    const hDesglose = ['#', 'Código', 'Nombres', 'Apellidos'];
    for (const t of trimestres) {
      hDesglose.push(`${t.nombre} Ser`, `${t.nombre} Saber`, `${t.nombre} Hacer`, `${t.nombre} Auto`, `${t.nombre} Final`);
    }
    const rDesglose = estudiantes.map((est, i) => {
      const fila = [i+1, est.codigo, est.nombres, est.apellidos];
      for (const t of trimestres) {
        const td = est.trimestres[t.nombre];
        fila.push(
          td?.ser   !== null && td?.ser   !== undefined ? parseFloat(Number(td.ser  ).toFixed(1)) : '',
          td?.saber !== null && td?.saber !== undefined ? parseFloat(Number(td.saber).toFixed(1)) : '',
          td?.hacer !== null && td?.hacer !== undefined ? parseFloat(Number(td.hacer).toFixed(1)) : '',
          td?.auto  !== null && td?.auto  !== undefined ? parseFloat(Number(td.auto ).toFixed(1)) : '',
          td?.nota_final !== null && td?.nota_final !== undefined ? parseFloat(Number(td.nota_final).toFixed(1)) : '',
        );
      }
      return fila;
    });
    const cwDesglose = [5, 12, 22, 22, ...trimestres.flatMap(() => [10, 12, 12, 10, 12])];
    excel.addTable(ws2, hDesglose, rDesglose, { columnWidths: cwDesglose });
    excel.addFooter(ws2);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=comparativo-notas-${cabecera.materia_codigo}.xlsx`);
    await excel.write(res); res.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — ESTUDIANTE INDIVIDUAL
  // ══════════════════════════════════════════════
  static async _excelEstudianteNotas(res, { cabecera, estudiante, periodo_eval, evaluaciones, notas_dimension, calificacion_periodo }) {
    const excel = new ExcelGenerator();
    const ws    = excel.createSheet('Notas Estudiante');
    excel.addTitle(ws, 'REPORTE INDIVIDUAL DE NOTAS', `${estudiante.apellidos}, ${estudiante.nombres} · ${cabecera.materia_nombre} · ${periodo_eval?.nombre ?? ''}`);
    excel.addInfoBox(ws, [
      { label: 'Estudiante', value: `${estudiante.nombres} ${estudiante.apellidos}` },
      { label: 'Código',     value: estudiante.codigo },
      { label: 'CI',         value: estudiante.ci ?? 'N/A' },
      { label: 'Materia',    value: cabecera.materia_nombre },
      { label: 'Docente',    value: cabecera.docente_nombre },
      { label: 'Trimestre',  value: periodo_eval?.nombre ?? '—' },
    ]);
    excel.addStats(ws, [
      ...notas_dimension.map(nd => ({
        label: `${nd.dimension_nombre} (${nd.porcentaje_ponderacion}%)`,
        value: nd.nota_promedio !== null ? parseFloat(Number(nd.nota_promedio).toFixed(1)) : '—',
      })),
      { label: 'NOTA FINAL', value: calificacion_periodo?.nota_final !== null && calificacion_periodo?.nota_final !== undefined ? parseFloat(Number(calificacion_periodo.nota_final).toFixed(1)) : '—' },
      { label: 'Estado',     value: calificacion_periodo?.aprobado === true ? 'APROBADO' : calificacion_periodo?.aprobado === false ? 'REPROBADO' : 'Sin nota' },
    ], 3);

    const rows = evaluaciones.map((ev, i) => [
      i+1, ev.evaluacion_nombre, ev.tipo ?? '—', ev.dimension_nombre,
      ev.fecha ? formatearFecha(ev.fecha + 'T12:00', 'corto') : '—',
      ev.puntaje_maximo,
      ev.esta_ausente ? 'AUSENTE' : ev.puntaje_obtenido !== null ? parseFloat(Number(ev.puntaje_obtenido).toFixed(1)) : '',
      ev.nota_sobre_100 !== null && !ev.esta_ausente ? parseFloat(Number(ev.nota_sobre_100).toFixed(1)) : '',
      ev.observacion ?? '',
    ]);
    excel.addTable(ws, ['#', 'Evaluación', 'Tipo', 'Dimensión', 'Fecha', 'Máx.', 'Obtenido', 'Sobre 100', 'Observación'],
      rows, { sectionTitle: 'DETALLE POR EVALUACIÓN', columnWidths: [5, 30, 14, 16, 12, 8, 10, 12, 28] });
    excel.addFooter(ws);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=notas-${estudiante.codigo}.xlsx`);
    await excel.write(res); res.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — RESUMEN GENERAL CLASE
  // ══════════════════════════════════════════════
  static async _excelResumenClase(res, { cabecera, periodo_eval, lista, stats }) {
    const excel = new ExcelGenerator();
    const ws    = excel.createSheet('Resumen Notas');
    excel.addTitle(ws, 'RESUMEN DE NOTAS — CLASE COMPLETA', `${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre} · ${periodo_eval?.nombre ?? ''}`);
    excel.addInfoBox(ws, [
      { label: 'Docente',   value: cabecera.docente_nombre },
      { label: 'Trimestre', value: periodo_eval?.nombre ?? '—' },
      { label: 'Materia',   value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
    ]);
    excel.addStats(ws, [
      { label: 'Total',        value: stats.total },
      { label: 'Aprobados',    value: stats.aprobados },
      { label: 'Reprobados',   value: stats.reprobados },
      { label: 'Sin nota',     value: stats.sinNota },
      { label: 'Promedio',     value: stats.promedio },
      { label: '% Aprobación', value: stats.total > 0 ? `${Math.round(stats.aprobados / stats.total * 100)}%` : '—' },
    ], 3);

    const rows = lista.map((r, i) => [
      i+1, r.estudiante_codigo, r.estudiante_nombres, r.estudiante_apellidos,
      r.nota_ser   !== null ? parseFloat(Number(r.nota_ser  ).toFixed(1)) : '',
      r.nota_saber !== null ? parseFloat(Number(r.nota_saber).toFixed(1)) : '',
      r.nota_hacer !== null ? parseFloat(Number(r.nota_hacer).toFixed(1)) : '',
      r.nota_auto  !== null ? parseFloat(Number(r.nota_auto ).toFixed(1)) : '',
      r.nota_final !== null ? parseFloat(Number(r.nota_final).toFixed(1)) : '',
      r.aprobado === true ? 'Aprobado' : r.aprobado === false ? 'Reprobado' : 'Sin nota',
    ]);
    excel.addTable(ws, ['#', 'Código', 'Nombres', 'Apellidos', 'Ser (10%)', 'Saber (40%)', 'Hacer (45%)', 'Auto (5%)', 'Nota Final', 'Estado'],
      rows, { sectionTitle: 'DETALLE POR ESTUDIANTE', columnWidths: [5, 12, 22, 22, 12, 14, 14, 12, 12, 12] });
    excel.addFooter(ws);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=resumen-notas-${cabecera.materia_codigo}.xlsx`);
    await excel.write(res); res.end();
  }
}

export default ReportesNotasController;