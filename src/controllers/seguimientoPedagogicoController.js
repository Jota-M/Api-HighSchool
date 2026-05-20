// controllers/seguimientoPedagogicoController.js
import {
  ObservacionPedagogica,
  AcuseReciboPadre,
  CategoriaObservacion
} from '../models/SeguimientoPedagogico.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo  from '../utils/requestInfo.js';

// =============================================
// OBSERVACIONES PEDAGÓGICAS (DOCENTE)
// =============================================
class ObservacionPedagogicaController {

  // GET /api/seguimiento/observaciones
  static async listar(req, res) {
    try {
      const {
        page, limit,
        matricula_id, docente_id, asignacion_docente_id, periodo_academico_id,
        categoria_observacion_id, nivel_relevancia,
        visible_para_padre, fecha_inicio, fecha_fin
      } = req.query;

      const result = await ObservacionPedagogica.findAll({
        page:  parseInt(page)  || 1,
        limit: parseInt(limit) || 20,
        matricula_id:            matricula_id            ? parseInt(matricula_id)            : undefined,
        docente_id:              docente_id              ? parseInt(docente_id)              : undefined,
        asignacion_docente_id:   asignacion_docente_id   ? parseInt(asignacion_docente_id)   : undefined,
        periodo_academico_id:    periodo_academico_id    ? parseInt(periodo_academico_id)    : undefined,
        categoria_observacion_id:categoria_observacion_id? parseInt(categoria_observacion_id): undefined,
        nivel_relevancia,
        visible_para_padre:
          visible_para_padre !== undefined
            ? visible_para_padre === 'true'
            : undefined,
        fecha_inicio,
        fecha_fin
      });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error al listar observaciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar observaciones: ' + error.message
      });
    }
  }

  // GET /api/seguimiento/observaciones/:id
  static async obtenerPorId(req, res) {
    try {
      const observacion = await ObservacionPedagogica.findById(req.params.id);
      if (!observacion) {
        return res.status(404).json({ success: false, message: 'Observación no encontrada' });
      }

      const [historial, acuses] = await Promise.all([
        ObservacionPedagogica.getHistorial(req.params.id),
        AcuseReciboPadre.findByObservacion(req.params.id)
      ]);

      res.json({ success: true, data: { observacion, historial, acuses } });
    } catch (error) {
      console.error('Error al obtener observación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener observación: ' + error.message
      });
    }
  }

  // POST /api/seguimiento/observaciones
  static async crear(req, res) {
    try {
      const {
        matricula_id, asignacion_docente_id, periodo_academico_id,
        categoria_observacion_id, nivel_relevancia, descripcion,
        fecha_ocurrencia, plantilla_id, visible_para_padre
      } = req.body;

      // Validaciones básicas
      if (!matricula_id || !periodo_academico_id || !categoria_observacion_id || !descripcion) {
        return res.status(400).json({
          success: false,
          message: 'matricula_id, periodo_academico_id, categoria_observacion_id y descripcion son requeridos'
        });
      }

      // Obtener docente_id desde el usuario autenticado
      const docenteResult = await import('../db/pool.js').then(({ pool }) =>
        pool.query(`SELECT id FROM docente WHERE usuario_id = $1 AND activo = true`, [req.user.id])
      );

      if (!docenteResult.rows[0]) {
        return res.status(403).json({
          success: false,
          message: 'El usuario autenticado no tiene perfil de docente activo'
        });
      }

      const docente_id = docenteResult.rows[0].id;

      const observacion = await ObservacionPedagogica.create({
        docente_id,
        matricula_id,
        asignacion_docente_id: asignacion_docente_id || null,
        periodo_academico_id,
        categoria_observacion_id,
        nivel_relevancia:      nivel_relevancia || 'informativo',
        descripcion,
        fecha_ocurrencia:      fecha_ocurrencia || new Date().toISOString().split('T')[0],
        plantilla_id:          plantilla_id     || null,
        visible_para_padre:    visible_para_padre ?? false,
        publicado_por:         visible_para_padre ? req.user.id : null
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'crear',
        modulo:         'seguimiento_pedagogico',
        tabla_afectada: 'observacion_pedagogica',
        registro_id:    observacion.id,
        datos_nuevos:   observacion,
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Observación creada: ${observacion.codigo_observacion}`
      });

      res.status(201).json({
        success: true,
        message: 'Observación registrada exitosamente',
        data: { observacion }
      });
    } catch (error) {
      console.error('Error al crear observación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear observación: ' + error.message
      });
    }
  }

  // PATCH /api/seguimiento/observaciones/:id
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const { categoria_observacion_id, nivel_relevancia, descripcion, fecha_ocurrencia } = req.body;

      const anterior = await ObservacionPedagogica.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Observación no encontrada' });
      }

      const observacion = await ObservacionPedagogica.update(id, {
        categoria_observacion_id, nivel_relevancia, descripcion, fecha_ocurrencia
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:      req.user.id,
        accion:          'actualizar',
        modulo:          'seguimiento_pedagogico',
        tabla_afectada:  'observacion_pedagogica',
        registro_id:     parseInt(id),
        datos_anteriores:{ descripcion: anterior.descripcion, nivel_relevancia: anterior.nivel_relevancia },
        datos_nuevos:    { descripcion: observacion.descripcion, nivel_relevancia: observacion.nivel_relevancia },
        ip_address:      reqInfo.ip,
        user_agent:      reqInfo.userAgent,
        resultado:       'exitoso',
        mensaje:         `Observación actualizada: ${anterior.codigo_observacion}`
      });

      res.json({
        success: true,
        message: 'Observación actualizada exitosamente',
        data: { observacion }
      });
    } catch (error) {
      console.error('Error al actualizar observación:', error);
      const status = error.message.includes('no encontrada') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  // PATCH /api/seguimiento/observaciones/:id/visibilidad
  // Publica o oculta la observación al padre
  static async cambiarVisibilidad(req, res) {
    try {
      const { id } = req.params;
      const { visible_para_padre } = req.body;

      if (visible_para_padre === undefined) {
        return res.status(400).json({
          success: false,
          message: 'visible_para_padre es requerido (true/false)'
        });
      }

      const anterior = await ObservacionPedagogica.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Observación no encontrada' });
      }

      const observacion = await ObservacionPedagogica.cambiarVisibilidad(id, {
        visible_para_padre,
        publicado_por: req.user.id
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:      req.user.id,
        accion:          'cambiar_visibilidad',
        modulo:          'seguimiento_pedagogico',
        tabla_afectada:  'observacion_pedagogica',
        registro_id:     parseInt(id),
        datos_anteriores:{ visible_para_padre: anterior.visible_para_padre },
        datos_nuevos:    { visible_para_padre: observacion.visible_para_padre },
        ip_address:      reqInfo.ip,
        user_agent:      reqInfo.userAgent,
        resultado:       'exitoso',
        mensaje:         `Observación ${observacion.codigo_observacion} → ${visible_para_padre ? 'publicada al padre' : 'ocultada'}`
      });

      res.json({
        success: true,
        message: visible_para_padre
          ? 'Observación publicada al padre de familia'
          : 'Observación ocultada',
        data: { observacion }
      });
    } catch (error) {
      console.error('Error al cambiar visibilidad:', error);
      const status = error.message.includes('no encontrada') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  // DELETE /api/seguimiento/observaciones/:id
  static async eliminar(req, res) {
    try {
      const observacion = await ObservacionPedagogica.softDelete(req.params.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'eliminar',
        modulo:         'seguimiento_pedagogico',
        tabla_afectada: 'observacion_pedagogica',
        registro_id:    parseInt(req.params.id),
        datos_anteriores: observacion,
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Observación eliminada: ${observacion.codigo_observacion}`
      });

      res.json({
        success: true,
        message: 'Observación eliminada exitosamente',
        data: { observacion }
      });
    } catch (error) {
      console.error('Error al eliminar observación:', error);
      const status = error.message.includes('no encontrada') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  // GET /api/seguimiento/observaciones/:id/historial
  static async obtenerHistorial(req, res) {
    try {
      const historial = await ObservacionPedagogica.getHistorial(req.params.id);
      res.json({ success: true, data: { historial } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener historial: ' + error.message
      });
    }
  }

  // GET /api/seguimiento/linea-tiempo
  // Query: ?matricula_id=X&periodo_academico_id=Y&categoria_id=Z&nivel_relevancia=W
  static async getLineaTiempo(req, res) {
    try {
      const {
        matricula_id, periodo_academico_id, categoria_id,
        nivel_relevancia, solo_visibles_padre
      } = req.query;

      if (!matricula_id) {
        return res.status(400).json({
          success: false,
          message: 'matricula_id es requerido'
        });
      }

      const observaciones = await ObservacionPedagogica.getLineaTiempo({
        matricula_id:         parseInt(matricula_id),
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : null,
        categoria_id:         categoria_id         ? parseInt(categoria_id)         : null,
        nivel_relevancia:      nivel_relevancia     || null,
        solo_visibles_padre:  solo_visibles_padre === 'true'
      });

      res.json({ success: true, data: { observaciones, total: observaciones.length } });
    } catch (error) {
      console.error('Error al obtener línea de tiempo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener línea de tiempo: ' + error.message
      });
    }
  }

  // GET /api/seguimiento/resumen-asignacion
  // Query: ?asignacion_docente_id=X&periodo_academico_id=Y
  static async getResumenPorAsignacion(req, res) {
    try {
      const { asignacion_docente_id, periodo_academico_id } = req.query;

      if (!asignacion_docente_id) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id es requerido'
        });
      }

      const resumen = await ObservacionPedagogica.getResumenPorAsignacion({
        asignacion_docente_id: parseInt(asignacion_docente_id),
        periodo_academico_id:  periodo_academico_id ? parseInt(periodo_academico_id) : null
      });

      res.json({ success: true, data: { resumen, total: resumen.length } });
    } catch (error) {
      console.error('Error al obtener resumen:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener resumen: ' + error.message
      });
    }
  }
}

