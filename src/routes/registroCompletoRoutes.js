import express from 'express';
import RegistroCompletoController from '../controllers/registroCompletoController.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';
import { upload, handleMulterError } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ========================================
// Registro completo de estudiante + tutores
// ========================================
router.post(
  '/',
  authorize('estudiante.crear'),
  upload.single('foto'),
  handleMulterError,
  logActivity('registro_completo', 'estudiante'),
  (req, res) => RegistroCompletoController.registroCompleto(req, res)
);

// ========================================
// Crear usuario para un estudiante existente
// ========================================
router.post(
  '/estudiante/:id/usuario',
  authorize('estudiante.actualizar', 'usuarios.crear'),
  logActivity('crear_usuario_estudiante', 'estudiante'),
  (req, res) => RegistroCompletoController.crearUsuarioEstudiante(req, res)
);

// ========================================
// Crear usuario para un tutor existente
// ========================================
router.post(
  '/tutor/:id/usuario',
  authorize('padre_familia.actualizar', 'usuarios.crear'),
  logActivity('crear_usuario_tutor', 'padre_familia'),
  (req, res) => RegistroCompletoController.crearUsuarioTutor(req, res)
);

export default router;
