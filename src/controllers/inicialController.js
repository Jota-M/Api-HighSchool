// server/src/controllers/inicialController.js
import { pool } from '../db/pool.js';
import { NivelLogroModel } from '../models/nivelLogroModel.js';
import { IndicadorLogroModel } from '../models/indicadorLogroModel.js';
import { RegistroCotejoModel } from '../models/registroCotejoModel.js';
import { InformeCualitativoModel } from '../models/informeCualitativoModel.js';
import { generarInformeInicial, generarActividadesLudicasInicial } from '../utils/geminiClient.js';
import notificacionesAcademicas from '../utils/notificacionesAcademicas.js';
import PDFGenerator from '../services/reportes/pdfGenerator.js';
import ExcelGenerator from '../services/reportes/excelGenerator.js';

export const InicialController = {
  // ── 1. NIVELES DE LOGRO ───────────────────────────────────────────────────
  async getNivelesLogro(req, res) {
    try {
      const niveles = await NivelLogroModel.getAll();
      return res.json({ success: true, data: niveles });
    } catch (error) {
      console.error('Error al obtener niveles de logro:', error);
      return res.status(500).json({ success: false, message: 'Error interno al obtener niveles de logro' });
    }
  },

  // ── 2. INDICADORES DE LOGRO ───────────────────────────────────────────────
  async getIndicadores(req, res) {
    try {
      const { gradoMateriaId, gradoId, periodoEvaluacionId } = req.query;

      let indicadores = [];
      if (gradoMateriaId) {
        indicadores = await IndicadorLogroModel.findByGradoMateria(gradoMateriaId, periodoEvaluacionId);
      } else if (gradoId) {
        indicadores = await IndicadorLogroModel.findByGrado(gradoId, periodoEvaluacionId);
      } else {
        return res.status(400).json({ success: false, message: 'Se requiere gradoMateriaId o gradoId' });
      }

      return res.json({ success: true, data: indicadores });
    } catch (error) {
      console.error('Error al obtener indicadores:', error);
      return res.status(500).json({ success: false, message: 'Error interno al obtener indicadores' });
    }
  },

  async createIndicador(req, res) {
    try {
      const { grado_materia_id, periodo_evaluacion_id, descripcion, orden } = req.body;
      if (!grado_materia_id || !descripcion?.trim()) {
        return res.status(400).json({ success: false, message: 'grado_materia_id y descripción son obligatorios' });
      }

      const indicador = await IndicadorLogroModel.create({
        grado_materia_id,
        periodo_evaluacion_id,
        descripcion: descripcion.trim(),
        orden
      });

      return res.status(201).json({ success: true, data: indicador, message: 'Indicador creado exitosamente' });
    } catch (error) {
      console.error('Error al crear indicador:', error);
      return res.status(500).json({ success: false, message: 'Error al crear indicador' });
    }
  },

  async updateIndicador(req, res) {
    try {
      const { id } = req.params;
      const { descripcion, orden, activo, periodo_evaluacion_id } = req.body;

      const updated = await IndicadorLogroModel.update(id, {
        descripcion,
        orden,
        activo,
        periodo_evaluacion_id
      });

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Indicador no encontrado' });
      }

      return res.json({ success: true, data: updated, message: 'Indicador actualizado' });
    } catch (error) {
      console.error('Error al actualizar indicador:', error);
      return res.status(500).json({ success: false, message: 'Error al actualizar indicador' });
    }
  },

  async deleteIndicador(req, res) {
    try {
      const { id } = req.params;
      const deleted = await IndicadorLogroModel.delete(id);

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Indicador no encontrado' });
      }

      return res.json({ success: true, message: 'Indicador eliminado' });
    } catch (error) {
      console.error('Error al eliminar indicador:', error);
      return res.status(500).json({ success: false, message: 'Error al eliminar indicador' });
    }
  },

  // ── 3. LISTA DE COTEJO (MATRIZ Y BULK) ─────────────────────────────────────
  async getMatrizCotejo(req, res) {
    try {
      const { paraleloId, periodoId } = req.params;
      const { gradoMateriaId } = req.query;

      const pId = parseInt(paraleloId, 10);
      const perId = parseInt(periodoId, 10);
      if (isNaN(pId) || isNaN(perId)) {
        return res.status(400).json({ success: false, message: 'paraleloId y periodoId deben ser números válidos' });
      }

      const gmId = gradoMateriaId ? parseInt(gradoMateriaId, 10) : undefined;
      const matriz = await RegistroCotejoModel.findMatrizByParalelo(pId, perId, gmId);
      if (!matriz) {
        return res.status(404).json({ success: false, message: 'Paralelo no encontrado' });
      }

      return res.json({ success: true, data: matriz });
    } catch (error) {
      console.error('Error al obtener matriz de cotejo:', error);
      return res.status(500).json({ success: false, message: 'Error al cargar matriz de cotejo' });
    }
  },

  async guardarCotejoBulk(req, res) {
    try {
      const { registros } = req.body;
      const usuarioId = req.user?.id || 1;

      if (!Array.isArray(registros)) {
        return res.status(400).json({ success: false, message: 'Se esperaba un array de registros' });
      }

      const resultado = await RegistroCotejoModel.upsertBulk(registros, usuarioId);
      return res.json({
        success: true,
        data: resultado,
        message: `Se guardaron ${resultado.guardados} evaluaciones y se limpiaron ${resultado.eliminados}.`
      });
    } catch (error) {
      console.error('Error al guardar cotejo:', error);
      return res.status(500).json({ success: false, message: 'Error al guardar evaluaciones de cotejo' });
    }
  },

  async getCotejoEstudiante(req, res) {
    try {
      const { matriculaId, periodoId } = req.params;
      const mId = parseInt(matriculaId, 10);
      const perId = parseInt(periodoId, 10);
      if (isNaN(mId) || isNaN(perId)) {
        return res.status(400).json({ success: false, message: 'matriculaId y periodoId deben ser números válidos' });
      }

      const cotejos = await RegistroCotejoModel.findByMatriculaPeriodo(mId, perId);
      return res.json({ success: true, data: cotejos });
    } catch (error) {
      console.error('Error al obtener cotejo del estudiante:', error);
      return res.status(500).json({ success: false, message: 'Error al obtener cotejo del estudiante' });
    }
  },

  // ── 4. INFORMES CUALITATIVOS ──────────────────────────────────────────────
  async getInforme(req, res) {
    try {
      const { matriculaId, periodoId } = req.params;
      const mId = parseInt(matriculaId, 10);
      const perId = parseInt(periodoId, 10);
      if (isNaN(mId) || isNaN(perId)) {
        return res.status(400).json({ success: false, message: 'matriculaId y periodoId deben ser números válidos' });
      }

      const informe = await InformeCualitativoModel.getByMatriculaPeriodo(mId, perId);
      return res.json({ success: true, data: informe || null });
    } catch (error) {
      console.error('Error al obtener informe:', error);
      return res.status(500).json({ success: false, message: 'Error al obtener informe cualitativo' });
    }
  },

  async getInformesParalelo(req, res) {
    try {
      const { paraleloId, periodoId } = req.params;
      const pId = parseInt(paraleloId, 10);
      const perId = parseInt(periodoId, 10);
      if (isNaN(pId) || isNaN(perId)) {
        return res.status(400).json({ success: false, message: 'paraleloId y periodoId deben ser números válidos' });
      }

      const informes = await InformeCualitativoModel.findByParaleloPeriodo(pId, perId);
      return res.json({ success: true, data: informes });
    } catch (error) {
      console.error('Error al obtener informes del curso:', error);
      return res.status(500).json({ success: false, message: 'Error al obtener informes del curso' });
    }
  },

  async getCentralizadorInformes(req, res) {
    try {
      const { paraleloId } = req.params;
      const pId = parseInt(paraleloId, 10);
      if (isNaN(pId)) {
        return res.status(400).json({ success: false, message: 'paraleloId debe ser un número válido' });
      }

      const data = await InformeCualitativoModel.findCentralizadorByParalelo(pId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error('Error al obtener centralizador de informes:', error);
      return res.status(500).json({ success: false, message: 'Error al obtener centralizador de informes' });
    }
  },

  async generarInformeIA(req, res) {
    try {
      const { matriculaId, periodoId } = req.params;
      const { observacionesDocente, esFinal } = req.body;

      // 1. Obtener datos del estudiante y grado
      const matRes = await pool.query(`
        SELECT m.id, e.nombres, e.apellidos, e.genero, g.nombre as grado_nombre, pe.nombre as periodo_nombre
        FROM matricula m
        JOIN estudiante e ON m.estudiante_id = e.id
        JOIN paralelo p ON m.paralelo_id = p.id
        JOIN grado g ON p.grado_id = g.id
        JOIN periodo_evaluacion pe ON pe.id = $2
        WHERE m.id = $1;
      `, [matriculaId, periodoId]);

      if (!matRes.rows.length) {
        return res.status(404).json({ success: false, message: 'Matrícula o periodo no encontrado' });
      }

      const est = matRes.rows[0];

      // 2. Traer cotejos observados
      const cotejos = await RegistroCotejoModel.findByMatriculaPeriodo(matriculaId, periodoId);

      // 3. Generar informe con Gemini
      const textoGenerado = await generarInformeInicial({
        estudianteNombre: `${est.nombres} ${est.apellidos}`,
        genero: est.genero,
        gradoNombre: est.grado_nombre,
        periodoNombre: est.periodo_nombre,
        cotejos,
        observacionesDocente,
        esFinal: Boolean(esFinal)
      });

      // 4. Guardar automáticamente en borrador
      const usuarioId = req.user?.id || null;
      const borrador = await InformeCualitativoModel.upsert({
        matricula_id: matriculaId,
        periodo_evaluacion_id: periodoId,
        texto: textoGenerado,
        generado_por_ia: true,
        estado: 'borrador',
        redactado_por: usuarioId
      });

      return res.json({
        success: true,
        data: borrador,
        message: 'Informe generado exitosamente por IA'
      });
    } catch (error) {
      console.error('Error al generar informe con IA:', error);
      return res.status(500).json({ success: false, message: 'Error al generar informe con IA: ' + error.message });
    }
  },

  async guardarInforme(req, res) {
    try {
      const { matriculaId, periodoId } = req.params;
      const { texto, estado = 'borrador' } = req.body;
      const usuarioId = req.user?.id || null;

      if (!texto?.trim()) {
        return res.status(400).json({ success: false, message: 'El texto del informe es obligatorio' });
      }

      const guardado = await InformeCualitativoModel.upsert({
        matricula_id: matriculaId,
        periodo_evaluacion_id: periodoId,
        texto: texto.trim(),
        generado_por_ia: req.body.generado_por_ia ?? false,
        estado,
        redactado_por: usuarioId
      });

      return res.json({ success: true, data: guardado, message: 'Informe guardado exitosamente' });
    } catch (error) {
      console.error('Error al guardar informe:', error);
      return res.status(500).json({ success: false, message: 'Error al guardar informe' });
    }
  },

  async publicarInforme(req, res) {
    try {
      const { matriculaId, periodoId } = req.params;
      const usuarioId = req.user?.id || null;

      const publicado = await InformeCualitativoModel.publicar(matriculaId, periodoId, usuarioId);
      if (!publicado) {
        return res.status(404).json({ success: false, message: 'No se encontró informe para publicar' });
      }

      // Notificación opcional a tutores
      try {
        await enviarNotificacionReporte({
          matriculaId,
          periodoId,
          tipo: 'informe_inicial_publicado'
        });
      } catch (notifErr) {
        console.warn('[Inicial] No se pudo enviar notificación push/WhatsApp:', notifErr.message);
      }

      return res.json({ success: true, data: publicado, message: 'Informe publicado a los padres de familia' });
    } catch (error) {
      console.error('Error al publicar informe:', error);
      return res.status(500).json({ success: false, message: 'Error al publicar informe' });
    }
  },

  // ── 5. ASIGNACIÓN EN BLOQUE MAESTRA TITULAR INICIAL ────────────────────────
  async asignarTitularInicial(req, res) {
    const client = await pool.connect();
    try {
      const { docente_id, paralelo_id, periodo_academico_id } = req.body;
      if (!docente_id || !paralelo_id || !periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'docente_id, paralelo_id y periodo_academico_id son obligatorios'
        });
      }

      await client.query('BEGIN');

      // 1. Verificar paralelo y que su nivel sea 'cualitativa'
      const parRes = await client.query(`
        SELECT p.id, p.grado_id, g.nombre as grado_nombre, na.modalidad_evaluacion
        FROM paralelo p
        JOIN grado g ON p.grado_id = g.id
        JOIN nivel_academico na ON g.nivel_academico_id = na.id
        WHERE p.id = $1;
      `, [paralelo_id]);

      if (!parRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Paralelo no encontrado' });
      }

      const { grado_id, modalidad_evaluacion } = parRes.rows[0];
      if (modalidad_evaluacion !== 'cualitativa') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'La asignación titular en bloque solo aplica para Nivel Inicial (evaluación cualitativa).'
        });
      }

      // 2. Obtener los grado_materia de los 4 campos de este grado
      const gmRes = await client.query(`
        SELECT gm.id as grado_materia_id, m.nombre as campo_nombre
        FROM grado_materia gm
        JOIN materia m ON gm.materia_id = m.id
        WHERE gm.grado_id = $1 AND gm.activo = true;
      `, [grado_id]);

      if (!gmRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'No se encontraron campos configurados para este grado de Inicial.'
        });
      }

      // 3. Insertar o actualizar asignación para cada campo
      const asignaciones = [];
      for (const gm of gmRes.rows) {
        const asigRes = await client.query(`
          INSERT INTO asignacion_docente (
            docente_id, grado_materia_id, paralelo_id, periodo_academico_id,
            es_titular, fecha_inicio, activo
          )
          VALUES ($1, $2, $3, $4, true, CURRENT_DATE, true)
          ON CONFLICT (grado_materia_id, paralelo_id, periodo_academico_id)
          DO UPDATE SET
            docente_id = EXCLUDED.docente_id,
            es_titular = true,
            activo = true,
            deleted_at = NULL,
            updated_at = NOW()
          RETURNING *;
        `, [docente_id, gm.grado_materia_id, paralelo_id, periodo_academico_id]);

        asignaciones.push({
          campo: gm.campo_nombre,
          asignacion_id: asigRes.rows[0].id
        });
      }

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        data: asignaciones,
        message: `Maestra titular asignada con éxito a los ${asignaciones.length} campos del curso.`
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al asignar titular de Inicial:', error);
      return res.status(500).json({ success: false, message: 'Error al asignar maestra titular: ' + error.message });
    } finally {
      client.release();
    }
  },

  // ── 6. BOLETÍN / LIBRETA PDF (INICIAL) ──────────────────────────────────
  async descargarBoletinPDF(req, res) {
    try {
      const { matriculaId, periodoId } = req.params;

      // 1. Datos del estudiante, curso, grado, maestro
      const queryInfo = `
        SELECT m.id as matricula_id, e.rude as codigo_rude,
               e.nombres, e.apellidos, e.ci, e.genero,
               p.nombre as paralelo_nombre, p.aula,
               g.nombre as grado_nombre,
               n.nombre as nivel_nombre,
               t.nombre as turno_nombre,
               pa.nombre as periodo_academico_nombre,
               pe.nombre as periodo_nombre, pe.orden as periodo_orden,
               CONCAT(d.nombres, ' ', d.apellidos) as docente_nombre
        FROM matricula m
        JOIN estudiante e ON m.estudiante_id = e.id
        JOIN paralelo p ON m.paralelo_id = p.id
        JOIN grado g ON p.grado_id = g.id
        JOIN nivel_academico n ON g.nivel_academico_id = n.id
        JOIN turno t ON p.turno_id = t.id
        JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
        JOIN periodo_evaluacion pe ON pe.id = $2
        LEFT JOIN asignacion_docente ad ON ad.paralelo_id = p.id AND ad.es_titular = true AND ad.activo = true
        LEFT JOIN docente d ON ad.docente_id = d.id
        WHERE m.id = $1
        LIMIT 1;
      `;
      const infoRes = await pool.query(queryInfo, [matriculaId, periodoId]);
      if (!infoRes.rows.length) {
        return res.status(404).json({ success: false, message: 'Matrícula o periodo no encontrado' });
      }
      const info = infoRes.rows[0];

      // 2. Informe cualitativo
      const informe = await InformeCualitativoModel.getByMatriculaPeriodo(matriculaId, periodoId);

      // 3. Cotejos del estudiante
      const cotejos = await RegistroCotejoModel.findByMatriculaPeriodo(matriculaId, periodoId);

      const formato = (req.query.formato || 'pdf').toLowerCase();

      // 4. FORMATO EXCEL
      if (formato === 'excel') {
        const xl = new ExcelGenerator();
        const ws = xl.createSheet('Libreta Cualitativa', { landscape: false });

        xl.addTitle(ws, 'LIBRETA DE EVALUACIÓN CUALITATIVA', 'Educación Inicial en Familia Comunitaria Escolarizada');

        xl.addInfoBox(ws, [
          { label: 'Estudiante', value: `${info.apellidos}, ${info.nombres}` },
          { label: 'Código RUDE', value: info.codigo_rude || info.ci || '—' },
          { label: 'Año de Escolaridad', value: info.grado_nombre },
          { label: 'Sección / Turno', value: `${info.paralelo_nombre} · ${info.turno_nombre || 'Mañana'}` },
          { label: 'Maestra de Aula', value: info.docente_nombre || 'Docente Titular' },
          { label: 'Período Escolar', value: `${info.periodo_academico_nombre} · ${info.periodo_nombre}` },
        ]);

        xl.addStats(ws, [
          { label: 'ED', value: 'En Desarrollo' },
          { label: 'DA', value: 'Desarrollo Aceptable' },
          { label: 'DO', value: 'Desarrollo Óptimo' },
          { label: 'DP', value: 'Desarrollo Pleno' },
        ], 4);

        if (cotejos && cotejos.length > 0) {
          const headers = ['N°', 'Campo de Saberes', 'Criterio / Indicador de Logro', 'Valoración Cualitativa'];
          const rows = cotejos.map((c, i) => [
            i + 1,
            c.campo_nombre || '—',
            c.indicador_descripcion,
            c.nivel_codigo ? `${c.nivel_codigo} (${c.nivel_nombre || ''})`.trim() : 'PENDIENTE'
          ]);
          xl.addTable(ws, headers, rows, {
            sectionTitle: 'EVALUACIÓN DE INDICADORES POR CAMPO DE SABERES',
            columnWidths: [8, 30, 65, 25]
          });
        }

        const textoInforme = informe?.texto || 'Pendiente de registro del informe cualitativo oficial para este periodo.';
        const infHeaders = ['Componente', 'Detalle Pedagógico Descriptivo'];
        const infRows = [
          ['Informe Descriptivo', textoInforme],
          ['Observaciones Docente', informe?.observaciones_docente || 'Sin observaciones adicionales'],
          ['Estado del Informe', informe?.estado === 'publicado' ? 'Publicado' : 'Borrador']
        ];
        xl.addTable(ws, infHeaders, infRows, {
          sectionTitle: 'INFORME CUALITATIVO DEL DESARROLLO INTEGRAL',
          columnWidths: [25, 80]
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=libreta-inicial-${info.apellidos}_${info.nombres}-T${info.periodo_orden || 1}.xlsx`);
        await xl.wb.xlsx.write(res);
        return res.end();
      }

      // 5. FORMATO PDF (retrato)
      const pdf = new PDFGenerator({ margin: 40, landscape: false, title: `Libreta Inicial - ${info.apellidos} ${info.nombres}` });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=libreta-inicial-${info.matricula_id}-T${info.periodo_orden || 1}.pdf`);
      pdf.pipe(res);

      pdf.drawHeader('LIBRETA DE EVALUACIÓN CUALITATIVA', 'Educación Inicial en Familia Comunitaria Escolarizada');

      pdf.drawInfoBox([
        { label: 'Estudiante', value: `${info.apellidos}, ${info.nombres}` },
        { label: 'Código RUDE', value: info.codigo_rude || info.ci || '—' },
        { label: 'Año de Escolaridad', value: info.grado_nombre },
        { label: 'Sección / Turno', value: `${info.paralelo_nombre} · ${info.turno_nombre}` },
        { label: 'Maestra de Aula', value: info.docente_nombre || 'Docente Titular' },
        { label: 'Período Escolar', value: `${info.periodo_academico_nombre} · ${info.periodo_nombre}` },
      ], 2);

      pdf.drawSection('ESCALA OFICIAL DE VALORACIÓN');
      pdf.drawStatsGrid([
        { label: 'ED', value: 'En Desarrollo' },
        { label: 'DA', value: 'Aceptable' },
        { label: 'DO', value: 'Óptimo' },
        { label: 'DP', value: 'Pleno' },
      ], 4);

      if (cotejos && cotejos.length > 0) {
        pdf.drawSection('EVALUACIÓN DE INDICADORES POR CAMPO DE DESARROLLO');
        const headers = ['Campo', 'Criterio / Indicador de Logro', 'Logro'];
        const colWidths = [150, 310, 60];
        const rows = cotejos.map(c => [
          c.campo_nombre || '—',
          c.indicador_descripcion,
          c.nivel_codigo || 'PEND.'
        ]);
        pdf.drawTable(headers, rows, { columnWidths: colWidths });
      }

      pdf.drawSection('INFORME CUALITATIVO DEL DESARROLLO INTEGRAL');
      const textoInforme = informe?.texto || 'La maestra aún no ha registrado el informe cualitativo oficial para este periodo.';
      
      const doc = pdf.doc;
      doc.font('Helvetica').fontSize(9.5).fillColor('#1A1A2E')
         .text(textoInforme, pdf._m + 10, doc.y + 4, {
           width: pdf._iW - 20,
           align: 'justify',
           lineGap: 3
         });

      doc.y += 24;

      // Firmas institucionales
      pdf._checkPageBreak(50);
      const signY = doc.y + 30;
      const colW = pdf._iW / 2;

      doc.moveTo(pdf._m + 30, signY).lineTo(pdf._m + colW - 30, signY).lineWidth(0.8).strokeColor('#6B7280').stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1A1A2E').text('MAESTRA DE AULA', pdf._m + 30, signY + 5, { width: colW - 60, align: 'center' });

      doc.moveTo(pdf._m + colW + 30, signY).lineTo(pdf._m + pdf._iW - 30, signY).lineWidth(0.8).strokeColor('#6B7280').stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1A1A2E').text('DIRECCIÓN GENERAL', pdf._m + colW + 30, signY + 5, { width: colW - 60, align: 'center' });

      pdf.end();
    } catch (error) {
      console.error('Error al generar boletín inicial:', error);
      try {
        if (pdf && pdf.doc) {
          pdf.doc.unpipe(res);
          pdf.doc.end();
        }
      } catch (_) {}
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: 'Error al generar boletín: ' + error.message });
      } else {
        res.end();
      }
    }
  },

  // ── 8. ACTIVIDADES DEL TEMARIO INICIAL ───────────────────────────────────
  async getActividades(req, res) {
    try {
      const { gradoMateriaId, gradoId, campoCodigo } = req.query;
      if (!gradoMateriaId && !gradoId) {
        return res.status(400).json({ success: false, message: 'Se requiere gradoMateriaId o gradoId' });
      }

      let query, params;
      if (gradoMateriaId) {
        query = `
          SELECT a.*, gm.grado_id, g.nombre AS grado_nombre
          FROM public.actividad_inicial a
          JOIN public.grado_materia gm ON gm.id = a.grado_materia_id
          JOIN public.grado g ON g.id = gm.grado_id
          WHERE a.grado_materia_id = $1 AND a.activo = true
          ${campoCodigo ? 'AND a.campo_codigo = $2' : ''}
          ORDER BY a.campo_codigo, a.orden, a.created_at
        `;
        params = campoCodigo ? [gradoMateriaId, campoCodigo] : [gradoMateriaId];
      } else {
        query = `
          SELECT a.*, gm.grado_id, g.nombre AS grado_nombre
          FROM public.actividad_inicial a
          JOIN public.grado_materia gm ON gm.id = a.grado_materia_id
          JOIN public.grado g ON g.id = gm.grado_id
          WHERE gm.grado_id = $1 AND a.activo = true
          ${campoCodigo ? 'AND a.campo_codigo = $2' : ''}
          ORDER BY a.campo_codigo, a.orden, a.created_at
        `;
        params = campoCodigo ? [gradoId, campoCodigo] : [gradoId];
      }

      const result = await pool.query(query, params);
      return res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Error al obtener actividades de Inicial:', error);
      return res.status(500).json({ success: false, message: 'Error interno' });
    }
  },

  async createActividad(req, res) {
    try {
      const { grado_materia_id, campo_codigo, tipo, titulo, descripcion, url, emoji, color_fondo, contenido_interactivo } = req.body;
      if (!grado_materia_id || !campo_codigo || !tipo || !titulo?.trim()) {
        return res.status(400).json({ success: false, message: 'grado_materia_id, campo_codigo, tipo y titulo son obligatorios' });
      }
      if (!['video', 'imagen', 'actividad', 'juego'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'tipo debe ser video, imagen, actividad o juego' });
      }

      // Siguiente orden para este campo
      const ordenRes = await pool.query(
        'SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM public.actividad_inicial WHERE grado_materia_id = $1 AND campo_codigo = $2',
        [grado_materia_id, campo_codigo]
      );
      const orden = ordenRes.rows[0].siguiente;

      const result = await pool.query(`
        INSERT INTO public.actividad_inicial
          (grado_materia_id, campo_codigo, tipo, titulo, descripcion, url, emoji, color_fondo, contenido_interactivo, orden, creado_por)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        grado_materia_id,
        campo_codigo,
        tipo,
        titulo.trim(),
        descripcion?.trim() || null,
        url?.trim() || null,
        emoji || '⭐',
        color_fondo || '#6366F1',
        contenido_interactivo ? JSON.stringify(contenido_interactivo) : null,
        orden,
        req.user?.id || null
      ]);

      return res.status(201).json({ success: true, data: result.rows[0], message: 'Actividad creada con éxito' });
    } catch (error) {
      console.error('Error al crear actividad:', error);
      return res.status(500).json({ success: false, message: 'Error al crear actividad: ' + error.message });
    }
  },

  async updateActividad(req, res) {
    try {
      const { id } = req.params;
      const { tipo, titulo, descripcion, url, emoji, color_fondo, contenido_interactivo, orden } = req.body;

      if (tipo && !['video', 'imagen', 'actividad', 'juego'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'tipo debe ser video, imagen, actividad o juego' });
      }

      const result = await pool.query(`
        UPDATE public.actividad_inicial SET
          tipo = COALESCE($1, tipo),
          titulo = COALESCE($2, titulo),
          descripcion = $3,
          url = $4,
          emoji = COALESCE($5, emoji),
          color_fondo = COALESCE($6, color_fondo),
          contenido_interactivo = COALESCE($7, contenido_interactivo),
          orden = COALESCE($8, orden),
          updated_at = NOW()
        WHERE id = $9 AND activo = true
        RETURNING *
      `, [
        tipo || null,
        titulo?.trim() || null,
        descripcion?.trim() || null,
        url?.trim() || null,
        emoji || null,
        color_fondo || null,
        contenido_interactivo ? JSON.stringify(contenido_interactivo) : null,
        orden || null,
        id
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Actividad no encontrada' });
      }
      return res.json({ success: true, data: result.rows[0], message: 'Actividad actualizada' });
    } catch (error) {
      console.error('Error al actualizar actividad:', error);
      return res.status(500).json({ success: false, message: 'Error al actualizar actividad: ' + error.message });
    }
  },

  async deleteActividad(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query(
        'UPDATE public.actividad_inicial SET activo = false, updated_at = NOW() WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Actividad no encontrada' });
      }
      return res.json({ success: true, message: 'Actividad eliminada' });
    } catch (error) {
      console.error('Error al eliminar actividad:', error);
      return res.status(500).json({ success: false, message: 'Error al eliminar actividad' });
    }
  },

  // ── 9. GENERACIÓN DE ACTIVIDADES LÚDICAS CON GEMINI IA ───────────────────
  async generarActividadesIA(req, res) {
    try {
      const { campoCodigo, campoNombre, tema, gradoNombre, tipoJuego, cantidad, formato } = req.body;
      if (!tema?.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Debes indicar un tema o idea central para la actividad lúdica.'
        });
      }

      const propuestas = await generarActividadesLudicasInicial({
        campoCodigo,
        campoNombre,
        tema: tema.trim(),
        gradoNombre,
        formato: formato || 'juego',
        tipoJuego: tipoJuego || 'mixto',
        cantidad: Math.min(Math.max(parseInt(cantidad) || 3, 1), 8),
      });

      return res.json({
        success: true,
        data: propuestas,
        message: 'Propuestas de actividades generadas exitosamente con Gemini'
      });
    } catch (error) {
      console.error('Error al generar actividades con Gemini IA:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al generar actividades con IA: ' + error.message
      });
    }
  },

  // ── 10. REPORTE MATRIZ DE LISTA DE COTEJO (PDF / EXCEL) ───────────────────
  async reporteMatrizCotejo(req, res) {
    try {
      const { paraleloId, periodoId } = req.params;
      const formato = (req.query.formato || 'pdf').toLowerCase();
      const pId = parseInt(paraleloId, 10);
      const perId = parseInt(periodoId, 10);

      if (isNaN(pId) || isNaN(perId)) {
        return res.status(400).json({ success: false, message: 'paraleloId y periodoId deben ser números válidos' });
      }

      const matriz = await RegistroCotejoModel.findMatrizByParalelo(pId, perId);
      if (!matriz) {
        return res.status(404).json({ success: false, message: 'Paralelo no encontrado' });
      }

      // Información adicional: período y docente
      const peRes = await pool.query(`
        SELECT pe.nombre as periodo_nombre, pe.orden as periodo_orden, pa.nombre as gestion_nombre
        FROM periodo_evaluacion pe
        JOIN periodo_academico pa ON pe.periodo_academico_id = pa.id
        WHERE pe.id = $1
      `, [perId]);
      const periodoInfo = peRes.rows[0] || { periodo_nombre: `Trimestre ${perId}`, gestion_nombre: 'Gestión Actual' };

      const docRes = await pool.query(`
        SELECT CONCAT(d.nombres, ' ', d.apellidos) as docente_nombre, t.nombre as turno_nombre
        FROM paralelo p
        LEFT JOIN turno t ON p.turno_id = t.id
        LEFT JOIN asignacion_docente ad ON ad.paralelo_id = p.id AND ad.es_titular = true AND ad.activo = true
        LEFT JOIN docente d ON ad.docente_id = d.id
        WHERE p.id = $1 LIMIT 1
      `, [pId]);
      const aulaDocente = docRes.rows[0] || {};

      const { gradoMateriaId, campoCodigo, materiaCodigo } = req.query;
      const estudiantes = matriz.estudiantes || [];
      let indicadores = matriz.indicadores || [];
      const registros = matriz.registros || [];

      let nombreCampoFiltro = null;
      if (gradoMateriaId) {
        indicadores = indicadores.filter(ind => String(ind.grado_materia_id) === String(gradoMateriaId));
      } else if (campoCodigo) {
        indicadores = indicadores.filter(ind => ind.campo_codigo?.toLowerCase() === campoCodigo.toLowerCase());
      } else if (materiaCodigo && materiaCodigo !== 'GENERAL-INICIAL' && materiaCodigo !== 'AULA-INICIAL') {
        const cod = materiaCodigo.replace(/^INI-/, '').toLowerCase();
        indicadores = indicadores.filter(ind => {
          const c = (ind.campo_codigo || '').toLowerCase();
          return c === cod || c.includes(cod) || cod.includes(c);
        });
      }

      if (indicadores.length > 0 && (gradoMateriaId || campoCodigo || (materiaCodigo && materiaCodigo !== 'GENERAL-INICIAL' && materiaCodigo !== 'AULA-INICIAL'))) {
        nombreCampoFiltro = indicadores[0]?.campo_nombre || null;
      }

      const tituloReporte = nombreCampoFiltro
        ? `LISTA DE COTEJO · ${nombreCampoFiltro.toUpperCase()}`
        : 'MATRIZ DE LISTAS DE COTEJO';
      const subtituloReporte = nombreCampoFiltro
        ? `Evaluación Curricular del Campo: ${nombreCampoFiltro}`
        : 'Educación Inicial en Familia Comunitaria';
      const sufijoFile = materiaCodigo && materiaCodigo !== 'GENERAL-INICIAL' && materiaCodigo !== 'AULA-INICIAL' ? `-${materiaCodigo}` : '';

      // Mapear cotejo por `${matricula_id}_${indicador_id}`
      const mapaCotejo = new Map();
      registros.forEach(r => {
        mapaCotejo.set(`${r.matricula_id}_${r.indicador_logro_id}`, r.nivel_codigo || '—');
      });

      if (formato === 'excel') {
        const xl = new ExcelGenerator();
        const ws = xl.createSheet('Lista de Cotejo', { landscape: true });

        xl.addTitle(ws, tituloReporte, subtituloReporte);
        xl.addInfoBox(ws, [
          { label: 'Año de Escolaridad', value: matriz.paralelo.grado_nombre },
          { label: 'Paralelo / Turno', value: `${matriz.paralelo.nombre} · ${aulaDocente.turno_nombre || 'Mañana'}` },
          { label: 'Período', value: `${periodoInfo.gestion_nombre} · ${periodoInfo.periodo_nombre}` },
          { label: 'Maestra de Aula', value: aulaDocente.docente_nombre || 'Docente Titular' },
          ...(nombreCampoFiltro ? [{ label: 'Campo Evaluado', value: nombreCampoFiltro }] : []),
        ]);

        xl.addStats(ws, [
          { label: 'ED', value: 'En Desarrollo' },
          { label: 'DA', value: 'Desarrollo Aceptable' },
          { label: 'DO', value: 'Desarrollo Óptimo' },
          { label: 'DP', value: 'Desarrollo Pleno' },
        ], 4);

        const headers = ['N°', 'RUDE', 'Apellidos y Nombres', ...indicadores.map((ind, i) => `I${i + 1} (${ind.campo_codigo || 'C'})`)];
        const rows = estudiantes.map((est, i) => [
          i + 1,
          est.codigo_rude || est.ci || '—',
          `${est.apellidos || `${est.apellido_paterno || ''} ${est.apellido_materno || ''}`.trim()}, ${est.nombres}`,
          ...indicadores.map(ind => mapaCotejo.get(`${est.matricula_id}_${ind.id}`) || '—')
        ]);

        xl.addTable(ws, headers, rows, { sectionTitle: nombreCampoFiltro ? `VALORACIÓN DE LOGROS — ${nombreCampoFiltro.toUpperCase()}` : 'VALORACIÓN DE INDICADORES DE LOGRO' });

        if (indicadores.length > 0) {
          const wsInd = xl.createSheet('Indicadores de Logro', { landscape: false });
          xl.addTitle(wsInd, 'DETALLE DE INDICADORES DE LOGRO', `${periodoInfo.periodo_nombre}`);
          const indHeaders = ['Código', 'Campo de Saberes', 'Criterio / Indicador Evaluado'];
          const indRows = indicadores.map((ind, i) => [
            `I${i + 1}`,
            ind.campo_nombre || ind.campo_codigo || '—',
            ind.descripcion
          ]);
          xl.addTable(wsInd, indHeaders, indRows, {
            sectionTitle: 'INDICADORES CURRICULARES EVALUADOS',
            columnWidths: [12, 35, 75]
          });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=matriz-cotejo-${matriz.paralelo.nombre}${sufijoFile}-T${periodoInfo.periodo_orden || 1}.xlsx`);
        await xl.wb.xlsx.write(res);
        return res.end();
      }

      // FORMATO PDF (Landscape)
      const pdf = new PDFGenerator({
        landscape: true,
        title: `Lista de Cotejo - ${matriz.paralelo.grado_nombre} ${matriz.paralelo.nombre}`
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=matriz-cotejo-${matriz.paralelo.nombre}${sufijoFile}-T${periodoInfo.periodo_orden || 1}.pdf`);
      pdf.pipe(res);

      pdf.drawHeader(tituloReporte, subtituloReporte);

      pdf.drawInfoBox([
        { label: 'Año de Escolaridad', value: matriz.paralelo.grado_nombre },
        { label: 'Paralelo / Turno', value: `${matriz.paralelo.nombre} · ${aulaDocente.turno_nombre || 'Mañana'}` },
        { label: 'Período', value: `${periodoInfo.gestion_nombre} · ${periodoInfo.periodo_nombre}` },
        { label: 'Maestra de Aula', value: aulaDocente.docente_nombre || 'Docente Titular' },
        ...(nombreCampoFiltro ? [{ label: 'Campo Evaluado', value: nombreCampoFiltro }] : []),
      ], 2);

      pdf.drawSection('ESCALA OFICIAL DE LOGROS');
      pdf.drawStatsGrid([
        { label: 'ED', value: 'En Desarrollo' },
        { label: 'DA', value: 'Desarrollo Aceptable' },
        { label: 'DO', value: 'Desarrollo Óptimo' },
        { label: 'DP', value: 'Desarrollo Pleno' },
      ], 4);

      pdf.drawSection('REGISTRO GENERAL DE VALORACIÓN');
      const numInd = indicadores.length;
      const headers = ['N°', 'Estudiante', ...indicadores.map((_, i) => `I${i + 1}`)];
      
      const nColW = 28;
      const nameColW = 190;
      const restW = pdf._iW - nColW - nameColW;
      const indColW = numInd > 0 ? Math.max(Math.floor(restW / numInd), 28) : 40;
      const columnWidths = [nColW, nameColW, ...indicadores.map(() => indColW)];

      const rows = estudiantes.map((est, i) => [
        i + 1,
        `${est.apellidos || `${est.apellido_paterno || ''} ${est.apellido_materno || ''}`.trim()}, ${est.nombres}`,
        ...indicadores.map(ind => mapaCotejo.get(`${est.matricula_id}_${ind.id}`) || '—')
      ]);

      pdf.drawTable(headers, rows, { columnWidths });

      if (indicadores.length > 0) {
        pdf.drawSection('REFERENCIA DE INDICADORES EVALUADOS');
        const indHeaders = ['Cód.', 'Campo de Saberes', 'Descripción del Indicador de Logro'];
        const indColWidths = [35, 180, pdf._iW - 215];
        const indRows = indicadores.map((ind, i) => [
          `I${i + 1}`,
          ind.campo_nombre || ind.campo_codigo || '—',
          ind.descripcion
        ]);
        pdf.drawTable(indHeaders, indRows, { columnWidths: indColWidths, rowHeight: 18 });
      }

      pdf._checkPageBreak(50);
      const signY = pdf.doc.y + 35;
      const colW = pdf._iW / 2;
      const doc = pdf.doc;

      doc.moveTo(pdf._m + 40, signY).lineTo(pdf._m + colW - 40, signY).lineWidth(0.8).strokeColor('#6B7280').stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1A1A2E').text('MAESTRA DE AULA', pdf._m + 40, signY + 5, { width: colW - 80, align: 'center' });

      doc.moveTo(pdf._m + colW + 40, signY).lineTo(pdf._m + pdf._iW - 40, signY).lineWidth(0.8).strokeColor('#6B7280').stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1A1A2E').text('DIRECCIÓN GENERAL', pdf._m + colW + 40, signY + 5, { width: colW - 80, align: 'center' });

      pdf.end();
    } catch (error) {
      console.error('Error al generar reporte matriz de cotejo:', error);
      try {
        if (pdf && pdf.doc) {
          pdf.doc.unpipe(res);
          pdf.doc.end();
        }
      } catch (_) {}
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: 'Error al generar reporte: ' + error.message });
      } else {
        res.end();
      }
    }
  },

  // ── 11. REPORTE CENTRALIZADOR DE INFORMES CUALITATIVOS (PDF / EXCEL) ──────
  async reporteCentralizadorInformes(req, res) {
    try {
      const { paraleloId, periodoId } = req.params;
      const formato = (req.query.formato || 'pdf').toLowerCase();
      const pId = parseInt(paraleloId, 10);
      const perId = parseInt(periodoId, 10);

      if (isNaN(pId) || isNaN(perId)) {
        return res.status(400).json({ success: false, message: 'paraleloId y periodoId deben ser números válidos' });
      }

      const informes = await InformeCualitativoModel.findByParaleloPeriodo(pId, perId);

      const parRes = await pool.query(`
        SELECT p.id, p.nombre as paralelo_nombre, g.nombre as grado_nombre, t.nombre as turno_nombre,
               CONCAT(d.nombres, ' ', d.apellidos) as docente_nombre
        FROM paralelo p
        JOIN grado g ON p.grado_id = g.id
        LEFT JOIN turno t ON p.turno_id = t.id
        LEFT JOIN asignacion_docente ad ON ad.paralelo_id = p.id AND ad.es_titular = true AND ad.activo = true
        LEFT JOIN docente d ON ad.docente_id = d.id
        WHERE p.id = $1 LIMIT 1
      `, [pId]);
      const curso = parRes.rows[0] || {};

      const peRes = await pool.query(`
        SELECT pe.nombre as periodo_nombre, pe.orden as periodo_orden, pa.nombre as gestion_nombre
        FROM periodo_evaluacion pe
        JOIN periodo_academico pa ON pe.periodo_academico_id = pa.id
        WHERE pe.id = $1
      `, [perId]);
      const periodoInfo = peRes.rows[0] || { periodo_nombre: `Trimestre ${perId}`, gestion_nombre: 'Gestión Actual' };

      if (formato === 'excel') {
        const xl = new ExcelGenerator();
        const ws = xl.createSheet('Reporte General', { landscape: true });

        xl.addTitle(ws, 'REPORTE GENERAL DE INFORMES CUALITATIVOS', 'Educación Inicial en Familia Comunitaria');
        xl.addInfoBox(ws, [
          { label: 'Año de Escolaridad', value: curso.grado_nombre },
          { label: 'Paralelo / Turno', value: `${curso.paralelo_nombre} · ${curso.turno_nombre || 'Mañana'}` },
          { label: 'Período', value: `${periodoInfo.gestion_nombre} · ${periodoInfo.periodo_nombre}` },
          { label: 'Maestra de Aula', value: curso.docente_nombre || 'Docente Titular' },
        ]);

        const headers = ['N°', 'RUDE', 'Estudiante', 'Estado', 'Informe Pedagógico Cualitativo (Texto Completo)', 'Fecha de Registro'];
        const rows = informes.map((inf, i) => [
          i + 1,
          inf.codigo_rude || '—',
          `${inf.apellidos}, ${inf.nombres}`,
          inf.estado === 'publicado' ? 'Publicado' : 'Borrador',
          inf.texto || 'Pendiente de redacción',
          inf.updated_at ? new Date(inf.updated_at).toLocaleDateString('es-BO') : '—'
        ]);

        xl.addTable(ws, headers, rows, {
          sectionTitle: 'NÓMINA DE INFORMES CUALITATIVOS REGISTRADOS EN EL SISTEMA',
          columnWidths: [8, 18, 34, 14, 90, 16]
        });

        // Habilitar ajuste de texto en la columna del informe pedagógico
        ws.eachRow((row, rowNumber) => {
          if (rowNumber > 8) {
            const cell = row.getCell(5);
            cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
          }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=reporte-general-informes-${curso.paralelo_nombre}-T${periodoInfo.periodo_orden || 1}.xlsx`);
        await xl.wb.xlsx.write(res);
        return res.end();
      }

      // FORMATO PDF (Portrait)
      const pdf = new PDFGenerator({
        landscape: false,
        title: `Reporte General Informes - ${curso.grado_nombre} ${curso.paralelo_nombre}`
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=reporte-general-informes-${curso.paralelo_nombre}-T${periodoInfo.periodo_orden || 1}.pdf`);
      pdf.pipe(res);

      pdf.drawHeader('REPORTE GENERAL DE INFORMES CUALITATIVOS', 'Educación Inicial en Familia Comunitaria');

      pdf.drawInfoBox([
        { label: 'Año de Escolaridad', value: curso.grado_nombre },
        { label: 'Paralelo / Turno', value: `${curso.paralelo_nombre} · ${curso.turno_nombre || 'Mañana'}` },
        { label: 'Período', value: `${periodoInfo.gestion_nombre} · ${periodoInfo.periodo_nombre}` },
        { label: 'Maestra de Aula', value: curso.docente_nombre || 'Docente Titular' },
      ], 2);

      const totalRegistrados = informes.filter(i => i.texto && i.texto.trim()).length;
      pdf.drawStatsGrid([
        { label: 'Total Estudiantes', value: informes.length },
        { label: 'Informes Registrados', value: totalRegistrados },
        { label: 'Publicados', value: informes.filter(i => i.estado === 'publicado').length },
        { label: 'Pendientes', value: informes.length - totalRegistrados },
      ], 4);

      pdf.drawSection('CONSOLIDADO GENERAL DE INFORMES PEDAGÓGICOS');

      const doc = pdf.doc;
      informes.forEach((inf, i) => {
        const estNombre = `${inf.apellidos || ''}, ${inf.nombres || ''}`;
        const textoDesc = inf.texto || 'Pendiente de registro en el sistema.';
        const rude = inf.codigo_rude || '—';
        const esPublicado = inf.estado === 'publicado';
        const estadoLabel = esPublicado ? 'PUBLICADO' : (inf.texto ? 'BORRADOR' : 'PENDIENTE');
        const estadoColor = esPublicado ? '#16A34A' : (inf.texto ? '#D97706' : '#94A3B8');

        doc.font('Helvetica').fontSize(8.5);
        const textH = doc.heightOfString(textoDesc, { width: pdf._iW - 24, align: 'justify', lineGap: 2 });
        const blockH = Math.max(textH + 34, 48);

        pdf._checkPageBreak(blockH + 10);

        const curY = doc.y;

        // Fondo y borde del bloque de estudiante
        doc.roundedRect(pdf._m, curY, pdf._iW, blockH, 5)
           .fillColor(i % 2 === 0 ? '#F8FAFC' : '#FFFFFF').fill();
        doc.roundedRect(pdf._m, curY, pdf._iW, blockH, 5)
           .lineWidth(0.5).strokeColor('#E2E8F0').stroke();

        // Barra vertical izquierda de estado
        doc.roundedRect(pdf._m, curY, 4, blockH, 2)
           .fillColor(esPublicado ? '#2563EB' : (inf.texto ? '#F59E0B' : '#CBD5E1')).fill();

        // Cabecera del bloque: Nombre y RUDE
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F172A')
           .text(`${i + 1}. ${estNombre}`, pdf._m + 12, curY + 6, { width: pdf._iW - 130, lineBreak: false, ellipsis: true });

        doc.font('Helvetica').fontSize(7.5).fillColor('#64748B')
           .text(`RUDE: ${rude}`, pdf._m + 12, curY + 18, { lineBreak: false });

        // Badge de estado
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(estadoColor)
           .text(estadoLabel, pdf._m + pdf._iW - 90, curY + 8, { width: 80, align: 'right' });

        // Texto cualitativo completo
        doc.font('Helvetica').fontSize(8.5).fillColor('#334155')
           .text(textoDesc, pdf._m + 12, curY + 30, {
             width: pdf._iW - 24,
             align: 'justify',
             lineGap: 2.2
           });

        doc.y = curY + blockH + 6;
      });

      pdf._checkPageBreak(50);
      const signY = doc.y + 35;
      const colW = pdf._iW / 2;

      doc.moveTo(pdf._m + 30, signY).lineTo(pdf._m + colW - 30, signY).lineWidth(0.8).strokeColor('#6B7280').stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1A1A2E').text('MAESTRA DE AULA', pdf._m + 30, signY + 5, { width: colW - 60, align: 'center' });

      doc.moveTo(pdf._m + colW + 30, signY).lineTo(pdf._m + pdf._iW - 30, signY).lineWidth(0.8).strokeColor('#6B7280').stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1A1A2E').text('DIRECCIÓN GENERAL', pdf._m + colW + 30, signY + 5, { width: colW - 60, align: 'center' });

      pdf.end();
    } catch (error) {
      console.error('Error al generar centralizador de informes PDF:', error);
      try {
        if (pdf && pdf.doc) {
          pdf.doc.unpipe(res);
          pdf.doc.end();
        }
      } catch (_) {}
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: 'Error al generar centralizador: ' + error.message });
      } else {
        res.end();
      }
    }
  },
};
