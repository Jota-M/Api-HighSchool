// routes/materialRoutes.js
import express from 'express';
import {
  TipoMaterialController,
  UnidadTematicaController,
  TemaController,
  MaterialAcademicoController,
  AccesoMaterialController,
  ComentarioMaterialController,
  FavoritoMaterialController,
  ProgresoEstudianteController
} from '../controllers/materialController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ==========================================================
// TIPOS DE MATERIAL — catálogo de referencia
// ==========================================================

/**
 * GET /api/materiales/tipos
 * Lista todos los tipos de material activos (PDF, Video, PPT, etc.)
 */
router.get(
  '/tipos',
  authorize('material.leer'),
  TipoMaterialController.listar
);

// ==========================================================
// UNIDADES TEMÁTICAS
// ==========================================================

/**
 * GET /api/materiales/unidades/temario/:grado_materia_id
 * Temario completo de una materia (unidades + temas + total materiales).
 * Usado por el docente para ver el árbol completo y por el estudiante/padre.
 * Query: ?periodo_evaluacion_id=X (opcional)
 * IMPORTANTE: debe ir ANTES de /unidades/:id
 */
router.get(
  '/unidades/temario/:grado_materia_id',
  authorize('material.leer'),
  UnidadTematicaController.getTemario
);

/**
 * GET /api/materiales/unidades
 * Lista unidades temáticas con filtros.
 * Query: ?grado_materia_id=X&periodo_evaluacion_id=Y&activo=true
 */
router.get(
  '/unidades',
  authorize('material.leer'),
  UnidadTematicaController.listar
);

/**
 * GET /api/materiales/unidades/:id
 */
router.get(
  '/unidades/:id',
  authorize('material.leer'),
  UnidadTematicaController.obtenerPorId
);

/**
 * POST /api/materiales/unidades
 * Crear unidad temática (solo docente/admin).
 * Body: { grado_materia_id, numero_unidad, titulo, descripcion?, objetivos?, orden?,
 *         fecha_inicio_prevista?, fecha_fin_prevista?, periodo_evaluacion_id? }
 */
router.post(
  '/unidades',
  authorize('unidad_tematica.crear'),
  logActivity('crear', 'unidad_tematica'),
  UnidadTematicaController.crear
);

/**
 * PUT /api/materiales/unidades/:id
 */
router.put(
  '/unidades/:id',
  authorize('unidad_tematica.actualizar'),
  logActivity('actualizar', 'unidad_tematica'),
  UnidadTematicaController.actualizar
);

/**
 * DELETE /api/materiales/unidades/:id
 * Soft delete (activo = false)
 */
router.delete(
  '/unidades/:id',
  authorize('unidad_tematica.eliminar'),
  logActivity('eliminar', 'unidad_tematica'),
  UnidadTematicaController.eliminar
);

// ==========================================================
// TEMAS
// ==========================================================

/**
 * GET /api/materiales/temas
 * Query: ?unidad_tematica_id=X&activo=true&nivel_dificultad=basico
 */
router.get(
  '/temas',
  authorize('tema.leer'),
  TemaController.listar
);

/**
 * GET /api/materiales/temas/:id
 */
router.get(
  '/temas/:id',
  authorize('tema.leer'),
  TemaController.obtenerPorId
);

/**
 * POST /api/materiales/temas
 * Body: { unidad_tematica_id, numero_tema, titulo, descripcion?, contenido?,
 *         palabras_clave?: string[], duracion_estimada?, nivel_dificultad?, orden? }
 */
router.post(
  '/temas',
  authorize('tema.crear'),
  logActivity('crear', 'tema'),
  TemaController.crear
);

/**
 * PUT /api/materiales/temas/:id
 */
router.put(
  '/temas/:id',
  authorize('tema.actualizar'),
  logActivity('actualizar', 'tema'),
  TemaController.actualizar
);

/**
 * DELETE /api/materiales/temas/:id
 */
router.delete(
  '/temas/:id',
  authorize('tema.eliminar'),
  logActivity('eliminar', 'tema'),
  TemaController.eliminar
);

