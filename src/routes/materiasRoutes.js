import express from 'express';
import { MateriaController } from '../controllers/materiasControllers.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// GET /api/materia
router.get(
  '/',
  authorize('materia.leer'),
  MateriaController.listar
);

// GET /api/materia/:id
router.get(
  '/:id',
  authorize('materia.leer'),
  MateriaController.obtenerPorId
);

// POST /api/materia
router.post(
  '/',
  authorize('materia.crear'),
  logActivity('crear', 'materia'),
  MateriaController.crear
);

// PUT /api/materia/:id
router.put(
  '/:id',
  authorize('materia.actualizar'),
  logActivity('actualizar', 'materia'),
  MateriaController.actualizar
);

// DELETE /api/materia/:id
router.delete(
  '/:id',
  authorize('materia.eliminar'),
  logActivity('eliminar', 'materia'),
  MateriaController.eliminar
);

// === RUTAS DE PREREQUISITOS ===

// GET /api/materia/:id/prerequisitos
router.get(
  '/:id/prerequisitos',
  authorize('materia.leer'),
  MateriaController.listarPrerequisitos
);

// POST /api/materia/:id/prerequisitos
router.post(
  '/:id/prerequisitos',
  authorize('materia.actualizar'),
  logActivity('agregar_prerequisito', 'materia'),
  MateriaController.agregarPrerequisito
);

// DELETE /api/materia/:id/prerequisitos/:prerequisito_id
router.delete(
  '/:id/prerequisitos/:prerequisito_id',
  authorize('materia.actualizar'),
  logActivity('eliminar_prerequisito', 'materia'),
  MateriaController.eliminarPrerequisito
);

export default router;