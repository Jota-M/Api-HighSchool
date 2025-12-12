// routes/preInscripcionRoutes.js
import express from 'express';
import multer from 'multer';
import PreInscripcionController from '../controllers/preinscripcionController.js';
import { authenticate } from '../Middlewares/auth.js';
import { formDataConfigs } from '../Middlewares/parsFormDataJSON.js';

const router = express.Router();

// Configurar multer para archivos
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});
const multipleUpload = upload.fields([
  // Documentos del representante
  { name: 'cedula_representante', maxCount: 1 },
  
  // Documentos de hasta 5 estudiantes (índices 0-4)
  { name: 'foto_estudiante_0', maxCount: 1 },
  { name: 'cedula_estudiante_0', maxCount: 1 },
  { name: 'certificado_nacimiento_0', maxCount: 1 },
  { name: 'libreta_notas_0', maxCount: 1 },
  
  { name: 'foto_estudiante_1', maxCount: 1 },
  { name: 'cedula_estudiante_1', maxCount: 1 },
  { name: 'certificado_nacimiento_1', maxCount: 1 },
  { name: 'libreta_notas_1', maxCount: 1 },
  
  { name: 'foto_estudiante_2', maxCount: 1 },
  { name: 'cedula_estudiante_2', maxCount: 1 },
  { name: 'certificado_nacimiento_2', maxCount: 1 },
  { name: 'libreta_notas_2', maxCount: 1 },
  
  { name: 'foto_estudiante_3', maxCount: 1 },
  { name: 'cedula_estudiante_3', maxCount: 1 },
  { name: 'certificado_nacimiento_3', maxCount: 1 },
  { name: 'libreta_notas_3', maxCount: 1 },
  
  { name: 'foto_estudiante_4', maxCount: 1 },
  { name: 'cedula_estudiante_4', maxCount: 1 },
  { name: 'certificado_nacimiento_4', maxCount: 1 },
  { name: 'libreta_notas_4', maxCount: 1 },
]);
// Configuración de campos para crear preinscripción
const cpUpload = upload.fields([
  { name: 'foto_estudiante', maxCount: 1 },
  { name: 'cedula_estudiante', maxCount: 1 },
  { name: 'certificado_nacimiento', maxCount: 1 },
  { name: 'libreta_notas', maxCount: 1 },
  { name: 'cedula_representante', maxCount: 1 },
]);
router.get('/buscar-padre/:ci', PreInscripcionController.buscarPadrePorCI);

// 🆕 Crear preinscripción múltiple (varios estudiantes, un padre)
router.post(
  '/multiple', 
  multipleUpload,
  formDataConfigs.preInscripcionMultiple, // Necesitarás crear este middleware
  PreInscripcionController.crearMultiple
);

// Configuración de campos para re-subir documentos
const reuploadFields = upload.fields([
  { name: 'cedula_estudiante', maxCount: 1 },
  { name: 'certificado_nacimiento', maxCount: 1 },
  { name: 'libreta_notas', maxCount: 1 },
  { name: 'cedula_tutor', maxCount: 1 },
  { name: 'otro', maxCount: 1 },
]);

// ========================================
// RUTAS PÚBLICAS (sin autenticación)
// ========================================

// Crear preinscripción
router.post(
  '/', 
  cpUpload,
  formDataConfigs.preInscripcion,
  PreInscripcionController.crear
);

// Buscar preinscripción por código (para portal de seguimiento)
router.get('/buscar/:codigo', PreInscripcionController.buscarPorCodigo);

// Re-subir documento observado (para que padres puedan corregir)
router.put(
  '/:id/documento/:tipo_documento',
  reuploadFields,
  PreInscripcionController.resubirDocumento
);

// ========================================
// RUTAS PROTEGIDAS (requieren autenticación)
// ========================================

// Listar todas las preinscripciones
router.get('/', authenticate, PreInscripcionController.listar);

// Obtener preinscripción por ID
router.get('/:id', authenticate, PreInscripcionController.obtenerPorId);

// ✅ Cambiar estado (CORREGIDO: PUT → PATCH)
router.patch('/:id/estado', authenticate, PreInscripcionController.cambiarEstado);

// 🆕 Actualizar datos del estudiante (PÚBLICO)
router.put('/:id/estudiante', PreInscripcionController.actualizarDatosEstudiante);

// 🆕 Actualizar datos del tutor (PÚBLICO)
router.put('/:id/tutor', PreInscripcionController.actualizarDatosTutor);

// Marcar documento como observado (ADMIN)
router.patch(
  '/documento/:id/observar',
  authenticate,
  PreInscripcionController.marcarDocumentoObservado
);

// Convertir a estudiante
router.post('/:id/convertir', authenticate, PreInscripcionController.convertirAEstudiante);

// Eliminar
router.delete('/:id', authenticate, PreInscripcionController.eliminar);

export default router;