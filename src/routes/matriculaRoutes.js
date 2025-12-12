// routes/matriculaRoutes.js
import express from 'express';
import MatriculaController from '../controllers/matriculaController.js';
import MatriculaPDFController from '../controllers/matriculaPDFController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// 📄 RUTAS DE PDF (agregar ANTES de /:id)
// ==========================================

/**
 * GET /api/matricula/:id/pdf
 * Descargar PDF de matrícula
 */
router.get(
  '/:id/pdf',
  authorize('matricula.leer'),
  MatriculaPDFController.generarPDF
);

/**
 * GET /api/matricula/:id/pdf/preview
 * Ver PDF en el navegador (inline)
 */
router.get(
  '/:id/pdf/preview',
  authorize('matricula.leer'),
  MatriculaPDFController.verPDFPreview
);

// ==========================================
// RUTAS EXISTENTES
// ==========================================

// GET /api/matricula
router.get(
  '/',
  authorize('matricula.leer'),
  MatriculaController.listar
);

// GET /api/matricula/estadisticas
router.get(
  '/estadisticas',
  authorize('matricula.leer'),
  MatriculaController.obtenerEstadisticas
);

// ⭐ AGREGAR ESTA RUTA AQUÍ (ANTES DE /:id)
// GET /api/matricula/capacidad
router.get(
  '/capacidad',
  authorize('matricula.leer'),
  MatriculaController.verificarCapacidad
);

// GET /api/matricula/paralelo/:paralelo_id
router.get(
  '/paralelo/:paralelo_id',
  authorize('matricula.leer'),
  MatriculaController.listarPorParalelo
);

// POST /api/matricula
router.post(
  '/',
  authorize('matricula.crear'),
  logActivity('crear', 'matricula'),
  MatriculaController.crear
);

// PUT /api/matricula/:id
router.put(
  '/:id',
  authorize('matricula.actualizar'),
  logActivity('actualizar', 'matricula'),
  MatriculaController.actualizar
);

// PATCH /api/matricula/:id/estado
router.patch(
  '/:id/estado',
  authorize('matricula.actualizar'),
  logActivity('cambiar_estado', 'matricula'),
  MatriculaController.cambiarEstado
);

// POST /api/matricula/:id/transferir
router.post(
  '/:id/transferir',
  authorize('matricula.transferir'),
  logActivity('transferir_paralelo', 'matricula'),
  MatriculaController.transferirParalelo
);

// DELETE /api/matricula/:id
router.delete(
  '/:id',
  authorize('matricula.eliminar'),
  logActivity('eliminar', 'matricula'),
  MatriculaController.eliminar
);

// === DOCUMENTOS ===

// POST /api/matricula/:id/documentos
router.post(
  '/:id/documentos',
  authorize('matricula.actualizar'),
  upload.single('documento'),
  handleMulterError,
  logActivity('subir_documento', 'matricula'),
  MatriculaController.subirDocumento
);

// GET /api/matricula/:id/documentos
router.get(
  '/:id/documentos',
  authorize('matricula.leer'),
  MatriculaController.listarDocumentos
);

// PATCH /api/matricula/:id/documentos/:documento_id/verificar
router.patch(
  '/:id/documentos/:documento_id/verificar',
  authorize('matricula.verificar_documentos'),
  logActivity('verificar_documento', 'matricula'),
  MatriculaController.verificarDocumento
);

// DELETE /api/matricula/:id/documentos/:documento_id
router.delete(
  '/:id/documentos/:documento_id',
  authorize('matricula.actualizar'),
  logActivity('eliminar_documento', 'matricula'),
  MatriculaController.eliminarDocumento
);

// GET /api/matricula/:id (DEBE IR AL FINAL)
router.get(
  '/:id',
  authorize('matricula.leer'),
  MatriculaController.obtenerPorId
);

export default router;