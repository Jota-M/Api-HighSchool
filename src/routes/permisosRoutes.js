// routes/permisosRoutes.js
import express from 'express';
import {
  PermisoController,
  RolController,
  UsuarioRolController
} from '../controllers/permisosController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// ==========================================
// PERMISOS
// ==========================================

/**
 * GET /api/permisos
 * Lista todos los permisos del sistema
 * Query: ?modulo=notas&search=leer
 */
router.get(
  '/permisoss',
  authorize('permisos.leer'),
  PermisoController.listar
);

/**
 * GET /api/permisos/modulos
 * Lista los módulos disponibles (para selects y filtros del frontend)
 * ⚠️  DEBE ir ANTES de /permisos/:id para que Express no interprete
 *     "modulos" como un parámetro :id
 */
router.get(
  '/permisoss/modulos',
  authorize('permisos.leer'),
  PermisoController.listarModulos
);

/**
 * GET /api/permisos/:id
 * ⚠️  SIEMPRE después de todas las rutas estáticas de /permisos/*
 */
router.get(
  '/permisoss/:id',
  authorize('permisos.leer'),
  PermisoController.obtenerPorId
);

/**
 * POST /api/permisos
 * Crea un nuevo permiso
 * Body: { modulo, accion, nombre, descripcion? }
 * Convención de nombre: "modulo.accion" (ej: "notas.leer", "estudiantes.crear")
 */
router.post(
  '/permisoss',
  authorize('permisos.crear'),
  logActivity('crear', 'permisos'),
  PermisoController.crear
);

/**
 * PUT /api/permisos/:id
 */
router.put(
  '/permisoss/:id',
  authorize('permisos.actualizar'),
  logActivity('actualizar', 'permisos'),
  PermisoController.actualizar
);

/**
 * DELETE /api/permisos/:id
 * Falla con 409 si el permiso está asignado a algún rol
 */
router.delete(
  '/permisoss/:id',
  authorize('permisos.eliminar'),
  logActivity('eliminar', 'permisos'),
  PermisoController.eliminar
);

// ==========================================
// ROLES
// ==========================================

/**
 * GET /api/roles
 * Query: ?es_sistema=true&search=admin
 *
 * Incluye contadores: total_permisos, total_usuarios
 */
router.get(
  '/roles',
  authorize('roles.leer'),
  RolController.listar
);

/**
 * GET /api/roles/:id
 */
router.get(
  '/roles/:id',
  authorize('roles.leer'),
  RolController.obtenerPorId
);

/**
 * GET /api/roles/:id/permisos
 * Permisos asignados al rol agrupados por módulo
 *
 * Flujo de uso en frontend:
 *   1. Admin selecciona un rol
 *   2. GET /roles/:id/permisos          → carga los permisos actuales del rol
 *   3. Admin modifica el checkbox matrix
 *   4. PUT /roles/:id/permisos          → sincroniza todos los permisos de una vez
 */
router.get(
  '/roles/:id/permisos',
  authorize('roles.leer'),
  RolController.obtenerPermisos
);

/**
 * POST /api/roles
 * Body: { nombre, descripcion? }
 * Los roles de sistema (es_sistema=true) solo se crean por seed
 */
router.post(
  '/roles',
  authorize('roles.crear'),
  logActivity('crear', 'roles'),
  RolController.crear
);

/**
 * PUT /api/roles/:id
 * Falla con 403 si el rol es de sistema
 */
router.put(
  '/roles/:id',
  authorize('roles.actualizar'),
  logActivity('actualizar', 'roles'),
  RolController.actualizar
);

/**
 * DELETE /api/roles/:id
 * Falla con 403 si es sistema, 409 si tiene usuarios asignados
 */
router.delete(
  '/roles/:id',
  authorize('roles.eliminar'),
  logActivity('eliminar', 'roles'),
  RolController.eliminar
);

/**
 * PUT /api/roles/:id/permisos
 * Reemplaza TODOS los permisos del rol en una sola operación (bulk)
 * Body: { permiso_ids: [1, 2, 3] }
 *
 * Es la operación principal del "checkbox matrix" del frontend:
 * el admin marca/desmarca permisos y guarda todo de una vez
 */
router.put(
  '/roles/:id/permisos',
  authorize('roles.actualizar'),
  logActivity('sincronizar_permisos', 'roles'),
  RolController.syncPermisos
);

/**
 * POST /api/roles/:id/permisos/:permiso_id
 * Agrega un permiso puntual al rol (toggle individual)
 */
router.post(
  '/roles/:id/permisos/:permiso_id',
  authorize('roles.actualizar'),
  logActivity('agregar_permiso', 'roles'),
  RolController.agregarPermiso
);

/**
 * DELETE /api/roles/:id/permisos/:permiso_id
 * Quita un permiso puntual del rol (toggle individual)
 */
router.delete(
  '/roles/:id/permisos/:permiso_id',
  authorize('roles.actualizar'),
  logActivity('quitar_permiso', 'roles'),
  RolController.quitarPermiso
);

// ==========================================
// USUARIO-ROLES
// ==========================================

/**
 * GET /api/usuarios/:usuario_id/roles
 * Roles asignados a un usuario con detalle
 */
router.get(
  '/usuarios/:usuario_id/roles',
  authorize('roles.leer'),
  UsuarioRolController.getRolesDeUsuario
);

/**
 * GET /api/usuarios/:usuario_id/permisos
 * Todos los permisos efectivos del usuario (unión de todos sus roles)
 * Útil para el frontend: saber qué puede hacer el usuario logueado
 */
router.get(
  '/usuarios/:usuario_id/permisos',
  authorize('permisos.leer'),
  UsuarioRolController.getPermisosEfectivos
);

/**
 * PUT /api/usuarios/:usuario_id/roles
 * Reemplaza TODOS los roles del usuario en una sola operación (bulk)
 * Body: { rol_ids: [1, 2] }
 *
 * Flujo de uso en frontend:
 *   1. Admin abre perfil de usuario
 *   2. GET /usuarios/:id/roles          → carga roles actuales
 *   3. Admin marca/desmarca roles
 *   4. PUT /usuarios/:id/roles          → sincroniza de una vez
 */
router.put(
  '/usuarios/:usuario_id/roles',
  authorize('roles.actualizar'),
  logActivity('sincronizar_roles', 'usuarios'),
  UsuarioRolController.syncRoles
);

/**
 * POST /api/usuarios/:usuario_id/roles/:rol_id
 * Asigna un rol puntual a un usuario (toggle individual)
 */
router.post(
  '/usuarios/:usuario_id/roles/:rol_id',
  authorize('roles.actualizar'),
  logActivity('asignar_rol', 'usuarios'),
  UsuarioRolController.asignarRol
);

/**
 * DELETE /api/usuarios/:usuario_id/roles/:rol_id
 * Quita un rol puntual de un usuario (toggle individual)
 */
router.delete(
  '/usuarios/:usuario_id/roles/:rol_id',
  authorize('roles.actualizar'),
  logActivity('quitar_rol', 'usuarios'),
  UsuarioRolController.quitarRol
);

export default router;