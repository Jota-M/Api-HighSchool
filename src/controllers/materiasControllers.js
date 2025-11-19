// controllers/areaConocimientoController.js
import { AreaConocimiento } from '../models/Materias.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class AreaConocimientoController {
  // Listar áreas de conocimiento
  static async listar(req, res) {
    try {
      const areas = await AreaConocimiento.findAll();

      res.json({
        success: true,
        data: { areas }
      });
    } catch (error) {
      console.error('Error al listar áreas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar áreas de conocimiento: ' + error.message
      });
    }
  }

  // Obtener área por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const area = await AreaConocimiento.findById(id);

      if (!area) {
        return res.status(404).json({
          success: false,
          message: 'Área de conocimiento no encontrada'
        });
      }

      res.json({
        success: true,
        data: { area }
      });
    } catch (error) {
      console.error('Error al obtener área:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener área de conocimiento: ' + error.message
      });
    }
  }

  // Crear área
  static async crear(req, res) {
    try {
      const { nombre, descripcion, color, orden } = req.body;

      // Validaciones básicas
      if (!nombre || !orden) {
        return res.status(400).json({
          success: false,
          message: 'El nombre y el orden son requeridos'
        });
      }

      const area = await AreaConocimiento.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'area_conocimiento',
        tabla_afectada: 'area_conocimiento',
        registro_id: area.id,
        datos_nuevos: area,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Área de conocimiento creada: ${area.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Área de conocimiento creada exitosamente',
        data: { area }
      });
    } catch (error) {
      console.error('Error al crear área:', error);
      
      if (error.constraint === 'area_conocimiento_nombre_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un área de conocimiento con ese nombre'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear área de conocimiento: ' + error.message
      });
    }
  }

  // Actualizar área
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const areaExistente = await AreaConocimiento.findById(id);
      if (!areaExistente) {
        return res.status(404).json({
          success: false,
          message: 'Área de conocimiento no encontrada'
        });
      }

      const area = await AreaConocimiento.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'area_conocimiento',
        tabla_afectada: 'area_conocimiento',
        registro_id: area.id,
        datos_anteriores: areaExistente,
        datos_nuevos: area,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Área de conocimiento actualizada: ${area.nombre}`
      });

      res.json({
        success: true,
        message: 'Área de conocimiento actualizada exitosamente',
        data: { area }
      });
    } catch (error) {
      console.error('Error al actualizar área:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar área de conocimiento: ' + error.message
      });
    }
  }

  // Eliminar área
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const area = await AreaConocimiento.findById(id);
      if (!area) {
        return res.status(404).json({
          success: false,
          message: 'Área de conocimiento no encontrada'
        });
      }

      await AreaConocimiento.delete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'area_conocimiento',
        tabla_afectada: 'area_conocimiento',
        registro_id: parseInt(id),
        datos_anteriores: area,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Área de conocimiento eliminada: ${area.nombre}`
      });

      res.json({
        success: true,
        message: 'Área de conocimiento eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar área:', error);
      
      if (error.message.includes('materias asociadas')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al eliminar área de conocimiento: ' + error.message
      });
    }
  }
}

// controllers/materiaController.js
import { Materia, MateriaPrerequisito } from '../models/Materias.js';

