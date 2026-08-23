// models/Egreso.js
import { pool } from '../db/pool.js';

class Egreso {
    // Crear egreso
    static async create(data) {
        const {
            codigo_egreso, tipo_egreso_id, fecha_egreso, periodo_academico_id,
            docente_id,
            referencia_tipo, referencia_id, referencia_codigo,
            concepto, descripcion,
            monto,
            metodo_pago, numero_comprobante, comprobante_url,
            banco, numero_referencia,
            beneficiario,
            requiere_factura, factura_recibida, numero_factura, nit_proveedor,
            observaciones, registrado_por
        } = data;

        const montoValor = Number(monto || 0);
        const montoNeto = montoValor;

        const query = `
      INSERT INTO egreso (
        codigo_egreso, tipo_egreso_id, fecha_egreso, periodo_academico_id,
        docente_id,
        referencia_tipo, referencia_id, referencia_codigo,
        concepto, descripcion,
        monto, monto_neto,
        metodo_pago, numero_comprobante, comprobante_url,
        banco, numero_referencia,
        beneficiario,
        requiere_factura, factura_recibida, numero_factura, nit_proveedor,
        observaciones, registrado_por, estado, verificado
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
        'registrado', true
      )
      RETURNING *
    `;

        const result = await pool.query(query, [
            codigo_egreso, tipo_egreso_id, fecha_egreso || new Date(), periodo_academico_id,
            docente_id,
            referencia_tipo, referencia_id, referencia_codigo,
            concepto, descripcion,
            montoValor, montoNeto,
            metodo_pago, numero_comprobante, comprobante_url,
            banco, numero_referencia,
            beneficiario,
            requiere_factura || false, factura_recibida || false, numero_factura, nit_proveedor,
            observaciones, registrado_por
        ]);

        return result.rows[0];
    }

    // Generar código de egreso
    static async generateCodigo() {
        const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const query = `
      SELECT codigo_egreso 
      FROM egreso 
      WHERE codigo_egreso LIKE $1
      ORDER BY codigo_egreso DESC 
      LIMIT 1
    `;

        const prefix = `EGR-${fecha}-%`;
        const result = await pool.query(query, [prefix]);

        if (result.rows.length === 0) {
            return `EGR-${fecha}-000001`;
        }

        const lastCodigo = result.rows[0].codigo_egreso;
        const lastNum = parseInt(lastCodigo.split('-')[2]);
        const newNum = (lastNum + 1).toString().padStart(6, '0');

        return `EGR-${fecha}-${newNum}`;
    }

