// routes/cupoPreinscripcionRoutes.js
import express from 'express';
import CupoPreinscripcionController from '../controllers/cupoPreinscripcionController.js';
import { authenticate } from '../Middlewares/auth.js';

const router = express.Router();

// ========================================
// RUTAS PÚBLICAS
// ========================================

// Verificar disponibilidad de cupos (para formulario público)
router.get('/disponibilidad', CupoPreinscripcionController.verificarDisponibilidad);

// ========================================
// RUTAS PROTEGIDAS (requieren autenticación)
// ========================================

// Listar cupos
router.get('/', authenticate, CupoPreinscripcionController.listar);

// Obtener resumen por período
router.get('/resumen/:periodo_id', authenticate, CupoPreinscripcionController.obtenerResumenPorPeriodo);

// Obtener cupo por ID
router.get('/:id', authenticate, CupoPreinscripcionController.obtenerPorId);

// Crear cupo
router.post('/', authenticate, CupoPreinscripcionController.crear);

// Actualizar cupo
router.put('/:id', authenticate, CupoPreinscripcionController.actualizar);

// Eliminar cupo
router.delete('/:id', authenticate, CupoPreinscripcionController.eliminar);

export default router;