// ==========================================================
// MATERIALES ACADÉMICOS
// ==========================================================

/**
 * GET /api/materiales/buscar
 * Búsqueda full-text en español.
 * Query: ?q=algebra&asignacion_docente_id=X&tipo_material_id=Y&solo_visibles=true
 * IMPORTANTE: debe ir ANTES de /:id
 */
router.get(
  '/buscar',
  authorize('material.leer'),
  MaterialAcademicoController.buscar
);

/**
 * GET /api/materiales/destacados
 * Materiales marcados como destacados de una asignación.
 * Query: ?asignacion_docente_id=X&limite=5
 * IMPORTANTE: debe ir ANTES de /:id
 */
router.get(
  '/destacados',
  authorize('material.leer'),
  MaterialAcademicoController.getDestacados
);

/**
 * GET /api/materiales/favoritos
 * Lista de materiales favoritos de un estudiante.
 * Query: ?matricula_id=X
 * IMPORTANTE: debe ir ANTES de /:id
 */
router.get(
  '/favoritos',
  authorize('material.leer'),
  FavoritoMaterialController.listar
);

/**
 * GET /api/materiales/progreso
 * Reporte de progreso del estudiante por materia.
 * Query: ?matricula_id=X&grado_materia_id=Y
 * IMPORTANTE: debe ir ANTES de /:id
 */
router.get(
  '/progreso',
  authorize('progreso.leer'),
  ProgresoEstudianteController.getReporte
);

/**
 * GET /api/materiales
 * Lista materiales con filtros.
 * Query: ?asignacion_docente_id=X&tipo_material_id=Y&visible_para_estudiantes=true
 *        &solo_publicados=true&es_destacado=true&tema_id=Z&page=1&limit=10
 */
router.get(
  '/',
  authorize('material.leer'),
  MaterialAcademicoController.listar
);

/**
 * GET /api/materiales/:id/estadisticas
 * Estadísticas de uso de un material (vistas, descargas, tiempo promedio, etc.)
 * Query: ?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
 */
router.get(
  '/:id/estadisticas',
  authorize('estadisticas_material.leer'),
  MaterialAcademicoController.getEstadisticas
);

/**
 * GET /api/materiales/:id
 * Detalle de un material + temas vinculados.
 */
router.get(
  '/:id',
  authorize('material.leer'),
  MaterialAcademicoController.obtenerPorId
);

/**
 * POST /api/materiales
 * Subir nuevo material.
 *
 * Multipart/form-data (si tiene archivo físico):
 *   archivo:               File (PDF, video, docx, etc.)
 *   asignacion_docente_id: number
 *   tipo_material_id:      number
 *   titulo:                string
 *   descripcion?:          string
 *   es_enlace_externo:     false
 *   visible_para_estudiantes?: boolean (default: true)
 *   fecha_publicacion?:    ISO string
 *   fecha_despublicacion?: ISO string
 *   requiere_descarga?:    boolean
 *   es_destacado?:         boolean
 *   temas?:                JSON string → [{ tema_id, es_principal, orden }]
 *
 * JSON (si es enlace externo):
 *   es_enlace_externo: true
 *   url_externa:       string (YouTube, Drive, etc.)
 *   + mismos campos de arriba
 */
router.post(
  '/',
  authorize('material.crear'),
  upload.single('archivo'),
  handleMulterError,
  logActivity('crear', 'material'),
  MaterialAcademicoController.crear
);

/**
 * PUT /api/materiales/:id
 * Actualizar datos del material.
 * Si se sube un nuevo archivo, reemplaza al anterior en Cloudinary.
 */
router.put(
  '/:id',
  authorize('material.actualizar'),
  upload.single('archivo'),
  handleMulterError,
  logActivity('actualizar', 'material'),
  MaterialAcademicoController.actualizar
);

/**
 * DELETE /api/materiales/:id
 * Soft delete + elimina archivo de Cloudinary si lo tiene.
 */
router.delete(
  '/:id',
  authorize('material.eliminar'),
  logActivity('eliminar', 'material'),
  MaterialAcademicoController.eliminar
);