class MateriaController {
  // Listar materias
  static async listar(req, res) {
    try {
      const { page, limit, search, area_conocimiento_id, activo, es_obligatoria } = req.query;
      
      const result = await Materia.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        area_conocimiento_id: area_conocimiento_id ? parseInt(area_conocimiento_id) : undefined,
        activo: activo !== undefined ? activo === 'true' : undefined,
        es_obligatoria: es_obligatoria !== undefined ? es_obligatoria === 'true' : undefined
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al listar materias:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar materias: ' + error.message
      });
    }
  }

  // Obtener materia por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const materia = await Materia.findByIdWithPrerequisites(id);

      if (!materia) {
        return res.status(404).json({
          success: false,
          message: 'Materia no encontrada'
        });
      }

      res.json({
        success: true,
        data: { materia }
      });
    } catch (error) {
      console.error('Error al obtener materia:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener materia: ' + error.message
      });
    }
  }

  // Crear materia
  static async crear(req, res) {
    try {
      const { codigo, nombre } = req.body;

      // Validaciones básicas
      if (!codigo || !nombre) {
        return res.status(400).json({
          success: false,
          message: 'El código y nombre son requeridos'
        });
      }

      const materia = await Materia.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'materia',
        tabla_afectada: 'materia',
        registro_id: materia.id,
        datos_nuevos: materia,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Materia creada: ${materia.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Materia creada exitosamente',
        data: { materia }
      });
    } catch (error) {
      console.error('Error al crear materia:', error);
      
      if (error.constraint === 'materia_codigo_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe una materia con ese código'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear materia: ' + error.message
      });
    }
  }

  // Actualizar materia
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const materiaExistente = await Materia.findById(id);
      if (!materiaExistente) {
        return res.status(404).json({
          success: false,
          message: 'Materia no encontrada'
        });
      }

      const materia = await Materia.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'materia',
        tabla_afectada: 'materia',
        registro_id: materia.id,
        datos_anteriores: materiaExistente,
        datos_nuevos: materia,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Materia actualizada: ${materia.nombre}`
      });

      res.json({
        success: true,
        message: 'Materia actualizada exitosamente',
        data: { materia }
      });
    } catch (error) {
      console.error('Error al actualizar materia:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar materia: ' + error.message
      });
    }
  }

  // Eliminar materia
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const materia = await Materia.findById(id);
      if (!materia) {
        return res.status(404).json({
          success: false,
          message: 'Materia no encontrada'
        });
      }

      await Materia.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'materia',
        tabla_afectada: 'materia',
        registro_id: parseInt(id),
        datos_anteriores: materia,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Materia eliminada: ${materia.nombre}`
      });

      res.json({
        success: true,
        message: 'Materia eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar materia:', error);
      
      if (error.message.includes('asignada a grados')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al eliminar materia: ' + error.message
      });
    }
  }

  // Agregar prerequisito
  static async agregarPrerequisito(req, res) {
    try {
      const { id } = req.params;
      const { prerequisito_id } = req.body;

      if (!prerequisito_id) {
        return res.status(400).json({
          success: false,
          message: 'El ID del prerequisito es requerido'
        });
      }

      const prerequisito = await MateriaPrerequisito.add(parseInt(id), prerequisito_id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'agregar_prerequisito',
        modulo: 'materia',
        tabla_afectada: 'materia_prerequisito',
        registro_id: prerequisito.id,
        datos_nuevos: prerequisito,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Prerequisito agregado a materia ID ${id}`
      });

      res.status(201).json({
        success: true,
        message: 'Prerequisito agregado exitosamente',
        data: { prerequisito }
      });
    } catch (error) {
      console.error('Error al agregar prerequisito:', error);
      
      if (error.message.includes('ciclo')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      if (error.constraint === 'materia_prerequisito_pkey') {
        return res.status(409).json({
          success: false,
          message: 'Este prerequisito ya está asignado'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al agregar prerequisito: ' + error.message
      });
    }
  }

  // Eliminar prerequisito
  static async eliminarPrerequisito(req, res) {
    try {
      const { id, prerequisito_id } = req.params;

      await MateriaPrerequisito.remove(parseInt(id), parseInt(prerequisito_id));

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar_prerequisito',
        modulo: 'materia',
        tabla_afectada: 'materia_prerequisito',
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Prerequisito eliminado de materia ID ${id}`
      });

      res.json({
        success: true,
        message: 'Prerequisito eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar prerequisito:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar prerequisito: ' + error.message
      });
    }
  }

  // Listar prerequisitos
  static async listarPrerequisitos(req, res) {
    try {
      const { id } = req.params;
      const prerequisitos = await MateriaPrerequisito.findByMateria(id);

      res.json({
        success: true,
        data: { prerequisitos }
      });
    } catch (error) {
      console.error('Error al listar prerequisitos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar prerequisitos: ' + error.message
      });
    }
  }
}

