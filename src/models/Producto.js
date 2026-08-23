import { pool } from '../db/pool.js';

// =============================================
// MODELO: Producto (catálogo)
// =============================================
class Producto {
    static async create(data, client = pool) {
        const { codigo, categoria, nombre, descripcion, tiene_variantes, precio_base, nivel_academico_id, foto_url } = data;

        const query = `
      INSERT INTO producto (codigo, categoria, nombre, descripcion, tiene_variantes, precio_base, nivel_academico_id, foto_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
        const result = await client.query(query, [
            codigo,
            categoria,
            nombre,
            descripcion,
            tiene_variantes ?? true,
            precio_base,
            nivel_academico_id || null,
            foto_url || null,
        ]);
        return result.rows[0];
    }

    static async findAll(filters = {}, { includeVariantes = true } = {}) {
        const { categoria, nivel_academico_id, activo = true } = filters;
        const conditions = ['p.deleted_at IS NULL'];
        const params = [];

        if (activo !== undefined) {
            params.push(activo);
            conditions.push(`p.activo = $${params.length}`);
        }

        if (categoria) {
            params.push(categoria);
            conditions.push(`p.categoria = $${params.length}`);
        }

        if (nivel_academico_id) {
            params.push(nivel_academico_id);
            conditions.push(
                `(p.nivel_academico_id = $${params.length} OR p.nivel_academico_id IS NULL)`
            );
        }
        const query = `
      SELECT p.*,
        n.nombre AS nivel_nombre
      FROM producto p
      LEFT JOIN nivel_academico n ON p.nivel_academico_id = n.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.categoria, p.nombre
    `;
        const result = await pool.query(query, params);
        const productos = result.rows;

        if (includeVariantes && productos.length > 0) {
            const productoIds = productos.map((p) => p.id);
            const variantesResult = await pool.query(
                `SELECT * FROM producto_variante
         WHERE producto_id = ANY($1) AND activo = true
         ORDER BY talla, color`,
                [productoIds]
            );

            const variantesMap = {};
            for (const row of variantesResult.rows) {
                const variante = ProductoVariante.conStockDisponible(row);
                if (!variantesMap[variante.producto_id]) {
                    variantesMap[variante.producto_id] = [];
                }
                variantesMap[variante.producto_id].push(variante);
            }

            for (const p of productos) {
                p.variantes = variantesMap[p.id] || [];
                // Si el producto no tiene variantes (tiene_variantes = false) y no tenía ninguna en DB,
                // creamos/asociamos su variante por defecto
                if (!p.tiene_variantes && p.variantes.length === 0) {
                    const defVar = await ProductoVariante.findDefaultByProducto(p.id);
                    p.variantes = [defVar];
                }
            }
        }

        return productos;
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT * FROM producto WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );
        return result.rows[0];
    }

    static async findByIdConVariantes(id) {
        const producto = await this.findById(id);
        if (!producto) return null;

        let variantes = await ProductoVariante.findByProducto(id);
        if (!producto.tiene_variantes && variantes.length === 0) {
            const defVar = await ProductoVariante.findDefaultByProducto(id);
            variantes = [defVar];
        }
        return { ...producto, variantes };
    }

    static async update(id, data) {
        const campos = ['nombre', 'descripcion', 'categoria', 'precio_base', 'nivel_academico_id', 'foto_url', 'activo'];
        const sets = [];
        const params = [];

        for (const campo of campos) {
            if (data[campo] !== undefined) {
                params.push(data[campo]);
                sets.push(`${campo} = $${params.length}`);
            }
        }
        if (sets.length === 0) return this.findById(id);

        params.push(id);
        const query = `
      UPDATE producto SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length}
      RETURNING *
    `;
        const result = await pool.query(query, params);
        return result.rows[0];
    }

    static async delete(id) {
        const result = await pool.query(
            `UPDATE producto SET deleted_at = CURRENT_TIMESTAMP, activo = false WHERE id = $1 RETURNING id`,
            [id]
        );
        return result.rows.length > 0;
    }
}

// =============================================
// MODELO: ProductoVariante
// =============================================
class ProductoVariante {
    static async create(data, client = pool) {
        const { producto_id, talla, color, sku, precio, stock_total } = data;
        const query = `
      INSERT INTO producto_variante (producto_id, talla, color, sku, precio, stock_total)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
        const result = await client.query(query, [
            producto_id,
            talla || null,
            color || null,
            sku || null,
            precio || null,
            stock_total ?? 0,
        ]);
        return this.conStockDisponible(result.rows[0]);
    }

    // Variante "invisible" para productos con tiene_variantes = false.
    // No tiene talla/color/sku — existe únicamente para que el producto
    // sea vendible (pedido_producto_detalle.producto_variante_id es NOT NULL)
    // y para que tenga un lugar donde guardar stock_total/stock_reservado.
    static async crearDefault(producto_id, stock_total = 0, client = pool) {
        const query = `
      INSERT INTO producto_variante (producto_id, talla, color, sku, precio, stock_total)
      VALUES ($1, NULL, NULL, NULL, NULL, $2)
      RETURNING *
    `;
        const result = await client.query(query, [producto_id, stock_total ?? 0]);
        return this.conStockDisponible(result.rows[0]);
    }

    // Busca la variante "por defecto" (sin talla/color) de un producto simple
    static async findDefaultByProducto(producto_id, client = pool) {
        const result = await client.query(
            `SELECT * FROM producto_variante
       WHERE producto_id = $1
         AND (talla IS NULL OR talla = '')
         AND (color IS NULL OR color = '')
         AND activo = true
       ORDER BY id
       LIMIT 1`,
            [producto_id]
        );
        if (result.rows.length === 0) {
            return await this.crearDefault(producto_id, 0, client);
        }
        return this.conStockDisponible(result.rows[0]);
    }

    static async findByProducto(producto_id) {
        const result = await pool.query(
            `SELECT * FROM producto_variante WHERE producto_id = $1 AND activo = true ORDER BY talla, color`,
            [producto_id]
        );
        return result.rows.map(this.conStockDisponible);
    }

    static async findById(id, client = pool, { forUpdate = false } = {}) {
        const lockClause = forUpdate ? 'FOR UPDATE' : '';
        const result = await client.query(`SELECT * FROM producto_variante WHERE id = $1 ${lockClause}`, [id]);
        return this.conStockDisponible(result.rows[0]);
    }

    static async ajustarStock(id, { deltaTotal = 0, deltaReservado = 0 }, client = pool) {
        const query = `
      UPDATE producto_variante
      SET stock_total = stock_total + $2,
          stock_reservado = stock_reservado + $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
        const result = await client.query(query, [id, deltaTotal, deltaReservado]);
        return this.conStockDisponible(result.rows[0]);
    }

    // Fija el stock_total en un valor absoluto (a diferencia de ajustarStock,
    // que suma/resta). Se usa cuando el admin edita el "Stock" de un
    // producto simple desde el formulario.
    static async setStockTotal(id, stock_total, client = pool) {
        const query = `
      UPDATE producto_variante
      SET stock_total = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
        const result = await client.query(query, [id, stock_total]);
        return this.conStockDisponible(result.rows[0]);
    }

    static conStockDisponible(row) {
        if (!row) return row;
        return { ...row, stock_disponible: row.stock_total - row.stock_reservado };
    }
}

