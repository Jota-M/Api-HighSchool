// routes/horarioRoutes.js
import express from 'express';
import { BloqueHorarioController, HorarioController, HorarioDetalleController } from '../controllers/horarioController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// 🕐 BLOQUES HORARIOS
// ==========================================

/**
 * GET /api/horarios/bloques
 * Listar bloques horarios (filtros: turno_id, activo, incluir_recreos)
 */
router.get(
  '/bloques',
  authorize('bloque_horario.leer'),
  BloqueHorarioController.listar
);

/**
 * POST /api/horarios/bloques
 * Crear bloque horario
 */
router.post(
  '/bloques',
  authorize('bloque_horario.crear'),
  logActivity('crear', 'bloque_horario'),
  BloqueHorarioController.crear
);

/**
 * PUT /api/horarios/bloques/:id
 * Editar bloque horario
 */
router.put(
  '/bloques/:id',
  authorize('bloque_horario.actualizar'),
  logActivity('actualizar', 'bloque_horario'),
  BloqueHorarioController.actualizar
);

/**
 * DELETE /api/horarios/bloques/:id
 * Desactivar bloque horario
 */
router.delete(
  '/bloques/:id',
  authorize('bloque_horario.eliminar'),
  logActivity('eliminar', 'bloque_horario'),
  BloqueHorarioController.eliminar
);

/**
 * GET /api/horarios/bloques/:id
 * Obtener bloque por ID
 */
router.get(
  '/bloques/:id',
  authorize('bloque_horario.leer'),
  BloqueHorarioController.obtenerPorId
);

// ==========================================
// 🔍 VISTAS ESPECIALES (antes de /:id)
// ==========================================

/**
 * GET /api/horarios/conflicto
 * Verificar conflicto de docente antes de asignar
 * Query: asignacion_docente_id, dia_semana, bloque_horario_id, periodo_academico_id, excluir_detalle_id?
 */
router.get(
  '/conflicto',
  authorize('horario.leer'),
  HorarioDetalleController.verificarConflicto
);

/**
 * GET /api/horarios/docente/:docente_id
 * Horario semanal completo de un docente
 * Query: periodo_academico_id (requerido)
 */
router.get(
  '/docente/:docente_id',
  authorize('horario.leer'),
  HorarioController.horarioDocente
);

/**
 * GET /api/horarios/paralelo/:paralelo_id
 * Horario semanal de un paralelo (para padres/alumnos)
 * Query: periodo_academico_id (requerido)
 */
router.get(
  '/paralelo/:paralelo_id',
  authorize('horario.leer'),
  HorarioController.horarioParalelo
);

// ==========================================
// 📅 HORARIOS (cabecera)
// ==========================================

/**
 * GET /api/horarios
 * Listar horarios (filtros: periodo_academico_id, paralelo_id, estado, grado_id, nivel_academico_id)
 */
router.get(
  '/',
  authorize('horario.leer'),
  HorarioController.listar
);

/**
 * POST /api/horarios
 * Crear horario para un paralelo/período
 * Body: { paralelo_id, periodo_academico_id, nombre?, observaciones? }
 */
router.post(
  '/',
  authorize('horario.crear'),
  logActivity('crear', 'horario'),
  HorarioController.crear
);

/**
 * PUT /api/horarios/:id
 * Editar cabecera del horario (nombre, observaciones)
 */
router.put(
  '/:id',
  authorize('horario.actualizar'),
  logActivity('actualizar', 'horario'),
  HorarioController.actualizar
);

/**
 * PATCH /api/horarios/:id/estado
 * Cambiar estado: borrador → publicado → archivado
 * Body: { estado }
 */
router.patch(
  '/:id/estado',
  authorize('horario.publicar'),
  logActivity('cambiar_estado', 'horario'),
  HorarioController.cambiarEstado
);

/**
 * DELETE /api/horarios/:id
 * Soft delete del horario (solo si está en borrador)
 */
router.delete(
  '/:id',
  authorize('horario.eliminar'),
  logActivity('eliminar', 'horario'),
  HorarioController.eliminar
);

// ==========================================
// 🗓️ DETALLE DEL HORARIO (celdas día × bloque)
// ==========================================

/**
 * GET /api/horarios/:id/detalle
 * Obtener todas las celdas del horario (grilla semanal completa)
 */
router.get(
  '/:id/detalle',
  authorize('horario.leer'),
  HorarioDetalleController.listar
);

/**
 * POST /api/horarios/:id/detalle
 * Agregar celda al horario
 * Body: { dia_semana, bloque_horario_id, grado_materia_id, asignacion_docente_id?, aula?, color? }
 */
router.post(
  '/:id/detalle',
  authorize('horario.actualizar'),
  logActivity('crear', 'horario_detalle'),
  HorarioDetalleController.agregar
);

/**
 * PUT /api/horarios/:id/detalle/:det_id
 * Editar una celda del horario
 */
router.put(
  '/:id/detalle/:det_id',
  authorize('horario.actualizar'),
  logActivity('actualizar', 'horario_detalle'),
  HorarioDetalleController.actualizar
);

/**
 * DELETE /api/horarios/:id/detalle/:det_id
 * Eliminar (desactivar) una celda del horario
 */
router.delete(
  '/:id/detalle/:det_id',
  authorize('horario.actualizar'),
  logActivity('eliminar', 'horario_detalle'),
  HorarioDetalleController.eliminar
);

/**
 * GET /api/horarios/:id  ← SIEMPRE AL FINAL
 * Obtener horario completo con todas sus celdas
 */
router.get(
  '/:id',
  authorize('horario.leer'),
  HorarioController.obtenerPorId
);

export default router;