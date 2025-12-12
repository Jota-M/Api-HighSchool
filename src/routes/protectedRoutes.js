// routes/protectedRoutes.js - Ejemplo de rutas protegidas
import express from 'express';
import { authenticate, authorize, requireRole, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

// Ruta que requiere autenticación
router.get('/dashboard', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Bienvenido al dashboard',
    user: req.user.username
  });
});

// Ruta que requiere permiso específico
router.post(
  '/estudiantes',
  authenticate,
  authorize('estudiantes.crear'),
  logActivity('crear_estudiante', 'estudiantes'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Estudiante creado exitosamente'
    });
  }
);

// Ruta que requiere múltiples permisos (cualquiera)
router.put(
  '/calificaciones/:id',
  authenticate,
  authorize('calificaciones.actualizar', 'calificaciones.gestionar'),
  logActivity('actualizar_calificacion', 'calificaciones'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Calificación actualizada'
    });
  }
);

// Ruta que requiere rol específico
router.get(
  '/admin/usuarios',
  authenticate,
  requireRole('admin', 'super_admin'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Lista de usuarios',
      roles: req.user.roles
    });
  }
);

// Ruta que requiere rol super_admin
router.delete(
  '/admin/usuarios/:id',
  authenticate,
  requireRole('super_admin'),
  logActivity('eliminar_usuario', 'usuarios'),
  (req, res) => {
    res.json({
      success: true,
      message: 'Usuario eliminado'
    });
  }
);

export default router;
