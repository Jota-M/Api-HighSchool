import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

// Rutas principales
import authRoutes from './routes/authRoutes.js';
import usuariosRoutes from './routes/usuariosRoutes.js';
import rolesRoutes from './routes/rolesRoutes.js';
import actividadRoutes from './routes/actividadRoutes.js';
import sesionesRoutes from './routes/sesionesRoutes.js';
import configuracionRoutes from './routes/configuracionRoutes.js';

// Rutas académicas NUEVAS
import periodoAcademicoRoutes from './routes/periodoAcademicoRoutes.js';
import turnoRoutes from './routes/turnoRoutes.js';
import nivelAcademicoRoutes from './routes/nivelAcademicoRoutes.js';
import gradoRoutes from './routes/gradoRoutes.js';
import paraleloRoutes from './routes/paraleloRoutes.js';

// Rutas de módulos antiguos / API
import preinscripcionRoutes from './routes/preinscripcionRoutes.js';
import cupoPreinscripcionRoutes from './routes/cupoPreinscripcionRoutes.js';
import publicAcademicosRoutes from './routes/publicAcademicosRoutes.js';
import materiasRoutes from './routes/materiasRoutes.js';
import gradoMateriasRoutes from './routes/gradoMateriasRoutes.js';
import areaConocimientoRoutes from './routes/areaConocimientoRoutes.js';
import docenteRoutes from './routes/docenteRoutes.js';
import asignacionDocenteRoutes from './routes/asignacionDocenteRoutes.js';

import estudianteRoutes from './routes/estudiantesRoutes.js';
import padreFamiliaRoutes from './routes/padreFamiliaRoutes.js';
import registroCompletoRoutes from './routes/registroCompletoRoutes.js';
import matriculaRoutes from './routes/matriculaRoutes.js';
import matriculacionRoutes from './routes/matriculacionRoutes.js';
import autoMatriculacionRoutes from './routes/autoMatriculacionRoutes.js';
import cursosVacacionalesRoutes from './routes/cursoVacacionalRoutes.js';
import reportesRoutes from './routes/reportesRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import materialRoutes from './routes/materialRoutes.js';

//Rutas modulo transporte
import rutaTransporteRoutes from './routes/rutaTransporteRoutes.js';
import asignacionTransporteRoutes from './routes/asignacionTransporteRoutes.js';
import pagoTransporteRoutes from './routes/pagoTransporteRoutes.js';
import ingresoRoutes from './routes/ingresoRoutes.js';
import notasRoutes from './routes/notasRoutes.js';
import asistenciaRoutes from './routes/asistenciaRoutes.js';

import estudiantedRoutes from './routes/estudiantedRoutes.js';
import padreRoutes from './routes/padreRoutes.js';
import reportesAsistenciaRoutes from './routes/reportesAsistenciaRoutes.js';
import horarioRoutes from './routes/horarioRoutes.js';
import seguimientoRoutes from './routes/seguimientoPedagogicoRoutes.js';
import docentedRoutes from './routes/docentedRoutes.js';
import reportesNotasRoutes from './routes/reportesNotasRoutes.js';
import notificacionRoutes from './routes/notificacionRoutes.js';
import permisosRoutes from './routes/permisosRoutes.js';
import prediccionRoutes from './routes/prediccionRoutes.js';
import backupRoutes from './routes/backupRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import sipCallbackRoutes from './routes/sipCallbackRoutes.js';
import padrePagoRoutes from './routes/padrePagoRoutes.js';
import solicitudFacturaRoutes from './routes/solicitudFacturaRoutes.js';

// Modelo para limpieza de sesiones
import Sesion from './models/Sesion.js';

// Importar pool para DB
import { pool } from './db/pool.js';

const app = express();

// ------------------------------
// Seguridad básica
// ------------------------------
app.use(helmet());

// ------------------------------
// Middlewares básicos
// ------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.set('trust proxy', 1);
app.use(morgan('dev'));

// ------------------------------
// CORS configurado para frontend (DEBE IR ANTES DE TODO)
// ------------------------------
// ------------------------------
// CORS configurado para frontend (DEBE IR ANTES DE TODO)
// ------------------------------
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = ['http://localhost:3001', 'http://localhost:3000', 'https://uepclavozdecristo.site', 'https://www.uepclavozdecristo.site'];

  if (!origin || allowed.includes(origin) || origin.startsWith('chrome-extension://')) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ------------------------------
// Rate limit GLOBAL (DESPUÉS DE CORS)
// ------------------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Demasiadas solicitudes desde esta IP' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // Excluir OPTIONS del rate limit
});

