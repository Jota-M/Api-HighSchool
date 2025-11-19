import { PadreFamilia } from '../models/Estudiantes.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class PadreFamiliaController {
  // Listar padres/tutores
  static async listar(req, res) {
    try {
      const { page, limit, search, parentesco } = req.query;

      const result = await PadreFamilia.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        parentesco
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al listar tutores:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar tutores: ' + error.message
      });
    }
  }

  // Obtener por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const tutor = await PadreFamilia.findById(id);

      if (!tutor) {
        return res.status(404).json({
          success: false,
          message: 'Tutor no encontrado'
        });
      }

      res.json({
        success: true,
        data: { tutor }
      });
    } catch (error) {
      console.error('Error al obtener tutor:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener tutor: ' + error.message
      });
    }
  }

  // Crear padre/tutor
  static async crear(req, res) {
    try {
      const { nombres, apellido_paterno, ci, telefono, parentesco } = req.body;

      // Validaciones básicas
      if (!nombres || !apellido_paterno || !ci || !telefono) {
        return res.status(400).json({
          success: false,
          message: 'Nombres, apellido paterno, CI y teléfono son requeridos'
        });
      }

      if (!parentesco) {
        return res.status(400).json({
          success: false,
          message: 'El parentesco es requerido'
        });
      }

      // Verificar CI
      const ciExiste = await PadreFamilia.findByCI(ci);
      if (ciExiste) {
        return res.status(409).json({
          success: false,
          message: 'El CI ya está registrado'
        });
      }

      const tutor = await PadreFamilia.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'padre_familia',
        tabla_afectada: 'padre_familia',
        registro_id: tutor.id,
        datos_nuevos: tutor,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Tutor creado: ${tutor.nombres} ${tutor.apellido_paterno}`
      });

      res.status(201).json({
        success: true,
        message: 'Tutor creado exitosamente',
        data: { tutor }
      });
    } catch (error) {
      console.error('Error al crear tutor:', error);

      if (error.constraint === 'padre_familia_ci_key') {
        return res.status(409).json({
          success: false,
          message: 'El CI ya está registrado'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear tutor: ' + error.message
      });
    }
  }

  // Actualizar
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const tutorExistente = await PadreFamilia.findById(id);
      if (!tutorExistente) {
        return res.status(404).json({
          success: false,
          message: 'Tutor no encontrado'
        });
      }

      // Verificar CI si cambió
      if (req.body.ci && req.body.ci !== tutorExistente.ci) {
        const ciExiste = await PadreFamilia.findByCI(req.body.ci);
        if (ciExiste) {
          return res.status(409).json({
            success: false,
            message: 'El CI ya está registrado'
          });
        }
      }

      const tutor = await PadreFamilia.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'padre_familia',
        tabla_afectada: 'padre_familia',
        registro_id: tutor.id,
        datos_anteriores: tutorExistente,
        datos_nuevos: tutor,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Tutor actualizado: ${tutor.nombres} ${tutor.apellido_paterno}`
      });

      res.json({
        success: true,
        message: 'Tutor actualizado exitosamente',
        data: { tutor }
      });
    } catch (error) {
      console.error('Error al actualizar tutor:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar tutor: ' + error.message
      });
    }
  }

  // Eliminar
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const tutor = await PadreFamilia.findById(id);
      if (!tutor) {
        return res.status(404).json({
          success: false,
          message: 'Tutor no encontrado'
        });
      }

      await PadreFamilia.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'padre_familia',
        tabla_afectada: 'padre_familia',
        registro_id: parseInt(id),
        datos_anteriores: tutor,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Tutor eliminado: ${tutor.nombres} ${tutor.apellido_paterno}`
      });

      res.json({
        success: true,
        message: 'Tutor eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar tutor:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar tutor: ' + error.message
      });
    }
  }
}
export default PadreFamiliaController;
