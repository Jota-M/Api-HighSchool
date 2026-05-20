// routes/seguimientoPedagogicoRoutes.js
import express from 'express';
import {
  ObservacionPedagogicaController,
  AcuseReciboController,
  CategoriaObservacionController
} from '../controllers/seguimientoPedagogicoController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// CATÁLOGO — categorías y plantillas rápidas
// ==========================================

/**
 * GET /api/seguimiento/categorias
 * Lista todas las categorías activas con conteo de plantillas
 * Usada al abrir el formulario de nueva observación
 */
router.get(
  '/categorias',
  authorize('categoria_observacion.leer'),
  CategoriaObservacionController.listar
);

/**
 * GET /api/seguimiento/plantillas
 * Lista plantillas rápidas, opcionalmente filtradas por categoría
 * Query: ?categoria_id=X
 */
router.get(
  '/plantillas',
  authorize('observacion_pedagogica.crear'),
  CategoriaObservacionController.listarPlantillas
);

// ==========================================
// OBSERVACIONES — DOCENTE
// ==========================================

/**
 * GET /api/seguimiento/observaciones
 * Lista observaciones con filtros
 * Query: ?matricula_id=X&asignacion_docente_id=Y&nivel_relevancia=urgente&visible_para_padre=false
 */
router.get(
  '/observaciones',
  authorize('observacion_pedagogica.leer'),
  ObservacionPedagogicaController.listar
);

/**
 * GET /api/seguimiento/linea-tiempo
 * Línea de tiempo de un estudiante (stored procedure)
 * Query: ?matricula_id=X&periodo_academico_id=Y&categoria_id=Z&nivel_relevancia=W&solo_visibles_padre=false
 * Usada en el perfil del estudiante para el docente/admin
 */
router.get(
  '/linea-tiempo',
  authorize('observacion_pedagogica.reporte'),
  ObservacionPedagogicaController.getLineaTiempo
);

/**
 * GET /api/seguimiento/resumen-asignacion
 * Resumen de observaciones de todos los estudiantes de un paralelo/materia
 * Query: ?asignacion_docente_id=X&periodo_academico_id=Y
 * Usada en la vista del docente para ver el estado de su lista
 */
router.get(
  '/resumen-asignacion',
  authorize('observacion_pedagogica.reporte'),
  ObservacionPedagogicaController.getResumenPorAsignacion
);

/**
 * GET /api/seguimiento/observaciones/:id
 * Obtiene una observación con su historial y acuses de recibo
 */
router.get(
  '/observaciones/:id',
  authorize('observacion_pedagogica.leer'),
  ObservacionPedagogicaController.obtenerPorId
);

/**
 * GET /api/seguimiento/observaciones/:id/historial
 * Auditoría de cambios de una observación
 */
router.get(
  '/observaciones/:id/historial',
  authorize('observacion_pedagogica.leer'),
  ObservacionPedagogicaController.obtenerHistorial
);

/**
 * POST /api/seguimiento/observaciones
 * El docente crea una observación sobre un estudiante
 * Body: {
 *   matricula_id, periodo_academico_id, categoria_observacion_id,
 *   descripcion, nivel_relevancia?, asignacion_docente_id?,
 *   fecha_ocurrencia?, plantilla_id?, visible_para_padre?
 * }
 */
router.post(
  '/observaciones',
  authorize('observacion_pedagogica.crear'),
  logActivity('crear', 'observacion_pedagogica'),
  ObservacionPedagogicaController.crear
);

/**
 * PATCH /api/seguimiento/observaciones/:id
 * Editar contenido de una observación (descripción, categoría, relevancia, fecha)
 * Solo el docente propietario o un admin debería poder editar
 */
router.patch(
  '/observaciones/:id',
  authorize('observacion_pedagogica.actualizar'),
  logActivity('actualizar', 'observacion_pedagogica'),
  ObservacionPedagogicaController.actualizar
);

/**
 * PATCH /api/seguimiento/observaciones/:id/visibilidad
 * Publica o oculta una observación al padre de familia
 * Body: { visible_para_padre: true | false }
 *
 * Flujo típico:
 *   - Docente crea la observación como interna (visible_para_padre: false)
 *   - Luego decide publicarla → PATCH /visibilidad { visible_para_padre: true }
 *   - El trigger registra fecha_publicacion y genera auditoría
 */
router.patch(
  '/observaciones/:id/visibilidad',
  authorize('observacion_pedagogica.publicar'),
  logActivity('cambiar_visibilidad', 'observacion_pedagogica'),
  ObservacionPedagogicaController.cambiarVisibilidad
);

/**
 * DELETE /api/seguimiento/observaciones/:id
 * Soft delete de una observación (activo = false, deleted_at = now)
 */
router.delete(
  '/observaciones/:id',
  authorize('observacion_pedagogica.eliminar'),
  logActivity('eliminar', 'observacion_pedagogica'),
  ObservacionPedagogicaController.eliminar
);

// ==========================================
// PANEL DEL PADRE DE FAMILIA
// ==========================================

/**
 * GET /api/seguimiento/padre/resumen
 * Resumen de observaciones por hijo para el padre autenticado
 * Muestra cuántas no leídas tiene por estudiante
 * Query: ?padre_familia_id=X&periodo_academico_id=Y
 */
router.get(
  '/padre/resumen',
  authorize('observacion_pedagogica.ver_padre'),
  AcuseReciboController.getResumenPadre
);

/**
 * GET /api/seguimiento/padre/observaciones-hijo
 * Lista todas las observaciones visibles de un hijo específico
 * Incluye si el padre ya las leyó o no
 * Query: ?matricula_id=X&padre_familia_id=Y&periodo_academico_id=Z
 */
router.get(
  '/padre/observaciones-hijo',
  authorize('observacion_pedagogica.ver_padre'),
  AcuseReciboController.getObservacionesHijo
);

/**
 * POST /api/seguimiento/acuse
 * El padre acusa recibo de una observación (marca como leída)
 * Puede incluir un comentario de respuesta opcional
 * Body: { observacion_pedagogica_id, padre_familia_id, comentario_padre? }
 */
router.post(
  '/acuse',
  authorize('observacion_pedagogica.acusar'),
  logActivity('acusar_recibo', 'acuse_recibo_padre'),
  AcuseReciboController.registrar
);

export default router;