// =============================================
// MODELO: PedidoProducto
// =============================================
class PedidoProducto {
    static generarCodigoPedido() {
        const ts = Date.now().toString(36).toUpperCase();
        const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `PED-${ts}-${rnd}`;
    }

    static async create(data, client = pool) {
        const { matricula_id, padre_familia_id, periodo_academico_id, monto_total, fecha_limite_pago, observaciones } = data;
        const codigo_pedido = this.generarCodigoPedido();

        const query = `
      INSERT INTO pedido_producto
        (codigo_pedido, matricula_id, padre_familia_id, periodo_academico_id, monto_total, fecha_limite_pago, observaciones)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
        const result = await client.query(query, [
            codigo_pedido,
            matricula_id || null,    // NULL = compra general sin estudiante
            padre_familia_id,
            periodo_academico_id || null,
            monto_total,
            fecha_limite_pago || null,
            observaciones || null,
        ]);
        return result.rows[0];
    }

    static async agregarDetalle(data, client = pool) {
        const { pedido_producto_id, producto_variante_id, cantidad, precio_unitario } = data;
        const subtotal = cantidad * precio_unitario;

        const query = `
      INSERT INTO pedido_producto_detalle (pedido_producto_id, producto_variante_id, cantidad, precio_unitario, subtotal)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
        const result = await client.query(query, [pedido_producto_id, producto_variante_id, cantidad, precio_unitario, subtotal]);
        return result.rows[0];
    }

