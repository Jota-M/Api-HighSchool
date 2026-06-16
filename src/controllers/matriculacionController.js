// controllers/matriculacionController.js
import { pool } from '../db/pool.js';
import { Estudiante } from '../models/Estudiantes.js';
import { Matricula, MatriculaDocumento } from '../models/Matricula.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class MatriculacionController {

  // ============================================================
  // 📋 LISTAR ESTUDIANTES ELEGIBLES PARA MATRICULACIÓN
  // ============================================================
  static async listarEstudiantesElegibles(req, res) {
    try {
      const {
        periodo_academico_id,
        page = 1,
        limit = 20,
        search,
        incluir_con_matricula = false
      } = req.query;

      if (!periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar un periodo académico'
        });
      }

      const offset = (page - 1) * limit;
      let whereConditions = ['e.deleted_at IS NULL', 'e.activo = true'];
      let queryParams = [periodo_academico_id];
      let paramCounter = 2;

      if (search) {
        whereConditions.push(`(
          e.nombres ILIKE $${paramCounter} OR
          e.apellido_paterno ILIKE $${paramCounter} OR
          e.apellido_materno ILIKE $${paramCounter} OR
          e.codigo ILIKE $${paramCounter} OR
          e.ci ILIKE $${paramCounter}
        )`);
        queryParams.push(`%${search}%`);
        paramCounter++;
      }

      const matriculaCondition = incluir_con_matricula === 'true' ? '' : 'AND m.id IS NULL';
      const whereClause = whereConditions.join(' AND ');

      const countQuery = `
        SELECT COUNT(DISTINCT e.id)
        FROM estudiante e
        LEFT JOIN matricula m ON e.id = m.estudiante_id
          AND m.periodo_academico_id = $1
          AND m.deleted_at IS NULL
        WHERE ${whereClause} ${matriculaCondition}
      `;
      const countResult = await pool.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      const dataQuery = `
        SELECT DISTINCT ON (e.id)
          e.id, e.codigo, e.nombres, e.apellido_paterno, e.apellido_materno,
          e.fecha_nacimiento, e.ci, e.foto_url, e.telefono, e.email,
          m.id as matricula_actual_id,
          m.estado as matricula_estado,
          pa_actual.nombre as periodo_actual,
          p_actual.nombre as paralelo_actual,
          g_actual.nombre as grado_actual,
          (
            SELECT json_build_object(
              'periodo', pa_ant.nombre,
              'grado', g_ant.nombre,
              'paralelo', p_ant.nombre,
              'estado', m_ant.estado
            )
            FROM matricula m_ant
            INNER JOIN periodo_academico pa_ant ON m_ant.periodo_academico_id = pa_ant.id
            INNER JOIN paralelo p_ant ON m_ant.paralelo_id = p_ant.id
            INNER JOIN grado g_ant ON p_ant.grado_id = g_ant.id
            WHERE m_ant.estudiante_id = e.id AND m_ant.deleted_at IS NULL
            ORDER BY pa_ant.fecha_inicio DESC
            LIMIT 1
          ) as ultima_matricula
        FROM estudiante e
        LEFT JOIN matricula m ON e.id = m.estudiante_id
          AND m.periodo_academico_id = $1
          AND m.deleted_at IS NULL
        LEFT JOIN periodo_academico pa_actual ON m.periodo_academico_id = pa_actual.id
        LEFT JOIN paralelo p_actual ON m.paralelo_id = p_actual.id
        LEFT JOIN grado g_actual ON p_actual.grado_id = g_actual.id
        WHERE ${whereClause} ${matriculaCondition}
        ORDER BY e.id, e.apellido_paterno, e.apellido_materno, e.nombres
        LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
      `;

      queryParams.push(limit, offset);
      const result = await pool.query(dataQuery, queryParams);

      res.json({
        success: true,
        data: {
          estudiantes: result.rows,
          paginacion: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Error al listar estudiantes elegibles:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 🔍 OBTENER MATRÍCULA POR ID (DETALLE COMPLETO)
  // ============================================================
  static async obtenerMatricula(req, res) {
    try {
      const { id } = req.params;

      const matricula = await Matricula.findByIdCompleto(id);
      if (!matricula) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      // Obtener documentos
      const documentos = await MatriculaDocumento.findByMatricula(id);

      // Obtener historial de cambios desde actividad_log
      const historialQuery = `
        SELECT
          al.accion,
          al.mensaje,
          al.created_at,
          al.datos_anteriores,
          al.datos_nuevos,
          u.username as usuario
        FROM actividad_log al
        LEFT JOIN usuarios u ON al.usuario_id = u.id
        WHERE al.tabla_afectada = 'matricula' AND al.registro_id = $1
        ORDER BY al.created_at DESC
        LIMIT 20
      `;
      const historialResult = await pool.query(historialQuery, [id]);

      res.json({
        success: true,
        data: {
          matricula,
          documentos,
          historial: historialResult.rows
        }
      });

    } catch (error) {
      console.error('Error al obtener matrícula:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // ✅ MATRICULAR ESTUDIANTE EXISTENTE
  // ============================================================
  static async matricularEstudiante(req, res) {
    const client = await pool.connect();
    const documentos_urls = [];

    try {
      await client.query('BEGIN');

      const { estudiante_id } = req.params;
      let { matricula, documentos } = req.body;

      const parseJSON = (data, defaultValue = null) => {
        if (!data) return defaultValue;
        if (typeof data === 'object') return data;
        try { return JSON.parse(data); } catch { return defaultValue; }
      };

      matricula = parseJSON(matricula, null);
      documentos = parseJSON(documentos, []);

      if (!matricula || !matricula.paralelo_id || !matricula.periodo_academico_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Debe proporcionar paralelo y periodo académico' });
      }

      const estudiante = await Estudiante.findById(estudiante_id);
      if (!estudiante) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Estudiante no encontrado' });
      }

      const matriculaExistente = await Matricula.exists(estudiante_id, matricula.periodo_academico_id);
      if (matriculaExistente) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'El estudiante ya tiene una matrícula en este periodo',
          data: { matricula_id: matriculaExistente.id }
        });
      }

      const capacidad = await Matricula.checkCapacidad(matricula.paralelo_id, matricula.periodo_academico_id);
      if (!capacidad.disponible) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Paralelo sin capacidad (${capacidad.matriculas_actuales}/${capacidad.capacidad_maxima})`
        });
      }

      const numero_matricula = await Matricula.generateNumeroMatricula(matricula.periodo_academico_id, client);

      const matriculaQuery = `
        INSERT INTO matricula (
          estudiante_id, paralelo_id, periodo_academico_id, numero_matricula,
          fecha_matricula, estado, es_repitente, es_becado, porcentaje_beca,
          tipo_beca, observaciones
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const matriculaResult = await client.query(matriculaQuery, [
        estudiante_id,
        matricula.paralelo_id,
        matricula.periodo_academico_id,
        numero_matricula,
        matricula.fecha_matricula || new Date(),
        'activo',
        matricula.es_repitente ?? false,
        matricula.es_becado ?? false,
        matricula.porcentaje_beca,
        matricula.tipo_beca,
        matricula.observaciones
      ]);

      const nuevaMatricula = matriculaResult.rows[0];

      // Subir documentos
      const documentosCreados = [];
      if (req.files && req.files.documentos) {
        for (let i = 0; i < req.files.documentos.length; i++) {
          const file = req.files.documentos[i];
          try {
            const docMetadata = documentos[i] || null;
            if (!docMetadata?.tipo_documento) {
              throw new Error(`Tipo de documento no especificado para ${file.originalname}`);
            }

            const uploadResult = await UploadImage.uploadFromBuffer(
              file.buffer,
              'documentos_matricula',
              `matricula_${nuevaMatricula.id}_${docMetadata.tipo_documento}_${Date.now()}`
            );
            documentos_urls.push(uploadResult.url);

            const docResult = await client.query(`
              INSERT INTO matricula_documento (matricula_id, tipo_documento, nombre_archivo, url_archivo, verificado, observaciones)
              VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
            `, [nuevaMatricula.id, docMetadata.tipo_documento, file.originalname, uploadResult.url, false, docMetadata.observaciones || null]);

            documentosCreados.push(docResult.rows[0]);
          } catch (uploadError) {
            await client.query('ROLLBACK');
            for (const url of documentos_urls) {
              const publicId = UploadImage.extractPublicIdFromUrl(url);
              if (publicId) await UploadImage.deleteImage(publicId).catch(console.error);
            }
            return res.status(500).json({ success: false, message: 'Error al subir documentos: ' + uploadError.message });
          }
        }
      }

      await client.query('COMMIT');

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'matricular_estudiante',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: nuevaMatricula.id,
        datos_nuevos: { estudiante_id, numero_matricula, paralelo_id: matricula.paralelo_id, documentos_subidos: documentosCreados.length },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Matrícula creada: ${numero_matricula} - ${estudiante.nombres} ${estudiante.apellido_paterno}`
      });

      const matriculaCompleta = await Matricula.findByIdCompleto(nuevaMatricula.id);

      res.status(201).json({
        success: true,
        message: 'Matrícula creada exitosamente',
        data: {
          matricula: matriculaCompleta,
          documentos: documentosCreados
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      for (const url of documentos_urls) {
        const publicId = UploadImage.extractPublicIdFromUrl(url);
        if (publicId) await UploadImage.deleteImage(publicId).catch(console.error);
      }
      console.error('Error en matriculación:', error);
      res.status(500).json({ success: false, message: 'Error al crear matrícula: ' + error.message });
    } finally {
      client.release();
    }
  }

  // ============================================================
  // 🔄 REMATRICULAR ESTUDIANTE
  // ============================================================
  static async rematricularEstudiante(req, res) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { estudiante_id } = req.params;
      const { periodo_academico_id, paralelo_id, es_repitente, es_becado, porcentaje_beca, tipo_beca, observaciones } = req.body;

      if (!periodo_academico_id || !paralelo_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Debe especificar periodo y paralelo' });
      }

      const estudiante = await Estudiante.findById(estudiante_id);
      if (!estudiante) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Estudiante no encontrado' });
      }

      const matriculaExistente = await Matricula.exists(estudiante_id, periodo_academico_id);
      if (matriculaExistente) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'Ya existe matrícula para este periodo' });
      }

      const capacidad = await Matricula.checkCapacidad(paralelo_id, periodo_academico_id);
      if (!capacidad.disponible) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'Paralelo sin capacidad disponible' });
      }

      const numero_matricula = await Matricula.generateNumeroMatricula(periodo_academico_id, client);

      const result = await client.query(`
        INSERT INTO matricula (
          estudiante_id, paralelo_id, periodo_academico_id, numero_matricula,
          fecha_matricula, estado, es_repitente, es_becado, porcentaje_beca, tipo_beca, observaciones
        )
        VALUES ($1, $2, $3, $4, CURRENT_DATE, 'activo', $5, $6, $7, $8, $9)
        RETURNING *
      `, [estudiante_id, paralelo_id, periodo_academico_id, numero_matricula,
          es_repitente ?? false, es_becado ?? false, porcentaje_beca, tipo_beca, observaciones]);

      const nuevaMatricula = result.rows[0];
      await client.query('COMMIT');

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'rematricular_estudiante',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: nuevaMatricula.id,
        datos_nuevos: { estudiante_id, numero_matricula, paralelo_id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Re-matrícula: ${numero_matricula} - ${estudiante.nombres} ${estudiante.apellido_paterno}`
      });

      const matriculaCompleta = await Matricula.findByIdCompleto(nuevaMatricula.id);

      res.status(201).json({ success: true, message: 'Re-matrícula exitosa', data: { matricula: matriculaCompleta } });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en re-matriculación:', error);
      res.status(500).json({ success: false, message: 'Error al re-matricular: ' + error.message });
    } finally {
      client.release();
    }
  }

  // ============================================================
  // ✏️ ACTUALIZAR MATRÍCULA (beca, paralelo, observaciones)
  // ============================================================
  static async actualizarMatricula(req, res) {
    try {
      const { id } = req.params;
      const { paralelo_id, es_becado, porcentaje_beca, tipo_beca, observaciones } = req.body;

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      if (paralelo_id && paralelo_id !== matricula.paralelo_id) {
        const capacidad = await Matricula.checkCapacidad(paralelo_id, matricula.periodo_academico_id);
        if (!capacidad.disponible) {
          return res.status(409).json({ success: false, message: 'El paralelo destino no tiene capacidad' });
        }
      }

      const updated = await Matricula.update(id, {
        paralelo_id: paralelo_id || matricula.paralelo_id,
        estado: matricula.estado,
        es_repitente: matricula.es_repitente,
        es_becado: es_becado ?? matricula.es_becado,
        porcentaje_beca: porcentaje_beca ?? matricula.porcentaje_beca,
        tipo_beca: tipo_beca || matricula.tipo_beca,
        observaciones: observaciones || matricula.observaciones
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar_matricula',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: id,
        datos_anteriores: matricula,
        datos_nuevos: updated,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Matrícula actualizada: ${matricula.numero_matricula}`
      });

      const matriculaCompleta = await Matricula.findByIdCompleto(id);

      res.json({ success: true, message: 'Matrícula actualizada', data: { matricula: matriculaCompleta } });

    } catch (error) {
      console.error('Error al actualizar matrícula:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 🔀 TRANSFERIR PARALELO
  // ============================================================
  static async transferirParalelo(req, res) {
    try {
      const { id } = req.params;
      const { nuevo_paralelo_id, motivo } = req.body;

      if (!nuevo_paralelo_id || !motivo) {
        return res.status(400).json({ success: false, message: 'Debe especificar el nuevo paralelo y motivo' });
      }

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      if (matricula.estado !== 'activo') {
        return res.status(409).json({ success: false, message: 'Solo se pueden transferir matrículas activas' });
      }

      if (nuevo_paralelo_id === matricula.paralelo_id) {
        return res.status(400).json({ success: false, message: 'El estudiante ya está en ese paralelo' });
      }

      // Verificar capacidad del paralelo destino
      const capacidad = await Matricula.checkCapacidad(nuevo_paralelo_id, matricula.periodo_academico_id);
      if (!capacidad.disponible) {
        return res.status(409).json({
          success: false,
          message: `El paralelo destino no tiene capacidad (${capacidad.matriculas_actuales}/${capacidad.capacidad_maxima})`
        });
      }

      // Guardar paralelo anterior para el log
      const paralelo_anterior_id = matricula.paralelo_id;
      const paralelo_anterior_nombre = matricula.paralelo_nombre;

      const updated = await Matricula.transferirParalelo(id, nuevo_paralelo_id, motivo);

      // Info del nuevo paralelo
      const paraleloQuery = `
        SELECT p.nombre, g.nombre as grado_nombre
        FROM paralelo p
        INNER JOIN grado g ON p.grado_id = g.id
        WHERE p.id = $1
      `;
      const paraleloResult = await pool.query(paraleloQuery, [nuevo_paralelo_id]);
      const nuevoParalelo = paraleloResult.rows[0];

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'transferir_paralelo',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: id,
        datos_anteriores: { paralelo_id: paralelo_anterior_id, paralelo_nombre: paralelo_anterior_nombre },
        datos_nuevos: { paralelo_id: nuevo_paralelo_id, paralelo_nombre: nuevoParalelo?.nombre, motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Transferencia: ${matricula.numero_matricula} → ${nuevoParalelo?.nombre || nuevo_paralelo_id}`
      });

      const matriculaCompleta = await Matricula.findByIdCompleto(id);

      res.json({
        success: true,
        message: `Estudiante transferido a ${nuevoParalelo?.nombre || 'nuevo paralelo'}`,
        data: { matricula: matriculaCompleta }
      });

    } catch (error) {
      console.error('Error al transferir paralelo:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 🚫 RETIRAR MATRÍCULA
  // ============================================================
  static async retirarMatricula(req, res) {
    try {
      const { id } = req.params;
      const { motivo_retiro } = req.body;

      if (!motivo_retiro) {
        return res.status(400).json({ success: false, message: 'Debe especificar el motivo del retiro' });
      }

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      if (matricula.estado === 'retirado') {
        return res.status(409).json({ success: false, message: 'La matrícula ya está retirada' });
      }

      const updated = await Matricula.changeStatus(id, 'retirado', motivo_retiro);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'retirar_matricula',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: id,
        datos_anteriores: { estado: matricula.estado },
        datos_nuevos: { estado: 'retirado', motivo_retiro },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Matrícula retirada: ${matricula.numero_matricula} - Motivo: ${motivo_retiro}`
      });

      res.json({ success: true, message: 'Matrícula retirada exitosamente', data: { matricula: updated } });

    } catch (error) {
      console.error('Error al retirar matrícula:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 🔄 CAMBIAR ESTADO (anular, suspender, reactivar)
  // ============================================================
  static async cambiarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado, motivo } = req.body;

      const estadosPermitidos = ['activo', 'anulado', 'suspendido', 'trasladado'];
      if (!estado || !estadosPermitidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Estado inválido. Opciones: ${estadosPermitidos.join(', ')}`
        });
      }

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      // No se puede reactivar una matrícula retirada sin motivo claro
      if (estado === 'activo' && matricula.estado === 'retirado' && !motivo) {
        return res.status(400).json({ success: false, message: 'Debe indicar motivo para reactivar una matrícula retirada' });
      }

      const updated = await Matricula.changeStatus(id, estado, motivo || null);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cambiar_estado_matricula',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: id,
        datos_anteriores: { estado: matricula.estado },
        datos_nuevos: { estado, motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Estado cambiado: ${matricula.numero_matricula} → ${estado}`
      });

      const matriculaCompleta = await Matricula.findByIdCompleto(id);

      res.json({
        success: true,
        message: `Estado actualizado a "${estado}"`,
        data: { matricula: matriculaCompleta }
      });

    } catch (error) {
      console.error('Error al cambiar estado:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 📁 LISTAR DOCUMENTOS DE UNA MATRÍCULA
  // ============================================================
  static async listarDocumentos(req, res) {
    try {
      const { id } = req.params;

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      const documentos = await MatriculaDocumento.findByMatricula(id);

      res.json({
        success: true,
        data: {
          matricula_numero: matricula.numero_matricula,
          documentos
        }
      });

    } catch (error) {
      console.error('Error al listar documentos:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 📤 SUBIR DOCUMENTOS A MATRÍCULA EXISTENTE
  // ============================================================
  static async subirDocumentos(req, res) {
    const documentos_urls = [];

    try {
      const { id } = req.params;
      let { documentos } = req.body;

      const parseJSON = (data, def = []) => {
        if (!data) return def;
        if (typeof data === 'object') return data;
        try { return JSON.parse(data); } catch { return def; }
      };
      documentos = parseJSON(documentos, []);

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      if (!req.files || !req.files.documentos || req.files.documentos.length === 0) {
        return res.status(400).json({ success: false, message: 'No se recibieron archivos' });
      }

      const documentosCreados = [];

      for (let i = 0; i < req.files.documentos.length; i++) {
        const file = req.files.documentos[i];
        const docMetadata = documentos[i] || {};

        if (!docMetadata.tipo_documento) {
          return res.status(400).json({
            success: false,
            message: `Tipo de documento no especificado para ${file.originalname}`
          });
        }

        const uploadResult = await UploadImage.uploadFromBuffer(
          file.buffer,
          'documentos_matricula',
          `matricula_${id}_${docMetadata.tipo_documento}_${Date.now()}`
        );
        documentos_urls.push(uploadResult.url);

        const docCreado = await MatriculaDocumento.create({
          matricula_id: id,
          tipo_documento: docMetadata.tipo_documento,
          nombre_archivo: file.originalname,
          url_archivo: uploadResult.url,
          verificado: false,
          observaciones: docMetadata.observaciones || null
        });

        documentosCreados.push(docCreado);
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'subir_documentos_matricula',
        modulo: 'matricula',
        tabla_afectada: 'matricula_documento',
        registro_id: id,
        datos_nuevos: { documentos_subidos: documentosCreados.length },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `${documentosCreados.length} documento(s) subido(s) a matrícula ${matricula.numero_matricula}`
      });

      res.status(201).json({
        success: true,
        message: `${documentosCreados.length} documento(s) subido(s) exitosamente`,
        data: { documentos: documentosCreados }
      });

    } catch (error) {
      // Limpiar uploads fallidos
      for (const url of documentos_urls) {
        const publicId = UploadImage.extractPublicIdFromUrl(url);
        if (publicId) await UploadImage.deleteImage(publicId).catch(console.error);
      }
      console.error('Error al subir documentos:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // ✅ VERIFICAR DOCUMENTO
  // ============================================================
  static async verificarDocumento(req, res) {
    try {
      const { doc_id } = req.params;

      const documento = await MatriculaDocumento.verificar(doc_id, req.user.id);
      if (!documento) {
        return res.status(404).json({ success: false, message: 'Documento no encontrado' });
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'verificar_documento',
        modulo: 'matricula',
        tabla_afectada: 'matricula_documento',
        registro_id: doc_id,
        datos_nuevos: { verificado: true, verificado_por: req.user.id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Documento verificado: ${documento.nombre_archivo}`
      });

      res.json({ success: true, message: 'Documento verificado', data: { documento } });

    } catch (error) {
      console.error('Error al verificar documento:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 🗑️ ELIMINAR DOCUMENTO
  // ============================================================
  static async eliminarDocumento(req, res) {
    try {
      const { doc_id } = req.params;

      // Obtener info del documento antes de eliminar
      const docQuery = 'SELECT * FROM matricula_documento WHERE id = $1';
      const docResult = await pool.query(docQuery, [doc_id]);
      const documento = docResult.rows[0];

      if (!documento) {
        return res.status(404).json({ success: false, message: 'Documento no encontrado' });
      }

      if (documento.verificado) {
        return res.status(409).json({ success: false, message: 'No se puede eliminar un documento ya verificado' });
      }

      // Eliminar de Cloudinary
      const publicId = UploadImage.extractPublicIdFromUrl(documento.url_archivo);
      if (publicId) {
        await UploadImage.deleteImage(publicId).catch(err =>
          console.error('Error al eliminar de Cloudinary:', err)
        );
      }

      // Eliminar de BD
      await MatriculaDocumento.delete(doc_id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar_documento_matricula',
        modulo: 'matricula',
        tabla_afectada: 'matricula_documento',
        registro_id: doc_id,
        datos_anteriores: { nombre_archivo: documento.nombre_archivo, tipo_documento: documento.tipo_documento },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Documento eliminado: ${documento.nombre_archivo}`
      });

      res.json({ success: true, message: 'Documento eliminado correctamente' });

    } catch (error) {
      console.error('Error al eliminar documento:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 🗑️ SOFT DELETE MATRÍCULA
  // ============================================================
  static async eliminarMatricula(req, res) {
    try {
      const { id } = req.params;

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      if (matricula.estado === 'activo') {
        return res.status(409).json({
          success: false,
          message: 'No se puede eliminar una matrícula activa. Primero retírala o anúlala.'
        });
      }

      await Matricula.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar_matricula',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: id,
        datos_anteriores: { numero_matricula: matricula.numero_matricula, estado: matricula.estado },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Matrícula eliminada: ${matricula.numero_matricula}`
      });

      res.json({ success: true, message: 'Matrícula eliminada correctamente' });

    } catch (error) {
      console.error('Error al eliminar matrícula:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 📊 VERIFICAR DISPONIBILIDAD DE PARALELO
  // ============================================================
  static async verificarDisponibilidadParalelo(req, res) {
    try {
      const { paralelo_id, periodo_academico_id } = req.query;

      if (!paralelo_id || !periodo_academico_id) {
        return res.status(400).json({ success: false, message: 'Debe especificar paralelo y periodo' });
      }

      const capacidad = await Matricula.checkCapacidad(paralelo_id, periodo_academico_id);

      const paraleloResult = await pool.query(`
        SELECT p.*, g.nombre as grado_nombre, t.nombre as turno_nombre
        FROM paralelo p
        INNER JOIN grado g ON p.grado_id = g.id
        INNER JOIN turno t ON p.turno_id = t.id
        WHERE p.id = $1
      `, [paralelo_id]);

      const paralelo = paraleloResult.rows[0];

      res.json({
        success: true,
        data: {
          paralelo: {
            id: paralelo.id,
            nombre: paralelo.nombre,
            grado: paralelo.grado_nombre,
            turno: paralelo.turno_nombre,
            aula: paralelo.aula
          },
          capacidad: {
            maxima: capacidad.capacidad_maxima,
            ocupada: capacidad.matriculas_actuales,
            disponible: capacidad.capacidad_maxima - capacidad.matriculas_actuales,
            porcentaje_ocupacion: ((capacidad.matriculas_actuales / capacidad.capacidad_maxima) * 100).toFixed(2),
            puede_matricular: capacidad.disponible
          }
        }
      });

    } catch (error) {
      console.error('Error al verificar disponibilidad:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 📋 OBTENER MATRÍCULAS POR PERIODO
  // ============================================================
  static async obtenerMatriculasPorPeriodo(req, res) {
    try {
      const { periodo_academico_id } = req.params;
      const resultado = await Matricula.findAll({ ...req.query, periodo_academico_id });
      res.json({ success: true, data: resultado });
    } catch (error) {
      console.error('Error al obtener matrículas:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }

  // ============================================================
  // 📊 ESTADÍSTICAS DE MATRÍCULA
  // ============================================================
  static async obtenerEstadisticas(req, res) {
    try {
      const { periodo_academico_id } = req.params;

      const estadisticas = await Matricula.getEstadisticas(periodo_academico_id);

      const porGradoResult = await pool.query(`
        SELECT g.nombre as grado, COUNT(m.id) as total,
          COUNT(CASE WHEN m.estado = 'activo' THEN 1 END) as activos,
          COUNT(CASE WHEN m.estado = 'retirado' THEN 1 END) as retirados
        FROM matricula m
        INNER JOIN paralelo p ON m.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        WHERE m.periodo_academico_id = $1 AND m.deleted_at IS NULL
        GROUP BY g.id, g.nombre, g.orden
        ORDER BY g.orden
      `, [periodo_academico_id]);

      const porParaleloResult = await pool.query(`
        SELECT
          p.nombre as paralelo,
          g.nombre as grado,
          t.nombre as turno,
          p.capacidad_maxima,
          COUNT(m.id) as matriculados,
          p.capacidad_maxima - COUNT(m.id) as disponibles
        FROM paralelo p
        INNER JOIN grado g ON p.grado_id = g.id
        INNER JOIN turno t ON p.turno_id = t.id
        LEFT JOIN matricula m ON p.id = m.paralelo_id
          AND m.periodo_academico_id = $1
          AND m.estado = 'activo'
          AND m.deleted_at IS NULL
        GROUP BY p.id, p.nombre, g.id, g.nombre, g.orden, t.nombre, p.capacidad_maxima
        ORDER BY g.orden, p.nombre
      `, [periodo_academico_id]);

      res.json({
        success: true,
        data: {
          resumen: estadisticas,
          por_grado: porGradoResult.rows,
          por_paralelo: porParaleloResult.rows
        }
      });

    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
  }
}

export default MatriculacionController;