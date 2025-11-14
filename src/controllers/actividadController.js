import { pool } from "../db/pool.js";
import Sesion from "../models/Sesion.js";
import ActividadLog from '../models/actividadLog.js';
import RequestInfo  from '../utils/requestInfo.js';
 
class SesionesController {
  // Listar todas las sesiones activas (admin)
  static async listarTodas(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      // Contar total
      const countResult = await pool.query(
        'SELECT COUNT(*) as total FROM sesiones WHERE expires_at > CURRENT_TIMESTAMP'
      );
      const total = parseInt(countResult.rows[0].total);

      // Obtener sesiones
      const result = await pool.query(
        `SELECT 
          s.id,
          s.usuario_id,
          u.username,
          u.email,
          s.ip_address,
          s.user_agent,
          s.dispositivo,
          s.ubicacion,
          s.created_at,
          s.expires_at
         FROM sesiones s
         JOIN usuarios u ON s.usuario_id = u.id
         WHERE s.expires_at > CURRENT_TIMESTAMP
         ORDER BY s.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      res.json({
        success: true,
        data: {
          sesiones: result.rows,
          paginacion: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error al listar sesiones:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar sesiones: ' + error.message
      });
    }
  }

  // Cerrar sesión de otro usuario (admin)
  static async cerrarSesionUsuario(req, res) {
    try {
      const { sesionId } = req.params;

      const result = await pool.query(
        `DELETE FROM sesiones 
         WHERE id = $1 
         RETURNING usuario_id, ip_address`,
        [sesionId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Sesión no encontrada'
        });
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cerrar_sesion_admin',
        modulo: 'sesiones',
        registro_id: result.rows[0].usuario_id,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Sesión de usuario ${result.rows[0].usuario_id} cerrada por admin`
      });

