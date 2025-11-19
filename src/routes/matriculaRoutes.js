import express from 'express';
import MatriculaController from '../controllers/matriculaController.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';
import { upload, handleMulterError } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// === RUTAS PRINCIPALES ===

// GET /api/matricula - Listar matrículas
router.get(
  '/',
  authorize('matricula.leer'),
  MatriculaController.listar
);

// GET /api/matricula/estadisticas - Estadísticas
router.get(
  '/estadisticas',
  authorize('matricula.leer'),
  MatriculaController.obtenerEstadisticas
);

// GET /api/matricula/:id - Obtener por ID
router.get(
  '/:id',
  authorize('matricula.leer'),
  MatriculaController.obtenerPorId
);

// POST /api/matricula - Crear matrícula
router.post(
  '/',
  authorize('matricula.crear'),
  logActivity('crear', 'matricula'),
  MatriculaController.crear
);

// PUT /api/matricula/:id - Actualizar matrícula
router.put(
  '/:id',
  authorize('matricula.actualizar'),
  logActivity('actualizar', 'matricula'),
  MatriculaController.actualizar
);

// PATCH /api/matricula/:id/estado - Cambiar estado
router.patch(
  '/:id/estado',
  authorize('matricula.actualizar'),
  logActivity('cambiar_estado', 'matricula'),
  MatriculaController.cambiarEstado
);

// DELETE /api/matricula/:id - Eliminar matrícula
router.delete(
  '/:id',
  authorize('matricula.eliminar'),
  logActivity('eliminar', 'matricula'),
  MatriculaController.eliminar
);

// === RUTAS ESPECIALES ===

// GET /api/matricula/paralelo/:paralelo_id - Estudiantes por paralelo
router.get(
  '/paralelo/:paralelo_id',
  authorize('matricula.leer'),
  MatriculaController.listarPorParalelo
);

// POST /api/matricula/:id/transferir - Transferir a otro paralelo
router.post(
  '/:id/transferir',
  authorize('matricula.actualizar'),
  logActivity('transferir_paralelo', 'matricula'),
  MatriculaController.transferirParalelo
);

// === RUTAS DE DOCUMENTOS ===

// GET /api/matricula/:id/documentos - Listar documentos
router.get(
  '/:id/documentos',
  authorize('matricula.leer'),
  MatriculaController.listarDocumentos
);

// POST /api/matricula/:id/documentos - Subir documento
router.post(
  '/:id/documentos',
  authorize('matricula.actualizar'),
  upload.single('documento'),
  handleMulterError,
  logActivity('subir_documento', 'matricula'),
  MatriculaController.subirDocumento
);

// PATCH /api/matricula/:id/documentos/:documento_id/verificar - Verificar documento
router.patch(
  '/:id/documentos/:documento_id/verificar',
  authorize('matricula.actualizar'),
  logActivity('verificar_documento', 'matricula'),
  MatriculaController.verificarDocumento
);

// DELETE /api/matricula/:id/documentos/:documento_id - Eliminar documento
router.delete(
  '/:id/documentos/:documento_id',
  authorize('matricula.actualizar'),
  logActivity('eliminar_documento', 'matricula'),
  MatriculaController.eliminarDocumento
);

export default router;