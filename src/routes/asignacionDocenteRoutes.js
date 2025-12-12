// routes/asignacionDocenteRoutes.js
import express from 'express';
import AsignacionDocenteController from '../controllers/asignacionDocenteController.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';

const router = express.Router();

// Middleware de autenticación
router.use(authenticate);

// ========================================
// RUTAS DE ASIGNACIONES
// ========================================

// POST /asignacion-docente - Asignar docente a materia/paralelo
router.post(
  '/',
  authorize('asignacion_docente.crear'),
  logActivity('asignar', 'asignacion_docente'),
  AsignacionDocenteController.asignar
);

// POST /asignacion-docente/masivo - Asignación masiva
router.post(
  '/masivo',
  authorize('asignacion_docente.crear'),
  logActivity('asignar_masivo', 'asignacion_docente'),
  AsignacionDocenteController.asignarMasivo
);

// POST /asignacion-docente/copiar-periodo - Copiar asignaciones de otro periodo
router.post(
  '/copiar-periodo',
  authorize('asignacion_docente.crear'),
  logActivity('copiar_periodo', 'asignacion_docente'),
  AsignacionDocenteController.copiarDePeriodo
);

// GET /asignacion-docente - Listar asignaciones
router.get(
  '/',
  authorize('asignacion_docente.leer'),
  AsignacionDocenteController.listar
);

// GET /asignacion-docente/docente/:docente_id - Asignaciones de un docente
router.get(
  '/docente/:docente_id',
  authorize('asignacion_docente.leer'),
  AsignacionDocenteController.listarPorDocente
);

// GET /asignacion-docente/paralelo/:paralelo_id - Docentes de un paralelo
router.get(
  '/paralelo/:paralelo_id',
  authorize('asignacion_docente.leer'),
  AsignacionDocenteController.listarPorParalelo
);

// GET /asignacion-docente/:id - Obtener asignación por ID
router.get(
  '/:id',
  authorize('asignacion_docente.leer'),
  AsignacionDocenteController.obtenerPorId
);

// PUT /asignacion-docente/:id - Actualizar asignación
router.put(
  '/:id',
  authorize('asignacion_docente.actualizar'),
  logActivity('actualizar', 'asignacion_docente'),
  AsignacionDocenteController.actualizar
);

// PUT /asignacion-docente/:id/cambiar-docente - Cambiar docente
router.put(
  '/:id/cambiar-docente',
  authorize('asignacion_docente.actualizar'),
  logActivity('cambiar_docente', 'asignacion_docente'),
  AsignacionDocenteController.cambiarDocente
);

// DELETE /asignacion-docente/:id - Eliminar asignación
router.delete(
  '/:id',
  authorize('asignacion_docente.eliminar'),
  logActivity('eliminar', 'asignacion_docente'),
  AsignacionDocenteController.eliminar
);

export default router;