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

export default router;