// controllers/gradoMateriaController.js
import { GradoMateria } from '../models/Materias.js';

class GradoMateriaController {
  // Asignar materia a grado
  static async asignar(req, res) {
    try {
      const { grado_id, materia_id } = req.body;

      if (!grado_id || !materia_id) {
        return res.status(400).json({
          success: false,
          message: 'El grado y la materia son requeridos'
        });
      }

      // Verificar si ya existe
      const existe = await GradoMateria.exists(grado_id, materia_id);
      if (existe) {
        return res.status(409).json({
          success: false,
          message: 'Esta materia ya está asignada a este grado'
        });
      }

      const asignacion = await GradoMateria.assign(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'asignar',
        modulo: 'grado_materia',
        tabla_afectada: 'grado_materia',
        registro_id: asignacion.id,
        datos_nuevos: asignacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Materia asignada a grado`
      });

      res.status(201).json({
        success: true,
        message: 'Materia asignada exitosamente',
        data: { asignacion }
      });
    } catch (error) {
      console.error('Error al asignar materia:', error);
      res.status(500).json({
        success: false,
        message: 'Error al asignar materia: ' + error.message
      });
    }
  }

  // Listar materias de un grado
  static async listarPorGrado(req, res) {
    try {
      const { grado_id } = req.params;
      const { activo } = req.query;

      const materias = await GradoMateria.findByGrado(
        parseInt(grado_id),
        activo !== undefined ? activo === 'true' : undefined
      );

      res.json({
        success: true,
        data: { materias }
      });
    } catch (error) {
      console.error('Error al listar materias del grado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar materias: ' + error.message
      });
    }
  }

  // Actualizar asignación
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const asignacionExistente = await GradoMateria.findById(id);
      if (!asignacionExistente) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      const asignacion = await GradoMateria.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'grado_materia',
        tabla_afectada: 'grado_materia',
        registro_id: asignacion.id,
        datos_anteriores: asignacionExistente,
        datos_nuevos: asignacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Asignación de materia actualizada`
      });

      res.json({
        success: true,
        message: 'Asignación actualizada exitosamente',
        data: { asignacion }
      });
    } catch (error) {
      console.error('Error al actualizar asignación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar asignación: ' + error.message
      });
    }
  }

  // Remover materia de grado
  static async remover(req, res) {
    try {
      const { id } = req.params;

      const asignacion = await GradoMateria.findById(id);
      if (!asignacion) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      await GradoMateria.remove(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'remover',
        modulo: 'grado_materia',
        tabla_afectada: 'grado_materia',
        registro_id: parseInt(id),
        datos_anteriores: asignacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Materia removida de grado`
      });

      res.json({
        success: true,
        message: 'Materia removida del grado exitosamente'
      });
    } catch (error) {
      console.error('Error al remover materia:', error);
      res.status(500).json({
        success: false,
        message: 'Error al remover materia: ' + error.message
      });
    }
  }

  // Reordenar materias
  static async reordenar(req, res) {
    try {
      const { grado_id } = req.params;
      const { materias } = req.body; // Array de IDs de materias en orden

      if (!Array.isArray(materias) || materias.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere un array de IDs de materias'
        });
      }

      await GradoMateria.reorder(parseInt(grado_id), materias);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'reordenar',
        modulo: 'grado_materia',
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Materias reordenadas en grado ${grado_id}`
      });

      res.json({
        success: true,
        message: 'Materias reordenadas exitosamente'
      });
    } catch (error) {
      console.error('Error al reordenar materias:', error);
      res.status(500).json({
        success: false,
        message: 'Error al reordenar materias: ' + error.message
      });
    }
  }
}

export { AreaConocimientoController, MateriaController, GradoMateriaController };