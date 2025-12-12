// routes/registroCompletoRoutes.js
import express from 'express';
import RegistroCompletoController from '../controllers/registroCompletoController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// POST /api/registro-completo - Registro completo con documentos
router.post(
  '/',
  authorize('estudiante.crear'),
  upload.fields([
    { name: 'foto', maxCount: 1 }, // Foto del estudiante
    { name: 'documentos', maxCount: 10 } // Hasta 10 documentos
  ]),
  handleMulterError,
  logActivity('registro_completo', 'estudiante'),
  RegistroCompletoController.registroCompleto
);

// Otros endpoints...
router.post(
  '/usuario-estudiante/:id',
  authorize('estudiante.actualizar'),
  RegistroCompletoController.crearUsuarioEstudiante
);

router.post(
  '/usuario-tutor/:id',
  authorize('padre_familia.actualizar'),
  RegistroCompletoController.crearUsuarioTutor
);

export default router;