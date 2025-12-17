// routes/registroCompletoRoutes.js
import express from 'express';
import RegistroCompletoController from '../controllers/registroCompletoController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// 🆕 GET /api/registro-completo/buscar-padre/:ci - Buscar padre por CI
router.get(
  '/buscar-padre/:ci',
  authorize('estudiante.crear'),
  RegistroCompletoController.buscarPadrePorCI
);

// POST /api/registro-completo - Registro completo mejorado
// Soporta 3 modos: nuevo, padre_existente, multiple
router.post(
  '/',
  authorize('estudiante.crear'),
  upload.fields([
    // Modo nuevo/padre_existente: 1 foto
    { name: 'foto', maxCount: 1 },
    
    // 🆕 Modo múltiple: hasta 5 fotos (foto_0, foto_1, foto_2, foto_3, foto_4)
    { name: 'foto_0', maxCount: 1 },
    { name: 'foto_1', maxCount: 1 },
    { name: 'foto_2', maxCount: 1 },
    { name: 'foto_3', maxCount: 1 },
    { name: 'foto_4', maxCount: 1 },
    
    // Documentos (aplica a todos los modos)
    { name: 'documentos', maxCount: 10 }
  ]),
  handleMulterError,
  logActivity('registro_completo', 'estudiante'),
  RegistroCompletoController.registroCompleto
);

// Crear usuario para estudiante existente
router.post(
  '/usuario-estudiante/:id',
  authorize('estudiante.actualizar'),
  RegistroCompletoController.crearUsuarioEstudiante
);

// Crear usuario para tutor existente
router.post(
  '/usuario-tutor/:id',
  authorize('padre_familia.actualizar'),
  RegistroCompletoController.crearUsuarioTutor
);

export default router;