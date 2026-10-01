// routes/migracionMensualidadesRoutes.js
import express from 'express';
import { MigracionMensualidadesController } from '../controllers/migracionMensualidadesController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Matriz por curso (paralelo)
router.get(
  '/matriz-curso/:paralelo_id',
  authorize('pago_mensualidad.leer'),
  MigracionMensualidadesController.obtenerMatrizCurso
);

// Mensualidades observadas, sin documento o pendientes
router.get(
  '/observadas-pendientes',
  authorize('pago_mensualidad.leer'),
  MigracionMensualidadesController.obtenerObservadasYPendientes
);

// Ficha histórica individual por estudiante
router.get(
  '/estudiante/:estudiante_id',
  authorize('pago_mensualidad.leer'),
  MigracionMensualidadesController.obtenerEstudianteHistorial
);

// Registrar pago individual histórico
router.post(
  '/registrar-pago',
  authorize('pago_mensualidad.crear'),
  MigracionMensualidadesController.registrarPagoHistorico
);

// Registrar lote de pagos para un estudiante
router.post(
  '/registrar-lote',
  authorize('pago_mensualidad.crear'),
  MigracionMensualidadesController.registrarLoteEstudiante
);

// Actualizar datos de un pago histórico
router.put(
  '/pago/:pago_id',
  authorize('pago_mensualidad.actualizar'),
  MigracionMensualidadesController.actualizarPagoHistorico
);

// Eliminar un pago histórico
router.delete(
  '/pago/:pago_id',
  authorize('pago_mensualidad.eliminar'),
  MigracionMensualidadesController.eliminarPagoHistorico
);

// Configurar beca y exonerar cuotas
router.post(
  '/configurar-beca',
  authorize('pago_mensualidad.crear'),
  MigracionMensualidadesController.configurarBeca
);

// Importar JSON directo por estudiante
router.post(
  '/importar-json-estudiante',
  authorize('pago_mensualidad.crear'),
  MigracionMensualidadesController.importarJsonEstudiante
);

// Importar JSON de curso completo
router.post(
  '/importar-json-curso',
  authorize('pago_mensualidad.crear'),
  MigracionMensualidadesController.importarJsonCurso
);

// Generar cuotas pendientes faltantes para el curso
router.post(
  '/generar-pendientes-curso',
  authorize('mensualidad.generar'),
  MigracionMensualidadesController.generarCuotasPendientesCurso
);

export default router;
