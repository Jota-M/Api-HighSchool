import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

// Rutas principales
import authRoutes from './routes/authRoutes.js';
import usuariosRoutes from './routes/usuariosRoutes.js';
import rolesRoutes from './routes/rolesRoutes.js';
import actividadRoutes from './routes/actividadRoutes.js';
import sesionesRoutes from './routes/sesionesRoutes.js';
// import estudiantesRoutes from './routes/estudiantesRoutes.js';

// Rutas académicas NUEVAS (las que quieres mantener)
import periodoAcademicoRoutes from './routes/periodoAcademicoRoutes.js';
import turnoRoutes from './routes/turnoRoutes.js';
import nivelAcademicoRoutes from './routes/nivelAcademicoRoutes.js';
import gradoRoutes from './routes/gradoRoutes.js';
import paraleloRoutes from './routes/paraleloRoutes.js';

// Rutas de módulos antiguos / API
import preinscripcionRoutes from './routes/preinscripcionRoutes.js';
import teacherRoutes from './routes/teacherRoutes.js';
import periodoRoutes from './routes/periodoRoutes.js';
import nivelRoutes from './routes/nivelAcademicoRoutes.js';
import materiasRoutes from './routes/materiaRoutes.js';
import gradoMateriasRoutes from './routes/gradoMateriasRoutes.js';
import areaConocimientoRoutes from './routes/areaConocimientoRoutes.js'

import estudianteRoutes from './routes/estudiantesRoutes.js';
import padreFamiliaRoutes from './routes/padreFamiliaRoutes.js';
import registroCompletoRoutes from './routes/registroCompletoRoutes.js';
import matriculaRoutes from './routes/matriculaRoutes.js';
// Modelo para limpieza de sesiones
import Sesion from './models/Sesion.js';

const app = express();

// Seguridad básica
app.use(helmet());

// Limites de rate-limit
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

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.set('trust proxy', 1);

app.use(cors({
  origin: 'http://localhost:3001',
  credentials: true,
}));

app.use(morgan('dev'));

// ------------------------------
//          RUTAS
// ------------------------------

// Auth con limitador
app.use('/auth', authLimiter, authRoutes);

// Global limiter
app.use(limiter);

// Admin / Sistema
app.use('/usuarios', usuariosRoutes);
app.use('/roles', rolesRoutes);
app.use('/actividad', actividadRoutes);
app.use('/sesiones', sesionesRoutes);

// Académico NUEVO (LOS QUE QUIERES MANTENER)
app.use('/periodo-academico', periodoAcademicoRoutes);
app.use('/turno', turnoRoutes);
app.use('/nivel-academico', nivelAcademicoRoutes);
app.use('/grado', gradoRoutes);
app.use('/paralelo', paraleloRoutes);
app.use('/area-conocimiento', areaConocimientoRoutes);
app.use('/materias', materiasRoutes);
app.use('/grado-materia', gradoMateriasRoutes);

// Módulo de Estudiantes y Tutores
app.use('/estudiante', estudianteRoutes);
app.use('/padre-familia', padreFamiliaRoutes);
app.use('/registro-completo', registroCompletoRoutes);
app.use('/matricula', matriculaRoutes);
// app.use('/estudiantes', estudiantesRoutes);

// ------------------------------
//        Rutas API antiguas
// ------------------------------
app.use('/api/preinscripcion', preinscripcionRoutes);
// app.use('/api/teachers', teacherRoutes);
// app.use('/api/periodos', periodoRoutes);
// app.use('/api/niveles-academicos', nivelRoutes);
// app.use('/api/materias', materiaRoutes);
// app.use('/api/grado-materias', gradoMateriaRoutes);

// ------------------------------
//        Errores / fallback
// ------------------------------
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Limpieza de sesiones expiradas
setInterval(async () => {
  try {
    await Sesion.cleanExpired();
    console.log('Sesiones expiradas limpiadas');
  } catch (error) {
    console.error('Error al limpiar sesiones:', error);
  }
}, 60 * 60 * 1000);

export default app;
