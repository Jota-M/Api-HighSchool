import RequestInfo from '../utils/requestInfo.js';
import { pool } from "../db/pool.js";
import ActividadLog from '../models/actividadLog.js';

class RolesController {
  // Listar todos los roles
  static async listar(req, res) {
    try {
      const result = await pool.query(
        `SELECT 
          r.id, r.nombre, r.descripcion, r.es_sistema, r.created_at,
          COUNT(DISTINCT ur.usuario_id) as usuarios_count,
          json_agg(DISTINCT jsonb_build_object(
            'id', p.id,
            'modulo', p.modulo,
            'accion', p.accion,
            'nombre', p.nombre
          )) FILTER (WHERE p.id IS NOT NULL) as permisos
         FROM roles r
         LEFT JOIN usuario_roles ur ON r.id = ur.rol_id
         LEFT JOIN rol_permisos rp ON r.id = rp.rol_id
         LEFT JOIN permisos p ON rp.permiso_id = p.id
         GROUP BY r.id
         ORDER BY r.created_at ASC`
      );

      res.json({
        success: true,
        data: { roles: result.rows }
      });
    } catch (error) {
      console.error('Error al listar roles:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar roles: ' + error.message
      });
    }
  }

  // Obtener rol por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `SELECT 
          r.id, r.nombre, r.descripcion, r.es_sistema, r.created_at,
          json_agg(DISTINCT jsonb_build_object(
            'id', p.id,
            'modulo', p.modulo,
            'accion', p.accion,
            'nombre', p.nombre,
            'descripcion', p.descripcion
          )) FILTER (WHERE p.id IS NOT NULL) as permisos
         FROM roles r
         LEFT JOIN rol_permisos rp ON r.id = rp.rol_id
         LEFT JOIN permisos p ON rp.permiso_id = p.id
         WHERE r.id = $1
         GROUP BY r.id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Rol no encontrado'
        });
      }

      res.json({
        success: true,
        data: { rol: result.rows[0] }
      });
    } catch (error) {
      console.error('Error al obtener rol:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener rol: ' + error.message
      });
    }
  }

  // Crear rol
  static async crear(req, res) {
    const client = await pool.connect();
    try {
      const { nombre, descripcion, permisoIds = [] } = req.body;

      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: 'El nombre del rol es requerido'
        });
      }

      await client.query('BEGIN');

      // Crear rol
      const result = await client.query(
        `INSERT INTO roles (nombre, descripcion, es_sistema) 
         VALUES ($1, $2, false) 
         RETURNING *`,
        [nombre, descripcion]
      );

      const rol = result.rows[0];

      // Asignar permisos
      if (permisoIds.length > 0) {
        for (const permisoId of permisoIds) {
          await client.query(
            'INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ($1, $2)',
            [rol.id, permisoId]
          );
        }
      }

      await client.query('COMMIT');

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'roles',
        tabla_afectada: 'roles',
        registro_id: rol.id,
        datos_nuevos: { nombre, descripcion, permisos: permisoIds },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Rol ${nombre} creado`
      });

      res.status(201).json({
        success: true,
        message: 'Rol creado exitosamente',
        data: { rol }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al crear rol:', error);
      
      if (error.constraint === 'roles_nombre_key') {
        return res.status(409).json({
          success: false,
          message: 'El nombre del rol ya existe'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear rol: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // Actualizar rol
  static async actualizar(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { nombre, descripcion, permisoIds } = req.body;

      // Verificar que no sea rol de sistema
      const checkRol = await client.query(
        'SELECT es_sistema, nombre FROM roles WHERE id = $1',
        [id]
      );

      if (checkRol.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Rol no encontrado'
        });
      }

      if (checkRol.rows[0].es_sistema) {
        return res.status(403).json({
          success: false,
          message: 'No se pueden modificar roles del sistema'
        });
      }

      await client.query('BEGIN');

      // Actualizar datos básicos
      if (nombre || descripcion) {
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (nombre) {
          updates.push(`nombre = $${paramCount}`);
          params.push(nombre);
          paramCount++;
        }

        if (descripcion !== undefined) {
          updates.push(`descripcion = $${paramCount}`);
          params.push(descripcion);
          paramCount++;
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        await client.query(
          `UPDATE roles SET ${updates.join(', ')} WHERE id = $${paramCount}`,
          params
        );
      }

      // Actualizar permisos si se proporcionaron
      if (permisoIds && Array.isArray(permisoIds)) {
        await client.query('DELETE FROM rol_permisos WHERE rol_id = $1', [id]);
        
        for (const permisoId of permisoIds) {
          await client.query(
            'INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ($1, $2)',
            [id, permisoId]
          );
        }
      }

      await client.query('COMMIT');

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'roles',
        tabla_afectada: 'roles',
        registro_id: id,
        datos_nuevos: { nombre, descripcion, permisos: permisoIds },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Rol ${id} actualizado`
      });

      // Obtener rol actualizado
      const rolActualizado = await pool.query(
        `SELECT 
          r.*, 
          json_agg(p.*) FILTER (WHERE p.id IS NOT NULL) as permisos
         FROM roles r
         LEFT JOIN rol_permisos rp ON r.id = rp.rol_id
         LEFT JOIN permisos p ON rp.permiso_id = p.id
         WHERE r.id = $1
         GROUP BY r.id`,
        [id]
      );

      res.json({
        success: true,
        message: 'Rol actualizado exitosamente',
        data: { rol: rolActualizado.rows[0] }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al actualizar rol:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar rol: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // Eliminar rol
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      // Verificar que no sea rol de sistema
      const checkRol = await pool.query(
        'SELECT es_sistema, nombre FROM roles WHERE id = $1',
        [id]
      );

      if (checkRol.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Rol no encontrado'
        });
      }

      if (checkRol.rows[0].es_sistema) {
        return res.status(403).json({
          success: false,
          message: 'No se pueden eliminar roles del sistema'
        });
      }

      // Verificar que no tenga usuarios asignados
      const usuariosCount = await pool.query(
        'SELECT COUNT(*) as count FROM usuario_roles WHERE rol_id = $1',
        [id]
      );

      if (parseInt(usuariosCount.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede eliminar un rol que tiene usuarios asignados'
        });
      }

      await pool.query('DELETE FROM roles WHERE id = $1', [id]);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'roles',
        tabla_afectada: 'roles',
        registro_id: id,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Rol ${checkRol.rows[0].nombre} eliminado`
      });

      res.json({
        success: true,
        message: 'Rol eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar rol:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar rol: ' + error.message
      });
    }
  }
}
class PermisosController {
  // Listar todos los permisos agrupados por módulo
  static async listar(req, res) {
    try {
      const result = await pool.query(
        `SELECT * FROM permisos ORDER BY modulo, accion`
      );

      // Agrupar por módulo
      const permisosPorModulo = result.rows.reduce((acc, permiso) => {
        if (!acc[permiso.modulo]) {
          acc[permiso.modulo] = [];
        }
        acc[permiso.modulo].push(permiso);
        return acc;
      }, {});

      res.json({
        success: true,
        data: { 
          permisos: result.rows,
          permisosPorModulo
        }
      });
    } catch (error) {
      console.error('Error al listar permisos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar permisos: ' + error.message
      });
    }
  }

  // Crear permiso
  static async crear(req, res) {
    try {
      const { modulo, accion, nombre, descripcion } = req.body;

      if (!modulo || !accion || !nombre) {
        return res.status(400).json({
          success: false,
          message: 'Módulo, acción y nombre son requeridos'
        });
      }

      const result = await pool.query(
        `INSERT INTO permisos (modulo, accion, nombre, descripcion)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [modulo, accion, nombre, descripcion]
      );

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'permisos',
        tabla_afectada: 'permisos',
        registro_id: result.rows[0].id,
        datos_nuevos: { modulo, accion, nombre, descripcion },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Permiso ${nombre} creado`
      });

      res.status(201).json({
        success: true,
        message: 'Permiso creado exitosamente',
        data: { permiso: result.rows[0] }
      });
    } catch (error) {
      console.error('Error al crear permiso:', error);
      
      if (error.constraint === 'permisos_nombre_key') {
        return res.status(409).json({
          success: false,
          message: 'El nombre del permiso ya existe'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear permiso: ' + error.message
      });
    }
  }

  // Eliminar permiso
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM permisos WHERE id = $1 RETURNING nombre',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Permiso no encontrado'
        });
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'permisos',
        tabla_afectada: 'permisos',
        registro_id: id,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Permiso ${result.rows[0].nombre} eliminado`
      });

      res.json({
        success: true,
        message: 'Permiso eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar permiso:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar permiso: ' + error.message
      });
    }
  }
}
export { RolesController, PermisosController };
