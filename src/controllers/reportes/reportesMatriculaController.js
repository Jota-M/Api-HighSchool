import { pool } from '../../db/pool.js';
import PDFGenerator from '../../services/reportes/pdfGenerator.js';
import ExcelGenerator from '../../services/reportes/excelGenerator.js';
import { formatearFecha, formatearTelefono } from '../../services/reportes/reportStyles.js';

class ReportesMatriculaController {
  
  // ==========================================
  // 1️⃣ REPORTE GRUPAL POR PARALELO (PDF/EXCEL)
  // ==========================================
  static async reporteParalelo(req, res) {
    try {
      const { paralelo_id, periodo_id, formato = 'pdf' } = req.query;

      if (!paralelo_id || !periodo_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere paralelo_id y periodo_id'
        });
      }

      // Obtener datos del paralelo
      const paraleloQuery = await pool.query(`
        SELECT 
          p.*,
          g.nombre as grado_nombre,
          n.nombre as nivel_nombre,
          t.nombre as turno_nombre,
          t.hora_inicio,
          t.hora_fin,
          pa.nombre as periodo_nombre,
          pa.fecha_inicio as periodo_inicio,
          pa.fecha_fin as periodo_fin
        FROM paralelo p
        INNER JOIN grado g ON p.grado_id = g.id
        INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
        INNER JOIN turno t ON p.turno_id = t.id
        CROSS JOIN periodo_academico pa
        WHERE p.id = $1 AND pa.id = $2
          AND p.deleted_at IS NULL
      `, [paralelo_id, periodo_id]);

