// models/Ingreso.js
import { pool } from '../db/pool.js';

class Ingreso {
  // Crear ingreso (centralizar)
  static async create(data) {
  const {
    codigo_ingreso, tipo_ingreso_id, fecha_ingreso, periodo_academico_id,
    estudiante_id, padre_familia_id, matricula_id,
    referencia_tipo, referencia_id, referencia_codigo,
    monto, descuento, recargo,
    metodo_pago, numero_comprobante, comprobante_url,
    banco, numero_referencia,
    requiere_factura, numero_factura, nit_factura, razon_social_factura,
    observaciones, registrado_por
  } = data;

  const montoBruto = Number(monto || 0);
  const descuentoValor = Number(descuento || 0);
  const recargoValor = Number(recargo || 0);
  const montoNeto = montoBruto - descuentoValor + recargoValor;

  const query = `
    INSERT INTO ingreso (
      codigo_ingreso, tipo_ingreso_id, fecha_ingreso, periodo_academico_id,
      estudiante_id, padre_familia_id, matricula_id,
      referencia_tipo, referencia_id, referencia_codigo,
      monto, descuento, recargo, monto_neto,
      metodo_pago, numero_comprobante, comprobante_url,
      banco, numero_referencia,
      requiere_factura, numero_factura, nit_factura, razon_social_factura,
      observaciones, registrado_por, estado, verificado
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
      'registrado', true
    )
    RETURNING *
  `;

  const result = await pool.query(query, [
    codigo_ingreso, tipo_ingreso_id, fecha_ingreso || new Date(), periodo_academico_id,
    estudiante_id, padre_familia_id, matricula_id,
    referencia_tipo, referencia_id, referencia_codigo,
    montoBruto, descuentoValor, recargoValor, montoNeto,
    metodo_pago, numero_comprobante, comprobante_url,
    banco, numero_referencia,
    requiere_factura || false, numero_factura, nit_factura, razon_social_factura,
    observaciones, registrado_por
  ]);

  return result.rows[0];
}

  // Generar código de ingreso
  static async generateCodigo() {
    const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const query = `
      SELECT codigo_ingreso 
      FROM ingreso 
      WHERE codigo_ingreso LIKE $1
      ORDER BY codigo_ingreso DESC 
      LIMIT 1
    `;

    const prefix = `ING-${fecha}-%`;
    const result = await pool.query(query, [prefix]);

    if (result.rows.length === 0) {
      return `ING-${fecha}-000001`;
    }

    const lastCodigo = result.rows[0].codigo_ingreso;
    const lastNum = parseInt(lastCodigo.split('-')[2]);
    const newNum = (lastNum + 1).toString().padStart(6, '0');

    return `ING-${fecha}-${newNum}`;
  }

  // Centralizar pago de transporte
  static async centralizarPagoTransporte(pago_transporte_id) {
    const query = 'SELECT centralizar_pago_transporte($1)';
    const result = await pool.query(query, [pago_transporte_id]);
    return result.rows[0].centralizar_pago_transporte;
  }

