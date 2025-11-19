import { Estudiante, EstudianteTutor } from '../models/Estudiantes.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class EstudianteController {
  // Listar estudiantes
  static async listar(req, res) {
    try {
      const { page, limit, search, genero, activo, grado_id, paralelo_id } = req.query;

      const result = await Estudiante.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        genero,
        activo: activo !== undefined ? activo === 'true' : undefined,
        grado_id: grado_id ? parseInt(grado_id) : undefined,
        paralelo_id: paralelo_id ? parseInt(paralelo_id) : undefined
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al listar estudiantes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar estudiantes: ' + error.message
      });
    }
  }

  // Obtener estudiante por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const estudiante = await Estudiante.findById(id);

      if (!estudiante) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      // Obtener tutores
      const tutores = await Estudiante.getTutores(id);
      estudiante.tutores = tutores;

      res.json({
        success: true,
        data: { estudiante }
      });
    } catch (error) {
      console.error('Error al obtener estudiante:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estudiante: ' + error.message
      });
    }
  }

  // Crear estudiante
  static async crear(req, res) {
    try {
      const { nombres, apellido_paterno, fecha_nacimiento } = req.body;

      // Validaciones básicas
      if (!nombres || !apellido_paterno || !fecha_nacimiento) {
        return res.status(400).json({
          success: false,
          message: 'Nombres, apellido paterno y fecha de nacimiento son requeridos'
        });
      }

      let foto_url = null;

      // Manejar foto si viene en el request
      if (req.file) {
        if (!UploadImage.isValidImage(req.file)) {
          return res.status(400).json({
            success: false,
            message: 'El archivo debe ser una imagen válida (JPG, PNG, GIF, WEBP)'
          });
        }

        if (!UploadImage.isValidSize(req.file, 5)) {
          return res.status(400).json({
            success: false,
            message: 'La imagen es muy grande. Máximo 5MB'
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
          console.error('Error al subir imagen:', uploadError);
          return res.status(500).json({
            success: false,
            message: 'Error al subir la imagen: ' + uploadError.message
          });
        }
      }

      // Generar código si no viene
      let codigo = req.body.codigo;
      if (!codigo) {
        codigo = await Estudiante.generateCode();
      }

      // Verificar que el código no exista
      const codigoExiste = await Estudiante.findByCode(codigo);
      if (codigoExiste) {
        return res.status(409).json({
          success: false,
          message: 'El código de estudiante ya existe'
        });
      }

      // Verificar CI si viene
      if (req.body.ci) {
        const ciExiste = await Estudiante.findByCI(req.body.ci);
        if (ciExiste) {
          return res.status(409).json({
            success: false,
            message: 'El CI ya está registrado'
          });
        }
      }

      const estudiante = await Estudiante.create({
        ...req.body,
        codigo,
        foto_url
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'estudiante',
        tabla_afectada: 'estudiante',
        registro_id: estudiante.id,
        datos_nuevos: estudiante,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Estudiante creado: ${estudiante.nombres} ${estudiante.apellido_paterno}`
      });

      res.status(201).json({
        success: true,
        message: 'Estudiante creado exitosamente',
        data: { estudiante }
      });
    } catch (error) {
      console.error('Error al crear estudiante:', error);

      if (error.constraint === 'estudiante_codigo_key') {
        return res.status(409).json({
          success: false,
          message: 'El código ya está en uso'
        });
      }

      if (error.constraint === 'estudiante_ci_key') {
        return res.status(409).json({
          success: false,
          message: 'El CI ya está registrado'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear estudiante: ' + error.message
      });
    }
  }

  // Actualizar estudiante
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const estudianteExistente = await Estudiante.findById(id);
      if (!estudianteExistente) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      let foto_url = estudianteExistente.foto_url;

      // Manejar nueva foto
      if (req.file) {
        if (!UploadImage.isValidImage(req.file)) {
          return res.status(400).json({
            success: false,
            message: 'El archivo debe ser una imagen válida'
          });
        }

        if (!UploadImage.isValidSize(req.file, 5)) {
          return res.status(400).json({
            success: false,
            message: 'La imagen es muy grande. Máximo 5MB'
          });
        }

        try {
          // Eliminar foto anterior si existe
          if (estudianteExistente.foto_url) {
            const publicId = UploadImage.extractPublicIdFromUrl(estudianteExistente.foto_url);
            if (publicId) {
              await UploadImage.deleteImage(publicId);
            }
          }

          // Subir nueva foto
          const uploadResult = await UploadImage.uploadFromBuffer(
            req.file.buffer,
            'estudiantes',
            `estudiante_${id}_${Date.now()}`
          );

          foto_url = uploadResult.url;
        } catch (uploadError) {
          console.error('Error al actualizar imagen:', uploadError);
          return res.status(500).json({
            success: false,
            message: 'Error al actualizar la imagen: ' + uploadError.message
          });
        }
      }

      // Verificar CI si cambió
      if (req.body.ci && req.body.ci !== estudianteExistente.ci) {
        const ciExiste = await Estudiante.findByCI(req.body.ci);
        if (ciExiste) {
          return res.status(409).json({
            success: false,
            message: 'El CI ya está registrado'
          });
        }
      }

      const estudiante = await Estudiante.update(id, {
        ...req.body,
        foto_url
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'estudiante',
        tabla_afectada: 'estudiante',
        registro_id: estudiante.id,
        datos_anteriores: estudianteExistente,
        datos_nuevos: estudiante,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Estudiante actualizado: ${estudiante.nombres} ${estudiante.apellido_paterno}`
      });

      res.json({
        success: true,
        message: 'Estudiante actualizado exitosamente',
        data: { estudiante }
      });
    } catch (error) {
      console.error('Error al actualizar estudiante:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar estudiante: ' + error.message
      });
    }
  }

  // Eliminar estudiante
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const estudiante = await Estudiante.findById(id);
      if (!estudiante) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      // Eliminar foto de Cloudinary si existe
      if (estudiante.foto_url) {
        const publicId = UploadImage.extractPublicIdFromUrl(estudiante.foto_url);
        if (publicId) {
          try {
            await UploadImage.deleteImage(publicId);
          } catch (error) {
            console.error('Error al eliminar imagen de Cloudinary:', error);
            // Continuar con la eliminación aunque falle la imagen
          }
        }
      }

      await Estudiante.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'estudiante',
        tabla_afectada: 'estudiante',
        registro_id: parseInt(id),
        datos_anteriores: estudiante,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Estudiante eliminado: ${estudiante.nombres} ${estudiante.apellido_paterno}`
      });

      res.json({
        success: true,
        message: 'Estudiante eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar estudiante:', error);

      if (error.message.includes('matrículas activas')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al eliminar estudiante: ' + error.message
      });
    }
  }

  // Eliminar solo la foto
  static async eliminarFoto(req, res) {
    try {
      const { id } = req.params;

      const estudiante = await Estudiante.findById(id);
      if (!estudiante) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      if (!estudiante.foto_url) {
        return res.status(400).json({
          success: false,
          message: 'El estudiante no tiene foto'
        });
      }

      // Eliminar de Cloudinary
      const publicId = UploadImage.extractPublicIdFromUrl(estudiante.foto_url);
      if (publicId) {
        await UploadImage.deleteImage(publicId);
      }

      // Actualizar en BD
      await Estudiante.update(id, {
        ...estudiante,
        foto_url: null
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar_foto',
        modulo: 'estudiante',
        tabla_afectada: 'estudiante',
        registro_id: parseInt(id),
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Foto eliminada del estudiante ${id}`
      });

      res.json({
        success: true,
        message: 'Foto eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar foto:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar foto: ' + error.message
      });
    }
  }

  // Obtener tutores del estudiante
  static async obtenerTutores(req, res) {
    try {
      const { id } = req.params;
      const tutores = await Estudiante.getTutores(id);

      res.json({
        success: true,
        data: { tutores }
      });
    } catch (error) {
      console.error('Error al obtener tutores:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener tutores: ' + error.message
      });
    }
  }

  // Asignar tutor
  static async asignarTutor(req, res) {
    try {
      const { id } = req.params;
      const { padre_familia_id } = req.body;

      if (!padre_familia_id) {
        return res.status(400).json({
          success: false,
          message: 'El ID del tutor es requerido'
        });
      }

      // Verificar si ya existe
      const existe = await EstudianteTutor.exists(parseInt(id), padre_familia_id);
      if (existe) {
        return res.status(409).json({
          success: false,
          message: 'Este tutor ya está asignado al estudiante'
        });
      }

      const relacion = await EstudianteTutor.assign({
        estudiante_id: parseInt(id),
        ...req.body
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'asignar_tutor',
        modulo: 'estudiante',
        tabla_afectada: 'estudiante_tutor',
        registro_id: relacion.id,
        datos_nuevos: relacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Tutor asignado a estudiante ${id}`
      });

      res.status(201).json({
        success: true,
        message: 'Tutor asignado exitosamente',
        data: { relacion }
      });
    } catch (error) {
      console.error('Error al asignar tutor:', error);
      res.status(500).json({
        success: false,
        message: 'Error al asignar tutor: ' + error.message
      });
    }
  }

  // Actualizar relación tutor
  static async actualizarTutor(req, res) {
    try {
      const { id, relacion_id } = req.params;

      const relacionExistente = await EstudianteTutor.findById(relacion_id);
      if (!relacionExistente) {
        return res.status(404).json({
          success: false,
          message: 'Relación no encontrada'
        });
      }

      const relacion = await EstudianteTutor.update(relacion_id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar_tutor',
        modulo: 'estudiante',
        tabla_afectada: 'estudiante_tutor',
        registro_id: relacion.id,
        datos_anteriores: relacionExistente,
        datos_nuevos: relacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Relación tutor actualizada`
      });

      res.json({
        success: true,
        message: 'Relación actualizada exitosamente',
        data: { relacion }
      });
    } catch (error) {
      console.error('Error al actualizar relación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar relación: ' + error.message
      });
    }
  }

  // Remover tutor
  static async removerTutor(req, res) {
    try {
      const { id, relacion_id } = req.params;

      const relacion = await EstudianteTutor.findById(relacion_id);
      if (!relacion) {
        return res.status(404).json({
          success: false,
          message: 'Relación no encontrada'
        });
      }

      await EstudianteTutor.remove(relacion_id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'remover_tutor',
        modulo: 'estudiante',
        tabla_afectada: 'estudiante_tutor',
        registro_id: parseInt(relacion_id),
        datos_anteriores: relacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Tutor removido del estudiante ${id}`
      });

      res.json({
        success: true,
        message: 'Tutor removido exitosamente'
      });
    } catch (error) {
      console.error('Error al remover tutor:', error);
      res.status(500).json({
        success: false,
        message: 'Error al remover tutor: ' + error.message
      });
    }
  }
}

export default EstudianteController;