// routes/docenteRoutes.js
// ⚠️ Debe ir ANTES de cualquier ruta /:id para evitar que Express lo capture primero
import express from 'express';
import DocenteController from '../controllers/docentedController.js';
import { authenticate } from '../Middlewares/auth.js';
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

/**
 * GET /api/docentes/mis-estudiantes
 * Devuelve los estudiantes que pertenecen a los cursos/materias del docente
 */
router.get(
  '/mis-estudiantes',
  authenticate,
  DocenteController.misEstudiantes
);

/**
 * GET /api/docentes/mis-estudiantes/:id
 * Devuelve el detalle del estudiante y sus tutores para el docente
 */
router.get(
  '/mis-estudiantes/:id',
  authenticate,
  DocenteController.miEstudianteDetalle
);

export default router;