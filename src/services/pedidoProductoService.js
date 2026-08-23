// services/pedidoProductoService.js
// Lógica de negocio para pedidos de productos: reserva de stock con locks
// (SELECT ... FOR UPDATE) para que dos padres no reserven la última talla
// al mismo tiempo, y liberación de stock cuando el pedido vence sin pagarse.

import { pool } from '../db/pool.js';
import { Producto, ProductoVariante, PedidoProducto } from '../models/Producto.js';

const HORAS_LIMITE_PAGO_DEFAULT = 48;

class PedidoProductoError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

/**
 * items: [{ producto_variante_id, cantidad }]
 */
async function crearPedidoConReservaStock({ matricula_id, padre_familia_id, periodo_academico_id, items, horas_limite_pago }) {
    if (!items || items.length === 0) {
        throw new PedidoProductoError('El pedido necesita al menos un ítem');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let monto_total = 0;
        const detallesValidados = [];
        // Ordenamos por id para lockear siempre en el mismo orden y evitar deadlocks
        const itemsOrdenados = [...items].sort((a, b) => a.producto_variante_id - b.producto_variante_id);

        for (const item of itemsOrdenados) {
            const variante = await ProductoVariante.findById(item.producto_variante_id, client, { forUpdate: true });
            if (!variante || !variante.activo) {
                throw new PedidoProductoError(`Variante ${item.producto_variante_id} no existe o no está activa`, 404);
            }
            if (variante.stock_disponible < item.cantidad) {
                throw new PedidoProductoError(
                    `Stock insuficiente (disponible: ${variante.stock_disponible}, pedido: ${item.cantidad})`,
                    409
                );
            }

            let precio_unitario = variante.precio;
            if (precio_unitario === null || precio_unitario === undefined) {
                const producto = await Producto.findById(variante.producto_id);
                precio_unitario = parseFloat(producto.precio_base);
            }

            monto_total += precio_unitario * item.cantidad;
            detallesValidados.push({ ...item, precio_unitario });
        }

        const fecha_limite_pago = new Date();
        fecha_limite_pago.setHours(fecha_limite_pago.getHours() + (horas_limite_pago ?? HORAS_LIMITE_PAGO_DEFAULT));

        const pedido = await PedidoProducto.create(
            { matricula_id, padre_familia_id, periodo_academico_id, monto_total, fecha_limite_pago },
            client
        );

        for (const detalle of detallesValidados) {
            await PedidoProducto.agregarDetalle(
                {
                    pedido_producto_id: pedido.id,
                    producto_variante_id: detalle.producto_variante_id,
                    cantidad: detalle.cantidad,
                    precio_unitario: detalle.precio_unitario,
                },
                client
            );
            await ProductoVariante.ajustarStock(detalle.producto_variante_id, { deltaReservado: detalle.cantidad }, client);
        }

        await client.query('COMMIT');
        return PedidoProducto.findByIdConDetalle(pedido.id);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// Convierte la reserva en venta confirmada: descuenta stock_total real
async function confirmarVentaYDescontarStock(pedido_producto_id, client) {
    const { rows } = await client.query(
        'SELECT producto_variante_id, cantidad FROM pedido_producto_detalle WHERE pedido_producto_id = $1',
        [pedido_producto_id]
    );
    for (const row of rows) {
        await ProductoVariante.ajustarStock(
            row.producto_variante_id,
            { deltaTotal: -row.cantidad, deltaReservado: -row.cantidad },
            client
        );
    }
}

/**
 * Job para correr por cron: libera la reserva de stock de pedidos que
 * vencieron sin pagarse, y los marca 'expirado'.
 */
async function liberarPedidosVencidos() {
    const pedidosVencidos = await PedidoProducto.findVencidos();
    let liberados = 0;

    for (const pedido of pedidosVencidos) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const pedidoActual = await PedidoProducto.findById(pedido.id, client, { forUpdate: true });
            if (pedidoActual.estado !== 'pendiente_pago') {
                await client.query('ROLLBACK');
                continue;
            }

            const { rows } = await client.query(
                'SELECT producto_variante_id, cantidad FROM pedido_producto_detalle WHERE pedido_producto_id = $1',
                [pedido.id]
            );
            for (const row of rows) {
                await ProductoVariante.ajustarStock(row.producto_variante_id, { deltaReservado: -row.cantidad }, client);
            }

            await PedidoProducto.updateEstado(pedido.id, 'expirado', client);
            await client.query('COMMIT');
            liberados += 1;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`Error liberando pedido ${pedido.id}:`, error);
        } finally {
            client.release();
        }
    }

    return { liberados };
}

export { PedidoProductoError, crearPedidoConReservaStock, confirmarVentaYDescontarStock, liberarPedidosVencidos };