    static async findById(id, client = pool, { forUpdate = false } = {}) {
        const lockClause = forUpdate ? 'FOR UPDATE' : '';
        const result = await client.query(
            `SELECT * FROM pedido_producto WHERE id = $1 AND deleted_at IS NULL ${lockClause}`,
            [id]
        );
        return result.rows[0];
    }

    static async findByIdConDetalle(id, client = pool) {
        const pedido = await this.findById(id, client);
        if (!pedido) return null;

        const detalleResult = await client.query(
            `SELECT ppd.*, p.nombre AS producto_nombre, p.categoria AS producto_categoria, pv.talla, pv.color
       FROM pedido_producto_detalle ppd
       JOIN producto_variante pv ON pv.id = ppd.producto_variante_id
       JOIN producto p ON p.id = pv.producto_id
       WHERE ppd.pedido_producto_id = $1
       ORDER BY ppd.id`,
            [id]
        );

        return { ...pedido, detalle: detalleResult.rows };
    }

    static async findByEstudiante(estudiante_id, filters = {}) {
        const { estado } = filters;
        const conditions = ['m.estudiante_id = $1', 'pp.deleted_at IS NULL'];
        const params = [estudiante_id];

        if (estado) {
            params.push(estado);
            conditions.push(`pp.estado = $${params.length}`);
        }

        const query = `
      SELECT pp.*, e.nombres, e.apellidos, e.codigo AS estudiante_codigo
      FROM pedido_producto pp
      JOIN matricula m ON m.id = pp.matricula_id
      JOIN estudiante e ON e.id = m.estudiante_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY pp.fecha_pedido DESC
    `;
        const result = await pool.query(query, params);
        return result.rows;
    }

    // Todos los pedidos del padre (con y sin estudiante asociado)
    static async findByPadre(padre_familia_id, filters = {}) {
        const { estado } = filters;
        const conditions = ['pp.padre_familia_id = $1', 'pp.deleted_at IS NULL'];
        const params = [padre_familia_id];

        if (estado) {
            params.push(estado);
            conditions.push(`pp.estado = $${params.length}`);
        }

        const query = `
      SELECT pp.*,
        e.nombres, e.apellidos, e.codigo AS estudiante_codigo,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', ppd.id,
              'cantidad', ppd.cantidad,
              'precio_unitario', ppd.precio_unitario,
              'subtotal', ppd.subtotal,
              'producto_nombre', p.nombre,
              'producto_categoria', p.categoria,
              'talla', pv.talla,
              'color', pv.color
            ))
            FROM pedido_producto_detalle ppd
            JOIN producto_variante pv ON pv.id = ppd.producto_variante_id
            JOIN producto p ON p.id = pv.producto_id
            WHERE ppd.pedido_producto_id = pp.id
          ),
          '[]'::json
        ) AS detalle
      FROM pedido_producto pp
      LEFT JOIN matricula m ON m.id = pp.matricula_id
      LEFT JOIN estudiante e ON e.id = m.estudiante_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY pp.fecha_pedido DESC
    `;
        const result = await pool.query(query, params);
        return result.rows;
    }

