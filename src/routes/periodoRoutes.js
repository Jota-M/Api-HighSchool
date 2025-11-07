import { Router } from "express";
import { PeriodoController } from "../controllers/periodoController.js";

const router = Router();

router.get("/", PeriodoController.getAll);
router.get("/:id", PeriodoController.getById);
router.post("/", PeriodoController.create);
router.put("/:id", PeriodoController.update);
router.delete("/:id", PeriodoController.delete);

export default router;
