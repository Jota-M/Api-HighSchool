// controllers/cupoPreinscripcionController.js
import { CupoPreinscripcion } from '../models/CupoPreinscripcion.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class CupoPreinscripcionController {
  
  /**
   * CREAR CUPO
   */
  static async crear(req, res) {
    try {
      const { 
        periodo_academico_id, 
        grado_id, 
        turno_id, 
        cupos_totales,
        observaciones 
      } = req.body;

      // Validaciones
      if (!periodo_academico_id || !grado_id || !turno_id || !cupos_totales) {
        return res.status(400).json({
          success: false,
          message: 'Faltan campos obligatorios: periodo_academico_id, grado_id, turno_id, cupos_totales'
        });
      }

      if (cupos_totales < 1) {
        return res.status(400).json({
          success: false,
          message: 'Los cupos totales deben ser al menos 1'
        });
      }

      // Verificar que no exista ya
      const existente = await CupoPreinscripcion.verificarDisponibilidad(
        grado_id, 
        turno_id, 
        periodo_academico_id
      );

      if (existente) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un cupo para este grado, turno y período académico'
        });
      }

      // Crear cupo
      const nuevoCupo = await CupoPreinscripcion.crear({
        periodo_academico_id,
        grado_id,
        turno_id,
        cupos_totales,
        observaciones
      });

      // Registrar actividad
      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'crear_cupo_preinscripcion',
          modulo: 'cupos',
          tabla_afectada: 'cupo_preinscripcion',
          registro_id: nuevoCupo.id,
          datos_nuevos: nuevoCupo,
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: `Cupo creado: ${cupos_totales} cupos`
        });
      }

      res.status(201).json({
        success: true,
        message: 'Cupo creado exitosamente',
        data: { cupo: nuevoCupo }
      });

    } catch (error) {
      console.error('Error al crear cupo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear cupo: ' + error.message
      });
    }
  }

  /**
   * LISTAR CUPOS
   */
  static async listar(req, res) {
    try {
      const { 
        periodo_academico_id, 
        grado_id, 
        turno_id,
        solo_activos,
        page, 
        limit 
      } = req.query;

      const filters = {
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        grado_id: grado_id ? parseInt(grado_id) : undefined,
        turno_id: turno_id ? parseInt(turno_id) : undefined,
        solo_activos: solo_activos !== 'false',
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50
      };

      const resultado = await CupoPreinscripcion.obtenerTodos(filters);

      res.json({
        success: true,
        data: resultado
      });

    } catch (error) {
      console.error('Error al listar cupos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar cupos: ' + error.message
      });
    }
  }

  /**
   * OBTENER CUPO POR ID
   */
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;

      const cupo = await CupoPreinscripcion.obtenerPorId(id);

      if (!cupo) {
        return res.status(404).json({
          success: false,
          message: 'Cupo no encontrado'
        });
      }

      res.json({
        success: true,
        data: { cupo }
      });

    } catch (error) {
      console.error('Error al obtener cupo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener cupo: ' + error.message
      });
    }
  }

  /**
   * ACTUALIZAR CUPO
   */
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const { cupos_totales, activo, observaciones } = req.body;

      // Obtener cupo actual
      const cupoActual = await CupoPreinscripcion.obtenerPorId(id);

      if (!cupoActual) {
        return res.status(404).json({
          success: false,
          message: 'Cupo no encontrado'
        });
      }

      // Validar que no se reduzcan los cupos por debajo de los ocupados
      if (cupos_totales && cupos_totales < cupoActual.cupos_ocupados) {
        return res.status(400).json({
          success: false,
          message: `No se puede reducir a ${cupos_totales} cupos porque ya hay ${cupoActual.cupos_ocupados} cupos ocupados`
        });
      }

      // Actualizar
      const cupoActualizado = await CupoPreinscripcion.actualizar(id, {
        cupos_totales,
        activo,
        observaciones
      });

      // Registrar actividad
      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'actualizar_cupo_preinscripcion',
          modulo: 'cupos',
          tabla_afectada: 'cupo_preinscripcion',
          registro_id: id,
          datos_anteriores: cupoActual,
          datos_nuevos: cupoActualizado,
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: 'Cupo actualizado'
        });
      }

      res.json({
        success: true,
        message: 'Cupo actualizado exitosamente',
        data: { cupo: cupoActualizado }
      });

    } catch (error) {
      console.error('Error al actualizar cupo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar cupo: ' + error.message
      });
    }
  }

  /**
   * VERIFICAR DISPONIBILIDAD (PÚBLICO)
   */
  static async verificarDisponibilidad(req, res) {
    try {
      const { grado_id, turno_id, periodo_academico_id } = req.query;

      if (!grado_id || !turno_id || !periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'Faltan parámetros: grado_id, turno_id, periodo_academico_id'
        });
      }

      const cupo = await CupoPreinscripcion.verificarDisponibilidad(
        parseInt(grado_id),
        parseInt(turno_id),
        parseInt(periodo_academico_id)
      );

      res.json({
        success: true,
        data: {
          tiene_cupos: cupo ? cupo.tiene_cupos : false,
          cupo: cupo || null
        }
      });

    } catch (error) {
      console.error('Error al verificar disponibilidad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al verificar disponibilidad: ' + error.message
      });
    }
  }

  /**
   * OBTENER RESUMEN POR PERÍODO
   */
  static async obtenerResumenPorPeriodo(req, res) {
    try {
      const { periodo_id } = req.params;

      if (!periodo_id) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar el ID del período académico'
        });
      }

      const resumen = await CupoPreinscripcion.obtenerResumenPorPeriodo(
        parseInt(periodo_id)
      );

      res.json({
        success: true,
        data: { resumen }
      });

    } catch (error) {
      console.error('Error al obtener resumen:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener resumen: ' + error.message
      });
    }
  }

  /**
   * ELIMINAR CUPO
   */
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const cupoEliminado = await CupoPreinscripcion.eliminar(id);

      if (!cupoEliminado) {
        return res.status(404).json({
          success: false,
          message: 'Cupo no encontrado'
        });
      }

      // Registrar actividad
      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion: 'eliminar_cupo_preinscripcion',
          modulo: 'cupos',
          tabla_afectada: 'cupo_preinscripcion',
          registro_id: id,
          datos_anteriores: cupoEliminado,
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'exitoso',
          mensaje: 'Cupo eliminado'
        });
      }

      res.json({
        success: true,
        message: 'Cupo eliminado exitosamente'
      });

    } catch (error) {
      console.error('Error al eliminar cupo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar cupo: ' + error.message
      });
    }
  }
}

export default CupoPreinscripcionController;