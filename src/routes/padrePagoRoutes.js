// routes/padrePagoRoutes.js
// Rutas de pagos para el padre de familia
// Todas requieren autenticación JWT (el padre debe estar logueado)

import express from 'express';
import PadreFamiliaPayController from '../controllers/padreFamiliaPayController.js';
import { authenticate } from '../Middlewares/auth.js';

const router = express.Router();

// Todas las rutas del padre requieren que esté autenticado
router.use(authenticate);

// ══════════════════════════════════════════════════════════════════
// GET /api/padre/hijos
// El padre ve la lista de sus hijos con resumen de pagos
// ══════════════════════════════════════════════════════════════════
router.get('/hijos', PadreFamiliaPayController.obtenerHijos);

// ══════════════════════════════════════════════════════════════════
// GET /api/padre/hijos/:estudiante_id/mensualidades
// El padre selecciona un hijo y ve sus mensualidades
// ══════════════════════════════════════════════════════════════════
router.get(
  '/hijos/:estudiante_id/mensualidades',
  PadreFamiliaPayController.obtenerMensualidadesHijo
);

// ══════════════════════════════════════════════════════════════════
// POST /api/padre/mensualidad/:mensualidad_id/generar-qr
// El padre genera el QR para pagar una mensualidad específica
// ══════════════════════════════════════════════════════════════════
router.post(
  '/mensualidad/:mensualidad_id/generar-qr',
  PadreFamiliaPayController.generarQRPago
);

// ══════════════════════════════════════════════════════════════════
// GET /api/padre/mensualidad/:mensualidad_id/estado-qr
// El padre verifica si su pago ya fue procesado
// El frontend hace polling a esta ruta mientras muestra el QR
// ══════════════════════════════════════════════════════════════════
router.get(
  '/mensualidad/:mensualidad_id/estado-qr',
  PadreFamiliaPayController.verificarEstadoQR
);

// ══════════════════════════════════════════════════════════════════
// DELETE /api/padre/mensualidad/:mensualidad_id/cancelar-qr
// El padre cancela el QR activo para poder generar uno nuevo
// ══════════════════════════════════════════════════════════════════
router.delete(
  '/mensualidad/:mensualidad_id/cancelar-qr',
  PadreFamiliaPayController.cancelarQR
);

// POST /api/padre/mensualidades/generar-qr-multiple
router.post(
  '/mensualidades/generar-qr-multiple',
  PadreFamiliaPayController.generarQRMultiple
);

// GET /api/padre/mensualidades/estado-qr-multiple?alias=multi-123-456
router.get(
  '/mensualidades/estado-qr-multiple',
  PadreFamiliaPayController.verificarEstadoQRMultiple
);
 
export default router;