    static async updateEstado(id, estado, client = pool) {
        const result = await client.query(
            `UPDATE pedido_producto SET estado = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
            [id, estado]
        );
        return result.rows[0];
    }

    static async marcarEntregado(id, usuario_id, client = pool) {
        const result = await client.query(
            `UPDATE pedido_producto
       SET estado = 'entregado', entregado_en = CURRENT_TIMESTAMP, entregado_por = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND estado = 'pagado'
       RETURNING *`,
            [id, usuario_id]
        );
        return result.rows[0];
    }

    static async findVencidos(client = pool) {
        const result = await client.query(
            `SELECT * FROM pedido_producto
       WHERE estado = 'pendiente_pago' AND fecha_limite_pago IS NOT NULL
         AND fecha_limite_pago < CURRENT_TIMESTAMP AND deleted_at IS NULL`
        );
        return result.rows;
    }
}

// =============================================
// MODELO: PagoProducto
// =============================================
class PagoProducto {
    static async generarCodigoPago() {
        const year = new Date().getFullYear();
        const sequence = await pool.query("SELECT NEXTVAL('pago_producto_id_seq')");
        const numero = String(sequence.rows[0].nextval).padStart(6, '0');
        return `PAGP-${year}-${numero}`;
    }

    static async createDirecto(data, client = pool) {
        const { pedido_producto_id, monto_pagado, metodo_pago, numero_comprobante, comprobante_url, registrado_por, observaciones } = data;
        const codigo_pago = await this.generarCodigoPago();

        const query = `
      INSERT INTO pago_producto
        (codigo_pago, pedido_producto_id, monto_pagado, metodo_pago, numero_comprobante, comprobante_url, registrado_por, observaciones)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
        const result = await client.query(query, [
            codigo_pago,
            pedido_producto_id,
            monto_pagado,
            metodo_pago,
            numero_comprobante || null,
            comprobante_url || null,
            registrado_por,
            observaciones || null,
        ]);
        return result.rows[0];
    }

    static async createQrGenerado(data, client = pool) {
        const { pedido_producto_id, monto_pagado, qr_data, qr_image_url, qr_expiracion, transaccion_id, registrado_por } = data;
        const codigo_pago = await this.generarCodigoPago();

        const query = `
      INSERT INTO pago_producto
        (codigo_pago, pedido_producto_id, monto_pagado, metodo_pago, registrado_por,
         qr_data, qr_image_url, qr_expiracion, qr_estado, transaccion_id, anulado)
      VALUES ($1, $2, $3, 'qr', $4, $5, $6, $7, 'generado', $8, false)
      RETURNING *
    `;
        const result = await client.query(query, [
            codigo_pago,
            pedido_producto_id,
            monto_pagado,
            registrado_por,
            qr_data,
            qr_image_url,
            qr_expiracion,
            transaccion_id || null,
        ]);
        return result.rows[0];
    }

    static async findQrActivoPorPedido(pedido_producto_id, client = pool) {
        const result = await client.query(
            `SELECT * FROM pago_producto
       WHERE pedido_producto_id = $1
         AND qr_estado = 'generado'
         AND qr_expiracion > CURRENT_TIMESTAMP
         AND (anulado = false OR anulado IS NULL)
       ORDER BY created_at DESC
       LIMIT 1`,
            [pedido_producto_id]
        );
        return result.rows[0];
    }

    static async findById(id, client = pool) {
        const result = await client.query(`SELECT * FROM pago_producto WHERE id = $1`, [id]);
        return result.rows[0];
    }

    static async findByQrData(qr_data, client = pool, { forUpdate = false } = {}) {
        const lockClause = forUpdate ? 'FOR UPDATE' : '';
        const result = await client.query(`SELECT * FROM pago_producto WHERE qr_data = $1 ${lockClause}`, [qr_data]);
        return result.rows[0];
    }

    static async confirmarQr(id, datosCallback, client = pool) {
        const { transaccion_id, numero_referencia, banco_origen, observacionExtra } = datosCallback;
        const result = await client.query(
            `UPDATE pago_producto
       SET qr_estado = 'pagado',
           transaccion_id = $2,
           numero_referencia = $3,
           banco_origen = $4,
           observaciones = COALESCE(observaciones, '') || $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND qr_estado = 'generado'
       RETURNING *`,
            [id, transaccion_id || null, numero_referencia || null, banco_origen || null, observacionExtra || '']
        );
        return result.rows[0];
    }

    static async findByPedido(pedido_producto_id, client = pool) {
        const result = await client.query(
            `SELECT * FROM pago_producto WHERE pedido_producto_id = $1 AND anulado = false ORDER BY fecha_pago`,
            [pedido_producto_id]
        );
        return result.rows;
    }
}

export { Producto, ProductoVariante, PedidoProducto, PagoProducto };