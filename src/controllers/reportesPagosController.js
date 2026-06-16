// controllers/reportesPagosController.js
import { pool }         from '../db/pool.js';
import PDFGenerator     from '../services/reportes/pdfGenerator.js';
import ExcelGenerator   from '../services/reportes/excelGenerator.js';
import { formatearFecha } from '../services/reportes/reportStyles.js';

class ReportesPagosController {

  // ══════════════════════════════════════════════
  // HELPER: datos del período activo
  // ══════════════════════════════════════════════
  static async _getPeriodo(periodo_academico_id) {
    const r = await pool.query(
      `SELECT id, nombre, codigo, fecha_inicio, fecha_fin
       FROM periodo_academico WHERE id = $1`,
      [periodo_academico_id]
    );
    return r.rows[0] ?? null;
  }

  // ══════════════════════════════════════════════
  // 1️⃣  ESTADO DE CUENTA POR ESTUDIANTE
  //     GET /api/reportes-pagos/exportar/estado-cuenta
  //     ?periodo_academico_id=X&formato=pdf|excel&grado_id=Y&paralelo_id=Z
  // ══════════════════════════════════════════════
  static async exportarEstadoCuenta(req, res) {
    try {
      const { periodo_academico_id, formato = 'pdf', grado_id, paralelo_id } = req.query;
      if (!periodo_academico_id)
        return res.status(400).json({ success: false, message: 'Se requiere periodo_academico_id' });

      const periodo = await ReportesPagosController._getPeriodo(periodo_academico_id);
      if (!periodo)
        return res.status(404).json({ success: false, message: 'Período no encontrado' });

      // Misma query que ReportesPagosController.estadoEstudiantes
      let whereConditions = ['mat.estado = \'activo\'', 'mat.deleted_at IS NULL'];
      let queryParams = [];
      let paramCounter = 1;

      whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
      queryParams.push(parseInt(periodo_academico_id));
      paramCounter++;

      if (grado_id) {
        whereConditions.push(`g.id = $${paramCounter}`);
        queryParams.push(parseInt(grado_id));
        paramCounter++;
      }
      if (paralelo_id) {
        whereConditions.push(`p.id = $${paramCounter}`);
        queryParams.push(parseInt(paralelo_id));
        paramCounter++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      const result = await pool.query(`
        SELECT
          e.id as estudiante_id,
          e.codigo as estudiante_codigo,
          e.nombres,
          e.apellidos,
          g.nombre as grado,
          p.nombre as paralelo,
          mat.es_becado,
          mat.porcentaje_beca,
          COUNT(m.id) as total_mensualidades,
          COUNT(CASE WHEN m.estado = 'pagado' THEN 1 END) as mensualidades_pagadas,
          COUNT(CASE WHEN m.estado IN ('pendiente','vencido') THEN 1 END) as mensualidades_pendientes,
          COUNT(CASE WHEN m.estado = 'vencido' THEN 1 END) as mensualidades_vencidas,
          COALESCE(SUM(m.monto_final), 0) as monto_total,
          COALESCE(SUM(CASE WHEN m.estado = 'pagado' THEN m.monto_final ELSE 0 END), 0) as monto_pagado,
          COALESCE(SUM(CASE WHEN m.estado IN ('pendiente','vencido') THEN m.monto_final ELSE 0 END), 0) as monto_pendiente
        FROM estudiante e
        INNER JOIN matricula mat ON e.id = mat.estudiante_id
        INNER JOIN paralelo p ON mat.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        LEFT JOIN mensualidad m ON mat.id = m.matricula_id
        ${whereClause}
        GROUP BY e.id, e.codigo, e.nombres, e.apellidos, g.nombre, p.nombre,
                 mat.es_becado, mat.porcentaje_beca
        ORDER BY e.apellidos ASC, e.nombres ASC
      `, queryParams);

      const estudiantes = result.rows;

      const totales = estudiantes.reduce(
        (acc, est) => ({
          pagado:    acc.pagado    + parseFloat(est.monto_pagado),
          pendiente: acc.pendiente + parseFloat(est.monto_pendiente),
          total:     acc.total     + parseFloat(est.monto_total),
        }),
        { pagado: 0, pendiente: 0, total: 0 }
      );

      const becados = estudiantes.filter(e => e.es_becado).length;
      const alDia   = estudiantes.filter(e => parseInt(e.mensualidades_vencidas) === 0).length;

      const data = { periodo, estudiantes, totales, stats: { total: estudiantes.length, becados, alDia } };

      return formato === 'excel'
        ? ReportesPagosController._excelEstadoCuenta(res, data)
        : ReportesPagosController._pdfEstadoCuenta(res, data);

    } catch (error) {
      console.error('Error exportar estado cuenta:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 2️⃣  REPORTE DE MOROSOS
  //     GET /api/reportes-pagos/exportar/morosos
  //     ?periodo_academico_id=X&formato=pdf|excel&dias_mora_minimo=Y
  // ══════════════════════════════════════════════
  static async exportarMorosos(req, res) {
    try {
      const { periodo_academico_id, formato = 'pdf', dias_mora_minimo = 1, grado_id, paralelo_id } = req.query;
      if (!periodo_academico_id)
        return res.status(400).json({ success: false, message: 'Se requiere periodo_academico_id' });

      const periodo = await ReportesPagosController._getPeriodo(periodo_academico_id);
      if (!periodo)
        return res.status(404).json({ success: false, message: 'Período no encontrado' });

      let whereConditions = [
        "m.estado IN ('pendiente', 'vencido')",
        'm.fecha_vencimiento < CURRENT_DATE',
        "mat.estado = 'activo'",
        'mat.deleted_at IS NULL',
      ];
      let queryParams = [];
      let paramCounter = 1;

      whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
      queryParams.push(parseInt(periodo_academico_id));
      paramCounter++;

      if (grado_id) {
        whereConditions.push(`g.id = $${paramCounter}`);
        queryParams.push(parseInt(grado_id));
        paramCounter++;
      }
      if (paralelo_id) {
        whereConditions.push(`p.id = $${paramCounter}`);
        queryParams.push(parseInt(paralelo_id));
        paramCounter++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      let result = await pool.query(`
        SELECT
          e.id as estudiante_id,
          e.codigo,
          e.nombres,
          e.apellidos,
          g.nombre as grado,
          p.nombre as paralelo,
          m.numero_cuota,
          m.mes_correspondiente,
          m.fecha_vencimiento,
          m.monto_final,
          m.estado,
          CURRENT_DATE - m.fecha_vencimiento as dias_mora,
          (m.monto_final - COALESCE((
            SELECT SUM(pm.monto_pagado)
            FROM pago_mensualidad pm
            WHERE pm.mensualidad_id = m.id AND NOT pm.anulado
          ), 0)) as saldo_pendiente
        FROM mensualidad m
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        INNER JOIN estudiante e ON mat.estudiante_id = e.id
        INNER JOIN paralelo p ON mat.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        ${whereClause}
        ORDER BY dias_mora DESC, e.apellidos ASC
      `, queryParams);

      const minDias = parseInt(dias_mora_minimo);
      const morosos = result.rows.filter(r => r.dias_mora >= minDias);

      const deudaTotal    = morosos.reduce((s, m) => s + parseFloat(m.monto_final), 0);
      const estudiantesSet = new Set(morosos.map(m => m.estudiante_id));

      // Agrupar por tramo de mora
      const tramos = { leve: 0, moderado: 0, grave: 0 };
      morosos.forEach(m => {
        if (m.dias_mora < 7)       tramos.leve++;
        else if (m.dias_mora < 30) tramos.moderado++;
        else                       tramos.grave++;
      });

      const data = {
        periodo,
        morosos,
        stats: {
          total:      morosos.length,
          estudiantes: estudiantesSet.size,
          deudaTotal,
          leve:       tramos.leve,
          moderado:   tramos.moderado,
          grave:      tramos.grave,
        },
      };

      return formato === 'excel'
        ? ReportesPagosController._excelMorosos(res, data)
        : ReportesPagosController._pdfMorosos(res, data);

    } catch (error) {
      console.error('Error exportar morosos:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 3️⃣  REPORTE DE INGRESOS
  //     GET /api/reportes-pagos/exportar/ingresos
  //     ?periodo_academico_id=X&formato=pdf|excel
  // ══════════════════════════════════════════════
  static async exportarIngresos(req, res) {
    try {
      const { periodo_academico_id, formato = 'pdf', mes_inicio, mes_fin } = req.query;
      if (!periodo_academico_id)
        return res.status(400).json({ success: false, message: 'Se requiere periodo_academico_id' });

      const periodo = await ReportesPagosController._getPeriodo(periodo_academico_id);
      if (!periodo)
        return res.status(404).json({ success: false, message: 'Período no encontrado' });

      let whereConditions = ['NOT pm.anulado', `mat.periodo_academico_id = $1`];
      let queryParams = [parseInt(periodo_academico_id)];
      let paramCounter = 2;

      if (mes_inicio) {
        whereConditions.push(`pm.fecha_pago >= $${paramCounter}::date`);
        queryParams.push(mes_inicio);
        paramCounter++;
      }
      if (mes_fin) {
        whereConditions.push(`pm.fecha_pago <= $${paramCounter}::date`);
        queryParams.push(mes_fin);
        paramCounter++;
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Ingresos por mes
      const ingresosMes = await pool.query(`
        SELECT
          DATE_TRUNC('month', pm.fecha_pago) as mes,
          TO_CHAR(pm.fecha_pago, 'TMMonth YYYY') as mes_nombre,
          COUNT(pm.id) as cantidad_pagos,
          SUM(pm.monto_pagado) as total_ingreso,
          COUNT(DISTINCT mat.estudiante_id) as estudiantes_distintos
        FROM pago_mensualidad pm
        INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        ${whereClause}
        GROUP BY DATE_TRUNC('month', pm.fecha_pago), TO_CHAR(pm.fecha_pago, 'TMMonth YYYY')
        ORDER BY mes DESC
      `, queryParams);

      // Ingresos por método de pago
      const ingresosMet = await pool.query(`
        SELECT
          COALESCE(pm.metodo_pago, 'sin_metodo') as metodo_pago,
          COUNT(pm.id) as cantidad,
          SUM(pm.monto_pagado) as total
        FROM pago_mensualidad pm
        INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        ${whereClause}
        GROUP BY pm.metodo_pago
        ORDER BY total DESC
      `, queryParams);

      // Detalle de pagos individuales (para tabla)
      const detalle = await pool.query(`
        SELECT
          pm.codigo_pago,
          pm.fecha_pago,
          pm.monto_pagado,
          pm.metodo_pago,
          pm.numero_comprobante,
          pm.entrego_factura,
          pm.numero_factura,
          m.mes_correspondiente,
          m.numero_cuota,
          e.codigo as estudiante_codigo,
          e.nombres,
          e.apellidos,
          g.nombre as grado,
          p.nombre as paralelo
        FROM pago_mensualidad pm
        INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        INNER JOIN estudiante e ON mat.estudiante_id = e.id
        INNER JOIN paralelo p ON mat.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        ${whereClause}
        ORDER BY pm.fecha_pago DESC, e.apellidos ASC
      `, queryParams);

      const totalIngresos = ingresosMes.rows.reduce((s, r) => s + parseFloat(r.total_ingreso), 0);
      const totalPagos    = ingresosMes.rows.reduce((s, r) => s + parseInt(r.cantidad_pagos), 0);

      const data = {
        periodo,
        ingresosPorMes:    ingresosMes.rows,
        ingresosPorMetodo: ingresosMet.rows,
        detalle:           detalle.rows,
        stats: { totalIngresos, totalPagos },
      };

      return formato === 'excel'
        ? ReportesPagosController._excelIngresos(res, data)
        : ReportesPagosController._pdfIngresos(res, data);

    } catch (error) {
      console.error('Error exportar ingresos:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — ESTADO DE CUENTA
  // ══════════════════════════════════════════════
  static _pdfEstadoCuenta(res, { periodo, estudiantes, totales, stats }) {
    const pdf = new PDFGenerator({ margin: 40, landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=estado-cuenta-${periodo.codigo ?? periodo.id}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(
      'ESTADO DE CUENTA — MENSUALIDADES',
      `Período: ${periodo.nombre}`
    );

    pdf.drawInfoBox([
      { label: 'Período',         value: periodo.nombre },
      { label: 'Fecha de inicio', value: formatearFecha(periodo.fecha_inicio, 'corto') },
      { label: 'Fecha fin',       value: formatearFecha(periodo.fecha_fin, 'corto') },
      { label: 'Generado',        value: formatearFecha(new Date(), 'largo') },
    ], 2);

    pdf.drawSection('RESUMEN GENERAL');
    pdf.drawStatsGrid([
      { label: 'Total Estudiantes', value: stats.total },
      { label: 'Al Día',            value: stats.alDia },
      { label: 'Con Becas',         value: stats.becados },
      { label: 'Total Recaudado',   value: `Bs ${totales.pagado.toFixed(2)}` },
      { label: 'Total Pendiente',   value: `Bs ${totales.pendiente.toFixed(2)}` },
      { label: 'Monto Total',       value: `Bs ${totales.total.toFixed(2)}` },
    ], 3);

    pdf.drawSection('DETALLE POR ESTUDIANTE');
    const headers = [
      '#', 'Código', 'Estudiante', 'Grado / Paralelo', 'Beca',
      'Pagadas', 'Pendientes', 'Vencidas',
      'Monto Pagado', 'Monto Pendiente',
    ];
    const colWidths = [25, 65, 150, 90, 55, 55, 65, 55, 90, 90];

    const rows = estudiantes.map((est, i) => [
      (i + 1).toString(),
      est.estudiante_codigo,
      `${est.apellidos}, ${est.nombres}`,
      `${est.grado} — ${est.paralelo}`,
      est.es_becado ? `${est.porcentaje_beca}%` : '—',
      est.mensualidades_pagadas.toString(),
      est.mensualidades_pendientes.toString(),
      est.mensualidades_vencidas.toString(),
      `Bs ${parseFloat(est.monto_pagado).toFixed(2)}`,
      `Bs ${parseFloat(est.monto_pendiente).toFixed(2)}`,
    ]);

    pdf.drawTable(headers, rows, { columnWidths: colWidths });
    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — MOROSOS
  // ══════════════════════════════════════════════
  static _pdfMorosos(res, { periodo, morosos, stats }) {
    const pdf = new PDFGenerator({ margin: 40, landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=morosos-${periodo.codigo ?? periodo.id}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(
      'REPORTE DE MOROSOS',
      `Período: ${periodo.nombre}`
    );

    pdf.drawInfoBox([
      { label: 'Período',   value: periodo.nombre },
      { label: 'Generado',  value: formatearFecha(new Date(), 'largo') },
    ], 2);

    pdf.drawSection('RESUMEN DE MOROSIDAD');
    pdf.drawStatsGrid([
      { label: 'Total Cuotas Vencidas', value: stats.total },
      { label: 'Estudiantes Morosos',   value: stats.estudiantes },
      { label: 'Deuda Total',           value: `Bs ${stats.deudaTotal.toFixed(2)}` },
      { label: 'Mora < 7 días',         value: stats.leve },
      { label: 'Mora 7–30 días',        value: stats.moderado },
      { label: 'Mora > 30 días',        value: stats.grave },
    ], 3);

    pdf.drawSection('DETALLE DE MOROSOS');
    const headers = [
      '#', 'Código', 'Estudiante', 'Grado / Paralelo',
      'Cuota', 'Mes', 'Vencimiento', 'Días Mora', 'Saldo Pendiente',
    ];
    const colWidths = [25, 65, 150, 90, 45, 80, 75, 65, 95];

    const rows = morosos.map((m, i) => [
      (i + 1).toString(),
      m.codigo,
      `${m.apellidos}, ${m.nombres}`,
      `${m.grado} — ${m.paralelo}`,
      `Cuota ${m.numero_cuota}`,
      m.mes_correspondiente,
      formatearFecha(m.fecha_vencimiento, 'corto'),
      `${m.dias_mora} días`,
      `Bs ${parseFloat(m.monto_final).toFixed(2)}`,
    ]);

    pdf.drawTable(headers, rows, { columnWidths: colWidths });
    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🔴 PDF — INGRESOS
  // ══════════════════════════════════════════════
  static _pdfIngresos(res, { periodo, ingresosPorMes, ingresosPorMetodo, detalle, stats }) {
    const pdf = new PDFGenerator({ margin: 40, landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ingresos-${periodo.codigo ?? periodo.id}.pdf`);
    pdf.pipe(res);

    pdf.drawHeader(
      'REPORTE DE INGRESOS',
      `Período: ${periodo.nombre}`
    );

    pdf.drawInfoBox([
      { label: 'Período',  value: periodo.nombre },
      { label: 'Generado', value: formatearFecha(new Date(), 'largo') },
    ], 2);

    pdf.drawSection('RESUMEN DE INGRESOS');
    pdf.drawStatsGrid([
      { label: 'Total Recaudado', value: `Bs ${stats.totalIngresos.toFixed(2)}` },
      { label: 'Total Pagos',     value: stats.totalPagos },
      ...ingresosPorMetodo.map(m => ({
        label: m.metodo_pago === 'sin_metodo' ? 'Sin método' : m.metodo_pago.charAt(0).toUpperCase() + m.metodo_pago.slice(1),
        value: `Bs ${parseFloat(m.total).toFixed(2)}`,
      })),
    ], 3);

    pdf.drawSection('INGRESOS POR MES');
    pdf.drawTable(
      ['Mes', 'Cantidad Pagos', 'Estudiantes', 'Total Ingreso'],
      ingresosPorMes.map(r => [
        r.mes_nombre,
        r.cantidad_pagos.toString(),
        r.estudiantes_distintos.toString(),
        `Bs ${parseFloat(r.total_ingreso).toFixed(2)}`,
      ]),
      { columnWidths: [180, 120, 120, 150] }
    );

    pdf.drawSection('DETALLE DE PAGOS');
    const headers = [
      '#', 'Código Pago', 'Fecha', 'Estudiante', 'Grado', 'Cuota / Mes', 'Método', 'Monto',
    ];
    const colWidths = [25, 90, 70, 160, 80, 100, 80, 85];

    const rows = detalle.map((p, i) => [
      (i + 1).toString(),
      p.codigo_pago,
      formatearFecha(p.fecha_pago, 'corto'),
      `${p.apellidos}, ${p.nombres}`,
      `${p.grado} — ${p.paralelo}`,
      `C${p.numero_cuota} — ${p.mes_correspondiente}`,
      p.metodo_pago ?? '—',
      `Bs ${parseFloat(p.monto_pagado).toFixed(2)}`,
    ]);

    pdf.drawTable(headers, rows, { columnWidths: colWidths });
    pdf.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — ESTADO DE CUENTA
  // ══════════════════════════════════════════════
  static async _excelEstadoCuenta(res, { periodo, estudiantes, totales, stats }) {
    const excel = new ExcelGenerator();
    const ws    = excel.createSheet('Estado de Cuenta');

    excel.addTitle(
      ws,
      'ESTADO DE CUENTA — MENSUALIDADES',
      `Período: ${periodo.nombre}`
    );
    excel.addInfoBox(ws, [
      { label: 'Período',         value: periodo.nombre },
      { label: 'Fecha de inicio', value: formatearFecha(periodo.fecha_inicio, 'corto') },
      { label: 'Fecha fin',       value: formatearFecha(periodo.fecha_fin, 'corto') },
      { label: 'Generado',        value: formatearFecha(new Date(), 'largo') },
    ]);
    excel.addStats(ws, [
      { label: 'Total Estudiantes', value: stats.total },
      { label: 'Al Día',            value: stats.alDia },
      { label: 'Con Becas',         value: stats.becados },
      { label: 'Total Recaudado',   value: `Bs ${totales.pagado.toFixed(2)}` },
      { label: 'Total Pendiente',   value: `Bs ${totales.pendiente.toFixed(2)}` },
      { label: 'Monto Total',       value: `Bs ${totales.total.toFixed(2)}` },
    ], 3);

    const headers = [
      '#', 'Código', 'Nombres', 'Apellidos', 'Grado', 'Paralelo', 'Beca (%)',
      'Total Cuotas', 'Pagadas', 'Pendientes', 'Vencidas',
      'Monto Total', 'Monto Pagado', 'Monto Pendiente',
    ];
    const rows = estudiantes.map((est, i) => [
      i + 1,
      est.estudiante_codigo,
      est.nombres,
      est.apellidos,
      est.grado,
      est.paralelo,
      est.es_becado ? parseFloat(est.porcentaje_beca) : '',
      parseInt(est.total_mensualidades),
      parseInt(est.mensualidades_pagadas),
      parseInt(est.mensualidades_pendientes),
      parseInt(est.mensualidades_vencidas),
      parseFloat(parseFloat(est.monto_total).toFixed(2)),
      parseFloat(parseFloat(est.monto_pagado).toFixed(2)),
      parseFloat(parseFloat(est.monto_pendiente).toFixed(2)),
    ]);

    excel.addTable(ws, headers, rows, {
      sectionTitle: 'DETALLE POR ESTUDIANTE',
      columnWidths: [5, 12, 22, 22, 14, 12, 10, 12, 10, 12, 10, 14, 14, 16],
    });
    excel.addFooter(ws);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=estado-cuenta-${periodo.codigo ?? periodo.id}.xlsx`);
    await excel.write(res);
    res.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — MOROSOS
  // ══════════════════════════════════════════════
  static async _excelMorosos(res, { periodo, morosos, stats }) {
    const excel = new ExcelGenerator();

    // Hoja 1: Detalle completo
    const ws1 = excel.createSheet('Morosos');
    excel.addTitle(ws1, 'REPORTE DE MOROSOS', `Período: ${periodo.nombre}`);
    excel.addInfoBox(ws1, [
      { label: 'Período',  value: periodo.nombre },
      { label: 'Generado', value: formatearFecha(new Date(), 'largo') },
    ]);
    excel.addStats(ws1, [
      { label: 'Total Cuotas Vencidas', value: stats.total },
      { label: 'Estudiantes Morosos',   value: stats.estudiantes },
      { label: 'Deuda Total',           value: `Bs ${stats.deudaTotal.toFixed(2)}` },
      { label: 'Mora < 7 días',         value: stats.leve },
      { label: 'Mora 7–30 días',        value: stats.moderado },
      { label: 'Mora > 30 días',        value: stats.grave },
    ], 3);

    const headers1 = [
      '#', 'Código', 'Nombres', 'Apellidos', 'Grado', 'Paralelo',
      'N° Cuota', 'Mes', 'Vencimiento', 'Días Mora', 'Monto Vencido',
    ];
    const rows1 = morosos.map((m, i) => [
      i + 1,
      m.codigo,
      m.nombres,
      m.apellidos,
      m.grado,
      m.paralelo,
      parseInt(m.numero_cuota),
      m.mes_correspondiente,
      formatearFecha(m.fecha_vencimiento, 'corto'),
      parseInt(m.dias_mora),
      parseFloat(parseFloat(m.monto_final).toFixed(2)),
    ]);

    excel.addTable(ws1, headers1, rows1, {
      sectionTitle: 'DETALLE DE MOROSOS',
      columnWidths: [5, 12, 22, 22, 14, 12, 10, 18, 14, 12, 16],
    });
    excel.addFooter(ws1);

    // Hoja 2: Resumen por estudiante (consolidado)
    const ws2 = excel.createSheet('Resumen por Estudiante');
    excel.addTitle(ws2, 'RESUMEN MOROSOS POR ESTUDIANTE');

    // Agrupar por estudiante
    const porEst = morosos.reduce((acc, m) => {
      if (!acc[m.estudiante_id]) {
        acc[m.estudiante_id] = {
          codigo: m.codigo, nombres: m.nombres, apellidos: m.apellidos,
          grado: m.grado, paralelo: m.paralelo,
          cuotas: 0, deuda: 0, max_mora: 0,
        };
      }
      acc[m.estudiante_id].cuotas++;
      acc[m.estudiante_id].deuda += parseFloat(m.monto_final);
      acc[m.estudiante_id].max_mora = Math.max(acc[m.estudiante_id].max_mora, parseInt(m.dias_mora));
      return acc;
    }, {});

    const headers2 = ['#', 'Código', 'Nombres', 'Apellidos', 'Grado', 'Paralelo', 'Cuotas Vencidas', 'Deuda Total', 'Mora Máxima (días)'];
    const rows2    = Object.values(porEst).map((e, i) => [
      i + 1, e.codigo, e.nombres, e.apellidos, e.grado, e.paralelo,
      e.cuotas, parseFloat(e.deuda.toFixed(2)), e.max_mora,
    ]);

    excel.addTable(ws2, headers2, rows2, {
      sectionTitle: 'CONSOLIDADO POR ESTUDIANTE',
      columnWidths: [5, 12, 22, 22, 14, 12, 16, 16, 18],
    });
    excel.addFooter(ws2);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=morosos-${periodo.codigo ?? periodo.id}.xlsx`);
    await excel.write(res);
    res.end();
  }

  // ══════════════════════════════════════════════
  // 🟢 EXCEL — INGRESOS
  // ══════════════════════════════════════════════
  static async _excelIngresos(res, { periodo, ingresosPorMes, ingresosPorMetodo, detalle, stats }) {
    const excel = new ExcelGenerator();

    // Hoja 1: Resumen mensual
    const ws1 = excel.createSheet('Ingresos por Mes');
    excel.addTitle(ws1, 'REPORTE DE INGRESOS', `Período: ${periodo.nombre}`);
    excel.addInfoBox(ws1, [
      { label: 'Período',  value: periodo.nombre },
      { label: 'Generado', value: formatearFecha(new Date(), 'largo') },
    ]);
    excel.addStats(ws1, [
      { label: 'Total Recaudado', value: `Bs ${stats.totalIngresos.toFixed(2)}` },
      { label: 'Total Pagos',     value: stats.totalPagos },
      ...ingresosPorMetodo.map(m => ({
        label: m.metodo_pago === 'sin_metodo' ? 'Sin método' : m.metodo_pago.charAt(0).toUpperCase() + m.metodo_pago.slice(1),
        value: `Bs ${parseFloat(m.total).toFixed(2)}`,
      })),
    ], 3);

    excel.addTable(ws1,
      ['Mes', 'Cantidad de Pagos', 'Estudiantes', 'Total Ingreso (Bs)'],
      ingresosPorMes.map(r => [
        r.mes_nombre,
        parseInt(r.cantidad_pagos),
        parseInt(r.estudiantes_distintos),
        parseFloat(parseFloat(r.total_ingreso).toFixed(2)),
      ]),
      { sectionTitle: 'INGRESOS POR MES', columnWidths: [22, 18, 16, 20] }
    );

    // Hoja 2: Por método de pago
    const ws2 = excel.createSheet('Por Método de Pago');
    excel.addTitle(ws2, 'INGRESOS POR MÉTODO DE PAGO');
    excel.addTable(ws2,
      ['Método de Pago', 'Cantidad', 'Total (Bs)'],
      ingresosPorMetodo.map(m => [
        m.metodo_pago === 'sin_metodo' ? 'Sin método' : m.metodo_pago,
        parseInt(m.cantidad),
        parseFloat(parseFloat(m.total).toFixed(2)),
      ]),
      { columnWidths: [22, 14, 20] }
    );
    excel.addFooter(ws2);

    // Hoja 3: Detalle completo
    const ws3 = excel.createSheet('Detalle Pagos');
    excel.addTitle(ws3, 'DETALLE DE PAGOS REGISTRADOS');
    const headers3 = [
      '#', 'Código Pago', 'Fecha', 'Estudiante Código',
      'Nombres', 'Apellidos', 'Grado', 'Paralelo',
      'N° Cuota', 'Mes', 'Método', 'Monto (Bs)', 'Comprobante', 'Factura',
    ];
    const rows3 = detalle.map((p, i) => [
      i + 1,
      p.codigo_pago,
      formatearFecha(p.fecha_pago, 'corto'),
      p.estudiante_codigo,
      p.nombres,
      p.apellidos,
      p.grado,
      p.paralelo,
      parseInt(p.numero_cuota),
      p.mes_correspondiente,
      p.metodo_pago ?? '—',
      parseFloat(parseFloat(p.monto_pagado).toFixed(2)),
      p.numero_comprobante ?? '—',
      p.entrego_factura ? (p.numero_factura ?? 'Sí') : 'No',
    ]);

    excel.addTable(ws3, headers3, rows3, {
      sectionTitle: 'DETALLE COMPLETO',
      columnWidths: [5, 16, 12, 14, 22, 22, 14, 12, 10, 18, 14, 14, 14, 10],
    });
    excel.addFooter(ws3);
    excel.addFooter(ws1);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ingresos-${periodo.codigo ?? periodo.id}.xlsx`);
    await excel.write(res);
    res.end();
  }
}

export default ReportesPagosController;