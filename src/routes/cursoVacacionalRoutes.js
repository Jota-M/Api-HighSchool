// routes/cursoVacacionalRoutes.js
import express from 'express';
import CursoVacacionalController from '../controllers/cursoVacacionalController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

// ==========================================
// RUTAS PÚBLICAS (sin autenticación)
// ==========================================

router.get(
  '/publico/periodo-activo',
  CursoVacacionalController.obtenerPeriodoActivo
);

router.get(
  '/publico/cursos',
  CursoVacacionalController.listarCursos
);

router.get(
  '/publico/cursos/:id',
  CursoVacacionalController.obtenerCurso
);

router.post(
  '/publico/inscribir',
  upload.single('comprobante'),
  handleMulterError,
  CursoVacacionalController.inscribir
);

// ==========================================
// PERIODOS VACACIONALES (protegidas)
// ==========================================

router.post(
  '/periodos',
  authenticate,  // ← Middleware específico por ruta
  authorize('curso_vacacional.crear'),
  logActivity('crear_periodo_vacacional', 'periodo_vacacional'),
  CursoVacacionalController.crearPeriodo
);

router.get(
  '/periodos',
  authenticate,  // ← Middleware específico por ruta
  authorize('curso_vacacional.ver'),
  CursoVacacionalController.listarPeriodos
);

router.get(
  '/periodos/:id',
  authenticate,
  authorize('curso_vacacional.ver'),
  CursoVacacionalController.obtenerPeriodo
);

router.put(
  '/periodos/:id',
  authenticate,
  authorize('curso_vacacional.actualizar'),
  logActivity('actualizar_periodo_vacacional', 'periodo_vacacional'),
  CursoVacacionalController.actualizarPeriodo
);

router.delete(
  '/periodos/:id',
  authenticate,
  authorize('curso_vacacional.eliminar'),
  logActivity('eliminar_periodo_vacacional', 'periodo_vacacional'),
  CursoVacacionalController.eliminarPeriodo
);

router.get(
  '/periodos/:periodo_id/estadisticas',
  authenticate,
  authorize('curso_vacacional.ver'),
  CursoVacacionalController.obtenerEstadisticas
);

// ==========================================
// CURSOS VACACIONALES (protegidas)
// ==========================================

router.post(
  '/cursos',
  authenticate,
  authorize('curso_vacacional.crear'),
  logActivity('crear_curso_vacacional', 'curso_vacacional'),
  CursoVacacionalController.crearCurso
);

router.get(
  '/cursos',
  authenticate,
  authorize('curso_vacacional.ver'),
  CursoVacacionalController.listarCursos
);

router.get(
  '/cursos/:id',
  authenticate,
  authorize('curso_vacacional.ver'),
  CursoVacacionalController.obtenerCurso
);

router.put(
  '/cursos/:id',
  authenticate,
  authorize('curso_vacacional.actualizar'),
  logActivity('actualizar_curso_vacacional', 'curso_vacacional'),
  CursoVacacionalController.actualizarCurso
);

router.delete(
  '/cursos/:id',
  authenticate,
  authorize('curso_vacacional.eliminar'),
  logActivity('eliminar_curso_vacacional', 'curso_vacacional'),
  CursoVacacionalController.eliminarCurso
);

router.get(
  '/cursos/:curso_id/estudiantes',
  authenticate,
  authorize('curso_vacacional.ver'),
  CursoVacacionalController.listarEstudiantesCurso
);

router.get(
  '/cursos/:curso_id/reporte',
  authenticate,
  authorize('curso_vacacional.ver'),
  CursoVacacionalController.generarReporte
);

// ==========================================
// INSCRIPCIONES (protegidas)
// ==========================================

router.post(
  '/inscripciones',
  authenticate,
  authorize('curso_vacacional.crear'),
  upload.single('comprobante'),
  handleMulterError,
  logActivity('crear_inscripcion_vacacional', 'inscripcion_vacacional'),
  CursoVacacionalController.inscribir
);

router.get(
  '/inscripciones',
  authenticate,
  authorize('curso_vacacional.ver'),
  CursoVacacionalController.listarInscripciones
);

router.get(
  '/inscripciones/:id',
  authenticate,
  authorize('curso_vacacional.ver'),
  CursoVacacionalController.obtenerInscripcion
);

router.put(
  '/inscripciones/:id',
  authenticate,
  authorize('curso_vacacional.actualizar'),
  logActivity('actualizar_inscripcion_vacacional', 'inscripcion_vacacional'),
  CursoVacacionalController.actualizarInscripcion
);

router.post(
  '/inscripciones/:id/verificar-pago',
  authenticate,
  authorize('curso_vacacional.verificar_pago'),
  logActivity('verificar_pago_vacacional', 'inscripcion_vacacional'),
  CursoVacacionalController.verificarPago
);

router.put(
  '/inscripciones/:id/cambiar-estado',
  authenticate,
  authorize('curso_vacacional.actualizar'),
  logActivity('cambiar_estado_inscripcion_vacacional', 'inscripcion_vacacional'),
  CursoVacacionalController.cambiarEstado
);

router.delete(
  '/inscripciones/:id',
  authenticate,
  authorize('curso_vacacional.eliminar'),
  logActivity('eliminar_inscripcion_vacacional', 'inscripcion_vacacional'),
  CursoVacacionalController.eliminarInscripcion
);

export default router;