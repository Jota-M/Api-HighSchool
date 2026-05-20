// routes/alertaRendimientoRoutes.js
import express from 'express';
import AlertaRendimientoController from '../controllers/alertaRendimientoController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// PORTAL DEL PADRE
// ==========================================

/**
 * GET /api/alertas-rendimiento/mis-hijos
 *
 * Resumen de todos los hijos del padre autenticado.
 * Una tarjeta por hijo con el peor nivel de riesgo
 * y el contador de alertas no leídas (para el badge).
 *
 * Requiere: token del padre | permiso: alerta_rendimiento.leer
 */
router.get(
  '/mis-hijos',
  authorize('alerta_rendimiento.leer'),
  AlertaRendimientoController.getMisHijos
);

/**
 * GET /api/alertas-rendimiento/hijo/:estudiante_id
 *
 * Todas las materias activas del hijo con su última alerta ML.
 * Vista principal del portal: una tarjeta por materia
 * ordenada de mayor a menor riesgo.
 *
 * Param: estudiante_id — verificado contra req.user.hijos
 */
router.get(
  '/hijo/:estudiante_id',
  authorize('alerta_rendimiento.leer'),
  AlertaRendimientoController.getPortalHijo
);

/**
 * GET /api/alertas-rendimiento/hijo/:estudiante_id/historial
 *
 * Evolución semana a semana del riesgo en una materia.
 * El padre puede ver si su hijo mejoró o empeoró durante el trimestre.
 *
 * Query: ?asignacion_docente_id=X&trimestre=1
 */
router.get(
  '/hijo/:estudiante_id/historial',
  authorize('alerta_rendimiento.leer'),
  AlertaRendimientoController.getHistorialMateria
);

/**
 * POST /api/alertas-rendimiento/:id/leer
 *
 * El padre confirma que leyó la alerta.
 * Idempotente — llamar dos veces no genera error ni duplicado.
 * El docente verá "Padre notificado ✓" en su panel después de esto.
 */
router.post(
  '/:id/leer',
  authorize('alerta_rendimiento.leer'),
  logActivity('leer', 'alerta_rendimiento'),
  AlertaRendimientoController.marcarLeida
);

// ==========================================
// PANEL DEL DOCENTE
// ==========================================

/**
 * GET /api/alertas-rendimiento/clase
 *
 * El docente ve el estado de riesgo actual de toda su clase
 * con el indicador de si cada padre ya leyó la alerta.
 * Ordenado: crítico → alto → medio → bajo.
 *
 * Query: ?asignacion_docente_id=X&trimestre=1&semana=6
 * Requiere: alerta_rendimiento.leer_clase
 */
router.get(
  '/clase',
  authorize('alerta_rendimiento.leer_clase'),
  AlertaRendimientoController.getEstadoClase
);

export default router;