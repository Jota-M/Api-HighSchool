// controllers/permisosController.js
import { Permiso, Rol, UsuarioRol } from '../models/Permisos.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

// =============================================
// PERMISOS
// =============================================
class PermisoController {

  // GET /api/permisos
  // Query: ?modulo=notas&search=leer
  static async listar(req, res) {
    try {
      const { modulo, search } = req.query;

      const permisos = await Permiso.findAll({ modulo, search });

      // Agrupa por módulo para el frontend
      const agrupado = {};
      for (const p of permisos) {
        if (!agrupado[p.modulo]) agrupado[p.modulo] = [];
        agrupado[p.modulo].push(p);
      }

      res.json({
        success: true,
        data: {
          permisos,
          agrupado,
          total: permisos.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar permisos: ' + error.message
      });
    }
  }

  // GET /api/permisos/modulos
  // Lista los módulos disponibles (para filtros/selects)
  static async listarModulos(req, res) {
    try {
      const modulos = await Permiso.getModulos();
      res.json({ success: true, data: { modulos } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar módulos: ' + error.message
      });
    }
  }

  // GET /api/permisos/:id
  static async obtenerPorId(req, res) {
    try {
      const permiso = await Permiso.findById(req.params.id);
      if (!permiso) {
        return res.status(404).json({ success: false, message: 'Permiso no encontrado' });
      }
      res.json({ success: true, data: { permiso } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener permiso: ' + error.message
      });
    }
  }

  // POST /api/permisos
  static async crear(req, res) {
    try {
      const { modulo, accion, nombre, descripcion } = req.body;

      if (!modulo || !accion || !nombre) {
        return res.status(400).json({
          success: false,
          message: 'modulo, accion y nombre son requeridos'
        });
      }

      // Verifica duplicado por nombre
      const existente = await Permiso.findByNombre(nombre);
      if (existente) {
        return res.status(409).json({
          success: false,
          message: `Ya existe un permiso con el nombre "${nombre}"`
        });
      }

      const permiso = await Permiso.create({ modulo, accion, nombre, descripcion });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'permisos',
        tabla_afectada: 'permisos',
        registro_id: permiso.id,
        datos_nuevos: permiso,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Permiso creado: ${nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Permiso creado exitosamente',
        data: { permiso }
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un permiso con ese nombre'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al crear permiso: ' + error.message
      });
    }
  }

  // PUT /api/permisos/:id
  static async actualizar(req, res) {
    try {
      const { id } = req.params;

      const anterior = await Permiso.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Permiso no encontrado' });
      }

      const { modulo, accion, nombre, descripcion } = req.body;
      if (!modulo || !accion || !nombre) {
        return res.status(400).json({
          success: false,
          message: 'modulo, accion y nombre son requeridos'
        });
      }

      const permiso = await Permiso.update(id, { modulo, accion, nombre, descripcion });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'permisos',
        tabla_afectada: 'permisos',
        registro_id: permiso.id,
        datos_anteriores: anterior,
        datos_nuevos: permiso,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Permiso actualizado: ${nombre}`
      });

      res.json({
        success: true,
        message: 'Permiso actualizado exitosamente',
        data: { permiso }
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un permiso con ese nombre'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al actualizar permiso: ' + error.message
      });
    }
  }

  // DELETE /api/permisos/:id
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const anterior = await Permiso.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Permiso no encontrado' });
      }

      await Permiso.delete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'permisos',
        tabla_afectada: 'permisos',
        registro_id: parseInt(id),
        datos_anteriores: anterior,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Permiso eliminado: ${anterior.nombre}`
      });

      res.json({ success: true, message: 'Permiso eliminado exitosamente' });
    } catch (error) {
      const status = error.message.includes('asignado') ? 409 : 500;
      res.status(status).json({
        success: false,
        message: 'Error al eliminar permiso: ' + error.message
      });
    }
  }
}

// =============================================
// ROLES
// =============================================
class RolController {

