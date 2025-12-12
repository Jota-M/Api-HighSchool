// controllers/matriculacionController.js
import { pool } from '../db/pool.js';
import { Estudiante } from '../models/Estudiantes.js';
import { Matricula, MatriculaDocumento } from '../models/Matricula.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class MatriculacionController {
  /**
   * 📋 LISTAR ESTUDIANTES ELEGIBLES PARA MATRICULACIÓN
   * Devuelve estudiantes sin matrícula activa en el periodo especificado
   */
  static async listarEstudiantesElegibles(req, res) {
    try {
      const { 
        periodo_academico_id, 
        page = 1, 
        limit = 20, 
        search,
        incluir_con_matricula = false // Para re-matriculación
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

      // Filtro de búsqueda
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

      // JOIN para verificar matrícula existente
      const matriculaJoin = incluir_con_matricula === 'true' 
        ? 'LEFT' 
        : 'LEFT';

      const matriculaCondition = incluir_con_matricula === 'true'
        ? '' 
        : 'AND m.id IS NULL';

      const whereClause = whereConditions.join(' AND ');

      // Contar total
      const countQuery = `
        SELECT COUNT(DISTINCT e.id)
        FROM estudiante e
        ${matriculaJoin} JOIN matricula m ON e.id = m.estudiante_id 
          AND m.periodo_academico_id = $1 
          AND m.deleted_at IS NULL
        WHERE ${whereClause} ${matriculaCondition}
      `;

      const countResult = await pool.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);

      // Obtener datos
      const dataQuery = `
        SELECT DISTINCT ON (e.id)
          e.id,
          e.codigo,
          e.nombres,
          e.apellido_paterno,
          e.apellido_materno,
          e.fecha_nacimiento,
          e.ci,
          e.foto_url,
          e.telefono,
          e.email,
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
            WHERE m_ant.estudiante_id = e.id 
              AND m_ant.deleted_at IS NULL
            ORDER BY pa_ant.fecha_inicio DESC
            LIMIT 1
          ) as ultima_matricula
        FROM estudiante e
        ${matriculaJoin} JOIN matricula m ON e.id = m.estudiante_id 
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
      res.status(500).json({
        success: false,
        message: 'Error al obtener estudiantes: ' + error.message
      });
    }
  }

  /**
   * ✅ MATRICULAR ESTUDIANTE EXISTENTE
   * Crea una nueva matrícula para un estudiante ya registrado
   */
  static async matricularEstudiante(req, res) {
    const client = await pool.connect();
    const documentos_urls = [];
    
    try {
      await client.query('BEGIN');

      const { estudiante_id } = req.params;
      let { matricula, documentos } = req.body;

      // Parsear JSON si viene como string (FormData)
      const parseJSON = (data, defaultValue = null) => {
        if (!data) return defaultValue;
        if (typeof data === 'object') return data;
        try {
          return JSON.parse(data);
        } catch (e) {
          return defaultValue;
        }
      };

      matricula = parseJSON(matricula, null);
      documentos = parseJSON(documentos, []);

      // ========================================
      // VALIDACIONES
      // ========================================
      if (!matricula || !matricula.paralelo_id || !matricula.periodo_academico_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar paralelo y periodo académico'
        });
      }

      // Verificar que el estudiante existe
      const estudiante = await Estudiante.findById(estudiante_id);
      if (!estudiante) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      // Verificar si ya tiene matrícula en este periodo
      const matriculaExistente = await Matricula.exists(
        estudiante_id, 
        matricula.periodo_academico_id
      );

      if (matriculaExistente) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'El estudiante ya tiene una matrícula en este periodo',
          data: { matricula_id: matriculaExistente.id }
        });
      }

      // Verificar capacidad del paralelo
      const capacidad = await Matricula.checkCapacidad(
        matricula.paralelo_id,
        matricula.periodo_academico_id
      );

      if (!capacidad.disponible) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Paralelo sin capacidad (${capacidad.matriculas_actuales}/${capacidad.capacidad_maxima})`
        });
      }

      // ========================================
      // CREAR MATRÍCULA
      // ========================================
      const numero_matricula = await Matricula.generateNumeroMatricula(
        matricula.periodo_academico_id, 
        client
      );

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

      // ========================================
      // SUBIR DOCUMENTOS
      // ========================================
      const documentosCreados = [];

      if (req.files && req.files.documentos) {
        const archivosDocumentos = req.files.documentos;

        for (let i = 0; i < archivosDocumentos.length; i++) {
          const file = archivosDocumentos[i];

          try {
            const docMetadata = documentos && documentos[i] ? documentos[i] : null;

            if (!docMetadata || !docMetadata.tipo_documento) {
              throw new Error(`Tipo de documento no especificado para ${file.originalname}`);
            }

            // Subir a Cloudinary
            const uploadResult = await UploadImage.uploadFromBuffer(
              file.buffer,
              'documentos_matricula',
              `matricula_${nuevaMatricula.id}_${docMetadata.tipo_documento}_${Date.now()}`
            );

            documentos_urls.push(uploadResult.url);

            // Guardar en BD
            const documentoQuery = `
              INSERT INTO matricula_documento (
                matricula_id, tipo_documento, nombre_archivo, url_archivo,
                verificado, observaciones
              )
              VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING *
            `;

            const docResult = await client.query(documentoQuery, [
              nuevaMatricula.id,
              docMetadata.tipo_documento,
              file.originalname,
              uploadResult.url,
              false,
              docMetadata.observaciones || null
            ]);

            documentosCreados.push(docResult.rows[0]);

          } catch (uploadError) {
            await client.query('ROLLBACK');

            // Limpiar documentos ya subidos
            for (const url of documentos_urls) {
              const publicId = UploadImage.extractPublicIdFromUrl(url);
              if (publicId) {
                try {
                  await UploadImage.deleteImage(publicId);
                } catch (err) {
                  console.error('Error al eliminar documento:', err);
                }
              }
            }

            return res.status(500).json({
              success: false,
              message: 'Error al subir documentos: ' + uploadError.message
            });
          }
        }
      }

      // ========================================
      // COMMIT
      // ========================================
      await client.query('COMMIT');

      // Registrar actividad
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'matricular_estudiante',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: nuevaMatricula.id,
        datos_nuevos: {
          estudiante_id,
          numero_matricula,
          paralelo_id: matricula.paralelo_id,
          documentos_subidos: documentosCreados.length
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Matrícula creada: ${numero_matricula} - ${estudiante.nombres} ${estudiante.apellido_paterno}`
      });

      // Obtener matrícula completa con información relacionada
      const matriculaCompleta = await Matricula.findById(nuevaMatricula.id);

      res.status(201).json({
        success: true,
        message: 'Matrícula creada exitosamente',
        data: {
          matricula: matriculaCompleta,
          documentos: documentosCreados.map(d => ({
            id: d.id,
            tipo_documento: d.tipo_documento,
            nombre_archivo: d.nombre_archivo,
            url_archivo: d.url_archivo,
            verificado: d.verificado
          }))
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en matriculación:', error);

      // Limpiar documentos si hubo error
      for (const url of documentos_urls) {
        const publicId = UploadImage.extractPublicIdFromUrl(url);
        if (publicId) {
          try {
            await UploadImage.deleteImage(publicId);
          } catch (err) {
            console.error('Error al eliminar documento tras fallo:', err);
          }
        }
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear matrícula: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * 🔄 REMATRICULAR ESTUDIANTE
   * Re-matricula un estudiante que ya estuvo en periodos anteriores
   */
  static async rematricularEstudiante(req, res) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const { estudiante_id } = req.params;
      const { 
        periodo_academico_id, 
        paralelo_id, 
        es_repitente,
        es_becado,
        porcentaje_beca,
        tipo_beca,
        observaciones
      } = req.body;

      // Validaciones
      if (!periodo_academico_id || !paralelo_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Debe especificar periodo y paralelo'
        });
      }

      // Verificar estudiante
      const estudiante = await Estudiante.findById(estudiante_id);
      if (!estudiante) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      // Verificar matrícula existente
      const matriculaExistente = await Matricula.exists(estudiante_id, periodo_academico_id);
      if (matriculaExistente) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Ya existe matrícula para este periodo'
        });
      }

      // Verificar capacidad
      const capacidad = await Matricula.checkCapacidad(paralelo_id, periodo_academico_id);
      if (!capacidad.disponible) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Paralelo sin capacidad disponible'
        });
      }

      // Generar número de matrícula
      const numero_matricula = await Matricula.generateNumeroMatricula(
        periodo_academico_id, 
        client
      );

      // Crear matrícula
      const query = `
        INSERT INTO matricula (
          estudiante_id, paralelo_id, periodo_academico_id, numero_matricula,
          fecha_matricula, estado, es_repitente, es_becado, porcentaje_beca,
          tipo_beca, observaciones
        )
        VALUES ($1, $2, $3, $4, CURRENT_DATE, 'activo', $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const result = await client.query(query, [
        estudiante_id,
        paralelo_id,
        periodo_academico_id,
        numero_matricula,
        es_repitente ?? false,
        es_becado ?? false,
        porcentaje_beca,
        tipo_beca,
        observaciones
      ]);

      const nuevaMatricula = result.rows[0];

      await client.query('COMMIT');

      // Log
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
        mensaje: `Re-matrícula: ${numero_matricula}`
      });

      const matriculaCompleta = await Matricula.findById(nuevaMatricula.id);

      res.status(201).json({
        success: true,
        message: 'Re-matrícula exitosa',
        data: { matricula: matriculaCompleta }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en re-matriculación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al re-matricular: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * 📊 VERIFICAR DISPONIBILIDAD DE PARALELO
   */
  static async verificarDisponibilidadParalelo(req, res) {
    try {
      const { paralelo_id, periodo_academico_id } = req.query;

      if (!paralelo_id || !periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar paralelo y periodo'
        });
      }

      const capacidad = await Matricula.checkCapacidad(paralelo_id, periodo_academico_id);

      // Obtener información del paralelo
      const paraleloQuery = `
        SELECT p.*, g.nombre as grado_nombre, t.nombre as turno_nombre
        FROM paralelo p
        INNER JOIN grado g ON p.grado_id = g.id
        INNER JOIN turno t ON p.turno_id = t.id
        WHERE p.id = $1
      `;
      const paraleloResult = await pool.query(paraleloQuery, [paralelo_id]);
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
      res.status(500).json({
        success: false,
        message: 'Error al verificar disponibilidad: ' + error.message
      });
    }
  }

  /**
   * 📋 OBTENER MATRÍCULAS POR PERIODO
   */
  static async obtenerMatriculasPorPeriodo(req, res) {
    try {
      const { periodo_academico_id } = req.params;
      const filters = {
        ...req.query,
        periodo_academico_id
      };

      const resultado = await Matricula.findAll(filters);

      res.json({
        success: true,
        data: resultado
      });

    } catch (error) {
      console.error('Error al obtener matrículas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener matrículas: ' + error.message
      });
    }
  }

  /**
   * ✏️ ACTUALIZAR MATRÍCULA
   * Permite cambiar paralelo, estado, beca, etc.
   */
  static async actualizarMatricula(req, res) {
    try {
      const { id } = req.params;
      const {
        paralelo_id,
        es_becado,
        porcentaje_beca,
        tipo_beca,
        observaciones
      } = req.body;

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      // Si cambia de paralelo, verificar capacidad
      if (paralelo_id && paralelo_id !== matricula.paralelo_id) {
        const capacidad = await Matricula.checkCapacidad(
          paralelo_id,
          matricula.periodo_academico_id
        );

        if (!capacidad.disponible) {
          return res.status(409).json({
            success: false,
            message: 'El paralelo destino no tiene capacidad'
          });
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

      // Log
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

      const matriculaCompleta = await Matricula.findById(id);

      res.json({
        success: true,
        message: 'Matrícula actualizada',
        data: { matricula: matriculaCompleta }
      });

    } catch (error) {
      console.error('Error al actualizar matrícula:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar: ' + error.message
      });
    }
  }

  /**
   * 🚫 RETIRAR MATRÍCULA
   */
  static async retirarMatricula(req, res) {
    try {
      const { id } = req.params;
      const { motivo_retiro } = req.body;

      if (!motivo_retiro) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar el motivo del retiro'
        });
      }

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      const updated = await Matricula.changeStatus(id, 'retirado', motivo_retiro);

      // Log
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
        mensaje: `Matrícula retirada: ${matricula.numero_matricula}`
      });

      res.json({
        success: true,
        message: 'Matrícula retirada exitosamente',
        data: { matricula: updated }
      });

    } catch (error) {
      console.error('Error al retirar matrícula:', error);
      res.status(500).json({
        success: false,
        message: 'Error al retirar matrícula: ' + error.message
      });
    }
  }

  /**
   * 📊 ESTADÍSTICAS DE MATRÍCULA
   */
  static async obtenerEstadisticas(req, res) {
    try {
      const { periodo_academico_id } = req.params;

      const estadisticas = await Matricula.getEstadisticas(periodo_academico_id);

      // Estadísticas por grado
      const porGradoQuery = `
        SELECT g.nombre as grado, COUNT(m.id) as total
        FROM matricula m
        INNER JOIN paralelo p ON m.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        WHERE m.periodo_academico_id = $1 AND m.deleted_at IS NULL
        GROUP BY g.id, g.nombre
        ORDER BY g.orden
      `;
      const porGradoResult = await pool.query(porGradoQuery, [periodo_academico_id]);

      res.json({
        success: true,
        data: {
          resumen: estadisticas,
          por_grado: porGradoResult.rows
        }
      });

    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estadísticas: ' + error.message
      });
    }
  }
}

export default MatriculacionController;