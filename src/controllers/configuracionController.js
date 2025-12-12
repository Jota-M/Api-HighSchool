// controllers/configuracionController.js
import { pool } from '../db/pool.js';
import Usuario from '../models/Usuario.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import bcrypt from 'bcrypt';

class ConfiguracionController {
  
  // ============================================================================
  // PERFIL DEL USUARIO
  // ============================================================================

  /**
   * GET /api/configuracion/perfil
   * Obtener datos del perfil del usuario actual
   */
  static async obtenerPerfil(req, res) {
    try {
      const userId = req.user.id;

      const result = await pool.query(`
        SELECT 
          u.id, u.username, u.email, u.activo, u.verificado,
          u.ultimo_acceso, u.created_at,
          json_agg(
            json_build_object(
              'id', r.id,
              'nombre', r.nombre,
              'descripcion', r.descripcion
            )
          ) FILTER (WHERE r.id IS NOT NULL) as roles
        FROM usuarios u
        LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
        LEFT JOIN roles r ON ur.rol_id = r.id
        WHERE u.id = $1
        GROUP BY u.id
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      res.json({
        success: true,
        data: { perfil: result.rows[0] }
      });

    } catch (error) {
      console.error('Error al obtener perfil:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener perfil',
        error: error.message
      });
    }
  }

  /**
   * PUT /api/configuracion/perfil
   * Actualizar email del usuario
   */
  static async actualizarPerfil(req, res) {
    try {
      const userId = req.user.id;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email es requerido'
        });
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Formato de email inválido'
        });
      }

      // Verificar que el email no esté en uso
      const emailExiste = await pool.query(
        'SELECT id FROM usuarios WHERE email = $1 AND id != $2',
        [email, userId]
      );

      if (emailExiste.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'El email ya está en uso por otro usuario'
        });
      }

      // Actualizar
      const result = await pool.query(
        'UPDATE usuarios SET email = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, email',
        [email, userId]
      );

      // Log
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: userId,
        accion: 'actualizar_perfil',
        modulo: 'configuracion',
        tabla_afectada: 'usuarios',
        registro_id: userId,
        datos_nuevos: { email },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: 'Email actualizado'
      });

      res.json({
        success: true,
        message: 'Email actualizado exitosamente',
        data: { usuario: result.rows[0] }
      });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar perfil',
        error: error.message
      });
    }
  }

  // ============================================================================
  // CAMBIAR CONTRASEÑA
  // ============================================================================

  /**
   * PUT /api/configuracion/cambiar-password
   * Cambiar contraseña del usuario actual
   */
  static async cambiarPassword(req, res) {
    try {
      const userId = req.user.id;
      const { password_actual, password_nueva, password_confirmacion } = req.body;

      // Validaciones
      if (!password_actual || !password_nueva || !password_confirmacion) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos'
        });
      }

      if (password_nueva !== password_confirmacion) {
        return res.status(400).json({
          success: false,
          message: 'Las contraseñas nuevas no coinciden'
        });
      }

      if (password_nueva.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña debe tener al menos 8 caracteres'
        });
      }

      // Obtener usuario
      const usuario = await Usuario.findById(userId);
      if (!usuario) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      // Verificar contraseña actual
      const passwordValida = await bcrypt.compare(password_actual, usuario.password);
      if (!passwordValida) {
        // Log de intento fallido
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: userId,
          accion: 'cambiar_password',
          modulo: 'configuracion',
          tabla_afectada: 'usuarios',
          registro_id: userId,
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'fallido',
          mensaje: 'Contraseña actual incorrecta'
        });

        return res.status(401).json({
          success: false,
          message: 'Contraseña actual incorrecta'
        });
      }

      // Hashear nueva contraseña
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password_nueva, salt);

      // Actualizar contraseña
      await pool.query(
        'UPDATE usuarios SET password = $1, debe_cambiar_password = false, updated_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );

      // Log exitoso
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: userId,
        accion: 'cambiar_password',
        modulo: 'configuracion',
        tabla_afectada: 'usuarios',
        registro_id: userId,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: 'Contraseña cambiada exitosamente'
      });

      res.json({
        success: true,
        message: 'Contraseña actualizada exitosamente'
      });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar contraseña',
        error: error.message
      });
    }
  }

  // ============================================================================
  // SESIONES ACTIVAS
  // ============================================================================

  /**
   * GET /api/configuracion/sesiones
   * Obtener sesiones activas del usuario
   */
  static async obtenerSesiones(req, res) {
    try {
      const userId = req.user.id;

      const result = await pool.query(`
        SELECT 
          id, ip_address, user_agent, dispositivo, ubicacion,
          expires_at, created_at,
          CASE 
            WHEN expires_at > NOW() THEN true 
            ELSE false 
          END as activa
        FROM sesiones
        WHERE usuario_id = $1 
        AND expires_at > NOW()
        ORDER BY created_at DESC
      `, [userId]);

      res.json({
        success: true,
        data: {
          sesiones: result.rows,
          total: result.rows.length
        }
      });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener sesiones',
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/configuracion/sesiones/:id
   * Cerrar una sesión específica
   */
  static async cerrarSesion(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      // Verificar que la sesión pertenece al usuario
      const sesion = await pool.query(
        'SELECT * FROM sesiones WHERE id = $1 AND usuario_id = $2',
        [id, userId]
      );

      if (sesion.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Sesión no encontrada'
        });
      }

      // Eliminar sesión
      await pool.query('DELETE FROM sesiones WHERE id = $1', [id]);

      // Log
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: userId,
        accion: 'cerrar_sesion',
        modulo: 'configuracion',
        tabla_afectada: 'sesiones',
        registro_id: id,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: 'Sesión cerrada manualmente'
      });

      res.json({
        success: true,
        message: 'Sesión cerrada exitosamente'
      });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cerrar sesión',
        error: error.message
      });
    }
  }

  /**
   * DELETE /api/configuracion/sesiones
   * Cerrar todas las sesiones excepto la actual
   */
  static async cerrarTodasSesiones(req, res) {
    try {
      const userId = req.user.id;
      const tokenActual = req.headers.authorization?.split(' ')[1];

      // Obtener ID de la sesión actual
      const sesionActual = await pool.query(
        'SELECT id FROM sesiones WHERE token = $1 AND usuario_id = $2',
        [tokenActual, userId]
      );

      const sesionActualId = sesionActual.rows[0]?.id;

      // Eliminar todas excepto la actual
      const result = await pool.query(
        'DELETE FROM sesiones WHERE usuario_id = $1 AND id != $2 RETURNING id',
        [userId, sesionActualId]
      );

      // Log
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: userId,
        accion: 'cerrar_todas_sesiones',
        modulo: 'configuracion',
        tabla_afectada: 'sesiones',
        datos_nuevos: { sesiones_cerradas: result.rows.length },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `${result.rows.length} sesiones cerradas`
      });

      res.json({
        success: true,
        message: `${result.rows.length} sesiones cerradas exitosamente`,
        data: { sesiones_cerradas: result.rows.length }
      });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cerrar sesiones',
        error: error.message
      });
    }
  }

  // ============================================================================
  // ACTIVIDAD RECIENTE
  // ============================================================================

  /**
   * GET /api/configuracion/actividad
   * Obtener actividad reciente del usuario
   */
  static async obtenerActividad(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 20, offset = 0 } = req.query;

      const result = await pool.query(`
        SELECT 
          id, accion, modulo, tabla_afectada, resultado,
          mensaje, ip_address, created_at
        FROM actividad_log
        WHERE usuario_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      const countResult = await pool.query(
        'SELECT COUNT(*) FROM actividad_log WHERE usuario_id = $1',
        [userId]
      );

      res.json({
        success: true,
        data: {
          actividades: result.rows,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener actividad',
        error: error.message
      });
    }
  }
}

export default ConfiguracionController;