/**
 * PATCH /api/materiales/:id/publicar
 * Publicar o programar publicación de un material.
 * Body: { fecha_publicacion?: ISO string, fecha_despublicacion?: ISO string }
 * Si fecha_publicacion se omite, se usa la fecha/hora actual.
 */
router.patch(
  '/:id/publicar',
  authorize('material.publicar'),
  logActivity('publicar', 'material'),
  MaterialAcademicoController.publicar
);

// ==========================================================
// TEMAS VINCULADOS A UN MATERIAL
// ==========================================================

/**
 * POST /api/materiales/:id/temas
 * Vincular un tema al material.
 * Body: { tema_id, es_principal?: boolean, orden?: number }
 */
router.post(
  '/:id/temas',
  authorize('material.actualizar'),
  MaterialAcademicoController.vincularTema
);

/**
 * DELETE /api/materiales/:id/temas/:tema_id
 * Desvincular un tema del material.
 */
router.delete(
  '/:id/temas/:tema_id',
  authorize('material.actualizar'),
  MaterialAcademicoController.desvincularTema
);

// ==========================================================
// ACCESO (log de vistas y descargas)
// ==========================================================

/**
 * POST /api/materiales/:id/acceso
 * Registra que el usuario accedió al material.
 * El trigger en BD actualiza contadores y progreso automáticamente.
 * Body: { tipo_accion: 'visualizacion'|'descarga'|'compartido'|'impresion',
 *         matricula_id?: number, dispositivo?: string,
 *         duracion_segundos?: number, completado?: boolean }
 */
router.post(
  '/:id/acceso',
  authorize('material.leer'),
  AccesoMaterialController.registrar
);

// ==========================================================
// COMENTARIOS Y DUDAS
// ==========================================================

/**
 * GET /api/materiales/:id/comentarios
 * Lista comentarios del material con sus respuestas anidadas.
 * Query: ?solo_dudas=true (filtra solo preguntas académicas)
 */
router.get(
  '/:id/comentarios',
  authorize('comentario_material.leer'),
  ComentarioMaterialController.listar
);

/**
 * POST /api/materiales/:id/comentarios
 * Crear comentario o duda.
 * Body: { contenido, comentario_padre_id?: number, es_duda?: boolean }
 */
router.post(
  '/:id/comentarios',
  authorize('comentario_material.crear'),
  ComentarioMaterialController.crear
);

/**
 * PUT /api/materiales/:id/comentarios/:comentario_id
 * Editar comentario propio.
 * Body: { contenido }
 */
router.put(
  '/:id/comentarios/:comentario_id',
  authorize('comentario_material.actualizar'),
  ComentarioMaterialController.actualizar
);

/**
 * PATCH /api/materiales/:id/comentarios/:comentario_id/resolver
 * Marcar una duda como resuelta (docente o admin).
 */
router.patch(
  '/:id/comentarios/:comentario_id/resolver',
  authorize('comentario_material.moderar'),
  ComentarioMaterialController.marcarResuelto
);

/**
 * DELETE /api/materiales/:id/comentarios/:comentario_id
 * Eliminar comentario propio (soft delete).
 */
router.delete(
  '/:id/comentarios/:comentario_id',
  authorize('comentario_material.eliminar'),
  ComentarioMaterialController.eliminar
);

// ==========================================================
// FAVORITOS
// ==========================================================

/**
 * POST /api/materiales/:id/favorito
 * Toggle favorito: si ya existe lo quita, si no existe lo agrega.
 * Body: { matricula_id, notas_personales?: string }
 */
router.post(
  '/:id/favorito',
  authorize('material.leer'),
  FavoritoMaterialController.toggle
);

// ==========================================================
// PROGRESO
// ==========================================================

/**
 * PUT /api/materiales/progreso/:tema_id
 * Actualizar progreso manual de un estudiante en un tema.
 * Body: { matricula_id, estado?, porcentaje_avance?, tiempo_dedicado? }
 */
router.put(
  '/progreso/:tema_id',
  authorize('progreso.actualizar'),
  ProgresoEstudianteController.actualizar
);

export default router;