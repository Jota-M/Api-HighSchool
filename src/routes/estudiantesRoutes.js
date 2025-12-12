import express from 'express';
import EstudianteController from '../controllers/estudianteController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// GET /api/estudiante
router.get(
  '/',
  authorize('estudiante.leer'),
  EstudianteController.listar
);
// POST /api/estudiante (con foto opcional)
router.post(
  '/',
  authorize('estudiante.crear'),
  upload.single('foto'),
  handleMulterError,
  logActivity('crear', 'estudiante'),
  EstudianteController.crear
);

// PUT /api/estudiante/:id (con foto opcional)
router.put(
  '/:id',
  authorize('estudiante.actualizar'),
  upload.single('foto'),
  handleMulterError,
  logActivity('actualizar', 'estudiante'),
  EstudianteController.actualizar
);

// DELETE /api/estudiante/:id
router.delete(
  '/:id',
  authorize('estudiante.eliminar'),
  logActivity('eliminar', 'estudiante'),
  EstudianteController.eliminar
);

// DELETE /api/estudiante/:id/foto - Solo eliminar foto
router.delete(
  '/:id/foto',
  authorize('estudiante.actualizar'),
  logActivity('eliminar_foto', 'estudiante'),
  EstudianteController.eliminarFoto
);

// === RUTAS DE TUTORES ===

// GET /api/estudiante/:id/tutores
router.get(
  '/:id/tutores',
  authorize('estudiante.leer'),
  EstudianteController.obtenerTutores
);

// POST /api/estudiante/:id/tutores
router.post(
  '/:id/tutores',
  authorize('estudiante.actualizar'),
  logActivity('asignar_tutor', 'estudiante'),
  EstudianteController.asignarTutor
);

// PUT /api/estudiante/:id/tutores/:relacion_id
router.put(
  '/:id/tutores/:relacion_id',
  authorize('estudiante.actualizar'),
  logActivity('actualizar_tutor', 'estudiante'),
  EstudianteController.actualizarTutor
);

// DELETE /api/estudiante/:id/tutores/:relacion_id
router.delete(
  '/:id/tutores/:relacion_id',
  authorize('estudiante.actualizar'),
  logActivity('remover_tutor', 'estudiante'),
  EstudianteController.removerTutor
);
router.get(
  '/estadisticas',
  authorize('estudiante.leer'),
  EstudianteController.obtenerEstadisticas
);
// GET /api/estudiante/:id
router.get(
  '/:id',
  authorize('estudiante.leer'),
  EstudianteController.obtenerPorId
);

export default router;