// routes/pagoTransporteRoutes.js
import express from 'express';
import PagoTransporteController from '../controllers/pagoTransporteController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// RUTAS DE GESTIÓN DE PAGOS DE TRANSPORTE
// ==========================================

// ⚠️ IMPORTANTE: Las rutas específicas DEBEN ir ANTES de las rutas con parámetros dinámicos

/**
 * POST /api/pago-transporte/calcular-recargos
 * Calcular recargos por mora a pagos vencidos
 * Body: { porcentaje } (opcional, default 0.05 = 5%)
 */
router.post(
  '/calcular-recargos',
  authorize('transporte.gestionar_pagos'),
  logActivity('calcular_recargos', 'transporte'),
  PagoTransporteController.calcularRecargos
);

/**
 * 🆕 POST /api/pago-transporte/multiple
 * Registrar pago múltiple de transporte
 * Body: {
 *   pagos: [{ pago_transporte_id, monto_pagado }],
 *   metodo_pago,
 *   numero_comprobante,
 *   banco_origen,
 *   numero_referencia,
 *   observaciones
 * }
 */
router.post(
  '/multiple',
  authorize('transporte.gestionar_pagos'),
  logActivity('registrar_pago_multiple', 'transporte'),
  PagoTransporteController.registrarPagoMultiple
);

/**
 * 🆕 POST /api/pago-transporte/calcular-distribucion
 * Calcular cómo se distribuiría un monto entre las cuotas pendientes
 * Body: { asignacion_id, monto_total }
 */
router.post(
  '/calcular-distribucion',
  authorize('transporte.leer'),
  PagoTransporteController.calcularDistribucion
);

/**
 * 🆕 POST /api/pago-transporte/distribuido
 * Registrar pago distribuido automáticamente
 * Body: {
 *   asignacion_id,
 *   monto_total,
 *   metodo_pago,
 *   numero_comprobante,
 *   banco_origen,
 *   numero_referencia,
 *   observaciones
 * }
 */
router.post(
  '/distribuido',
  authorize('transporte.gestionar_pagos'),
  logActivity('registrar_pago_distribuido', 'transporte'),
  PagoTransporteController.registrarPagoDistribuido
);

/**
 * GET /api/pago-transporte/estudiante/:estudiante_id/estado-cuenta
 * Obtener estado de cuenta de transporte de un estudiante
 * Query: periodo_academico_id (opcional)
 */
router.get(
  '/estudiante/:estudiante_id/estado-cuenta',
  authorize('transporte.leer'),
  PagoTransporteController.obtenerEstadoCuenta
);

/**
 * GET /api/pago-transporte/codigo/:codigo
 * Obtener pago por código
 */
router.get(
  '/codigo/:codigo',
  authorize('transporte.leer'),
  PagoTransporteController.obtenerPorCodigo
);

/**
 * GET /api/pago-transporte
 * Listar pagos de transporte
 * Query: asignacion_transporte_id, estudiante_id, ruta_id, estado, mes_correspondiente
 */
router.get(
  '/',
  authorize('transporte.leer'),
  PagoTransporteController.listar
);

/**
 * GET /api/pago-transporte/:id
 * Obtener pago por ID
 */
router.get(
  '/:id',
  authorize('transporte.leer'),
  PagoTransporteController.obtenerPorId
);

/**
 * POST /api/pago-transporte/:id/registrar
 * Registrar pago individual de transporte
 * Body: { monto_pagado, metodo_pago, numero_comprobante, observaciones }
 * File: comprobante (opcional)
 */
router.post(
  '/:id/registrar',
  authorize('transporte.gestionar_pagos'),
  upload.single('comprobante'),
  handleMulterError,
  logActivity('registrar_pago', 'transporte'),
  PagoTransporteController.registrarPago
);

/**
 * POST /api/pago-transporte/:id/centralizar
 * Centralizar pago en tabla ingreso
 */
router.post(
  '/:id/centralizar',
  authorize('transporte.gestionar_pagos'),
  logActivity('centralizar_pago', 'transporte'),
  PagoTransporteController.centralizarPago
);

/**
 * PATCH /api/pago-transporte/:id/anular
 * Anular pago de transporte
 * Body: { motivo }
 */
router.patch(
  '/:id/anular',
  authorize('transporte.anular_pagos'),
  logActivity('anular_pago', 'transporte'),
  PagoTransporteController.anular
);

export default router;