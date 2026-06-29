// routes/notasRoutes.js
import express from 'express';
import {
  PeriodoEvaluacionController,
  DimensionEvaluacionController,
  EvaluacionController,
  MisMateriasController,
  CalificacionController,
  NotasCalculoController,
  TareasController,
  TemarioController
} from '../controllers/notasController.js';
import evaluacionAdjuntoRoutes from './evaluacionAdjuntoRoutes.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.get('/sie/ping', authenticate, (req, res) => {
  res.json({ success: true, docente: req.user?.username || 'activo' });
});
router.use(authenticate);

// Montar rutas de adjuntos y rúbrica (foto, PDF, publicar, rúbrica, vista pública)
// Comparten el prefijo /api/notas así que se montan directamente aquí
router.use('/', evaluacionAdjuntoRoutes);

// ==========================================
// MATERIAS DEL DOCENTE AUTENTICADO
// ==========================================

/**
 * GET /api/notas/mis-materias
 * El docente autenticado ve sus materias con resumen de notas
 * Query: ?periodo_evaluacion_id=X (opcional, filtra un trimestre)
 *
 * Flujo de uso en frontend:
 *   1. Docente inicia sesión
 *   2. GET /mis-materias                         → todas sus materias con totales generales
 *   3. GET /mis-materias?periodo_evaluacion_id=2 → filtra por 2do trimestre
 *   4. Selecciona materia → GET /evaluaciones?asignacion_docente_id=X&periodo_evaluacion_id=Y
 *   5. Crea evaluaciones y registra notas
 */
router.get(
  '/mis-materias',
  authorize('notas.leer'),
  MisMateriasController.getMisMaterias
);

// ==========================================
// DIMENSIONES DE EVALUACIÓN (solo lectura)
// ==========================================

/**
 * GET /api/notas/dimensiones
 * Retorna las dimensiones activas: Ser, Saber, Hacer
 */
router.get(
  '/dimensiones',
  authorize('notas.leer'),
  DimensionEvaluacionController.listar
);
router.post(
  '/dimensiones',
  authorize('dimension_evaluacion.crear'),
  logActivity('crear', 'dimension_evaluacion'),
  DimensionEvaluacionController.crear
);

router.put(
  '/dimensiones/:id',
  authorize('dimension_evaluacion.actualizar'),
  logActivity('actualizar', 'dimension_evaluacion'),
  DimensionEvaluacionController.actualizar
);

// ==========================================
// PERÍODOS DE EVALUACIÓN (trimestres)
// ==========================================

/**
 * GET /api/notas/periodos
 * Query: ?periodo_academico_id=X&activo=true
 */
router.get(
  '/periodos',
  authorize('periodo_evaluacion.leer'),
  PeriodoEvaluacionController.listar
);

/**
 * GET /api/notas/periodos/:id
 */
router.get(
  '/periodos/:id',
  authorize('periodo_evaluacion.leer'),
  PeriodoEvaluacionController.obtenerPorId
);

/**
 * POST /api/notas/periodos
 * Crear trimestre (ej: Primer Trimestre, orden: 1)
 */
router.post(
  '/periodos',
  authorize('periodo_evaluacion.crear'),
  logActivity('crear', 'periodo_evaluacion'),
  PeriodoEvaluacionController.crear
);

/**
 * PUT /api/notas/periodos/:id
 */
router.put(
  '/periodos/:id',
  authorize('periodo_evaluacion.actualizar'),
  logActivity('actualizar', 'periodo_evaluacion'),
  PeriodoEvaluacionController.actualizar
);

// ==========================================
// EVALUACIONES
// ==========================================

/**
 * GET /api/notas/evaluaciones
 * Query: ?asignacion_docente_id=X&periodo_evaluacion_id=Y&dimension_evaluacion_id=Z
 */
router.get(
  '/evaluaciones',
  authorize('evaluacion.leer'),
  EvaluacionController.listar
);

/**
 * GET /api/notas/evaluaciones/:id
 */
/**
 * GET /api/notas/temario/:grado_materia_id
 * Temario completo con evaluaciones agrupadas por unidad/tema
 * Query: ?periodo_evaluacion_id=X (opcional)
 *
 * Flujo de uso:
 *   Docente abre la pantalla "crear evaluación"
 *   → llama este endpoint para poblar el selector de tema
 *   → elige Unidad 2 → Tema 3 → llena el formulario
 *   → POST /evaluaciones con tema_id incluido
 */
router.get(
  '/temario/:grado_materia_id',
  authorize('evaluacion.leer'),
  TemarioController.getTemario
);

/**
 * GET /api/notas/evaluaciones/tema/:tema_id
 * Evaluaciones de un tema específico (usa la función PG)
 * Query: ?periodo_evaluacion_id=X (opcional)
 *
 * Útil para mostrar en la vista del temario cuántas
 * evaluaciones tiene cada tema y cuáles son.
 */
