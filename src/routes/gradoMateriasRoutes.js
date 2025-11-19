import express from 'express';
import { GradoMateriaController } from '../controllers/materiasControllers.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// POST /api/grado-materia - Asignar materia a grado
router.post(
  '/',
  authorize('grado_materia.crear'),
  logActivity('asignar', 'grado_materia'),
  GradoMateriaController.asignar
);

// GET /api/grado-materia/grado/:grado_id - Listar materias de un grado
router.get(
  '/grado/:grado_id',
  authorize('grado_materia.leer'),
  GradoMateriaController.listarPorGrado
);

// PUT /api/grado-materia/:id - Actualizar asignación
router.put(
  '/:id',
  authorize('grado_materia.actualizar'),
  logActivity('actualizar', 'grado_materia'),
  GradoMateriaController.actualizar
);

// DELETE /api/grado-materia/:id - Remover materia de grado
router.delete(
  '/:id',
  authorize('grado_materia.eliminar'),
  logActivity('remover', 'grado_materia'),
  GradoMateriaController.remover
);

// PUT /api/grado-materia/grado/:grado_id/reordenar - Reordenar materias
router.put(
  '/grado/:grado_id/reordenar',
  authorize('grado_materia.actualizar'),
  logActivity('reordenar', 'grado_materia'),
  GradoMateriaController.reordenar
);

export default router;