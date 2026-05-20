// routes/reportesAsistenciaRoutes.js
import express                              from 'express';
import ReportesAsistenciaController         from '../controllers/reportesAsistenciaController.js';
import { authenticate, authorize }          from '../Middlewares/auth.js';

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/reportes/asistencia/pase-dia
 * Pase de lista de un día específico
 * Query: ?asignacion_docente_id=X&fecha=YYYY-MM-DD&formato=pdf|excel
 */
router.get('/pase-dia',         authorize('asistencia.reporte'), ReportesAsistenciaController.reportePaseDia);

/**
 * GET /api/reportes/asistencia/periodo-clase
 * Reporte del período completo de la clase
 * Query: ?asignacion_docente_id=X&fecha_inicio=&fecha_fin=&formato=pdf|excel
 */
router.get('/periodo-clase',    authorize('asistencia.reporte'), ReportesAsistenciaController.reportePeriodoClase);

/**
 * GET /api/reportes/asistencia/estudiante
 * Reporte individual de un estudiante
 * Query: ?matricula_id=X&asignacion_docente_id=Y&fecha_inicio=&fecha_fin=&formato=pdf|excel
 */
router.get('/estudiante',       authorize('asistencia.reporte'), ReportesAsistenciaController.reporteEstudiante);

/**
 * GET /api/reportes/asistencia/trimestres
 * Comparativo de asistencia por trimestres (períodos de evaluación)
 * Query: ?asignacion_docente_id=X&formato=pdf|excel&tipo=clase|estudiante&matricula_id=Y
 */
router.get('/trimestres',       authorize('asistencia.reporte'), ReportesAsistenciaController.reporteTrimestres);

/**
 * GET /api/reportes/asistencia/comparativo-materias
 * Comparativo de asistencia de un estudiante en todas sus materias
 * Query: ?matricula_id=X&formato=pdf|excel
 */
router.get('/comparativo-materias', authorize('asistencia.reporte'), ReportesAsistenciaController.reporteComparativoMaterias);

export default router;