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
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

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
        maxAge: 8 * 60 * 60 * 1000 // 8 horas
      });

      res.json({
        success: true,
        message: 'Login exitoso.',
        data: {
          // Se mantienen las cookies httpOnly para el frontend web (sin cambios).
          // Se agregan los tokens en el body para clientes que no manejan
          // cookies de forma nativa (apps móviles / Flutter).
          accessToken,
          refreshToken,
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
      const bearer = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null;
      const token = req.cookies.access_token || bearer;

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
      const bearer = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null;

      // Extraer refresh token de múltiples fuentes posibles (Web y Apps Móviles)
      const refreshToken =
        req.cookies?.refresh_token ||
        req.body?.refreshToken ||
        req.body?.refresh_token ||
        req.body?.token ||
        req.body?.refresh ||
        req.headers['x-refresh-token'] ||
        req.headers['refresh-token'] ||
        bearer;

      if (!refreshToken) {
        console.warn('⚠️ [POST /auth/refresh-token] No se recibió refresh token en body, cookies ni headers:', {
          body: req.body,
          headers: req.headers
        });
        return res.status(400).json({
          success: false,
          code: 'REFRESH_TOKEN_REQUIRED',
          message: 'Refresh token no proporcionado.'
        });
      }

      let decoded;
      try {
        decoded = TokenUtils.verifyRefreshToken(refreshToken);
      } catch (tokenErr) {
        console.warn('⚠️ [POST /auth/refresh-token] El token provisto no se pudo verificar como Refresh Token:', tokenErr.message);
        return res.status(401).json({
          success: false,
          code: 'REFRESH_TOKEN_INVALID',
          message: 'El refresh token es inválido o ha expirado. Debe iniciar sesión nuevamente.'
        });
      }

      const sesion = await Sesion.findByRefreshToken(refreshToken);

      if (!sesion) {
        console.warn('⚠️ [POST /auth/refresh-token] No se encontró una sesión activa asociada al refresh token');
        return res.status(401).json({
          success: false,
          code: 'SESSION_EXPIRED',
          message: 'Sesión no encontrada o cerrada. Inicie sesión nuevamente.'
        });
      }

      // Generar nuevo access token
      const newAccessToken = TokenUtils.generateAccessToken({
        userId: decoded.userId,
        username: decoded.username
      });

      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
      await Sesion.updateToken(sesion.id, newAccessToken, expiresAt);

      res.cookie('access_token', newAccessToken, authConfig.cookieOptions);

      console.log(`✅ [POST /auth/refresh-token] Token renovado exitosamente para usuario_id: ${decoded.userId}`);

      return res.json({
        success: true,
        message: 'Token renovado exitosamente.',
        data: {
          accessToken: newAccessToken,
          refreshToken: refreshToken,
          token: newAccessToken
        }
      });
    } catch (error) {
      console.error('❌ [POST /auth/refresh-token] Error al renovar token:', error);
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');

      return res.status(401).json({
        success: false,
        code: 'REFRESH_FAILED',
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