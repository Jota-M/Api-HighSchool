// routes/sipCallbackRoutes.js
// Ruta pública donde SIP llama cuando un pago fue completado
// ⚠️  Esta ruta NO lleva authenticate (JWT) porque quien llama es el banco, no un usuario
// La seguridad se maneja internamente con Basic Auth en el controlador

import express from 'express';
import SipCallbackController from '../controllers/sipCallbackController.js';

const router = express.Router();

/**
 * POST /api/sip/callback
 *
 * Esta es la URL que le pasás a SIP cuando generás un QR:
 * "callback": "https://tu-servidor.com/api/sip/callback"
 *
 * También es la que le informás a MC4 junto con
 * el CALLBACK_USER y CALLBACK_PASSWORD para que la configuren.
 */
router.post('/callback', SipCallbackController.confirmarPago);

export default router;