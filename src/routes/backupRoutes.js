// routes/backupRoutes.js
import express         from 'express';
import BackupController from '../controllers/backupController.js';
import { authenticate, authorize, logActivity } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

/**
 * GET /backups
 * Lista todos los backups activos desde PostgreSQL
 */
router.get(
  '/',
  authorize('backup.leer'),
  BackupController.listar
);

/**
 * POST /backups/generar
 * Genera un nuevo backup: pg_dump → Cloudinary → INSERT en backup_registro
 * ⚠️ IMPORTANTE: debe ir ANTES de /:key para no ser capturado por esa ruta
 */
router.post(
  '/generar',
  authorize('backup.crear'),
  logActivity('crear', 'backup'),
  BackupController.generar
);

/**
 * GET /backups/:key
 * Detalle de un backup por su backup_key (ej: bkp_1715123456_abc12)
 */
router.get(
  '/:key',
  authorize('backup.leer'),
  BackupController.obtenerPorId
);

/**
 * GET /backups/:key/descargar
 * Redirige a la URL de Cloudinary para descargar el .sql
 */
router.get(
  '/:key/descargar',
  authorize('backup.leer'),
  BackupController.descargar
);

/**
 * POST /backups/:key/restaurar
 * Restaura la BD: descarga de Cloudinary → psql → actualiza backup_registro
 * ⚠️ DESTRUCTIVO — Body requerido: { confirmar: true }
 */
router.post(
  '/:key/restaurar',
  authorize('backup.restaurar'),
  logActivity('restaurar', 'backup'),
  BackupController.restaurar
);

/**
 * DELETE /backups/:key
 * Elimina de Cloudinary + soft delete en backup_registro
 */
router.delete(
  '/:key',
  authorize('backup.eliminar'),
  logActivity('eliminar', 'backup'),
  BackupController.eliminar
);

export default router;