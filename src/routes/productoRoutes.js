// routes/productoRoutes.js
// Administración del catálogo de productos y de los pedidos/pagos

import express from 'express';
import ProductoController from '../controllers/productoController.js';
import PedidoProductoController from '../controllers/pedidoProductoController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';
import { upload, handleMulterError } from '../Middlewares/uploadMiddleware.js';

const router = express.Router();

router.use(authenticate);

// ── Catálogo ──
router.get('/productos', ProductoController.listar);
router.get('/productos/:id', ProductoController.obtenerPorId);
router.post('/productos', authorize('productos.crear'), upload.single('foto'), handleMulterError, ProductoController.crear);
router.put('/productos/:id', authorize('productos.editar'), upload.single('foto'), handleMulterError, ProductoController.actualizar);
router.delete('/productos/:id', authorize('productos.eliminar'), ProductoController.eliminar);
router.delete('/productos/:id/foto', authorize('productos.editar'), ProductoController.eliminarFoto);
router.post('/productos/:id/variantes', authorize('productos.crear'), ProductoController.agregarVariante);

// ── Pedidos y pagos ──
router.get('/pedido-producto/:id', PedidoProductoController.obtenerPorId);
router.get('/estudiante/:estudiante_id/pedidos-producto', PedidoProductoController.listarPorEstudiante);
router.post('/pedido-producto/:id/pago-directo', authorize('pagos.crear'), PedidoProductoController.registrarPagoDirecto);
router.patch('/pedido-producto/:id/entregar', authorize('productos.entregar'), PedidoProductoController.marcarEntregado);

export default router;