import { Matricula, MatriculaDocumento } from '../models/Matricula.js';
import { Estudiante } from '../models/Estudiantes.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class MatriculaController {
  // Listar matrículas
  static async listar(req, res) {
    try {
      const { 
        page, limit, search, periodo_academico_id, paralelo_id, 
        grado_id, nivel_academico_id, estado 
      } = req.query;

      const result = await Matricula.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        paralelo_id: paralelo_id ? parseInt(paralelo_id) : undefined,
        grado_id: grado_id ? parseInt(grado_id) : undefined,
        nivel_academico_id: nivel_academico_id ? parseInt(nivel_academico_id) : undefined,
        estado
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al listar matrículas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar matrículas: ' + error.message
      });
    }
  }

  // Obtener matrícula por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const matricula = await Matricula.findById(id);

      if (!matricula) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      // Obtener documentos
      const documentos = await MatriculaDocumento.findByMatricula(id);
      matricula.documentos = documentos;

      res.json({
        success: true,
        data: { matricula }
      });
    } catch (error) {
      console.error('Error al obtener matrícula:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener matrícula: ' + error.message
      });
    }
  }

  // Crear matrícula
  static async crear(req, res) {
    try {
      const { estudiante_id, paralelo_id, periodo_academico_id } = req.body;

      // Validaciones básicas
      if (!estudiante_id || !paralelo_id || !periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'Estudiante, paralelo y periodo académico son requeridos'
        });
      }

      // Verificar que el estudiante existe
      const estudiante = await Estudiante.findById(estudiante_id);
      if (!estudiante) {
        return res.status(404).json({
          success: false,
          message: 'Estudiante no encontrado'
        });
      }

      // Verificar que no tenga matrícula en este periodo
      const matriculaExistente = await Matricula.exists(estudiante_id, periodo_academico_id);
      if (matriculaExistente) {
        return res.status(409).json({
          success: false,
          message: 'El estudiante ya tiene una matrícula en este periodo académico'
        });
      }

      // Verificar capacidad del paralelo
      const capacidad = await Matricula.checkCapacidad(paralelo_id, periodo_academico_id);
      if (!capacidad.disponible) {
        return res.status(409).json({
          success: false,
          message: `El paralelo está lleno (${capacidad.matriculas_actuales}/${capacidad.capacidad_maxima})`
        });
      }

      // Generar número de matrícula si no viene
      let numero_matricula = req.body.numero_matricula;
      if (!numero_matricula) {
        numero_matricula = await Matricula.generateNumeroMatricula(periodo_academico_id);
      }

      // Crear matrícula
      const matricula = await Matricula.create({
        ...req.body,
        numero_matricula
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: matricula.id,
        datos_nuevos: matricula,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Matrícula creada: ${numero_matricula} para estudiante ${estudiante_id}`
      });

      res.status(201).json({
        success: true,
        message: 'Matrícula creada exitosamente',
        data: { matricula }
      });
    } catch (error) {
      console.error('Error al crear matrícula:', error);

      if (error.constraint === 'matricula_estudiante_id_periodo_academico_id_key') {
        return res.status(409).json({
          success: false,
          message: 'El estudiante ya tiene matrícula en este periodo'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear matrícula: ' + error.message
      });
    }
  }

  // Actualizar matrícula
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const matriculaExistente = await Matricula.findById(id);
      if (!matriculaExistente) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      // Si cambia de paralelo, verificar capacidad
      if (req.body.paralelo_id && req.body.paralelo_id !== matriculaExistente.paralelo_id) {
        const capacidad = await Matricula.checkCapacidad(
          req.body.paralelo_id, 
          matriculaExistente.periodo_academico_id
        );
        
        if (!capacidad.disponible) {
          return res.status(409).json({
            success: false,
            message: `El paralelo destino está lleno (${capacidad.matriculas_actuales}/${capacidad.capacidad_maxima})`
          });
        }
      }

      const matricula = await Matricula.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: matricula.id,
        datos_anteriores: matriculaExistente,
        datos_nuevos: matricula,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Matrícula actualizada: ${matricula.numero_matricula}`
      });

      res.json({
        success: true,
        message: 'Matrícula actualizada exitosamente',
        data: { matricula }
      });
    } catch (error) {
      console.error('Error al actualizar matrícula:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar matrícula: ' + error.message
      });
    }
  }

  // Cambiar estado de matrícula
  static async cambiarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado, motivo } = req.body;

      if (!estado) {
        return res.status(400).json({
          success: false,
          message: 'El estado es requerido'
        });
      }

      const estadosValidos = ['activo', 'retirado', 'trasladado', 'graduado', 'suspendido', 'congelado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: 'Estado no válido'
        });
      }

      const matriculaExistente = await Matricula.findById(id);
      if (!matriculaExistente) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      const matricula = await Matricula.changeStatus(id, estado, motivo);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cambiar_estado',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: matricula.id,
        datos_anteriores: { estado: matriculaExistente.estado },
        datos_nuevos: { estado: matricula.estado, motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Estado cambiado a: ${estado}`
      });

      res.json({
        success: true,
        message: 'Estado actualizado exitosamente',
        data: { matricula }
      });
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar estado: ' + error.message
      });
    }
  }

  // Eliminar matrícula
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      await Matricula.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: parseInt(id),
        datos_anteriores: matricula,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Matrícula eliminada: ${matricula.numero_matricula}`
      });

      res.json({
        success: true,
        message: 'Matrícula eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar matrícula:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar matrícula: ' + error.message
      });
    }
  }

  // Obtener estadísticas
  static async obtenerEstadisticas(req, res) {
    try {
      const { periodo_academico_id } = req.query;

      if (!periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'El periodo académico es requerido'
        });
      }

      const estadisticas = await Matricula.getEstadisticas(periodo_academico_id);

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

  // Listar estudiantes por paralelo
  static async listarPorParalelo(req, res) {
    try {
      const { paralelo_id } = req.params;
      const { periodo_academico_id, estado = 'activo' } = req.query;

      if (!periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'El periodo académico es requerido'
        });
      }

      const estudiantes = await Matricula.findByParalelo(
        parseInt(paralelo_id),
        parseInt(periodo_academico_id),
        estado
      );

      res.json({
        success: true,
        data: { 
          estudiantes,
          total: estudiantes.length
        }
      });
    } catch (error) {
      console.error('Error al listar estudiantes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar estudiantes: ' + error.message
      });
    }
  }

  // Transferir a otro paralelo
  static async transferirParalelo(req, res) {
    try {
      const { id } = req.params;
      const { nuevo_paralelo_id, motivo } = req.body;

      if (!nuevo_paralelo_id) {
        return res.status(400).json({
          success: false,
          message: 'El nuevo paralelo es requerido'
        });
      }

      const matriculaExistente = await Matricula.findById(id);
      if (!matriculaExistente) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      const matricula = await Matricula.transferirParalelo(
        id, 
        nuevo_paralelo_id, 
        motivo || 'Sin motivo especificado'
      );

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'transferir_paralelo',
        modulo: 'matricula',
        tabla_afectada: 'matricula',
        registro_id: matricula.id,
        datos_anteriores: { paralelo_id: matriculaExistente.paralelo_id },
        datos_nuevos: { paralelo_id: nuevo_paralelo_id, motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Estudiante transferido a nuevo paralelo`
      });

      res.json({
        success: true,
        message: 'Estudiante transferido exitosamente',
        data: { matricula }
      });
    } catch (error) {
      console.error('Error al transferir:', error);
      res.status(500).json({
        success: false,
        message: 'Error al transferir: ' + error.message
      });
    }
  }
  static async verificarCapacidad(req, res) {
    try {
      const { paralelo_id, periodo_id } = req.query;

      // Validar parámetros
      if (!paralelo_id || !periodo_id) {
        return res.status(400).json({
          success: false,
          message: 'Los parámetros paralelo_id y periodo_id son requeridos'
        });
      }

      // Usar el método existente del modelo
      const capacidad = await Matricula.checkCapacidad(
        parseInt(paralelo_id),
        parseInt(periodo_id)
      );

      if (!capacidad) {
        return res.status(404).json({
          success: false,
          message: 'Paralelo no encontrado'
        });
      }

      res.json({
        success: true,
        data: capacidad
      });

    } catch (error) {
      console.error('Error al verificar capacidad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al verificar capacidad del paralelo',
        error: error.message
      });
    }
  }


  // === DOCUMENTOS ===

  // Subir documento
  static async subirDocumento(req, res) {
    try {
      const { id } = req.params;
      const { tipo_documento } = req.body;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No se proporcionó ningún archivo'
        });
      }

      if (!tipo_documento) {
        return res.status(400).json({
          success: false,
          message: 'El tipo de documento es requerido'
        });
      }

      const matricula = await Matricula.findById(id);
      if (!matricula) {
        return res.status(404).json({
          success: false,
          message: 'Matrícula no encontrada'
        });
      }

      // Subir a Cloudinary
      let url_archivo;
      try {
        const uploadResult = await UploadImage.uploadFromBuffer(
          req.file.buffer,
          'documentos_matricula',
          `matricula_${id}_${tipo_documento}_${Date.now()}`
        );
        url_archivo = uploadResult.url;
      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Error al subir documento: ' + uploadError.message
        });
      }

      // Guardar en BD
      const documento = await MatriculaDocumento.create({
        matricula_id: id,
        tipo_documento,
        nombre_archivo: req.file.originalname,
        url_archivo,
        verificado: false
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'subir_documento',
        modulo: 'matricula',
        tabla_afectada: 'matricula_documento',
        registro_id: documento.id,
        datos_nuevos: documento,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Documento subido: ${tipo_documento}`
      });

      res.status(201).json({
        success: true,
        message: 'Documento subido exitosamente',
        data: { documento }
      });
    } catch (error) {
      console.error('Error al subir documento:', error);
      res.status(500).json({
        success: false,
        message: 'Error al subir documento: ' + error.message
      });
    }
  }

  // Listar documentos
  static async listarDocumentos(req, res) {
    try {
      const { id } = req.params;
      const documentos = await MatriculaDocumento.findByMatricula(id);

      res.json({
        success: true,
        data: { documentos }
      });
    } catch (error) {
      console.error('Error al listar documentos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar documentos: ' + error.message
      });
    }
  }

  // Verificar documento
  static async verificarDocumento(req, res) {
    try {
      const { id, documento_id } = req.params;

      const documento = await MatriculaDocumento.verificar(documento_id, req.user.id);

      if (!documento) {
        return res.status(404).json({
          success: false,
          message: 'Documento no encontrado'
        });
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'verificar_documento',
        modulo: 'matricula',
        tabla_afectada: 'matricula_documento',
        registro_id: documento.id,
        datos_nuevos: { verificado: true },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Documento verificado: ${documento.tipo_documento}`
      });

      res.json({
        success: true,
        message: 'Documento verificado exitosamente',
        data: { documento }
      });
    } catch (error) {
      console.error('Error al verificar documento:', error);
      res.status(500).json({
        success: false,
        message: 'Error al verificar documento: ' + error.message
      });
    }
  }

  // Eliminar documento
  static async eliminarDocumento(req, res) {
    try {
      const { id, documento_id } = req.params;

      // Obtener documento para eliminar de Cloudinary
      const docsQuery = await MatriculaDocumento.findByMatricula(id);
      const documento = docsQuery.find(d => d.id === parseInt(documento_id));

      if (!documento) {
        return res.status(404).json({
          success: false,
          message: 'Documento no encontrado'
        });
      }

      // Eliminar de Cloudinary
      if (documento.url_archivo) {
        const publicId = UploadImage.extractPublicIdFromUrl(documento.url_archivo);
        if (publicId) {
          try {
            await UploadImage.deleteImage(publicId);
          } catch (error) {
            console.error('Error al eliminar de Cloudinary:', error);
          }
        }
      }

      // Eliminar de BD
      await MatriculaDocumento.delete(documento_id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar_documento',
        modulo: 'matricula',
        tabla_afectada: 'matricula_documento',
        registro_id: parseInt(documento_id),
        datos_anteriores: documento,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Documento eliminado: ${documento.tipo_documento}`
      });

      res.json({
        success: true,
        message: 'Documento eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar documento:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar documento: ' + error.message
      });
    }
  }
  
}

export default MatriculaController;