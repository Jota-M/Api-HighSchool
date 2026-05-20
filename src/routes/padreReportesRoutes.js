// routes/padreReportesRoutes.js
import express                  from 'express';
import PadreReportesController  from '../controllers/padreReportesController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/padre/mis-hijos
 * Hijos matriculados del padre autenticado en el período activo
 */
router.get('/mis-hijos',          authorize('notas.leer'), PadreReportesController.misHijos);

/**
 * GET /api/padre/materias/:matricula_id
 * Materias de un hijo específico (valida acceso del padre)
 */
router.get('/materias/:matricula_id', authorize('notas.leer'), PadreReportesController.materiasHijo);

export default router;