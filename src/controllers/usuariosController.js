import Usuario from '../models/Usuario.js';
import ActividadLog from '../models/actividadLog.js';
import Sesion from '../models/Sesion.js';
import RequestInfo from '../utils/requestInfo.js';
import { pool } from "../db/pool.js";

class UsuariosController {
  // Listar usuarios con filtros y paginación
  static async listar(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        search = '', 
        rol = null, 
        activo = null,
        ordenar = 'created_at',
        direccion = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;

      let whereConditions = ['u.deleted_at IS NULL'];
      let params = [];
      let paramCount = 1;

      // Búsqueda por username o email
      if (search) {
        whereConditions.push(`(u.username ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
        params.push(`%${search}%`);
        paramCount++;
      }

      // Filtrar por estado activo
      if (activo !== null) {
        whereConditions.push(`u.activo = $${paramCount}`);
        params.push(activo === 'true');
        paramCount++;
      }

      // Filtrar por rol
      if (rol) {
        whereConditions.push(`EXISTS (
          SELECT 1 FROM usuario_roles ur 
          JOIN roles r ON ur.rol_id = r.id 
          WHERE ur.usuario_id = u.id AND r.nombre = $${paramCount}
        )`);
        params.push(rol);
        paramCount++;
      }

      const whereClause = whereConditions.join(' AND ');

      // Contar total
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM usuarios u WHERE ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total);

      // Obtener usuarios
      const result = await pool.query(
        `SELECT 
          u.id, u.username, u.email, u.activo, u.verificado,
          u.ultimo_acceso, u.created_at,
          json_agg(DISTINCT jsonb_build_object(
            'id', r.id,
            'nombre', r.nombre,
            'descripcion', r.descripcion
          )) FILTER (WHERE r.id IS NOT NULL) as roles
         FROM usuarios u
         LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
         LEFT JOIN roles r ON ur.rol_id = r.id
         WHERE ${whereClause}
         GROUP BY u.id
         ORDER BY u.${ordenar} ${direccion}
         LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        data: {
          usuarios: result.rows,
          paginacion: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error al listar usuarios:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar usuarios: ' + error.message
      });
    }
  }

  // Obtener un usuario por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const usuario = await Usuario.findByIdWithPermissions(id);

      if (!usuario) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      delete usuario.password;

