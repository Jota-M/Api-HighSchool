import express from "express";
import multer from "multer";
import {
  createPreinscripcion,
  getAllPreinscripciones,
  getPreinscripcionById,
  deletePreinscripcion,
  updateEstadoPreinscripcion
} from "../controllers/preinscripcionController.js";

const router = express.Router();
const storage = multer.diskStorage({});
const upload = multer({ storage });
const cpUpload = upload.fields([
  { name: "cedula_estudiante", maxCount: 1 },
  { name: "certificado_nacimiento", maxCount: 1 },
  { name: "libreta_notas", maxCount: 1 },
  { name: "cedula_representante", maxCount: 1 },
]);

router.post("/", cpUpload, createPreinscripcion);
router.get("/", getAllPreinscripciones);
router.get("/:id", getPreinscripcionById);
router.delete("/:id", deletePreinscripcion);
router.put("/:id/estado", updateEstadoPreinscripcion);

export default router;
