// routes/matriculacion.routes.js
import express from 'express';
import MatriculacionController from '../controllers/matriculacionController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// ========================================
// 📋 CONSULTAS Y LISTADOS
// ========================================

/**
 * GET /api/matriculacion/estudiantes-elegibles
 * Listar estudiantes sin matrícula en el periodo
 */
router.get(
  '/estudiantes-elegibles',
  authorize('matricula.consultar'),
  MatriculacionController.listarEstudiantesElegibles
);

/**
 * GET /api/matriculacion/verificar-disponibilidad
 * Verificar capacidad de un paralelo
 */
router.get(
  '/verificar-disponibilidad',
  authorize('matricula.consultar'),
  MatriculacionController.verificarDisponibilidadParalelo
);

/**
 * GET /api/matriculacion/periodo/:periodo_academico_id
 * Listar matrículas de un periodo con filtros
 */
router.get(
  '/periodo/:periodo_academico_id',
  authorize('matricula.consultar'),
  MatriculacionController.obtenerMatriculasPorPeriodo
);

/**
 * GET /api/matriculacion/estadisticas/:periodo_academico_id
 * Obtener estadísticas de matrícula del periodo
 */
router.get(
  '/estadisticas/:periodo_academico_id',
  authorize('matricula.consultar'),
  MatriculacionController.obtenerEstadisticas
);

// ========================================
// ✏️ CREACIÓN Y MODIFICACIÓN
// ========================================

/**
 * POST /api/matriculacion/matricular/:estudiante_id
 * Matricular estudiante existente en nuevo periodo
 */
router.post(
  '/matricular/:estudiante_id',
  authorize('matricula.crear'),
  upload.fields([
    { name: 'documentos', maxCount: 10 }
  ]),
  handleMulterError,
  logActivity('matricular_estudiante', 'matricula'),
  MatriculacionController.matricularEstudiante
);

/**
 * POST /api/matriculacion/rematricular/:estudiante_id
 * Re-matricular estudiante (sin documentos)
 */
router.post(
  '/rematricular/:estudiante_id',
  authorize('matricula.crear'),
  logActivity('rematricular_estudiante', 'matricula'),
  MatriculacionController.rematricularEstudiante
);

/**
 * PUT /api/matriculacion/:id
 * Actualizar matrícula (cambiar paralelo, beca, etc.)
 */
router.put(
  '/:id',
  authorize('matricula.actualizar'),
  logActivity('actualizar_matricula', 'matricula'),
  MatriculacionController.actualizarMatricula
);

/**
 * PATCH /api/matriculacion/:id/retirar
 * Retirar matrícula
 */
router.patch(
  '/:id/retirar',
  authorize('matricula.retirar'),
  logActivity('retirar_matricula', 'matricula'),
  MatriculacionController.retirarMatricula
);

export default router;