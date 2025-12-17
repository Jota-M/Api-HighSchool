// controllers/registroCompletoController.js
import { pool } from '../db/pool.js';
import { Estudiante, PadreFamilia, EstudianteTutor } from '../models/Estudiantes.js';
import { Matricula } from '../models/Matricula.js';
import PadreFamiliaService from '../services/padreFamiliaService.js';
import Usuario from '../models/Usuario.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class RegistroCompletoController {
  /**
   * 🔍 Buscar padre por CI
   */
  static async buscarPadrePorCI(req, res) {
    try {
      const { ci } = req.params;

      if (!ci || ci.length < 4) {
        return res.status(400).json({
          success: false,
          message: 'CI inválido (mínimo 4 dígitos)'
        });
      }

      const resultado = await PadreFamiliaService.buscarPorCI(ci);

      if (!resultado.encontrado) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró un padre/tutor con ese CI',
          data: { encontrado: false }
        });
      }

      res.json({
        success: true,
        message: 'Padre encontrado',
        data: resultado
      });

    } catch (error) {
      console.error('Error al buscar padre:', error);
      res.status(500).json({
        success: false,
        message: 'Error al buscar padre: ' + error.message
      });
    }
  }

  /**
   * 📝 Registro completo con 3 modos:
   * - NUEVO: Nuevo padre + nuevo estudiante
   * - EXISTENTE: Padre existente + nuevo estudiante  
   * - MULTIPLE: Padre(s) + varios estudiantes hermanos
   */
  static async registroCompleto(req, res) {
    const client = await pool.connect();
    const fotos_urls = [];
    const documentos_urls = [];
    
    try {
      await client.query('BEGIN');
      
      // 1️⃣ PARSEAR DATOS SEGÚN MODO
      const modo = req.body.modo || 'nuevo';
      const padre_existente_id = req.body.padre_existente_id ? 
        parseInt(req.body.padre_existente_id) : null;
      
      console.log('📥 Modo de registro:', modo);
      console.log('📥 Padre existente ID:', padre_existente_id);

      // Helper para parsear JSON de forma segura
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

      // 2️⃣ PARSEAR ESTUDIANTES SEGÚN MODO
      let estudiantes = [];
      if (modo === 'multiple') {
        estudiantes = parseJSON(req.body.estudiantes, []);
      } else {
        const estudianteData = parseJSON(req.body.estudiante, null);
        estudiantes = estudianteData ? [estudianteData] : [];
      }

      // 3️⃣ PARSEAR TUTORES Y MATRICULAS
      const tutores = parseJSON(req.body.tutores, []);
      
      // 🔧 FIX: Parsear y limpiar objetos vacíos
      let matriculas = parseJSON(req.body.matriculas, modo === 'multiple' ? [] : null);
      
      // Si matriculas es un objeto vacío {}, convertirlo a null
      if (matriculas && typeof matriculas === 'object' && !Array.isArray(matriculas)) {
        if (Object.keys(matriculas).length === 0) {
          matriculas = null;
        }
      }
      
      const credenciales_estudiantes = parseJSON(
        req.body.credenciales_estudiantes, 
        modo === 'multiple' ? [] : null
      );
      const credenciales_tutores = parseJSON(req.body.credenciales_tutores, []);

      const crear_usuario_estudiante = req.body.crear_usuario_estudiante === 'true' || 
        req.body.crear_usuario_estudiante === true;
      const crear_usuarios_tutores = req.body.crear_usuarios_tutores === 'true' || 
        req.body.crear_usuarios_tutores === true;

      console.log('📥 Estudiantes a registrar:', estudiantes.length);
      console.log('📥 Tutores:', tutores.length);
      console.log('📥 Matriculas:', matriculas);

      // 4️⃣ VALIDACIONES SEGÚN MODO
      if (estudiantes.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar al menos un estudiante'
        });
      }

      // Validar cada estudiante
      for (const [idx, est] of estudiantes.entries()) {
        if (!est.nombres || !est.apellido_paterno || !est.fecha_nacimiento) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Estudiante #${idx + 1}: faltan datos obligatorios (nombres, apellido paterno, fecha de nacimiento)`
          });
        }
      }

      // Validar según modo
      if (modo === 'existente') {
        if (!padre_existente_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Debe proporcionar el ID del padre existente'
          });
        }

        const padreExiste = await PadreFamilia.findById(padre_existente_id, client);
        if (!padreExiste) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            message: 'El padre especificado no existe'
          });
        }
      } else {
        if (!tutores || !Array.isArray(tutores) || tutores.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Debe proporcionar al menos un tutor'
          });
        }

        for (const [idx, tutor] of tutores.entries()) {
          if (!tutor.nombres || !tutor.apellido_paterno || !tutor.ci) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `Tutor #${idx + 1}: faltan datos obligatorios (nombres, apellido paterno, CI)`
            });
          }
        }
      }

      // 5️⃣ PROCESAR TUTORES
      const tutoresCreados = [];
      const credencialesTutoresGeneradas = [];

      if (modo === 'existente') {
        const padreExistente = await PadreFamilia.findById(padre_existente_id, client);
        tutoresCreados.push(padreExistente);
      } else {
        for (const [index, tutor] of tutores.entries()) {
          let tutorExistente = await PadreFamilia.findByCI(tutor.ci, client);
          let tutor_id;
          let tutor_usuario_id = null;

          if (tutorExistente) {
            tutor_id = tutorExistente.id;
            tutor_usuario_id = tutorExistente.usuario_id;
            tutoresCreados.push(tutorExistente);
            console.log(`✅ Tutor existente encontrado: ${tutorExistente.id}`);
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
            console.log(`✅ Nuevo tutor creado: ${nuevoTutor.id}`);

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
                  message: `El username "${tutor_username}" ya existe`
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

              const rolPadre = await RegistroCompletoController.obtenerRolPorNombre('padre', client); // ← Cambiar aquí
                if (rolPadre) {
                  await client.query(
                    'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
                    [tutor_usuario_id, rolPadre.id]
                  );
                  console.log(`✅ Rol "padre" asignado al usuario ${tutor_usuario_id}`);
              }

              await client.query(
                'UPDATE padre_familia SET usuario_id = $1, updated_at = NOW() WHERE id = $2',
                [tutor_usuario_id, tutor_id]
              );

              const tutorIndex = tutoresCreados.findIndex(t => t.id === tutor_id);
              if (tutorIndex !== -1) {
                tutoresCreados[tutorIndex].usuario_id = tutor_usuario_id;
              }

              credencialesTutoresGeneradas.push({
                nombre_completo: `${tutor.nombres} ${tutor.apellido_paterno}`,
                username: tutor_username,
                password: tutor_password_temporal,
                email: email_tutor
              });
            }
          }
        }
      }

      // 6️⃣ PROCESAR ESTUDIANTES
      const estudiantesCreados = [];
      const credencialesEstudiantesGeneradas = [];
      const matriculasCreadas = [];

      for (let i = 0; i < estudiantes.length; i++) {
        const estudiante = estudiantes[i];
        
        // 📸 Procesar foto
        let foto_url = null;
        const fotoKey = modo === 'multiple' ? `foto_${i}` : 'foto';
        
        if (req.files && req.files[fotoKey] && req.files[fotoKey][0]) {
          const fotoFile = req.files[fotoKey][0];
          
          if (!UploadImage.isValidImage(fotoFile) || !UploadImage.isValidSize(fotoFile, 5)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `Imagen inválida para estudiante #${i + 1} (máx 5MB)`
            });
          }

          const uploadResult = await UploadImage.uploadFromBuffer(
            fotoFile.buffer,
            'estudiantes',
            `estudiante_${Date.now()}_${i}`
          );
          foto_url = uploadResult.url;
          fotos_urls.push(foto_url);
        }

        // Generar código
        let codigo_estudiante = estudiante.codigo;
        if (!codigo_estudiante) {
          codigo_estudiante = await Estudiante.generateCodeWithLock(client);
        }

        // Verificar CI
        if (estudiante.ci) {
          const ciExiste = await Estudiante.findByCI(estudiante.ci, client);
          if (ciExiste) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              success: false,
              message: `El CI ${estudiante.ci} ya está registrado`
            });
          }
        }

        // Verificar código
        const codigoExiste = await Estudiante.findByCode(codigo_estudiante, client);
        if (codigoExiste) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `El código "${codigo_estudiante}" ya existe`
          });
        }

        // Crear estudiante
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

        console.log(`✅ Estudiante creado: ${nuevoEstudiante.id} - ${nuevoEstudiante.codigo}`);

        // Crear usuario para estudiante
        let estudiante_usuario_id = null;
        let estudiante_username = null;
        let estudiante_password_temporal = null;

        if (crear_usuario_estudiante) {
          const cred_est = modo === 'multiple' ? credenciales_estudiantes?.[i] : credenciales_estudiantes;
          
          if (!cred_est || !cred_est.username || !cred_est.password) {
            estudiante_username = RegistroCompletoController.generarUsername(
              estudiante.nombres,
              estudiante.apellido_paterno
            );
            estudiante_password_temporal = RegistroCompletoController.generarPassword(estudiante.ci);
          } else {
            estudiante_username = cred_est.username;
            estudiante_password_temporal = cred_est.password;
          }

          const usuarioExiste = await Usuario.findByUsername(estudiante_username, client);
          if (usuarioExiste) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              success: false,
              message: `El username "${estudiante_username}" ya existe`
            });
          }

          const email_estudiante = cred_est?.email || estudiante.email || 
            `${estudiante_username}@estudiante.edu.bo`;

          const usuarioEstudiante = await Usuario.create({
            username: estudiante_username,
            email: email_estudiante,
            password: estudiante_password_temporal,
            activo: true,
            verificado: false,
            debe_cambiar_password: true
          }, client);

          estudiante_usuario_id = usuarioEstudiante.id;

          const rolEstudiante = await RegistroCompletoController.obtenerRolPorNombre('estudiante', client);
          if (rolEstudiante) {
            await client.query(
              'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
              [estudiante_usuario_id, rolEstudiante.id]
            );
          }

          await client.query(
            'UPDATE estudiante SET usuario_id = $1, updated_at = NOW() WHERE id = $2',
            [estudiante_usuario_id, nuevoEstudiante.id]
          );

          nuevoEstudiante.usuario_id = estudiante_usuario_id;

          credencialesEstudiantesGeneradas.push({
            nombre_completo: `${estudiante.nombres} ${estudiante.apellido_paterno}`,
            username: estudiante_username,
            password: estudiante_password_temporal,
            email: email_estudiante
          });
        }

        // Relacionar con tutores
        for (const [tutorIndex, tutorCreado] of tutoresCreados.entries()) {
          await EstudianteTutor.assign({
            estudiante_id: nuevoEstudiante.id,
            padre_familia_id: tutorCreado.id,
            es_tutor_principal: tutorIndex === 0,
            vive_con_estudiante: true,
            autorizado_recoger: true,
            puede_autorizar_salidas: true,
            recibe_notificaciones: true,
            prioridad_contacto: tutorIndex + 1,
            observaciones: null
          }, client);
        }

        estudiantesCreados.push(nuevoEstudiante);

        // 🎓 CREAR MATRÍCULA (FIX MEJORADO)
        const matriculaData = modo === 'multiple' ? matriculas?.[i] : matriculas;
        
        console.log(`📋 Procesando matrícula para estudiante ${i}:`, matriculaData);
        
        // 🔧 FIX: Validar que matriculaData sea un objeto válido con datos
        if (matriculaData && 
            typeof matriculaData === 'object' && 
            Object.keys(matriculaData).length > 0 &&
            matriculaData.paralelo_id && 
            matriculaData.periodo_academico_id) {
          
          const numero_matricula = matriculaData.numero_matricula || 
            await Matricula.generateNumeroMatricula(matriculaData.periodo_academico_id, client);

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
            matriculaData.paralelo_id,
            matriculaData.periodo_academico_id,
            numero_matricula,
            matriculaData.fecha_matricula || new Date(),
            'activo',
            matriculaData.es_repitente ?? false,
            matriculaData.es_becado ?? false,
            matriculaData.porcentaje_beca,
            matriculaData.tipo_beca,
            matriculaData.observaciones
          ]);

          const matriculaCreada = matriculaResult.rows[0];
          matriculasCreadas.push(matriculaCreada);
          console.log(`✅ Matrícula creada: ${matriculaCreada.numero_matricula}`);

          // 📄 PROCESAR DOCUMENTOS (asociados a la matrícula)
          // En modo múltiple, solo procesar documentos del estudiante actual
          if (req.files && req.files['documentos']) {
            const documentosMetadata = parseJSON(req.body.documentos_metadata, []);
            const documentosArchivos = req.files['documentos'];
            
            console.log(`📄 Procesando documentos para estudiante ${i} (matrícula ${matriculaCreada.id})`);
            
            for (let docIdx = 0; docIdx < documentosArchivos.length; docIdx++) {
              const docFile = documentosArchivos[docIdx];
              const metadata = documentosMetadata[docIdx] || {};
              
              // En modo múltiple, verificar si este documento es para este estudiante
              if (modo === 'multiple' && metadata.estudiante_index !== undefined && metadata.estudiante_index !== i) {
                console.log(`⏭️ Documento ${docFile.originalname} es para otro estudiante (${metadata.estudiante_index})`);
                continue;
              }
              
              try {
                // Validar tamaño (máx 10MB)
                if (docFile.size > 10 * 1024 * 1024) {
                  console.warn(`⚠️ Documento muy grande, saltando: ${docFile.originalname}`);
                  continue;
                }

                const uploadResult = await UploadImage.uploadFromBuffer(
                  docFile.buffer,
                  'documentos',
                  `doc_matricula_${matriculaCreada.id}_${Date.now()}_${docFile.originalname}`
                );

                documentos_urls.push(uploadResult.url);

                // Insertar en tabla matricula_documento
                await client.query(`
                  INSERT INTO matricula_documento (
                    matricula_id, tipo_documento, nombre_archivo, 
                    url_archivo, verificado, observaciones, created_at
                  )
                  VALUES ($1, $2, $3, $4, $5, $6, NOW())
                `, [
                  matriculaCreada.id,
                  metadata.tipo_documento || 'otro',
                  docFile.originalname,
                  uploadResult.url,
                  false,
                  metadata.observaciones || `Tamaño: ${(docFile.size / 1024).toFixed(2)} KB`
                ]);

                console.log(`✅ Documento guardado: ${docFile.originalname} para estudiante ${i}`);
              } catch (err) {
                console.error(`❌ Error al procesar documento ${docFile.originalname}:`, err);
                // No abortamos la transacción, solo logueamos
              }
            }
          }
        } else {
          console.log(`⚠️ Sin datos de matrícula para estudiante ${i}`);
        }
      }

      // 7️⃣ COMMIT
      await client.query('COMMIT');

      // Registrar actividad
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: `registro_completo_${modo}`,
        modulo: 'estudiante',
        tabla_afectada: 'estudiante',
        registro_id: estudiantesCreados[0].id,
        datos_nuevos: {
          modo,
          estudiantes_count: estudiantesCreados.length,
          tutores_count: tutoresCreados.length,
          matriculas_count: matriculasCreadas.length,
          documentos_count: documentos_urls.length
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Registro ${modo}: ${estudiantesCreados.length} estudiante(s), ${documentos_urls.length} documento(s)`
      });

      // 8️⃣ RESPUESTA
      res.status(201).json({
        success: true,
        message: `Registro completado exitosamente: ${estudiantesCreados.length} estudiante(s)`,
        data: {
          modo,
          estudiantes: estudiantesCreados.map(e => ({
            id: e.id,
            codigo: e.codigo,
            nombres: e.nombres,
            apellidos: `${e.apellido_paterno} ${e.apellido_materno || ''}`.trim(),
            foto_url: e.foto_url,
            usuario_id: e.usuario_id
          })),
          tutores: tutoresCreados.map(t => ({
            id: t.id,
            nombres: t.nombres,
            apellidos: `${t.apellido_paterno} ${t.apellido_materno || ''}`.trim(),
            telefono: t.telefono,
            usuario_id: t.usuario_id
          })),
          matriculas: matriculasCreadas.map(m => ({
            id: m.id,
            numero_matricula: m.numero_matricula,
            estado: m.estado
          })),
          documentos_guardados: documentos_urls.length,
          credenciales_estudiantes: credencialesEstudiantesGeneradas,
          credenciales_tutores: credencialesTutoresGeneradas
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error en registro completo:', error);

      // Limpiar archivos subidos
      for (const url of [...fotos_urls, ...documentos_urls]) {
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
        message: 'Error en el registro: ' + error.message
      });
    } finally {
      client.release();
    }
  }

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
    if (ci) return ci.toString();
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  static async obtenerRolPorNombre(nombre, client) {
    const query = 'SELECT * FROM roles WHERE nombre = $1 LIMIT 1';
    const result = await client.query(query, [nombre]);
    return result.rows[0];
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

      const finalUsername = username || RegistroCompletoController.generarUsername(
        estudiante.nombres, 
        estudiante.apellido_paterno
      );
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

      await Estudiante.update(id, { usuario_id: usuario.id });

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

      const finalUsername = username || RegistroCompletoController.generarUsername(
        tutor.nombres, 
        tutor.apellido_paterno
      );
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
        const rolPadre = await RegistroCompletoController.obtenerRolPorNombre('padre', client); // ← Cambiar aquí
          if (rolPadre) {
            await client.query(
              'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
              [usuario.id, rolPadre.id]
            );
            console.log(`✅ Rol "padre" asignado al usuario ${usuario.id}`); // ← Log opcional
        }
      } finally {
        client.release();
      }

      await PadreFamilia.update(id, { usuario_id: usuario.id });

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
}

export default RegistroCompletoController;