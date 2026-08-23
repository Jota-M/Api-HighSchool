// routes/egresoRoutes.js
import express from 'express';
import { EgresoController, TipoEgresoController } from '../controllers/egresoController.js';
import ReportesFinancierosController from '../controllers/reportesFinancierosController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// RUTAS DE REPORTES Y ESTADÍSTICAS
// ==========================================

/**
 * GET /api/egreso/estadisticas
 * Obtener estadísticas generales de egresos
 * Query: periodo_academico_id, fecha_desde, fecha_hasta
 */
router.get(
    '/estadisticas',
    authorize('egresos.leer'),
    EgresoController.obtenerEstadisticas
);

/**
 * GET /api/egreso/resumen/categoria
 * Obtener resumen de egresos por categoría
 * Query: periodo_academico_id, fecha_desde, fecha_hasta
 */
router.get(
    '/resumen/categoria',
    authorize('egresos.leer'),
    EgresoController.obtenerResumenPorCategoria
);

/**
 * GET /api/egreso/resumen/metodo-pago
 * Obtener resumen de egresos por método de pago
 * Query: periodo_academico_id, fecha_desde, fecha_hasta
 */
router.get(
    '/resumen/metodo-pago',
    authorize('egresos.leer'),
    EgresoController.obtenerResumenPorMetodoPago
);

/**
 * GET /api/egreso/resumen/diario
 * Obtener egresos agrupados por día
 * Query: periodo_academico_id, fecha_desde, fecha_hasta
 */
router.get(
    '/resumen/diario',
    authorize('egresos.leer'),
    EgresoController.obtenerEgresosDiarios
);

/**
 * GET /api/egreso/exportar/egresos
 * Exportar reporte de egresos a PDF o Excel
 * Query: fecha_desde, fecha_hasta, formato=pdf|excel, tipo_egreso_id
 */
router.get(
    '/exportar/egresos',
    authorize('egresos.leer'),
    ReportesFinancierosController.exportarEgresos
);

// ==========================================
// RUTAS DE GESTIÓN DE TIPOS DE EGRESO
// ==========================================

/**
 * GET /api/egreso/tipos
 * Listar tipos de egreso
 * Query: activo, categoria
 */
router.get(
    '/tipos',
    authorize('egresos.leer'),
    TipoEgresoController.listar
);

/**
 * POST /api/egreso/tipos
 * Crear tipo de egreso
 */
router.post(
    '/tipos',
    authorize('egresos.administrar'),
    logActivity('crear', 'egresos'),
    TipoEgresoController.crear
);

/**
 * GET /api/egreso/tipos/:id
 * Obtener tipo de egreso por ID
 */
router.get(
    '/tipos/:id',
    authorize('egresos.leer'),
    TipoEgresoController.obtenerPorId
);

/**
 * PUT /api/egreso/tipos/:id
 * Actualizar tipo de egreso
 */
router.put(
    '/tipos/:id',
    authorize('egresos.administrar'),
    logActivity('actualizar', 'egresos'),
    TipoEgresoController.actualizar
);

// ==========================================
// RUTAS DE GESTIÓN DE EGRESOS
// ==========================================

/**
 * GET /api/egreso/codigo/:codigo
 * Obtener egreso por código
 */
router.get(
    '/codigo/:codigo',
    authorize('egresos.leer'),
    EgresoController.obtenerPorCodigo
);

/**
 * GET /api/egreso
 * Listar egresos
 * Query: page, limit, search, tipo_egreso_id, periodo_academico_id,
 *        docente_id, fecha_desde, fecha_hasta, metodo_pago, estado,
 *        referencia_tipo
 */
router.get(
    '/',
    authorize('egresos.leer'),
    EgresoController.listar
);

/**
 * POST /api/egreso
 * Crear egreso (registro manual)
 * Body: { tipo_egreso_id, concepto, monto, metodo_pago, docente_id,
 *         periodo_academico_id, numero_comprobante, beneficiario,
 *         requiere_factura, observaciones, ... }
 * File: comprobante (opcional)
 */
router.post(
    '/',
    authorize('egresos.crear'),
    upload.single('comprobante'),
    handleMulterError,
    logActivity('crear', 'egresos'),
    EgresoController.crear
);

/**
 * GET /api/egreso/:id
 * Obtener egreso por ID
 */
router.get(
    '/:id',
    authorize('egresos.leer'),
    EgresoController.obtenerPorId
);

/**
 * PATCH /api/egreso/:id/verificar
 * Verificar egreso
 */
router.patch(
    '/:id/verificar',
    authorize('egresos.verificar'),
    logActivity('verificar', 'egresos'),
    EgresoController.verificar
);

/**
 * PATCH /api/egreso/:id/anular
 * Anular egreso
 * Body: { motivo }
 */
router.patch(
    '/:id/anular',
    authorize('egresos.anular'),
    logActivity('anular', 'egresos'),
    EgresoController.anular
);

export default router;