router.get(
  '/evaluaciones/tema/:tema_id',
  authorize('evaluacion.leer'),
  async (req, res) => {
    try {
      const { tema_id } = req.params;
      const { periodo_evaluacion_id } = req.query;

      const result = await pool.query(
        `SELECT * FROM evaluaciones_por_tema($1, $2)`,
        [parseInt(tema_id), periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : null]
      );

      res.json({ success: true, data: { evaluaciones: result.rows } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

router.get(
  '/evaluaciones/:id',
  authorize('evaluacion.leer'),
  EvaluacionController.obtenerPorId
);

/**
 * POST /api/notas/evaluaciones
 * El docente crea una evaluación para su materia
 */
router.post(
  '/evaluaciones',
  authorize('evaluacion.crear'),
  logActivity('crear', 'evaluacion'),
  EvaluacionController.crear
);

/**
 * PUT /api/notas/evaluaciones/:id
 */
router.put(
  '/evaluaciones/:id',
  authorize('evaluacion.actualizar'),
  logActivity('actualizar', 'evaluacion'),
  EvaluacionController.actualizar
);

/**
 * DELETE /api/notas/evaluaciones/:id
 * Desactiva la evaluación (soft delete)
 */
router.delete(
  '/evaluaciones/:id',
  authorize('evaluacion.eliminar'),
  logActivity('eliminar', 'evaluacion'),
  EvaluacionController.eliminar
);

// ==========================================
// CALIFICACIONES
// ==========================================

/**
 * GET /api/notas/calificaciones/evaluacion/:evaluacion_id
 * Lista todos los estudiantes del paralelo con su nota para esa evaluación
 * (incluye estudiantes sin nota aún)
 */
router.get(
  '/calificaciones/evaluacion/:evaluacion_id',
  authorize('notas.leer'),
  CalificacionController.listarPorEvaluacion
);

/**
 * GET /api/notas/calificaciones/matricula/:matricula_id/periodo/:periodo_evaluacion_id
 * Todas las notas de un estudiante en un período (agrupadas por dimensión)
 */
router.get(
  '/calificaciones/matricula/:matricula_id/periodo/:periodo_evaluacion_id',
  authorize('notas.leer'),
  CalificacionController.listarPorMatriculaPeriodo
);

/**
 * POST /api/notas/calificaciones
 * Registrar o actualizar nota individual
 * Body: { evaluacion_id, matricula_id, puntaje_obtenido, esta_ausente?, observacion? }
 */
router.post(
  '/calificaciones',
  authorize('notas.crear'),
  logActivity('registrar', 'calificacion'),
  CalificacionController.registrar
);

/**
 * POST /api/notas/calificaciones/masivo
 * Registrar notas de toda la lista de una evaluación
 * Body: { evaluacion_id, registros: [{ matricula_id, puntaje_obtenido, esta_ausente?, observacion? }] }
 */
router.post(
  '/calificaciones/masivo',
  authorize('notas.crear'),
  logActivity('registrar_masivo', 'calificacion'),
  CalificacionController.registrarMasivo
);

// ==========================================
// CÁLCULO Y BOLETÍN
// ==========================================

/**
 * GET /api/notas/boletin/:matricula_id/:periodo_evaluacion_id
 * Boletín completo: nota por materia con desglose Ser/Saber/Hacer
 */
router.get(
  '/boletin/:matricula_id/:periodo_evaluacion_id',
  authorize('notas.boletin'),
  NotasCalculoController.getBoletin
);

/**
 * GET /api/notas/dimension-notas/:matricula_id/:grado_materia_id/:periodo_evaluacion_id
 * Notas por dimensión de una materia específica
 */
router.get(
  '/dimension-notas/:matricula_id/:grado_materia_id/:periodo_evaluacion_id',
  authorize('notas.leer'),
  NotasCalculoController.getNotasDimension
);

/**
 * POST /api/notas/calcular
 * Recalcular nota final de una materia en un período
 * Body: { matricula_id, grado_materia_id, periodo_evaluacion_id }
 * Se llama después de registrar/actualizar calificaciones
 */
router.post(
  '/calcular',
  authorize('notas.actualizar'),
  NotasCalculoController.calcular
);

/**
 * PATCH /api/notas/cerrar-periodo
 * Bloquear edición de notas de una materia/período (el docente "cierra" el trimestre)
 * Body: { matricula_id, grado_materia_id, periodo_evaluacion_id }
 */
router.patch(
  '/cerrar-periodo',
  authorize('notas.cerrar'),
  logActivity('cerrar_periodo', 'notas'),
  NotasCalculoController.cerrarPeriodo
);

// Exportar notas para subir al SIE
router.get(
  '/exportar-sie',
  authorize('notas.boletin'),
  NotasCalculoController.exportarParaSIE
);

/**
 * PATCH /api/notas/nota-manual
 * Aplicar nota manual (requiere permiso especial: notas.manual)
 * Body: { matricula_id, grado_materia_id, periodo_evaluacion_id, nota_manual, justificacion_manual }
 */
router.patch(
  '/nota-manual',
  authorize('notas.manual'),
  logActivity('nota_manual', 'notas'),
  NotasCalculoController.aplicarNotaManual
);
// /**
//  * GET /api/notas/tareas/:matricula_id
//  * Evaluaciones visibles con estado de entrega para el padre.
//  * Query: ?periodo_evaluacion_id=X&estado=pendiente|entregado|atrasado
//  */
router.get(
  '/tareas/:matricula_id',
  authorize('notas.leer'),
  TareasController.listarTareas
);

router.patch(
    '/cerrar-periodo-clase',
    authorize('notas.cerrar'),
    logActivity('cerrar_periodo_clase', 'notas'),
    NotasCalculoController.cerrarPeriodoClase
  );

export default router;