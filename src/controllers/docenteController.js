// controllers/docenteController.js
import { pool } from '../db/pool.js';
import Docente from '../models/Docente.js';
import AsignacionDocente from '../models/AsignacionDocente.js';
import Usuario from '../models/Usuario.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class DocenteController {
  // ========================================
  // REGISTRO COMPLETO DE DOCENTE
  // ========================================
  static async registroCompleto(req, res) {
  const client = await pool.connect();
  let foto_url = null;
  let cv_url = null;

  try {
    await client.query('BEGIN');

    const { docente, crear_usuario, credenciales } = req.body;

    // ========================================
    // VALIDACIONES
    // ========================================
    if (!docente || !docente.nombres || !docente.apellido_paterno || !docente.ci) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Datos del docente incompletos (nombres, apellido_paterno y ci son requeridos)'
      });
    }

    // Verificar CI único
    const ciExiste = await Docente.findByCI(docente.ci, client);
    if (ciExiste) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Ya existe un docente con ese CI'
      });
    }

    // ========================================
    // 1. PROCESAR ARCHIVOS
    // ========================================
    if (req.files) {
      // FOTO
      if (req.files.foto && req.files.foto[0]) {
        const fotoFile = req.files.foto[0];
        
        if (!fotoFile.mimetype.startsWith('image/')) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'El archivo de foto debe ser una imagen válida'
          });
        }

        if (fotoFile.size > 5 * 1024 * 1024) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'La foto no debe superar los 5MB'
          });
        }

        try {
          const uploadResult = await UploadImage.uploadFromBuffer(
            fotoFile.buffer, 
            'docentes', 
            `docente_foto_${Date.now()}`
          );
          foto_url = uploadResult.url;
        } catch (error) {
          await client.query('ROLLBACK');
          return res.status(500).json({
            success: false,
            message: 'Error al subir la foto: ' + error.message
          });
        }
      }

      // CV
      if (req.files.cv && req.files.cv[0]) {
        const cvFile = req.files.cv[0];
        
        const allowedTypes = [
          'application/pdf', 
          'application/msword', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        
        if (!allowedTypes.includes(cvFile.mimetype)) {
          await client.query('ROLLBACK');
          if (foto_url) await DocenteController.limpiarArchivo(foto_url);
          return res.status(400).json({
            success: false,
            message: 'El CV debe ser PDF o documento Word (.doc, .docx)'
          });
        }

        if (cvFile.size > 10 * 1024 * 1024) {
          await client.query('ROLLBACK');
          if (foto_url) await DocenteController.limpiarArchivo(foto_url);
          return res.status(400).json({
            success: false,
            message: 'El CV no debe superar los 10MB'
          });
        }

        try {
          const uploadResult = await UploadImage.uploadFromBuffer(
            cvFile.buffer, 
            'docentes_cv', 
            `docente_cv_${Date.now()}`
          );
          cv_url = uploadResult.url;
        } catch (error) {
          await client.query('ROLLBACK');
          if (foto_url) await DocenteController.limpiarArchivo(foto_url);
          return res.status(500).json({
            success: false,
            message: 'Error al subir el CV: ' + error.message
          });
        }
      }
    }

    // ========================================
    // 2. GENERAR CÓDIGO Y CREAR DOCENTE
    // ========================================
    let codigo = docente.codigo;
    if (!codigo) {
      codigo = await Docente.generateCodeWithLock(client);
    } else {
      const codigoExiste = await Docente.findByCode(codigo, client);
      if (codigoExiste) {
        await client.query('ROLLBACK');
        if (foto_url) await DocenteController.limpiarArchivo(foto_url);
        if (cv_url) await DocenteController.limpiarArchivo(cv_url);
        return res.status(409).json({
          success: false,
          message: `El código "${codigo}" ya existe`
        });
      }
    }

    const nuevoDocente = await Docente.create({
      usuario_id: null,
      codigo,
      nombres: docente.nombres,
      apellido_paterno: docente.apellido_paterno,
      apellido_materno: docente.apellido_materno,
      ci: docente.ci,
      fecha_nacimiento: docente.fecha_nacimiento,
      genero: docente.genero,
      telefono: docente.telefono,
      celular: docente.celular,
      email: docente.email,
      direccion: docente.direccion,
      titulo_profesional: docente.titulo_profesional,
      titulo_postgrado: docente.titulo_postgrado,
      especialidad: docente.especialidad,
      salario_mensual: docente.salario_mensual,
      numero_cuenta: docente.numero_cuenta,
      fecha_contratacion: docente.fecha_contratacion || new Date(),
      tipo_contrato: docente.tipo_contrato || 'contrato',
      foto_url,
      cv_url,
      nivel_formacion: docente.nivel_formacion,
      experiencia_anios: docente.experiencia_anios,
      activo: true
    }, client);

    // ========================================
    // 3. CREAR USUARIO (OPCIONAL)
    // ========================================
    let usuario_id = null;
    let username = null;
    let password_temporal = null;

    if (crear_usuario) {
      username = credenciales?.username || 
        DocenteController.generarUsername(docente.nombres, docente.apellido_paterno);
        password_temporal = credenciales?.password || 
        DocenteController.generarPassword(docente.ci);

      const usuarioExiste = await Usuario.findByUsername(username, client);
      if (usuarioExiste) {
        await client.query('ROLLBACK');
        if (foto_url) await DocenteController.limpiarArchivo(foto_url);
        if (cv_url) await DocenteController.limpiarArchivo(cv_url);
        
        return res.status(409).json({
          success: false,
          message: `El username "${username}" ya existe`
        });
      }

      const email_usuario = credenciales?.email || docente.email || 
        `${username}@docente.edu.bo`;

      const usuarioDocente = await Usuario.create({
        username,
        email: email_usuario,
        password: password_temporal,
        activo: true,
        verificado: false,
        debe_cambiar_password: true
      }, client);

      usuario_id = usuarioDocente.id;

      // Asignar rol de docente
      const rolDocente = await DocenteController.obtenerRolPorNombre('docente', client);
      if (rolDocente) {
        await client.query(
          'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
          [usuario_id, rolDocente.id]
        );
      }

      // Actualizar docente con usuario_id
      await client.query(
        'UPDATE docente SET usuario_id = $1, updated_at = NOW() WHERE id = $2',
        [usuario_id, nuevoDocente.id]
      );
      nuevoDocente.usuario_id = usuario_id;
    }

    // ========================================
    // 4. COMMIT
    // ========================================
    await client.query('COMMIT');

    // Registrar actividad
    const reqInfo = RequestInfo.extract(req);
    await ActividadLog.create({
      usuario_id: req.user.id,
      accion: 'registro_completo',
      modulo: 'docente',
      tabla_afectada: 'docente',
      registro_id: nuevoDocente.id,
      datos_nuevos: {
        docente: nuevoDocente,
        usuario_creado: !!usuario_id
      },
      ip_address: reqInfo.ip,
      user_agent: reqInfo.userAgent,
      resultado: 'exitoso',
      mensaje: `Docente registrado: ${nuevoDocente.nombres} ${nuevoDocente.apellido_paterno}`
    });

    // ========================================
    // RESPUESTA
    // ========================================
    const respuesta = {
      success: true,
      message: 'Docente registrado exitosamente' +
        (usuario_id ? ' con usuario de acceso' : ''),
      data: {
        docente: {
          id: nuevoDocente.id,
          codigo: nuevoDocente.codigo,
          nombres: nuevoDocente.nombres,
          apellidos: `${nuevoDocente.apellido_paterno} ${nuevoDocente.apellido_materno || ''}`.trim(),
          ci: nuevoDocente.ci,
          email: nuevoDocente.email,
          especialidad: nuevoDocente.especialidad,
          foto_url: nuevoDocente.foto_url,
          cv_url: nuevoDocente.cv_url,
          usuario_id: nuevoDocente.usuario_id
        }
      }
    };

    if (crear_usuario && username) {
      respuesta.data.credenciales = {
        username,
        password: password_temporal,
        debe_cambiar_password: true
      };
    }

    res.status(201).json(respuesta);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en registro de docente:', error);

    // Limpiar archivos subidos
    if (foto_url) await DocenteController.limpiarArchivo(foto_url);
    if (cv_url) await DocenteController.limpiarArchivo(cv_url);

    res.status(500).json({
      success: false,
      message: 'Error en registro de docente: ' + error.message
    });
  } finally {
    client.release();
  }
}

  // ========================================
  // ACTUALIZAR DOCENTE
  // ========================================
  static async actualizar(req, res) {
    let foto_url_nueva = null;
    let cv_url_nuevo = null;

    try {
      const { id } = req.params;
      const data = req.body;

      const docenteExistente = await Docente.findById(id);
      if (!docenteExistente) {
        return res.status(404).json({
          success: false,
          message: 'Docente no encontrado'
        });
      }

      // ========================================
      // PROCESAR ARCHIVOS
      // ========================================
      if (req.files) {
        // NUEVA FOTO
        if (req.files.foto && req.files.foto[0]) {
          const fotoFile = req.files.foto[0];
          
          if (!fotoFile.mimetype.startsWith('image/')) {
            return res.status(400).json({
              success: false,
              message: 'El archivo de foto debe ser una imagen válida'
            });
          }

          if (fotoFile.size > 5 * 1024 * 1024) {
            return res.status(400).json({
              success: false,
              message: 'La foto no debe superar los 5MB'
            });
          }

          try {
            const uploadResult = await UploadImage.uploadFromBuffer(
              fotoFile.buffer, 
              'docentes', 
              `docente_foto_${id}_${Date.now()}`
            );
            foto_url_nueva = uploadResult.url;
            data.foto_url = foto_url_nueva;
            console.log('✅ Nueva foto subida:', foto_url_nueva);

            // Eliminar foto anterior
            if (docenteExistente.foto_url) {
              await DocenteController.limpiarArchivo(docenteExistente.foto_url);
            }
          } catch (error) {
            console.error('Error subiendo foto:', error);
            return res.status(500).json({
              success: false,
              message: 'Error al subir la foto: ' + error.message
            });
          }
        }

        // NUEVO CV
        if (req.files.cv && req.files.cv[0]) {
          const cvFile = req.files.cv[0];
          
          const allowedTypes = [
            'application/pdf', 
            'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ];
          
          if (!allowedTypes.includes(cvFile.mimetype)) {
            // Limpiar foto si ya se subió
            if (foto_url_nueva) await DocenteController.limpiarArchivo(foto_url_nueva);
            
            return res.status(400).json({
              success: false,
              message: 'El CV debe ser PDF o documento Word (.doc, .docx)'
            });
          }

          if (cvFile.size > 10 * 1024 * 1024) {
            if (foto_url_nueva) await DocenteController.limpiarArchivo(foto_url_nueva);
            
            return res.status(400).json({
              success: false,
              message: 'El CV no debe superar los 10MB'
            });
          }

          try {
            const uploadResult = await UploadImage.uploadFromBuffer(
              cvFile.buffer, 
              'docentes_cv', 
              `docente_cv_${id}_${Date.now()}`
            );
            cv_url_nuevo = uploadResult.url;
            data.cv_url = cv_url_nuevo;
            console.log('✅ Nuevo CV subido:', cv_url_nuevo);

            // Eliminar CV anterior
            if (docenteExistente.cv_url) {
              await DocenteController.limpiarArchivo(docenteExistente.cv_url);
            }
          } catch (error) {
            console.error('Error subiendo CV:', error);
            // Limpiar foto si ya se subió
            if (foto_url_nueva) await DocenteController.limpiarArchivo(foto_url_nueva);
            
            return res.status(500).json({
              success: false,
              message: 'Error al subir el CV: ' + error.message
            });
          }
        }
      }

      const docente = await Docente.update(id, data);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'docente',
        tabla_afectada: 'docente',
        registro_id: docente.id,
        datos_anteriores: docenteExistente,
        datos_nuevos: docente,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Docente actualizado: ${docente.nombres} ${docente.apellido_paterno}`
      });

      res.json({
        success: true,
        message: 'Docente actualizado exitosamente',
        data: { docente }
      });
    } catch (error) {
      console.error('❌ Error al actualizar docente:', error);
      
      // Limpiar archivos en caso de error
      if (foto_url_nueva) await DocenteController.limpiarArchivo(foto_url_nueva);
      if (cv_url_nuevo) await DocenteController.limpiarArchivo(cv_url_nuevo);

      res.status(500).json({
        success: false,
        message: 'Error al actualizar docente: ' + error.message
      });
    }
  }

  // ========================================
  // LISTAR DOCENTES
  // ========================================
  static async listar(req, res) {
    try {
      const { page, limit, search, activo, tipo_contrato, especialidad } = req.query;

      const result = await Docente.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        activo: activo !== undefined ? activo === 'true' : undefined,
        tipo_contrato,
        especialidad
      });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error al listar docentes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar docentes: ' + error.message
      });
    }
  }

  // ========================================
  // OBTENER POR ID
  // ========================================
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const docente = await Docente.findById(id);

      if (!docente) {
        return res.status(404).json({
          success: false,
          message: 'Docente no encontrado'
        });
      }

      const estadisticas = await Docente.getEstadisticas(id);

      res.json({
        success: true,
        data: { docente, estadisticas }
      });
    } catch (error) {
      console.error('Error al obtener docente:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener docente: ' + error.message
      });
    }
  }

  // ========================================
  // ELIMINAR DOCENTE
  // ========================================
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const docente = await Docente.findById(id);
      if (!docente) {
        return res.status(404).json({
          success: false,
          message: 'Docente no encontrado'
        });
      }

      await Docente.softDelete(id);

      // Eliminar archivos asociados
      if (docente.foto_url) await DocenteController.limpiarArchivo(docente.foto_url);
      if (docente.cv_url) await DocenteController.limpiarArchivo(docente.cv_url);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'docente',
        tabla_afectada: 'docente',
        registro_id: parseInt(id),
        datos_anteriores: docente,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Docente eliminado: ${docente.nombres} ${docente.apellido_paterno}`
      });

      res.json({
        success: true,
        message: 'Docente eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar docente:', error);
      
      if (error.message.includes('asignaciones activas')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al eliminar docente: ' + error.message
      });
    }
  }

  // ========================================
  // CREAR USUARIO PARA DOCENTE EXISTENTE
  // ========================================
  static async crearUsuario(req, res) {
    try {
      const { id } = req.params;
      const { username, password, email } = req.body;

      const docente = await Docente.findById(id);
      if (!docente) {
        return res.status(404).json({
          success: false,
          message: 'Docente no encontrado'
        });
      }

      if (docente.usuario_id) {
        return res.status(409).json({
          success: false,
          message: 'El docente ya tiene un usuario asignado'
        });
      }

      const finalUsername = username || 
        DocenteController.generarUsername(docente.nombres, docente.apellido_paterno);
        const finalPassword = password || DocenteController.generarPassword(docente.ci); 
        const finalEmail = email || docente.email || `${finalUsername}@docente.edu.bo`;

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
        const rolDocente = await DocenteController.obtenerRolPorNombre('docente', client);
        if (rolDocente) {
          await client.query(
            'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
            [usuario.id, rolDocente.id]
          );
        }
      } finally {
        client.release();
      }

      await Docente.update(id, { usuario_id: usuario.id });

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

  static async limpiarArchivo(url) {
    try {
      const publicId = UploadImage.extractPublicIdFromUrl(url);
      if (publicId) {
        await UploadImage.deleteImage(publicId);
        console.log('🗑️ Archivo eliminado:', publicId);
      }
    } catch (error) {
      console.error('Error al limpiar archivo:', error);
    }
  }
  static async obtenerEstadisticas(req, res) {
  try {
    // Total de docentes
    const totalQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE activo = true) as activos,
        COUNT(*) FILTER (WHERE activo = false) as inactivos
      FROM docente 
      WHERE deleted_at IS NULL
    `;
    const totalResult = await pool.query(totalQuery);
    const totales = totalResult.rows[0];

    // Por tipo de contrato
    const contratoQuery = `
      SELECT 
        tipo_contrato,
        COUNT(*) as cantidad
      FROM docente
      WHERE deleted_at IS NULL
      GROUP BY tipo_contrato
    `;
    const contratoResult = await pool.query(contratoQuery);
    const porTipoContrato = {
      planta: 0,
      contrato: 0,
      honorarios: 0,
      medio_tiempo: 0
    };
    contratoResult.rows.forEach(row => {
      if (row.tipo_contrato) {
        porTipoContrato[row.tipo_contrato] = parseInt(row.cantidad);
      }
    });

    // Por nivel de formación
    const formacionQuery = `
      SELECT 
        nivel_formacion,
        COUNT(*) as cantidad
      FROM docente
      WHERE deleted_at IS NULL
      GROUP BY nivel_formacion
    `;
    const formacionResult = await pool.query(formacionQuery);
    const porNivelFormacion = {
      bachiller: 0,
      licenciatura: 0,
      maestria: 0,
      doctorado: 0
    };
    formacionResult.rows.forEach(row => {
      if (row.nivel_formacion) {
        porNivelFormacion[row.nivel_formacion] = parseInt(row.cantidad);
      }
    });

    // Total de asignaciones y promedio
    const asignacionesQuery = `
      SELECT 
        COUNT(*) as total_asignaciones,
        COUNT(DISTINCT docente_id) as docentes_con_asignaciones,
        ROUND(AVG(asignaciones_por_docente), 1) as promedio_asignaciones
      FROM (
        SELECT 
          docente_id,
          COUNT(*) as asignaciones_por_docente
        FROM asignacion_docente
        WHERE activo = true AND deleted_at IS NULL
        GROUP BY docente_id
      ) subq
    `;
    const asignacionesResult = await pool.query(asignacionesQuery);
    const asignaciones = asignacionesResult.rows[0];

    // Por especialidad (top 5)
    const especialidadQuery = `
      SELECT 
        especialidad,
        COUNT(*) as cantidad
      FROM docente
      WHERE deleted_at IS NULL AND especialidad IS NOT NULL
      GROUP BY especialidad
      ORDER BY cantidad DESC
      LIMIT 5
    `;
    const especialidadResult = await pool.query(especialidadQuery);

    const estadisticas = {
      total_docentes: parseInt(totales.total),
      activos: parseInt(totales.activos),
      inactivos: parseInt(totales.inactivos),
      por_tipo_contrato: porTipoContrato,
      por_nivel_formacion: porNivelFormacion,
      total_asignaciones: parseInt(asignaciones.total_asignaciones || 0),
      promedio_asignaciones: parseFloat(asignaciones.promedio_asignaciones || 0),
      docentes_con_asignaciones: parseInt(asignaciones.docentes_con_asignaciones || 0),
      top_especialidades: especialidadResult.rows
    };

    res.json({
      success: true,
      data: { estadisticas }
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

export default DocenteController;