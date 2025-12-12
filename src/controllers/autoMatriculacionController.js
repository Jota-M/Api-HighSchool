// controllers/autoMatriculacionController.js
import { pool } from '../db/pool.js';
import { Estudiante } from '../models/Estudiantes.js';
import { Matricula } from '../models/Matricula.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class AutoMatriculacionController {
  /**
   * 🔍 VALIDAR ESTUDIANTE
   * Verifica código y CI del estudiante
   */
  static async validarEstudiante(req, res) {
    try {
      const { codigo, ci } = req.body;

      if (!codigo || !ci) {
        return res.status(400).json({
          success: false,
          message: 'Código y CI son requeridos',
        });
      }

      const estudiante = await Estudiante.findByCode(codigo);

      if (!estudiante) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado con ese código',
        });
      }

      if (estudiante.ci !== ci) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: null,
          accion: 'intento_validacion_fallido',
          modulo: 'auto_matriculacion',
          datos_nuevos: { codigo, ci_intentado: ci },
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'fallido',
          mensaje: `CI incorrecto para código ${codigo}`,
        });

        return res.status(401).json({
          success: false,
          message: 'CI no coincide con el código de estudiante',
        });
      }

      const ultimaMatriculaQuery = `
        SELECT m.*, 
          pa.nombre as periodo_nombre,
          pa.codigo as periodo_codigo,
          g.nombre as grado_nombre,
          p.nombre as paralelo_nombre,
          t.nombre as turno_nombre
        FROM matricula m
        INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
        INNER JOIN paralelo p ON m.paralelo_id = p.id
        INNER JOIN grado g ON p.grado_id = g.id
        INNER JOIN turno t ON p.turno_id = t.id
        WHERE m.estudiante_id = $1 AND m.deleted_at IS NULL
        ORDER BY pa.fecha_inicio DESC
        LIMIT 1
      `;

      const ultimaMatriculaResult = await pool.query(ultimaMatriculaQuery, [estudiante.id]);
      const ultimaMatricula = ultimaMatriculaResult.rows[0] || null;

      const periodoActivoQuery = `
        SELECT * FROM periodo_academico 
        WHERE activo = true AND permite_inscripciones = true 
        ORDER BY fecha_inicio DESC 
        LIMIT 1
      `;
      const periodoActivoResult = await pool.query(periodoActivoQuery);
      const periodoActivo = periodoActivoResult.rows[0];

      let yaMatriculado = false;
      if (periodoActivo) {
        const matriculaActivaQuery = `
          SELECT id FROM matricula 
          WHERE estudiante_id = $1 
            AND periodo_academico_id = $2 
            AND deleted_at IS NULL
        `;
        const matriculaActivaResult = await pool.query(matriculaActivaQuery, [
          estudiante.id,
          periodoActivo.id,
        ]);
        yaMatriculado = matriculaActivaResult.rows.length > 0;
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: null,
        accion: 'validacion_exitosa',
        modulo: 'auto_matriculacion',
        tabla_afectada: 'estudiante',
        registro_id: estudiante.id,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Validación exitosa: ${estudiante.nombres} ${estudiante.apellido_paterno}`,
      });

      res.json({
        success: true,
        message: 'Estudiante validado correctamente',
        data: {
          estudiante: {
            id: estudiante.id,
            codigo: estudiante.codigo,
            nombres: estudiante.nombres,
            apellido_paterno: estudiante.apellido_paterno,
            apellido_materno: estudiante.apellido_materno,
            foto_url: estudiante.foto_url,
            email: estudiante.email,
            telefono: estudiante.telefono,
            direccion: estudiante.direccion,
            zona: estudiante.zona,
            ciudad: estudiante.ciudad,
            contacto_emergencia: estudiante.contacto_emergencia,
            telefono_emergencia: estudiante.telefono_emergencia,
          },
          ultima_matricula: ultimaMatricula,
          periodo_activo: periodoActivo,
          ya_matriculado: yaMatriculado,
        },
      });
    } catch (error) {
      console.error('Error al validar estudiante:', error);
      res.status(500).json({
        success: false,
        message: 'Error al validar estudiante: ' + error.message,
      });
    }
  }

  /**
   * 📚 OBTENER OPCIONES DE MATRÍCULA
   */
  static async obtenerOpcionesMatricula(req, res) {
    try {
      const { codigo, ci } = req.query;

      if (!codigo || !ci) {
        return res.status(400).json({
          success: false,
          message: 'Código y CI son requeridos',
        });
      }

      const estudiante = await Estudiante.findByCode(codigo);
      if (!estudiante || estudiante.ci !== ci) {
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas',
        });
      }

      const periodoActivoQuery = `
        SELECT * FROM periodo_academico 
        WHERE activo = true AND permite_inscripciones = true
        ORDER BY fecha_inicio DESC 
        LIMIT 1
      `;
      const periodoActivoResult = await pool.query(periodoActivoQuery);
      const periodoActivo = periodoActivoResult.rows[0];

      if (!periodoActivo) {
        return res.status(404).json({
          success: false,
          message: 'No hay periodo académico disponible para inscripciones',
        });
      }

      const gradosQuery = `
        SELECT DISTINCT g.id, g.nombre, g.orden, n.nombre as nivel_nombre
        FROM grado g
        INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
        WHERE g.activo = true
        ORDER BY g.orden
      `;
      const gradosResult = await pool.query(gradosQuery);

      const paralelosQuery = `
        SELECT 
          p.id,
          p.nombre,
          p.grado_id,
          p.capacidad_maxima,
          p.aula,
          g.nombre as grado_nombre,
          g.orden as grado_orden,
          t.nombre as turno_nombre,
          t.hora_inicio,
          t.hora_fin,
          COUNT(m.id) as matriculas_actuales
        FROM paralelo p
        INNER JOIN grado g ON p.grado_id = g.id
        INNER JOIN turno t ON p.turno_id = t.id
        LEFT JOIN matricula m ON p.id = m.paralelo_id 
          AND m.periodo_academico_id = $1 
          AND m.estado = 'activo' 
          AND m.deleted_at IS NULL
        WHERE p.activo = true AND p.anio = $2
        GROUP BY p.id, p.nombre, p.grado_id, p.capacidad_maxima, p.aula, 
                 g.nombre, g.orden, t.nombre, t.hora_inicio, t.hora_fin
        HAVING COUNT(m.id) < p.capacidad_maxima
        ORDER BY g.orden, p.nombre
      `;

      const anioActual = new Date().getFullYear();
      const paralelosResult = await pool.query(paralelosQuery, [periodoActivo.id, anioActual]);

      res.json({
        success: true,
        data: {
          periodo_activo: periodoActivo,
          grados: gradosResult.rows,
          paralelos: paralelosResult.rows.map((p) => ({
            ...p,
            disponibles: p.capacidad_maxima - parseInt(p.matriculas_actuales),
            porcentaje_ocupacion: ((parseInt(p.matriculas_actuales) / p.capacidad_maxima) * 100).toFixed(1),
          })),
        },
      });
    } catch (error) {
      console.error('Error al obtener opciones de matrícula:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener opciones: ' + error.message,
      });
    }
  }

  /**
 * ✏️ ACTUALIZAR DATOS DEL ESTUDIANTE (CON FOTO OPCIONAL)
 */
static async actualizarDatos(req, res) {
  let foto_url = null;
  let foto_url_anterior = null;

  try {
    const { codigo, ci } = req.body;

    if (!codigo || !ci) {
      return res.status(400).json({
        success: false,
        message: 'Código y CI son requeridos',
      });
    }

    const estudiante = await Estudiante.findByCode(codigo);
    if (!estudiante || estudiante.ci !== ci) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
    }

    foto_url_anterior = estudiante.foto_url;

    // Procesar foto si se envió
    if (req.files && req.files.foto && req.files.foto[0]) {
      const fotoFile = req.files.foto[0];
      
      if (!UploadImage.isValidImage(fotoFile) || !UploadImage.isValidSize(fotoFile, 5)) {
        return res.status(400).json({
          success: false,
          message: 'Imagen inválida o muy grande (máx 5MB)',
        });
      }

      try {
        const uploadResult = await UploadImage.uploadFromBuffer(
          fotoFile.buffer,
          'estudiantes',
          `estudiante_${estudiante.id}_${Date.now()}`
        );
        foto_url = uploadResult.url;

        // Eliminar foto anterior si existe
        if (foto_url_anterior) {
          const publicId = UploadImage.extractPublicIdFromUrl(foto_url_anterior);
          if (publicId) {
            await UploadImage.deleteImage(publicId);
          }
        }
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Error al subir imagen: ' + uploadError.message,
        });
      }
    }

    // Preparar datos para actualizar - SOLO campos permitidos y con valores
    const camposPermitidos = {};

    // Solo agregar campos que tengan valor
    if (req.body.telefono && req.body.telefono.trim() !== '') {
      camposPermitidos.telefono = req.body.telefono.trim();
    }
    if (req.body.email && req.body.email.trim() !== '') {
      camposPermitidos.email = req.body.email.trim();
    }
    if (req.body.direccion && req.body.direccion.trim() !== '') {
      camposPermitidos.direccion = req.body.direccion.trim();
    }
    if (req.body.zona && req.body.zona.trim() !== '') {
      camposPermitidos.zona = req.body.zona.trim();
    }
    if (req.body.ciudad && req.body.ciudad.trim() !== '') {
      camposPermitidos.ciudad = req.body.ciudad.trim();
    }
    if (req.body.contacto_emergencia && req.body.contacto_emergencia.trim() !== '') {
      camposPermitidos.contacto_emergencia = req.body.contacto_emergencia.trim();
    }
    if (req.body.telefono_emergencia && req.body.telefono_emergencia.trim() !== '') {
      camposPermitidos.telefono_emergencia = req.body.telefono_emergencia.trim();
    }

    // Agregar foto solo si se subió una nueva
    if (foto_url) {
      camposPermitidos.foto_url = foto_url;
    }

    // Verificar que haya al menos un campo para actualizar
    if (Object.keys(camposPermitidos).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay datos para actualizar',
      });
    }

    // ✅ CORRECCIÓN: Agregar el símbolo $ antes del índice del parámetro
    const setClauses = Object.keys(camposPermitidos)
      .map((key, index) => `${key} = $${index + 2}`)  // ✅ Cambiar aquí
      .join(', ');
    
    const values = [estudiante.id, ...Object.values(camposPermitidos)];
    
    const updateQuery = `
      UPDATE estudiante 
      SET ${setClauses}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);
    const estudianteActualizado = result.rows[0];

    const reqInfo = RequestInfo.extract(req);
    await ActividadLog.create({
      usuario_id: null,
      accion: 'actualizar_datos_pre_matricula',
      modulo: 'auto_matriculacion',
      tabla_afectada: 'estudiante',
      registro_id: estudiante.id,
      datos_anteriores: {
        telefono: estudiante.telefono,
        email: estudiante.email,
        direccion: estudiante.direccion,
        foto_url: foto_url_anterior,
      },
      datos_nuevos: camposPermitidos,
      ip_address: reqInfo.ip,
      user_agent: reqInfo.userAgent,
      resultado: 'exitoso',
      mensaje: `Datos actualizados: ${estudiante.nombres} ${estudiante.apellido_paterno}`,
    });

    res.json({
      success: true,
      message: 'Datos actualizados correctamente',
      data: {
        estudiante: {
          id: estudianteActualizado.id,
          codigo: estudianteActualizado.codigo,
          nombres: estudianteActualizado.nombres,
          apellido_paterno: estudianteActualizado.apellido_paterno,
          apellido_materno: estudianteActualizado.apellido_materno,
          telefono: estudianteActualizado.telefono,
          email: estudianteActualizado.email,
          direccion: estudianteActualizado.direccion,
          zona: estudianteActualizado.zona,
          ciudad: estudianteActualizado.ciudad,
          contacto_emergencia: estudianteActualizado.contacto_emergencia,
          telefono_emergencia: estudianteActualizado.telefono_emergencia,
          foto_url: estudianteActualizado.foto_url,
        },
      },
    });
  } catch (error) {
    // Limpiar foto subida si hay error
    if (foto_url) {
      const publicId = UploadImage.extractPublicIdFromUrl(foto_url);
      if (publicId) {
        try {
          await UploadImage.deleteImage(publicId);
        } catch (err) {
          console.error('Error al eliminar foto:', err);
        }
      }
    }

    console.error('Error al actualizar datos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar datos: ' + error.message,
    });
  }
}

  /**
   * ✅ AUTO-MATRICULAR ESTUDIANTE CON DOCUMENTOS
   */
  static async autoMatricular(req, res) {
    const client = await pool.connect();
    const documentos_urls = [];

    try {
      await client.query('BEGIN');

      const { codigo, ci, paralelo_id } = req.body;
      let documentos = req.body.documentos;

      // Parse documentos si viene como string
      if (typeof documentos === 'string') {
        try {
          documentos = JSON.parse(documentos);
        } catch (e) {
          documentos = [];
        }
      }

      if (!codigo || !ci || !paralelo_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Datos incompletos',
        });
      }

      const estudiante = await Estudiante.findByCode(codigo, client);
      if (!estudiante || estudiante.ci !== ci) {
        await client.query('ROLLBACK');
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas',
        });
      }

      const periodoActivoQuery = `
        SELECT * FROM periodo_academico 
        WHERE activo = true AND permite_inscripciones = true
        LIMIT 1
      `;
      const periodoActivoResult = await client.query(periodoActivoQuery);
      const periodoActivo = periodoActivoResult.rows[0];

      if (!periodoActivo) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'No hay periodo disponible para inscripciones',
        });
      }

      const matriculaExistente = await Matricula.exists(estudiante.id, periodoActivo.id);
      if (matriculaExistente) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Ya estás matriculado en este periodo',
        });
      }

      const capacidad = await Matricula.checkCapacidad(paralelo_id, periodoActivo.id);
      if (!capacidad.disponible) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'El paralelo seleccionado está lleno',
        });
      }

      const numero_matricula = await Matricula.generateNumeroMatricula(periodoActivo.id, client);

      const matriculaQuery = `
        INSERT INTO matricula (
          estudiante_id, paralelo_id, periodo_academico_id, numero_matricula,
          fecha_matricula, estado, es_repitente, es_becado
        )
        VALUES ($1, $2, $3, $4, CURRENT_DATE, 'activo', false, false)
        RETURNING *
      `;

      const matriculaResult = await client.query(matriculaQuery, [
        estudiante.id,
        paralelo_id,
        periodoActivo.id,
        numero_matricula,
      ]);

      const nuevaMatricula = matriculaResult.rows[0];

      // Subir documentos si se enviaron
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

            const uploadResult = await UploadImage.uploadFromBuffer(
              file.buffer,
              'documentos_matricula',
              `matricula_${nuevaMatricula.id}_${docMetadata.tipo_documento}_${Date.now()}`
            );

            documentos_urls.push(uploadResult.url);

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
              message: 'Error al subir documentos: ' + uploadError.message,
            });
          }
        }
      }

      await client.query('COMMIT');

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: null,
        accion: 'auto_matriculacion',
        modulo: 'auto_matriculacion',
        tabla_afectada: 'matricula',
        registro_id: nuevaMatricula.id,
        datos_nuevos: {
          estudiante_id: estudiante.id,
          numero_matricula,
          paralelo_id,
          documentos_subidos: documentosCreados.length,
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Auto-matrícula: ${estudiante.nombres} ${estudiante.apellido_paterno} - ${numero_matricula}`,
      });

      const matriculaCompleta = await Matricula.findById(nuevaMatricula.id);

      res.status(201).json({
        success: true,
        message: '¡Matrícula exitosa! Ya estás inscrito para el nuevo periodo académico.',
        data: {
          matricula: matriculaCompleta,
          documentos: documentosCreados.map(d => ({
            id: d.id,
            tipo_documento: d.tipo_documento,
            nombre_archivo: d.nombre_archivo,
            url_archivo: d.url_archivo,
          })),
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');

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

      console.error('Error en auto-matriculación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al procesar la matrícula: ' + error.message,
      });
    } finally {
      client.release();
    }
  }
}

export default AutoMatriculacionController;