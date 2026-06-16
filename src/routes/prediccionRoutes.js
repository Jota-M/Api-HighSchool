// routes/prediccionRoutes.js
import express from 'express';
import PrediccionController from '../controllers/prediccionController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';
import MaterialAsignadoController from '../controllers/materialAsignadoController.js';

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/prediccion/health
 * Estado del microservicio ML — para el dashboard de administración
 */
router.get(
  '/health',
  PrediccionController.health
);

/**
 * POST /api/prediccion/estudiante
 * Predicción individual de rendimiento
 *
 * Body: { matricula_id, asignacion_docente_id, periodo_evaluacion_id }
 * Query: ?incluir_gemini=true&usar_xgboost=true
 *
 * Responde con:
 *   - nivel_riesgo: bajo / medio / alto / critico
 *   - nota_estimada_final (0-100)
 *   - factores_riesgo y factores_positivos
 *   - analisis Gemini con explicacion + recomendaciones + recursos_sugeridos
 *   - notificacion_alerta (si Gemini detectó urgencia)
 */
router.post(
  '/estudiante',
  authorize('notas.leer'),
  PrediccionController.predecirEstudiante
);

/**
 * POST /api/prediccion/clase
 * Análisis de toda la clase para una asignación docente
 *
 * Body: { asignacion_docente_id, periodo_evaluacion_id, paralelo_id }
 * Query: ?incluir_gemini=true&usar_xgboost=true
 *
 * Responde con:
 *   - total_estudiantes, en_riesgo_critico, en_riesgo_alto, etc.
 *   - promedio_clase, asistencia_promedio, pct_riesgo
 *   - estudiantes[]: detalle individual con nombre_completo
 *   - analisis Gemini con diagnostico + acciones grupales + alerta_institucional
 */
router.post(
  '/clase',
  authorize('notas.leer'),
  PrediccionController.predecirClase
);

/**
 * POST /api/prediccion/plan
 * Plan de recuperación semana a semana (requiere Gemini)
 *
 * Body: { matricula_id, asignacion_docente_id, periodo_evaluacion_id }
 *
 * Responde con:
 *   - nivel_riesgo, nota_estimada
 *   - plan: { objetivo, plan_semanal[], nota_proyectada, involucrar_padres }
 *   - semanas_restantes
 * Retorna plan: null si el riesgo es bajo o quedan menos de 2 semanas
 */
router.post(
  '/plan',
  authorize('notas.boletin'),
  PrediccionController.planRecuperacion
);

/**
 * POST /api/prediccion/simular
 * Simulación de escenarios de intervención pedagógica
 *
 * Body: {
 *   matricula_id, asignacion_docente_id, periodo_evaluacion_id,
 *   escenarios: [
 *     { descripcion: "Si mejora asistencia al 90%", asistencia_proyectada: 90 },
 *     { descripcion: "Si saca 70 en el próximo examen", nota_proximo_examen: 70 },
 *     { descripcion: "En 2 semanas con el mismo ritmo", semanas_adicionales: 2 }
 *   ]
 * }
 * Máximo 5 escenarios por request.
 *
 * Responde con situacion_actual + escenarios[] con cambio_probabilidad y cambio_nota
 */
router.post(
  '/simular',
  authorize('notas.leer'),
  PrediccionController.simular
);
/**
 * POST /api/prediccion/simular/optimo
 * Simulación automática óptima — mínimo esfuerzo para una nota objetivo
 *
 * Body: {
 *   matricula_id, asignacion_docente_id, periodo_evaluacion_id,
 *   objetivo_nota?: number,          // default 51 (aprobar)
 *   restricciones?: {
 *     bloquearPracticas?:  boolean,  // default false
 *     bloquearExamenes?:   boolean,  // default false
 *     bloquearAsistencia?: boolean,  // default false
 *   }
 * }
 *
 * Responde con:
 *   - nota_actual, nota_proyectada, alcanzable
 *   - acciones[]: { componente, label, valor_actual, valor_necesario, delta, dificultad }
 *   - nota_maxima_posible, mensaje
 */
router.post(
  '/simular/optimo',
  authorize('notas.leer'),
  PrediccionController.simularOptimo   
);
/**
 * POST /api/prediccion/simular/optimo/v2
 * Simulación óptima v2 — escenarios con desglose evaluación por evaluación
 *
 * Body: {
 *   matricula_id, asignacion_docente_id, periodo_evaluacion_id,
 *   objetivo_nota?: number,   // default 51
 *   restricciones?: { bloquearPracticas?, bloquearExamenes? }
 * }
 *
 * Responde con escenarios[] detallados, cada uno con evaluaciones[]
 * que indica qué nota sacar en cada examen/práctica restante.
 */
router.post(
  '/simular/optimo/v2',
  authorize('notas.leer'),
  PrediccionController.simularOptimoV2
);

// ─────────────────────────────────────────────────────────────
// Rutas de material asignado
//
// Nota: estas rutas pertenecen semánticamente a materiales,
// no a predicción. Están aquí por conveniencia pero idealmente
// deberían moverse a routes/materialRoutes.js en una futura
// refactorización para que sean más fáciles de encontrar.
// ─────────────────────────────────────────────────────────────

router.post(
  '/asignar-material',
  authorize('material_asignado.crear'),
  MaterialAsignadoController.asignar
);

router.get(
  '/materiales-asignados/:matricula_id',
  authorize('material_asignado.leer'),
  MaterialAsignadoController.listarPorEstudiante
);

router.delete(
  '/asignar-material/:id',
  authorize('material_asignado.eliminar'),
  MaterialAsignadoController.quitar
);

export default router;