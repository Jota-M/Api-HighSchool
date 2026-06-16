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
  authorize('matriculacion.leer'),
  MatriculaPDFController.generarPDF
);

/**
 * GET /api/matricula/:id/pdf/preview
 * Ver PDF en el navegador (inline)
 */
router.get(
  '/:id/pdf/preview',
  authorize('matriculacion.leer'),
  MatriculaPDFController.verPDFPreview
);

// ==========================================
// RUTAS EXISTENTES
// ==========================================

// GET /api/matricula
router.get(
  '/',
  authorize('matriculacion.leer'),
  MatriculaController.listar
);

// GET /api/matricula/estadisticas
router.get(
  '/estadisticas',
  authorize('matriculacion.leer'),
  MatriculaController.obtenerEstadisticas
);

// ⭐ AGREGAR ESTA RUTA AQUÍ (ANTES DE /:id)
// GET /api/matricula/capacidad
router.get(
  '/capacidad',
  authorize('matriculacion.leer'),
  MatriculaController.verificarCapacidad
);

// GET /api/matricula/paralelo/:paralelo_id
router.get(
  '/paralelo/:paralelo_id',
  authorize('matriculacion.leer'),
  MatriculaController.listarPorParalelo
);

// POST /api/matricula
router.post(
  '/',
  authorize('matriculacion.crear'),
  logActivity('crear', 'matricula'),
  MatriculaController.crear
);

// PUT /api/matricula/:id
router.put(
  '/:id',
  authorize('matriculacion.actualizar'),
  logActivity('actualizar', 'matriculacion'),
  MatriculaController.actualizar
);

// PATCH /api/matricula/:id/estado
router.patch(
  '/:id/estado',
  authorize('matriculacion.actualizar'),
  logActivity('cambiar_estado', 'matriculacion'),
  MatriculaController.cambiarEstado
);

// POST /api/matricula/:id/transferir
router.post(
  '/:id/transferir',
  authorize('matriculacion.actualizar'),
  logActivity('transferir_paralelo', 'matriculacion'),
  MatriculaController.transferirParalelo
);

// DELETE /api/matricula/:id
router.delete(
  '/:id',
  authorize('matriculacion.eliminar'),
  logActivity('eliminar', 'matriculacion'),
  MatriculaController.eliminar
);

// === DOCUMENTOS ===

// POST /api/matricula/:id/documentos
router.post(
  '/:id/documentos',
  authorize('matriculacion.actualizar'),
  upload.single('documento'),
  handleMulterError,
  logActivity('subir_documento', 'matriculacion'),
  MatriculaController.subirDocumento
);

// GET /api/matricula/:id/documentos
router.get(
  '/:id/documentos',
  authorize('matriculacion.leer'),
  MatriculaController.listarDocumentos
);

// PATCH /api/matricula/:id/documentos/:documento_id/verificar
router.patch(
  '/:id/documentos/:documento_id/verificar',
  authorize('matriculacion.actualizar'),
  logActivity('verificar_documento', 'matriculacion'),
  MatriculaController.verificarDocumento
);

// DELETE /api/matricula/:id/documentos/:documento_id
router.delete(
  '/:id/documentos/:documento_id',
  authorize('matriculacion.actualizar'),
  logActivity('eliminar_documento', 'matriculacion'),
  MatriculaController.eliminarDocumento
);

// GET /api/matricula/:id (DEBE IR AL FINAL)
router.get(
  '/:id',
  authorize('matriculacion.leer'),
  MatriculaController.obtenerPorId
);

export default router;