      res.json({
        success: true,
        message: 'Sesión cerrada exitosamente'
      });
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cerrar sesión: ' + error.message
      });
    }
  }

  // Cerrar todas las sesiones de un usuario (admin)
  static async cerrarTodasUsuario(req, res) {
    try {
      const { usuarioId } = req.params;

      await Sesion.deleteByUserId(usuarioId);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cerrar_todas_sesiones_admin',
        modulo: 'sesiones',
        registro_id: usuarioId,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Todas las sesiones del usuario ${usuarioId} cerradas por admin`
      });

      res.json({
        success: true,
        message: 'Todas las sesiones del usuario cerradas exitosamente'
      });
    } catch (error) {
      console.error('Error al cerrar sesiones:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cerrar sesiones: ' + error.message
      });
    }
  }

  // Estadísticas de sesiones
  static async estadisticas(req, res) {
    try {
      // Sesiones activas totales
      const sesionesActivas = await pool.query(
        'SELECT COUNT(*) as total FROM sesiones WHERE expires_at > CURRENT_TIMESTAMP'
      );

      // Sesiones por dispositivo
      const porDispositivo = await pool.query(
        `SELECT 
          dispositivo,
          COUNT(*) as total
         FROM sesiones
         WHERE expires_at > CURRENT_TIMESTAMP
         GROUP BY dispositivo`
      );

      // Usuarios con más sesiones activas
      const usuariosMultiplesSesiones = await pool.query(
        `SELECT 
          u.id,
          u.username,
          COUNT(*) as sesiones_activas
         FROM sesiones s
         JOIN usuarios u ON s.usuario_id = u.id
         WHERE s.expires_at > CURRENT_TIMESTAMP
         GROUP BY u.id, u.username
         HAVING COUNT(*) > 1
         ORDER BY sesiones_activas DESC
         LIMIT 10`
      );

      res.json({
        success: true,
        data: {
          total: parseInt(sesionesActivas.rows[0].total),
          porDispositivo: porDispositivo.rows,
          usuariosMultiplesSesiones: usuariosMultiplesSesiones.rows
        }
      });
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estadísticas: ' + error.message
      });
    }
  }
}

class ActividadController {
  // Listar toda la actividad del sistema con filtros
  static async listarActividad(req, res) {
    try {
      const {
        page = 1,
        limit = 50,
        usuario_id = null,
        modulo = null,
        accion = null,
        resultado = null,
        fecha_desde = null,
        fecha_hasta = null
      } = req.query;

      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params = [];
      let paramCount = 1;

      if (usuario_id) {
        whereConditions.push(`usuario_id = $${paramCount}`);
        params.push(usuario_id);
        paramCount++;
      }

      if (modulo) {
        whereConditions.push(`modulo = $${paramCount}`);
        params.push(modulo);
        paramCount++;
      }

      if (accion) {
        whereConditions.push(`accion = $${paramCount}`);
        params.push(accion);
        paramCount++;
      }

      if (resultado) {
        whereConditions.push(`resultado = $${paramCount}`);
        params.push(resultado);
        paramCount++;
      }

      if (fecha_desde) {
        whereConditions.push(`created_at >= $${paramCount}`);
        params.push(fecha_desde);
        paramCount++;
      }

      if (fecha_hasta) {
        whereConditions.push(`created_at <= $${paramCount}`);
        params.push(fecha_hasta);
        paramCount++;
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // Contar total
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM actividad_log ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total);

      // Obtener actividad
      const result = await pool.query(
        `SELECT 
          al.*,
          u.username,
          u.email
         FROM actividad_log al
         LEFT JOIN usuarios u ON al.usuario_id = u.id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        data: {
          actividades: result.rows,
          paginacion: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error al listar actividad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar actividad: ' + error.message
      });
    }
  }

  // Obtener estadísticas de actividad
  static async estadisticas(req, res) {
    try {
      const { dias = 7 } = req.query;

      // Actividad por día
      const actividadPorDia = await pool.query(
        `SELECT 
          DATE(created_at) as fecha,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE resultado = 'exitoso') as exitosos,
          COUNT(*) FILTER (WHERE resultado = 'fallido') as fallidos
         FROM actividad_log
         WHERE created_at >= CURRENT_DATE - INTERVAL '${dias} days'
         GROUP BY DATE(created_at)
         ORDER BY fecha DESC`
      );

      // Actividad por módulo
      const actividadPorModulo = await pool.query(
        `SELECT 
          modulo,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE resultado = 'exitoso') as exitosos,
          COUNT(*) FILTER (WHERE resultado = 'fallido') as fallidos
         FROM actividad_log
         WHERE created_at >= CURRENT_DATE - INTERVAL '${dias} days'
         GROUP BY modulo
         ORDER BY total DESC`
      );

      // Usuarios más activos
      const usuariosMasActivos = await pool.query(
        `SELECT 
          u.id,
          u.username,
          u.email,
          COUNT(*) as total_actividades
         FROM actividad_log al
         JOIN usuarios u ON al.usuario_id = u.id
         WHERE al.created_at >= CURRENT_DATE - INTERVAL '${dias} days'
         GROUP BY u.id, u.username, u.email
         ORDER BY total_actividades DESC
         LIMIT 10`
      );

      // Acciones más comunes
      const accionesMasComunes = await pool.query(
        `SELECT 
          accion,
          COUNT(*) as total
         FROM actividad_log
         WHERE created_at >= CURRENT_DATE - INTERVAL '${dias} days'
         GROUP BY accion
         ORDER BY total DESC
         LIMIT 10`
      );

      res.json({
        success: true,
        data: {
          actividadPorDia: actividadPorDia.rows,
          actividadPorModulo: actividadPorModulo.rows,
          usuariosMasActivos: usuariosMasActivos.rows,
          accionesMasComunes: accionesMasComunes.rows
        }
      });
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener estadísticas: ' + error.message
      });
    }
  }

  // Exportar actividad (CSV)
  static async exportarActividad(req, res) {
    try {
      const {
        usuario_id = null,
        modulo = null,
        fecha_desde = null,
        fecha_hasta = null
      } = req.query;

      let whereConditions = [];
      let params = [];
      let paramCount = 1;

      if (usuario_id) {
        whereConditions.push(`usuario_id = $${paramCount}`);
        params.push(usuario_id);
        paramCount++;
      }

      if (modulo) {
        whereConditions.push(`modulo = $${paramCount}`);
        params.push(modulo);
        paramCount++;
      }

      if (fecha_desde) {
        whereConditions.push(`created_at >= $${paramCount}`);
        params.push(fecha_desde);
        paramCount++;
      }

      if (fecha_hasta) {
        whereConditions.push(`created_at <= $${paramCount}`);
        params.push(fecha_hasta);
        paramCount++;
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      const result = await pool.query(
        `SELECT 
          al.id,
          u.username,
          al.accion,
          al.modulo,
          al.tabla_afectada,
          al.registro_id,
          al.ip_address,
          al.resultado,
          al.mensaje,
          al.created_at
         FROM actividad_log al
         LEFT JOIN usuarios u ON al.usuario_id = u.id
         ${whereClause}
         ORDER BY al.created_at DESC`,
        params
      );

      // Generar CSV
      const csv = [
        ['ID', 'Usuario', 'Acción', 'Módulo', 'Tabla', 'Registro ID', 'IP', 'Resultado', 'Mensaje', 'Fecha'].join(','),
        ...result.rows.map(row => 
          [
            row.id,
            row.username || 'N/A',
            row.accion,
            row.modulo,
            row.tabla_afectada || '',
            row.registro_id || '',
            row.ip_address || '',
            row.resultado,
            `"${(row.mensaje || '').replace(/"/g, '""')}"`,
            row.created_at
          ].join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=actividad_${Date.now()}.csv`);
      res.send(csv);
    } catch (error) {
      console.error('Error al exportar actividad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al exportar actividad: ' + error.message
      });
    }
  }
}
export  {ActividadController, SesionesController };