// routes/financieroRoutes.js
import express from 'express';
import ReportesFinancierosController from '../controllers/reportesFinancierosController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/financiero/exportar/balance
 * Exportar balance general (ingresos vs. egresos) a PDF o Excel
 * Query: fecha_desde, fecha_hasta, formato=pdf|excel
 */
router.get(
    '/exportar/balance',
    authorize('egresos.leer'),
    ReportesFinancierosController.exportarBalance
);

export default router;