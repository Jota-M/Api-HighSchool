// routes/reportesRoutes.js
import express from 'express';
import ReportesMatriculaController from '../controllers/reportes/reportesMatriculaController.js';
import ReportesPreInscripcionController from '../controllers/reportes/reportesPreInscripcionController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// ==========================================
// 📚 REPORTES DE MATRÍCULAS
// ==========================================

// GET /api/reportes/matricula/paralelo?paralelo_id=X&periodo_id=Y&formato=pdf
router.get(
  '/matricula/paralelo',
  authorize('reportes.leer'),
  logActivity('generar_reporte_paralelo', 'reportes'),
  ReportesMatriculaController.reporteParalelo
);

// GET /api/reportes/matricula/estudiante?estudiante_id=X&formato=pdf
router.get(
  '/matricula/estudiante',
  authorize('reportes.leer'),
  logActivity('generar_reporte_estudiante', 'reportes'),
  ReportesMatriculaController.reporteEstudiante
);

// GET /api/reportes/matricula/estadistico?periodo_id=X&nivel_id=Y&formato=excel
router.get(
  '/matricula/estadistico',
  authorize('reportes.leer'),
  logActivity('generar_reporte_estadistico', 'reportes'),
  ReportesMatriculaController.reporteEstadistico
);

// ==========================================
// 📝 REPORTES DE PRE-INSCRIPCIONES
// ==========================================

// GET /api/reportes/preinscripcion/individual?id=X&formato=pdf
router.get(
  '/preinscripcion/individual',
  authorize('reportes.leer'),
  logActivity('generar_reporte_preinscripcion_individual', 'reportes'),
  ReportesPreInscripcionController.reporteIndividual
);

// GET /api/reportes/preinscripcion/listado?estado=X&fecha_inicio=Y&formato=excel
router.get(
  '/preinscripcion/listado',
  authorize('reportes.leer'),
  logActivity('generar_reporte_preinscripcion_listado', 'reportes'),
  ReportesPreInscripcionController.reporteListado
);

// GET /api/reportes/preinscripcion/estadistico?fecha_inicio=X&fecha_fin=Y&formato=pdf
router.get(
  '/preinscripcion/estadistico',
  authorize('reportes.leer'),
  logActivity('generar_reporte_preinscripcion_estadistico', 'reportes'),
  ReportesPreInscripcionController.reporteEstadistico
);

export default router;