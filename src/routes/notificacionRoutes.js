// src/routes/notificacionRoutes.js
import express from 'express';
import { pool } from '../db/pool.js'; // ← FIX #1: faltaba en el controller también
import NotificacionController from '../controllers/notificacionController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

// Todas las rutas requieren estar autenticado
router.use(authenticate);

// ─── Middleware de validación de :id numérico ─────────────────────────────────
// FIX #5: evita que un :id no numérico llegue a la BD y tire un error de tipo
const validarIdNumerico = (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'El id debe ser un número entero positivo' });
  }
  req.params.id = id; // normalizar como número
  next();
};

// =============================================================================
// BANDEJA DEL USUARIO (campana 🔔)
// Solo requieren authenticate — cada endpoint filtra por req.user.id
// =============================================================================

/**
 * GET /api/notificaciones/badge
 * Número de notificaciones internas no leídas (para el ícono de campana)
 * FIX #1: debe estar ANTES de /:id o Express lo captura como id = "badge"
 */
router.get('/badge', NotificacionController.badge);

/**
 * PATCH /api/notificaciones/leer-todas
 * Marca todas las notificaciones internas del usuario como leídas
 * FIX #1: debe estar ANTES de /:id/leer o podría haber ambigüedad futura
 */
router.patch('/leer-todas', NotificacionController.marcarTodasLeidas);

/**
 * GET /api/notificaciones/mis-notificaciones
 * Bandeja interna del usuario autenticado
 * Query: ?solo_no_leidas=true&page=1&limit=20
 * FIX #3: definida una sola vez (estaba duplicada)
 */
router.get('/mis-notificaciones', NotificacionController.misNotificaciones);

/**
 * GET /api/notificaciones/mis-notificaciones/:id
 * Detalle de una notificación propia (incluye foto, adjunto, fecha de envío)
 * NOTA: ruta de dos segmentos → no colisiona con /:id
 */
router.get(
  '/mis-notificaciones/:id',
  validarIdNumerico,
  NotificacionController.miNotificacionDetalle
);

// =============================================================================
// GESTIÓN (secretaria / admin)
// Requieren permisos específicos del módulo notificaciones
// =============================================================================

/**
 * POST /api/notificaciones/enviar-ahora
 * Shortcut: crea Y envía en un solo paso (multipart/form-data)
 * FIX: debe ir ANTES de POST /:id/enviar para evitar futuras ambigüedades
 * Body: { titulo, mensaje, tipo, audiencia, grado_id?, paralelo_id?,
 *         enviar_whatsapp, enviar_email, enviar_interno } + campo foto (file)
 */
router.post(
  '/enviar-ahora',
  authorize('notificaciones.enviar'),
  upload.single('foto'),
  handleMulterError,
  logActivity('enviar_ahora', 'notificaciones'),
  NotificacionController.crearYEnviar
);

/**
 * GET /api/notificaciones
 * Lista todas con resumen de envíos (paginado)
 * Query: ?tipo=aviso_general&estado=enviada&audiencia=padres&fecha_inicio=&fecha_fin=
 */
router.get(
  '/',
  authorize('notificaciones.leer'),
  NotificacionController.listar
);

/**
 * POST /api/notificaciones
 * Crear notificación en estado borrador — NO envía todavía
 * Para enviar luego: POST /:id/enviar
 */
router.post(
  '/',
  authorize('notificaciones.crear'),
  upload.single('foto'),
  handleMulterError,
  logActivity('crear', 'notificaciones'),
  NotificacionController.crear
);

/**
 * GET /api/notificaciones/:id
 * Detalle + resumen de envíos por canal
 */
router.get(
  '/:id',
  validarIdNumerico,
  authorize('notificaciones.leer'),
  NotificacionController.obtenerPorId
);

/**
 * GET /api/notificaciones/:id/resumen
 * Solo el resumen de envíos — útil para polling del frontend mientras se envía
 */
router.get(
  '/:id/resumen',
  validarIdNumerico,
  authorize('notificaciones.leer'),
  NotificacionController.resumenEnvios
);

/**
 * POST /api/notificaciones/:id/enviar
 * Despacha una notificación ya creada: borrador → enviando → enviada
 * Responde inmediatamente; el envío ocurre en background
 */
router.post(
  '/:id/enviar',
  validarIdNumerico,
  authorize('notificaciones.enviar'),
  logActivity('enviar', 'notificaciones'),
  NotificacionController.enviar
);

/**
 * PUT /api/notificaciones/:id
 * Editar borrador (no permite editar notificaciones ya enviadas)
 */
router.put(
  '/:id',
  validarIdNumerico,
  authorize('notificaciones.crear'),
  logActivity('actualizar', 'notificaciones'),
  NotificacionController.actualizar
);

/**
 * DELETE /api/notificaciones/:id
 * Soft delete — solo aplica a borradores/programadas
 */
router.delete(
  '/:id',
  validarIdNumerico,
  authorize('notificaciones.eliminar'),
  logActivity('eliminar', 'notificaciones'),
  NotificacionController.eliminar
);

/**
 * PATCH /api/notificaciones/:id/leer
 * El usuario marca una notificación interna propia como leída
 * FIX #3: definida una sola vez (estaba duplicada)
 */
router.patch(
  '/:id/leer',
  validarIdNumerico,
  NotificacionController.marcarLeido
);

export default router;