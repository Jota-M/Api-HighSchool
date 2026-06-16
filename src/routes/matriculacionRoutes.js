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
  authorize('matriculacion.leer'),
  MatriculacionController.listarEstudiantesElegibles
);

/**
 * GET /api/matriculacion/verificar-disponibilidad
 * Verificar capacidad de un paralelo
 */
router.get(
  '/verificar-disponibilidad',
  authorize('matriculacion.leer'),
  MatriculacionController.verificarDisponibilidadParalelo
);

/**
 * GET /api/matriculacion/periodo/:periodo_academico_id
 * Listar matrículas de un periodo con filtros
 */
router.get(
  '/periodo/:periodo_academico_id',
  authorize('matriculacion.leer'),
  MatriculacionController.obtenerMatriculasPorPeriodo
);

/**
 * GET /api/matriculacion/estadisticas/:periodo_academico_id
 * Obtener estadísticas de matrícula del periodo
 */
router.get(
  '/estadisticas/:periodo_academico_id',
  authorize('matriculacion.leer'),
  MatriculacionController.obtenerEstadisticas
);

/**
 * GET /api/matriculacion/:id
 * Obtener detalle completo de una matrícula
 */
router.get(
  '/:id',
  authorize('matriculacion.leer'),
  MatriculacionController.obtenerMatricula
);

/**
 * GET /api/matriculacion/:id/documentos
 * Listar documentos de una matrícula
 */
router.get(
  '/:id/documentos',
  authorize('matriculacion.leer'),
  MatriculacionController.listarDocumentos
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
  authorize('matriculacion.crear'),
  upload.fields([{ name: 'documentos', maxCount: 10 }]),
  handleMulterError,
  logActivity('matricular_estudiante', 'matriculacion'),
  MatriculacionController.matricularEstudiante
);

/**
 * POST /api/matriculacion/rematricular/:estudiante_id
 * Re-matricular estudiante (sin documentos)
 */
router.post(
  '/rematricular/:estudiante_id',
  authorize('matriculacion.crear'),
  logActivity('rematricular_estudiante', 'matriculacion'),
  MatriculacionController.rematricularEstudiante
);

/**
 * POST /api/matriculacion/:id/documentos
 * Subir documentos a una matrícula existente
 */
router.post(
  '/:id/documentos',
  authorize('matriculacion.crear'),
  upload.fields([{ name: 'documentos', maxCount: 10 }]),
  handleMulterError,
  logActivity('subir_documentos_matricula', 'matricula_documento'),
  MatriculacionController.subirDocumentos
);

/**
 * PUT /api/matriculacion/:id
 * Actualizar matrícula (cambiar paralelo, beca, etc.)
 */
router.put(
  '/:id',
  authorize('matriculacion.actualizar'),
  logActivity('actualizar_matricula', 'matriculacion'),
  MatriculacionController.actualizarMatricula
);

/**
 * PATCH /api/matriculacion/:id/transferir
 * Transferir estudiante a otro paralelo
 */
router.patch(
  '/:id/transferir',
  authorize('matriculacion.actualizar'),
  logActivity('transferir_paralelo', 'matriculacion'),
  MatriculacionController.transferirParalelo
);

/**
 * PATCH /api/matriculacion/:id/retirar
 * Retirar matrícula
 */
router.patch(
  '/:id/retirar',
  authorize('matriculacion.retirar'),
  logActivity('retirar_matricula', 'matriculacion'),
  MatriculacionController.retirarMatricula
);

/**
 * PATCH /api/matriculacion/:id/estado
 * Cambiar estado general (anular, suspender, etc.)
 */
router.patch(
  '/:id/estado',
  authorize('matriculacion.actualizar'),
  logActivity('cambiar_estado_matricula', 'matriculacion'),
  MatriculacionController.cambiarEstado
);

/**
 * PATCH /api/matriculacion/documentos/:doc_id/verificar
 * Verificar un documento de matrícula
 */
router.patch(
  '/documentos/:doc_id/verificar',
  authorize('matriculacion.verificar'),
  logActivity('verificar_documento', 'matricula_documento'),
  MatriculacionController.verificarDocumento
);

/**
 * DELETE /api/matriculacion/:id
 * Soft delete de matrícula
 */
router.delete(
  '/:id',
  authorize('matriculacion.eliminar'),
  logActivity('eliminar_matricula', 'matriculacion'),
  MatriculacionController.eliminarMatricula
);

/**
 * DELETE /api/matriculacion/documentos/:doc_id
 * Eliminar documento de matrícula
 */
router.delete(
  '/documentos/:doc_id',
  authorize('matriculacion.actualizar'),
  logActivity('eliminar_documento_matricula', 'matricula_documento'),
  MatriculacionController.eliminarDocumento
);

export default router;