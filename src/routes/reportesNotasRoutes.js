// routes/reportesNotasRoutes.js
import express                    from 'express';
import ReportesNotasController    from '../controllers/reportesNotasController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/reportes/notas/boletin
 * Boletín completo: nota Ser/Saber/Hacer/Auto por estudiante en un trimestre
 * Query: ?asignacion_docente_id=X&periodo_evaluacion_id=Y&formato=pdf|excel
 * Acceso: docente (notas.boletin) + padre (notas.leer)
 */
router.get('/boletin',               authorize('notas.boletin'), ReportesNotasController.reporteBoletin);

/**
 * GET /api/reportes/notas/evaluacion
 * Lista de notas de todos los estudiantes para una evaluación específica
 * Query: ?evaluacion_id=X&formato=pdf|excel
 * Acceso: docente
 */
router.get('/evaluacion',            authorize('notas.leer'),    ReportesNotasController.reporteEvaluacion);

/**
 * GET /api/reportes/notas/dimension
 * Detalle de notas dentro de una dimensión (Ser, Saber, Hacer o Auto)
 * Query: ?asignacion_docente_id=X&periodo_evaluacion_id=Y&dimension_id=Z&formato=pdf|excel
 * Acceso: docente
 */
router.get('/dimension',             authorize('notas.leer'),    ReportesNotasController.reporteDimension);

/**
 * GET /api/reportes/notas/comparativo-trimestral
 * Notas finales T1 / T2 / T3 por estudiante en una materia
 * Query: ?asignacion_docente_id=X&formato=pdf|excel
 * Acceso: docente + padre
 */
router.get('/comparativo-trimestral', authorize('notas.boletin'), ReportesNotasController.reporteComparativoTrimestral);

/**
 * GET /api/reportes/notas/estudiante
 * Reporte individual: detalle de evaluaciones + dimensiones + nota final
 * Query: ?asignacion_docente_id=X&matricula_id=Y&periodo_evaluacion_id=Z&formato=pdf|excel
 * Acceso: docente + padre (el padre solo puede ver a sus hijos — validado en el controller)
 */
router.get('/estudiante',            authorize('notas.leer'),    ReportesNotasController.reporteEstudianteNotas);

/**
 * GET /api/reportes/notas/resumen-clase
 * Resumen general de la clase: nota final + dimensiones de cada estudiante
 * Query: ?asignacion_docente_id=X&periodo_evaluacion_id=Y&formato=pdf|excel
 * Acceso: docente
 */
router.get('/resumen-clase',         authorize('notas.leer'),    ReportesNotasController.reporteResumenClase);

export default router;