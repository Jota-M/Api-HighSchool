import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import preinscripcionRoutes from './routes/preinscripcionRoutes.js';
import teacherRoutes from './routes/teacherRoutes.js';
import periodoRoutes from './routes/periodoRoutes.js';
import nivelRoutes from './routes/nivelAcademicoRoutes.js';
import gradoRoutes from './routes/gradoRoutes.js';
import paraleloRoutes from './routes/paraleloRoutes.js';
import materiaRoutes from './routes/materiaRoutes.js';
import gradoMateriaRoutes from './routes/gradoMateriaRoutes.js';
import turnoRoutes from './routes/turnoRoutes.js';
import Sesion from './models/Sesion.js'; 
import authRoutes from './routes/authRoutes.js';
import usuariosRoutes from './routes/usuariosRoutes.js';
import rolesRoutes from './routes/rolesRoutes.js';
import actividadRoutes from './routes/actividadRoutes.js';
import sesionesRoutes from './routes/sesionesRoutes.js';


const app = express();

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Demasiadas solicitudes desde esta IP' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Demasiados intentos de login' },
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.set('trust proxy', 1);
app.use(cors({
  origin: 'http://localhost:3001', // frontend
  credentials: true,               // 🔥 permite enviar cookies
}));
app.use(morgan('dev'));

// Rutas
app.use('/auth', authLimiter, authRoutes);

app.use(limiter);
app.use('/usuarios', usuariosRoutes);
app.use('/roles', rolesRoutes);
app.use('/actividad', actividadRoutes);
app.use('/sesiones', sesionesRoutes);

app.use('/api/preinscripcion', preinscripcionRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/periodos', periodoRoutes);
app.use('/api/niveles-academicos', nivelRoutes);
app.use('/api/grados', gradoRoutes);
app.use('/api/paralelos', paraleloRoutes);
app.use('/api/materias', materiaRoutes);
app.use('/api/grado-materias', gradoMateriaRoutes);
app.use('/api/turnos', turnoRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// Error global
app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Limpiar sesiones expiradas
setInterval(async () => {
  try {
    await Sesion.cleanExpired();
    console.log('Sesiones expiradas limpiadas');
  } catch (error) {
    console.error('Error al limpiar sesiones:', error);
  }
}, 60 * 60 * 1000);

export default app;
