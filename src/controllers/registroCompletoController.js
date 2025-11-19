import { pool } from '../db/pool.js';
import { Estudiante, PadreFamilia, EstudianteTutor } from '../models/Estudiantes.js';
import Usuario from '../models/Usuario.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';
import TokenUtils from '../utils/tokenUtils.js';

class RegistroCompletoController {
  /**
   * Registro completo en un solo endpoint
   * Crea: Estudiante + Tutores + Usuarios (opcional)
   */
  static async registroCompleto(req, res) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        // Datos del estudiante
        estudiante,
        // Array de tutores
        tutores,
        // Configuración de usuarios
        crear_usuario_estudiante,
        crear_usuarios_tutores,
        // Credenciales opcionales
        credenciales_estudiante,
        credenciales_tutores
      } = req.body;

      // ========================================
      // VALIDACIONES INICIALES
      // ========================================
      if (!estudiante || !estudiante.nombres || !estudiante.apellido_paterno || !estudiante.fecha_nacimiento) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Los datos del estudiante son incompletos'
        });
      }

      if (!tutores || tutores.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar al menos un tutor'
        });
      }

      // ========================================
      // 1. PROCESAR FOTO DEL ESTUDIANTE
      // ========================================
      let foto_url = null;
      if (req.file) {
        if (!UploadImage.isValidImage(req.file) || !UploadImage.isValidSize(req.file, 5)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Imagen inválida o muy grande (máx 5MB)'
          });
        }

        try {
          const uploadResult = await UploadImage.uploadFromBuffer(
            req.file.buffer,
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
      // 2. CREAR USUARIO PARA ESTUDIANTE (OPCIONAL)
      // ========================================
      let estudiante_usuario_id = null;
      let estudiante_username = null;
      let estudiante_password_temporal = null;

      if (crear_usuario_estudiante) {
        // Generar credenciales si no se proporcionaron
        if (!credenciales_estudiante || !credenciales_estudiante.username || !credenciales_estudiante.password) {
          // Generar username automático
          estudiante_username = this.generarUsername(estudiante.nombres, estudiante.apellido_paterno);
          estudiante_password_temporal = this.generarPassword();
        } else {
          estudiante_username = credenciales_estudiante.username;
          estudiante_password_temporal = credenciales_estudiante.password;
        }

        // Verificar que el username no exista
        const usuarioExiste = await Usuario.findByCredential(estudiante_username);
        if (usuarioExiste) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `El nombre de usuario "${estudiante_username}" ya existe`
          });
        }

        // Crear usuario
        const email_estudiante = credenciales_estudiante?.email || 
          `${estudiante_username}@estudiante.edu.bo`;

        const usuarioEstudiante = await Usuario.create({
          username: estudiante_username,
          email: email_estudiante,
          password: estudiante_password_temporal,
          activo: true,
          verificado: false,
          debe_cambiar_password: true
        });

        estudiante_usuario_id = usuarioEstudiante.id;

        // Asignar rol de estudiante
        const rolEstudiante = await this.obtenerRolPorNombre('estudiante', client);
        if (rolEstudiante) {
          await client.query(
            'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
            [estudiante_usuario_id, rolEstudiante.id]
          );
        }
      }

      // ========================================
      // 3. CREAR ESTUDIANTE
      // ========================================
      // ========================================
// 3. CREAR ESTUDIANTE
// ========================================
let codigo_estudiante = estudiante.codigo;
if (!codigo_estudiante) {
  codigo_estudiante = await Estudiante.generateCode();
}

// Verificar CI si viene
if (estudiante.ci) {
  const ciExiste = await Estudiante.findByCI(estudiante.ci);
  if (ciExiste) {
    await client.query('ROLLBACK');
    return res.status(409).json({
      success: false,
      message: 'El CI del estudiante ya está registrado'
    });
  }
}

// Crear estudiante, aunque no haya usuario
const nuevoEstudiante = await Estudiante.create({
  usuario_id: estudiante_usuario_id || null,
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
});

// ========================================
// 4. CREAR TUTORES Y SUS USUARIOS
// ========================================
const tutoresCreados = [];
const credencialesTutores = [];

