// routes/solicitudFacturaRoutes.js
import express from 'express';
import SolicitudFacturaController from '../controllers/solicitudFacturaController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ── Badge: cantidad de pendientes (va ANTES de /:id para no colisionar) ──────
// GET /api/solicitudes-factura/pendientes/count
router.get(
    '/pendientes/count',
    authorize('solicitud_factura.leer'),
    SolicitudFacturaController.countPendientes
);

// ── Listar todas (admin) ──────────────────────────────────────────────────────
// GET /api/solicitudes-factura?estado=pendiente&page=1&limit=20
router.get(
    '/',
    authorize('solicitud_factura.leer'),
    SolicitudFacturaController.listarAdmin
);

// ── Subir factura (admin) ─────────────────────────────────────────────────────
// POST /api/solicitudes-factura/:id/subir-factura
// multipart/form-data → campo: "factura"
router.post(
    '/:id/subir-factura',
    authorize('solicitud_factura.gestionar'),
    upload.single('factura'),
    handleMulterError,
    SolicitudFacturaController.subirFactura
);

export default router;