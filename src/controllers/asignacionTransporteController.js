// controllers/asignacionTransporteController.js
import { AsignacionTransporte, PagoTransporte } from '../models/AsignacionTransporte.js';
import { Estudiante } from '../models/Estudiantes.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class AsignacionTransporteController {
  // ==========================================
  // GESTIÓN DE ASIGNACIONES
  // ==========================================

  // Listar asignaciones
  static async listar(req, res) {
    try {
      const {
        page, limit, search, periodo_academico_id,
        ruta_id, estudiante_id, estado, activo
      } = req.query;

      const result = await AsignacionTransporte.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        ruta_id: ruta_id ? parseInt(ruta_id) : undefined,
        estudiante_id: estudiante_id ? parseInt(estudiante_id) : undefined,
        estado,
        activo: activo !== undefined ? activo === 'true' : undefined
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al listar asignaciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar asignaciones: ' + error.message
      });
    }
  }

  // Obtener asignación por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const asignacion = await AsignacionTransporte.findById(id);

      if (!asignacion) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      res.json({
        success: true,
        data: { asignacion }
      });
    } catch (error) {
      console.error('Error al obtener asignación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener asignación: ' + error.message
      });
    }
  }

  // Crear asignación
  static async crear(req, res) {
    try {
      const { estudiante_id, ruta_id, periodo_academico_id, costo_mensual } = req.body;

      // Validaciones básicas
      if (!estudiante_id || !ruta_id || !periodo_academico_id || !costo_mensual) {
        return res.status(400).json({
          success: false,
          message: 'Estudiante, ruta, periodo académico y costo mensual son requeridos'
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

      // Verificar que no tenga asignación activa en este periodo
      const asignacionExistente = await AsignacionTransporte.exists(
        estudiante_id,
        periodo_academico_id
      );
      if (asignacionExistente) {
        return res.status(409).json({
          success: false,
          message: 'El estudiante ya tiene una asignación de transporte en este periodo académico'
        });
      }

      // Crear asignación
      const asignacion = await AsignacionTransporte.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'transporte',
        tabla_afectada: 'asignacion_transporte',
        registro_id: asignacion.id,
        datos_nuevos: asignacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Asignación creada para estudiante ${estudiante_id}`
      });

      res.status(201).json({
        success: true,
        message: 'Asignación creada exitosamente',
        data: { asignacion }
      });
    } catch (error) {
      console.error('Error al crear asignación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear asignación: ' + error.message
      });
    }
  }

  // Actualizar asignación
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const asignacionExistente = await AsignacionTransporte.findById(id);
      if (!asignacionExistente) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      const asignacion = await AsignacionTransporte.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'transporte',
        tabla_afectada: 'asignacion_transporte',
        registro_id: asignacion.id,
        datos_anteriores: asignacionExistente,
        datos_nuevos: asignacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Asignación actualizada: ID ${asignacion.id}`
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

  // Cambiar estado
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

      const estadosValidos = ['activo', 'suspendido', 'cancelado', 'finalizado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: 'Estado no válido'
        });
      }

      const asignacionExistente = await AsignacionTransporte.findById(id);
      if (!asignacionExistente) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      const asignacion = await AsignacionTransporte.changeStatus(id, estado, motivo);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cambiar_estado',
        modulo: 'transporte',
        tabla_afectada: 'asignacion_transporte',
        registro_id: asignacion.id,
        datos_anteriores: { estado: asignacionExistente.estado },
        datos_nuevos: { estado: asignacion.estado, motivo },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Estado cambiado a: ${estado}`
      });

      res.json({
        success: true,
        message: 'Estado actualizado exitosamente',
        data: { asignacion }
      });
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar estado: ' + error.message
      });
    }
  }

  // Eliminar asignación
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const asignacion = await AsignacionTransporte.findById(id);
      if (!asignacion) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      await AsignacionTransporte.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'transporte',
        tabla_afectada: 'asignacion_transporte',
        registro_id: parseInt(id),
        datos_anteriores: asignacion,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Asignación eliminada: ID ${id}`
      });

      res.json({
        success: true,
        message: 'Asignación eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar asignación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar asignación: ' + error.message
      });
    }
  }

  // Listar estudiantes por ruta
  static async listarPorRuta(req, res) {
    try {
      const { ruta_id } = req.params;
      const { periodo_academico_id } = req.query;

      if (!periodo_academico_id) {
        return res.status(400).json({
          success: false,
          message: 'El periodo académico es requerido'
        });
      }

      const estudiantes = await AsignacionTransporte.findByRuta(
        parseInt(ruta_id),
        parseInt(periodo_academico_id)
      );

      res.json({
        success: true,
        data: { estudiantes, total: estudiantes.length }
      });
    } catch (error) {
      console.error('Error al listar estudiantes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar estudiantes: ' + error.message
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

      const estadisticas = await AsignacionTransporte.getEstadisticas(
        parseInt(periodo_academico_id)
      );

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

  // Generar cuotas mensuales
  static async generarCuotas(req, res) {
    try {
      const { id } = req.params;
      const { cantidad_meses = 10 } = req.body;

      const asignacion = await AsignacionTransporte.findById(id);
      if (!asignacion) {
        return res.status(404).json({
          success: false,
          message: 'Asignación no encontrada'
        });
      }

      const cuotas = await PagoTransporte.generarCuotas(id, cantidad_meses);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'generar_cuotas',
        modulo: 'transporte',
        tabla_afectada: 'pago_transporte',
        registro_id: parseInt(id),
        datos_nuevos: { cantidad_cuotas: cuotas.length },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `${cuotas.length} cuotas generadas para asignación ${id}`
      });

      res.status(201).json({
        success: true,
        message: `${cuotas.length} cuotas generadas exitosamente`,
        data: { cuotas }
      });
    } catch (error) {
      console.error('Error al generar cuotas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar cuotas: ' + error.message
      });
    }
  }
}

export default AsignacionTransporteController;