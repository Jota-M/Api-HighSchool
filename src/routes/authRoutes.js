import express from 'express';
import AuthController from '../controllers/authController.js';
import { authenticate, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

// Rutas públicas
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);

// Rutas protegidas
router.post('/logout', authenticate, logActivity('logout', 'auth'), AuthController.logout);
// Rutas de refresco de token (soporta tanto /refresh como /refresh-token)
router.post('/refresh', AuthController.refreshToken);
router.post('/refresh-token', AuthController.refreshToken);
router.get('/me', authenticate, AuthController.me);
router.post('/change-password', authenticate, logActivity('cambio_password', 'auth'), AuthController.changePassword);
router.get('/sessions', authenticate, AuthController.getSessions);
router.post('/logout-all', authenticate, logActivity('logout_all', 'auth'), AuthController.logoutAll);

export default router;
