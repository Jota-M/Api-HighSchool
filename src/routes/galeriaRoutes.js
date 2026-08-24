// routes/galeriaRoutes.js
import express from 'express';
import GaleriaController from '../controllers/galeriaController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ─── Middleware de validación de :id numérico ──────────────────────────────
const validarIdNumerico = (req, res, next) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'El id debe ser un número entero positivo' });
    }
    req.params.id = id;
    next();
};

// =============================================================================
// LECTURA PÚBLICA (cualquier rol logueado)
// =============================================================================

/**
 * GET /api/galeria/vigentes
 * Fotos activas y dentro de su rango de fechas — las que se ven HOY en
 * el carrusel del home (app y web). Debe ir ANTES de /:id.
 */
router.get('/vigentes', GaleriaController.vigentes);

// =============================================================================
// GESTIÓN (admin / secretaría)
// =============================================================================

/**
 * GET /api/galeria
 * Listado completo paginado (incluye inactivas y vencidas).
 * Query: ?activo=true&vigente=true&page=1&limit=20
 */
router.get(
    '/',
    authorize('galeria.leer'),
    GaleriaController.listar
);

/**
 * GET /api/galeria/:id
 */
router.get(
    '/:id',
    validarIdNumerico,
    authorize('galeria.leer'),
    GaleriaController.obtenerPorId
);

/**
 * POST /api/galeria
 * multipart/form-data — campo "foto" (imagen) + titulo, orden?,
 * fecha_inicio?, fecha_fin?
 */
router.post(
    '/',
    authorize('galeria.crear'),
    upload.single('foto'),
    handleMulterError,
    logActivity('crear', 'galeria'),
    GaleriaController.crear
);

/**
 * PUT /api/galeria/:id
 * multipart/form-data — campo "foto" opcional (solo si se reemplaza la
 * imagen), resto de campos opcionales también (update parcial).
 */
router.put(
    '/:id',
    validarIdNumerico,
    authorize('galeria.editar'),
    upload.single('foto'),
    handleMulterError,
    logActivity('editar', 'galeria'),
    GaleriaController.actualizar
);

/**
 * PATCH /api/galeria/:id/activo
 * Prender/apagar sin borrar (ni de la tabla ni de Cloudinary).
 */
router.patch(
    '/:id/activo',
    validarIdNumerico,
    authorize('galeria.editar'),
    logActivity('cambiar_estado', 'galeria'),
    GaleriaController.toggleActivo
);

/**
 * DELETE /api/galeria/:id
 * Borrado físico (fila + imagen en Cloudinary).
 */
router.delete(
    '/:id',
    validarIdNumerico,
    authorize('galeria.eliminar'),
    logActivity('eliminar', 'galeria'),
    GaleriaController.eliminar
);

export default router;