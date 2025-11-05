import express from "express";
import { createPreinscripcion } from "../controllers/preinscripcionController.js";
import multer from "multer";

const router = express.Router();

// Configuración Multer
const storage = multer.diskStorage({});
const upload = multer({ storage });

// Multiples archivos
const cpUpload = upload.fields([
  { name: "cedula_estudiante", maxCount: 1 },
  { name: "certificado_nacimiento", maxCount: 1 },
  { name: "libreta_notas", maxCount: 1 },
  { name: "cedula_representante", maxCount: 1 },
]);

router.post("/", cpUpload, createPreinscripcion);

export default router;