  // GET /api/roles
  // Query: ?es_sistema=true&search=admin
  static async listar(req, res) {
    try {
      const { es_sistema, search } = req.query;

      const roles = await Rol.findAll({
        es_sistema: es_sistema !== undefined ? es_sistema === 'true' : undefined,
        search
      });

      res.json({
        success: true,
        data: { roles, total: roles.length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar roles: ' + error.message
      });
    }
  }

  // GET /api/roles/:id
  static async obtenerPorId(req, res) {
    try {
      const rol = await Rol.findById(req.params.id);
      if (!rol) {
        return res.status(404).json({ success: false, message: 'Rol no encontrado' });
      }
      res.json({ success: true, data: { rol } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener rol: ' + error.message
      });
    }
  }

  // GET /api/roles/:id/permisos
  // Permisos asignados al rol, agrupados por módulo
  static async obtenerPermisos(req, res) {
    try {
      const rol = await Rol.findById(req.params.id);
      if (!rol) {
        return res.status(404).json({ success: false, message: 'Rol no encontrado' });
      }

      const { lista, agrupado } = await Rol.getPermisos(req.params.id);

      res.json({
        success: true,
        data: {
          rol,
          permisos: lista,
          agrupado,
          total: lista.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener permisos del rol: ' + error.message
      });
    }
  }

  // POST /api/roles
  static async crear(req, res) {
    try {
      const { nombre, descripcion } = req.body;

      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: 'nombre es requerido'
        });
      }

      const rol = await Rol.create({ nombre, descripcion });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'roles',
        tabla_afectada: 'roles',
        registro_id: rol.id,
        datos_nuevos: rol,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Rol creado: ${nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Rol creado exitosamente',
        data: { rol }
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un rol con ese nombre'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al crear rol: ' + error.message
      });
    }
  }

  // PUT /api/roles/:id
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion } = req.body;

      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: 'nombre es requerido'
        });
      }

      const anterior = await Rol.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Rol no encontrado' });
      }

      const rol = await Rol.update(id, { nombre, descripcion });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'roles',
        tabla_afectada: 'roles',
        registro_id: rol.id,
        datos_anteriores: anterior,
        datos_nuevos: rol,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Rol actualizado: ${nombre}`
      });

      res.json({
        success: true,
        message: 'Rol actualizado exitosamente',
        data: { rol }
      });
    } catch (error) {
      const status = error.message.includes('sistema') ? 403
        : error.code === '23505' ? 409
        : 500;
      res.status(status).json({
        success: false,
        message: 'Error al actualizar rol: ' + error.message
      });
    }
  }

  // DELETE /api/roles/:id
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const anterior = await Rol.findById(id);
      if (!anterior) {
        return res.status(404).json({ success: false, message: 'Rol no encontrado' });
      }

      await Rol.delete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'roles',
        tabla_afectada: 'roles',
        registro_id: parseInt(id),
        datos_anteriores: anterior,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Rol eliminado: ${anterior.nombre}`
      });

      res.json({ success: true, message: 'Rol eliminado exitosamente' });
    } catch (error) {
      const status = error.message.includes('sistema') ? 403
        : error.message.includes('usuarios asignados') ? 409
        : 500;
      res.status(status).json({
        success: false,
        message: 'Error al eliminar rol: ' + error.message
      });
    }
  }

  // PUT /api/roles/:id/permisos
  // Reemplaza TODOS los permisos del rol (operación bulk desde el frontend)
  static async syncPermisos(req, res) {
    try {
      const { id } = req.params;
      const { permiso_ids } = req.body;

      if (!Array.isArray(permiso_ids)) {
        return res.status(400).json({
          success: false,
          message: 'permiso_ids debe ser un array'
        });
      }

      const rol = await Rol.findById(id);
      if (!rol) {
        return res.status(404).json({ success: false, message: 'Rol no encontrado' });
      }

      const { lista, agrupado } = await Rol.syncPermisos(id, permiso_ids);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'sincronizar_permisos',
        modulo: 'roles',
        tabla_afectada: 'rol_permisos',
        registro_id: parseInt(id),
        datos_nuevos: { permiso_ids },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Permisos sincronizados para rol "${rol.nombre}": ${permiso_ids.length} permisos`
      });

      res.json({
        success: true,
        message: `Permisos del rol actualizados (${lista.length} asignados)`,
        data: { permisos: lista, agrupado, total: lista.length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al sincronizar permisos: ' + error.message
      });
    }
  }

  // POST /api/roles/:id/permisos/:permiso_id
  // Agrega un permiso puntual
  static async agregarPermiso(req, res) {
    try {
      const { id, permiso_id } = req.params;

      const rol     = await Rol.findById(id);
      const permiso = await Permiso.findById(permiso_id);

      if (!rol)     return res.status(404).json({ success: false, message: 'Rol no encontrado' });
      if (!permiso) return res.status(404).json({ success: false, message: 'Permiso no encontrado' });

      await Rol.agregarPermiso(id, permiso_id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'agregar_permiso',
        modulo: 'roles',
        tabla_afectada: 'rol_permisos',
        registro_id: parseInt(id),
        datos_nuevos: { rol_id: id, permiso_id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Permiso "${permiso.nombre}" agregado al rol "${rol.nombre}"`
      });

      res.status(201).json({
        success: true,
        message: `Permiso "${permiso.nombre}" agregado al rol "${rol.nombre}"`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al agregar permiso: ' + error.message
      });
    }
  }

  // DELETE /api/roles/:id/permisos/:permiso_id
  // Quita un permiso puntual
  static async quitarPermiso(req, res) {
    try {
      const { id, permiso_id } = req.params;

      const rol     = await Rol.findById(id);
      const permiso = await Permiso.findById(permiso_id);

      if (!rol)     return res.status(404).json({ success: false, message: 'Rol no encontrado' });
      if (!permiso) return res.status(404).json({ success: false, message: 'Permiso no encontrado' });

      const eliminado = await Rol.quitarPermiso(id, permiso_id);
      if (!eliminado) {
        return res.status(404).json({
          success: false,
          message: 'El permiso no estaba asignado a este rol'
        });
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'quitar_permiso',
        modulo: 'roles',
        tabla_afectada: 'rol_permisos',
        registro_id: parseInt(id),
        datos_anteriores: { rol_id: id, permiso_id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Permiso "${permiso.nombre}" quitado del rol "${rol.nombre}"`
      });

      res.json({
        success: true,
        message: `Permiso "${permiso.nombre}" quitado del rol "${rol.nombre}"`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al quitar permiso: ' + error.message
      });
    }
  }
}

// =============================================
// USUARIO-ROLES
// =============================================
class UsuarioRolController {

  // GET /api/usuarios/:usuario_id/roles
  static async getRolesDeUsuario(req, res) {
    try {
      const { usuario_id } = req.params;
      const roles = await UsuarioRol.getRolesDeUsuario(usuario_id);

      res.json({
        success: true,
        data: { roles, total: roles.length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener roles del usuario: ' + error.message
      });
    }
  }

  // GET /api/usuarios/:usuario_id/permisos
  // Todos los permisos efectivos (unión de todos sus roles)
  static async getPermisosEfectivos(req, res) {
    try {
      const { usuario_id } = req.params;
      const permisos = await UsuarioRol.getPermisosEfectivos(usuario_id);

      // Agrupa por módulo
      const agrupado = {};
      for (const p of permisos) {
        if (!agrupado[p.modulo]) agrupado[p.modulo] = [];
        agrupado[p.modulo].push(p);
      }

      res.json({
        success: true,
        data: { permisos, agrupado, total: permisos.length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener permisos efectivos: ' + error.message
      });
    }
  }

  // PUT /api/usuarios/:usuario_id/roles
  // Reemplaza TODOS los roles del usuario (bulk)
  static async syncRoles(req, res) {
    try {
      const { usuario_id } = req.params;
      const { rol_ids } = req.body;

      if (!Array.isArray(rol_ids)) {
        return res.status(400).json({
          success: false,
          message: 'rol_ids debe ser un array'
        });
      }

      const roles = await UsuarioRol.syncRoles(
        parseInt(usuario_id),
        rol_ids,
        req.user.id
      );

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'sincronizar_roles',
        modulo: 'usuarios',
        tabla_afectada: 'usuario_roles',
        registro_id: parseInt(usuario_id),
        datos_nuevos: { rol_ids },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Roles sincronizados para usuario ${usuario_id}: ${rol_ids.length} roles`
      });

      res.json({
        success: true,
        message: `Roles del usuario actualizados (${roles.length} asignados)`,
        data: { roles, total: roles.length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al sincronizar roles: ' + error.message
      });
    }
  }

  // POST /api/usuarios/:usuario_id/roles/:rol_id
  static async asignarRol(req, res) {
    try {
      const { usuario_id, rol_id } = req.params;

      const rol = await Rol.findById(rol_id);
      if (!rol) return res.status(404).json({ success: false, message: 'Rol no encontrado' });

      await UsuarioRol.asignarRol(parseInt(usuario_id), parseInt(rol_id), req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'asignar_rol',
        modulo: 'usuarios',
        tabla_afectada: 'usuario_roles',
        registro_id: parseInt(usuario_id),
        datos_nuevos: { usuario_id, rol_id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Rol "${rol.nombre}" asignado al usuario ${usuario_id}`
      });

      res.status(201).json({
        success: true,
        message: `Rol "${rol.nombre}" asignado exitosamente`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al asignar rol: ' + error.message
      });
    }
  }

  // DELETE /api/usuarios/:usuario_id/roles/:rol_id
  static async quitarRol(req, res) {
    try {
      const { usuario_id, rol_id } = req.params;

      const rol = await Rol.findById(rol_id);
      if (!rol) return res.status(404).json({ success: false, message: 'Rol no encontrado' });

      const eliminado = await UsuarioRol.quitarRol(parseInt(usuario_id), parseInt(rol_id));
      if (!eliminado) {
        return res.status(404).json({
          success: false,
          message: 'El rol no estaba asignado a este usuario'
        });
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'quitar_rol',
        modulo: 'usuarios',
        tabla_afectada: 'usuario_roles',
        registro_id: parseInt(usuario_id),
        datos_anteriores: { usuario_id, rol_id },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Rol "${rol.nombre}" quitado del usuario ${usuario_id}`
      });

      res.json({
        success: true,
        message: `Rol "${rol.nombre}" quitado exitosamente`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al quitar rol: ' + error.message
      });
    }
  }
}

export { PermisoController, RolController, UsuarioRolController };