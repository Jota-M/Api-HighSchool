// routes/configuracionRoutes.js
import express from 'express';
import ConfiguracionController from '../controllers/configuracionController.js';
import { authenticate } from '../Middlewares/auth.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// ============================================================================
// PERFIL DEL USUARIO
// ============================================================================

// GET /api/configuracion/perfil - Obtener datos del perfil
router.get('/perfil', ConfiguracionController.obtenerPerfil);

// PUT /api/configuracion/perfil - Actualizar email
router.put('/perfil', ConfiguracionController.actualizarPerfil);

// ============================================================================
// CONTRASEÑA
// ============================================================================

// PUT /api/configuracion/cambiar-password - Cambiar contraseña
router.put('/cambiar-password', ConfiguracionController.cambiarPassword);

// ============================================================================
// SESIONES
// ============================================================================

// GET /api/configuracion/sesiones - Listar sesiones activas
router.get('/sesiones', ConfiguracionController.obtenerSesiones);

// DELETE /api/configuracion/sesiones - Cerrar todas las sesiones excepto la actual
router.delete('/sesiones', ConfiguracionController.cerrarTodasSesiones);

// DELETE /api/configuracion/sesiones/:id - Cerrar una sesión específica
router.delete('/sesiones/:id', ConfiguracionController.cerrarSesion);

// ============================================================================
// ACTIVIDAD
// ============================================================================

// GET /api/configuracion/actividad - Ver actividad reciente del usuario
router.get('/actividad', ConfiguracionController.obtenerActividad);

export default router;