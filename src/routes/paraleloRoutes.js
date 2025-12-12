import express from 'express';
import { ParaleloController } from '../controllers/academicControllers.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// ✅ CRÍTICO: Las rutas ESPECÍFICAS deben ir ANTES que las DINÁMICAS
// La ruta '/todos' debe estar ANTES de '/:id'

// 1. Ruta específica '/todos' (debe ir PRIMERO)
router.get(
  '/todos',
  authorize('paralelo.leer'),
  ParaleloController.listarTodos
);

// 2. Ruta raíz '/' con query params
router.get(
  '/',
  authorize('paralelo.leer'),
  ParaleloController.listar
);

// 3. Ruta dinámica '/:id' (debe ir AL FINAL)
router.get(
  '/:id',
  authorize('paralelo.leer'),
  ParaleloController.obtenerPorId
);

// 4. Otras operaciones
router.post(
  '/',
  authorize('paralelo.crear'),
  logActivity('crear', 'paralelo'),
  ParaleloController.crear
);

router.put(
  '/:id',
  authorize('paralelo.actualizar'),
  logActivity('actualizar', 'paralelo'),
  ParaleloController.actualizar
);

router.delete(
  '/:id',
  authorize('paralelo.eliminar'),
  logActivity('eliminar', 'paralelo'),
  ParaleloController.eliminar
);

export default router;