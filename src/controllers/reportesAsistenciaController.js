// controllers/reportesAsistenciaController.js
import { pool }         from '../db/pool.js';
import PDFGenerator     from '../services/reportes/pdfGenerator.js';
import ExcelGenerator   from '../services/reportes/excelGenerator.js';
import { formatearFecha, formatearTelefono } from '../services/reportes/reportStyles.js';

class ReportesAsistenciaController {

  // ══════════════════════════════════════════════
  // 1️⃣  PASE DEL DÍA
  //     GET /api/reportes/asistencia/pase-dia
  //     ?asignacion_docente_id=X&fecha=YYYY-MM-DD&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reportePaseDia(req, res) {
    try {
      const { asignacion_docente_id, fecha, formato = 'pdf' } = req.query;

      if (!asignacion_docente_id || !fecha) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere asignacion_docente_id y fecha',
        });
      }

      // ── Cabecera de la asignación ──────────────────────────
      const cabQuery = await pool.query(`
        SELECT
          ad.id                    AS asignacion_id,
          mat.nombre               AS materia_nombre,
          mat.codigo               AS materia_codigo,
          g.nombre                 AS grado_nombre,
          n.nombre                 AS nivel_nombre,
          par.nombre               AS paralelo_nombre,
          par.aula,
          t.nombre                 AS turno_nombre,
          t.hora_inicio,
          t.hora_fin,
          pa.nombre                AS periodo_nombre,
          CONCAT(d.nombres, ' ', d.apellidos) AS docente_nombre
        FROM asignacion_docente ad
        INNER JOIN grado_materia gm    ON ad.grado_materia_id    = gm.id
        INNER JOIN materia mat         ON gm.materia_id           = mat.id
        INNER JOIN paralelo par        ON ad.paralelo_id          = par.id
        INNER JOIN grado g             ON par.grado_id            = g.id
        INNER JOIN nivel_academico n   ON g.nivel_academico_id    = n.id
        INNER JOIN turno t             ON par.turno_id            = t.id
        INNER JOIN periodo_academico pa ON ad.periodo_academico_id = pa.id
        INNER JOIN docente d           ON ad.docente_id            = d.id
        WHERE ad.id = $1
      `, [asignacion_docente_id]);

      if (cabQuery.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
      }

      const cabecera = cabQuery.rows[0];

      // ── Lista del día ──────────────────────────────────────
      const listaQuery = await pool.query(`
        SELECT
          e.codigo                  AS estudiante_codigo,
          e.nombres                 AS estudiante_nombres,
          e.apellidos               AS estudiante_apellidos,
          COALESCE(a.estado, 'sin_marcar') AS estado,
          a.hora_marcacion,
          a.justificacion,
          a.observaciones,
          sp.codigo_solicitud       AS permiso_codigo
        FROM asignacion_docente ad
        INNER JOIN matricula m
          ON  m.paralelo_id          = ad.paralelo_id
          AND m.periodo_academico_id = ad.periodo_academico_id
          AND m.estado               = 'activo'
          AND m.deleted_at           IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        LEFT JOIN asistencia a
          ON  a.matricula_id          = m.id
          AND a.asignacion_docente_id = $1
          AND a.fecha                 = $2
        LEFT JOIN solicitud_permiso sp ON a.solicitud_permiso_id = sp.id
        WHERE ad.id = $1
        ORDER BY e.apellidos, e.nombres
      `, [asignacion_docente_id, fecha]);

      const lista = listaQuery.rows;

      // ── Estadísticas del día ───────────────────────────────
      const stats = {
        total:          lista.length,
        presentes:      lista.filter(r => r.estado === 'presente').length,
        ausentes:       lista.filter(r => r.estado === 'ausente').length,
        tardanzas:      lista.filter(r => r.estado === 'tardanza').length,
        justificados:   lista.filter(r => r.estado === 'justificado').length,
        faltas_parciales: lista.filter(r => r.estado === 'falta_parcial').length,
        sin_marcar:     lista.filter(r => r.estado === 'sin_marcar').length,
      };
      stats.porcentaje_asistencia = stats.total > 0
        ? Math.round(((stats.presentes + stats.tardanzas + stats.justificados) / stats.total) * 100)
        : 0;

      const data = { cabecera, lista, stats, fecha };

      return formato === 'excel'
        ? ReportesAsistenciaController._excelPaseDia(res, data)
        : ReportesAsistenciaController._pdfPaseDia(res, data);

    } catch (error) {
      console.error('Error reporte pase de día:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 2️⃣  PERÍODO COMPLETO DE LA CLASE
  //     GET /api/reportes/asistencia/periodo-clase
  //     ?asignacion_docente_id=X&fecha_inicio=&fecha_fin=&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reportePeriodoClase(req, res) {
    try {
      const { asignacion_docente_id, fecha_inicio, fecha_fin, formato = 'pdf' } = req.query;

      if (!asignacion_docente_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere asignacion_docente_id',
        });
      }

      // Cabecera (mismo query que arriba)
      const cabQuery = await pool.query(`
        SELECT
          mat.nombre   AS materia_nombre,
          mat.codigo   AS materia_codigo,
          g.nombre     AS grado_nombre,
          n.nombre     AS nivel_nombre,
          par.nombre   AS paralelo_nombre,
          par.aula,
          t.nombre     AS turno_nombre,
          pa.nombre    AS periodo_nombre,
          CONCAT(d.nombres, ' ', d.apellidos) AS docente_nombre
        FROM asignacion_docente ad
        INNER JOIN grado_materia gm    ON ad.grado_materia_id    = gm.id
        INNER JOIN materia mat         ON gm.materia_id           = mat.id
        INNER JOIN paralelo par        ON ad.paralelo_id          = par.id
        INNER JOIN grado g             ON par.grado_id            = g.id
        INNER JOIN nivel_academico n   ON g.nivel_academico_id    = n.id
        INNER JOIN turno t             ON par.turno_id            = t.id
        INNER JOIN periodo_academico pa ON ad.periodo_academico_id = pa.id
        INNER JOIN docente d           ON ad.docente_id            = d.id
        WHERE ad.id = $1
      `, [asignacion_docente_id]);

      if (cabQuery.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
      }

      const cabecera = cabQuery.rows[0];

      // Reporte por estudiante (stored procedure)
      const reporteQuery = await pool.query(
        `SELECT * FROM reporte_asistencia_clase($1, $2, $3)`,
        [asignacion_docente_id, fecha_inicio || null, fecha_fin || null]
      );

      // Resumen de la clase
      const resumenQuery = await pool.query(
        `SELECT * FROM resumen_asistencia_clase($1, $2, $3)`,
        [asignacion_docente_id, fecha_inicio || null, fecha_fin || null]
      );

      const estudiantes = reporteQuery.rows;
      const resumen     = resumenQuery.rows[0];

      const data = { cabecera, estudiantes, resumen, fecha_inicio, fecha_fin };

      return formato === 'excel'
        ? ReportesAsistenciaController._excelPeriodoClase(res, data)
        : ReportesAsistenciaController._pdfPeriodoClase(res, data);

    } catch (error) {
      console.error('Error reporte período clase:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 3️⃣  REPORTE INDIVIDUAL DE ESTUDIANTE
  //     GET /api/reportes/asistencia/estudiante
  //     ?matricula_id=X&asignacion_docente_id=Y&fecha_inicio=&fecha_fin=&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reporteEstudiante(req, res) {
    try {
      const { matricula_id, asignacion_docente_id, fecha_inicio, fecha_fin, formato = 'pdf' } = req.query;

      if (!matricula_id) {
        return res.status(400).json({ success: false, message: 'Se requiere matricula_id' });
      }

      // Datos del estudiante
      const estQuery = await pool.query(`
        SELECT
          e.codigo,
          e.nombres,
          e.apellidos,
          e.ci,
          e.fecha_nacimiento,
          e.genero,
          e.foto_url,
          g.nombre     AS grado_nombre,
          n.nombre     AS nivel_nombre,
          par.nombre   AS paralelo_nombre,
          pa.nombre    AS periodo_nombre,
          m.numero_matricula,
          m.estado     AS estado_matricula
        FROM matricula m
        INNER JOIN estudiante e         ON m.estudiante_id = e.id
        INNER JOIN paralelo par         ON m.paralelo_id   = par.id
        INNER JOIN grado g              ON par.grado_id    = g.id
        INNER JOIN nivel_academico n    ON g.nivel_academico_id = n.id
        INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
        WHERE m.id = $1 AND m.deleted_at IS NULL
      `, [matricula_id]);

      if (estQuery.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      const estudiante = estQuery.rows[0];

      // Reporte por materia (stored procedure existente)
      const reporteQuery = await pool.query(
        `SELECT * FROM reporte_asistencia_estudiante($1, $2, $3, $4)`,
        [matricula_id, asignacion_docente_id || null, fecha_inicio || null, fecha_fin || null]
      );

      // Detalle día a día para la asignación seleccionada (si se filtra por una)
      let detalleDias = [];
      if (asignacion_docente_id) {
        const detalleQuery = await pool.query(`
          SELECT
            a.fecha,
            a.estado,
            a.hora_marcacion,
            a.justificacion,
            a.observaciones,
            mat.nombre  AS materia_nombre,
            sp.codigo_solicitud AS permiso_codigo
          FROM asistencia a
          INNER JOIN asignacion_docente ad ON a.asignacion_docente_id = ad.id
          INNER JOIN grado_materia gm      ON ad.grado_materia_id = gm.id
          INNER JOIN materia mat           ON gm.materia_id = mat.id
          LEFT JOIN solicitud_permiso sp   ON a.solicitud_permiso_id = sp.id
          WHERE a.matricula_id          = $1
            AND a.asignacion_docente_id = $2
            AND ($3::date IS NULL OR a.fecha >= $3)
            AND ($4::date IS NULL OR a.fecha <= $4)
          ORDER BY a.fecha DESC
        `, [matricula_id, asignacion_docente_id, fecha_inicio || null, fecha_fin || null]);

        detalleDias = detalleQuery.rows;
      }

      const data = { estudiante, reporte: reporteQuery.rows, detalleDias, fecha_inicio, fecha_fin };

      return formato === 'excel'
        ? ReportesAsistenciaController._excelEstudiante(res, data)
        : ReportesAsistenciaController._pdfEstudiante(res, data);

    } catch (error) {
      console.error('Error reporte estudiante:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — PASE DEL DÍA
  // ══════════════════════════════════════════════
  static _pdfPaseDia(res, { cabecera, lista, stats, fecha }) {
    const pdf = new PDFGenerator({ margin: 50 });
    const fechaStr = formatearFecha(fecha + 'T12:00:00');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename=pase-dia-${cabecera.materia_codigo}-${fecha}.pdf`);
    pdf.pipe(res);

    // Encabezado
    pdf.drawHeader(
      'PASE DE LISTA DEL DÍA',
      `${cabecera.nivel_nombre} — ${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre}`
    );

    // Información de la clase
    pdf.drawInfoBox([
      { label: 'Fecha',    value: fechaStr },
      { label: 'Materia',  value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
      { label: 'Docente',  value: cabecera.docente_nombre },
      { label: 'Turno',    value: `${cabecera.turno_nombre} (${cabecera.hora_inicio?.slice(0,5)} – ${cabecera.hora_fin?.slice(0,5)})` },
      { label: 'Período',  value: cabecera.periodo_nombre },
      { label: 'Aula',     value: cabecera.aula || 'N/A' },
    ], 2);

    // Estadísticas del día
    pdf.drawSection('ESTADÍSTICAS DEL DÍA');
    pdf.drawStatsGrid([
      { label: 'Total Estudiantes', value: stats.total },
      { label: 'Presentes',         value: stats.presentes },
      { label: 'Ausentes',          value: stats.ausentes },
      { label: 'Tardanzas',         value: stats.tardanzas },
      { label: 'Justificados',      value: stats.justificados },
      { label: '% Asistencia',      value: `${stats.porcentaje_asistencia}%` },
    ], 3);

    // Lista
    pdf.drawSection('REGISTRO DE ASISTENCIA');

    const ESTADO_LABELS = {
      presente:      'Presente',
      ausente:       'Ausente',
      tardanza:      'Tardanza',
      justificado:   'Justificado',
      falta_parcial: 'F. Parcial',
      sin_marcar:    'Sin marcar',
    };

    const rows = lista.map((r, i) => [
      (i + 1).toString(),
      r.estudiante_codigo,
      `${r.estudiante_apellidos}, ${r.estudiante_nombres}`,
      ESTADO_LABELS[r.estado] ?? r.estado,
      r.hora_marcacion?.slice(0, 5) || '—',
      r.permiso_codigo || r.justificacion || '—',
    ]);

    pdf.drawTable(
      ['#', 'Código', 'Estudiante', 'Estado', 'Hora', 'Justificación/Permiso'],
      rows,
      { columnWidths: [25, 65, 160, 70, 50, 130] }
    );

    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — PERÍODO COMPLETO DE LA CLASE
  // ══════════════════════════════════════════════
  static _pdfPeriodoClase(res, { cabecera, estudiantes, resumen, fecha_inicio, fecha_fin }) {
    const pdf = new PDFGenerator({ margin: 40, landscape: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename=asistencia-clase-${cabecera.materia_codigo}.pdf`);
    pdf.pipe(res);

    const rangoFechas = fecha_inicio && fecha_fin
      ? `${formatearFecha(fecha_inicio + 'T12:00')} al ${formatearFecha(fecha_fin + 'T12:00')}`
      : 'Período completo';

    pdf.drawHeader(
      'REPORTE DE ASISTENCIA — CLASE COMPLETA',
      `${cabecera.nivel_nombre} — ${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre}`
    );

    pdf.drawInfoBox([
      { label: 'Docente',  value: cabecera.docente_nombre },
      { label: 'Período',  value: cabecera.periodo_nombre },
      { label: 'Rango',    value: rangoFechas },
      { label: 'Turno',    value: cabecera.turno_nombre },
    ], 2);

    pdf.drawSection('RESUMEN GENERAL');
    pdf.drawStatsGrid([
      { label: 'Total Estudiantes',  value: resumen?.total_estudiantes     || 0 },
      { label: 'Días Registrados',   value: resumen?.total_dias_registrados || 0 },
      { label: 'Presentes',          value: resumen?.presentes             || 0 },
      { label: 'Ausentes',           value: resumen?.ausentes              || 0 },
      { label: 'Tardanzas',          value: resumen?.tardanzas             || 0 },
      { label: 'Promedio Asistencia',value: `${Math.round(resumen?.promedio_asistencia || 0)}%` },
      { label: 'Críticos (<70%)',    value: resumen?.estudiantes_criticos  || 0 },
      { label: 'Justificados',       value: resumen?.justificados          || 0 },
    ], 4);

    pdf.drawSection('DETALLE POR ESTUDIANTE');

    const rows = estudiantes.map((e, i) => [
      (i + 1).toString(),
      e.estudiante_codigo,
      `${e.estudiante_apellidos}, ${e.estudiante_nombres}`,
      e.total_clases.toString(),
      e.presentes.toString(),
      e.ausentes.toString(),
      e.tardanzas.toString(),
      e.justificados.toString(),
      e.faltas_parciales.toString(),
      `${Number(e.porcentaje_asistencia).toFixed(1)}%`,
    ]);

    pdf.drawTable(
      ['#', 'Código', 'Estudiante', 'Total', 'P', 'A', 'T', 'J', 'FP', '% Asist.'],
      rows,
      { columnWidths: [25, 65, 180, 45, 35, 35, 35, 35, 35, 70] }
    );

    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — ESTUDIANTE INDIVIDUAL
  // ══════════════════════════════════════════════
  static _pdfEstudiante(res, { estudiante, reporte, detalleDias, fecha_inicio, fecha_fin }) {
    const pdf = new PDFGenerator({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename=asistencia-${estudiante.codigo}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(
      'REPORTE INDIVIDUAL DE ASISTENCIA',
      `${estudiante.apellidos}, ${estudiante.nombres} — ${estudiante.codigo}`
    );

    pdf.drawInfoBox([
      { label: 'Estudiante', value: `${estudiante.nombres} ${estudiante.apellidos}` },
      { label: 'Código',     value: estudiante.codigo },
      { label: 'Grado',      value: `${estudiante.nivel_nombre} — ${estudiante.grado_nombre} "${estudiante.paralelo_nombre}"` },
      { label: 'Período',    value: estudiante.periodo_nombre },
      { label: 'Matrícula',  value: estudiante.numero_matricula },
      { label: 'CI',         value: estudiante.ci || 'N/A' },
    ], 2);

    // Resumen por materia
    pdf.drawSection('RESUMEN POR MATERIA');

    const rowsResumen = reporte.map((r, i) => [
      (i + 1).toString(),
      r.materia_nombre,
      r.total_clases.toString(),
      r.presentes.toString(),
      r.ausentes.toString(),
      r.tardanzas.toString(),
      r.justificados.toString(),
      `${Number(r.porcentaje_asistencia).toFixed(1)}%`,
    ]);

    pdf.drawTable(
      ['#', 'Materia', 'Total', 'P', 'A', 'T', 'J', '% Asist.'],
      rowsResumen,
      { columnWidths: [25, 180, 50, 40, 40, 40, 40, 65] }
    );

    // Detalle día a día (solo si hay una materia seleccionada)
    if (detalleDias.length > 0) {
      pdf.drawSection('DETALLE DÍA A DÍA');

      const ESTADO_LABELS = {
        presente: 'Presente', ausente: 'Ausente', tardanza: 'Tardanza',
        justificado: 'Justificado', falta_parcial: 'F. Parcial',
      };

      const rowsDias = detalleDias.map((d, i) => [
        (i + 1).toString(),
        formatearFecha(d.fecha + 'T12:00', 'corto'),
        ESTADO_LABELS[d.estado] ?? d.estado,
        d.hora_marcacion?.slice(0, 5) || '—',
        d.permiso_codigo || d.justificacion || '—',
      ]);

      pdf.drawTable(
        ['#', 'Fecha', 'Estado', 'Hora', 'Justificación'],
        rowsDias,
        { columnWidths: [25, 90, 80, 55, 200] }
      );
    }

    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — PASE DEL DÍA
  // ══════════════════════════════════════════════
  static async _excelPaseDia(res, { cabecera, lista, stats, fecha }) {
    const excel   = new ExcelGenerator();
    const ws      = excel.createSheet('Pase del Día');
    const fechaStr = formatearFecha(fecha + 'T12:00:00');

    excel.addTitle(ws,
      'PASE DE LISTA DEL DÍA',
      `${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" — ${cabecera.materia_nombre} — ${fechaStr}`
    );

    excel.addInfoBox(ws, [
      { label: 'Fecha',    value: fechaStr },
      { label: 'Materia',  value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
      { label: 'Docente',  value: cabecera.docente_nombre },
      { label: 'Turno',    value: cabecera.turno_nombre },
      { label: 'Período',  value: cabecera.periodo_nombre },
      { label: 'Aula',     value: cabecera.aula || 'N/A' },
    ]);

    excel.addStats(ws, [
      { label: 'Total Estudiantes', value: stats.total },
      { label: 'Presentes',         value: stats.presentes },
      { label: 'Ausentes',          value: stats.ausentes },
      { label: 'Tardanzas',         value: stats.tardanzas },
      { label: 'Justificados',      value: stats.justificados },
      { label: '% Asistencia',      value: `${stats.porcentaje_asistencia}%` },
    ], 3);

    const ESTADO_LABELS = {
      presente: 'Presente', ausente: 'Ausente', tardanza: 'Tardanza',
      justificado: 'Justificado', falta_parcial: 'Falta Parcial', sin_marcar: 'Sin marcar',
    };

    const rows = lista.map((r, i) => [
      i + 1,
      r.estudiante_codigo,
      r.estudiante_nombres,
      r.estudiante_apellidos,
      ESTADO_LABELS[r.estado] ?? r.estado,
      r.hora_marcacion?.slice(0, 5) || '',
      r.permiso_codigo || '',
      r.justificacion  || '',
      r.observaciones  || '',
    ]);

    excel.addTable(ws,
      ['#', 'Código', 'Nombres', 'Apellidos', 'Estado', 'Hora', 'Permiso', 'Justificación', 'Observaciones'],
      rows,
      {
        sectionTitle: 'REGISTRO DE ASISTENCIA',
        columnWidths: [5, 12, 22, 22, 14, 8, 16, 25, 25],
      }
    );

    excel.addFooter(ws);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename=pase-dia-${cabecera.materia_codigo}-${fecha}.xlsx`);

    await excel.write(res);
    res.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — PERÍODO COMPLETO DE LA CLASE
  // ══════════════════════════════════════════════
  static async _excelPeriodoClase(res, { cabecera, estudiantes, resumen, fecha_inicio, fecha_fin }) {
    const excel = new ExcelGenerator();

    const rangoFechas = fecha_inicio && fecha_fin
      ? `${fecha_inicio} al ${fecha_fin}`
      : 'Período completo';

    // ── Hoja 1: Resumen ────────────────────────────────────
    const ws1 = excel.createSheet('Resumen Clase');

    excel.addTitle(ws1,
      'REPORTE DE ASISTENCIA — CLASE COMPLETA',
      `${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre} · ${rangoFechas}`
    );

    excel.addInfoBox(ws1, [
      { label: 'Docente',  value: cabecera.docente_nombre },
      { label: 'Período',  value: cabecera.periodo_nombre },
      { label: 'Rango',    value: rangoFechas },
      { label: 'Turno',    value: cabecera.turno_nombre },
    ]);

    excel.addStats(ws1, [
      { label: 'Total Estudiantes',   value: parseInt(resumen?.total_estudiantes     || 0) },
      { label: 'Días Registrados',    value: parseInt(resumen?.total_dias_registrados || 0) },
      { label: 'Total Registros',     value: parseInt(resumen?.total_registros        || 0) },
      { label: 'Presentes',           value: parseInt(resumen?.presentes              || 0) },
      { label: 'Ausentes',            value: parseInt(resumen?.ausentes               || 0) },
      { label: 'Tardanzas',           value: parseInt(resumen?.tardanzas              || 0) },
      { label: 'Justificados',        value: parseInt(resumen?.justificados           || 0) },
      { label: 'Faltas Parciales',    value: parseInt(resumen?.faltas_parciales       || 0) },
      { label: 'Promedio Asistencia', value: `${Math.round(resumen?.promedio_asistencia || 0)}%` },
      { label: 'Críticos (<70%)',     value: parseInt(resumen?.estudiantes_criticos   || 0) },
    ], 2);

    const rows = estudiantes.map((e, i) => [
      i + 1,
      e.estudiante_codigo,
      e.estudiante_nombres,
      e.estudiante_apellidos,
      parseInt(e.total_clases),
      parseInt(e.presentes),
      parseInt(e.ausentes),
      parseInt(e.tardanzas),
      parseInt(e.justificados),
      parseInt(e.faltas_parciales),
      parseFloat(Number(e.porcentaje_asistencia).toFixed(2)),
      Number(e.porcentaje_asistencia) < 70 ? 'CRÍTICO' : Number(e.porcentaje_asistencia) >= 90 ? 'EXCELENTE' : 'NORMAL',
    ]);

    excel.addTable(ws1,
      ['#', 'Código', 'Nombres', 'Apellidos', 'Total', 'Presentes', 'Ausentes', 'Tardanzas', 'Justificados', 'F. Parciales', '% Asistencia', 'Estado'],
      rows,
      {
        sectionTitle: 'DETALLE POR ESTUDIANTE',
        columnWidths:  [5, 12, 22, 22, 8, 10, 10, 10, 12, 12, 14, 12],
      }
    );

    excel.addFooter(ws1);

    // ── Hoja 2: Críticos ───────────────────────────────────
    const criticos = estudiantes.filter(e => Number(e.porcentaje_asistencia) < 70);

    if (criticos.length > 0) {
      const ws2 = excel.createSheet('Atención Requerida');

      excel.addTitle(ws2, 'ESTUDIANTES CON ASISTENCIA CRÍTICA', 'Asistencia menor al 70%');

      const rowsCrit = criticos.map((e, i) => [
        i + 1,
        e.estudiante_codigo,
        e.estudiante_nombres,
        e.estudiante_apellidos,
        parseInt(e.total_clases),
        parseInt(e.ausentes),
        parseInt(e.faltas_parciales),
        parseFloat(Number(e.porcentaje_asistencia).toFixed(2)),
        `${parseInt(e.total_clases) - parseInt(e.presentes) - parseInt(e.tardanzas) - parseInt(e.justificados)} inasistencias sin justificar`,
      ]);

      excel.addTable(ws2,
        ['#', 'Código', 'Nombres', 'Apellidos', 'Total Clases', 'Ausencias', 'F. Parciales', '% Asistencia', 'Observación'],
        rowsCrit,
        { columnWidths: [5, 12, 22, 22, 12, 10, 12, 14, 35] }
      );

      excel.addFooter(ws2);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename=asistencia-clase-${cabecera.materia_codigo}.xlsx`);

    await excel.write(res);
    res.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — ESTUDIANTE INDIVIDUAL
  // ══════════════════════════════════════════════
  static async _excelEstudiante(res, { estudiante, reporte, detalleDias, fecha_inicio, fecha_fin }) {
    const excel = new ExcelGenerator();

    // ── Hoja 1: Resumen por materia ────────────────────────
    const ws1 = excel.createSheet('Resumen');

    excel.addTitle(ws1,
      'REPORTE INDIVIDUAL DE ASISTENCIA',
      `${estudiante.apellidos}, ${estudiante.nombres} — ${estudiante.codigo}`
    );

    excel.addInfoBox(ws1, [
      { label: 'Estudiante', value: `${estudiante.nombres} ${estudiante.apellidos}` },
      { label: 'Código',     value: estudiante.codigo },
      { label: 'CI',         value: estudiante.ci || 'N/A' },
      { label: 'Grado',      value: `${estudiante.nivel_nombre} — ${estudiante.grado_nombre} "${estudiante.paralelo_nombre}"` },
      { label: 'Período',    value: estudiante.periodo_nombre },
      { label: 'Matrícula',  value: estudiante.numero_matricula },
    ]);

    const rowsResumen = reporte.map((r, i) => [
      i + 1,
      r.materia_nombre,
      parseInt(r.total_clases),
      parseInt(r.presentes),
      parseInt(r.ausentes),
      parseInt(r.tardanzas),
      parseInt(r.justificados),
      parseInt(r.faltas_parciales),
      parseFloat(Number(r.porcentaje_asistencia).toFixed(2)),
    ]);

    excel.addTable(ws1,
      ['#', 'Materia', 'Total', 'Presentes', 'Ausentes', 'Tardanzas', 'Justificados', 'F. Parciales', '% Asistencia'],
      rowsResumen,
      {
        sectionTitle: 'ASISTENCIA POR MATERIA',
        columnWidths: [5, 30, 8, 10, 10, 10, 12, 12, 14],
      }
    );

    excel.addFooter(ws1);

    // ── Hoja 2: Detalle día a día ──────────────────────────
    if (detalleDias.length > 0) {
      const ws2 = excel.createSheet('Detalle Día a Día');

      excel.addTitle(ws2, 'DETALLE DE ASISTENCIA DÍA A DÍA');

      const ESTADO_LABELS = {
        presente: 'Presente', ausente: 'Ausente', tardanza: 'Tardanza',
        justificado: 'Justificado', falta_parcial: 'Falta Parcial',
      };

      const rowsDias = detalleDias.map((d, i) => [
        i + 1,
        formatearFecha(d.fecha + 'T12:00', 'corto'),
        d.materia_nombre,
        ESTADO_LABELS[d.estado] ?? d.estado,
        d.hora_marcacion?.slice(0, 5) || '',
        d.permiso_codigo || '',
        d.justificacion  || '',
        d.observaciones  || '',
      ]);

      excel.addTable(ws2,
        ['#', 'Fecha', 'Materia', 'Estado', 'Hora', 'Código Permiso', 'Justificación', 'Observaciones'],
        rowsDias,
        { columnWidths: [5, 14, 28, 14, 8, 16, 28, 28] }
      );

      excel.addFooter(ws2);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename=asistencia-${estudiante.codigo}.xlsx`);

    await excel.write(res);
    res.end();
  }

  // ══════════════════════════════════════════════
  // 4️⃣  REPORTE POR TRIMESTRES
  //     GET /api/reportes/asistencia/trimestres
  //     ?asignacion_docente_id=X&formato=pdf|excel&tipo=clase|estudiante&matricula_id=Y
  // ══════════════════════════════════════════════
  static async reporteTrimestres(req, res) {
    try {
      const { asignacion_docente_id, formato = 'pdf', tipo = 'clase', matricula_id } = req.query;

      if (!asignacion_docente_id) {
        return res.status(400).json({ success: false, message: 'Se requiere asignacion_docente_id' });
      }
      if (tipo === 'estudiante' && !matricula_id) {
        return res.status(400).json({ success: false, message: 'Se requiere matricula_id cuando tipo=estudiante' });
      }

      const cabQuery = await pool.query(`
        SELECT
          mat.nombre   AS materia_nombre,
          mat.codigo   AS materia_codigo,
          g.nombre     AS grado_nombre,
          n.nombre     AS nivel_nombre,
          par.nombre   AS paralelo_nombre,
          par.aula,
          t.nombre     AS turno_nombre,
          pa.nombre    AS periodo_nombre,
          pa.fecha_inicio AS periodo_inicio,
          pa.fecha_fin    AS periodo_fin,
          CONCAT(d.nombres, ' ', d.apellidos) AS docente_nombre
        FROM asignacion_docente ad
        INNER JOIN grado_materia gm     ON ad.grado_materia_id     = gm.id
        INNER JOIN materia mat          ON gm.materia_id            = mat.id
        INNER JOIN paralelo par         ON ad.paralelo_id           = par.id
        INNER JOIN grado g              ON par.grado_id             = g.id
        INNER JOIN nivel_academico n    ON g.nivel_academico_id     = n.id
        INNER JOIN turno t              ON par.turno_id             = t.id
        INNER JOIN periodo_academico pa ON ad.periodo_academico_id  = pa.id
        INNER JOIN docente d            ON ad.docente_id             = d.id
        WHERE ad.id = $1
      `, [asignacion_docente_id]);

      if (cabQuery.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
      }
      const cabecera = cabQuery.rows[0];

      if (tipo === 'estudiante') {
        const estQuery = await pool.query(`
          SELECT e.codigo, e.nombres, e.apellidos, e.ci, e.foto_url, m.numero_matricula
          FROM matricula m
          INNER JOIN estudiante e ON m.estudiante_id = e.id
          WHERE m.id = $1 AND m.deleted_at IS NULL
        `, [matricula_id]);

        if (estQuery.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
        }

        const trimestresQuery = await pool.query(
          `SELECT * FROM reporte_asistencia_trimestres_estudiante($1, $2)`,
          [matricula_id, asignacion_docente_id]
        );

        const data = { cabecera, estudiante: estQuery.rows[0], trimestres: trimestresQuery.rows };
        return formato === 'excel'
          ? ReportesAsistenciaController._excelTrimestresEstudiante(res, data)
          : ReportesAsistenciaController._pdfTrimestresEstudiante(res, data);
      } else {
        const [detalleQuery, resumenQuery] = await Promise.all([
          pool.query(`SELECT * FROM reporte_asistencia_trimestres_clase($1)`, [asignacion_docente_id]),
          pool.query(`SELECT * FROM resumen_asistencia_trimestres_clase($1)`,  [asignacion_docente_id]),
        ]);

        const data = { cabecera, detalle: detalleQuery.rows, resumen: resumenQuery.rows };
        return formato === 'excel'
          ? ReportesAsistenciaController._excelTrimestresClase(res, data)
          : ReportesAsistenciaController._pdfTrimestresClase(res, data);
      }
    } catch (error) {
      console.error('Error reporte trimestres:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 5️⃣  COMPARATIVO ENTRE MATERIAS
  //     GET /api/reportes/asistencia/comparativo-materias
  //     ?matricula_id=X&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async reporteComparativoMaterias(req, res) {
    try {
      const { matricula_id, formato = 'pdf' } = req.query;

      if (!matricula_id) {
        return res.status(400).json({ success: false, message: 'Se requiere matricula_id' });
      }

      const estQuery = await pool.query(`
        SELECT
          e.codigo, e.nombres, e.apellidos, e.ci,
          g.nombre     AS grado_nombre,
          n.nombre     AS nivel_nombre,
          par.nombre   AS paralelo_nombre,
          pa.nombre    AS periodo_nombre,
          m.numero_matricula
        FROM matricula m
        INNER JOIN estudiante e         ON m.estudiante_id      = e.id
        INNER JOIN paralelo par         ON m.paralelo_id        = par.id
        INNER JOIN grado g              ON par.grado_id         = g.id
        INNER JOIN nivel_academico n    ON g.nivel_academico_id = n.id
        INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
        WHERE m.id = $1 AND m.deleted_at IS NULL
      `, [matricula_id]);

      if (estQuery.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      const reporteQuery = await pool.query(
        `SELECT * FROM reporte_asistencia_estudiante($1, NULL, NULL, NULL)`,
        [matricula_id]
      );

      const data = { estudiante: estQuery.rows[0], materias: reporteQuery.rows };
      return formato === 'excel'
        ? ReportesAsistenciaController._excelComparativoMaterias(res, data)
        : ReportesAsistenciaController._pdfComparativoMaterias(res, data);

    } catch (error) {
      console.error('Error reporte comparativo materias:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ──────────────────────────────────────────────
  // 🔴 PDF — TRIMESTRES CLASE
  // ──────────────────────────────────────────────
  static _pdfTrimestresClase(res, { cabecera, detalle, resumen }) {
    const pdf = new PDFGenerator({ margin: 40, landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=asistencia-trimestres-${cabecera.materia_codigo}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(
      'REPORTE DE ASISTENCIA POR TRIMESTRES',
      `${cabecera.nivel_nombre} — ${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre}`
    );
    pdf.drawInfoBox([
      { label: 'Docente',  value: cabecera.docente_nombre },
      { label: 'Período',  value: cabecera.periodo_nombre },
      { label: 'Turno',    value: cabecera.turno_nombre },
      { label: 'Materia',  value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
    ], 2);

    pdf.drawSection('COMPARATIVO POR TRIMESTRE');
    const rowsResumen = resumen.map(t => [
      t.periodo_nombre,
      `${formatearFecha(t.fecha_inicio + 'T12:00', 'corto')} — ${formatearFecha(t.fecha_fin + 'T12:00', 'corto')}`,
      t.total_estudiantes.toString(),
      t.total_clases.toString(),
      t.presentes.toString(),
      t.ausentes.toString(),
      t.tardanzas.toString(),
      t.justificados.toString(),
      `${Math.round(t.promedio_asistencia ?? 0)}%`,
      t.estudiantes_criticos.toString(),
    ]);
    pdf.drawTable(
      ['Trimestre', 'Período', 'Estud.', 'Clases', 'P', 'A', 'T', 'J', '% Asist.', 'Críticos'],
      rowsResumen,
      { columnWidths: [100, 130, 50, 50, 35, 35, 35, 35, 65, 60] }
    );

    // Agrupar por estudiante
    const porEstudiante = {};
    for (const fila of detalle) {
      const key = fila.matricula_id;
      if (!porEstudiante[key]) {
        porEstudiante[key] = { codigo: fila.estudiante_codigo, nombres: fila.estudiante_nombres, apellidos: fila.estudiante_apellidos, trimestres: [] };
      }
      porEstudiante[key].trimestres.push(fila);
    }

    const nombresTrims = resumen.map(t => t.periodo_nombre);
    pdf.drawSection('DETALLE POR ESTUDIANTE');

    const headers = ['#', 'Código', 'Estudiante'];
    for (const nt of nombresTrims) { headers.push(`${nt} P`, `${nt} A`, `${nt} %`); }
    const columnWidths = [25, 65, 160, ...nombresTrims.flatMap(() => [30, 30, 50])];

    const rowsDetalle = Object.values(porEstudiante).map((est, i) => {
      const fila = [(i + 1).toString(), est.codigo, `${est.apellidos}, ${est.nombres}`];
      for (const nt of nombresTrims) {
        const t = est.trimestres.find(x => x.periodo_nombre === nt);
        fila.push(t ? t.presentes.toString() : '—', t ? t.ausentes.toString() : '—', t ? `${Number(t.porcentaje_asistencia).toFixed(0)}%` : '—');
      }
      return fila;
    });
    pdf.drawTable(headers, rowsDetalle, { columnWidths });
    pdf.end();
  }

  // ──────────────────────────────────────────────
  // 🔴 PDF — TRIMESTRES ESTUDIANTE
  // ──────────────────────────────────────────────
  static _pdfTrimestresEstudiante(res, { cabecera, estudiante, trimestres }) {
    const pdf = new PDFGenerator({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=trimestres-${estudiante.codigo}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(
      'ASISTENCIA POR TRIMESTRES — INDIVIDUAL',
      `${estudiante.apellidos}, ${estudiante.nombres} · ${cabecera.materia_nombre}`
    );
    pdf.drawInfoBox([
      { label: 'Estudiante', value: `${estudiante.nombres} ${estudiante.apellidos}` },
      { label: 'Código',     value: estudiante.codigo },
      { label: 'CI',         value: estudiante.ci || 'N/A' },
      { label: 'Materia',    value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
      { label: 'Docente',    value: cabecera.docente_nombre },
      { label: 'Período',    value: cabecera.periodo_nombre },
    ], 2);

    const totalClases    = trimestres.reduce((a, t) => a + Number(t.total_clases), 0);
    const totalPresentes = trimestres.reduce((a, t) => a + Number(t.presentes), 0);
    const totalTardanzas = trimestres.reduce((a, t) => a + Number(t.tardanzas), 0);
    const totalJustif    = trimestres.reduce((a, t) => a + Number(t.justificados), 0);
    const pctGeneral     = totalClases > 0 ? Math.round(((totalPresentes + totalTardanzas + totalJustif) / totalClases) * 100) : 0;

    pdf.drawSection('RESUMEN ANUAL');
    pdf.drawStatsGrid([
      { label: 'Total Clases',      value: totalClases },
      { label: 'Presentes',         value: totalPresentes },
      { label: 'Ausentes',          value: trimestres.reduce((a, t) => a + Number(t.ausentes), 0) },
      { label: 'Tardanzas',         value: totalTardanzas },
      { label: 'Justificados',      value: totalJustif },
      { label: '% Asistencia Gral', value: `${pctGeneral}%` },
    ], 3);

    pdf.drawSection('DETALLE POR TRIMESTRE');
    const rows = trimestres.map(t => [
      t.periodo_nombre,
      `${formatearFecha(t.fecha_inicio + 'T12:00', 'corto')} — ${formatearFecha(t.fecha_fin + 'T12:00', 'corto')}`,
      t.total_clases.toString(), t.presentes.toString(), t.ausentes.toString(),
      t.tardanzas.toString(), t.justificados.toString(), t.faltas_parciales.toString(),
      `${Number(t.porcentaje_asistencia ?? 0).toFixed(1)}%`,
    ]);
    pdf.drawTable(
      ['Trimestre', 'Período', 'Clases', 'Pres.', 'Aus.', 'Tard.', 'Just.', 'F.Parc.', '% Asist.'],
      rows,
      { columnWidths: [110, 130, 50, 45, 45, 45, 45, 55, 70] }
    );
    pdf.end();
  }

  // ──────────────────────────────────────────────
  // 🔴 PDF — COMPARATIVO MATERIAS
  // ──────────────────────────────────────────────
  static _pdfComparativoMaterias(res, { estudiante, materias }) {
    const pdf = new PDFGenerator({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=comparativo-materias-${estudiante.codigo}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(
      'COMPARATIVO DE ASISTENCIA — TODAS LAS MATERIAS',
      `${estudiante.apellidos}, ${estudiante.nombres} — ${estudiante.codigo}`
    );
    pdf.drawInfoBox([
      { label: 'Estudiante', value: `${estudiante.nombres} ${estudiante.apellidos}` },
      { label: 'Código',     value: estudiante.codigo },
      { label: 'Grado',      value: `${estudiante.nivel_nombre} — ${estudiante.grado_nombre} "${estudiante.paralelo_nombre}"` },
      { label: 'Período',    value: estudiante.periodo_nombre },
      { label: 'Matrícula',  value: estudiante.numero_matricula },
      { label: 'CI',         value: estudiante.ci || 'N/A' },
    ], 2);

    const promedioGeneral = materias.length > 0
      ? Math.round(materias.reduce((a, m) => a + Number(m.porcentaje_asistencia), 0) / materias.length) : 0;
    const criticas    = materias.filter(m => Number(m.porcentaje_asistencia) < 70).length;
    const excelentes  = materias.filter(m => Number(m.porcentaje_asistencia) >= 90).length;

    pdf.drawSection('RESUMEN GENERAL');
    pdf.drawStatsGrid([
      { label: 'Total Materias',      value: materias.length },
      { label: 'Promedio Asistencia', value: `${promedioGeneral}%` },
      { label: 'Excelentes (≥90%)',   value: excelentes },
      { label: 'Críticas (<70%)',     value: criticas },
    ], 4);

    pdf.drawSection('DETALLE POR MATERIA');
    const sorted = [...materias].sort((a, b) => Number(b.porcentaje_asistencia) - Number(a.porcentaje_asistencia));
    const rows = sorted.map((m, i) => [
      (i + 1).toString(), m.materia_nombre,
      m.total_clases.toString(), m.presentes.toString(), m.ausentes.toString(),
      m.tardanzas.toString(), m.justificados.toString(),
      `${Number(m.porcentaje_asistencia).toFixed(1)}%`,
      Number(m.porcentaje_asistencia) < 70 ? 'CRÍTICO' : Number(m.porcentaje_asistencia) >= 90 ? 'EXCELENTE' : 'NORMAL',
    ]);
    pdf.drawTable(
      ['#', 'Materia', 'Clases', 'Pres.', 'Aus.', 'Tard.', 'Just.', '% Asist.', 'Estado'],
      rows,
      { columnWidths: [25, 200, 45, 40, 40, 40, 40, 65, 65] }
    );
    pdf.end();
  }

  // ──────────────────────────────────────────────
  // 🟢 EXCEL — TRIMESTRES CLASE
  // ──────────────────────────────────────────────
  static async _excelTrimestresClase(res, { cabecera, detalle, resumen }) {
    const excel = new ExcelGenerator();
    const ws1   = excel.createSheet('Comparativo Trimestral');

    excel.addTitle(ws1, 'REPORTE DE ASISTENCIA POR TRIMESTRES',
      `${cabecera.grado_nombre} "${cabecera.paralelo_nombre}" · ${cabecera.materia_nombre}`);
    excel.addInfoBox(ws1, [
      { label: 'Docente', value: cabecera.docente_nombre },
      { label: 'Período', value: cabecera.periodo_nombre },
      { label: 'Turno',   value: cabecera.turno_nombre },
      { label: 'Materia', value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
    ]);

    excel.addTable(ws1,
      ['Trimestre', 'Período', 'Estudiantes', 'Total Clases', 'Presentes', 'Ausentes', 'Tardanzas', 'Justificados', 'F. Parciales', '% Asistencia', 'Críticos (<70%)'],
      resumen.map(t => [
        t.periodo_nombre,
        `${formatearFecha(t.fecha_inicio + 'T12:00', 'corto')} — ${formatearFecha(t.fecha_fin + 'T12:00', 'corto')}`,
        parseInt(t.total_estudiantes), parseInt(t.total_clases),
        parseInt(t.presentes), parseInt(t.ausentes), parseInt(t.tardanzas),
        parseInt(t.justificados), parseInt(t.faltas_parciales),
        parseFloat(Number(t.promedio_asistencia ?? 0).toFixed(2)),
        parseInt(t.estudiantes_criticos),
      ]),
      { sectionTitle: 'RESUMEN POR TRIMESTRE', columnWidths: [18,28,12,14,12,12,12,14,14,14,16] }
    );
    excel.addFooter(ws1);

    // Hoja 2: detalle por estudiante
    const ws2 = excel.createSheet('Detalle por Estudiante');
    excel.addTitle(ws2, 'DETALLE DE ASISTENCIA POR ESTUDIANTE Y TRIMESTRE');

    const nombresTrims = resumen.map(t => t.periodo_nombre);
    const headers = ['#', 'Código', 'Nombres', 'Apellidos'];
    for (const nt of nombresTrims) headers.push(`${nt} - P`, `${nt} - A`, `${nt} - T`, `${nt} - J`, `${nt} - %`);
    headers.push('% Anual');

    const porEstudiante = {};
    for (const f of detalle) {
      if (!porEstudiante[f.matricula_id]) {
        porEstudiante[f.matricula_id] = { codigo: f.estudiante_codigo, nombres: f.estudiante_nombres, apellidos: f.estudiante_apellidos, trimestres: {} };
      }
      porEstudiante[f.matricula_id].trimestres[f.periodo_nombre] = f;
    }

    const rowsDetalle = Object.values(porEstudiante).map((est, i) => {
      const fila = [i + 1, est.codigo, est.nombres, est.apellidos];
      let sumaP = 0, sumaC = 0, sumaT = 0, sumaJ = 0;
      for (const nt of nombresTrims) {
        const t = est.trimestres[nt];
        fila.push(t ? parseInt(t.presentes) : 0, t ? parseInt(t.ausentes) : 0, t ? parseInt(t.tardanzas) : 0, t ? parseInt(t.justificados) : 0, t ? parseFloat(Number(t.porcentaje_asistencia ?? 0).toFixed(2)) : 0);
        if (t) { sumaP += parseInt(t.presentes); sumaT += parseInt(t.tardanzas); sumaJ += parseInt(t.justificados); sumaC += parseInt(t.total_clases); }
      }
      fila.push(sumaC > 0 ? parseFloat(((sumaP + sumaT + sumaJ) / sumaC * 100).toFixed(2)) : 0);
      return fila;
    });

    const colWidths = [5, 12, 22, 22, ...nombresTrims.flatMap(() => [8,8,8,8,10]), 10];
    excel.addTable(ws2, headers, rowsDetalle, { sectionTitle: 'ASISTENCIA INDIVIDUAL POR TRIMESTRE', columnWidths: colWidths });
    excel.addFooter(ws2);

    // Hoja 3: críticos
    const criticos = Object.values(porEstudiante).filter(est => Object.values(est.trimestres).some(t => Number(t.porcentaje_asistencia) < 70));
    if (criticos.length > 0) {
      const ws3 = excel.createSheet('Atención Requerida');
      excel.addTitle(ws3, 'ESTUDIANTES CON ASISTENCIA CRÍTICA EN ALGÚN TRIMESTRE');
      const hCrit = ['#', 'Código', 'Nombres', 'Apellidos', ...nombresTrims.map(nt => `${nt} %`), '% Anual', 'Trimestres Críticos'];
      const rCrit = criticos.map((est, i) => {
        const fila = [i + 1, est.codigo, est.nombres, est.apellidos];
        let sumaP = 0, sumaC = 0, sumaT = 0, sumaJ = 0, countCrit = 0;
        for (const nt of nombresTrims) {
          const t = est.trimestres[nt];
          const pct = t ? parseFloat(Number(t.porcentaje_asistencia ?? 0).toFixed(2)) : 0;
          fila.push(pct);
          if (pct < 70 && t && parseInt(t.total_clases) > 0) countCrit++;
          if (t) { sumaP += parseInt(t.presentes); sumaT += parseInt(t.tardanzas); sumaJ += parseInt(t.justificados); sumaC += parseInt(t.total_clases); }
        }
        fila.push(sumaC > 0 ? parseFloat(((sumaP + sumaT + sumaJ) / sumaC * 100).toFixed(2)) : 0, `${countCrit} trimestre(s)`);
        return fila;
      });
      excel.addTable(ws3, hCrit, rCrit, { columnWidths: [5, 12, 22, 22, ...nombresTrims.map(() => 12), 12, 18] });
      excel.addFooter(ws3);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=asistencia-trimestres-${cabecera.materia_codigo}.xlsx`);
    await excel.write(res);
    res.end();
  }

  // ──────────────────────────────────────────────
  // 🟢 EXCEL — TRIMESTRES ESTUDIANTE
  // ──────────────────────────────────────────────
  static async _excelTrimestresEstudiante(res, { cabecera, estudiante, trimestres }) {
    const excel = new ExcelGenerator();
    const ws    = excel.createSheet('Asistencia por Trimestres');

    excel.addTitle(ws, 'ASISTENCIA POR TRIMESTRES — INDIVIDUAL',
      `${estudiante.apellidos}, ${estudiante.nombres} · ${cabecera.materia_nombre}`);
    excel.addInfoBox(ws, [
      { label: 'Estudiante', value: `${estudiante.nombres} ${estudiante.apellidos}` },
      { label: 'Código',     value: estudiante.codigo },
      { label: 'CI',         value: estudiante.ci || 'N/A' },
      { label: 'Materia',    value: `${cabecera.materia_nombre} (${cabecera.materia_codigo})` },
      { label: 'Docente',    value: cabecera.docente_nombre },
      { label: 'Período',    value: cabecera.periodo_nombre },
    ]);

    const tC = trimestres.reduce((a, t) => a + Number(t.total_clases), 0);
    const tP = trimestres.reduce((a, t) => a + Number(t.presentes), 0);
    const tA = trimestres.reduce((a, t) => a + Number(t.ausentes), 0);
    const tT = trimestres.reduce((a, t) => a + Number(t.tardanzas), 0);
    const tJ = trimestres.reduce((a, t) => a + Number(t.justificados), 0);
    const tF = trimestres.reduce((a, t) => a + Number(t.faltas_parciales), 0);
    const pctAnual = tC > 0 ? parseFloat(((tP + tT + tJ) / tC * 100).toFixed(2)) : 0;

    excel.addStats(ws, [
      { label: 'Total Clases',       value: tC },
      { label: 'Presentes',          value: tP },
      { label: 'Ausentes',           value: tA },
      { label: 'Tardanzas',          value: tT },
      { label: 'Justificados',       value: tJ },
      { label: '% Asistencia Anual', value: `${pctAnual}%` },
    ], 3);

    const rows = [
      ...trimestres.map(t => [
        t.periodo_nombre,
        `${formatearFecha(t.fecha_inicio + 'T12:00', 'corto')} — ${formatearFecha(t.fecha_fin + 'T12:00', 'corto')}`,
        parseInt(t.total_clases), parseInt(t.presentes), parseInt(t.ausentes),
        parseInt(t.tardanzas), parseInt(t.justificados), parseInt(t.faltas_parciales),
        parseFloat(Number(t.porcentaje_asistencia ?? 0).toFixed(2)),
        Number(t.porcentaje_asistencia) < 70 ? 'CRÍTICO' : Number(t.porcentaje_asistencia) >= 90 ? 'EXCELENTE' : 'NORMAL',
      ]),
      ['TOTAL ANUAL', '—', tC, tP, tA, tT, tJ, tF, pctAnual,
       pctAnual < 70 ? 'CRÍTICO' : pctAnual >= 90 ? 'EXCELENTE' : 'NORMAL'],
    ];

    excel.addTable(ws,
      ['Trimestre', 'Período', 'Total Clases', 'Presentes', 'Ausentes', 'Tardanzas', 'Justificados', 'F. Parciales', '% Asistencia', 'Estado'],
      rows,
      { sectionTitle: 'DETALLE POR TRIMESTRE', columnWidths: [18, 30, 14, 12, 12, 12, 14, 14, 14, 14] }
    );
    excel.addFooter(ws);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=trimestres-${estudiante.codigo}.xlsx`);
    await excel.write(res);
    res.end();
  }

  // ──────────────────────────────────────────────
  // 🟢 EXCEL — COMPARATIVO MATERIAS
  // ──────────────────────────────────────────────
  static async _excelComparativoMaterias(res, { estudiante, materias }) {
    const excel = new ExcelGenerator();
    const ws    = excel.createSheet('Comparativo Materias');

    excel.addTitle(ws, 'COMPARATIVO DE ASISTENCIA — TODAS LAS MATERIAS',
      `${estudiante.apellidos}, ${estudiante.nombres} — ${estudiante.codigo}`);
    excel.addInfoBox(ws, [
      { label: 'Estudiante', value: `${estudiante.nombres} ${estudiante.apellidos}` },
      { label: 'Código',     value: estudiante.codigo },
      { label: 'CI',         value: estudiante.ci || 'N/A' },
      { label: 'Grado',      value: `${estudiante.nivel_nombre} — ${estudiante.grado_nombre} "${estudiante.paralelo_nombre}"` },
      { label: 'Período',    value: estudiante.periodo_nombre },
      { label: 'Matrícula',  value: estudiante.numero_matricula },
    ]);

    const promedioGeneral = materias.length > 0
      ? parseFloat((materias.reduce((a, m) => a + Number(m.porcentaje_asistencia), 0) / materias.length).toFixed(2)) : 0;

    excel.addStats(ws, [
      { label: 'Total Materias',      value: materias.length },
      { label: 'Promedio Asistencia', value: `${promedioGeneral}%` },
      { label: 'Excelentes (≥90%)',   value: materias.filter(m => Number(m.porcentaje_asistencia) >= 90).length },
      { label: 'Críticas (<70%)',     value: materias.filter(m => Number(m.porcentaje_asistencia) < 70).length },
    ], 2);

    const sorted = [...materias].sort((a, b) => Number(b.porcentaje_asistencia) - Number(a.porcentaje_asistencia));
    excel.addTable(ws,
      ['#', 'Materia', 'Total Clases', 'Presentes', 'Ausentes', 'Tardanzas', 'Justificados', 'F. Parciales', '% Asistencia', 'Estado'],
      sorted.map((m, i) => [
        i + 1, m.materia_nombre,
        parseInt(m.total_clases), parseInt(m.presentes), parseInt(m.ausentes),
        parseInt(m.tardanzas), parseInt(m.justificados), parseInt(m.faltas_parciales),
        parseFloat(Number(m.porcentaje_asistencia).toFixed(2)),
        Number(m.porcentaje_asistencia) < 70 ? 'CRÍTICO' : Number(m.porcentaje_asistencia) >= 90 ? 'EXCELENTE' : 'NORMAL',
      ]),
      { sectionTitle: 'ASISTENCIA POR MATERIA (ordenado por % descendente)', columnWidths: [5,32,14,12,12,12,14,14,14,14] }
    );
    excel.addFooter(ws);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=comparativo-materias-${estudiante.codigo}.xlsx`);
    await excel.write(res);
    res.end();
  }
}

export default ReportesAsistenciaController;