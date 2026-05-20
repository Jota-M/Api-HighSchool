// routes/evaluacionAdjuntoRoutes.js
// Se monta en notasRoutes.js bajo /api/notas
import express from 'express';
import {
  EvaluacionAdjuntoController,
  EvaluacionRubricaController,
  VistaPublicaController
} from '../controllers/evaluacionAdjuntoController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// VISTA PÚBLICA — padres y estudiantes
// IMPORTANTE: van primero para que no choquen con /:id
// ==========================================

/**
 * GET /api/notas/evaluaciones/publicas
 * Lista evaluaciones publicadas de una materia con estado de nota del estudiante
 * Query: ?asignacion_docente_id=X&periodo_evaluacion_id=Y&matricula_id=Z
 *
 * Caso de uso: el padre abre la app → selecciona materia/trimestre
 * → ve todas las prácticas publicadas con su nota
 */
router.get(
  '/evaluaciones/publicas',
  authorize('evaluacion.ver_publica'),
  VistaPublicaController.listarPublicas
);

/**
 * GET /api/notas/evaluaciones/:id/publica
 * Detalle completo de una evaluación para padres/estudiantes:
 * nombre, instrucciones, foto, PDF, rúbrica y nota obtenida
 * Query: ?matricula_id=X (para incluir la nota del estudiante)
 */
router.get(
  '/evaluaciones/:id/publica',
  authorize('evaluacion.ver_publica'),
  VistaPublicaController.getEvaluacion
);

// ==========================================
// ADJUNTOS — foto y PDF (solo docente)
// ==========================================

/**
 * POST /api/notas/evaluaciones/:id/foto
 * Subir o reemplazar foto del enunciado/práctica
 * Form-data: { foto: File (imagen) }
 */
router.post(
  '/evaluaciones/:id/foto',
  authorize('evaluacion.subir_archivo'),
  upload.single('foto'),
  handleMulterError,
  logActivity('subir_foto', 'evaluacion'),
  EvaluacionAdjuntoController.subirFoto
);

/**
 * DELETE /api/notas/evaluaciones/:id/foto
 * Eliminar foto de la evaluación
 */
router.delete(
  '/evaluaciones/:id/foto',
  authorize('evaluacion.subir_archivo'),
  logActivity('eliminar_foto', 'evaluacion'),
  EvaluacionAdjuntoController.eliminarFoto
);

/**
 * POST /api/notas/evaluaciones/:id/pdf
 * Subir o reemplazar PDF de instrucciones
 * Form-data: { pdf: File (application/pdf) }
 */
router.post(
  '/evaluaciones/:id/pdf',
  authorize('evaluacion.subir_archivo'),
  upload.single('pdf'),
  handleMulterError,
  logActivity('subir_pdf', 'evaluacion'),
  EvaluacionAdjuntoController.subirPdf
);

/**
 * DELETE /api/notas/evaluaciones/:id/pdf
 * Eliminar PDF de la evaluación
 */
router.delete(
  '/evaluaciones/:id/pdf',
  authorize('evaluacion.subir_archivo'),
  logActivity('eliminar_pdf', 'evaluacion'),
  EvaluacionAdjuntoController.eliminarPdf
);

// ==========================================
// PUBLICACIÓN
// ==========================================

/**
 * PATCH /api/notas/evaluaciones/:id/publicar
 * Publicar evaluación → visible para padres y estudiantes
 * Body: { fecha_limite?, instrucciones? }
 *
 * El docente primero sube foto/PDF y configura la rúbrica,
 * luego publica cuando todo está listo.
 */
router.patch(
  '/evaluaciones/:id/publicar',
  authorize('evaluacion.actualizar'),
  logActivity('publicar', 'evaluacion'),
  EvaluacionAdjuntoController.publicar
);

/**
 * PATCH /api/notas/evaluaciones/:id/despublicar
 * Ocultar evaluación a padres/estudiantes (sin borrarla)
 */
router.patch(
  '/evaluaciones/:id/despublicar',
  authorize('evaluacion.actualizar'),
  logActivity('despublicar', 'evaluacion'),
  EvaluacionAdjuntoController.despublicar
);

// ==========================================
// RÚBRICA — criterios de evaluación
// ==========================================

/**
 * GET /api/notas/evaluaciones/:id/rubrica
 * Ver criterios de rúbrica de una evaluación
 */
router.get(
  '/evaluaciones/:id/rubrica',
  authorize('evaluacion.leer'),
  EvaluacionRubricaController.listar
);

/**
 * PUT /api/notas/evaluaciones/:id/rubrica
 * Guardar/reemplazar rúbrica completa en una sola operación
 * Body: {
 *   criterios: [
 *     {
 *       criterio: "Presentación",
 *       descripcion: "Limpieza y orden del trabajo",
 *       puntos_posibles: 20,
 *       nivel_excelente: "Muy limpio y ordenado",
 *       nivel_bueno: "Ordenado con pequeños errores",
 *       nivel_basico: "Poco ordenado",
 *       nivel_insuficiente: "Desordenado e ilegible"
 *     },
 *     ...
 *   ]
 * }
 *
 * La suma de puntos_posibles no puede superar el puntaje_maximo de la evaluación.
 */
router.put(
  '/evaluaciones/:id/rubrica',
  authorize('evaluacion.rubrica_crear'),
  logActivity('actualizar_rubrica', 'evaluacion'),
  EvaluacionRubricaController.reemplazar
);

/**
 * PATCH /api/notas/evaluaciones/rubrica/:criterio_id
 * Editar un solo criterio de la rúbrica sin reemplazar todos
 */
router.patch(
  '/evaluaciones/rubrica/:criterio_id',
  authorize('evaluacion.rubrica_editar'),
  logActivity('editar_criterio_rubrica', 'evaluacion'),
  EvaluacionRubricaController.actualizarCriterio
);

/**
 * DELETE /api/notas/evaluaciones/rubrica/:criterio_id
 * Eliminar un criterio de la rúbrica
 */
router.delete(
  '/evaluaciones/rubrica/:criterio_id',
  authorize('evaluacion.rubrica_editar'),
  logActivity('eliminar_criterio_rubrica', 'evaluacion'),
  EvaluacionRubricaController.eliminarCriterio
);

export default router;