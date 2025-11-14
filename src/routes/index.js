import express from 'express';

import authRoutes from './authRoutes.js';
import usuariosRoutes from './usuariosRoutes.js';
import rolesRoutes from './rolesRoutes.js';
import actividadRoutes from './actividadRoutes.js';
import sesionesRoutes from './sesionesRoutes.js';

const router = express.Router();

// Rutas públicas
router.use('/auth', authRoutes);

// Rutas protegidas
router.use('/usuarios', usuariosRoutes);
router.use('/roles', rolesRoutes);
router.use('/actividad', actividadRoutes);
router.use('/sesiones', sesionesRoutes);

// Ruta de salud
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

export default router;
