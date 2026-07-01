import dotenv from 'dotenv';

// Cargar variables de entorno según el entorno
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: 'dev.env' });
} else {
  dotenv.config();
}

// Configuración principal de la aplicación
const config = {
  // Puerto del servidor
  port: process.env.PORT || 3000,

  // Configuración de la base de datos
  db: {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    name: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  },

  // Secretos JWT
  jwtSecret:
    process.env.JWT_SECRET ||
    'tu-secreto-super-seguro-cambiar-en-produccion',

  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ||
    'refresh-secret-cambiar',

  // ⏱️ DURACIÓN DE TOKENS
  jwtExpiration: '15m',
  jwtRefreshExpiration: '8h',

  // Seguridad de contraseñas
  bcryptRounds: 12,

  // Seguridad de login
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutos

  // Configuración de cookies
  cookieOptions: {
    httpOnly: true, // No accesible desde JS
    secure: process.env.NODE_ENV === 'production', // HTTPS en producción
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    path: '/',
  },

  // Configuración de Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
};

export default config;
