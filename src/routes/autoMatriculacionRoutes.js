// routes/autoMatriculacion.routes.js
import express from 'express';
import AutoMatriculacionController from '../controllers/autoMatriculacionController.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

// ⚠️ RUTAS PÚBLICAS (sin autenticación)

/**
 * POST /api/auto-matriculacion/validar
 * Validar estudiante con código y CI
 */
router.post(
  '/validar',
  AutoMatriculacionController.validarEstudiante
);

/**
 * GET /api/auto-matriculacion/opciones
 * Obtener grados y paralelos disponibles
 */
router.get(
  '/opciones',
  AutoMatriculacionController.obtenerOpcionesMatricula
);

/**
 * PUT /api/auto-matriculacion/actualizar-datos
 * Actualizar datos del estudiante antes de matricular (CON FOTO OPCIONAL)
 */
router.put(
  '/actualizar-datos',
  upload.fields([
    { name: 'foto', maxCount: 1 }
  ]),
  handleMulterError,
  AutoMatriculacionController.actualizarDatos
);

/**
 * POST /api/auto-matriculacion/matricular
 * Auto-matricular estudiante (CON DOCUMENTOS OPCIONALES)
 */
router.post(
  '/matricular',
  upload.fields([
    { name: 'documentos', maxCount: 10 }
  ]),
  handleMulterError,
  AutoMatriculacionController.autoMatricular
);

export default router;