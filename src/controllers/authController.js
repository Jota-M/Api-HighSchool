// controllers/authController.js
import Usuario from '../models/Usuario.js';
import Sesion from '../models/Sesion.js';
import ActividadLog from '../models/actividadLog.js';
import TokenUtils from '../utils/tokenUtils.js';
import RequestInfo from '../utils/requestInfo.js';
import authConfig from '../config/auth.js';

class AuthController {
  // Registro de usuario
  static async register(req, res) {
    try {
      const { username, email, password, confirmPassword } = req.body;

      // Validaciones
      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos.'
        });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Las contraseñas no coinciden.'
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña debe tener al menos 8 caracteres.'
        });
      }

      // Crear usuario
      const usuario = await Usuario.create({ username, email, password });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: usuario.id,
        accion: 'registro',
        modulo: 'auth',
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: 'Usuario registrado exitosamente'
      });

      res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente. Verifica tu correo electrónico.',
        data: {
          id: usuario.id,
          username: usuario.username,
          email: usuario.email
        }
      });
    } catch (error) {
      console.error('Error en registro:', error);
      
      if (error.constraint === 'usuarios_username_key') {
        return res.status(409).json({
          success: false,
          message: 'El nombre de usuario ya está en uso.'
        });
      }
      
      if (error.constraint === 'usuarios_email_key') {
        return res.status(409).json({
          success: false,
          message: 'El correo electrónico ya está registrado.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al registrar usuario: ' + error.message
      });
    }
  }

  // Inicio de sesión
  static async login(req, res) {
    try {
      const { credential, password } = req.body;

      if (!credential || !password) {
        return res.status(400).json({
          success: false,
          message: 'Credenciales requeridas.'
        });
      }

      // Buscar usuario
      const usuario = await Usuario.findByCredential(credential);

      if (!usuario) {
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas.'
        });
      }

      // Verificar si está bloqueado
      if (await Usuario.isLocked(usuario.id)) {
        return res.status(423).json({
          success: false,
          message: 'Cuenta bloqueada temporalmente por múltiples intentos fallidos.'
        });
      }

      // Verificar contraseña
      const passwordValida = await TokenUtils.comparePassword(password, usuario.password);

      if (!passwordValida) {
        await Usuario.incrementFailedAttempts(usuario.id);
        
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: usuario.id,
          accion: 'login_fallido',
          modulo: 'auth',
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'fallido',
          mensaje: 'Intento de login con contraseña incorrecta'
        });

        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas.'
        });
      }

      // Verificar cuenta activa
      if (!usuario.activo) {
        return res.status(403).json({
          success: false,
          message: 'Cuenta desactivada. Contacta al administrador.'
        });
      }

      // Generar tokens
      const payload = { userId: usuario.id, username: usuario.username };
      const accessToken = TokenUtils.generateAccessToken(payload);
      const refreshToken = TokenUtils.generateRefreshToken(payload);

      // Crear sesión
      const reqInfo = RequestInfo.extract(req);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

      await Sesion.create({
        usuario_id: usuario.id,
        token: accessToken,
        refresh_token: refreshToken,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        dispositivo: reqInfo.dispositivo,
        ubicacion: reqInfo.ubicacion,
        expires_at: expiresAt
      });

      // Resetear intentos fallidos
      await Usuario.resetFailedAttempts(usuario.id);
      await Usuario.updateLastAccess(usuario.id);

      // Registrar actividad
      await ActividadLog.create({
        usuario_id: usuario.id,
        accion: 'login',
        modulo: 'auth',
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: 'Login exitoso'
      });

      // Establecer cookies
      res.cookie('access_token', accessToken, authConfig.cookieOptions);
      res.cookie('refresh_token', refreshToken, {
        ...authConfig.cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
      });

      res.json({
        success: true,
        message: 'Login exitoso.',
        data: {
          user: {
            id: usuario.id,
            username: usuario.username,
            email: usuario.email,
            verificado: usuario.verificado,
            debe_cambiar_password: usuario.debe_cambiar_password
          }
        }
      });
    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({
        success: false,
        message: 'Error al iniciar sesión: ' + error.message
      });
    }
  }

  // Cerrar sesión
  static async logout(req, res) {
    try {
      const token = req.cookies.access_token;

      if (token) {
        await Sesion.delete(token);
        
        if (req.user) {
          const reqInfo = RequestInfo.extract(req);
          await ActividadLog.create({
            usuario_id: req.user.id,
            accion: 'logout',
            modulo: 'auth',
            ip_address: reqInfo.ip,
            user_agent: reqInfo.userAgent,
            resultado: 'exitoso',
            mensaje: 'Cierre de sesión exitoso'
          });
        }
      }

      res.clearCookie('access_token');
      res.clearCookie('refresh_token');

      res.json({
        success: true,
        message: 'Sesión cerrada exitosamente.'
      });
    } catch (error) {
      console.error('Error en logout:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cerrar sesión: ' + error.message
      });
    }
  }

  // Renovar token
  static async refreshToken(req, res) {
    try {
      const refreshToken = req.cookies.refresh_token;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token no proporcionado.'
        });
      }

      const decoded = TokenUtils.verifyRefreshToken(refreshToken);
      const sesion = await Sesion.findByRefreshToken(refreshToken);

      if (!sesion) {
        return res.status(401).json({
          success: false,
          message: 'Sesión inválida.'
        });
      }

      // Generar nuevo access token
      const newAccessToken = TokenUtils.generateAccessToken({
        userId: decoded.userId,
        username: decoded.username
      });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await Sesion.updateToken(sesion.id, newAccessToken, expiresAt);

      res.cookie('access_token', newAccessToken, authConfig.cookieOptions);

      res.json({
        success: true,
        message: 'Token renovado exitosamente.'
      });
    } catch (error) {
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      
      res.status(401).json({
        success: false,
        message: 'Error al renovar token: ' + error.message
      });
    }
  }

  // Obtener usuario actual
  static async me(req, res) {
    try {
      res.json({
        success: true,
        data: {
          user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            activo: req.user.activo,
            verificado: req.user.verificado,
            roles: req.user.roles || [],
            permisos: req.user.permisos || []
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener información del usuario: ' + error.message
      });
    }
  }

  // Cambiar contraseña
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword, confirmNewPassword } = req.body;

      if (!currentPassword || !newPassword || !confirmNewPassword) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos.'
        });
      }

      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({
          success: false,
          message: 'Las contraseñas nuevas no coinciden.'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña debe tener al menos 8 caracteres.'
        });
      }

      // Verificar contraseña actual
      const usuario = await Usuario.findByCredential(req.user.username);
      const passwordValida = await TokenUtils.comparePassword(currentPassword, usuario.password);

      if (!passwordValida) {
        return res.status(401).json({
          success: false,
          message: 'Contraseña actual incorrecta.'
        });
      }

      await Usuario.changePassword(req.user.id, newPassword);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cambio_password',
        modulo: 'auth',
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: 'Contraseña cambiada exitosamente'
      });

      res.json({
        success: true,
        message: 'Contraseña cambiada exitosamente.'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al cambiar contraseña: ' + error.message
      });
    }
  }

  // Ver sesiones activas
  static async getSessions(req, res) {
    try {
      const sesiones = await Sesion.getActiveSessions(req.user.id);

      res.json({
        success: true,
        data: { sesiones }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener sesiones: ' + error.message
      });
    }
  }

  // Cerrar todas las sesiones
  static async logoutAll(req, res) {
    try {
      await Sesion.deleteByUserId(req.user.id);

      res.clearCookie('access_token');
      res.clearCookie('refresh_token');

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'logout_all',
        modulo: 'auth',
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: 'Todas las sesiones cerradas'
      });

      res.json({
        success: true,
        message: 'Todas las sesiones han sido cerradas.'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al cerrar sesiones: ' + error.message
      });
    }
  }
}

export default AuthController;
