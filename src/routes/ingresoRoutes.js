// routes/ingresoRoutes.js
import express from 'express';
import { IngresoController, TipoIngresoController } from '../controllers/ingresoController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// RUTAS DE REPORTES Y ESTADÍSTICAS
// ==========================================

/**
 * GET /api/ingreso/estadisticas
 * Obtener estadísticas generales de ingresos
 * Query: periodo_academico_id, fecha_desde, fecha_hasta
 */
router.get(
  '/estadisticas',
  authorize('ingresos.leer'),
  IngresoController.obtenerEstadisticas
);

/**
 * GET /api/ingreso/resumen/categoria
 * Obtener resumen de ingresos por categoría
 * Query: periodo_academico_id, fecha_desde, fecha_hasta
 */
router.get(
  '/resumen/categoria',
  authorize('ingresos.leer'),
  IngresoController.obtenerResumenPorCategoria
);

/**
 * GET /api/ingreso/resumen/metodo-pago
 * Obtener resumen de ingresos por método de pago
 * Query: periodo_academico_id, fecha_desde, fecha_hasta
 */
router.get(
  '/resumen/metodo-pago',
  authorize('ingresos.leer'),
  IngresoController.obtenerResumenPorMetodoPago
);

/**
 * GET /api/ingreso/resumen/diario
 * Obtener ingresos agrupados por día
 * Query: periodo_academico_id, fecha_desde, fecha_hasta
 */
router.get(
  '/resumen/diario',
  authorize('ingresos.leer'),
  IngresoController.obtenerIngresosDiarios
);

// ==========================================
// RUTAS DE GESTIÓN DE TIPOS DE INGRESO
// ==========================================

/**
 * GET /api/ingreso/tipos
 * Listar tipos de ingreso
 * Query: activo, categoria
 */
router.get(
  '/tipos',
  authorize('ingresos.leer'),
  TipoIngresoController.listar
);

/**
 * POST /api/ingreso/tipos
 * Crear tipo de ingreso
 */
router.post(
  '/tipos',
  authorize('ingresos.administrar'),
  logActivity('crear', 'ingresos'),
  TipoIngresoController.crear
);

/**
 * GET /api/ingreso/tipos/:id
 * Obtener tipo de ingreso por ID
 */
router.get(
  '/tipos/:id',
  authorize('ingresos.leer'),
  TipoIngresoController.obtenerPorId
);

/**
 * PUT /api/ingreso/tipos/:id
 * Actualizar tipo de ingreso
 */
router.put(
  '/tipos/:id',
  authorize('ingresos.administrar'),
  logActivity('actualizar', 'ingresos'),
  TipoIngresoController.actualizar
);

// ==========================================
// RUTAS DE GESTIÓN DE INGRESOS
// ==========================================

/**
 * GET /api/ingreso/codigo/:codigo
 * Obtener ingreso por código
 */
router.get(
  '/codigo/:codigo',
  authorize('ingresos.leer'),
  IngresoController.obtenerPorCodigo
);

/**
 * GET /api/ingreso
 * Listar ingresos
 * Query: page, limit, search, tipo_ingreso_id, periodo_academico_id,
 *        estudiante_id, fecha_desde, fecha_hasta, metodo_pago, estado,
 *        referencia_tipo
 */
router.get(
  '/',
  authorize('ingresos.leer'),
  IngresoController.listar
);

/**
 * POST /api/ingreso
 * Crear ingreso (registro manual)
 * Body: { tipo_ingreso_id, monto, metodo_pago, estudiante_id,
 *         periodo_academico_id, descuento, recargo, numero_comprobante,
 *         requiere_factura, observaciones, ... }
 * File: comprobante (opcional)
 */
router.post(
  '/',
  authorize('ingresos.crear'),
  upload.single('comprobante'),
  handleMulterError,
  logActivity('crear', 'ingresos'),
  IngresoController.crear
);

/**
 * GET /api/ingreso/:id
 * Obtener ingreso por ID
 */
router.get(
  '/:id',
  authorize('ingresos.leer'),
  IngresoController.obtenerPorId
);

/**
 * PATCH /api/ingreso/:id/verificar
 * Verificar ingreso
 */
router.patch(
  '/:id/verificar',
  authorize('ingresos.verificar'),
  logActivity('verificar', 'ingresos'),
  IngresoController.verificar
);

/**
 * PATCH /api/ingreso/:id/anular
 * Anular ingreso
 * Body: { motivo }
 */
router.patch(
  '/:id/anular',
  authorize('ingresos.anular'),
  logActivity('anular', 'ingresos'),
  IngresoController.anular
);

export default router;