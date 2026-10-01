// routes/examenRoutes.js
import express from 'express';
import ExamenController from '../controllers/examenController.js';
import { authenticate } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

// Todas las rutas requieren usuario autenticado
router.use(authenticate);

// ==========================================
// ENDPOINTS DOCENTE
// ==========================================

// Generar preguntas con IA directamente (para borrador sin ID previo)
router.post('/generar-ia-directo', ExamenController.generarIADirecto);

// Generar borrador de preguntas con Gemini IA (sin guardar en BD)
router.post('/:evaluacionId/generar-ia', ExamenController.generarIA);

// Obtener banco de preguntas del examen
router.get('/:evaluacionId/preguntas', ExamenController.obtenerPreguntas);

// Guardar banco de preguntas del examen
router.put('/:evaluacionId/preguntas', ExamenController.guardarPreguntas);

// Activar modalidad virtual y configurar tiempos
router.post('/:evaluacionId/publicar-virtual', ExamenController.publicarVirtual);

// Desactivar modalidad virtual (volver a presencial)
router.post('/:evaluacionId/desactivar-virtual', ExamenController.desactivarVirtual);

// Obtener datos y configuración de la evaluación virtual
router.get('/:evaluacionId/configuracion', ExamenController.obtenerConfiguracion);

// Lista de intentos de los alumnos para monitoreo y calificación
router.get('/:evaluacionId/intentos', ExamenController.listarIntentos);

// Detalle de un intento específico con sus respuestas para calificar
router.get('/intentos/:id', ExamenController.obtenerDetalleIntento);

// Calificación manual de una respuesta subjetiva (desarrollo / respuesta corta)
router.put('/respuestas/:id/calificar', ExamenController.calificarRespuestaManual);

// Reiniciar intento de un estudiante individual
router.post('/intentos/:id/reiniciar', ExamenController.reiniciarIntento);
router.delete('/intentos/:id/reiniciar', ExamenController.reiniciarIntento);

// Limpiar todos los intentos de una evaluación completa
router.post('/:evaluacionId/limpiar-intentos', ExamenController.limpiarTodosIntentos);

// ==========================================
// ENDPOINTS ESTUDIANTE
// ==========================================

// Iniciar o retomar el intento del examen
router.post('/:evaluacionId/iniciar', ExamenController.iniciarIntento);

// Autosave de respuesta objetiva o texto
router.put('/respuestas/:id', ExamenController.guardarRespuesta);

// Subida de archivo para preguntas de desarrollo
router.post(
  '/respuestas/:id/archivo',
  upload.single('archivo'),
  handleMulterError,
  ExamenController.subirArchivoRespuesta
);

// Finalizar y entregar examen
router.post('/intentos/:id/entregar', ExamenController.entregarIntento);

export default router;
