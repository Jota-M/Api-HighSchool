import express from 'express';
import { GradoController } from '../controllers/gradoController.js';

const router = express.Router();

// Rutas de grados
router.get('/', GradoController.getAll);
router.get('/nivel/:nivelId', GradoController.getByNivel);
router.get('/:id', GradoController.getById);
router.post('/', GradoController.create);
router.put('/:id', GradoController.update);
router.delete('/:id', GradoController.delete);

export default router;