// ------------------------------
// Health check endpoint
// ------------------------------
async function checkDatabaseHealth() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

app.get('/health', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    res.status(dbHealth.success ? 200 : 503).json({
      success: true,
      status: dbHealth.success ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: dbHealth,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
    });
  }
});

// ------------------------------
// Rutas públicas (SIN rate limit)
// ------------------------------
app.use('/public/academicos', publicAcademicosRoutes);

// ------------------------------
// Auth (SIN rate limit global, cada ruta tiene el suyo)
// ------------------------------
app.use('/auth', authRoutes);

// ------------------------------
// SIP CALLBACK (PUBLICO)
// ------------------------------
app.use('/api/sip', sipCallbackRoutes);

// ------------------------------
// Aplicar rate limit al resto de rutas
// ------------------------------
app.use(limiter);

// ------------------------------
// Admin / Sistema
// ------------------------------
app.use('/usuarios', usuariosRoutes);
//app.use('/roles', rolesRoutes);
app.use('/actividad', actividadRoutes);
app.use('/sesiones', sesionesRoutes);
app.use('/configuracion', configuracionRoutes);

// ------------------------------
// Académico NUEVO
// ------------------------------
app.use('/periodo-academico', periodoAcademicoRoutes);
app.use('/turno', turnoRoutes);
app.use('/nivel-academico', nivelAcademicoRoutes);
app.use('/grado', gradoRoutes);

app.use('/paralelo', paraleloRoutes);
app.use('/area-conocimiento', areaConocimientoRoutes);
app.use('/materias', materiasRoutes);
app.use('/grado-materia', gradoMateriasRoutes);
app.use('/reportes', reportesRoutes);

// ------------------------------
// Módulo de Estudiantes y Tutores
// ------------------------------
app.use('/estudiante', estudianteRoutes);
app.use('/padre-familia', padreFamiliaRoutes);
app.use('/registro-completo', registroCompletoRoutes);
app.use('/matricula', matriculaRoutes);
app.use('/matriculacion', matriculacionRoutes);
app.use('/auto-matriculacion', autoMatriculacionRoutes);
app.use('/docente', docenteRoutes);
app.use('/asignacion-docente', asignacionDocenteRoutes);
app.use('/cursos-vacacionales', cursosVacacionalesRoutes);
app.use('/api', paymentRoutes);

// ------------------------------
// Rutas del módulo de notas y asistencia
// ------------------------------
app.use('/notas', notasRoutes);
app.use('/asistencia', asistenciaRoutes);
app.use('/permisos', asistenciaRoutes);
app.use('/materiales', materialRoutes);

// ------------------------------
// Rutas del módulo de transporte
// ------------------------------
app.use('/api/ruta-transporte', rutaTransporteRoutes);
app.use('/api/asignacion-transporte', asignacionTransporteRoutes);
app.use('/api/pago-transporte', pagoTransporteRoutes);
app.use('/api/ingreso', ingresoRoutes);

app.use('/estudianted', estudiantedRoutes);
app.use('/reportes/asistencia', reportesAsistenciaRoutes);
app.use('/reportes/notas', reportesNotasRoutes);
app.use('/horarios', horarioRoutes);
app.use('/seguimiento', seguimientoRoutes);
app.use('/docentes', docentedRoutes);
// app.use('/reportes/notas', reportesNotasRoutes);
app.use('/notificaciones', notificacionRoutes);
app.use('/padre', padreRoutes);
app.use('/prediccion', prediccionRoutes);
app.use('/backups', backupRoutes);
app.use('/whatsapp', whatsappRoutes);
// ------------------------------
// PADRE PAGOS
// ------------------------------
app.use('/padre-p', padrePagoRoutes);
app.use('/solicitudes-factura', solicitudFacturaRoutes);

// ------------------------------
// Rutas API antiguas
// ------------------------------
app.use('/preinscripcion', preinscripcionRoutes);
app.use('/cupos', cupoPreinscripcionRoutes);
// ------------------------------
app.use('/', permisosRoutes);

// ------------------------------
// Manejo de errores / fallback 404
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

// ------------------------------
// Limpieza de sesiones expiradas
// ------------------------------
setInterval(async () => {
  try {
    await Sesion.cleanExpired();
    console.log('Sesiones expiradas limpiadas');
  } catch (error) {
    console.error('Error al limpiar sesiones:', error);
  }
}, 60 * 60 * 1000);

export default app;