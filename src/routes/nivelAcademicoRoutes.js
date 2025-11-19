import express from 'express';
import { NivelAcademicoController } from '../controllers/academicControllers.js';
import { authenticate, authorize, logActivity } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  authorize('nivel_academico.leer'),
  NivelAcademicoController.listar
);

router.get(
  '/:id',
  authorize('nivel_academico.leer'),
  NivelAcademicoController.obtenerPorId
);

router.post(
  '/',
  authorize('nivel_academico.crear'),
  logActivity('crear', 'nivel_academico'),
  NivelAcademicoController.crear
);

router.put(
  '/:id',
  authorize('nivel_academico.actualizar'),
  logActivity('actualizar', 'nivel_academico'),
  NivelAcademicoController.actualizar
);

router.delete(
  '/:id',
  authorize('nivel_academico.eliminar'),
  logActivity('eliminar', 'nivel_academico'),
  NivelAcademicoController.eliminar
);

export default router;
