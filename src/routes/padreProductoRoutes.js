// routes/padreProductoRoutes.js
// Rutas de compra de uniformes/deportivos para el padre de familia
// Todas requieren autenticación JWT (el padre debe estar logueado)

import express from 'express';
import PadreProductoController from '../controllers/padreProductoController.js';
import { authenticate } from '../Middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

// ══════════════════════════════════════════════════════════════════
// GET /padre-p/productos/mis-hijos
// Lista de hijos con resumen de pedidos (para la pantalla de selección)
// ══════════════════════════════════════════════════════════════════
router.get('/productos/mis-hijos', PadreProductoController.obtenerHijos);

// ══════════════════════════════════════════════════════════════════
// GET /padre-p/productos
// Catálogo disponible (uniformes/deportivos)
// ══════════════════════════════════════════════════════════════════
router.get('/productos', PadreProductoController.listarCatalogo);
router.get('/productos/:id', PadreProductoController.obtenerProducto);

// ══════════════════════════════════════════════════════════════════
// POST /padre-p/pedidos-producto — pedido libre (sin estudiante obligatorio)
// GET  /padre-p/pedidos-producto — mis pedidos generales
// ══════════════════════════════════════════════════════════════════
router.post('/pedidos-producto', PadreProductoController.crearPedidoLibre);
router.get('/pedidos-producto', PadreProductoController.obtenerMisPedidos);

// ══════════════════════════════════════════════════════════════════
// GET /padre-p/hijos/:estudiante_id/pedidos-producto
// POST /padre-p/hijos/:estudiante_id/pedidos-producto
// ══════════════════════════════════════════════════════════════════
router.get('/hijos/:estudiante_id/pedidos-producto', PadreProductoController.obtenerPedidosHijo);
router.post('/hijos/:estudiante_id/pedidos-producto', PadreProductoController.crearPedido);

// ══════════════════════════════════════════════════════════════════
// GET /padre-p/pedido-producto/:id
// POST /padre-p/pedido-producto/:id/generar-qr
// GET /padre-p/pedido-producto/:id/estado-qr
// ══════════════════════════════════════════════════════════════════
router.get('/pedido-producto/:id', PadreProductoController.obtenerPedido);
router.post('/pedido-producto/:id/generar-qr', PadreProductoController.generarQRPago);
router.get('/pedido-producto/:id/estado-qr', PadreProductoController.verificarEstadoQR);

export default router;