// routes/paymentRoutes.js
import express from 'express';
import { 
  CostoMensualidadController,
  MensualidadController,
  PagoMensualidadController,
  PagoAnualCompletoController,
  ReportesPagosController,
  PagoMultipleController,
  PagoDistribuidoController,
} from '../controllers/paymentControllers.js';
import PagoMensualidadPDFController from '../controllers/pagoMensualidadPDFController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// =============================================
// RUTAS: COSTO MENSUALIDAD
// =============================================

// GET /api/costo-mensualidad - Listar costos
router.get(
  '/costo-mensualidad',
  authorize('costo_mensualidad.leer'),
  CostoMensualidadController.listar
);

// GET /api/costo-mensualidad/:id - Obtener por ID
router.get(
  '/costo-mensualidad/:id',
  authorize('costo_mensualidad.leer'),
  CostoMensualidadController.obtenerPorId
);

// POST /api/costo-mensualidad - Crear costo
router.post(
  '/costo-mensualidad',
  authorize('costo_mensualidad.crear'),
  logActivity('crear', 'costo_mensualidad'),
  CostoMensualidadController.crear
);

// PUT /api/costo-mensualidad/:id - Actualizar costo
router.put(
  '/costo-mensualidad/:id',
  authorize('costo_mensualidad.actualizar'),
  logActivity('actualizar', 'costo_mensualidad'),
  CostoMensualidadController.actualizar
);

// DELETE /api/costo-mensualidad/:id - Desactivar costo
router.delete(
  '/costo-mensualidad/:id',
  authorize('costo_mensualidad.eliminar'),
  logActivity('eliminar', 'costo_mensualidad'),
  CostoMensualidadController.eliminar
);

// =============================================
// RUTAS: MENSUALIDAD
// =============================================

// GET /api/mensualidad - Listar mensualidades
router.get(
  '/mensualidad',
  authorize('mensualidad.leer'),
  MensualidadController.listar
);

// GET /api/mensualidad/vencidas - Listar vencidas
router.get(
  '/mensualidad/vencidas',
  authorize('mensualidad.leer'),
  MensualidadController.listarVencidas
);

// GET /api/mensualidad/matricula/:matricula_id - Por matrícula
router.get(
  '/mensualidad/matricula/:matricula_id',
  authorize('mensualidad.leer'),
  MensualidadController.obtenerPorMatricula
);

// GET /api/mensualidad/:id - Obtener por ID
router.get(
  '/mensualidad/:id',
  authorize('mensualidad.leer'),
  MensualidadController.obtenerPorId
);

// POST /api/mensualidad/generar - Generar mensualidades
router.post(
  '/mensualidad/generar',
  authorize('mensualidad.generar'),
  logActivity('generar', 'mensualidad'),
  MensualidadController.generar
);

// PATCH /api/mensualidad/:id/anular - Anular mensualidad
router.patch(
  '/mensualidad/:id/anular',
  authorize('mensualidad.anular'),
  logActivity('anular', 'mensualidad'),
  MensualidadController.anular
);

// =============================================
// RUTAS: PAGO MENSUALIDAD
// =============================================

// GET /api/pago-mensualidad - Listar pagos
router.get(
  '/pago-mensualidad',
  authorize('pago_mensualidad.leer'),
  PagoMensualidadController.listar
);

// GET /api/pago-mensualidad/:id - Obtener por ID
router.get(
  '/pago-mensualidad/:id',
  authorize('pago_mensualidad.leer'),
  PagoMensualidadController.obtenerPorId
);

// POST /api/pago-mensualidad - Registrar pago
router.post(
  '/pago-mensualidad',
  authorize('pago_mensualidad.crear'),
  logActivity('crear', 'pago_mensualidad'),
  PagoMensualidadController.crear
);

// PUT /api/pago-mensualidad/:id - Actualizar pago
router.put(
  '/pago-mensualidad/:id',
  authorize('pago_mensualidad.actualizar'),
  logActivity('actualizar', 'pago_mensualidad'),
  PagoMensualidadController.actualizar
);

// PATCH /api/pago-mensualidad/:id/anular - Anular pago
router.patch(
  '/pago-mensualidad/:id/anular',
  authorize('pago_mensualidad.anular'),
  logActivity('anular', 'pago_mensualidad'),
  PagoMensualidadController.anular
);

// =============================================
// RUTAS: PAGO ANUAL COMPLETO
// =============================================

// GET /api/pago-anual - Listar pagos anuales
router.get(
  '/pago-anual',
  authorize('pago_mensualidad.leer'),
  PagoAnualCompletoController.listar
);

// GET /api/pago-anual/:id - Obtener por ID
router.get(
  '/pago-anual/:id',
  authorize('pago_mensualidad.leer'),
  PagoAnualCompletoController.obtenerPorId
);

// POST /api/pago-anual - Registrar pago anual
router.post(
  '/pago-anual',
  authorize('pago_mensualidad.crear'),
  logActivity('crear', 'pago_anual_completo'),
  PagoAnualCompletoController.registrar
);

// =============================================
// RUTAS: REPORTES
// =============================================

// GET /api/reportes-pagos/estado-estudiantes - Estado de pagos
router.get(
  '/reportes-pagos/estado-estudiantes',
  authorize('reportes_pagos.ver_estado_estudiante'),
  ReportesPagosController.estadoEstudiantes
);

// GET /api/reportes-pagos/ingresos - Ingresos por período
router.get(
  '/reportes-pagos/ingresos',
  authorize('reportes_pagos.ver_ingresos'),
  ReportesPagosController.ingresos
);

// GET /api/reportes-pagos/morosos - Lista de morosos
router.get(
  '/reportes-pagos/morosos',
  authorize('reportes_pagos.ver_morosos'),
  ReportesPagosController.morosos
);

// GET /api/reportes-pagos/resumen - Resumen general
router.get(
  '/reportes-pagos/resumen',
  authorize('reportes_pagos.ver_ingresos'),
  ReportesPagosController.resumen
);
// GET /api/pago-multiple/resumen - Resumen de mensualidades pendientes
router.get(
  '/pago-multiple/resumen',
  authorize('pago_mensualidad.leer'),
  PagoMultipleController.obtenerResumenPendientes
);

// POST /api/pago-multiple - Registrar pago múltiple
router.post(
  '/pago-multiple',
  authorize('pago_mensualidad.crear'),
  logActivity('crear', 'pago_multiple'),
  PagoMultipleController.registrarMultiple
);
router.post(
  '/pago-distribuido',
  authorize('pago_mensualidad.crear'),
  logActivity('crear', 'pago_distribuido'),
  PagoDistribuidoController.registrarPagoDistribuido
);

// POST /api/pago-distribuido/calcular - Calcular distribución (preview)
router.post(
  '/pago-distribuido/calcular',
  authorize('pago_mensualidad.leer'),
  PagoDistribuidoController.calcularDistribucion
);
router.get(
  '/pago-mensualidad/:id/pdf',
  authenticate,
  authorize('pago_mensualidad.leer'),
  PagoMensualidadPDFController.generarPDFIndividual
);

// POST /api/pago-mensualidad/pdf-multiple - Generar PDF múltiple
// Body: { pago_ids: [1,2,3], nombre_entrega?: string, ci_entrega?: string, preview?: boolean }
router.post(
  '/pago-mensualidad/pdf-multiple',
  authenticate,
  authorize('pago_mensualidad.leer'),
  PagoMensualidadPDFController.generarPDFMultiple
);
export default router;