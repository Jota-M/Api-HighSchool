import express from 'express';
import { RolesController, PermisosController } from '../controllers/rolesController.js';
import { authenticate, requireRole, logActivity } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('admin', 'super_admin'));

// Rutas de Roles
router.get('/', RolesController.listar);
router.get('/:id', RolesController.obtenerPorId);
router.post('/', logActivity('crear', 'roles'), RolesController.crear);
router.put('/:id', logActivity('actualizar', 'roles'), RolesController.actualizar);
router.delete('/:id', logActivity('eliminar', 'roles'), RolesController.eliminar);

// Rutas de Permisos
router.get('/permisos/listar', PermisosController.listar);
router.post('/permisos/crear', logActivity('crear', 'permisos'), PermisosController.crear);
router.delete('/permisos/:id', logActivity('eliminar', 'permisos'), PermisosController.eliminar);

export default router;
