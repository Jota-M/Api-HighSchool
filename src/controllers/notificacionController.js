// src/controllers/notificacionController.js
import NotificacionInstitucional from '../models/Notificacion.js';
import notificacionDispatcher    from '../utils/notificacionDispatcher.js';
import ActividadLog              from '../models/actividadLog.js';
import RequestInfo               from '../utils/requestInfo.js';
import UploadFile                from '../utils/uploadFile.js';
import { pool } from '../db/pool.js';  

class NotificacionController {

  // GET /api/notificaciones
  static async listar(req, res) {
    try {
      const { page, limit, tipo, estado, audiencia, fecha_inicio, fecha_fin } = req.query;

      const result = await NotificacionInstitucional.findAll({
        page:        parseInt(page)  || 1,
        limit:       parseInt(limit) || 20,
        tipo, estado, audiencia,
        creada_por:  req.query.creada_por ? parseInt(req.query.creada_por) : undefined,
        fecha_inicio, fecha_fin,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // GET /api/notificaciones/:id
  static async obtenerPorId(req, res) {
    try {
      const notif = await NotificacionInstitucional.findById(req.params.id);
      if (!notif) return res.status(404).json({ success: false, message: 'No encontrada' });

      const resumen = await NotificacionInstitucional.getResumenEnvios(req.params.id);
      res.json({ success: true, data: { notificacion: notif, resumen } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // POST /api/notificaciones
  // Crea en estado borrador. Para enviar: POST /:id/enviar
  static async crear(req, res) {
    try {
      const {
        titulo, mensaje, tipo, prioridad, audiencia,
        nivel_academico_id, grado_id, paralelo_id, periodo_academico_id,
        destinatario_usuario_id,
        enviar_whatsapp, enviar_email, enviar_interno,
        programada_para, adjunto_url, adjunto_nombre,
      } = req.body;

      if (!titulo || !mensaje || !tipo || !audiencia) {
        return res.status(400).json({
          success: false,
          message: 'titulo, mensaje, tipo y audiencia son requeridos',
        });
      }

      const tiposValidos = [
        'aviso_general', 'pago_vencido',
        'comunicado_grado', 'notificacion_individual',
      ];
      if (!tiposValidos.includes(tipo)) {
        return res.status(400).json({
          success: false,
          message: `tipo inválido. Opciones: ${tiposValidos.join(', ')}`,
        });
      }

      if (audiencia === 'individual' && !destinatario_usuario_id) {
        return res.status(400).json({
          success: false,
          message: 'destinatario_usuario_id es requerido para audiencia individual',
        });
      }

      // ── Subir foto a Cloudinary si viene adjunta ──────────────
      let foto_url = null;
      let foto_public_id = null;

      if (req.file) {
        const ext = req.file.originalname.split('.').pop();
        const uploadResult = await UploadFile.uploadFromBuffer(
          req.file.buffer,
          'notificaciones_fotos',
          `notif_${Date.now()}.${ext}`,
          'image'
        );
        foto_url       = uploadResult.url;
        foto_public_id = uploadResult.public_id;
      }

      const notif = await NotificacionInstitucional.create({
        titulo, mensaje, tipo, prioridad, audiencia,
        nivel_academico_id, grado_id, paralelo_id, periodo_academico_id,
        destinatario_usuario_id,
        enviar_whatsapp: enviar_whatsapp ?? true,
        enviar_email:    enviar_email    ?? true,
        enviar_interno:  enviar_interno  ?? true,
        programada_para, adjunto_url, adjunto_nombre,
        foto_url, foto_public_id,
        creada_por: req.user.id,
      });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id, accion: 'crear',
        modulo: 'notificaciones', tabla_afectada: 'notificacion_institucional',
        registro_id: notif.id, datos_nuevos: notif,
        ip_address: reqInfo.ip, user_agent: reqInfo.userAgent,
        resultado: 'exitoso', mensaje: `Notificación creada: ${titulo}`,
      });

      res.status(201).json({
        success: true,
        message: 'Notificación creada. Usá POST /:id/enviar para despacharla.',
        data: { notificacion: notif },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // POST /api/notificaciones/:id/enviar
  // Resuelve destinatarios y despacha por todos los canales activos
  static async enviar(req, res) {
    try {
      const { id } = req.params;

      const notif = await NotificacionInstitucional.findById(id);
      if (!notif) {
        return res.status(404).json({ success: false, message: 'Notificación no encontrada' });
      }
      if (['enviando', 'enviada'].includes(notif.estado)) {
        return res.status(409).json({
          success: false,
          message: `La notificación ya está en estado "${notif.estado}"`,
        });
      }

      // Despachar en background — respondemos inmediatamente
      // Para notificaciones masivas esto puede tardar varios segundos
      res.json({
        success: true,
        message: 'Envío iniciado. Podés consultar el estado en GET /:id',
        data: { notificacion_id: parseInt(id), estado: 'enviando' },
      });

      // Despachar después de responder
      notificacionDispatcher.despachar(parseInt(id))
        .then(r => console.log(`✅ Notif #${id} despachada:`, JSON.stringify(r)))
        .catch(e => console.error(`❌ Error despachando notif #${id}:`, e.message));

    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // POST /api/notificaciones/enviar-ahora
  // Crea Y envía en un solo paso (shortcut para la secretaria)
  static async crearYEnviar(req, res) {
  try {
    const {
      titulo, mensaje, tipo, prioridad, audiencia,
      nivel_academico_id, grado_id, paralelo_id, periodo_academico_id,
      destinatario_usuario_id,
      adjunto_url, adjunto_nombre,
    } = req.body;

    // ── Parsear booleanos que vienen como string desde multipart ──
    const parseBool = (val, fallback = true) => {
      if (val === undefined || val === null) return fallback;
      if (typeof val === 'boolean') return val;
      return val === 'true';
    };

    const enviar_whatsapp = parseBool(req.body.enviar_whatsapp);
    const enviar_email    = parseBool(req.body.enviar_email);
    const enviar_interno  = parseBool(req.body.enviar_interno);

    if (!titulo || !mensaje || !tipo || !audiencia) {
      return res.status(400).json({
        success: false,
        message: 'titulo, mensaje, tipo y audiencia son requeridos',
      });
    }

    let foto_url = null;
    let foto_public_id = null;
    if (req.file) {
      const ext = req.file.originalname.split('.').pop();
      const uploadResult = await UploadFile.uploadFromBuffer(
        req.file.buffer,
        'notificaciones_fotos',
        `notif_${Date.now()}.${ext}`,
        'image'
      );
      foto_url       = uploadResult.url;
      foto_public_id = uploadResult.public_id;
    }

    const notif = await NotificacionInstitucional.create({
      titulo, mensaje, tipo, prioridad, audiencia,
      nivel_academico_id, grado_id, paralelo_id, periodo_academico_id,
      destinatario_usuario_id,
      enviar_whatsapp,
      enviar_email,
      enviar_interno,
      programada_para: null,
      adjunto_url, adjunto_nombre,
      foto_url, foto_public_id,
      creada_por: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Notificación creada y enviando...',
      data: { notificacion: notif },
    });

    notificacionDispatcher.despachar(notif.id)
      .catch(e => console.error(`❌ Error despachando notif #${notif.id}:`, e.message));

  } catch (error) {
    console.error('❌ crearYEnviar error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

  // PUT /api/notificaciones/:id
  static async actualizar(req, res) {
    try {
      const notif = await NotificacionInstitucional.update(req.params.id, req.body);
      if (!notif) {
        return res.status(404).json({
          success: false,
          message: 'Notificación no encontrada o no editable (ya enviada)',
        });
      }
      res.json({ success: true, data: { notificacion: notif } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // DELETE /api/notificaciones/:id
  static async eliminar(req, res) {
    try {
      const notif = await NotificacionInstitucional.softDelete(req.params.id);
      if (!notif) {
        return res.status(404).json({
          success: false,
          message: 'Notificación no encontrada o no eliminable',
        });
      }
      res.json({ success: true, message: 'Notificación eliminada' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // GET /api/notificaciones/:id/resumen
  static async resumenEnvios(req, res) {
    try {
      const resumen = await NotificacionInstitucional.getResumenEnvios(req.params.id);
      res.json({ success: true, data: { resumen } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ── Endpoints para el usuario receptor ──────────────────────

  // GET /api/notificaciones/mis-notificaciones
  // El usuario autenticado ve su bandeja de notificaciones internas (campana)
  static async misNotificaciones(req, res) {
    try {
      const { solo_no_leidas, page, limit } = req.query;
      const result = await NotificacionInstitucional.getMisNotificaciones(
        req.user.id,
        {
          soloNoLeidas: solo_no_leidas === 'true',
          page:  parseInt(page)  || 1,
          limit: parseInt(limit) || 20,
        }
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // PATCH /api/notificaciones/:id/leer
  // El usuario marca una notificación interna como leída
  static async marcarLeido(req, res) {
    try {
      const result = await NotificacionInstitucional.marcarLeido(
        req.params.id,
        req.user.id
      );
      res.json({ success: true, data: { leido: true, registro: result } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
  // GET /api/notificaciones/badge — solo el número de no leídas
static async badge(req, res) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS no_leidas
      FROM notificacion_destinatario nd
      INNER JOIN notificacion_institucional ni ON nd.notificacion_id = ni.id
      WHERE nd.usuario_id = $1
        AND nd.canal      = 'interno'
        AND nd.leido      = false
        AND ni.deleted_at IS NULL
    `, [req.user.id]);

    res.json({ success: true, data: { no_leidas: parseInt(result.rows[0].no_leidas) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// PATCH /api/notificaciones/leer-todas
static async marcarTodasLeidas(req, res) {
  try {
    await pool.query(`
      UPDATE notificacion_destinatario nd
      SET leido = true, leido_en = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      FROM notificacion_institucional ni
      WHERE nd.notificacion_id = ni.id
        AND nd.usuario_id      = $1
        AND nd.canal           = 'interno'
        AND nd.leido           = false
        AND ni.deleted_at      IS NULL
    `, [req.user.id]);

    res.json({ success: true, message: 'Todas marcadas como leídas' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// GET /api/notificaciones/mis-notificaciones/:id — detalle para el tutor
static async miNotificacionDetalle(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        nd.id         AS destinatario_id,
        nd.leido,
        nd.leido_en,
        ni.id         AS notificacion_id,
        ni.titulo,
        ni.mensaje,
        ni.tipo,
        ni.prioridad,
        ni.adjunto_url,
        ni.adjunto_nombre,
        ni.foto_url,
        ni.enviada_en
      FROM notificacion_destinatario nd
      INNER JOIN notificacion_institucional ni ON nd.notificacion_id = ni.id
      WHERE ni.id          = $1
        AND nd.usuario_id  = $2   -- ← solo puede ver las suyas
        AND nd.canal       = 'interno'
        AND ni.deleted_at  IS NULL
    `, [req.params.id, req.user.id]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'No encontrada' });
    }

    res.json({ success: true, data: { notificacion: result.rows[0] } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
}

export default NotificacionController;