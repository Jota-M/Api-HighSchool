import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import authConfig from '../config/auth.js';

class TokenUtils {
  // Generar token de acceso (corta duración)
  static generateAccessToken(payload) {
    return jwt.sign(payload, authConfig.jwtSecret, {
      expiresIn: authConfig.jwtExpiration
    });
  }

  // Generar refresh token (larga duración)
  static generateRefreshToken(payload) {
    return jwt.sign(payload, authConfig.jwtRefreshSecret, {
      expiresIn: authConfig.jwtRefreshExpiration
    });
  }

  // Verificar access token
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, authConfig.jwtSecret);
    } catch (error) {
      throw new Error('Token inválido o expirado');
    }
  }

  // Verificar refresh token
  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, authConfig.jwtRefreshSecret);
    } catch (error) {
      throw new Error('Refresh token inválido o expirado');
    }
  }

  // Generar token aleatorio para verificación/recuperación
  static generateRandomToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Hash de contraseña
  static async hashPassword(password) {
    return await bcrypt.hash(password, authConfig.bcryptRounds);
  }

  // Comparar contraseña
  static async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }
}

export default TokenUtils;