  // Listar ingresos con filtros
  static async findAll(filters = {}) {
    const {
      page = 1, limit = 10, search, tipo_ingreso_id, periodo_academico_id,
      estudiante_id, fecha_desde, fecha_hasta, metodo_pago, estado,
      referencia_tipo
    } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(
        i.codigo_ingreso ILIKE $${paramCounter} OR 
        i.referencia_codigo ILIKE $${paramCounter} OR
        i.numero_comprobante ILIKE $${paramCounter} OR
        e.nombres ILIKE $${paramCounter} OR
        e.apellido_paterno ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (tipo_ingreso_id) {
      whereConditions.push(`i.tipo_ingreso_id = $${paramCounter}`);
      queryParams.push(tipo_ingreso_id);
      paramCounter++;
    }

    if (periodo_academico_id) {
      whereConditions.push(`i.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (estudiante_id) {
      whereConditions.push(`i.estudiante_id = $${paramCounter}`);
      queryParams.push(estudiante_id);
      paramCounter++;
    }

    if (fecha_desde) {
      whereConditions.push(`DATE(i.fecha_ingreso) >= $${paramCounter}`);
      queryParams.push(fecha_desde);
      paramCounter++;
    }

    if (fecha_hasta) {
      whereConditions.push(`DATE(i.fecha_ingreso) <= $${paramCounter}`);
      queryParams.push(fecha_hasta);
      paramCounter++;
    }

    if (metodo_pago) {
      whereConditions.push(`i.metodo_pago = $${paramCounter}`);
      queryParams.push(metodo_pago);
      paramCounter++;
    }

    if (estado) {
      whereConditions.push(`i.estado = $${paramCounter}`);
      queryParams.push(estado);
      paramCounter++;
    }

    if (referencia_tipo) {
      whereConditions.push(`i.referencia_tipo = $${paramCounter}`);
      queryParams.push(referencia_tipo);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Contar total
    const countQuery = `
      SELECT COUNT(*)
      FROM ingreso i
      LEFT JOIN estudiante e ON i.estudiante_id = e.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Obtener datos
    const dataQuery = `
      SELECT i.*,
        ti.nombre as tipo_ingreso_nombre,
        ti.codigo as tipo_ingreso_codigo,
        ti.categoria as tipo_ingreso_categoria,
        ti.color as tipo_ingreso_color,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        pa.nombre as periodo_nombre,
        pa.codigo as periodo_codigo,
        u.username as registrado_por_username
      FROM ingreso i
      INNER JOIN tipo_ingreso ti ON i.tipo_ingreso_id = ti.id
      LEFT JOIN estudiante e ON i.estudiante_id = e.id
      LEFT JOIN periodo_academico pa ON i.periodo_academico_id = pa.id
      LEFT JOIN usuarios u ON i.registrado_por = u.id
      WHERE ${whereClause}
      ORDER BY i.fecha_ingreso DESC, i.id DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      ingresos: result.rows,
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
      SELECT i.*,
        ti.nombre as tipo_ingreso_nombre,
        ti.codigo as tipo_ingreso_codigo,
        ti.categoria as tipo_ingreso_categoria,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        pa.nombre as periodo_nombre,
        u.username as registrado_por_username,
        u_verif.username as verificado_por_username,
        u_anul.username as anulado_por_username
      FROM ingreso i
      INNER JOIN tipo_ingreso ti ON i.tipo_ingreso_id = ti.id
      LEFT JOIN estudiante e ON i.estudiante_id = e.id
      LEFT JOIN periodo_academico pa ON i.periodo_academico_id = pa.id
      LEFT JOIN usuarios u ON i.registrado_por = u.id
      LEFT JOIN usuarios u_verif ON i.verificado_por = u_verif.id
      LEFT JOIN usuarios u_anul ON i.anulado_por = u_anul.id
      WHERE i.id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Buscar por código
  static async findByCodigo(codigo_ingreso) {
    const query = `
      SELECT i.*,
        ti.nombre as tipo_ingreso_nombre,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno
      FROM ingreso i
      INNER JOIN tipo_ingreso ti ON i.tipo_ingreso_id = ti.id
      LEFT JOIN estudiante e ON i.estudiante_id = e.id
      WHERE i.codigo_ingreso = $1
    `;

    const result = await pool.query(query, [codigo_ingreso]);
    return result.rows[0];
  }

  // Verificar ingreso
  static async verificar(id, usuario_id) {
    const query = `
      UPDATE ingreso
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

  // Anular ingreso
  static async anular(id, motivo, usuario_id) {
    const query = `
      UPDATE ingreso
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

    let whereConditions = ['i.estado != \'anulado\''];
    let queryParams = [];
    let paramCounter = 1;

    if (periodo_academico_id) {
      whereConditions.push(`i.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (fecha_desde) {
      whereConditions.push(`DATE(i.fecha_ingreso) >= $${paramCounter}`);
      queryParams.push(fecha_desde);
      paramCounter++;
    }

    if (fecha_hasta) {
      whereConditions.push(`DATE(i.fecha_ingreso) <= $${paramCounter}`);
      queryParams.push(fecha_hasta);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        ti.categoria,
        ti.nombre as tipo_ingreso,
        ti.color,
        COUNT(i.id) as cantidad_transacciones,
        SUM(i.monto) as monto_bruto,
        SUM(i.descuento) as total_descuentos,
        SUM(i.recargo) as total_recargos,
        SUM(i.monto_neto) as monto_neto,
        ROUND(AVG(i.monto_neto), 2) as promedio_ingreso
      FROM ingreso i
      INNER JOIN tipo_ingreso ti ON i.tipo_ingreso_id = ti.id
      WHERE ${whereClause}
      GROUP BY ti.categoria, ti.nombre, ti.color, ti.orden
      ORDER BY ti.orden, monto_neto DESC
    `;

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  // Obtener resumen por método de pago
  static async getResumenPorMetodoPago(filters = {}) {
    const { periodo_academico_id, fecha_desde, fecha_hasta } = filters;

    let whereConditions = ['i.estado != \'anulado\''];
    let queryParams = [];
    let paramCounter = 1;

    if (periodo_academico_id) {
      whereConditions.push(`i.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (fecha_desde) {
      whereConditions.push(`DATE(i.fecha_ingreso) >= $${paramCounter}`);
      queryParams.push(fecha_desde);
      paramCounter++;
    }

    if (fecha_hasta) {
      whereConditions.push(`DATE(i.fecha_ingreso) <= $${paramCounter}`);
      queryParams.push(fecha_hasta);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        i.metodo_pago,
        COUNT(i.id) as cantidad_transacciones,
        SUM(i.monto_neto) as total_monto
      FROM ingreso i
      WHERE ${whereClause}
      GROUP BY i.metodo_pago
      ORDER BY total_monto DESC
    `;

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  // Obtener ingresos diarios
  static async getIngresosDiarios(filters = {}) {
    const { fecha_desde, fecha_hasta, periodo_academico_id } = filters;

    let whereConditions = ['i.estado != \'anulado\''];
    let queryParams = [];
    let paramCounter = 1;

    if (periodo_academico_id) {
      whereConditions.push(`i.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (fecha_desde) {
      whereConditions.push(`DATE(i.fecha_ingreso) >= $${paramCounter}`);
      queryParams.push(fecha_desde);
      paramCounter++;
    }

    if (fecha_hasta) {
      whereConditions.push(`DATE(i.fecha_ingreso) <= $${paramCounter}`);
      queryParams.push(fecha_hasta);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        DATE(i.fecha_ingreso) as fecha,
        COUNT(i.id) as cantidad_transacciones,
        SUM(i.monto_neto) as total_monto,
        SUM(CASE WHEN i.metodo_pago = 'efectivo' THEN i.monto_neto ELSE 0 END) as efectivo,
        SUM(CASE WHEN i.metodo_pago = 'transferencia' THEN i.monto_neto ELSE 0 END) as transferencia,
        SUM(CASE WHEN i.metodo_pago = 'qr' THEN i.monto_neto ELSE 0 END) as qr,
        SUM(CASE WHEN i.metodo_pago = 'tarjeta' THEN i.monto_neto ELSE 0 END) as tarjeta
      FROM ingreso i
      WHERE ${whereClause}
      GROUP BY DATE(i.fecha_ingreso)
      ORDER BY fecha DESC
    `;

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  // Obtener estadísticas generales
  static async getEstadisticas(filters = {}) {
    const { periodo_academico_id, fecha_desde, fecha_hasta } = filters;

    let whereConditions = ['i.estado != \'anulado\''];
    let queryParams = [];
    let paramCounter = 1;

    if (periodo_academico_id) {
      whereConditions.push(`i.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (fecha_desde) {
      whereConditions.push(`DATE(i.fecha_ingreso) >= $${paramCounter}`);
      queryParams.push(fecha_desde);
      paramCounter++;
    }

    if (fecha_hasta) {
      whereConditions.push(`DATE(i.fecha_ingreso) <= $${paramCounter}`);
      queryParams.push(fecha_hasta);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        COUNT(*) as total_ingresos,
        SUM(i.monto_neto) as monto_total,
        ROUND(AVG(i.monto_neto), 2) as promedio_ingreso,
        MAX(i.monto_neto) as ingreso_maximo,
        MIN(i.monto_neto) as ingreso_minimo,
        COUNT(DISTINCT i.estudiante_id) as estudiantes_que_pagaron,
        COUNT(DISTINCT DATE(i.fecha_ingreso)) as dias_con_ingresos
      FROM ingreso i
      WHERE ${whereClause}
    `;

    const result = await pool.query(query, queryParams);
    return result.rows[0];
  }
}

// =============================================
// TIPO INGRESO
// =============================================
class TipoIngreso {
  // Crear tipo de ingreso
  static async create(data) {
    const {
      codigo, nombre, descripcion, categoria,
      requiere_estudiante, activo, color, orden
    } = data;

    const query = `
      INSERT INTO tipo_ingreso (
        codigo, nombre, descripcion, categoria,
        requiere_estudiante, activo, color, orden
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await pool.query(query, [
      codigo, nombre, descripcion, categoria,
      requiere_estudiante || false, activo ?? true, color, orden
    ]);

    return result.rows[0];
  }

  // Listar tipos de ingreso
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
      SELECT * FROM tipo_ingreso
      WHERE ${whereClause}
      ORDER BY orden, nombre
    `;

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  // Buscar por ID
  static async findById(id) {
    const query = 'SELECT * FROM tipo_ingreso WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Buscar por código
  static async findByCodigo(codigo) {
    const query = 'SELECT * FROM tipo_ingreso WHERE codigo = $1';
    const result = await pool.query(query, [codigo]);
    return result.rows[0];
  }

  // Actualizar tipo de ingreso
   static async update(id, data) {
    // Extraer y validar los campos
    const fields = [];
    const values = [];
    let paramCounter = 1;

    // Lista de campos actualizables con sus valores
    const updateableFields = {
      nombre: data.nombre,
      descripcion: data.descripcion,
      categoria: data.categoria,
      requiere_estudiante: data.requiere_estudiante,
      activo: data.activo,
      color: data.color,
      orden: data.orden
    };

    // Construir dinámicamente el SET clause solo con campos proporcionados
    for (const [field, value] of Object.entries(updateableFields)) {
      if (value !== undefined) {
        fields.push(`${field} = $${paramCounter}`);
        values.push(value);
        paramCounter++;
      }
    }

    // Si no hay campos para actualizar, retornar el registro actual
    if (fields.length === 0) {
      return await this.findById(id);
    }

    // Siempre actualizar el timestamp
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    // Agregar el ID al final
    values.push(id);

    const query = `
      UPDATE tipo_ingreso
      SET ${fields.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING *
    `;

    console.log('Query SQL:', query); // Para debug
    console.log('Valores:', values); // Para debug

    const result = await pool.query(query, values);
    return result.rows[0];
  }

}

export { Ingreso, TipoIngreso };