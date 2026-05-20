// routes/asistenciaRoutes.js
import express from 'express';
import { SolicitudPermisoController, AsistenciaController } from '../controllers/asistenciaController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';
const router = express.Router();

router.use(authenticate);

// ==========================================
// SOLICITUDES DE PERMISO
// ==========================================

/**
 * GET /api/permisos
 * Lista solicitudes de permiso con filtros opcionales
 * Query: ?estudiante_id=X&estado=pendiente&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
 */
router.get(
  '/permisos',
  authorize('solicitud_permiso.leer'),
  SolicitudPermisoController.listar
);

/**
 * GET /api/permisos/:id
 * Obtiene una solicitud con su historial de cambios
 */
router.get(
  '/permisos/:id',
  authorize('solicitud_permiso.leer'),
  SolicitudPermisoController.obtenerPorId
);

/**
 * GET /api/permisos/:id/historial
 * Historial de auditoría de una solicitud
 */
router.get(
  '/permisos/:id/historial',
  authorize('solicitud_permiso.leer'),
  SolicitudPermisoController.obtenerHistorial
);

/**
 * POST /api/permisos
 * Crear solicitud de permiso (padre de familia o admin)
 */
router.post(
  '/permisos',
  authorize('solicitud_permiso.crear'),
  upload.single('archivo'),
  handleMulterError,
  logActivity('crear', 'solicitud_permiso'),
  SolicitudPermisoController.crear
);

/**
 * PATCH /api/permisos/:id/estado
 * Aprobar o rechazar una solicitud (docente o admin)
 * Body: { estado: 'aprobada'|'rechazada'|'cancelada', motivo_rechazo?, observaciones_revisor? }
 */
router.patch(
  '/permisos/:id/estado',
  authorize('solicitud_permiso.aprobar'),
  logActivity('cambiar_estado', 'solicitud_permiso'),
  SolicitudPermisoController.cambiarEstado
);

// ==========================================
// ASISTENCIA
// ==========================================

/**
 * GET /api/asistencia
 * Lista registros de asistencia con filtros
 * Query: ?matricula_id=X&asignacion_docente_id=Y&fecha=YYYY-MM-DD&estado=ausente
 */
router.get(
  '/',
  authorize('asistencia.leer'),
  AsistenciaController.listar
);

/**
 * GET /api/asistencia/reporte
 * Reporte de asistencia por estudiante (llama al stored procedure)
 * Query: ?matricula_id=X&asignacion_docente_id=Y&fecha_inicio=Z&fecha_fin=W
 * IMPORTANTE: debe ir ANTES de /:id
 */
router.get(
  '/reporte',
  authorize('asistencia.reporte'),
  AsistenciaController.getReporte
);

/**
 * GET /api/asistencia/mis-asignaciones
 * El docente autenticado ve sus materias asignadas con el resumen del día
 * Query: ?fecha=YYYY-MM-DD (opcional, default: hoy)
 *
 * Flujo de uso en frontend:
 *   1. Docente inicia sesión
 *   2. GET /mis-asignaciones → ve sus materias del día con estado (completa/pendiente)
 *   3. Selecciona una materia → GET /lista-dia?asignacion_docente_id=X&fecha=Y
 *   4. Marca asistencia → POST /masivo
 */
router.get(
  '/mis-asignaciones',
  authorize('asistencia.leer'),
  AsistenciaController.getMisAsignaciones
);

/**
 * GET /api/asistencia/lista-dia
 * Lista del día para un docente: todos los estudiantes del paralelo con su estado del día
 * Query: ?asignacion_docente_id=X&fecha=YYYY-MM-DD
 */
router.get(
  '/lista-dia',
  authorize('asistencia.leer'),
  AsistenciaController.getListaDia
);
/**
 * GET /api/asistencia/reporte-clase
 * Reporte de asistencia de TODA LA CLASE para una asignación docente
 * Devuelve: resumen agregado + detalle por estudiante
 * Query: ?asignacion_docente_id=X&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
 *
 * Usado por: ResumenAsistenciaClase (se carga al guardar el pase de lista)
 */
router.get(
  '/reporte-clase',
  authorize('asistencia.reporte'),
  AsistenciaController.getReporteClase
);
 
/**
 * PATCH /api/asistencia/:id/corregir
 * Corregir un registro de asistencia ya guardado
 * Body: { estado, justificacion?, observaciones?, solicitud_permiso_id? }
 *
 * Diferencia con PATCH /:id → este endpoint:
 *   - Requiere estado (no opcional)
 *   - Registra en el log como "corregir" (auditoría diferenciada)
 *   - Actualiza marcado_por con el usuario que corrige
 */
router.patch(
  '/:id/corregir',
  authorize('asistencia.actualizar'),
  logActivity('corregir', 'asistencia'),
  AsistenciaController.corregir
);

/**
 * GET /api/asistencia/:id
 * Obtiene un registro específico de asistencia
 */
router.get(
  '/:id',
  authorize('asistencia.leer'),
  AsistenciaController.obtenerPorId
);

/**
 * POST /api/asistencia
 * Registrar asistencia individual
 */
router.post(
  '/',
  authorize('asistencia.crear'),
  logActivity('crear', 'asistencia'),
  AsistenciaController.registrar
);

/**
 * POST /api/asistencia/masivo
 * Registrar asistencia de toda la lista de un paralelo/materia en un día
 * Body: { asignacion_docente_id, fecha, registros: [{ matricula_id, estado, observaciones? }] }
 */
router.post(
  '/masivo',
  authorize('asistencia.crear'),
  logActivity('registrar_masivo', 'asistencia'),
  AsistenciaController.registrarMasivo
);

/**
 * PATCH /api/asistencia/:id
 * Actualizar un registro de asistencia (corregir estado, agregar justificación)
 */
router.patch(
  '/:id',
  authorize('asistencia.actualizar'),
  logActivity('actualizar', 'asistencia'),
  AsistenciaController.actualizar
);

export default router;