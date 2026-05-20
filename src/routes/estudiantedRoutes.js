// routes/estudiantedRoutes.js
import express from 'express';
import {
  EstudiantePerfilController,
  EstudianteMateriasController,
  EstudianteMaterialesController,
  EstudianteComentariosController,
  EstudianteProgresoController,
  EstudianteNotasController,
  EstudianteAsistenciaController,
    EstudianteHorarioController,    // ← NUEVO
  EstudianteTareasController    
} from '../controllers/estudiantedController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';
import MaterialAsignadoController from '../controllers/materialAsignadoController.js';

const router = express.Router();

// Todas las rutas requieren JWT válido
router.use(authenticate);

// ══════════════════════════════════════════════════════════════
// PERFIL
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/estudiante/perfil
 * Datos personales del estudiante + matrícula activa + grado/paralelo/turno.
 * No requiere params — todo se resuelve desde el JWT.
 */
router.get(
  '/perfil',
  authorize('material.leer'),      // cualquier permiso básico de estudiante es suficiente
  EstudiantePerfilController.getPerfil
);

// ══════════════════════════════════════════════════════════════
// MATERIAS
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/estudiante/mis-materias
 * Todas las materias del estudiante con resumen de materiales, progreso, notas y asistencia.
 * Query: ?periodo_evaluacion_id=X (opcional — filtra por trimestre)
 *
 * Flujo principal en frontend:
 *   1. Login → token JWT
 *   2. GET /mis-materias → cards de cada materia (con nota, progreso, asistencia)
 *   3. Click en materia → GET /mis-materias/:grado_materia_id/temario
 *   4. Click en tema → GET /materiales/:asignacion_docente_id?tema_id=Y
 */
router.get(
  '/mis-materias',
  authorize('material.leer'),
  EstudianteMateriasController.getMisMaterias
);

/**
 * GET /api/estudiante/mis-materias/:grado_materia_id/temario
 * Temario completo de una materia (unidades → temas) con el progreso del estudiante por tema.
 * Solo devuelve unidades/temas activos.
 */
router.get(
  '/mis-materias/:grado_materia_id/temario',
  authorize('material.leer'),
  EstudianteMateriasController.getTemario
);

// ══════════════════════════════════════════════════════════════
// MATERIALES
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/estudiante/materiales/buscar
 * Búsqueda full-text en todos los materiales de las materias del estudiante.
 * Query: ?q=algebra&tipo_material_id=X
 * IMPORTANTE: debe ir ANTES de /:asignacion_docente_id
 */
router.get(
  '/materiales/buscar',
  authorize('material.leer'),
  EstudianteMaterialesController.buscar
);

/**
 * GET /api/estudiante/favoritos
 * Lista de materiales marcados como favoritos por el estudiante.
 * IMPORTANTE: debe ir ANTES de /:asignacion_docente_id
 */
router.get(
  '/favoritos',
  authorize('material.leer'),
  EstudianteMaterialesController.getFavoritos
);

/**
 * GET /api/estudiante/materiales/:asignacion_docente_id
 * Lista materiales publicados y visibles de una materia específica.
 * Valida que la asignación pertenezca al paralelo/período del estudiante.
 * Query: ?tipo_material_id=X&tema_id=Y&page=1&limit=20
 */
router.get(
  '/materiales/:asignacion_docente_id',
  authorize('material.leer'),
  EstudianteMaterialesController.listar
);

/**
 * GET /api/estudiante/material/:material_id
 * Detalle completo de un material + temas vinculados.
 * Valida que el estudiante tenga acceso al material.
 */
router.get(
  '/material/:material_id',
  authorize('material.leer'),
  EstudianteMaterialesController.obtenerDetalle
);

/**
 * POST /api/estudiante/material/:material_id/acceso
 * Registra visualización o descarga del material.
 * El trigger BD actualiza contadores y progreso automáticamente.
 * Body: {
 *   tipo_accion: 'visualizacion' | 'descarga' | 'compartido' | 'impresion',
 *   dispositivo?: 'web' | 'movil' | 'tablet',
 *   duracion_segundos?: number,
 *   completado?: boolean
 * }
 */
router.post(
  '/material/:material_id/acceso',
  authorize('material.leer'),
  EstudianteMaterialesController.registrarAcceso
);

/**
 * POST /api/estudiante/material/:material_id/favorito
 * Toggle favorito — si ya existe lo quita, si no existe lo agrega.
 * Body: { notas_personales?: string }
 */
router.post(
  '/material/:material_id/favorito',
  authorize('material.leer'),
  EstudianteMaterialesController.toggleFavorito
);

