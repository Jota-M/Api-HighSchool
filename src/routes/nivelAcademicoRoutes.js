import { Router } from "express";
import { NivelAcademicoController } from "../controllers/nivelAcademicoController.js";

const router = Router();

router.get('/', NivelAcademicoController.getAll);
router.get('/stats', NivelAcademicoController.getStats);
router.get('/:id', NivelAcademicoController.getById);
router.post('/', NivelAcademicoController.create);
router.put('/:id', NivelAcademicoController.update);
router.delete('/:id', NivelAcademicoController.delete);

export default router;
