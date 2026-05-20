// routes/docenteRoutes.js
// ⚠️ Debe ir ANTES de cualquier ruta /:id para evitar que Express lo capture primero
import express from 'express';
import DocenteController from '../controllers/docentedController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';
const router = express.Router();

/**
 * GET /api/docentes/mi-perfil
 * Devuelve el docente vinculado al usuario autenticado
 */
router.get(
  '/mi-perfil',
  authenticate,
  DocenteController.miPerfil
);
export default router;