// ══════════════════════════════════════════════════════════════
// COMENTARIOS Y DUDAS
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/estudiante/material/:material_id/comentarios
 * Lista comentarios del material con respuestas anidadas.
 * Query: ?solo_dudas=true (filtra solo las preguntas académicas)
 */
router.get(
  '/material/:material_id/comentarios',
  authorize('comentario_material.leer'),
  EstudianteComentariosController.listar
);

/**
 * POST /api/estudiante/material/:material_id/comentarios
 * Crear comentario o duda sobre un material.
 * Body: { contenido, comentario_padre_id?: number, es_duda?: boolean }
 */
router.post(
  '/material/:material_id/comentarios',
  authorize('comentario_material.crear'),
  EstudianteComentariosController.crear
);

/**
 * PUT /api/estudiante/material/:material_id/comentarios/:comentario_id
 * Editar comentario propio.
 * La query valida internamente que usuario_id coincida.
 * Body: { contenido }
 */
router.put(
  '/material/:material_id/comentarios/:comentario_id',
  authorize('comentario_material.actualizar'),
  EstudianteComentariosController.actualizar
);

// ══════════════════════════════════════════════════════════════
// PROGRESO EN MATERIALES
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/estudiante/progreso/:grado_materia_id
 * Reporte de progreso en los temas de una materia (llama al stored procedure).
 */
router.get(
  '/progreso/:grado_materia_id',
  authorize('progreso.leer'),
  EstudianteProgresoController.getProgreso
);

/**
 * PUT /api/estudiante/progreso/:tema_id
 * Actualizar progreso manual en un tema.
 * Body: { estado?, porcentaje_avance?, tiempo_dedicado? }
 * (El trigger también lo actualiza automáticamente al registrar acceso al material)
 */
router.put(
  '/progreso/:tema_id',
  authorize('progreso.actualizar'),
  EstudianteProgresoController.actualizarProgreso
);

// ══════════════════════════════════════════════════════════════
// NOTAS
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/estudiante/notas/boletin/:periodo_evaluacion_id
 * Boletín del período: todas las materias con nota final y estado (aprobado/reprobado).
 * IMPORTANTE: debe ir ANTES de /notas/:grado_materia_id/:periodo_evaluacion_id
 */
router.get(
  '/notas/boletin/:periodo_evaluacion_id',
  authorize('notas.boletin'),
  EstudianteNotasController.getBoletin
);

/**
 * GET /api/estudiante/notas/:grado_materia_id/:periodo_evaluacion_id
 * Detalle de notas de una materia:
 *   - Nota por dimensión (Ser / Saber / Hacer)
 *   - Lista de evaluaciones con calificación individual (solo visible_para_padres = true)
 *   - Nota final del período
 */
router.get(
  '/notas/:grado_materia_id/:periodo_evaluacion_id',
  authorize('notas.boletin'),
  EstudianteNotasController.getNotasPorMateria
);

// ══════════════════════════════════════════════════════════════
// ASISTENCIA
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/estudiante/asistencia/detalle
 * Historial diario: fecha, materia, estado, si tenía permiso aprobado.
 * Query: ?asignacion_docente_id=X&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
 * IMPORTANTE: debe ir ANTES de /asistencia (sin sufijo)
 */
router.get(
  '/asistencia/detalle',
  authorize('asistencia.reporte'),
  EstudianteAsistenciaController.getDetalle
);

/**
 * GET /api/estudiante/asistencia
 * Resumen porcentual de asistencia por materia.
 * Query: ?asignacion_docente_id=X&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
 */
router.get(
  '/asistencia',
  authorize('asistencia.reporte'),
  EstudianteAsistenciaController.getResumen
);
router.get(
  '/horario',
  authorize('material.leer'),    // permiso base de estudiante
  EstudianteHorarioController.getHorario
);

router.get(
  '/tareas',
  authorize('material.leer'),    // permiso base de estudiante
  EstudianteTareasController.listarTareas
);
router.get(
  '/periodos-evaluacion',
  authorize('material.leer'),
  EstudianteNotasController.getPeriodosEvaluacion
);
// ══════════════════════════════════════════════════════════════
// MATERIALES ASIGNADOS POR DOCENTES (MÓDULO NUEVO)
// ══════════════════════════════════════════════════════════════

router.get(
  '/materiales-asignados',
  MaterialAsignadoController.listarParaEstudiante
);
 
router.patch(
  '/materiales-asignados/:id/visto',
  MaterialAsignadoController.marcarVisto
);
 
router.get(
  '/materiales-asignados/pendientes',
  MaterialAsignadoController.pendientes
);


export default router;