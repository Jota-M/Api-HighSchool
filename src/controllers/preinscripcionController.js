// controllers/preInscripcionController.js - REFACTORIZADO
import { pool } from '../db/pool.js';
import { PreInscripcion } from '../models/PreInscripcion.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class PreInscripcionController {
  
  // ========================================
  // MÉTODOS AUXILIARES
  // ========================================
  
  static generarUsername(nombres, apellido) {
    const nombreLimpio = nombres.split(' ')[0]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
    
    const apellidoLimpio = apellido
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
    
    const nombreCapital = nombreLimpio.charAt(0).toUpperCase() + nombreLimpio.slice(1);
    const apellidoCapital = apellidoLimpio.charAt(0).toUpperCase() + apellidoLimpio.slice(1);
    
    return `${nombreCapital}${apellidoCapital}`;
  }

  static generarPassword(ci = null) {
    if (ci) {
      return ci.toString();
    }
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  static async obtenerRolPorNombre(nombre, client) {
    const query = 'SELECT * FROM roles WHERE nombre = $1 LIMIT 1';
    const result = await client.query(query, [nombre]);
    return result.rows[0];
  }

  // ========================================
  // BUSCAR PADRE POR CI
  // ========================================
  static async buscarPadrePorCI(req, res) {
    try {
      const { ci } = req.params;

      if (!ci || ci.length < 4) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar un CI válido'
        });
      }

      const padreResult = await pool.query(`
        SELECT 
          pf.*,
          COUNT(DISTINCT et.estudiante_id) as total_hijos,
          json_agg(
            json_build_object(
              'id', e.id,
              'nombres', e.nombres,
              'apellido_paterno', e.apellido_paterno,
              'codigo', e.codigo,
              'grado_actual', g.nombre,
              'paralelo', p.nombre
            )
          ) FILTER (WHERE e.id IS NOT NULL) as hijos
        FROM padre_familia pf
        LEFT JOIN estudiante_tutor et ON pf.id = et.padre_familia_id
        LEFT JOIN estudiante e ON et.estudiante_id = e.id AND e.deleted_at IS NULL
        LEFT JOIN matricula m ON e.id = m.estudiante_id AND m.estado = 'activo' AND m.deleted_at IS NULL
        LEFT JOIN paralelo p ON m.paralelo_id = p.id
        LEFT JOIN grado g ON p.grado_id = g.id
        WHERE pf.ci = $1 AND pf.deleted_at IS NULL
        GROUP BY pf.id
        LIMIT 1
      `, [ci]);

      if (padreResult.rows.length === 0) {
        return res.json({
          success: true,
          data: {
            encontrado: false,
            mensaje: 'No se encontró un padre/tutor con ese CI. Puede registrarlo como nuevo.'
          }
        });
      }

      const padre = padreResult.rows[0];

      res.json({
        success: true,
        data: {
          encontrado: true,
          padre: {
            id: padre.id,
            nombres: padre.nombres,
            apellido_paterno: padre.apellido_paterno,
            apellido_materno: padre.apellido_materno,
            ci: padre.ci,
            telefono: padre.telefono,
            celular: padre.celular,
            email: padre.email,
            direccion: padre.direccion,
            ocupacion: padre.ocupacion, // ✅ Solo ocupacion
            tiene_hijos_matriculados: padre.total_hijos > 0,
            hijos: padre.hijos || []
          },
          mensaje: `Se encontró a ${padre.nombres} ${padre.apellido_paterno}. Puede vincular un nuevo estudiante.`
        }
      });

    } catch (error) {
      console.error('Error al buscar padre:', error);
      res.status(500).json({
        success: false,
        message: 'Error al buscar padre: ' + error.message
      });
    }
  }

  // ========================================
  // CREAR PREINSCRIPCIÓN (SIMPLE)
  // ========================================
  static async crear(req, res) {
    const client = await pool.connect();
    const documentos_urls = [];
    let foto_url = null;
    
    try {
      await client.query('BEGIN');
      
      // Parsear datos de FormData
      let estudiante, representante, preinscripcion_info;
      
      try {
        estudiante = typeof req.body.estudiante === 'string' 
          ? JSON.parse(req.body.estudiante) 
          : req.body.estudiante;
          
        representante = typeof req.body.representante === 'string' 
          ? JSON.parse(req.body.representante) 
          : req.body.representante;
          
        preinscripcion_info = typeof req.body.preinscripcion_info === 'string' 
          ? JSON.parse(req.body.preinscripcion_info) 
          : req.body.preinscripcion_info;
      } catch (parseError) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Error al procesar los datos enviados',
          error: parseError.message
        });
      }

      console.log('📥 Datos recibidos:', {
        tiene_estudiante: !!estudiante,
        tiene_representante: !!representante,
        tiene_preinscripcion_info: !!preinscripcion_info,
        estudiante_rude: estudiante?.rude, // ✅ Verificar RUDE
        representante_ocupacion: representante?.ocupacion // ✅ Solo ocupacion
      });

      // Validaciones
      if (!estudiante?.nombres || !estudiante?.apellido_paterno) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Los datos del estudiante son incompletos'
        });
      }

      if (!representante?.nombres || !representante?.ci) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Los datos del representante son incompletos'
        });
      }

      // Verificar disponibilidad de cupo (NO asignar)
      let cupoDisponible = { tiene_cupos: false, cupo_id: null, mensaje: '' };
      
      if (preinscripcion_info?.grado_id && preinscripcion_info?.turno_id && preinscripcion_info?.periodo_academico_id) {
        console.log('🔍 Verificando cupos:', {
          grado_id: preinscripcion_info.grado_id,
          turno_id: preinscripcion_info.turno_id,
          periodo_academico_id: preinscripcion_info.periodo_academico_id
        });

        const verificacion = await client.query(`
          SELECT 
            cp.*,
            (cp.cupos_totales - cp.cupos_ocupados) as cupos_disponibles
          FROM cupo_preinscripcion cp
          WHERE cp.grado_id = $1 
            AND cp.turno_id = $2 
            AND cp.periodo_academico_id = $3
            AND cp.activo = true
          LIMIT 1
        `, [
          preinscripcion_info.grado_id,
          preinscripcion_info.turno_id,
          preinscripcion_info.periodo_academico_id
        ]);

        if (verificacion.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'No hay cupos configurados para este grado y turno'
          });
        }

        const cupo = verificacion.rows[0];
        const cuposDisponibles = cupo.cupos_totales - cupo.cupos_ocupados;

        if (cuposDisponibles <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `No hay cupos disponibles. Todos los ${cupo.cupos_totales} cupos están ocupados.`
          });
        }

        cupoDisponible = {
          tiene_cupos: true,
          cupo_id: cupo.id,
          mensaje: `Hay ${cuposDisponibles} cupos disponibles`
        };

        console.log('✅ Cupos disponibles:', cuposDisponibles);
      }

      // Subir foto del estudiante
      const fotoFile = req.files?.['foto_estudiante']?.[0];
      if (fotoFile) {
        const uploadResult = await UploadImage.uploadFromBuffer(
          fotoFile.buffer,
          'preinscripciones/fotos',
          `foto_estudiante_${Date.now()}`
        );
        foto_url = uploadResult.url;
        documentos_urls.push(uploadResult.url);
      }

      // Generar código
      const codigoResult = await client.query(`
        SELECT 'PRE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
        LPAD(CAST(COALESCE(MAX(CAST(SUBSTRING(codigo_inscripcion FROM 10) AS INTEGER)), 0) + 1 AS VARCHAR), 4, '0') 
        AS codigo
        FROM pre_inscripcion 
        WHERE codigo_inscripcion LIKE 'PRE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'
      `);
      const codigoInscripcion = codigoResult.rows[0].codigo;

      // Crear pre_inscripcion (SIN cupo asignado)
      const inscripcionResult = await client.query(`
        INSERT INTO pre_inscripcion (
          codigo_inscripcion, 
          estado,
          periodo_academico_id,
          grado_id,
          turno_preferido_id,
          cupo_preinscripcion_id,
          tiene_cupo_asignado
        )
        VALUES ($1, 'datos_completos', $2, $3, $4, NULL, false)
        RETURNING *
      `, [
        codigoInscripcion,
        preinscripcion_info?.periodo_academico_id || null,
        preinscripcion_info?.grado_id || null,
        preinscripcion_info?.turno_id || null
      ]);
      
      const preInscripcionId = inscripcionResult.rows[0].id;

      // ✅ Crear pre_estudiante (CON rude, SIN telefono_emergencia)
      await client.query(`
        INSERT INTO pre_estudiante (
          pre_inscripcion_id, nombres, apellido_paterno, apellido_materno,
          ci, rude, fecha_nacimiento, lugar_nacimiento, genero, 
          direccion, zona, ciudad, telefono, email, foto_url,
          contacto_emergencia,
          tiene_discapacidad, tipo_discapacidad,
          institucion_procedencia, ultimo_grado_cursado, grado_solicitado,
          repite_grado, turno_solicitado
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      `, [
        preInscripcionId,
        estudiante.nombres,
        estudiante.apellido_paterno,
        estudiante.apellido_materno || null,
        estudiante.ci || null,
        estudiante.rude || null, // ✅ RUDE
        estudiante.fecha_nacimiento,
        estudiante.lugar_nacimiento || null,
        estudiante.genero || null,
        estudiante.direccion || null,
        estudiante.zona || null,
        estudiante.ciudad || null,
        estudiante.telefono || null,
        estudiante.email || null,
        foto_url,
        estudiante.contacto_emergencia || null, // ✅ Solo contacto
        estudiante.tiene_discapacidad || false,
        estudiante.tipo_discapacidad || null,
        estudiante.institucion_procedencia || null,
        estudiante.ultimo_grado_cursado || null,
        estudiante.grado_solicitado || null,
        estudiante.repite_grado || false,
        estudiante.turno_solicitado || null
      ]);

      // ✅ Crear pre_tutor (CON otro_parentesco, SIN lugar_trabajo/telefono_trabajo/nivel_educacion)
      await client.query(`
        INSERT INTO pre_tutor (
          pre_inscripcion_id, tipo_representante, nombres, apellido_paterno, 
          apellido_materno, ci, fecha_nacimiento, genero, parentesco,
          otro_parentesco,
          telefono, celular, email, direccion, 
          ocupacion, estado_civil,
          es_tutor_principal, vive_con_estudiante
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `, [
        preInscripcionId,
        representante.tipo_representante || null,
        representante.nombres,
        representante.apellido_paterno,
        representante.apellido_materno || null,
        representante.ci,
        representante.fecha_nacimiento || null,
        representante.genero || null,
        representante.parentesco || 'padre',
        representante.otro_parentesco || null, // ✅ NUEVO
        representante.telefono,
        representante.celular || representante.telefono,
        representante.email || null,
        representante.direccion || null,
        representante.ocupacion || null, // ✅ Solo ocupacion
        representante.estado_civil || null,
        true,
        representante.vive_con_estudiante || false
      ]);

      // Subir documentos
      const tiposDocumento = [
        { campo: 'cedula_estudiante', tipo: 'cedula_estudiante' },
        { campo: 'certificado_nacimiento', tipo: 'certificado_nacimiento' },
        { campo: 'libreta_notas', tipo: 'libreta_notas' },
        { campo: 'cedula_representante', tipo: 'cedula_tutor' }
      ];

      for (const doc of tiposDocumento) {
        const file = req.files?.[doc.campo]?.[0];
        
        if (file) {
          const uploadResult = await UploadImage.uploadFromBuffer(
            file.buffer,
            'preinscripciones/documentos',
            `${codigoInscripcion}_${doc.tipo}_${Date.now()}`
          );

          documentos_urls.push(uploadResult.url);

          await client.query(`
            INSERT INTO pre_documento (
              pre_inscripcion_id, tipo_documento, nombre_archivo, 
              url_archivo, tamano_bytes, tipo_mime,
              subido, fecha_subida
            ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
          `, [
            preInscripcionId, 
            doc.tipo, 
            file.originalname, 
            uploadResult.url,
            file.size,
            file.mimetype
          ]);
        }
      }

      await client.query('COMMIT');

      // Registrar actividad
      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'crear_preinscripcion',
          modulo: 'preinscripcion',
          tabla_afectada: 'pre_inscripcion',
          registro_id: preInscripcionId,
          datos_nuevos: {
            codigo_inscripcion: codigoInscripcion,
            cupos_disponibles: cupoDisponible.tiene_cupos,
            tiene_rude: !!estudiante.rude // ✅ Log si tiene RUDE
          },
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `Preinscripción creada: ${codigoInscripcion}`
        });
      }

      res.status(201).json({
        success: true,
        message: `Preinscripción creada exitosamente. ${cupoDisponible.mensaje}`,
        data: {
          preinscripcion: {
            id: preInscripcionId,
            codigo_inscripcion: codigoInscripcion,
            estado: 'datos_completos',
            foto_url: foto_url,
            cupo_asignado: false,
            periodo_academico_id: preinscripcion_info?.periodo_academico_id,
            grado_id: preinscripcion_info?.grado_id,
            turno_preferido_id: preinscripcion_info?.turno_id,
            cupos_disponibles: cupoDisponible.tiene_cupos,
            mensaje_cupos: cupoDisponible.mensaje
          }
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error en preinscripción:', error);

      // Limpiar archivos subidos
      for (const url of documentos_urls) {
        const publicId = UploadImage.extractPublicIdFromUrl(url);
        if (publicId) {
          try {
            await UploadImage.deleteImage(publicId);
          } catch (err) {
            console.error('Error al eliminar archivo:', err);
          }
        }
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear preinscripción: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // ========================================
  // LISTAR
  // ========================================
  static async listar(req, res) {
    try {
      const { estado, page, limit } = req.query;
      
      const filters = {
        estado,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10
      };

      const resultado = await PreInscripcion.obtenerTodas(filters);

      res.json({
        success: true,
        data: resultado
      });
    } catch (error) {
      console.error('Error al listar preinscripciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar preinscripciones: ' + error.message
      });
    }
  }

  // ========================================
  // OBTENER POR ID
  // ========================================
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      
      const preinscripcion = await PreInscripcion.obtenerPorId(id);
      
      if (!preinscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Preinscripción no encontrada'
        });
      }

      res.json({
        success: true,
        data: { preinscripcion }
      });
    } catch (error) {
      console.error('Error al obtener preinscripción:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener preinscripción: ' + error.message
      });
    }
  }

  // ========================================
  // CAMBIAR ESTADO
  // ========================================
  static async cambiarEstado(req, res) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { id } = req.params;
      const { estado, observaciones } = req.body;

      if (!estado) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar el nuevo estado'
        });
      }

      const preInscripcion = await PreInscripcion.obtenerPorId(id);
      
      if (!preInscripcion) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Preinscripción no encontrada'
        });
      }

      // Si aprueba y no tiene cupo, asignar
      let cupoAsignado = null;
      
      if (estado === 'aprobada' && !preInscripcion.tiene_cupo_asignado) {
        if (preInscripcion.grado_id && preInscripcion.turno_preferido_id && preInscripcion.periodo_academico_id) {
          
          const cupoResult = await client.query(`
            SELECT * FROM cupo_preinscripcion
            WHERE grado_id = $1 
              AND turno_id = $2 
              AND periodo_academico_id = $3
              AND activo = true
            LIMIT 1
          `, [
            preInscripcion.grado_id,
            preInscripcion.turno_preferido_id,
            preInscripcion.periodo_academico_id
          ]);

          if (cupoResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: 'No hay cupos configurados'
            });
          }

          const cupo = cupoResult.rows[0];
          const cuposDisponibles = cupo.cupos_totales - cupo.cupos_ocupados;

          if (cuposDisponibles <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: 'No hay cupos disponibles'
            });
          }

          // Incrementar cupos ocupados
          await client.query(`
            UPDATE cupo_preinscripcion
            SET cupos_ocupados = cupos_ocupados + 1,
                updated_at = NOW()
            WHERE id = $1
          `, [cupo.id]);

          // Asignar cupo a preinscripción
          await client.query(`
            UPDATE pre_inscripcion
            SET cupo_preinscripcion_id = $1,
                tiene_cupo_asignado = true,
                updated_at = NOW()
            WHERE id = $2
          `, [cupo.id, id]);

          cupoAsignado = {
            cupo_id: cupo.id,
            cupos_restantes: cuposDisponibles - 1
          };
        }
      }

      // Cambiar estado
      const resultado = await PreInscripcion.cambiarEstado(
        id, 
        estado, 
        req.user?.id, 
        observaciones,
        client
      );

      await client.query('COMMIT');

      // Registrar actividad
      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'cambiar_estado_preinscripcion',
          modulo: 'preinscripcion',
          tabla_afectada: 'pre_inscripcion',
          registro_id: id,
          datos_nuevos: { 
            estado, 
            observaciones,
            cupo_asignado: !!cupoAsignado
          },
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `Estado cambiado a: ${estado}${cupoAsignado ? ' (cupo asignado)' : ''}`
        });
      }

      res.json({
        success: true,
        message: `Estado actualizado${cupoAsignado ? '. Cupo asignado.' : ''}`,
        data: { 
          preinscripcion: resultado,
          cupo_asignado: cupoAsignado
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al cambiar estado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar estado: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // ========================================
  // CONVERTIR A ESTUDIANTE
  // ========================================
  static async convertirAEstudiante(req, res) {
    try {
      const { id } = req.params;
      const { paralelo_id, periodo_academico_id, rude  } = req.body;

      if (!paralelo_id || !periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar paralelo_id y periodo_academico_id'
        });
      }

      const resultado = await PreInscripcion.convertirAEstudiante(
        id,
        req.user?.id,
        paralelo_id,
        periodo_academico_id,
        rude 
      );

      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'convertir_preinscripcion',
          modulo: 'preinscripcion',
          tabla_afectada: 'pre_inscripcion',
          registro_id: id,
          datos_nuevos: {
            estudiante_id: resultado.estudiante.id,
            matricula_id: resultado.matricula.id,
            codigo_estudiante: resultado.estudiante.codigo
          },
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `Preinscripción convertida: ${resultado.estudiante.codigo}`
        });
      }

      const respuesta = {
        success: true,
        message: 'Preinscripción convertida exitosamente',
        data: {
          estudiante: {
            id: resultado.estudiante.id,
            codigo: resultado.estudiante.codigo,
            nombres: resultado.estudiante.nombres,
            apellidos: `${resultado.estudiante.apellido_paterno} ${resultado.estudiante.apellido_materno || ''}`,
            foto_url: resultado.estudiante.foto_url
          },
          matricula: {
            id: resultado.matricula.id,
            numero_matricula: resultado.matricula.numero_matricula,
            estado: resultado.matricula.estado
          }
        }
      };
      
      if (resultado.credenciales?.estudiante) {
        respuesta.data.credenciales_estudiante = resultado.credenciales.estudiante;
        respuesta.message += ' ✅ Usuario de estudiante creado.';
      }

      if (resultado.credenciales?.padre) {
        respuesta.data.credenciales_padre = resultado.credenciales.padre;
        respuesta.message += ' ✅ Usuario de padre creado.';
      }

      res.json(respuesta);
        
    } catch (error) {
      console.error('Error al convertir preinscripción:', error);
      res.status(500).json({
        success: false,
        message: 'Error al convertir preinscripción: ' + error.message
      });
    }
  }

  // ========================================
  // ELIMINAR
  // ========================================
  static async eliminar(req, res) {
    try {
      const { id } = req.params;
      
      const resultado = await PreInscripcion.eliminar(id);
      
      if (!resultado) {
        return res.status(404).json({
          success: false,
          message: 'Preinscripción no encontrada'
        });
      }

      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'eliminar_preinscripcion',
          modulo: 'preinscripcion',
          tabla_afectada: 'pre_inscripcion',
          registro_id: id,
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: 'Preinscripción eliminada (cupo liberado)'
        });
      }

      res.json({
        success: true,
        message: 'Preinscripción eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar preinscripción:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar preinscripción: ' + error.message
      });
    }
  }

  // ========================================
  // RESUBIR DOCUMENTO
  // ========================================
  static async resubirDocumento(req, res) {
    const client = await pool.connect();
    const documentos_urls = [];
    
    try {
      const { id, tipo_documento } = req.params;

      if (!tipo_documento) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar el tipo de documento'
        });
      }

      const preInscripcion = await PreInscripcion.obtenerPorId(id);
      if (!preInscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Preinscripción no encontrada'
        });
      }

      if (preInscripcion.estado === 'convertida') {
        return res.status(400).json({
          success: false,
          message: 'No se pueden modificar documentos de una preinscripción convertida'
        });
      }

      if (!req.files || !req.files[tipo_documento]) {
        return res.status(400).json({
          success: false,
          message: 'Debe adjuntar el archivo'
        });
      }

      const file = Array.isArray(req.files[tipo_documento]) 
        ? req.files[tipo_documento][0] 
        : req.files[tipo_documento];

      if (!UploadImage.isValidImage(file) || !UploadImage.isValidSize(file, 5)) {
        return res.status(400).json({
          success: false,
          message: 'Archivo inválido o muy grande (máximo 5MB)'
        });
      }

      const docActual = await client.query(`
        SELECT * FROM pre_documento 
        WHERE pre_inscripcion_id = $1 AND tipo_documento = $2
        LIMIT 1
      `, [id, tipo_documento]);

      let documentoId = null;

      if (docActual.rows.length > 0) {
        documentoId = docActual.rows[0].id;
        
        if (docActual.rows[0].url_archivo) {
          const publicId = UploadImage.extractPublicIdFromUrl(docActual.rows[0].url_archivo);
          if (publicId) {
            try {
              await UploadImage.deleteImage(publicId);
            } catch (err) {
              console.error('⚠️ Error al eliminar archivo anterior:', err);
            }
          }
        }
      }

      const uploadResult = await UploadImage.uploadFromBuffer(
        file.buffer,
        'preinscripciones/documentos',
        `${preInscripcion.codigo_inscripcion}_${tipo_documento}_${Date.now()}`
      );

      documentos_urls.push(uploadResult.url);

      if (documentoId) {
        await client.query(`
          UPDATE pre_documento 
          SET 
            nombre_archivo = $1,
            url_archivo = $2,
            tamano_bytes = $3,
            tipo_mime = $4,
            subido = true,
            fecha_subida = NOW(),
            requiere_correccion = false,
            motivo_correccion = NULL,
            observaciones = NULL,
            verificado = false,
            fecha_verificacion = NULL,
            verificado_por = NULL,
            updated_at = NOW()
          WHERE id = $5
        `, [
          file.originalname,
          uploadResult.url,
          file.size,
          file.mimetype,
          documentoId
        ]);
      } else {
        const nuevoDoc = await client.query(`
          INSERT INTO pre_documento (
            pre_inscripcion_id,
            tipo_documento,
            nombre_archivo,
            url_archivo,
            tamano_bytes,
            tipo_mime,
            subido,
            fecha_subida,
            es_obligatorio
          ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), true)
          RETURNING *
        `, [
          id,
          tipo_documento,
          file.originalname,
          uploadResult.url,
          file.size,
          file.mimetype
        ]);
        
        documentoId = nuevoDoc.rows[0].id;
      }

      if (['documentos_pendientes', 'rechazada'].includes(preInscripcion.estado)) {
        await client.query(`
          UPDATE pre_inscripcion 
          SET estado = 'en_revision', updated_at = NOW()
          WHERE id = $1
        `, [id]);
      }

      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'resubir_documento',
          modulo: 'preinscripcion',
          tabla_afectada: 'pre_documento',
          registro_id: documentoId,
          datos_nuevos: {
            pre_inscripcion_id: id,
            tipo_documento,
            nuevo_archivo: file.originalname
          },
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `Documento actualizado: ${tipo_documento}`
        });
      }

      res.json({
        success: true,
        message: 'Documento actualizado correctamente',
        data: {
          documento: {
            id: documentoId,
            tipo_documento,
            nombre_archivo: file.originalname,
            url_archivo: uploadResult.url
          }
        }
      });

    } catch (error) {
      console.error('❌ Error al re-subir documento:', error);

      for (const url of documentos_urls) {
        const publicId = UploadImage.extractPublicIdFromUrl(url);
        if (publicId) {
          try {
            await UploadImage.deleteImage(publicId);
          } catch (err) {
            console.error('Error al eliminar archivo:', err);
          }
        }
      }

      res.status(500).json({
        success: false,
        message: 'Error al actualizar documento: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // ========================================
  // MARCAR DOCUMENTO OBSERVADO
  // ========================================
  static async marcarDocumentoObservado(req, res) {
    try {
      const { id } = req.params;
      const { requiere_correccion, motivo_correccion, observaciones } = req.body;

      if (requiere_correccion && !motivo_correccion) {
        return res.status(400).json({
          success: false,
          message: 'Debe especificar el motivo de la corrección'
        });
      }

      const result = await pool.query(`
        UPDATE pre_documento 
        SET 
          requiere_correccion = $1,
          motivo_correccion = $2,
          observaciones = $3,
          updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `, [requiere_correccion, motivo_correccion, observaciones, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Documento no encontrado'
        });
      }

      if (requiere_correccion) {
        await pool.query(`
          UPDATE pre_inscripcion 
          SET estado = 'documentos_pendientes', updated_at = NOW()
          WHERE id = (
            SELECT pre_inscripcion_id FROM pre_documento WHERE id = $1
          )
        `, [id]);
      }

      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'marcar_documento_observado',
          modulo: 'preinscripcion',
          tabla_afectada: 'pre_documento',
          registro_id: id,
          datos_nuevos: {
            requiere_correccion,
            motivo_correccion,
            observaciones
          },
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: 'Documento marcado como observado'
        });
      }

      res.json({
        success: true,
        message: 'Documento actualizado correctamente',
        data: { documento: result.rows[0] }
      });

    } catch (error) {
      console.error('Error al marcar documento:', error);
      res.status(500).json({
        success: false,
        message: 'Error al marcar documento: ' + error.message
      });
    }
  }
