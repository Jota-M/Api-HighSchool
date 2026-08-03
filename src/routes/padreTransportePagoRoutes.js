// routes/padreTransportePagoRoutes.js
// Rutas de pagos de transporte para el padre de familia
// Todas requieren autenticación JWT (el padre debe estar logueado)

import express from 'express';
import PadreFamiliaTransportePayController from '../controllers/padreFamiliaTransportePayController.js';
import { authenticate } from '../Middlewares/auth.js';

const router = express.Router();

// Todas las rutas del padre requieren que esté autenticado
router.use(authenticate);

// ══════════════════════════════════════════════════════════════════
// GET /api/padre/transporte/hijos
// El padre ve la lista de sus hijos que tienen transporte asignado
// ══════════════════════════════════════════════════════════════════
router.get('/transporte/hijos', PadreFamiliaTransportePayController.obtenerHijosConTransporte);

// ══════════════════════════════════════════════════════════════════
// GET /api/padre/transporte/hijos/:estudiante_id/cuotas
// El padre selecciona un hijo y ve sus cuotas de transporte
// ══════════════════════════════════════════════════════════════════
router.get(
    '/transporte/hijos/:estudiante_id/cuotas',
    PadreFamiliaTransportePayController.obtenerCuotasHijo
);

// ══════════════════════════════════════════════════════════════════
// POST /api/padre/transporte/:pago_id/generar-qr
// El padre genera el QR para pagar una cuota específica
// ══════════════════════════════════════════════════════════════════
router.post(
    '/transporte/:pago_id/generar-qr',
    PadreFamiliaTransportePayController.generarQRPago
);

// ══════════════════════════════════════════════════════════════════
// GET /api/padre/transporte/:pago_id/estado-qr
// Polling desde el frontend mientras se muestra el QR
// ══════════════════════════════════════════════════════════════════
router.get(
    '/transporte/:pago_id/estado-qr',
    PadreFamiliaTransportePayController.verificarEstadoQR
);

// ══════════════════════════════════════════════════════════════════
// DELETE /api/padre/transporte/:pago_id/cancelar-qr
// ══════════════════════════════════════════════════════════════════
router.delete(
    '/transporte/:pago_id/cancelar-qr',
    PadreFamiliaTransportePayController.cancelarQR
);

// ══════════════════════════════════════════════════════════════════
// POST /api/padre/transporte/cuotas/generar-qr-familiar
// QR único para cuotas de varios hijos (o varias cuotas)
// ══════════════════════════════════════════════════════════════════
router.post(
    '/transporte/cuotas/generar-qr-familiar',
    PadreFamiliaTransportePayController.generarQRFamiliar
);

// ══════════════════════════════════════════════════════════════════
// GET /api/padre/transporte/cuotas/estado-qr-multiple?alias=transfam-123-456
// ══════════════════════════════════════════════════════════════════
router.get(
    '/transporte/cuotas/estado-qr-multiple',
    PadreFamiliaTransportePayController.verificarEstadoQRMultiple
);

export default router;