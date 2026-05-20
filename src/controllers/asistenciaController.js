// controllers/asistenciaController.js
import { SolicitudPermiso, Asistencia } from '../models/Asistencia.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadFile from '../utils/uploadFile.js';
import whatsappService from '../utils/whatsappService.js';

// =============================================
// SOLICITUD PERMISO
// =============================================
class SolicitudPermisoController {

  // GET /api/permisos
  static async listar(req, res) {
    try {
      const {
        page, limit, estudiante_id, padre_familia_id,
        estado, fecha_inicio, fecha_fin, asignacion_docente_id
      } = req.query;

      const result = await SolicitudPermiso.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        estudiante_id:         estudiante_id         ? parseInt(estudiante_id)         : undefined,
        padre_familia_id:      padre_familia_id      ? parseInt(padre_familia_id)      : undefined,
        asignacion_docente_id: asignacion_docente_id ? parseInt(asignacion_docente_id) : undefined,
        estado,
        fecha_inicio,
        fecha_fin
      });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error al listar solicitudes:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar solicitudes: ' + error.message
      });
    }
  }

  // GET /api/permisos/:id
  static async obtenerPorId(req, res) {
    try {
      const solicitud = await SolicitudPermiso.findById(req.params.id);
      if (!solicitud) {
        return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
      }

      const historial = await SolicitudPermiso.getHistorial(req.params.id);

      res.json({ success: true, data: { solicitud, historial } });
    } catch (error) {
      console.error('Error al obtener solicitud:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener solicitud: ' + error.message
      });
    }
  }

  // POST /api/permisos
  static async crear(req, res) {
  try {
    const {
      estudiante_id, padre_familia_id, asignacion_docente_id,
      fecha_ausencia, es_dia_completo, hora_inicio, hora_fin,
      motivo, descripcion
    } = req.body;

    if (!estudiante_id || !fecha_ausencia || !motivo) {
      return res.status(400).json({
        success: false,
        message: 'estudiante_id, fecha_ausencia y motivo son requeridos'
      });
    }

    const duplicada = await SolicitudPermiso.existeParaFecha(
      estudiante_id, fecha_ausencia, asignacion_docente_id
    );
    if (duplicada) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe una solicitud de permiso activa para esa fecha'
      });
    }

    // ✅ Subir archivo a Cloudinary si viene adjunto
    let archivo_adjunto_url = req.body.archivo_adjunto_url || null;

    if (req.file) {
      const ext = req.file.originalname.split('.').pop();
      const uploadResult = await UploadFile.uploadFromBuffer(
        req.file.buffer,
        'permisos_adjuntos',
        `permiso_${Date.now()}.${ext}`,
        'raw'
      );
      archivo_adjunto_url = uploadResult.url;
    }

    const solicitud = await SolicitudPermiso.create({
      estudiante_id,
      padre_familia_id:      padre_familia_id      || null,
      asignacion_docente_id: asignacion_docente_id || null,
      fecha_ausencia,
      es_dia_completo:       es_dia_completo ?? true,
      hora_inicio:           hora_inicio || null,
      hora_fin:              hora_fin    || null,
      motivo,
      descripcion:           descripcion || null,
      archivo_adjunto_url
    });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:      req.user.id,
        accion:          'crear',
        modulo:          'solicitud_permiso',
        tabla_afectada:  'solicitud_permiso',
        registro_id:     solicitud.id,
        datos_nuevos:    solicitud,
        ip_address:      reqInfo.ip,
        user_agent:      reqInfo.userAgent,
        resultado:       'exitoso',
        mensaje:         `Solicitud de permiso creada: ${solicitud.codigo_solicitud}`
      });

      res.status(201).json({
        success: true,
        message: 'Solicitud de permiso creada exitosamente',
        data: { solicitud }
      });
    } catch (error) {
      console.error('Error al crear solicitud:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear solicitud: ' + error.message
      });
    }
  }

  // PATCH /api/permisos/:id/estado
  static async cambiarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado, motivo_rechazo, observaciones_revisor } = req.body;

      const estadosValidos = ['aprobada', 'rechazada', 'cancelada'];
      if (!estado || !estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Estado inválido. Debe ser: ${estadosValidos.join(', ')}`
        });
      }

      if (estado === 'rechazada' && !motivo_rechazo) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de rechazo es requerido'
        });
      }

      const solicitudAnterior = await SolicitudPermiso.findById(id);
      if (!solicitudAnterior) {
        return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
      }

      const solicitud = await SolicitudPermiso.cambiarEstado(id, {
        estado,
        revisado_por: req.user.id,
        motivo_rechazo:        motivo_rechazo        || null,
        observaciones_revisor: observaciones_revisor || null
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:      req.user.id,
        accion:          'cambiar_estado',
        modulo:          'solicitud_permiso',
        tabla_afectada:  'solicitud_permiso',
        registro_id:     solicitud.id,
        datos_anteriores:{ estado: solicitudAnterior.estado },
        datos_nuevos:    { estado: solicitud.estado },
        ip_address:      reqInfo.ip,
        user_agent:      reqInfo.userAgent,
        resultado:       'exitoso',
        mensaje:         `Permiso ${solicitud.codigo_solicitud} → ${estado}`
      });

      res.json({
        success: true,
        message: `Solicitud ${estado} exitosamente`,
        data: { solicitud }
      });
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      const status = error.message.includes('no encontrada') ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /api/permisos/:id/historial
  static async obtenerHistorial(req, res) {
    try {
      const historial = await SolicitudPermiso.getHistorial(req.params.id);
      res.json({ success: true, data: { historial } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener historial: ' + error.message
      });
    }
  }
}

// =============================================
// ASISTENCIA
// =============================================
class AsistenciaController {

  // GET /api/asistencia
  static async listar(req, res) {
    try {
      const {
        page, limit, matricula_id, asignacion_docente_id,
        fecha, fecha_inicio, fecha_fin, estado
      } = req.query;

      const result = await Asistencia.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        matricula_id:          matricula_id          ? parseInt(matricula_id)          : undefined,
        asignacion_docente_id: asignacion_docente_id ? parseInt(asignacion_docente_id) : undefined,
        fecha,
        fecha_inicio,
        fecha_fin,
        estado
      });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error al listar asistencia:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar asistencia: ' + error.message
      });
    }
  }

  // GET /api/asistencia/:id
  static async obtenerPorId(req, res) {
    try {
      const asistencia = await Asistencia.findById(req.params.id);
      if (!asistencia) {
        return res.status(404).json({ success: false, message: 'Registro no encontrado' });
      }
      res.json({ success: true, data: { asistencia } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener registro: ' + error.message
      });
    }
  }

  // GET /api/asistencia/mis-asignaciones
  // El docente ve SUS materias con el resumen de asistencia del día
  // Query: ?fecha=YYYY-MM-DD (opcional, default: hoy)
  static async getMisAsignaciones(req, res) {
    try {
      const fecha = req.query.fecha || new Date().toISOString().split('T')[0];

      const asignaciones = await Asistencia.getMisAsignaciones({
        usuario_id: req.user.id,
        fecha
      });

      if (asignaciones.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No se encontraron asignaciones activas para este docente'
        });
      }

      res.json({
        success: true,
        data: {
          fecha,
          docente_usuario_id: req.user.id,
          total_asignaciones: asignaciones.length,
          asignaciones
        }
      });
    } catch (error) {
      console.error('Error al obtener asignaciones del docente:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener asignaciones: ' + error.message
      });
    }
  }


  // Query: ?asignacion_docente_id=X&fecha=YYYY-MM-DD
  static async getListaDia(req, res) {
    try {
      const { asignacion_docente_id, fecha } = req.query;

      if (!asignacion_docente_id || !fecha) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id y fecha son requeridos'
        });
      }

      const lista = await Asistencia.getListaDia({
        asignacion_docente_id: parseInt(asignacion_docente_id),
        fecha
      });

      res.json({
        success: true,
        data: {
          lista,
          total:             lista.length,
          ya_marcados:       lista.filter(r => r.estado).length,
          pendientes:        lista.filter(r => !r.estado).length
        }
      });
    } catch (error) {
      console.error('Error al obtener lista del día:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener lista: ' + error.message
      });
    }
  }

  // POST /api/asistencia
  static async registrar(req, res) {
  try {
    const {
      matricula_id, asignacion_docente_id, fecha, estado,
      solicitud_permiso_id, justificacion, dispositivo, observaciones
    } = req.body;
 
    if (!matricula_id || !asignacion_docente_id || !fecha || !estado) {
      return res.status(400).json({
        success: false,
        message: 'matricula_id, asignacion_docente_id, fecha y estado son requeridos'
      });
    }
 
    const estadosValidos = ['presente', 'ausente', 'tardanza', 'justificado', 'falta_parcial'];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        success: false,
        message: `Estado inválido. Debe ser: ${estadosValidos.join(', ')}`
      });
    }
 
    const asistencia = await Asistencia.create({
      matricula_id, asignacion_docente_id, fecha, estado,
      solicitud_permiso_id: solicitud_permiso_id || null,
      justificacion:        justificacion        || null,
      marcado_por:          req.user.id,
      dispositivo:          dispositivo          || 'web',
      observaciones:        observaciones        || null
    });
 
    const reqInfo = RequestInfo.extract(req);
    await ActividadLog.create({
      usuario_id:     req.user.id,
      accion:         'crear',
      modulo:         'asistencia',
      tabla_afectada: 'asistencia',
      registro_id:    asistencia.id,
      datos_nuevos:   asistencia,
      ip_address:     reqInfo.ip,
      user_agent:     reqInfo.userAgent,
      resultado:      'exitoso',
      mensaje:        `Asistencia registrada: matrícula ${matricula_id} → ${estado}`
    });
 
    // ← NUEVO: notificar al padre si es ausente o tardanza
    // No await → no bloquea la respuesta al docente
    if (['ausente', 'tardanza'].includes(estado)) {
      whatsappService.notificarAsistencia({
        matricula_id,
        estado,
        materia_nombre: req.body.materia_nombre || null, // opcional, se puede omitir
        fecha,
        asignacion_docente_id,
      }).catch(err => console.error('⚠️ Error notificación WhatsApp:', err.message));
    }
 
    res.status(201).json({
      success: true,
      message: 'Asistencia registrada exitosamente',
      data: { asistencia }
    });
  } catch (error) {
    console.error('Error al registrar asistencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar asistencia: ' + error.message
    });
  }
}

  // POST /api/asistencia/masivo
  static async registrarMasivo(req, res) {
  try {
    const { asignacion_docente_id, fecha, dispositivo, registros } = req.body;
 
    if (!asignacion_docente_id || !fecha || !Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'asignacion_docente_id, fecha y registros[] son requeridos'
      });
    }
 
    const resultado = await Asistencia.registrarMasivo({
      asignacion_docente_id: parseInt(asignacion_docente_id),
      fecha,
      marcado_por: req.user.id,
      dispositivo: dispositivo || 'web',
      registros
    });
 
    const reqInfo = RequestInfo.extract(req);
    await ActividadLog.create({
      usuario_id:     req.user.id,
      accion:         'registrar_masivo',
      modulo:         'asistencia',
      tabla_afectada: 'asistencia',
      datos_nuevos:   { asignacion_docente_id, fecha, total: resultado.length },
      ip_address:     reqInfo.ip,
      user_agent:     reqInfo.userAgent,
      resultado:      'exitoso',
      mensaje:        `Asistencia masiva: ${resultado.length} registros para asignación ${asignacion_docente_id}`
    });
 
    // ← NUEVO: notificar padres de ausentes y tardanzas en paralelo
    // req.body.materia_nombre es opcional — el frontend puede enviarlo
    whatsappService.notificarAsistenciaMasiva(resultado, {
      asignacion_docente_id: parseInt(asignacion_docente_id),
      fecha,
      materia_nombre: req.body.materia_nombre || null,
    }).catch(err => console.error('⚠️ Error notificaciones masivas WhatsApp:', err.message));
 
    res.status(201).json({
      success: true,
      message: `${resultado.length} registros de asistencia guardados`,
      data: { total: resultado.length, asistencias: resultado }
    });
  } catch (error) {
    console.error('Error en registro masivo:', error);
    res.status(500).json({
      success: false,
      message: 'Error en registro masivo: ' + error.message
    });
  }
}

  // PATCH /api/asistencia/:id
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const { estado, justificacion, observaciones, solicitud_permiso_id } = req.body;

      const anterior = await Asistencia.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Registro no encontrado' });
      }

      const asistencia = await Asistencia.update(id, {
        estado, justificacion, observaciones, solicitud_permiso_id
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:      req.user.id,
        accion:          'actualizar',
        modulo:          'asistencia',
        tabla_afectada:  'asistencia',
        registro_id:     parseInt(id),
        datos_anteriores:{ estado: anterior.estado },
        datos_nuevos:    { estado: asistencia.estado },
        ip_address:      reqInfo.ip,
        user_agent:      reqInfo.userAgent,
        resultado:       'exitoso',
        mensaje:         `Asistencia actualizada: ${anterior.estado} → ${asistencia.estado}`
      });

      res.json({
        success: true,
        message: 'Registro actualizado exitosamente',
        data: { asistencia }
      });
    } catch (error) {
      console.error('Error al actualizar asistencia:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar: ' + error.message
      });
    }
  }

  // GET /api/asistencia/reporte
  // Query: ?matricula_id=X&asignacion_docente_id=Y&fecha_inicio=Z&fecha_fin=W
  static async getReporte(req, res) {
    try {
      const { matricula_id, asignacion_docente_id, fecha_inicio, fecha_fin } = req.query;

      if (!matricula_id) {
        return res.status(400).json({
          success: false,
          message: 'matricula_id es requerido'
        });
      }

      const reporte = await Asistencia.getReporte({
        matricula_id:          parseInt(matricula_id),
        asignacion_docente_id: asignacion_docente_id ? parseInt(asignacion_docente_id) : null,
        fecha_inicio:          fecha_inicio || null,
        fecha_fin:             fecha_fin    || null
      });

      res.json({ success: true, data: { reporte } });
    } catch (error) {
      console.error('Error al generar reporte:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte: ' + error.message
      });
    }
  }
    // GET /api/asistencia/reporte-clase
  // Query: ?asignacion_docente_id=X&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
  static async getReporteClase(req, res) {
    try {
      const { asignacion_docente_id, fecha_inicio, fecha_fin } = req.query;
 
      if (!asignacion_docente_id) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id es requerido',
        });
      }
 
      const [estudiantes, resumen] = await Promise.all([
        Asistencia.getReporteClase({
          asignacion_docente_id: parseInt(asignacion_docente_id),
          fecha_inicio: fecha_inicio || null,
          fecha_fin:    fecha_fin    || null,
        }),
        Asistencia.getResumenClase({
          asignacion_docente_id: parseInt(asignacion_docente_id),
          fecha_inicio: fecha_inicio || null,
          fecha_fin:    fecha_fin    || null,
        }),
      ]);
 
      res.json({
        success: true,
        data: {
          resumen,
          estudiantes,
        },
      });
    } catch (error) {
      console.error('Error al generar reporte de clase:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar reporte: ' + error.message,
      });
    }
  }
 
  // PATCH /api/asistencia/:id/corregir
  // Permite al docente corregir un registro ya guardado
  static async corregir(req, res) {
    try {
      const { id } = req.params;
      const { estado, justificacion, observaciones, solicitud_permiso_id } = req.body;
 
      if (!estado) {
        return res.status(400).json({
          success: false,
          message: 'El campo estado es requerido',
        });
      }
 
      const estadosValidos = ['presente', 'ausente', 'tardanza', 'justificado', 'falta_parcial'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Estado inválido. Debe ser: ${estadosValidos.join(', ')}`,
        });
      }
 
      const anterior = await Asistencia.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Registro no encontrado' });
      }
 
      const asistencia = await Asistencia.corregir(id, {
        estado,
        justificacion,
        observaciones,
        solicitud_permiso_id,
        corregido_por: req.user.id,
      });
 
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:       req.user.id,
        accion:           'corregir',
        modulo:           'asistencia',
        tabla_afectada:   'asistencia',
        registro_id:      parseInt(id),
        datos_anteriores: { estado: anterior.estado },
        datos_nuevos:     { estado: asistencia.estado },
        ip_address:       reqInfo.ip,
        user_agent:       reqInfo.userAgent,
        resultado:        'exitoso',
        mensaje:          `Asistencia corregida: ${anterior.estado} → ${asistencia.estado}`,
      });
 
      res.json({
        success: true,
        message: 'Asistencia corregida exitosamente',
        data: { asistencia },
      });
    } catch (error) {
      console.error('Error al corregir asistencia:', error);
      const status = error.message.includes('no encontrado') ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }
}

export { SolicitudPermisoController, AsistenciaController };