static async crearMultiple(req, res) {
  const client = await pool.connect();
  const documentos_urls = [];
  
  try {
    await client.query('BEGIN');
    
    const { modo, padre_id, estudiantes, representante } = req.body;

    console.log('📥 Datos recibidos:', {
      modo,
      padre_id,
      total_estudiantes: estudiantes?.length || 0,
      tiene_representante: !!representante
    });

    // ========================================
    // VALIDACIONES INICIALES
    // ========================================
    if (!Array.isArray(estudiantes) || estudiantes.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar al menos un estudiante'
      });
    }

    if (estudiantes.length > 5) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Máximo 5 estudiantes por preinscripción'
      });
    }

    // ========================================
    // DETERMINAR O CREAR PADRE
    // ========================================
    let padreFamiliaId;
    let cedulaRepresentanteUrl = null; // 🆕 URL de la cédula del padre

    if (modo === 'padre_existente' && padre_id) {
      // Verificar que el padre existe
      const padreExiste = await client.query(
        'SELECT id FROM padre_familia WHERE id = $1 AND deleted_at IS NULL',
        [padre_id]
      );

      if (padreExiste.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Padre no encontrado en el sistema'
        });
      }

      padreFamiliaId = padre_id;
      console.log(`✅ Usando padre existente: ${padreFamiliaId}`);

      // 🆕 BUSCAR SI EL PADRE YA TIENE CÉDULA EN OTRA PREINSCRIPCIÓN
      const cedulaExistenteResult = await client.query(`
        SELECT pd.url_archivo 
        FROM pre_documento pd
        INNER JOIN pre_tutor pt ON pd.pre_inscripcion_id = pt.pre_inscripcion_id
        WHERE pt.ci = (SELECT ci FROM padre_familia WHERE id = $1)
          AND pd.tipo_documento = 'cedula_tutor'
          AND pd.url_archivo IS NOT NULL
        ORDER BY pd.created_at DESC
        LIMIT 1
      `, [padre_id]);

      if (cedulaExistenteResult.rows.length > 0) {
        cedulaRepresentanteUrl = cedulaExistenteResult.rows[0].url_archivo;
        console.log(`✅ Reutilizando cédula del padre: ${cedulaRepresentanteUrl}`);
      }

    } else {
      // Modo 'nuevo' o 'multiple': crear nuevo padre
      if (!representante || !representante.nombres || !representante.apellido_paterno || !representante.ci) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Los datos del representante son incompletos'
        });
      }

      // Verificar que el CI no exista ya
      const ciExiste = await client.query(
        'SELECT id FROM padre_familia WHERE ci = $1 AND deleted_at IS NULL',
        [representante.ci]
      );

      if (ciExiste.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Ya existe un padre/tutor con ese CI. Use el modo "Padre Existente".'
        });
      }

      // Subir cédula del representante (si existe)
      const cedulaRepFile = req.files?.['cedula_representante']?.[0];
      if (cedulaRepFile) {
        try {
          const uploadResult = await UploadImage.uploadFromBuffer(
            cedulaRepFile.buffer,
            'preinscripciones/documentos',
            `cedula_rep_${representante.ci}_${Date.now()}`
          );
          cedulaRepresentanteUrl = uploadResult.url;
          documentos_urls.push(uploadResult.url);
          console.log(`✅ Cédula del padre subida: ${cedulaRepresentanteUrl}`);
        } catch (uploadError) {
          console.error('Error al subir cédula de representante:', uploadError);
        }
      }

      // Crear el nuevo padre
      const nuevoPadreResult = await client.query(`
        INSERT INTO padre_familia (
          nombres, apellido_paterno, apellido_materno, ci,
          fecha_nacimiento, genero, telefono, celular, email,
          direccion, ocupacion, lugar_trabajo, telefono_trabajo,
          estado_civil, nivel_educacion, parentesco
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING id
      `, [
        representante.nombres,
        representante.apellido_paterno,
        representante.apellido_materno || null,
        representante.ci,
        representante.fecha_nacimiento || null,
        representante.genero || null,
        representante.telefono,
        representante.celular || representante.telefono,
        representante.email || null,
        representante.direccion || null,
        representante.ocupacion || null,
        representante.lugar_trabajo || null,
        representante.telefono_trabajo || null,
        representante.estado_civil || null,
        representante.nivel_educacion || null,
        representante.parentesco || 'padre'
      ]);

      padreFamiliaId = nuevoPadreResult.rows[0].id;
      console.log(`✅ Nuevo padre creado: ${padreFamiliaId}`);
    }

    // ========================================
    // CREAR PREINSCRIPCIONES PARA CADA ESTUDIANTE
    // ========================================
    const preinscripcionesCreadas = [];

    for (let i = 0; i < estudiantes.length; i++) {
      const estudiante = estudiantes[i];

      console.log(`📝 Procesando estudiante ${i + 1}/${estudiantes.length}:`, estudiante.nombres);

      // Validar datos mínimos del estudiante
      if (!estudiante.nombres || !estudiante.apellido_paterno || !estudiante.fecha_nacimiento) {
        throw new Error(`Estudiante ${i + 1}: Datos incompletos (nombres, apellido_paterno, fecha_nacimiento son obligatorios)`);
      }

      // Generar código único
      const codigoResult = await client.query(`
        SELECT 'PRE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
        LPAD(CAST(COALESCE(MAX(CAST(SUBSTRING(codigo_inscripcion FROM 10) AS INTEGER)), 0) + 1 AS VARCHAR), 4, '0') 
        AS codigo
        FROM pre_inscripcion 
        WHERE codigo_inscripcion LIKE 'PRE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'
      `);
      const codigoInscripcion = codigoResult.rows[0].codigo;

      // Crear pre_inscripcion
      const inscripcionResult = await client.query(`
        INSERT INTO pre_inscripcion (codigo_inscripcion, estado)
        VALUES ($1, 'datos_completos')
        RETURNING *
      `, [codigoInscripcion]);
      
      const preInscripcionId = inscripcionResult.rows[0].id;

      // Subir foto del estudiante (si existe)
      let fotoUrl = null;
      const fotoFile = req.files?.[`foto_estudiante_${i}`]?.[0];
      if (fotoFile) {
        try {
          const uploadResult = await UploadImage.uploadFromBuffer(
            fotoFile.buffer,
            'preinscripciones/fotos',
            `foto_${codigoInscripcion}_${Date.now()}`
          );
          fotoUrl = uploadResult.url;
          documentos_urls.push(uploadResult.url);
        } catch (uploadError) {
          console.error(`Error al subir foto del estudiante ${i + 1}:`, uploadError);
        }
      }

      // Crear pre_estudiante
      await client.query(`
        INSERT INTO pre_estudiante (
          pre_inscripcion_id, nombres, apellido_paterno, apellido_materno,
          ci, fecha_nacimiento, lugar_nacimiento, genero, 
          direccion, zona, ciudad, telefono, email, foto_url,
          contacto_emergencia, telefono_emergencia,
          tiene_discapacidad, tipo_discapacidad,
          institucion_procedencia, ultimo_grado_cursado, grado_solicitado,
          repite_grado, turno_solicitado
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      `, [
        preInscripcionId,
        estudiante.nombres,
        estudiante.apellido_paterno,
        estudiante.apellido_materno || null,
        estudiante.ci || null,
        estudiante.fecha_nacimiento,
        estudiante.lugar_nacimiento || null,
        estudiante.genero || null,
        estudiante.direccion || null,
        estudiante.zona || null,
        estudiante.ciudad || null,
        estudiante.telefono || null,
        estudiante.email || null,
        fotoUrl,
        estudiante.contacto_emergencia || null,
        estudiante.telefono_emergencia || null,
        estudiante.tiene_discapacidad || false,
        estudiante.tipo_discapacidad || null,
        estudiante.institucion_procedencia || null,
        estudiante.ultimo_grado_cursado || null,
        estudiante.grado_solicitado || null,
        estudiante.repite_grado || false,
        estudiante.turno_solicitado || null
      ]);

      // Crear pre_tutor (vinculando al padre)
      await client.query(`
        INSERT INTO pre_tutor (
          pre_inscripcion_id, tipo_representante, nombres, apellido_paterno, 
          apellido_materno, ci, fecha_nacimiento, genero, parentesco,
          telefono, celular, email, direccion, 
          ocupacion, lugar_trabajo, telefono_trabajo,
          estado_civil, nivel_educacion,
          es_tutor_principal, vive_con_estudiante
        ) 
        SELECT 
          $1,
          $2,
          pf.nombres, pf.apellido_paterno, pf.apellido_materno, pf.ci,
          pf.fecha_nacimiento, 'masculino', pf.parentesco,
          pf.telefono, pf.celular, pf.email, pf.direccion,
          pf.ocupacion, pf.lugar_trabajo, pf.telefono_trabajo,
          pf.estado_civil, pf.nivel_educacion,
          true,
          $3
        FROM padre_familia pf
        WHERE pf.id = $4
      `, [
        preInscripcionId,
        representante?.tipo_representante || 'Padre o Madre',
        estudiante.vive_con_tutor !== undefined ? estudiante.vive_con_tutor : true,
        padreFamiliaId
      ]);

      // Subir documentos del estudiante
      const tiposDocumento = [
        { campo: `cedula_estudiante_${i}`, tipo: 'cedula_estudiante' },
        { campo: `certificado_nacimiento_${i}`, tipo: 'certificado_nacimiento' },
        { campo: `libreta_notas_${i}`, tipo: 'libreta_notas' }
      ];

      for (const doc of tiposDocumento) {
        const file = req.files?.[doc.campo]?.[0];
        
        if (file) {
          try {
            const uploadResult = await UploadImage.uploadFromBuffer(
              file.buffer,
              'preinscripciones/documentos',
              `${codigoInscripcion}_${doc.tipo}_${Date.now()}`
            );

            documentos_urls.push(uploadResult.url);

            await client.query(`
              INSERT INTO pre_documento (
                pre_inscripcion_id, tipo_documento, nombre_archivo, 
                url_archivo, tamano_bytes, tipo_mime,
                subido, fecha_subida
              ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
            `, [
              preInscripcionId, 
              doc.tipo, 
              file.originalname, 
              uploadResult.url,
              file.size,
              file.mimetype
            ]);

          } catch (uploadError) {
            console.error(`Error al subir ${doc.tipo} del estudiante ${i + 1}:`, uploadError);
          }
        }
      }

      // 🆕 INSERTAR CÉDULA DEL PADRE (compartida entre hermanos)
      if (cedulaRepresentanteUrl) {
        await client.query(`
          INSERT INTO pre_documento (
            pre_inscripcion_id, tipo_documento, nombre_archivo, 
            url_archivo, subido, fecha_subida
          ) VALUES ($1, 'cedula_tutor', 'Cédula Representante (compartida)', $2, true, NOW())
        `, [preInscripcionId, cedulaRepresentanteUrl]);
        
        console.log(`✅ Cédula del padre vinculada a estudiante ${i + 1}`);
      }

      preinscripcionesCreadas.push({
        id: preInscripcionId,
        codigo_inscripcion: codigoInscripcion,
        estado: 'datos_completos',
        foto_url: fotoUrl,
        estudiante_nombres: `${estudiante.nombres} ${estudiante.apellido_paterno}`
      });
    }

    // ========================================
    // COMMIT - TODO EXITOSO
    // ========================================
    await client.query('COMMIT');

    // Registrar actividad
    if (req.user) {
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear_preinscripcion_multiple',
        modulo: 'preinscripcion',
        tabla_afectada: 'pre_inscripcion',
        datos_nuevos: {
          modo,
          padre_id: padreFamiliaId,
          total_estudiantes: estudiantes.length,
          cedula_compartida: !!cedulaRepresentanteUrl,
          codigos_creados: preinscripcionesCreadas.map(p => p.codigo_inscripcion)
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `${estudiantes.length} preinscripción(es) creada(s) con cédula${cedulaRepresentanteUrl ? ' compartida' : ''}`
      });
    }

    res.status(201).json({
      success: true,
      message: `${estudiantes.length} preinscripción(es) creada(s) exitosamente${cedulaRepresentanteUrl ? ' (cédula del padre compartida)' : ''}`,
      data: {
        preinscripciones: preinscripcionesCreadas,
        total_creadas: preinscripcionesCreadas.length,
        padre_id: padreFamiliaId,
        cedula_compartida: !!cedulaRepresentanteUrl
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en preinscripción múltiple:', error);

    // Eliminar archivos de Cloudinary si se subieron
    for (const url of documentos_urls) {
      const publicId = UploadImage.extractPublicIdFromUrl(url);
      if (publicId) {
        try {
          await UploadImage.deleteImage(publicId);
        } catch (err) {
          console.error('Error al eliminar archivo tras fallo:', err);
        }
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error al crear preinscripciones: ' + error.message
    });
  } finally {
    client.release();
  }
}
  // ========================================
  // BUSCAR POR CÓDIGO
  // ========================================
  static async buscarPorCodigo(req, res) {
    try {
      const { codigo } = req.params;

      if (!codigo) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar un código de preinscripción'
        });
      }

      const result = await pool.query(`
        SELECT 
          pi.*,
          pe.nombres || ' ' || pe.apellido_paterno || ' ' || COALESCE(pe.apellido_materno, '') as estudiante_nombre,
          pe.ci as estudiante_ci,
          pe.foto_url as estudiante_foto,
          pe.grado_solicitado,
          pt.nombres || ' ' || pt.apellido_paterno as tutor_nombre,
          pt.telefono as tutor_telefono
        FROM pre_inscripcion pi
        LEFT JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
        LEFT JOIN pre_tutor pt ON pi.id = pt.pre_inscripcion_id AND pt.es_tutor_principal = true
        WHERE pi.codigo_inscripcion = $1 AND pi.deleted_at IS NULL
        LIMIT 1
      `, [codigo.toUpperCase()]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró una preinscripción con ese código'
        });
      }

      const preinscripcion = result.rows[0];
      const detalles = await PreInscripcion.obtenerPorId(preinscripcion.id);

      res.json({
        success: true,
        data: { preinscripcion: detalles }
      });

    } catch (error) {
      console.error('Error al buscar preinscripción:', error);
      res.status(500).json({
        success: false,
        message: 'Error al buscar preinscripción: ' + error.message
      });
    }
  }

  // ========================================
  // ACTUALIZAR DATOS ESTUDIANTE
  // ========================================
  static async actualizarDatosEstudiante(req, res) {
    try {
      const { id } = req.params;
      const datosEstudiante = req.body;

      const preInscripcion = await PreInscripcion.obtenerPorId(id);
      if (!preInscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Preinscripción no encontrada'
        });
      }

      const estadosEditables = ['documentos_pendientes', 'en_revision', 'rechazada'];
      if (!estadosEditables.includes(preInscripcion.estado)) {
        return res.status(400).json({
          success: false,
          message: 'No se pueden editar los datos en el estado actual'
        });
      }

      // ✅ Actualizar con RUDE, sin telefono_emergencia
      const result = await pool.query(`
        UPDATE pre_estudiante 
        SET 
          nombres = $1,
          apellido_paterno = $2,
          apellido_materno = $3,
          ci = $4,
          rude = $5,
          fecha_nacimiento = $6,
          lugar_nacimiento = $7,
          genero = $8,
          direccion = $9,
          zona = $10,
          ciudad = $11,
          telefono = $12,
          email = $13,
          contacto_emergencia = $14,
          updated_at = NOW()
        WHERE pre_inscripcion_id = $15
        RETURNING *
      `, [
        datosEstudiante.nombres,
        datosEstudiante.apellido_paterno,
        datosEstudiante.apellido_materno,
        datosEstudiante.ci,
        datosEstudiante.rude, // ✅ RUDE
        datosEstudiante.fecha_nacimiento,
        datosEstudiante.lugar_nacimiento,
        datosEstudiante.genero,
        datosEstudiante.direccion,
        datosEstudiante.zona,
        datosEstudiante.ciudad,
        datosEstudiante.telefono,
        datosEstudiante.email,
        datosEstudiante.contacto_emergencia, // ✅ Solo contacto
        id
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Datos del estudiante no encontrados'
        });
      }

      if (preInscripcion.estado === 'rechazada') {
        await pool.query(`
          UPDATE pre_inscripcion 
          SET estado = 'en_revision', updated_at = NOW()
          WHERE id = $1
        `, [id]);
      }

      res.json({
        success: true,
        message: 'Datos del estudiante actualizados correctamente',
        data: { estudiante: result.rows[0] }
      });

    } catch (error) {
      console.error('Error al actualizar estudiante:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar datos: ' + error.message
      });
    }
  }

  // ========================================
  // ACTUALIZAR DATOS TUTOR
  // ========================================
  static async actualizarDatosTutor(req, res) {
    try {
      const { id } = req.params;
      const datosTutor = req.body;

      const preInscripcion = await PreInscripcion.obtenerPorId(id);
      if (!preInscripcion) {
        return res.status(404).json({
          success: false,
          message: 'Preinscripción no encontrada'
        });
      }

      const estadosEditables = ['documentos_pendientes', 'en_revision', 'rechazada'];
      if (!estadosEditables.includes(preInscripcion.estado)) {
        return res.status(400).json({
          success: false,
          message: 'No se pueden editar los datos en el estado actual'
        });
      }

      // ✅ Actualizar con otro_parentesco, sin lugar_trabajo/telefono_trabajo/nivel_educacion
      const result = await pool.query(`
        UPDATE pre_tutor 
        SET 
          nombres = $1,
          apellido_paterno = $2,
          apellido_materno = $3,
          ci = $4,
          parentesco = $5,
          otro_parentesco = $6,
          telefono = $7,
          celular = $8,
          email = $9,
          direccion = $10,
          ocupacion = $11,
          updated_at = NOW()
        WHERE pre_inscripcion_id = $12 AND es_tutor_principal = true
        RETURNING *
      `, [
        datosTutor.nombres,
        datosTutor.apellido_paterno,
        datosTutor.apellido_materno,
        datosTutor.ci,
        datosTutor.parentesco,
        datosTutor.otro_parentesco, // ✅ NUEVO
        datosTutor.telefono,
        datosTutor.celular,
        datosTutor.email,
        datosTutor.direccion,
        datosTutor.ocupacion, // ✅ Solo ocupacion
        id
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Datos del tutor no encontrados'
        });
      }

      if (preInscripcion.estado === 'rechazada') {
        await pool.query(`
          UPDATE pre_inscripcion 
          SET estado = 'en_revision', updated_at = NOW()
          WHERE id = $1
        `, [id]);
      }

      res.json({
        success: true,
        message: 'Datos del tutor actualizados correctamente',
        data: { tutor: result.rows[0] }
      });

    } catch (error) {
      console.error('Error al actualizar tutor:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar datos: ' + error.message
      });
    }
  }
}

export default PreInscripcionController;