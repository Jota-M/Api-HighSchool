import { pool } from '../../db/pool.js';
import PDFGenerator from '../../services/reportes/pdfGenerator.js';
import ExcelGenerator from '../../services/reportes/excelGenerator.js';
import { formatearFecha, formatearTelefono, getColorEstado } from '../../services/reportes/reportStyles.js';

class ReportesPreInscripcionController {
  
  // ==========================================
  // 1️⃣ REPORTE INDIVIDUAL DE PRE-INSCRIPCIÓN
  // ==========================================
  static async reporteIndividual(req, res) {
    try {
      const { id, formato = 'pdf' } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere el ID de la preinscripción'
        });
      }

      // Obtener datos completos
      const query = await pool.query(`
        SELECT 
          pi.*,
          pe.*,
          pt.*,
          json_agg(
            json_build_object(
              'id', pd.id,
              'tipo', pd.tipo_documento,
              'nombre', pd.nombre_archivo,
              'url', pd.url_archivo,
              'subido', pd.subido,
              'verificado', pd.verificado,
              'requiere_correccion', pd.requiere_correccion,
              'motivo_correccion', pd.motivo_correccion
            )
          ) FILTER (WHERE pd.id IS NOT NULL) as documentos
        FROM pre_inscripcion pi
        LEFT JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
        LEFT JOIN pre_tutor pt ON pi.id = pt.pre_inscripcion_id AND pt.es_tutor_principal = true
        LEFT JOIN pre_documento pd ON pi.id = pd.pre_inscripcion_id
        WHERE pi.id = $1 AND pi.deleted_at IS NULL
        GROUP BY pi.id, pe.id, pt.id
      `, [id]);

      if (query.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Preinscripción no encontrada'
        });
      }

      const data = query.rows[0];

      if (formato === 'excel') {
        // ✅ CORRECTO: usar nombre de la clase
        return await ReportesPreInscripcionController._generarExcelIndividual(res, data);
      } else {
        // ✅ CORRECTO: usar nombre de la clase
        return await ReportesPreInscripcionController._generarPDFIndividual(res, data);
      }

    } catch (error) {
      console.error('Error al generar reporte individual:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte: ' + error.message
      });
    }
  }

  // ==========================================
  // 2️⃣ REPORTE LISTADO DE PRE-INSCRIPCIONES
  // ==========================================
  static async reporteListado(req, res) {
    try {
      const { estado, fecha_inicio, fecha_fin, grado, turno, search, formato = 'pdf' } = req.query;

      let whereConditions = ['pi.deleted_at IS NULL'];
      let params = [];
      let paramCount = 1;

      if (estado && estado !== 'todos') {
        whereConditions.push(`pi.estado = $${paramCount}`);
        params.push(estado);
        paramCount++;
      }

      if (fecha_inicio) {
        whereConditions.push(`pi.created_at >= $${paramCount}`);
        params.push(fecha_inicio);
        paramCount++;
      }

      if (fecha_fin) {
        whereConditions.push(`pi.created_at <= $${paramCount}`);
        params.push(fecha_fin + ' 23:59:59');
        paramCount++;
      }

      if (grado && grado !== 'todos') {
        whereConditions.push(`(pe.grado_solicitado ILIKE $${paramCount} OR g.nombre ILIKE $${paramCount} OR pi.grado_id::text = $${paramCount})`);
        params.push(grado);
        paramCount++;
      }

      if (turno && turno !== 'todos') {
        whereConditions.push(`(pe.turno_solicitado ILIKE $${paramCount} OR t.nombre ILIKE $${paramCount} OR pi.turno_preferido_id::text = $${paramCount})`);
        params.push(turno);
        paramCount++;
      }

      if (search && search.trim()) {
        const queryTerm = `%${search.trim()}%`;
        whereConditions.push(`(
          pe.nombres ILIKE $${paramCount} OR
          pe.apellido_paterno ILIKE $${paramCount} OR
          pe.apellido_materno ILIKE $${paramCount} OR
          pe.ci ILIKE $${paramCount} OR
          pi.codigo_inscripcion ILIKE $${paramCount} OR
          pt.nombres ILIKE $${paramCount} OR
          pt.apellido_paterno ILIKE $${paramCount} OR
          pt.telefono ILIKE $${paramCount}
        )`);
        params.push(queryTerm);
        paramCount++;
      }

      const whereClause = whereConditions.join(' AND ');

      // Obtener preinscripciones
      const query = await pool.query(`
        SELECT 
          pi.id,
          pi.codigo_inscripcion,
          pi.estado,
          pi.created_at as fecha_solicitud,
          TRIM(CONCAT(pe.apellido_paterno, ' ', COALESCE(pe.apellido_materno, ''), ' ', pe.nombres)) as estudiante_nombre,
          pe.apellido_paterno,
          pe.apellido_materno,
          pe.nombres,
          pe.ci as estudiante_ci,
          pe.fecha_nacimiento,
          pe.genero,
          COALESCE(g.nombre, pe.grado_solicitado) as grado_solicitado,
          COALESCE(t.nombre, pe.turno_solicitado) as turno_solicitado,
          pt.nombres || ' ' || pt.apellido_paterno as tutor_nombre,
          pt.telefono as tutor_telefono,
          pt.email as tutor_email,
          COUNT(pd.id) FILTER (WHERE pd.subido = true) as docs_subidos,
          COUNT(pd.id) FILTER (WHERE pd.verificado = true) as docs_verificados
        FROM pre_inscripcion pi
        LEFT JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
        LEFT JOIN pre_tutor pt ON pi.id = pt.pre_inscripcion_id AND pt.es_tutor_principal = true
        LEFT JOIN pre_documento pd ON pi.id = pd.pre_inscripcion_id
        LEFT JOIN grado g ON pi.grado_id = g.id
        LEFT JOIN turno t ON pi.turno_preferido_id = t.id
        WHERE ${whereClause}
        GROUP BY pi.id, pe.id, pt.id, g.nombre, t.nombre
        ORDER BY pe.apellido_paterno ASC, pe.apellido_materno ASC, pe.nombres ASC, pi.created_at DESC
      `, params);

      const preinscripciones = query.rows;

      // Estadísticas
      const statsQuery = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN pi.estado = 'iniciada' THEN 1 END) as iniciadas,
          COUNT(CASE WHEN pi.estado = 'datos_completos' THEN 1 END) as datos_completos,
          COUNT(CASE WHEN pi.estado = 'en_revision' THEN 1 END) as en_revision,
          COUNT(CASE WHEN pi.estado = 'aprobada' THEN 1 END) as aprobadas,
          COUNT(CASE WHEN pi.estado = 'rechazada' THEN 1 END) as rechazadas,
          COUNT(CASE WHEN pi.estado = 'convertida' THEN 1 END) as convertidas,
          COUNT(CASE WHEN pe.genero = 'masculino' THEN 1 END) as masculino,
          COUNT(CASE WHEN pe.genero = 'femenino' THEN 1 END) as femenino
        FROM pre_inscripcion pi
        LEFT JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
        LEFT JOIN pre_tutor pt ON pi.id = pt.pre_inscripcion_id AND pt.es_tutor_principal = true
        LEFT JOIN grado g ON pi.grado_id = g.id
        LEFT JOIN turno t ON pi.turno_preferido_id = t.id
        WHERE ${whereClause}
      `, params);

      const stats = statsQuery.rows[0];

      const data = {
        preinscripciones,
        stats,
        filtros: { estado, fecha_inicio, fecha_fin, grado, turno, search }
      };

      if (formato === 'excel') {
        // ✅ CORRECTO: usar nombre de la clase
        return await ReportesPreInscripcionController._generarExcelListado(res, data);
      } else {
        // ✅ CORRECTO: usar nombre de la clase
        return await ReportesPreInscripcionController._generarPDFListado(res, data);
      }

    } catch (error) {
      console.error('Error al generar reporte de listado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte: ' + error.message
      });
    }
  }

  // ==========================================
  // 3️⃣ REPORTE ESTADÍSTICO DE PRE-INSCRIPCIONES
  // ==========================================
  static async reporteEstadistico(req, res) {
    try {
      const { fecha_inicio, fecha_fin, formato = 'pdf' } = req.query;

      let whereCondition = 'pi.deleted_at IS NULL';
      let params = [];
      let paramCount = 1;

      if (fecha_inicio && fecha_fin) {
        whereCondition += ` AND pi.created_at BETWEEN $${paramCount} AND $${paramCount + 1}`;
        params.push(fecha_inicio, fecha_fin + ' 23:59:59');
        paramCount += 2;
      }

      // Estadísticas por estado
      const estadoQuery = await pool.query(`
        SELECT 
          pi.estado,
          COUNT(*) as cantidad,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as porcentaje
        FROM pre_inscripcion pi
        WHERE ${whereCondition}
        GROUP BY pi.estado
        ORDER BY cantidad DESC
      `, params);

      // Estadísticas por género
      const generoQuery = await pool.query(`
        SELECT 
          pe.genero,
          COUNT(*) as cantidad
        FROM pre_inscripcion pi
        INNER JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
        WHERE ${whereCondition}
        GROUP BY pe.genero
      `, params);

      // Estadísticas por grado solicitado
      const gradoQuery = await pool.query(`
        SELECT 
          pe.grado_solicitado,
          COUNT(*) as cantidad
        FROM pre_inscripcion pi
        INNER JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
        WHERE ${whereCondition} AND pe.grado_solicitado IS NOT NULL
        GROUP BY pe.grado_solicitado
        ORDER BY pe.grado_solicitado
      `, params);

      // Estadísticas de documentación
      const docQuery = await pool.query(`
        SELECT 
          pd.tipo_documento,
          COUNT(*) as total,
          COUNT(CASE WHEN pd.subido THEN 1 END) as subidos,
          COUNT(CASE WHEN pd.verificado THEN 1 END) as verificados,
          COUNT(CASE WHEN pd.requiere_correccion THEN 1 END) as con_observaciones
        FROM pre_inscripcion pi
        INNER JOIN pre_documento pd ON pi.id = pd.pre_inscripcion_id
        WHERE ${whereCondition}
        GROUP BY pd.tipo_documento
        ORDER BY pd.tipo_documento
      `, params);

      // Resumen general
      const resumenQuery = await pool.query(`
        SELECT 
          COUNT(DISTINCT pi.id) as total_preinscripciones,
          COUNT(DISTINCT CASE WHEN pi.estado = 'convertida' THEN pi.id END) as total_convertidas,
          ROUND(AVG(EXTRACT(YEAR FROM AGE(pe.fecha_nacimiento))), 1) as edad_promedio,
          COUNT(CASE WHEN pe.repite_grado THEN 1 END) as repitentes
        FROM pre_inscripcion pi
        LEFT JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
        WHERE ${whereCondition}
      `, params);

      const data = {
        resumen: resumenQuery.rows[0],
        por_estado: estadoQuery.rows,
        por_genero: generoQuery.rows,
        por_grado: gradoQuery.rows,
        documentacion: docQuery.rows,
        periodo: { fecha_inicio, fecha_fin }
      };

      if (formato === 'excel') {
        // ✅ CORRECTO: usar nombre de la clase
        return await ReportesPreInscripcionController._generarExcelEstadistico(res, data);
      } else {
        // ✅ CORRECTO: usar nombre de la clase
        return await ReportesPreInscripcionController._generarPDFEstadistico(res, data);
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
  // 🎨 GENERADORES PDF
  // ==========================================
  
  static async _generarPDFIndividual(res, data) {
    const pdf = new PDFGenerator({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=preinscripcion-${data.codigo_inscripcion}.pdf`);

    pdf.pipe(res);

    // Encabezado
    pdf.drawHeader(
      'FICHA DE PRE-INSCRIPCIÓN',
      `Código: ${data.codigo_inscripcion}`
    );

    // Info general
    pdf.drawInfoBox([
      { label: 'Estado', value: data.estado.toUpperCase() },
      { label: 'Fecha Solicitud', value: formatearFecha(data.created_at) },
      { label: 'Grado Solicitado', value: data.grado_solicitado || 'N/A' },
      { label: 'Turno Preferido', value: data.turno_solicitado || 'N/A' }
    ], 2);

    // Datos del estudiante
    pdf.drawSection('DATOS DEL ESTUDIANTE');
    pdf.drawInfoBox([
      { label: 'Nombres', value: data.nombres },
      { label: 'Apellido Paterno', value: data.apellido_paterno },
      { label: 'Apellido Materno', value: data.apellido_materno || 'N/A' },
      { label: 'CI', value: data.ci || 'N/A' },
      { label: 'Fecha Nacimiento', value: formatearFecha(data.fecha_nacimiento) },
      { label: 'Género', value: data.genero || 'N/A' },
      { label: 'Teléfono', value: formatearTelefono(data.telefono) },
      { label: 'Email', value: data.email || 'N/A' }
    ], 2);

    // Datos del tutor
    pdf.drawSection('DATOS DEL TUTOR PRINCIPAL');
    pdf.drawInfoBox([
      { label: 'Nombres', value: data.nombres || 'N/A' },
      { label: 'Apellidos', value: `${data.apellido_paterno || ''} ${data.apellido_materno || ''}` },
      { label: 'CI', value: data.ci_1 || 'N/A' },
      { label: 'Parentesco', value: data.parentesco || 'N/A' },
      { label: 'Teléfono', value: formatearTelefono(data.telefono_1) },
      { label: 'Email', value: data.email_1 || 'N/A' }
    ], 2);

    // Documentos
    if (data.documentos && data.documentos.length > 0) {
      pdf.drawSection('DOCUMENTACIÓN');
      
      const docRows = data.documentos.map(doc => [
        doc.tipo.replace(/_/g, ' ').toUpperCase(),
        doc.subido ? '✓ Subido' : '✗ Pendiente',
        doc.verificado ? '✓ Verificado' : (doc.requiere_correccion ? '⚠ Con observaciones' : '⏳ En revisión')
      ]);

      pdf.drawTable(
        ['Documento', 'Estado Subida', 'Estado Verificación'],
        docRows,
        { columnWidths: [200, 150, 150], rowHeight: 20 }
      );
    }

    pdf.end();
  }

  static async _generarPDFListado(res, data) {
    const pdf = new PDFGenerator({ margin: 50, size: 'letter', landscape: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=listado-preinscripciones.pdf');

    pdf.pipe(res);

    // Encabezado
    let subtitulo = 'Todas las pre-inscripciones';
    const partes = [];
    if (data.filtros.estado && data.filtros.estado !== 'todos') partes.push(`Estado: ${data.filtros.estado.toUpperCase()}`);
    if (data.filtros.turno && data.filtros.turno !== 'todos') partes.push(`Turno: ${data.filtros.turno.toUpperCase()}`);
    if (data.filtros.grado && data.filtros.grado !== 'todos') partes.push(`Grado: ${data.filtros.grado}`);
    if (partes.length > 0) subtitulo = partes.join(' | ');
    pdf.drawHeader('LISTADO DE PRE-INSCRIPCIONES', subtitulo);

    // Estadísticas
    pdf.drawStatsGrid([
      { label: 'Total', value: data.stats.total },
      { label: 'Aprobadas', value: data.stats.aprobadas },
      { label: 'En Revisión', value: data.stats.en_revision },
      { label: 'Convertidas', value: data.stats.convertidas },
      { label: 'Masculino', value: data.stats.masculino },
      { label: 'Femenino', value: data.stats.femenino }
    ], 6);

    // Tabla de preinscripciones
    pdf.drawSection('DETALLE DE PRE-INSCRIPCIONES');
    
    const rows = data.preinscripciones.map(p => [
      p.codigo_inscripcion,
      p.estudiante_nombre,
      p.estudiante_ci || 'N/A',
      p.grado_solicitado || 'N/A',
      p.turno_solicitado || 'N/A',
      p.tutor_nombre,
      formatearTelefono(p.tutor_telefono),
      p.estado,
      formatearFecha(p.fecha_solicitud, 'corto')
    ]);

    pdf.drawTable(
      ['Código', 'Estudiante', 'CI', 'Grado', 'Turno', 'Tutor', 'Teléfono', 'Estado', 'Fecha'],
      rows,
      { 
        columnWidths: [75, 120, 65, 60, 60, 100, 75, 75, 60],
        rowHeight: 20
      }
    );

    pdf.end();
  }

  static async _generarPDFEstadistico(res, data) {
    const pdf = new PDFGenerator({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=estadisticas-preinscripciones.pdf');

    pdf.pipe(res);

    // Encabezado
    pdf.drawHeader('REPORTE ESTADÍSTICO', 'Pre-inscripciones');

    // Resumen general
    pdf.drawStatsGrid([
      { label: 'Total Pre-inscripciones', value: data.resumen.total_preinscripciones },
      { label: 'Convertidas', value: data.resumen.total_convertidas },
      { label: 'Edad Promedio', value: `${data.resumen.edad_promedio} años` },
      { label: 'Repitentes', value: data.resumen.repitentes }
    ], 4);

    // Por estado
    pdf.drawSection('DISTRIBUCIÓN POR ESTADO');
    const estadoRows = data.por_estado.map(e => [
      e.estado.toUpperCase(),
      e.cantidad,
      `${e.porcentaje}%`
    ]);
    pdf.drawTable(
      ['Estado', 'Cantidad', 'Porcentaje'],
      estadoRows,
      { columnWidths: [200, 150, 150] }
    );

    // Por grado
    if (data.por_grado.length > 0) {
      pdf.drawSection('DISTRIBUCIÓN POR GRADO SOLICITADO');
      const gradoRows = data.por_grado.map(g => [
        g.grado_solicitado,
        g.cantidad
      ]);
      pdf.drawTable(
        ['Grado', 'Cantidad'],
        gradoRows,
        { columnWidths: [300, 200] }
      );
    }

    pdf.end();
  }
  // ==========================================
  // 📊 GENERADORES EXCEL
  // ==========================================
  
  static async _generarExcelIndividual(res, data) {
    const excel = new ExcelGenerator();
    const ws = excel.createSheet('Preinscripción');

    excel.addTitle(ws, 'FICHA DE PRE-INSCRIPCIÓN', `Código: ${data.codigo_inscripcion}`);

    // Info general
    excel.addInfoBox(ws, [
      { label: 'Estado', value: data.estado.toUpperCase() },
      { label: 'Fecha Solicitud', value: formatearFecha(data.created_at) },
      { label: 'Grado Solicitado', value: data.grado_solicitado || 'N/A' },
      { label: 'Turno Preferido', value: data.turno_solicitado || 'N/A' }
    ]);

    // Datos estudiante
    excel.addTable(ws, 
      ['Campo', 'Valor'],
      [
        ['Nombres', data.nombres],
        ['Apellido Paterno', data.apellido_paterno],
        ['Apellido Materno', data.apellido_materno || 'N/A'],
        ['CI', data.ci || 'N/A'],
        ['Fecha Nacimiento', formatearFecha(data.fecha_nacimiento)],
        ['Género', data.genero || 'N/A']
      ],
      { sectionTitle: 'DATOS DEL ESTUDIANTE', columnWidths: [30, 50] }
    );

    // Documentos
    if (data.documentos && data.documentos.length > 0) {
      const docRows = data.documentos.map(doc => [
        doc.tipo.replace(/_/g, ' ').toUpperCase(),
        doc.subido ? 'Subido' : 'Pendiente',
        doc.verificado ? 'Verificado' : (doc.requiere_correccion ? 'Con observaciones' : 'En revisión')
      ]);

      excel.addTable(ws,
        ['Documento', 'Estado Subida', 'Estado Verificación'],
        docRows,
        { sectionTitle: 'DOCUMENTACIÓN', columnWidths: [30, 20, 25] }
      );
    }

    excel.addFooter(ws);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=preinscripcion-${data.codigo_inscripcion}.xlsx`);

    await excel.write(res);
    res.end();
  }

  static async _generarExcelListado(res, data) {
    const excel = new ExcelGenerator();
    const ws = excel.createSheet('Listado');

    let subtitulo = '';
    const partes = [];
    if (data.filtros.estado && data.filtros.estado !== 'todos') partes.push(`Estado: ${data.filtros.estado.toUpperCase()}`);
    if (data.filtros.turno && data.filtros.turno !== 'todos') partes.push(`Turno: ${data.filtros.turno.toUpperCase()}`);
    if (data.filtros.grado && data.filtros.grado !== 'todos') partes.push(`Grado: ${data.filtros.grado}`);
    if (partes.length > 0) subtitulo = `Filtros: ${partes.join(' | ')}`;

    excel.addTitle(ws, 'LISTADO DE PRE-INSCRIPCIONES', subtitulo);

    // Estadísticas
    excel.addStats(ws, [
      { label: 'Total', value: data.stats.total },
      { label: 'Aprobadas', value: data.stats.aprobadas },
      { label: 'En Revisión', value: data.stats.en_revision },
      { label: 'Convertidas', value: data.stats.convertidas }
    ], 2);

    // Tabla principal
    const rows = data.preinscripciones.map(p => [
      p.codigo_inscripcion,
      p.estudiante_nombre,
      p.estudiante_ci || 'N/A',
      p.grado_solicitado || 'N/A',
      p.turno_solicitado || 'N/A',
      p.tutor_nombre,
      p.tutor_telefono,
      p.estado,
      formatearFecha(p.fecha_solicitud, 'corto')
    ]);

    excel.addTable(ws,
      ['Código', 'Estudiante', 'CI', 'Grado', 'Turno', 'Tutor', 'Teléfono', 'Estado', 'Fecha'],
      rows,
      { sectionTitle: 'DETALLE', columnWidths: [15, 30, 12, 15, 15, 25, 15, 15, 12] }
    );

    excel.addFooter(ws);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=listado-preinscripciones.xlsx');

    await excel.write(res);
    res.end();
  }

  static async _generarExcelEstadistico(res, data) {
    const excel = new ExcelGenerator();
    const ws = excel.createSheet('Estadísticas');

    excel.addTitle(ws, 'REPORTE ESTADÍSTICO', 'Pre-inscripciones');

    // Resumen
    excel.addStats(ws, [
      { label: 'Total Pre-inscripciones', value: data.resumen.total_preinscripciones },
      { label: 'Convertidas', value: data.resumen.total_convertidas },
      { label: 'Edad Promedio', value: `${data.resumen.edad_promedio} años` },
      { label: 'Repitentes', value: data.resumen.repitentes }
    ], 2);

    // Por estado
    const estadoRows = data.por_estado.map(e => [
      e.estado.toUpperCase(),
      parseInt(e.cantidad),
      parseFloat(e.porcentaje)
    ]);
    excel.addTable(ws,
      ['Estado', 'Cantidad', 'Porcentaje (%)'],
      estadoRows,
      { sectionTitle: 'DISTRIBUCIÓN POR ESTADO', columnWidths: [25, 15, 15] }
    );

    // Por grado
    if (data.por_grado.length > 0) {
      const gradoRows = data.por_grado.map(g => [
        g.grado_solicitado,
        parseInt(g.cantidad)
      ]);
      excel.addTable(ws,
        ['Grado Solicitado', 'Cantidad'],
        gradoRows,
        { sectionTitle: 'DISTRIBUCIÓN POR GRADO', columnWidths: [30, 15] }
      );
    }

    excel.addFooter(ws);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=estadisticas-preinscripciones.xlsx');

    await excel.write(res);
    res.end();
  }
}

export default ReportesPreInscripcionController;