      if (paraleloQuery.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Paralelo o periodo no encontrado'
        });
      }

      const paralelo = paraleloQuery.rows[0];

      // Obtener estudiantes matriculados
      const estudiantesQuery = await pool.query(`
        SELECT 
          e.codigo,
          e.nombres,
          e.apellidos,
          e.ci,
          e.fecha_nacimiento,
          e.genero,
          e.telefono,
          e.email,
          e.direccion,
          e.zona,
          m.numero_matricula,
          m.fecha_matricula,
          m.estado as estado_matricula,
          m.es_repitente,
          m.es_becado,
          m.porcentaje_beca,
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'nombres', pf.nombres,
                'apellidos', pf.apellidos,
                'telefono', pf.telefono,
                'celular', pf.celular,
                'parentesco', pf.parentesco
              )
            )
            FROM estudiante_tutor et
            INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
            WHERE et.estudiante_id = e.id 
              AND et.es_tutor_principal = true
              AND pf.deleted_at IS NULL
          ) as tutores
        FROM matricula m
        INNER JOIN estudiante e ON m.estudiante_id = e.id
        WHERE m.paralelo_id = $1 
          AND m.periodo_academico_id = $2
          AND m.deleted_at IS NULL
          AND e.deleted_at IS NULL
        ORDER BY e.apellidos, e.nombres
      `, [paralelo_id, periodo_id]);

      const estudiantes = estudiantesQuery.rows;

      // Estadísticas
      const stats = {
        total_estudiantes: estudiantes.length,
        masculino: estudiantes.filter(e => e.genero === 'masculino').length,
        femenino: estudiantes.filter(e => e.genero === 'femenino').length,
        becados: estudiantes.filter(e => e.es_becado).length,
        repitentes: estudiantes.filter(e => e.es_repitente).length,
        capacidad_disponible: paralelo.capacidad_maxima - estudiantes.length
      };

      const data = { paralelo, estudiantes, stats };

      if (formato === 'excel') {
        // ✅ CORRECTO: llamar al método estático
        return await ReportesMatriculaController._generarExcelParalelo(res, data);
      } else {
        // ✅ CORRECTO: llamar al método estático
        return await ReportesMatriculaController._generarPDFParalelo(res, data);
      }

    } catch (error) {
      console.error('Error al generar reporte de paralelo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte: ' + error.message
      });
    }
  }

  // ==========================================
  // 2️⃣ REPORTE INDIVIDUAL DE ESTUDIANTE
  // ==========================================
  static async reporteEstudiante(req, res) {
    try {
      const { estudiante_id, formato = 'pdf' } = req.query;

      if (!estudiante_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere estudiante_id'
        });
      }

      // Datos del estudiante
      const estudianteQuery = await pool.query(`
        SELECT 
          e.*,
          u.username,
          u.email as usuario_email
        FROM estudiante e
        LEFT JOIN usuarios u ON e.usuario_id = u.id
        WHERE e.id = $1 AND e.deleted_at IS NULL
      `, [estudiante_id]);

      if (estudianteQuery.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      const estudiante = estudianteQuery.rows[0];

      // Historial de matrículas
      const matriculasQuery = await pool.query(`
        SELECT 
          m.*,
          pa.nombre as periodo,
          EXTRACT(YEAR FROM pa.fecha_inicio) as periodo_anio,
          g.nombre as grado,
          n.nombre as nivel,
          p.nombre as paralelo,
          t.nombre as turno
        FROM matricula m
        INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
        INNER JOIN paralelo p ON m.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
        INNER JOIN turno t ON p.turno_id = t.id
        WHERE m.estudiante_id = $1
          AND m.deleted_at IS NULL
        ORDER BY pa.fecha_inicio DESC
      `, [estudiante_id]);

      // Tutores
      const tutoresQuery = await pool.query(`
        SELECT 
          pf.*,
          et.es_tutor_principal,
          et.vive_con_estudiante,
          et.autorizado_recoger,
          et.prioridad_contacto
        FROM estudiante_tutor et
        INNER JOIN padre_familia pf ON et.padre_familia_id = pf.id
        WHERE et.estudiante_id = $1
          AND pf.deleted_at IS NULL
        ORDER BY et.prioridad_contacto
      `, [estudiante_id]);

      const data = {
        estudiante,
        matriculas: matriculasQuery.rows,
        tutores: tutoresQuery.rows
      };

      if (formato === 'excel') {
        return await ReportesMatriculaController._generarExcelEstudiante(res, data);
      } else {
        return await ReportesMatriculaController._generarPDFEstudiante(res, data);
      }

    } catch (error) {
      console.error('Error al generar reporte de estudiante:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte: ' + error.message
      });
    }
  }

  // ==========================================
  // 3️⃣ REPORTE ESTADÍSTICO COMPARATIVO
  // ==========================================
  static async reporteEstadistico(req, res) {
  try {
    const { periodo_id, nivel_id, formato = 'pdf' } = req.query;

    if (!periodo_id) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere periodo_id'
      });
    }

    let whereNivel = nivel_id ? `AND n.id = ${nivel_id}` : '';

    // Estadísticas por paralelo
    const statsQuery = await pool.query(`
      SELECT 
        p.id as paralelo_id,
        p.nombre as paralelo,
        g.nombre as grado,
        g.orden as grado_orden,
        n.nombre as nivel,
        n.orden as nivel_orden,
        t.nombre as turno,
        p.capacidad_maxima,
        COUNT(m.id) as total_estudiantes,
        COUNT(CASE WHEN e.genero = 'masculino' THEN 1 END) as masculino,
        COUNT(CASE WHEN e.genero = 'femenino' THEN 1 END) as femenino,
        COUNT(CASE WHEN m.es_becado THEN 1 END) as becados,
        COUNT(CASE WHEN m.es_repitente THEN 1 END) as repitentes,
        ROUND(AVG(EXTRACT(YEAR FROM AGE(e.fecha_nacimiento))), 1) as promedio_edad
      FROM paralelo p
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      INNER JOIN turno t ON p.turno_id = t.id
      LEFT JOIN matricula m ON m.paralelo_id = p.id 
        AND m.periodo_academico_id = $1
        AND m.deleted_at IS NULL
      LEFT JOIN estudiante e ON m.estudiante_id = e.id
        AND e.deleted_at IS NULL
      WHERE p.deleted_at IS NULL ${whereNivel}
      GROUP BY 
        p.id, 
        p.nombre, 
        g.nombre, 
        g.orden,
        n.nombre, 
        n.orden,
        t.nombre, 
        p.capacidad_maxima
      ORDER BY n.orden, g.orden, p.nombre
    `, [periodo_id]);

    const stats = statsQuery.rows;

    // Resumen general
    const resumenQuery = await pool.query(`
      SELECT 
        COUNT(DISTINCT m.id) as total_matriculas,
        COUNT(DISTINCT e.id) as total_estudiantes,
        COUNT(CASE WHEN e.genero = 'masculino' THEN 1 END) as total_masculino,
        COUNT(CASE WHEN e.genero = 'femenino' THEN 1 END) as total_femenino,
        COUNT(CASE WHEN m.es_becado THEN 1 END) as total_becados,
        COUNT(CASE WHEN m.es_repitente THEN 1 END) as total_repitentes
      FROM matricula m
      INNER JOIN estudiante e ON m.estudiante_id = e.id
      WHERE m.periodo_academico_id = $1
        AND m.deleted_at IS NULL
        AND e.deleted_at IS NULL
    `, [periodo_id]);

    const resumen = resumenQuery.rows[0];

    const data = {
      stats_paralelos: stats,
      resumen_general: resumen
    };

    if (formato === 'excel') {
      return await ReportesMatriculaController._generarExcelEstadistico(res, data);
    } else {
      return await ReportesMatriculaController._generarPDFEstadistico(res, data);
    }

  } catch (error) {
    console.error('Error al generar reporte estadístico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar reporte: ' + error.message
    });
  }
}

  // ==========================================
  // 🎨 GENERADORES DE PDF (CON NUEVOS ESTILOS)
  // ==========================================
  
  static async _generarPDFParalelo(res, data) {
    const { paralelo, estudiantes, stats } = data;
    const pdf = new PDFGenerator({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-${paralelo.grado_nombre}-${paralelo.nombre}.pdf`);

    pdf.pipe(res);

    // Encabezado
    pdf.drawHeader(
      'REPORTE DE PARALELO',
      `${paralelo.nivel_nombre} - ${paralelo.grado_nombre} "${paralelo.nombre}"`
    );

    // Información del paralelo
    pdf.drawInfoBox([
      { label: 'Nivel', value: paralelo.nivel_nombre },
      { label: 'Grado', value: paralelo.grado_nombre },
      { label: 'Paralelo', value: paralelo.nombre },
      { label: 'Turno', value: paralelo.turno_nombre },
      { label: 'Periodo', value: paralelo.periodo_nombre },
      { label: 'Capacidad', value: `${estudiantes.length}/${paralelo.capacidad_maxima}` }
    ], 3);

    // Estadísticas
    pdf.drawSection('ESTADÍSTICAS GENERALES');
    pdf.drawStatsGrid([
      { label: 'Total Estudiantes', value: stats.total_estudiantes },
      { label: 'Masculino', value: stats.masculino },
      { label: 'Femenino', value: stats.femenino },
      { label: 'Becados', value: stats.becados },
      { label: 'Repitentes', value: stats.repitentes },
      { label: 'Cupos Disponibles', value: stats.capacidad_disponible }
    ], 3);

    // Lista de estudiantes
    pdf.drawSection('LISTA DE ESTUDIANTES');
    
    const rows = estudiantes.map(est => {
      const tutor = est.tutores && est.tutores.length > 0 ? est.tutores[0] : null;
      return [
        est.codigo,
        `${est.apellidos}, ${est.nombres}`,
        est.ci || 'N/A',
        formatearTelefono(est.telefono),
        tutor ? `${tutor.nombres} ${tutor.apellidos}` : 'N/A',
        tutor ? formatearTelefono(tutor.telefono || tutor.celular) : 'N/A'
      ];
    });

    pdf.drawTable(
      ['Código', 'Estudiante', 'CI', 'Teléfono', 'Tutor', 'Tel. Tutor'],
      rows,
      { columnWidths: [70, 140, 70, 80, 120, 80], rowHeight: 22 }
    );

    pdf.end();
  }

  static async _generarPDFEstudiante(res, data) {
    const { estudiante, matriculas, tutores } = data;
    const pdf = new PDFGenerator({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=estudiante-${estudiante.codigo}.pdf`);

    pdf.pipe(res);

    // Encabezado
    pdf.drawHeader(
      'FICHA DEL ESTUDIANTE',
      `Código: ${estudiante.codigo}`
    );

    // Datos personales
    pdf.drawSection('DATOS PERSONALES');
    pdf.drawInfoBox([
      { label: 'Nombres', value: estudiante.nombres },
      { label: 'Apellidos', value: estudiante.apellidos },
      { label: 'CI', value: estudiante.ci || 'N/A' },
      { label: 'Fecha Nacimiento', value: formatearFecha(estudiante.fecha_nacimiento) },
      { label: 'Género', value: estudiante.genero || 'N/A' },
      { label: 'Teléfono', value: formatearTelefono(estudiante.telefono) },
      { label: 'Email', value: estudiante.email || 'N/A' },
      { label: 'Dirección', value: estudiante.direccion || 'N/A' }
    ], 2);

    // Tutores
    if (tutores.length > 0) {
      pdf.drawSection('TUTORES');
      
      const tutorRows = tutores.map(t => [
        `${t.nombres} ${t.apellidos}`,
        t.parentesco || 'N/A',
        formatearTelefono(t.telefono || t.celular),
        t.email || 'N/A',
        t.es_tutor_principal ? 'Sí' : 'No'
      ]);

      pdf.drawTable(
        ['Nombre', 'Parentesco', 'Teléfono', 'Email', 'Principal'],
        tutorRows,
        { columnWidths: [120, 80, 90, 120, 60], rowHeight: 22 }
      );
    }

    // Historial académico
    if (matriculas.length > 0) {
      pdf.drawSection('HISTORIAL ACADÉMICO');
      
      const matRows = matriculas.map(m => [
        `${m.periodo} (${m.periodo_anio})`,
        `${m.nivel} - ${m.grado}`,
        m.paralelo,
        m.turno,
        m.estado,
        m.es_becado ? 'Sí' : 'No'
      ]);

      pdf.drawTable(
        ['Periodo', 'Nivel/Grado', 'Paralelo', 'Turno', 'Estado', 'Becado'],
        matRows,
        { columnWidths: [100, 100, 70, 70, 70, 50], rowHeight: 22 }
      );
    }

    pdf.end();
  }

  static async _generarPDFEstadistico(res, data) {
    const { stats_paralelos, resumen_general } = data;
    const pdf = new PDFGenerator({ margin: 50, landscape: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-estadistico.pdf');

    pdf.pipe(res);

    // Encabezado
    pdf.drawHeader('REPORTE ESTADÍSTICO', 'Matrículas por Paralelo');

    // Resumen general
    pdf.drawStatsGrid([
      { label: 'Total Estudiantes', value: resumen_general.total_estudiantes },
      { label: 'Total Matrículas', value: resumen_general.total_matriculas },
      { label: 'Masculino', value: resumen_general.total_masculino },
      { label: 'Femenino', value: resumen_general.total_femenino },
      { label: 'Becados', value: resumen_general.total_becados },
      { label: 'Repitentes', value: resumen_general.total_repitentes }
    ], 6);

    // Estadísticas por paralelo
    pdf.drawSection('ESTADÍSTICAS POR PARALELO');
    
    const rows = stats_paralelos.map(stat => [
      stat.nivel,
      stat.grado,
      stat.paralelo,
      stat.turno,
      `${stat.total_estudiantes}/${stat.capacidad_maxima}`,
      `${stat.masculino}/${stat.femenino}`,
      stat.becados,
      stat.repitentes,
      `${stat.promedio_edad} años`
    ]);

    pdf.drawTable(
      ['Nivel', 'Grado', 'Paralelo', 'Turno', 'Estudiantes', 'M/F', 'Becados', 'Repiten', 'Edad Prom.'],
      rows,
      { columnWidths: [80, 80, 60, 70, 80, 60, 60, 60, 70], rowHeight: 22 }
    );

    pdf.end();
  }
  // ==========================================
  // 📊 GENERADORES DE EXCEL (CON NUEVOS ESTILOS)
  // ==========================================
  
  static async _generarExcelParalelo(res, data) {
    const { paralelo, estudiantes, stats } = data;
    const excel = new ExcelGenerator();
    const ws = excel.createSheet('Reporte Paralelo');

    // Título
    excel.addTitle(ws, 
      'REPORTE DE PARALELO',
      `${paralelo.nivel_nombre} - ${paralelo.grado_nombre} "${paralelo.nombre}"`
    );

    // Información
    excel.addInfoBox(ws, [
      { label: 'Nivel', value: paralelo.nivel_nombre },
      { label: 'Grado', value: paralelo.grado_nombre },
      { label: 'Paralelo', value: paralelo.nombre },
      { label: 'Turno', value: paralelo.turno_nombre },
      { label: 'Periodo', value: paralelo.periodo_nombre },
      { label: 'Capacidad', value: `${estudiantes.length}/${paralelo.capacidad_maxima}` }
    ]);

    // Estadísticas
    excel.addStats(ws, [
      { label: 'Total Estudiantes', value: stats.total_estudiantes },
      { label: 'Masculino', value: stats.masculino },
      { label: 'Femenino', value: stats.femenino },
      { label: 'Becados', value: stats.becados },
      { label: 'Repitentes', value: stats.repitentes },
      { label: 'Cupos Disponibles', value: stats.capacidad_disponible }
    ], 3);

    // Tabla de estudiantes
    const rows = estudiantes.map(est => {
      const tutor = est.tutores && est.tutores.length > 0 ? est.tutores[0] : null;
      return [
        est.codigo,
        est.nombres,
        est.apellidos,
        est.ci || 'N/A',
        est.telefono || 'N/A',
        est.email || 'N/A',
        tutor ? `${tutor.nombres} ${tutor.apellidos}` : 'N/A',
        tutor ? (tutor.telefono || tutor.celular) : 'N/A'
      ];
    });

    excel.addTable(ws,
      ['Código', 'Nombres', 'Apellidos', 'CI', 'Teléfono', 'Email', 'Tutor Principal', 'Tel. Tutor'],
      rows,
      { 
        sectionTitle: 'LISTA DE ESTUDIANTES',
        columnWidths: [12, 20, 20, 12, 15, 25, 25, 15]
      }
    );

    excel.addFooter(ws);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-${paralelo.grado_nombre}-${paralelo.nombre}.xlsx`);

    await excel.write(res);
    res.end();
  }

  static async _generarExcelEstudiante(res, data) {
    const { estudiante, matriculas, tutores } = data;
    const excel = new ExcelGenerator();

    // Hoja 1: Datos Personales
    const ws1 = excel.createSheet('Datos Personales');
    excel.addTitle(ws1, 'FICHA DEL ESTUDIANTE', `Código: ${estudiante.codigo}`);
    
    excel.addInfoBox(ws1, [
      { label: 'Código', value: estudiante.codigo },
      { label: 'Nombres', value: estudiante.nombres },
      { label: 'Apellidos', value: estudiante.apellidos },
      { label: 'CI', value: estudiante.ci || 'N/A' },
      { label: 'Fecha Nacimiento', value: formatearFecha(estudiante.fecha_nacimiento) },
      { label: 'Género', value: estudiante.genero || 'N/A' },
      { label: 'Teléfono', value: estudiante.telefono || 'N/A' },
      { label: 'Email', value: estudiante.email || 'N/A' }
    ]);

    // Hoja 2: Tutores
    const ws2 = excel.createSheet('Tutores');
    excel.addTitle(ws2, 'TUTORES');
    
    const tutorRows = tutores.map(t => [
      t.nombres,
      t.apellidos,
      t.parentesco || 'N/A',
      t.telefono || t.celular || 'N/A',
      t.email || 'N/A',
      t.es_tutor_principal ? 'Sí' : 'No'
    ]);

    excel.addTable(ws2,
      ['Nombres', 'Apellidos', 'Parentesco', 'Teléfono', 'Email', 'Principal'],
      tutorRows,
      { columnWidths: [20, 20, 15, 15, 25, 10] }
    );

    // Hoja 3: Historial
    const ws3 = excel.createSheet('Historial Académico');
    excel.addTitle(ws3, 'HISTORIAL ACADÉMICO');
    
    const matRows = matriculas.map(m => [
      m.periodo,
      m.periodo_anio,
      m.nivel,
      m.grado,
      m.paralelo,
      m.turno,
      m.estado,
      m.es_becado ? 'Sí' : 'No'
    ]);

    excel.addTable(ws3,
      ['Periodo', 'Año', 'Nivel', 'Grado', 'Paralelo', 'Turno', 'Estado', 'Becado'],
      matRows,
      { columnWidths: [20, 10, 15, 15, 10, 15, 12, 10] }
    );

    excel.addFooter(ws1);
    excel.addFooter(ws2);
    excel.addFooter(ws3);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=estudiante-${estudiante.codigo}.xlsx`);

    await excel.write(res);
    res.end();
  }

  static async _generarExcelEstadistico(res, data) {
    const { stats_paralelos, resumen_general } = data;
    const excel = new ExcelGenerator();
    const ws = excel.createSheet('Estadísticas');

    excel.addTitle(ws, 'REPORTE ESTADÍSTICO', 'Matrículas por Paralelo');

    // Resumen general
    excel.addStats(ws, [
      { label: 'Total Estudiantes', value: resumen_general.total_estudiantes },
      { label: 'Total Matrículas', value: resumen_general.total_matriculas },
      { label: 'Masculino', value: resumen_general.total_masculino },
      { label: 'Femenino', value: resumen_general.total_femenino },
      { label: 'Becados', value: resumen_general.total_becados },
      { label: 'Repitentes', value: resumen_general.total_repitentes }
    ], 3);

    // Tabla por paralelo
    const rows = stats_paralelos.map(stat => [
      stat.nivel,
      stat.grado,
      stat.paralelo,
      stat.turno,
      parseInt(stat.total_estudiantes),
      stat.capacidad_maxima,
      parseInt(stat.masculino),
      parseInt(stat.femenino),
      parseInt(stat.becados),
      parseInt(stat.repitentes),
      parseFloat(stat.promedio_edad)
    ]);

    excel.addTable(ws,
      ['Nivel', 'Grado', 'Paralelo', 'Turno', 'Total', 'Capacidad', 'M', 'F', 'Becados', 'Repiten', 'Edad Prom'],
      rows,
      { 
        sectionTitle: 'ESTADÍSTICAS POR PARALELO',
        columnWidths: [15, 15, 10, 15, 10, 10, 8, 8, 10, 10, 12]
      }
    );

    excel.addFooter(ws);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-estadistico.xlsx');

    await excel.write(res);
    res.end();
  }
}

export default ReportesMatriculaController;