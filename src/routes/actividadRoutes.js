import express from 'express';
import { ActividadController } from '../controllers/actividadController.js';
import { authenticate, requireRole } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin', 'super_admin'));

router.get('/', ActividadController.listarActividad);
router.get('/estadisticas', ActividadController.estadisticas);
router.get('/exportar', ActividadController.exportarActividad);

export default router;
