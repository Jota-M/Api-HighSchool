// routes/padreRoutes.js
import express from 'express';
import PadreController from '../controllers/padreController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/padre/hijos
 * Lista los hijos del padre autenticado con su matrícula activa.
 * No requiere permiso especial — cualquier usuario con rol padre puede llamarlo.
 */
router.get(
  '/hijos',
  PadreController.getHijos
);

/**
 * PATCH /api/padre/permisos/:id/cancelar
 * El padre cancela su propia solicitud pendiente.
 * Separado de solicitud_permiso.aprobar (que es para docentes/admins).
 */
router.patch(
  '/permisos/:id/cancelar',
  authorize('solicitud_permiso.crear'), // el mismo permiso que crear — si puede pedir, puede cancelar la suya
  logActivity('cancelar', 'solicitud_permiso'),
  PadreController.cancelarPermiso
);

export default router;