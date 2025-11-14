import express from 'express';
import { SesionesController } from '../controllers/actividadController.js';
import { authenticate, requireRole, logActivity } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin', 'super_admin'));

router.get('/', SesionesController.listarTodas);
router.get('/estadisticas', SesionesController.estadisticas);
router.delete(
  '/:sesionId',
  logActivity('cerrar_sesion', 'sesiones'),
  SesionesController.cerrarSesionUsuario
);
router.delete(
  '/usuario/:usuarioId/todas',
  logActivity('cerrar_todas_sesiones', 'sesiones'),
  SesionesController.cerrarTodasUsuario
);

export default router;
