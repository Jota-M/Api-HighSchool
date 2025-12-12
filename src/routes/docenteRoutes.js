// routes/docenteRoutes.js - VERSIÓN ACTUALIZADA
import express from 'express';
import DocenteController from '../controllers/docenteController.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';
import multer from 'multer';
import { formDataConfigs } from '../middlewares/parsFormDataJSON.js';

const router = express.Router();

// Configuración de multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'foto') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten imágenes para la foto'), false);
      }
    } else if (file.fieldname === 'cv') {
      const allowedTypes = ['application/pdf', 'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten PDF o documentos Word para el CV'), false);
      }
    } else {
      cb(null, true);
    }
  }
});

const uploadFields = upload.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'cv', maxCount: 1 }
]);

// Middleware de autenticación
router.use(authenticate);

// ========================================
// RUTAS PRINCIPALES
// ========================================

// GET /docente/estadisticas - Obtener estadísticas generales
router.get(
  '/estadisticas',
  authorize('docente.leer'),
  DocenteController.obtenerEstadisticas
);

// POST /docente/registro-completo - Registro completo SIN ASIGNACIONES
router.post(
  '/registro-completo',
  authorize('docente.crear'),
  uploadFields,
  formDataConfigs.registroDocente,
  logActivity('registro_completo', 'docente'),
  DocenteController.registroCompleto
);

// GET /docente - Listar docentes
router.get(
  '/',
  authorize('docente.leer'),
  DocenteController.listar
);

// GET /docente/:id - Obtener docente por ID
router.get(
  '/:id',
  authorize('docente.leer'),
  DocenteController.obtenerPorId
);

// PUT /docente/:id - Actualizar docente
router.put(
  '/:id',
  authorize('docente.actualizar'),
  uploadFields,
  logActivity('actualizar', 'docente'),
  DocenteController.actualizar
);

// DELETE /docente/:id - Eliminar docente
router.delete(
  '/:id',
  authorize('docente.eliminar'),
  logActivity('eliminar', 'docente'),
  DocenteController.eliminar
);

// POST /docente/:id/crear-usuario - Crear usuario para docente existente
router.post(
  '/:id/crear-usuario',
  authorize('docente.crear'),
  logActivity('crear_usuario', 'docente'),
  DocenteController.crearUsuario
);

export default router;