// controllers/registroCompletoController.js
import { pool } from '../db/pool.js';
import { Estudiante, PadreFamilia, EstudianteTutor } from '../models/Estudiantes.js';
import { Matricula, MatriculaDocumento } from '../models/Matricula.js';
import Usuario from '../models/Usuario.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class RegistroCompletoController {
  /**
   * Registro completo en un solo endpoint
   * Flujo: Estudiante → Usuario → Update Estudiante → Tutores → Matrícula → Documentos
   */
  static async registroCompleto(req, res) {
    const client = await pool.connect();
    let foto_url = null;
    const documentos_urls = []; // Para eliminar si hay error
    
    try {
      await client.query('BEGIN');
      
      let estudiante = req.body.estudiante;
    let tutores = req.body.tutores;
    let matricula = req.body.matricula;
    let documentos = req.body.documentos;
    let credenciales_estudiante = req.body.credenciales_estudiante;
    let credenciales_tutores = req.body.credenciales_tutores;
    
    // Función helper para parsear JSON de forma segura
    const parseJSON = (data, defaultValue = null) => {
      if (!data) return defaultValue;
      if (typeof data === 'object') return data;
      try {
        return JSON.parse(data);
      } catch (e) {
        console.error('Error parseando JSON:', e.message);
        return defaultValue;
      }
    };
    
    // Parsear todos los campos
    estudiante = parseJSON(estudiante, null);
    tutores = parseJSON(tutores, []);
    matricula = parseJSON(matricula, null);
    documentos = parseJSON(documentos, []);
    credenciales_estudiante = parseJSON(credenciales_estudiante, null);
    credenciales_tutores = parseJSON(credenciales_tutores, []);
    
    // Los booleanos vienen como string cuando se usa FormData
    const crear_usuario_estudiante = 
      req.body.crear_usuario_estudiante === 'true' || 
      req.body.crear_usuario_estudiante === true;
    const crear_usuarios_tutores = 
      req.body.crear_usuarios_tutores === 'true' || 
      req.body.crear_usuarios_tutores === true;

    // Log para debugging (quitar en producción)
    console.log('📥 Datos recibidos (parseados):', {
      estudiante: estudiante ? 'OK' : 'NULL',
      tutores: tutores?.length || 0,
      matricula: matricula ? 'OK' : 'NULL',
      crear_usuario_estudiante,
      crear_usuarios_tutores
    });

    // ========================================
    // VALIDACIONES INICIALES
    // ========================================
    if (!estudiante || !estudiante.nombres || !estudiante.apellido_paterno || !estudiante.fecha_nacimiento) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Los datos del estudiante son incompletos',
        debug: {
          recibido: {
            estudiante: typeof req.body.estudiante,
            parseado: estudiante
          }
        }
      });
    }

    if (!tutores || !Array.isArray(tutores) || tutores.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar al menos un tutor'
      });
    }
      // Validar datos de matrícula si se proporcionan
      if (matricula) {
        if (!matricula.paralelo_id || !matricula.periodo_academico_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Debe proporcionar paralelo y periodo académico para la matrícula'
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
            message: `El paralelo está lleno (${capacidad.matriculas_actuales}/${capacidad.capacidad_maxima})`
          });
        }
      }

      // ========================================
      // 1. PROCESAR FOTO DEL ESTUDIANTE
      // ========================================
      if (req.files && req.files.foto && req.files.foto[0]) {
        const fotoFile = req.files.foto[0];
        
        if (!UploadImage.isValidImage(fotoFile) || !UploadImage.isValidSize(fotoFile, 5)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Imagen inválida o muy grande (máx 5MB)'
          });
        }

        try {
          const uploadResult = await UploadImage.uploadFromBuffer(
            fotoFile.buffer,
            'estudiantes',
            `estudiante_${Date.now()}`
          );
          foto_url = uploadResult.url;
        } catch (uploadError) {
          await client.query('ROLLBACK');
          return res.status(500).json({
            success: false,
            message: 'Error al subir imagen: ' + uploadError.message
          });
        }
      }

      // ========================================
      // 2. CREAR ESTUDIANTE (SIN usuario_id)
      // ========================================
      let codigo_estudiante = estudiante.codigo;
        if (!codigo_estudiante) {
          // IMPORTANTE: Usar generateCodeWithLock dentro de la transacción
          codigo_estudiante = await Estudiante.generateCodeWithLock(client);
        }

        // Verificar CI si viene (AHORA USANDO CLIENT)
        if (estudiante.ci) {
          const ciExiste = await Estudiante.findByCI(estudiante.ci, client);
          if (ciExiste) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              success: false,
              message: 'El CI del estudiante ya está registrado'
            });
          }
        }

        // Verificar código (por si se proporciona uno manualmente)
        const codigoExiste = await Estudiante.findByCode(codigo_estudiante, client);
        if (codigoExiste) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `El código "${codigo_estudiante}" ya existe`
          });
        }

        // Crear estudiante SIN usuario_id (AHORA PASANDO CLIENT)
        const nuevoEstudiante = await Estudiante.create({
          usuario_id: null,
          codigo: codigo_estudiante,
          nombres: estudiante.nombres,
          apellido_paterno: estudiante.apellido_paterno,
          apellido_materno: estudiante.apellido_materno,
          fecha_nacimiento: estudiante.fecha_nacimiento,
          ci: estudiante.ci,
          lugar_nacimiento: estudiante.lugar_nacimiento,
          genero: estudiante.genero,
          direccion: estudiante.direccion,
          zona: estudiante.zona,
          ciudad: estudiante.ciudad,
          telefono: estudiante.telefono,
          email: estudiante.email,
          foto_url: foto_url,
          contacto_emergencia: estudiante.contacto_emergencia,
          telefono_emergencia: estudiante.telefono_emergencia,
          tiene_discapacidad: estudiante.tiene_discapacidad,
          tipo_discapacidad: estudiante.tipo_discapacidad,
          observaciones: estudiante.observaciones,
          activo: true
        }, client);

      // ========================================
      // 3. CREAR USUARIO DEL ESTUDIANTE (OPCIONAL)
      // ========================================
      let estudiante_usuario_id = null;
      let estudiante_username = null;
      let estudiante_password_temporal = null;

      if (crear_usuario_estudiante) {
  // Si no vienen credenciales o están incompletas, generar automáticamente
  if (!credenciales_estudiante || !credenciales_estudiante.username || !credenciales_estudiante.password) {
    estudiante_username = RegistroCompletoController.generarUsername(
      estudiante.nombres, 
      estudiante.apellido_paterno
    );
    estudiante_password_temporal = RegistroCompletoController.generarPassword(estudiante.ci);
  } else {
    // Usar las credenciales proporcionadas
    estudiante_username = credenciales_estudiante.username;
    estudiante_password_temporal = credenciales_estudiante.password;
  }

  // Verificar si el username ya existe
  const usuarioExiste = await Usuario.findByUsername(estudiante_username, client);
  if (usuarioExiste) {
    await client.query('ROLLBACK');
    return res.status(409).json({
      success: false,
      message: `El nombre de usuario "${estudiante_username}" ya existe`
    });
  }

  // Determinar el email
  const email_estudiante = credenciales_estudiante?.email || 
    estudiante.email ||
    `${estudiante_username}@estudiante.edu.bo`;

  // Crear el usuario
  const usuarioEstudiante = await Usuario.create({
    username: estudiante_username,
    email: email_estudiante,
    password: estudiante_password_temporal,
    activo: true,
    verificado: false,
    debe_cambiar_password: true
  }, client);

  estudiante_usuario_id = usuarioEstudiante.id;

  // Asignar rol de estudiante
  const rolEstudiante = await RegistroCompletoController.obtenerRolPorNombre('estudiante', client);
  if (rolEstudiante) {
    await client.query(
      'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
      [estudiante_usuario_id, rolEstudiante.id]
    );
  }

  // Actualizar estudiante con usuario_id
  await client.query(
    'UPDATE estudiante SET usuario_id = $1, updated_at = NOW() WHERE id = $2',
    [estudiante_usuario_id, nuevoEstudiante.id]
  );

  nuevoEstudiante.usuario_id = estudiante_usuario_id;
}

      // ========================================
      // 4. CREAR TUTORES Y SUS USUARIOS
      // ========================================
      const tutoresCreados = [];
      const credencialesTutores = [];

      for (const [index, tutor] of tutores.entries()) {
        if (!tutor.nombres || !tutor.apellido_paterno || !tutor.ci) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Datos incompletos para el tutor #${index + 1}`
          });
        }

        let tutorExistente = await PadreFamilia.findByCI(tutor.ci);
        let tutor_id;
        let tutor_usuario_id = null;

        if (tutorExistente) {
          tutor_id = tutorExistente.id;
          tutor_usuario_id = tutorExistente.usuario_id; // Guardar el usuario_id existente
          tutoresCreados.push(tutorExistente);
        } else {
          const nuevoTutor = await PadreFamilia.create({
            usuario_id: null,
            nombres: tutor.nombres,
            apellido_paterno: tutor.apellido_paterno,
            apellido_materno: tutor.apellido_materno,
            ci: tutor.ci,
            fecha_nacimiento: tutor.fecha_nacimiento,
            telefono: tutor.telefono,
            celular: tutor.celular,
            email: tutor.email,
            direccion: tutor.direccion,
            ocupacion: tutor.ocupacion,
            lugar_trabajo: tutor.lugar_trabajo,
            telefono_trabajo: tutor.telefono_trabajo,
            parentesco: tutor.parentesco,
            estado_civil: tutor.estado_civil,
            nivel_educacion: tutor.nivel_educacion
          }, client);

          tutor_id = nuevoTutor.id;
          tutoresCreados.push(nuevoTutor);
        }

        // CREAR USUARIO PARA EL TUTOR SI SE SOLICITA Y NO TIENE UNO
        if (crear_usuarios_tutores && !tutor_usuario_id) {
          const credencial_tutor = credenciales_tutores?.[index] || {};
          const tutor_username = credencial_tutor.username || 
            RegistroCompletoController.generarUsername(tutor.nombres, tutor.apellido_paterno);
          const tutor_password_temporal = credencial_tutor.password || 
            RegistroCompletoController.generarPassword(tutor.ci);

          const usuarioTutorExiste = await Usuario.findByUsername(tutor_username, client);
          if (usuarioTutorExiste) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              success: false,
              message: `El username "${tutor_username}" ya existe para el tutor #${index + 1}`
            });
          }

          const email_tutor = credencial_tutor.email || tutor.email || 
            `${tutor_username}@padre.edu.bo`;
            
          const usuarioTutor = await Usuario.create({
            username: tutor_username,
            email: email_tutor,
            password: tutor_password_temporal,
            activo: true,
            verificado: false,
            debe_cambiar_password: true
          }, client);

          tutor_usuario_id = usuarioTutor.id;

          // ASIGNAR ROL DE PADRE
          const rolPadre = await RegistroCompletoController.obtenerRolPorNombre('padre', client);
          if (rolPadre) {
            await client.query(
              'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', 
              [tutor_usuario_id, rolPadre.id]
            );
          }

          // ACTUALIZAR TUTOR CON USUARIO_ID
          await client.query(
            'UPDATE padre_familia SET usuario_id = $1, updated_at = NOW() WHERE id = $2',
            [tutor_usuario_id, tutor_id]
          );

          // Actualizar el objeto en tutoresCreados
          const tutorIndex = tutoresCreados.findIndex(t => t.id === tutor_id);
          if (tutorIndex !== -1) {
            tutoresCreados[tutorIndex].usuario_id = tutor_usuario_id;
          }

          credencialesTutores.push({
            nombre_completo: `${tutor.nombres} ${tutor.apellido_paterno}`,
            username: tutor_username,
            password: tutor_password_temporal,
            email: email_tutor
          });
        }

        // Relacionar tutor con estudiante
        await EstudianteTutor.assign({
          estudiante_id: nuevoEstudiante.id,
          padre_familia_id: tutor_id,
          es_tutor_principal: tutor.es_tutor_principal || index === 0,
          vive_con_estudiante: tutor.vive_con_estudiante ?? true,
          autorizado_recoger: tutor.autorizado_recoger ?? true,
          puede_autorizar_salidas: tutor.puede_autorizar_salidas ?? true,
          recibe_notificaciones: tutor.recibe_notificaciones ?? true,
          prioridad_contacto: tutor.prioridad_contacto || (index + 1),
          observaciones: tutor.observaciones
        }, client);
      }

      // ========================================
      // 5. CREAR MATRÍCULA (OPCIONAL)
      // ========================================
      let nuevaMatricula = null;
      let numero_matricula = null;

      if (matricula) {
        numero_matricula = matricula.numero_matricula || 
        await Matricula.generateNumeroMatricula(matricula.periodo_academico_id, client);

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
          nuevoEstudiante.id,
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

        nuevaMatricula = matriculaResult.rows[0];
      }

      // ========================================
      // 6. SUBIR DOCUMENTOS
      // ========================================
      const documentosCreados = [];

      if (matricula && nuevaMatricula && req.files && req.files.documentos) {
        const archivosDocumentos = req.files.documentos;
        
        for (let i = 0; i < archivosDocumentos.length; i++) {
          const file = archivosDocumentos[i];
          
          try {
            // Buscar metadata del documento en el body
            const docMetadata = documentos && documentos[i] ? documentos[i] : null;
            
            if (!docMetadata || !docMetadata.tipo_documento) {
              throw new Error(`Tipo de documento no especificado para ${file.originalname}`);
            }

            // Subir archivo a Cloudinary
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
      // 7. COMMIT - TODO EXITOSO
      // ========================================
      await client.query('COMMIT');

      // Registrar actividad
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'registro_completo',
        modulo: 'estudiante',
        tabla_afectada: 'estudiante',
        registro_id: nuevoEstudiante.id,
        datos_nuevos: {
          estudiante: nuevoEstudiante,
          tutores_count: tutoresCreados.length,
          usuarios_creados: crear_usuario_estudiante || crear_usuarios_tutores,
          matricula_creada: !!nuevaMatricula,
          documentos_subidos: documentosCreados.length
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Registro completo: ${nuevoEstudiante.nombres} ${nuevoEstudiante.apellido_paterno}${nuevaMatricula ? ' (con matrícula)' : ''}${documentosCreados.length > 0 ? ` y ${documentosCreados.length} documento(s)` : ''}`
      });

      // ========================================
      // RESPUESTA
      // ========================================
      const respuesta = {
        success: true,
        message: 'Registro completado exitosamente' + 
          (nuevaMatricula ? ' con matrícula' : '') +
          (documentosCreados.length > 0 ? ` y ${documentosCreados.length} documento(s)` : ''),
        data: {
          estudiante: {
            id: nuevoEstudiante.id,
            codigo: nuevoEstudiante.codigo,
            nombres: nuevoEstudiante.nombres,
            apellidos: `${nuevoEstudiante.apellido_paterno} ${nuevoEstudiante.apellido_materno || ''}`,
            foto_url: nuevoEstudiante.foto_url,
            usuario_id: nuevoEstudiante.usuario_id
          },
          tutores: tutoresCreados.map(t => ({
            id: t.id,
            nombres: t.nombres,
            apellidos: `${t.apellido_paterno} ${t.apellido_materno || ''}`,
            parentesco: t.parentesco,
            telefono: t.telefono,
            usuario_id: t.usuario_id
          }))
        }
      };

      if (nuevaMatricula) {
        respuesta.data.matricula = {
          id: nuevaMatricula.id,
          numero_matricula: nuevaMatricula.numero_matricula,
          fecha_matricula: nuevaMatricula.fecha_matricula,
          estado: nuevaMatricula.estado,
          es_becado: nuevaMatricula.es_becado
        };
      }

      if (documentosCreados.length > 0) {
        respuesta.data.documentos = documentosCreados.map(d => ({
          id: d.id,
          tipo_documento: d.tipo_documento,
          nombre_archivo: d.nombre_archivo,
          url_archivo: d.url_archivo,
          verificado: d.verificado
        }));
      }

      if (crear_usuario_estudiante) {
        respuesta.data.credenciales_estudiante = {
          username: estudiante_username,
          password: estudiante_password_temporal,
          debe_cambiar_password: true
        };
      }

      if (crear_usuarios_tutores && credencialesTutores.length > 0) {
        respuesta.data.credenciales_tutores = credencialesTutores;
      }

      res.status(201).json(respuesta);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en registro completo:', error);

      // Eliminar foto de Cloudinary si se subió
      if (foto_url) {
        const publicId = UploadImage.extractPublicIdFromUrl(foto_url);
        if (publicId) {
          try {
            await UploadImage.deleteImage(publicId);
          } catch (err) {
            console.error('Error al eliminar imagen tras fallo:', err);
          }
        }
      }

      // Eliminar documentos de Cloudinary si se subieron
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
        message: 'Error en el registro completo: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  /**
   * Crear usuario para estudiante existente
   */
  static async crearUsuarioEstudiante(req, res) {
    try {
      const { id } = req.params;
      const { username, password, email } = req.body;

      const estudiante = await Estudiante.findById(id);
      if (!estudiante) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      if (estudiante.usuario_id) {
        return res.status(409).json({
          success: false,
          message: 'El estudiante ya tiene un usuario asignado'
        });
      }

      const finalUsername = username || RegistroCompletoController.generarUsername(estudiante.nombres, estudiante.apellido_paterno);
      const finalPassword = password || RegistroCompletoController.generarPassword(estudiante.ci);
      const finalEmail = email || `${finalUsername}@estudiante.edu.bo`;

      const usuarioExiste = await Usuario.findByCredential(finalUsername);
      if (usuarioExiste) {
        return res.status(409).json({
          success: false,
          message: 'El nombre de usuario ya existe'
        });
      }

      const usuario = await Usuario.create({
        username: finalUsername,
        email: finalEmail,
        password: finalPassword,
        activo: true,
        verificado: false,
        debe_cambiar_password: true
      });

      const client = await pool.connect();
      try {
        const rolEstudiante = await RegistroCompletoController.obtenerRolPorNombre('estudiante', client);
        if (rolEstudiante) {
          await client.query(
            'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
            [usuario.id, rolEstudiante.id]
          );
        }
      } finally {
        client.release();
      }

      await Estudiante.update(id, {
        usuario_id: usuario.id
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear_usuario_estudiante',
        modulo: 'estudiante',
        tabla_afectada: 'usuarios',
        registro_id: usuario.id,
        datos_nuevos: { estudiante_id: id, usuario_id: usuario.id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Usuario creado para estudiante ${id}`
      });

      res.status(201).json({
        success: true,
        message: 'Usuario creado exitosamente',
        data: {
          usuario: {
            id: usuario.id,
            username: finalUsername,
            password_temporal: finalPassword,
            email: finalEmail,
            debe_cambiar_password: true
          }
        }
      });
    } catch (error) {
      console.error('Error al crear usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear usuario: ' + error.message
      });
    }
  }

  /**
   * Crear usuario para tutor existente
   */
  static async crearUsuarioTutor(req, res) {
    try {
      const { id } = req.params;
      const { username, password, email } = req.body;

      const tutor = await PadreFamilia.findById(id);
      if (!tutor) {
        return res.status(404).json({
          success: false,
          message: 'Tutor no encontrado'
        });
      }

      if (tutor.usuario_id) {
        return res.status(409).json({
          success: false,
          message: 'El tutor ya tiene un usuario asignado'
        });
      }

      const finalUsername = username || RegistroCompletoController.generarUsername(tutor.nombres, tutor.apellido_paterno);
      const finalPassword = password || RegistroCompletoController.generarPassword(tutor.ci); 
      const finalEmail = email || tutor.email || `${finalUsername}@padre.edu.bo`;

      const usuarioExiste = await Usuario.findByCredential(finalUsername);
      if (usuarioExiste) {
        return res.status(409).json({
          success: false,
          message: 'El nombre de usuario ya existe'
        });
      }

      const usuario = await Usuario.create({
        username: finalUsername,
        email: finalEmail,
        password: finalPassword,
        activo: true,
        verificado: false,
        debe_cambiar_password: true
      });

      const client = await pool.connect();
      try {
        const rolPadre = await RegistroCompletoController.obtenerRolPorNombre('padre_familia', client);
        if (rolPadre) {
          await client.query(
            'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
            [usuario.id, rolPadre.id]
          );
        }
      } finally {
        client.release();
      }

      await PadreFamilia.update(id, {
        usuario_id: usuario.id
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear_usuario_tutor',
        modulo: 'padre_familia',
        tabla_afectada: 'usuarios',
        registro_id: usuario.id,
        datos_nuevos: { tutor_id: id, usuario_id: usuario.id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Usuario creado para tutor ${id}`
      });

      res.status(201).json({
        success: true,
        message: 'Usuario creado exitosamente',
        data: {
          usuario: {
            id: usuario.id,
            username: finalUsername,
            password_temporal: finalPassword,
            email: finalEmail,
            debe_cambiar_password: true
          }
        }
      });
    } catch (error) {
      console.error('Error al crear usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear usuario: ' + error.message
      });
    }
  }

  // ========================================
  // MÉTODOS AUXILIARES
  // ========================================
  
  // ========================================
// MÉTODOS AUXILIARES - MODIFICADOS
// ========================================

static generarUsername(nombres, apellido) {
  // Tomar primer nombre y primer apellido, sin espacios ni caracteres especiales
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
  
  // Capitalizar primera letra de cada parte
  const nombreCapital = nombreLimpio.charAt(0).toUpperCase() + nombreLimpio.slice(1);
  const apellidoCapital = apellidoLimpio.charAt(0).toUpperCase() + apellidoLimpio.slice(1);
  
  return `${nombreCapital}${apellidoCapital}`;
}

static generarPassword(ci = null) {
  // Si viene CI, usarlo como contraseña
  if (ci) {
    return ci.toString();
  }
  
  // Si no hay CI, generar contraseña aleatoria de 8 dígitos
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

  static async obtenerRolPorNombre(nombre, client) {
    const query = 'SELECT * FROM roles WHERE nombre = $1 LIMIT 1';
    const result = await client.query(query, [nombre]);
    return result.rows[0];
  }
}

export default RegistroCompletoController;