      res.json({
        success: true,
        data: { usuario }
      });
    } catch (error) {
      console.error('Error al obtener usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener usuario: ' + error.message
      });
    }
  }

  // Crear usuario
  static async crear(req, res) {
    try {
      const { username, email, password, rolIds = [] } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username, email y password son requeridos'
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña debe tener al menos 8 caracteres'
        });
      }

      const usuario = await Usuario.create({ username, email, password, rolIds });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'usuarios',
        tabla_afectada: 'usuarios',
        registro_id: usuario.id,
        datos_nuevos: { username, email, roles: rolIds },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Usuario ${username} creado`
      });

      res.status(201).json({
        success: true,
        message: 'Usuario creado exitosamente',
        data: { usuario }
      });
    } catch (error) {
      console.error('Error al crear usuario:', error);

      if (error.constraint === 'usuarios_username_key') {
        return res.status(409).json({
          success: false,
          message: 'El username ya está en uso'
        });
      }

      if (error.constraint === 'usuarios_email_key') {
        return res.status(409).json({
          success: false,
          message: 'El email ya está registrado'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear usuario: ' + error.message
      });
    }
  }

  // Actualizar usuario
  static async actualizar(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { username, email, activo, rolIds } = req.body;

      await client.query('BEGIN');

      const usuarioAnterior = await Usuario.findByIdWithPermissions(id);
      if (!usuarioAnterior) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      const updates = [];
      const params = [];
      let paramCount = 1;

      if (username !== undefined) {
        updates.push(`username = $${paramCount}`);
        params.push(username);
        paramCount++;
      }

      if (email !== undefined) {
        updates.push(`email = $${paramCount}`);
        params.push(email);
        paramCount++;
      }

      if (activo !== undefined) {
        updates.push(`activo = $${paramCount}`);
        params.push(activo);
        paramCount++;
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(id);

      if (updates.length > 1) {
        await client.query(
          `UPDATE usuarios SET ${updates.join(', ')} WHERE id = $${paramCount}`,
          params
        );
      }

      if (rolIds && Array.isArray(rolIds)) {
        await client.query('DELETE FROM usuario_roles WHERE usuario_id = $1', [id]);
        for (const rolId of rolIds) {
          await client.query(
            `INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES ($1, $2, $3)`,
            [id, rolId, req.user.id]
          );
        }
      }

      await client.query('COMMIT');

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'usuarios',
        tabla_afectada: 'usuarios',
        registro_id: id,
        datos_anteriores: usuarioAnterior,
        datos_nuevos: { username, email, activo, roles: rolIds },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Usuario ${id} actualizado`
      });

      const usuarioActualizado = await Usuario.findByIdWithPermissions(id);

      res.json({
        success: true,
        message: 'Usuario actualizado exitosamente',
        data: { usuario: usuarioActualizado }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al actualizar usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar usuario: ' + error.message
      });
    } finally {
      client.release();
    }
  }

  // Eliminar usuario (soft delete)
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      if (parseInt(id) === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'No puedes eliminar tu propia cuenta'
        });
      }

      const usuario = await Usuario.findByIdWithPermissions(id);
      if (!usuario) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      await pool.query(
        'UPDATE usuarios SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      await Sesion.deleteByUserId(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'usuarios',
        tabla_afectada: 'usuarios',
        registro_id: id,
        datos_anteriores: usuario,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Usuario ${usuario.username} eliminado`
      });

      res.json({
        success: true,
        message: 'Usuario eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar usuario: ' + error.message
      });
    }
  }

  // Activar/Desactivar usuario
  static async toggleActivo(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `UPDATE usuarios 
         SET activo = NOT activo, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING activo`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      const nuevoEstado = result.rows[0].activo;

      if (!nuevoEstado) {
        await Sesion.deleteByUserId(id);
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: nuevoEstado ? 'activar' : 'desactivar',
        modulo: 'usuarios',
        tabla_afectada: 'usuarios',
        registro_id: id,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Usuario ${nuevoEstado ? 'activado' : 'desactivado'}`
      });

      res.json({
        success: true,
        message: `Usuario ${nuevoEstado ? 'activado' : 'desactivado'} exitosamente`,
        data: { activo: nuevoEstado }
      });
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar estado: ' + error.message
      });
    }
  }

  // Resetear contraseña (por admin)
  static async resetearPassword(req, res) {
    try {
      const { id } = req.params;
      const { nuevaPassword } = req.body;

      if (!nuevaPassword || nuevaPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña debe tener al menos 8 caracteres'
        });
      }

      await Usuario.changePassword(id, nuevaPassword);
      await pool.query(
        'UPDATE usuarios SET debe_cambiar_password = true WHERE id = $1',
        [id]
      );

      await Sesion.deleteByUserId(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'resetear_password',
        modulo: 'usuarios',
        tabla_afectada: 'usuarios',
        registro_id: id,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Password reseteado por admin`
      });

      res.json({
        success: true,
        message: 'Contraseña reseteada exitosamente. El usuario deberá cambiarla en su próximo login.'
      });
    } catch (error) {
      console.error('Error al resetear password:', error);
      res.status(500).json({
        success: false,
        message: 'Error al resetear contraseña: ' + error.message
      });
    }
  }

  // Obtener actividad de un usuario
  static async obtenerActividad(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50 } = req.query;

      const actividad = await ActividadLog.findByUser(id, limit);

      res.json({
        success: true,
        data: { actividad }
      });
    } catch (error) {
      console.error('Error al obtener actividad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener actividad: ' + error.message
      });
    }
  }
}

export default UsuariosController;