for (const [index, tutor] of tutores.entries()) {
  // Validar datos del tutor
  if (!tutor.nombres || !tutor.apellido_paterno || !tutor.ci || !tutor.telefono) {
    await client.query('ROLLBACK');
    return res.status(400).json({
      success: false,
      message: `Datos incompletos para el tutor #${index + 1}`
    });
  }

  // Verificar si el CI ya existe
  let tutorExistente = await PadreFamilia.findByCI(tutor.ci);
  let tutor_id;
  let tutor_usuario_id = null;

  if (tutorExistente) {
    tutor_id = tutorExistente.id;
    tutoresCreados.push(tutorExistente);
  } else {
    // Crear usuario solo si se solicita
    if (crear_usuarios_tutores) {
      const credencial_tutor = credenciales_tutores?.[index] || {};
      const tutor_username = credencial_tutor.username || this.generarUsername(tutor.nombres, tutor.apellido_paterno);
      const tutor_password_temporal = credencial_tutor.password || this.generarPassword();

      // Verificar username
      const usuarioTutorExiste = await Usuario.findByCredential(tutor_username);
      if (usuarioTutorExiste) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `El username "${tutor_username}" ya existe para el tutor #${index + 1}`
        });
      }

      const email_tutor = credencial_tutor.email || tutor.email || `${tutor_username}@padre.edu.bo`;
      const usuarioTutor = await Usuario.create({
        username: tutor_username,
        email: email_tutor,
        password: tutor_password_temporal,
        activo: true,
        verificado: false,
        debe_cambiar_password: true
      });

      tutor_usuario_id = usuarioTutor.id;

      // Asignar rol padre_familia
      const rolPadre = await this.obtenerRolPorNombre('padre_familia', client);
      if (rolPadre) {
        await client.query('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)', [tutor_usuario_id, rolPadre.id]);
      }

      // Guardar credenciales para respuesta
      credencialesTutores.push({
        nombre_completo: `${tutor.nombres} ${tutor.apellido_paterno}`,
        username: tutor_username,
        password: tutor_password_temporal,
        email: email_tutor
      });
    }

    // Crear tutor, aunque no tenga usuario
    const nuevoTutor = await PadreFamilia.create({
      usuario_id: tutor_usuario_id || null,
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
    });

    tutor_id = nuevoTutor.id;
    tutoresCreados.push(nuevoTutor);
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
  });
}


      // ========================================
      // COMMIT - TODO EXITOSO
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
          usuarios_creados: crear_usuario_estudiante || crear_usuarios_tutores
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Registro completo: ${nuevoEstudiante.nombres} ${nuevoEstudiante.apellido_paterno}`
      });

      // ========================================
      // RESPUESTA
      // ========================================
      const respuesta = {
        success: true,
        message: 'Registro completado exitosamente',
        data: {
          estudiante: {
            id: nuevoEstudiante.id,
            codigo: nuevoEstudiante.codigo,
            nombres: nuevoEstudiante.nombres,
            apellidos: `${nuevoEstudiante.apellido_paterno} ${nuevoEstudiante.apellido_materno || ''}`,
            foto_url: nuevoEstudiante.foto_url
          },
          tutores: tutoresCreados.map(t => ({
            id: t.id,
            nombres: t.nombres,
            apellidos: `${t.apellido_paterno} ${t.apellido_materno || ''}`,
            parentesco: t.parentesco,
            telefono: t.telefono
          }))
        }
      };

      // Agregar credenciales si se crearon usuarios
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
      if (req.file && foto_url) {
        const publicId = UploadImage.extractPublicIdFromUrl(foto_url);
        if (publicId) {
          try {
            await UploadImage.deleteImage(publicId);
          } catch (err) {
            console.error('Error al eliminar imagen tras fallo:', err);
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

      // Verificar que el estudiante exista
      const estudiante = await Estudiante.findById(id);
      if (!estudiante) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      // Verificar que no tenga usuario
      if (estudiante.usuario_id) {
        return res.status(409).json({
          success: false,
          message: 'El estudiante ya tiene un usuario asignado'
        });
      }

      // Generar credenciales si no vienen
      const finalUsername = username || this.generarUsername(estudiante.nombres, estudiante.apellido_paterno);
      const finalPassword = password || this.generarPassword();
      const finalEmail = email || `${finalUsername}@estudiante.edu.bo`;

      // Verificar username
      const usuarioExiste = await Usuario.findByCredential(finalUsername);
      if (usuarioExiste) {
        return res.status(409).json({
          success: false,
          message: 'El nombre de usuario ya existe'
        });
      }

      // Crear usuario
      const usuario = await Usuario.create({
        username: finalUsername,
        email: finalEmail,
        password: finalPassword,
        activo: true,
        verificado: false,
        debe_cambiar_password: true
      });

      // Asignar rol
      const client = await pool.connect();
      try {
        const rolEstudiante = await this.obtenerRolPorNombre('estudiante', client);
        if (rolEstudiante) {
          await client.query(
            'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
            [usuario.id, rolEstudiante.id]
          );
        }
      } finally {
        client.release();
      }

      // Actualizar estudiante con usuario_id
      await Estudiante.update(id, {
        ...estudiante,
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

      const finalUsername = username || this.generarUsername(tutor.nombres, tutor.apellido_paterno);
      const finalPassword = password || this.generarPassword();
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
        const rolPadre = await this.obtenerRolPorNombre('padre_familia', client);
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
        ...tutor,
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
  
  /**
   * Generar username automático
   */
  static generarUsername(nombres, apellido) {
    const nombreLimpio = nombres.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const apellidoLimpio = apellido.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const random = Math.floor(Math.random() * 9999);
    return `${nombreLimpio}.${apellidoLimpio}${random}`;
  }

  /**
   * Generar password temporal
   */
  static generarPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Obtener rol por nombre
   */
  static async obtenerRolPorNombre(nombre, client) {
    const query = 'SELECT * FROM roles WHERE nombre = $1 LIMIT 1';
    const result = await client.query(query, [nombre]);
    return result.rows[0];
  }
}

export default RegistroCompletoController;