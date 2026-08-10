import TokenUtils from '../utils/tokenUtils.js';
import Sesion from '../models/Sesion.js';
import Usuario from '../models/Usuario.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import authConfig from '../config/auth.js';


// Middleware para verificar autenticación
const authenticate = async (req, res, next) => {
  try {
    // Leer token desde cookie (web) o desde el header Authorization
    // (apps móviles / Flutter, que no manejan cookies httpOnly).
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    const token = req.cookies?.access_token || bearer;

    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_REQUIRED',
        message: 'No autenticado. Token no proporcionado.'
      });
    }

    // Verificar token
    let decoded;
    try {
      decoded = TokenUtils.verifyAccessToken(token);
    } catch (tokenError) {
      if (tokenError.message === 'Token inválido o expirado') {
        const refreshToken =
          req.cookies?.refresh_token ||
          req.headers['x-refresh-token'] ||
          req.headers['refresh-token'];

        if (refreshToken) {
          return handleTokenRefresh(req, res, next, refreshToken);
        }

        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Token de acceso expirado.'
        });
      }

      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Error de autenticación: ' + tokenError.message
      });
    }

    // Verificar que la sesión existe en BD
    const sesion = await Sesion.findByToken(token);
    if (!sesion) {
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      return res.status(401).json({
        success: false,
        code: 'INVALID_SESSION',
        message: 'Sesión inválida o expirada.'
      });
    }

    // Cargar usuario con permisos
    const usuario = await Usuario.findByIdWithPermissions(decoded.userId);

    if (!usuario || !usuario.activo) {
      return res.status(401).json({
        success: false,
        code: 'USER_INACTIVE',
        message: 'Usuario inactivo o no encontrado.'
      });
    }

    // Adjuntar usuario a request
    req.user = usuario;
    req.sessionId = sesion.id;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_ERROR',
      message: 'Error de autenticación: ' + error.message
    });
  }
};

// Renovar token usando refresh token
const handleTokenRefresh = async (req, res, next, providedRefreshToken = null) => {
  try {
    const refreshToken = providedRefreshToken ||
      req.cookies?.refresh_token ||
      req.headers['x-refresh-token'] ||
      req.headers['refresh-token'];

    if (!refreshToken) {
      throw new Error('No hay refresh token disponible');
    }

    // Verificar refresh token
    const decoded = TokenUtils.verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new Error('Refresh token inválido');
    }

    // Buscar sesión con refresh token
    const sesion = await Sesion.findByRefreshToken(refreshToken);
    if (!sesion) {
      throw new Error('Sesión no válida');
    }

    // Generar nuevo access token
    const newAccessToken = TokenUtils.generateAccessToken({
      userId: decoded.userId,
      username: decoded.username
    });

    // Actualizar sesión con nuevo token
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await Sesion.updateToken(sesion.id, newAccessToken, expiresAt);

    // Establecer nueva cookie
    res.cookie('access_token', newAccessToken, authConfig.cookieOptions);

    // Exponer nuevo token en cabecera para clientes móviles / HTTP que no usan cookies
    res.setHeader('X-Access-Token', newAccessToken);
    res.setHeader('Access-Control-Expose-Headers', 'X-Access-Token, Authorization');

    // Cargar usuario y continuar
    const usuario = await Usuario.findByIdWithPermissions(decoded.userId);
    req.user = usuario;
    req.sessionId = sesion.id;

    next();
  } catch (error) {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return res.status(401).json({
      success: false,
      code: 'REFRESH_EXPIRED',
      message: 'Sesión expirada. Por favor inicia sesión nuevamente.'
    });
  }
};

// Middleware para verificar permisos
const authorize = (...permisosRequeridos) => {
  return async (req, res, next) => {
    try {
      const usuario = req.user;

      if (!usuario) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado.'
        });
      }

      // Super admin tiene todos los permisos
      const esSuperAdmin = usuario.roles?.some(r => r.nombre === 'super_admin');
      if (esSuperAdmin) {
        return next();
      }

      // Verificar permisos específicos
      const permisosUsuario = usuario.permisos || [];
      const tienePermiso = permisosRequeridos.some(permiso =>
        permisosUsuario.some(p => p.nombre === permiso)
      );

      if (!tienePermiso) {
        // Registrar intento de acceso no autorizado
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: usuario.id,
          accion: 'acceso_denegado',
          modulo: req.baseUrl || 'sistema',
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: 'fallido',
          mensaje: `Intento de acceso sin permisos: ${permisosRequeridos.join(', ')}`
        });

        return res.status(403).json({
          success: false,
          message: 'No tienes permisos suficientes para realizar esta acción.',
          permisosRequeridos
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error al verificar permisos: ' + error.message
      });
    }
  };
};

// Middleware para verificar roles
const requireRole = (...rolesRequeridos) => {
  return (req, res, next) => {
    const usuario = req.user;

    if (!usuario) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado.'
      });
    }

    // Cambiar 'nombre' por el nombre real de la columna en tu tabla de roles
    const rolesUsuario = usuario.roles?.map(r => r.nombre) || [];
    const tieneRol = rolesRequeridos.some(rol => rolesUsuario.includes(rol));

    if (!tieneRol) {
      return res.status(403).json({
        success: false,
        message: 'No tienes el rol necesario para acceder a este recurso.',
        rolesRequeridos
      });
    }

    next();
  };
};

// Middleware opcional (no falla si no hay token)
const optionalAuth = async (req, res, next) => {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    const token = req.cookies?.access_token || bearer;

    if (token) {
      const decoded = TokenUtils.verifyAccessToken(token);
      const usuario = await Usuario.findByIdWithPermissions(decoded.userId);
      req.user = usuario;
    }
  } catch (error) {
    // Simplemente continúa sin usuario
  }
  next();
};

// Middleware para logging de actividad
const logActivity = (accion, modulo) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async function (data) {
      // Solo registrar si hay usuario autenticado
      if (req.user) {
        const reqInfo = RequestInfo.extract(req);
        await ActividadLog.create({
          usuario_id: req.user.id,
          accion,
          modulo,
          ip_address: reqInfo.ip,
          user_agent: reqInfo.userAgent,
          resultado: data.success ? 'exitoso' : 'fallido',
          mensaje: data.message || `${accion} en ${modulo}`
        });
      }

      return originalJson(data);
    };

    next();
  };
};

export {
  authenticate,
  authorize,
  requireRole,
  optionalAuth,
  logActivity
};