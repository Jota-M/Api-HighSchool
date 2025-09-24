import { Router } from 'express';
import { PreinscripcionController } from '../controllers/preinscripcionController.js';

const router = Router();

router.get('/', PreinscripcionController.getAll);
router.get('/:id', PreinscripcionController.getById);
router.post('/', PreinscripcionController.create);
router.put('/:id', PreinscripcionController.update);
router.delete('/:id', PreinscripcionController.remove);

export default router;
