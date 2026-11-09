import express from 'express';
import PadreFamiliaController from '../controllers/padreFamiliaController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// GET /padre-familia
router.get(
  '/',
  authorize('padre_familia.leer', 'pago_mensualidad.leer', 'pago_mensualidad.crear', 'mensualidad.leer'),
  PadreFamiliaController.listar
);

// GET /padre-familia/:id/estudiantes
router.get(
  '/:id/estudiantes',
  authorize('padre_familia.leer', 'pago_mensualidad.leer', 'pago_mensualidad.crear', 'mensualidad.leer'),
  PadreFamiliaController.obtenerEstudiantes
);

// GET /padre-familia/:id
router.get(
  '/:id',
  authorize('padre_familia.leer', 'pago_mensualidad.leer', 'pago_mensualidad.crear', 'mensualidad.leer'),
  PadreFamiliaController.obtenerPorId
);

// POST /api/padre-familia
router.post(
  '/',
  authorize('padre_familia.crear'),
  logActivity('crear', 'padre_familia'),
  PadreFamiliaController.crear
);

// PUT /api/padre-familia/:id
router.put(
  '/:id',
  authorize('padre_familia.actualizar'),
  logActivity('actualizar', 'padre_familia'),
  PadreFamiliaController.actualizar
);

// DELETE /api/padre-familia/:id
router.delete(
  '/:id',
  authorize('padre_familia.eliminar'),
  logActivity('eliminar', 'padre_familia'),
  PadreFamiliaController.eliminar
);

export default router;