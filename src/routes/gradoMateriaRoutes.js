import { Router } from "express";
import { GradoMateriaController } from "../controllers/gradoMateriaController.js";

const router = Router();

router.get("/", GradoMateriaController.getAll);
router.get("/:id", GradoMateriaController.getById);
router.post("/", GradoMateriaController.create);
router.put("/:id", GradoMateriaController.update);
router.delete("/:id", GradoMateriaController.delete);

export default router;
