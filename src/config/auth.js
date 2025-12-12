import dotenv from 'dotenv';

// Cargar el archivo correspondiente según NODE_ENV
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: 'dev.env' });
} else {
  dotenv.config();
}

const config = {
  port: process.env.PORT || 3000,

  db: {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    name: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  },

  jwtSecret: process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-cambiar',
  jwtExpiration: '1h', // Cambiado de 15m a 1h
  jwtRefreshExpiration: '30d', // Cambiado de 7d a 30d

  bcryptRounds: 12,
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 min

  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // lax en desarrollo
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días (cambiado de 7)
    path: '/',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
};

export default config;