// =============================================
// ACUSE DE RECIBO (PADRE DE FAMILIA)
// =============================================
class AcuseReciboController {

  // POST /api/seguimiento/acuse
  static async registrar(req, res) {
    try {
      const { observacion_pedagogica_id, padre_familia_id, comentario_padre } = req.body;

      if (!observacion_pedagogica_id || !padre_familia_id) {
        return res.status(400).json({
          success: false,
          message: 'observacion_pedagogica_id y padre_familia_id son requeridos'
        });
      }

      const acuse = await AcuseReciboPadre.create({
        observacion_pedagogica_id,
        padre_familia_id,
        comentario_padre: comentario_padre || null
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'acusar_recibo',
        modulo:         'seguimiento_pedagogico',
        tabla_afectada: 'acuse_recibo_padre',
        registro_id:    acuse.id,
        datos_nuevos:   acuse,
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Acuse de recibo registrado: observación ${observacion_pedagogica_id}`
      });

      res.status(201).json({
        success: true,
        message: 'Acuse de recibo registrado exitosamente',
        data: { acuse }
      });
    } catch (error) {
      console.error('Error al registrar acuse:', error);
      const status = error.message.includes('no encontrada') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  // GET /api/seguimiento/padre/resumen
  // Query: ?padre_familia_id=X&periodo_academico_id=Y
  static async getResumenPadre(req, res) {
    try {
      const { padre_familia_id, periodo_academico_id } = req.query;

      if (!padre_familia_id) {
        return res.status(400).json({
          success: false,
          message: 'padre_familia_id es requerido'
        });
      }

      const resumen = await AcuseReciboPadre.getResumenPadre({
        padre_familia_id:     parseInt(padre_familia_id),
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : null
      });

      res.json({ success: true, data: { resumen } });
    } catch (error) {
      console.error('Error al obtener resumen del padre:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener resumen: ' + error.message
      });
    }
  }

  // GET /api/seguimiento/padre/observaciones-hijo
  // Query: ?matricula_id=X&padre_familia_id=Y&periodo_academico_id=Z
  static async getObservacionesHijo(req, res) {
    try {
      const { matricula_id, padre_familia_id, periodo_academico_id } = req.query;

      if (!matricula_id || !padre_familia_id) {
        return res.status(400).json({
          success: false,
          message: 'matricula_id y padre_familia_id son requeridos'
        });
      }

      const observaciones = await AcuseReciboPadre.getObservacionesHijo({
        matricula_id:         parseInt(matricula_id),
        padre_familia_id:     parseInt(padre_familia_id),
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : null
      });

      const no_leidas = observaciones.filter(o => !o.ya_leido).length;

      res.json({
        success: true,
        data: {
          observaciones,
          total:     observaciones.length,
          no_leidas
        }
      });
    } catch (error) {
      console.error('Error al obtener observaciones del hijo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener observaciones: ' + error.message
      });
    }
  }
}

// =============================================
// CATEGORÍAS Y PLANTILLAS
// =============================================
class CategoriaObservacionController {

  // GET /api/seguimiento/categorias
  static async listar(req, res) {
    try {
      const categorias = await CategoriaObservacion.findAll();
      res.json({ success: true, data: { categorias } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener categorías: ' + error.message
      });
    }
  }

  // GET /api/seguimiento/plantillas
  // Query: ?categoria_id=X (opcional, si no se pasa devuelve todas)
  static async listarPlantillas(req, res) {
    try {
      const { categoria_id } = req.query;

      const plantillas = categoria_id
        ? await CategoriaObservacion.getPlantillas(parseInt(categoria_id))
        : await CategoriaObservacion.getAllPlantillas();

      res.json({ success: true, data: { plantillas } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener plantillas: ' + error.message
      });
    }
  }
}

export {
  ObservacionPedagogicaController,
  AcuseReciboController,
  CategoriaObservacionController
};