    // Listar egresos con filtros
    static async findAll(filters = {}) {
        const {
            page = 1, limit = 10, search, tipo_egreso_id, periodo_academico_id,
            docente_id, fecha_desde, fecha_hasta, metodo_pago, estado,
            referencia_tipo
        } = filters;
        const offset = (page - 1) * limit;

        let whereConditions = ['1=1'];
        let queryParams = [];
        let paramCounter = 1;

        if (search) {
            whereConditions.push(`(
        e.codigo_egreso ILIKE $${paramCounter} OR 
        e.concepto ILIKE $${paramCounter} OR
        e.beneficiario ILIKE $${paramCounter} OR
        e.numero_comprobante ILIKE $${paramCounter} OR
        d.nombres ILIKE $${paramCounter} OR
        d.apellido_paterno ILIKE $${paramCounter}
      )`);
            queryParams.push(`%${search}%`);
            paramCounter++;
        }

        if (tipo_egreso_id) {
            whereConditions.push(`e.tipo_egreso_id = $${paramCounter}`);
            queryParams.push(tipo_egreso_id);
            paramCounter++;
        }

        if (periodo_academico_id) {
            whereConditions.push(`e.periodo_academico_id = $${paramCounter}`);
            queryParams.push(periodo_academico_id);
            paramCounter++;
        }

        if (docente_id) {
            whereConditions.push(`e.docente_id = $${paramCounter}`);
            queryParams.push(docente_id);
            paramCounter++;
        }

        if (fecha_desde) {
            whereConditions.push(`DATE(e.fecha_egreso) >= $${paramCounter}`);
            queryParams.push(fecha_desde);
            paramCounter++;
        }

        if (fecha_hasta) {
            whereConditions.push(`DATE(e.fecha_egreso) <= $${paramCounter}`);
            queryParams.push(fecha_hasta);
            paramCounter++;
        }

        if (metodo_pago) {
            whereConditions.push(`e.metodo_pago = $${paramCounter}`);
            queryParams.push(metodo_pago);
            paramCounter++;
        }

        if (estado) {
            whereConditions.push(`e.estado = $${paramCounter}`);
            queryParams.push(estado);
            paramCounter++;
        }

        if (referencia_tipo) {
            whereConditions.push(`e.referencia_tipo = $${paramCounter}`);
            queryParams.push(referencia_tipo);
            paramCounter++;
        }

        const whereClause = whereConditions.join(' AND ');

        // Contar total
        const countQuery = `
      SELECT COUNT(*)
      FROM egreso e
      LEFT JOIN docente d ON e.docente_id = d.id
      WHERE ${whereClause}
    `;
        const countResult = await pool.query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].count);

        // Obtener datos
        const dataQuery = `
      SELECT e.*,
        te.nombre as tipo_egreso_nombre,
        te.codigo as tipo_egreso_codigo,
        te.categoria as tipo_egreso_categoria,
        te.color as tipo_egreso_color,
        d.codigo as docente_codigo,
        d.nombres as docente_nombres,
        d.apellido_paterno as docente_apellido_paterno,
        d.apellido_materno as docente_apellido_materno,
        pa.nombre as periodo_nombre,
        pa.codigo as periodo_codigo,
        u.username as registrado_por_username
      FROM egreso e
      INNER JOIN tipo_egreso te ON e.tipo_egreso_id = te.id
      LEFT JOIN docente d ON e.docente_id = d.id
      LEFT JOIN periodo_academico pa ON e.periodo_academico_id = pa.id
      LEFT JOIN usuarios u ON e.registrado_por = u.id
      WHERE ${whereClause}
      ORDER BY e.fecha_egreso DESC, e.id DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

        const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

        return {
            egresos: result.rows,
            paginacion: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    // Buscar por ID
    static async findById(id) {
        const query = `
      SELECT e.*,
        te.nombre as tipo_egreso_nombre,
        te.codigo as tipo_egreso_codigo,
        te.categoria as tipo_egreso_categoria,
        d.codigo as docente_codigo,
        d.nombres as docente_nombres,
        d.apellido_paterno as docente_apellido_paterno,
        d.apellido_materno as docente_apellido_materno,
        pa.nombre as periodo_nombre,
        u.username as registrado_por_username,
        u_verif.username as verificado_por_username,
        u_anul.username as anulado_por_username
      FROM egreso e
      INNER JOIN tipo_egreso te ON e.tipo_egreso_id = te.id
      LEFT JOIN docente d ON e.docente_id = d.id
      LEFT JOIN periodo_academico pa ON e.periodo_academico_id = pa.id
      LEFT JOIN usuarios u ON e.registrado_por = u.id
      LEFT JOIN usuarios u_verif ON e.verificado_por = u_verif.id
      LEFT JOIN usuarios u_anul ON e.anulado_por = u_anul.id
      WHERE e.id = $1
    `;

        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    // Buscar por código
    static async findByCodigo(codigo_egreso) {
        const query = `
      SELECT e.*,
        te.nombre as tipo_egreso_nombre,
        d.codigo as docente_codigo,
        d.nombres as docente_nombres,
        d.apellido_paterno as docente_apellido_paterno
      FROM egreso e
      INNER JOIN tipo_egreso te ON e.tipo_egreso_id = te.id
      LEFT JOIN docente d ON e.docente_id = d.id
      WHERE e.codigo_egreso = $1
    `;

        const result = await pool.query(query, [codigo_egreso]);
        return result.rows[0];
    }

    // Verificar egreso
    static async verificar(id, usuario_id) {
        const query = `
      UPDATE egreso
      SET verificado = true,
          verificado_por = $1,
          fecha_verificacion = CURRENT_TIMESTAMP,
          estado = 'verificado',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

        const result = await pool.query(query, [usuario_id, id]);
        return result.rows[0];
    }

    // Anular egreso
    static async anular(id, motivo, usuario_id) {
        const query = `
      UPDATE egreso
      SET anulado = true,
          motivo_anulacion = $1,
          anulado_por = $2,
          fecha_anulacion = CURRENT_TIMESTAMP,
          estado = 'anulado',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

        const result = await pool.query(query, [motivo, usuario_id, id]);
        return result.rows[0];
    }

    // Obtener resumen por categoría
    static async getResumenPorCategoria(filters = {}) {
        const { periodo_academico_id, fecha_desde, fecha_hasta } = filters;

        let whereConditions = ["e.estado != 'anulado'"];
        let queryParams = [];
        let paramCounter = 1;

        if (periodo_academico_id) {
            whereConditions.push(`e.periodo_academico_id = $${paramCounter}`);
            queryParams.push(periodo_academico_id);
            paramCounter++;
        }

        if (fecha_desde) {
            whereConditions.push(`DATE(e.fecha_egreso) >= $${paramCounter}`);
            queryParams.push(fecha_desde);
            paramCounter++;
        }

        if (fecha_hasta) {
            whereConditions.push(`DATE(e.fecha_egreso) <= $${paramCounter}`);
            queryParams.push(fecha_hasta);
            paramCounter++;
        }

        const whereClause = whereConditions.join(' AND ');

        const query = `
      SELECT 
        te.categoria,
        te.nombre as tipo_egreso,
        te.color,
        COUNT(e.id) as cantidad_transacciones,
        SUM(e.monto_neto) as monto_neto,
        ROUND(AVG(e.monto_neto), 2) as promedio_egreso
      FROM egreso e
      INNER JOIN tipo_egreso te ON e.tipo_egreso_id = te.id
      WHERE ${whereClause}
      GROUP BY te.categoria, te.nombre, te.color, te.orden
      ORDER BY te.orden, monto_neto DESC
    `;

        const result = await pool.query(query, queryParams);
        return result.rows;
    }

    // Obtener resumen por método de pago
    static async getResumenPorMetodoPago(filters = {}) {
        const { periodo_academico_id, fecha_desde, fecha_hasta } = filters;

        let whereConditions = ["e.estado != 'anulado'"];
        let queryParams = [];
        let paramCounter = 1;

        if (periodo_academico_id) {
            whereConditions.push(`e.periodo_academico_id = $${paramCounter}`);
            queryParams.push(periodo_academico_id);
            paramCounter++;
        }

        if (fecha_desde) {
            whereConditions.push(`DATE(e.fecha_egreso) >= $${paramCounter}`);
            queryParams.push(fecha_desde);
            paramCounter++;
        }

        if (fecha_hasta) {
            whereConditions.push(`DATE(e.fecha_egreso) <= $${paramCounter}`);
            queryParams.push(fecha_hasta);
            paramCounter++;
        }

        const whereClause = whereConditions.join(' AND ');

        const query = `
      SELECT 
        e.metodo_pago,
        COUNT(e.id) as cantidad_transacciones,
        SUM(e.monto_neto) as total_monto
      FROM egreso e
      WHERE ${whereClause}
      GROUP BY e.metodo_pago
      ORDER BY total_monto DESC
    `;

        const result = await pool.query(query, queryParams);
        return result.rows;
    }

    // Obtener egresos diarios
    static async getEgresosDiarios(filters = {}) {
        const { fecha_desde, fecha_hasta, periodo_academico_id } = filters;

        let whereConditions = ["e.estado != 'anulado'"];
        let queryParams = [];
        let paramCounter = 1;

        if (periodo_academico_id) {
            whereConditions.push(`e.periodo_academico_id = $${paramCounter}`);
            queryParams.push(periodo_academico_id);
            paramCounter++;
        }

        if (fecha_desde) {
            whereConditions.push(`DATE(e.fecha_egreso) >= $${paramCounter}`);
            queryParams.push(fecha_desde);
            paramCounter++;
        }

        if (fecha_hasta) {
            whereConditions.push(`DATE(e.fecha_egreso) <= $${paramCounter}`);
            queryParams.push(fecha_hasta);
            paramCounter++;
        }

        const whereClause = whereConditions.join(' AND ');

        const query = `
      SELECT 
        DATE(e.fecha_egreso) as fecha,
        COUNT(e.id) as cantidad_transacciones,
        SUM(e.monto_neto) as total_monto,
        SUM(CASE WHEN e.metodo_pago = 'efectivo' THEN e.monto_neto ELSE 0 END) as efectivo,
        SUM(CASE WHEN e.metodo_pago = 'transferencia' THEN e.monto_neto ELSE 0 END) as transferencia,
        SUM(CASE WHEN e.metodo_pago = 'qr' THEN e.monto_neto ELSE 0 END) as qr,
        SUM(CASE WHEN e.metodo_pago = 'tarjeta' THEN e.monto_neto ELSE 0 END) as tarjeta
      FROM egreso e
      WHERE ${whereClause}
      GROUP BY DATE(e.fecha_egreso)
      ORDER BY fecha DESC
    `;

        const result = await pool.query(query, queryParams);
        return result.rows;
    }

    // Obtener estadísticas generales
    static async getEstadisticas(filters = {}) {
        const { periodo_academico_id, fecha_desde, fecha_hasta } = filters;

        let whereConditions = ["e.estado != 'anulado'"];
        let queryParams = [];
        let paramCounter = 1;

        if (periodo_academico_id) {
            whereConditions.push(`e.periodo_academico_id = $${paramCounter}`);
            queryParams.push(periodo_academico_id);
            paramCounter++;
        }

        if (fecha_desde) {
            whereConditions.push(`DATE(e.fecha_egreso) >= $${paramCounter}`);
            queryParams.push(fecha_desde);
            paramCounter++;
        }

        if (fecha_hasta) {
            whereConditions.push(`DATE(e.fecha_egreso) <= $${paramCounter}`);
            queryParams.push(fecha_hasta);
            paramCounter++;
        }

        const whereClause = whereConditions.join(' AND ');

        const query = `
      SELECT 
        COUNT(*) as total_egresos,
        SUM(e.monto_neto) as monto_total,
        ROUND(AVG(e.monto_neto), 2) as promedio_egreso,
        MAX(e.monto_neto) as egreso_maximo,
        MIN(e.monto_neto) as egreso_minimo,
        COUNT(DISTINCT e.docente_id) as docentes_pagados,
        COUNT(DISTINCT DATE(e.fecha_egreso)) as dias_con_egresos
      FROM egreso e
      WHERE ${whereClause}
    `;

        const result = await pool.query(query, queryParams);
        return result.rows[0];
    }
}

// =============================================
// TIPO EGRESO
// =============================================
class TipoEgreso {
    // Crear tipo de egreso
    static async create(data) {
        const {
            codigo, nombre, descripcion, categoria,
            requiere_docente, activo, color, orden
        } = data;

        const query = `
      INSERT INTO tipo_egreso (
        codigo, nombre, descripcion, categoria,
        requiere_docente, activo, color, orden
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

        const result = await pool.query(query, [
            codigo, nombre, descripcion, categoria,
            requiere_docente || false, activo ?? true, color, orden
        ]);

        return result.rows[0];
    }

    // Listar tipos de egreso
    static async findAll(filters = {}) {
        const { activo, categoria } = filters;

        let whereConditions = ['1=1'];
        let queryParams = [];
        let paramCounter = 1;

        if (activo !== undefined) {
            whereConditions.push(`activo = $${paramCounter}`);
            queryParams.push(activo);
            paramCounter++;
        }

        if (categoria) {
            whereConditions.push(`categoria = $${paramCounter}`);
            queryParams.push(categoria);
            paramCounter++;
        }

        const whereClause = whereConditions.join(' AND ');

        const query = `
      SELECT * FROM tipo_egreso
      WHERE ${whereClause}
      ORDER BY orden, nombre
    `;

        const result = await pool.query(query, queryParams);
        return result.rows;
    }

    // Buscar por ID
    static async findById(id) {
        const query = 'SELECT * FROM tipo_egreso WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    // Buscar por código
    static async findByCodigo(codigo) {
        const query = 'SELECT * FROM tipo_egreso WHERE codigo = $1';
        const result = await pool.query(query, [codigo]);
        return result.rows[0];
    }

    // Actualizar tipo de egreso
    static async update(id, data) {
        const fields = [];
        const values = [];
        let paramCounter = 1;

        const updateableFields = {
            nombre: data.nombre,
            descripcion: data.descripcion,
            categoria: data.categoria,
            requiere_docente: data.requiere_docente,
            activo: data.activo,
            color: data.color,
            orden: data.orden
        };

        for (const [field, value] of Object.entries(updateableFields)) {
            if (value !== undefined) {
                fields.push(`${field} = $${paramCounter}`);
                values.push(value);
                paramCounter++;
            }
        }

        if (fields.length === 0) {
            return await this.findById(id);
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const query = `
      UPDATE tipo_egreso
      SET ${fields.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING *
    `;

        const result = await pool.query(query, values);
        return result.rows[0];
    }
}

export { Egreso, TipoEgreso };