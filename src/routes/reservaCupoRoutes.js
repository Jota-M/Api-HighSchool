// routes/reservaCupoRoutes.js
import express from 'express';
import ReservaCupoController from '../controllers/reservaCupoController.js';
import { authenticate } from '../Middlewares/auth.js';

const router = express.Router();

// =============================================
// RUTAS PÚBLICAS (Sin autenticación)
// =============================================

/**
 * POST /api/reserva-cupo/validar-estudiante
 * Valida si el estudiante es regular por código y CI,
 * y devuelve el grado al que pasa y turnos disponibles.
 */
router.post('/validar-estudiante', ReservaCupoController.validarEstudiante);

/**
 * GET /api/reserva-cupo/disponibilidad-hermano
 * Consulta disponibilidad inmediata o puesto en lista de espera para hermano nuevo.
 */
router.get('/disponibilidad-hermano', ReservaCupoController.consultarDisponibilidadHermano);

/**
 * POST /api/reserva-cupo/confirmar
 * Registra la reserva de cupo con los datos de quien reserva (tutor/familiar).
 */
router.post('/confirmar', ReservaCupoController.confirmarReserva);

/**
 * GET /api/reserva-cupo/recibo/:codigo/pdf
 * Genera el recibo oficial en PDF (tamaño media hoja) para descarga o impresión.
 */
router.get('/recibo/:codigo/pdf', ReservaCupoController.generarReciboPDF);

/**
 * GET /api/reserva-cupo/consultar/:codigo
 * Consulta los datos completos de una reserva existente.
 */
router.get('/consultar/:codigo', ReservaCupoController.consultarPorCodigo);

/**
 * POST /api/reserva-cupo/solicitar-anulacion
 * Permite al tutor solicitar la anulación de una reserva confirmada.
 */
router.post('/solicitar-anulacion', ReservaCupoController.solicitarAnulacion);

// =============================================
// RUTAS ADMINISTRATIVAS (Requieren autenticación)
// =============================================

/**
 * GET /api/reserva-cupo/admin/listado
 * Listado paginado de reservas para Secretaría / Dirección.
 */
router.get('/admin/listado', authenticate, ReservaCupoController.listarAdmin);

/**
 * GET /api/reserva-cupo/admin/estadisticas
 * Resumen cuantitativo y reservas por grado para el dashboard.
 */
router.get('/admin/estadisticas', authenticate, ReservaCupoController.obtenerEstadisticas);

/**
 * GET /api/reserva-cupo/admin/exportar
 * Exportación oficial de reservas a Excel o PDF.
 */
router.get('/admin/exportar', authenticate, ReservaCupoController.exportarReservas);

/**
 * POST /api/reserva-cupo/admin/:id/anular
 * Anula una reserva definitivamente desde el panel administrativo.
 */
router.post('/admin/:id/anular', authenticate, ReservaCupoController.anularReservaAdmin);

/**
 * POST /api/reserva-cupo/admin/:id/reactivar
 * Restablece/reactiva una reserva desde el panel administrativo.
 */
router.post('/admin/:id/reactivar', authenticate, ReservaCupoController.reactivarReservaAdmin);

/**
 * GET /api/reserva-cupo/admin/hermanos
 * Listado paginado de hermanos registrados (confirmados y en lista de espera).
 */
router.get('/admin/hermanos', authenticate, ReservaCupoController.listarHermanosAdmin);

/**
 * GET /api/reserva-cupo/admin/hermanos/exportar
 * Exportación oficial del padrón de hermanos postulantes a Excel o PDF.
 */
router.get('/admin/hermanos/exportar', authenticate, ReservaCupoController.exportarHermanos);

/**
 * POST /api/reserva-cupo/admin/hermanos/:id/promover
 * Promueve a un hermano de lista de espera a cupo confirmado tras liberarse vacante.
 */
router.post('/admin/hermanos/:id/promover', authenticate, ReservaCupoController.promoverHermanoAdmin);

/**
 * POST /api/reserva-cupo/admin/hermanos/:id/anular
 * Anula la reserva de un hermano desde el panel administrativo (liberando cupo).
 */
router.post('/admin/hermanos/:id/anular', authenticate, ReservaCupoController.anularHermanoAdmin);

/**
 * POST /api/reserva-cupo/admin/hermanos/:id/reactivar
 * Restablece la reserva de un hermano desde el panel administrativo.
 */
router.post('/admin/hermanos/:id/reactivar', authenticate, ReservaCupoController.reactivarHermanoAdmin);

export default router;
