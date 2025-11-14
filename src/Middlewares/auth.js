import TokenUtils from '../utils/tokenUtils.js';
import Sesion from '../models/Sesion.js';
import Usuario from '../models/Usuario.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';


// Middleware para verificar autenticación
const authenticate = async (req, res, next) => {
  try {
    // Leer token desde cookie
    const token = req.cookies.access_token;

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No autenticado. Token no proporcionado.' 
      });
    }

    // Verificar token
    const decoded = TokenUtils.verifyAccessToken(token);

    // Verificar que la sesión existe en BD
    const sesion = await Sesion.findByToken(token);
    if (!sesion) {
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      return res.status(401).json({ 
        success: false, 
        message: 'Sesión inválida o expirada.' 
      });
    }

    // Cargar usuario con permisos
    const usuario = await Usuario.findByIdWithPermissions(decoded.userId);
    
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario inactivo o no encontrado.' 
      });
    }

    // Adjuntar usuario a request
    req.user = usuario;
    req.sessionId = sesion.id;

    next();
  } catch (error) {
    if (error.message === 'Token inválido o expirado') {
      // Intentar renovar con refresh token
      return handleTokenRefresh(req, res, next);
    }
    
    return res.status(401).json({ 
      success: false, 
      message: 'Error de autenticación: ' + error.message 
    });
  }
};

// Renovar token usando refresh token
const handleTokenRefresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
      throw new Error('No hay refresh token disponible');
    }

    // Verificar refresh token
    const decoded = TokenUtils.verifyRefreshToken(refreshToken);

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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await Sesion.updateToken(sesion.id, newAccessToken, expiresAt);

    // Establecer nueva cookie
    const authConfig = require('../config/auth');
    res.cookie('access_token', newAccessToken, authConfig.cookieOptions);

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
    const rolesUsuario = usuario.roles?.map(r => r.name) || []; 
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
    const token = req.cookies.access_token;
    
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
    
    res.json = async function(data) {
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