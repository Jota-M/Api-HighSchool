// controllers/rutaTransporteController.js
import { RutaTransporte, ParadaRuta } from '../models/RutaTransporte.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class RutaTransporteController {
  // ==========================================
  // GESTIÓN DE RUTAS
  // ==========================================

  // Listar rutas
  static async listar(req, res) {
    try {
      const { page, limit, search, activo } = req.query;

      const result = await RutaTransporte.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        activo: activo !== undefined ? activo === 'true' : undefined
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al listar rutas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar rutas: ' + error.message
      });
    }
  }

  // Obtener ruta por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const ruta = await RutaTransporte.findById(id);

      if (!ruta) {
        return res.status(404).json({
          success: false,
          message: 'Ruta no encontrada'
        });
      }

      // Obtener paradas de la ruta
      const paradas = await ParadaRuta.findByRuta(id);
      ruta.paradas = paradas;

      res.json({
        success: true,
        data: { ruta }
      });
    } catch (error) {
      console.error('Error al obtener ruta:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener ruta: ' + error.message
      });
    }
  }

  // Crear ruta
  static async crear(req, res) {
    try {
      const { codigo, nombre, costo_mensual } = req.body;

      // Validaciones básicas
      if (!codigo || !nombre || !costo_mensual) {
        return res.status(400).json({
          success: false,
          message: 'Código, nombre y costo mensual son requeridos'
        });
      }

      // Verificar que el código no exista
      const existente = await RutaTransporte.existsByCodigo(codigo);
      if (existente) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe una ruta con este código'
        });
      }

      // Crear ruta
      const ruta = await RutaTransporte.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'transporte',
        tabla_afectada: 'ruta_transporte',
        registro_id: ruta.id,
        datos_nuevos: ruta,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Ruta creada: ${ruta.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Ruta creada exitosamente',
        data: { ruta }
      });
    } catch (error) {
      console.error('Error al crear ruta:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear ruta: ' + error.message
      });
    }
  }

  // Actualizar ruta
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const rutaExistente = await RutaTransporte.findById(id);
      if (!rutaExistente) {
        return res.status(404).json({
          success: false,
          message: 'Ruta no encontrada'
        });
      }

      const ruta = await RutaTransporte.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'transporte',
        tabla_afectada: 'ruta_transporte',
        registro_id: ruta.id,
        datos_anteriores: rutaExistente,
        datos_nuevos: ruta,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Ruta actualizada: ${ruta.nombre}`
      });

      res.json({
        success: true,
        message: 'Ruta actualizada exitosamente',
        data: { ruta }
      });
    } catch (error) {
      console.error('Error al actualizar ruta:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar ruta: ' + error.message
      });
    }
  }

  // Eliminar ruta
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const ruta = await RutaTransporte.findById(id);
      if (!ruta) {
        return res.status(404).json({
          success: false,
          message: 'Ruta no encontrada'
        });
      }

      // Verificar que no tenga estudiantes asignados activos
      if (ruta.estudiantes_asignados > 0) {
        return res.status(409).json({
          success: false,
          message: 'No se puede eliminar la ruta porque tiene estudiantes asignados'
        });
      }

      await RutaTransporte.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'transporte',
        tabla_afectada: 'ruta_transporte',
        registro_id: parseInt(id),
        datos_anteriores: ruta,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Ruta eliminada: ${ruta.nombre}`
      });

      res.json({
        success: true,
        message: 'Ruta eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar ruta:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar ruta: ' + error.message
      });
    }
  }

  // Obtener estadísticas
  static async obtenerEstadisticas(req, res) {
    try {
      const estadisticas = await RutaTransporte.getEstadisticas();

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

  // ==========================================
  // GESTIÓN DE PARADAS
  // ==========================================

  // Crear parada
  static async crearParada(req, res) {
    try {
      const { id } = req.params;
      const { nombre, orden } = req.body;

      if (!nombre || !orden) {
        return res.status(400).json({
          success: false,
          message: 'Nombre y orden son requeridos'
        });
      }

      // Verificar que la ruta existe
      const ruta = await RutaTransporte.findById(id);
      if (!ruta) {
        return res.status(404).json({
          success: false,
          message: 'Ruta no encontrada'
        });
      }

      const parada = await ParadaRuta.create({
        ...req.body,
        ruta_id: id
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'transporte',
        tabla_afectada: 'parada_ruta',
        registro_id: parada.id,
        datos_nuevos: parada,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Parada creada: ${parada.nombre} en ruta ${ruta.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Parada creada exitosamente',
        data: { parada }
      });
    } catch (error) {
      console.error('Error al crear parada:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear parada: ' + error.message
      });
    }
  }

  // Listar paradas de una ruta
  static async listarParadas(req, res) {
    try {
      const { id } = req.params;

      const paradas = await ParadaRuta.findByRuta(id);

      res.json({
        success: true,
        data: { paradas }
      });
    } catch (error) {
      console.error('Error al listar paradas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar paradas: ' + error.message
      });
    }
  }

  // Actualizar parada
  static async actualizarParada(req, res) {
    try {
      const { id, parada_id } = req.params;

      const paradaExistente = await ParadaRuta.findById(parada_id);
      if (!paradaExistente) {
        return res.status(404).json({
          success: false,
          message: 'Parada no encontrada'
        });
      }

      const parada = await ParadaRuta.update(parada_id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'transporte',
        tabla_afectada: 'parada_ruta',
        registro_id: parada.id,
        datos_anteriores: paradaExistente,
        datos_nuevos: parada,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Parada actualizada: ${parada.nombre}`
      });

      res.json({
        success: true,
        message: 'Parada actualizada exitosamente',
        data: { parada }
      });
    } catch (error) {
      console.error('Error al actualizar parada:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar parada: ' + error.message
      });
    }
  }

  // Eliminar parada
  static async eliminarParada(req, res) {
    try {
      const { id, parada_id } = req.params;

      const parada = await ParadaRuta.findById(parada_id);
      if (!parada) {
        return res.status(404).json({
          success: false,
          message: 'Parada no encontrada'
        });
      }

      await ParadaRuta.delete(parada_id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'transporte',
        tabla_afectada: 'parada_ruta',
        registro_id: parseInt(parada_id),
        datos_anteriores: parada,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Parada eliminada: ${parada.nombre}`
      });

      res.json({
        success: true,
        message: 'Parada eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar parada:', error);
      
      if (error.message.includes('estudiantes asignados')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al eliminar parada: ' + error.message
      });
    }
  }

  // Reordenar paradas
  static async reordenarParadas(req, res) {
    try {
      const { id } = req.params;
      const { paradas } = req.body;

      if (!Array.isArray(paradas)) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere un array de paradas con { id, orden }'
        });
      }

      await ParadaRuta.reordenar(id, paradas);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'reordenar_paradas',
        modulo: 'transporte',
        tabla_afectada: 'parada_ruta',
        registro_id: parseInt(id),
        datos_nuevos: { paradas },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Paradas reordenadas en ruta ${id}`
      });

      res.json({
        success: true,
        message: 'Paradas reordenadas exitosamente'
      });
    } catch (error) {
      console.error('Error al reordenar paradas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al reordenar paradas: ' + error.message
      });
    }
  }
}

export default RutaTransporteController;