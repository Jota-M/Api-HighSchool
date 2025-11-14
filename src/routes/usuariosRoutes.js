import express from 'express';
import UsuariosController from '../controllers/usuariosController.js';
import { authenticate, authorize, requireRole, logActivity } from '../middlewares/auth.js';

const router = express.Router();

// Todas las rutas requieren autenticación y permiso de usuarios
router.use(authenticate);

// Listar usuarios
router.get(
  '/',
  authorize('usuarios.leer'),
  UsuariosController.listar
);

// Obtener usuario por ID
router.get(
  '/:id',
  authorize('usuarios.leer'),
  UsuariosController.obtenerPorId
);

// Crear usuario
router.post(
  '/',
  authorize('usuarios.crear'),
  logActivity('crear', 'usuarios'),
  UsuariosController.crear
);

// Actualizar usuario
router.put(
  '/:id',
  authorize('usuarios.actualizar'),
  logActivity('actualizar', 'usuarios'),
  UsuariosController.actualizar
);

// Eliminar usuario
router.delete(
  '/:id',
  authorize('usuarios.eliminar'),
  logActivity('eliminar', 'usuarios'),
  UsuariosController.eliminar
);

// Activar/Desactivar usuario
router.patch(
  '/:id/toggle-activo',
  authorize('usuarios.actualizar'),
  logActivity('toggle_activo', 'usuarios'),
  UsuariosController.toggleActivo
);

// Resetear contraseña
router.post(
  '/:id/reset-password',
  authorize('usuarios.actualizar'),
  logActivity('reset_password', 'usuarios'),
  UsuariosController.resetearPassword
);

// Ver actividad del usuario
router.get(
  '/:id/actividad',
  authorize('usuarios.leer'),
  UsuariosController.obtenerActividad
);

export default router;
