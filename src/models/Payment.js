// models/Payment.js - ACTUALIZADO PARA 10 MESES
import { pool } from '../db/pool.js';

// =============================================
// MODELO: CostoMensualidad
// =============================================
class CostoMensualidad {
  // Crear configuración de costo
  static async create(data) {
    const { periodo_academico_id, nivel_academico_id, monto_base, descuento_pago_completo, observaciones } = data;

    const query = `
      INSERT INTO costo_mensualidad 
      (periodo_academico_id, nivel_academico_id, monto_base, descuento_pago_completo, observaciones)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await pool.query(query, [
      periodo_academico_id,
      nivel_academico_id,
      monto_base,
      descuento_pago_completo ?? 10.00, // 🔧 CAMBIO: 10% por defecto (1 mes de descuento sobre 10)
      observaciones
    ]);

    return result.rows[0];
  }

  // Listar costos con filtros
  static async findAll(filters = {}) {
    const { periodo_academico_id, nivel_academico_id, activo } = filters;

    let whereConditions = [];
    let queryParams = [];
    let paramCounter = 1;

    if (periodo_academico_id) {
      whereConditions.push(`cm.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (nivel_academico_id) {
      whereConditions.push(`cm.nivel_academico_id = $${paramCounter}`);
      queryParams.push(nivel_academico_id);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`cm.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT cm.*, 
        pa.nombre as periodo_nombre,
        pa.codigo as periodo_codigo,
        n.nombre as nivel_nombre,
        n.codigo as nivel_codigo
      FROM costo_mensualidad cm
      INNER JOIN periodo_academico pa ON cm.periodo_academico_id = pa.id
      INNER JOIN nivel_academico n ON cm.nivel_academico_id = n.id
      ${whereClause}
      ORDER BY pa.fecha_inicio DESC, n.orden ASC
    `;

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  // Buscar por ID
  static async findById(id) {
    const query = `
      SELECT cm.*, 
        pa.nombre as periodo_nombre,
        n.nombre as nivel_nombre
      FROM costo_mensualidad cm
      INNER JOIN periodo_academico pa ON cm.periodo_academico_id = pa.id
      INNER JOIN nivel_academico n ON cm.nivel_academico_id = n.id
      WHERE cm.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Obtener costo para un nivel y período específico
  static async findByPeriodoNivel(periodo_academico_id, nivel_academico_id) {
    const query = `
      SELECT * FROM costo_mensualidad
      WHERE periodo_academico_id = $1
        AND nivel_academico_id = $2
        AND activo = true
      LIMIT 1
    `;
    const result = await pool.query(query, [periodo_academico_id, nivel_academico_id]);
    return result.rows[0];
  }

  // Actualizar
  static async update(id, data) {
    const { monto_base, descuento_pago_completo, activo, observaciones } = data;

    const query = `
    UPDATE costo_mensualidad 
    SET monto_base = $1,
        descuento_pago_completo = $2,
        activo = COALESCE($3, activo),   -- ✅ Si llega null/undefined, conserva el valor actual
        observaciones = $4,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
  `;

    const result = await pool.query(query, [
      monto_base,
      descuento_pago_completo,
      activo ?? null,   // ✅ undefined → null, así COALESCE lo ignora
      observaciones,
      id
    ]);

    return result.rows[0];
  }

  // Eliminar (soft delete desactivando)
  static async delete(id) {
    const query = `
      UPDATE costo_mensualidad 
      SET activo = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

// =============================================
// MODELO: Mensualidad - SISTEMA DE 10 MESES
// =============================================
class Mensualidad {
  /**
   * 🔧 Obtener mensualidades por matrícula con saldo_pendiente
   * Sistema de 10 mensualidades (febrero a noviembre)
   */
  static async findByMatricula(matricula_id) {
    const query = `
      SELECT m.*,
        mat.numero_matricula,
        e.nombres,
        e.apellidos,
        e.codigo as estudiante_codigo,
        -- Calcular total pagado
        COALESCE((
          SELECT SUM(pm.monto_pagado)
          FROM pago_mensualidad pm
          WHERE pm.mensualidad_id = m.id
            AND NOT pm.anulado
        ), 0) as total_pagado,
        -- Calcular saldo pendiente
        (m.monto_final - COALESCE((
          SELECT SUM(pm.monto_pagado)
          FROM pago_mensualidad pm
          WHERE pm.mensualidad_id = m.id
            AND NOT pm.anulado
        ), 0)) as saldo_pendiente
      FROM mensualidad m
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      WHERE m.matricula_id = $1
      ORDER BY m.numero_cuota ASC
    `;

    const result = await pool.query(query, [matricula_id]);
    return result.rows;
  }

  /**
   * 🔧 Generar 10 mensualidades usando stored procedure
   * @returns Array con 10 mensualidades (febrero a noviembre)
   */
  static async generar(matricula_id, periodo_academico_id, nivel_academico_id, porcentaje_beca = 0) {
    const query = `
      SELECT * FROM generar_mensualidades($1, $2, $3, $4)
    `;

    const result = await pool.query(query, [
      matricula_id,
      periodo_academico_id,
      nivel_academico_id,
      porcentaje_beca
    ]);

    // Verificar que se generaron exactamente 10 mensualidades
    if (result.rows.length !== 10) {
      throw new Error(`Error: Se generaron ${result.rows.length} mensualidades en lugar de 10`);
    }

    return result.rows;
  }

  // Buscar por ID con detalles
  static async findById(id) {
    const query = `
      SELECT m.*,
        mat.numero_matricula,
        mat.es_becado,
        mat.porcentaje_beca,
        e.id as estudiante_id,
        e.codigo as estudiante_codigo,
        e.nombres,
        e.apellidos,
        p.nombre as paralelo,
        g.nombre as grado,
        n.nombre as nivel,
        -- Total pagado
        COALESCE((
          SELECT SUM(pm.monto_pagado)
          FROM pago_mensualidad pm
          WHERE pm.mensualidad_id = m.id
            AND NOT pm.anulado
        ), 0) as total_pagado,
        -- Saldo pendiente
        (m.monto_final - COALESCE((
          SELECT SUM(pm.monto_pagado)
          FROM pago_mensualidad pm
          WHERE pm.mensualidad_id = m.id
            AND NOT pm.anulado
        ), 0)) as saldo_pendiente
      FROM mensualidad m
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      INNER JOIN paralelo p ON mat.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      WHERE m.id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Listar con filtros
  static async findAll(filters = {}) {
    const { periodo_academico_id, estado, grado_id, paralelo_id, mes_correspondiente } = filters;

    let whereConditions = ['mat.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (periodo_academico_id) {
      whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (estado) {
      whereConditions.push(`m.estado = $${paramCounter}`);
      queryParams.push(estado);
      paramCounter++;
    }

    if (grado_id) {
      whereConditions.push(`g.id = $${paramCounter}`);
      queryParams.push(grado_id);
      paramCounter++;
    }

    if (paralelo_id) {
      whereConditions.push(`p.id = $${paramCounter}`);
      queryParams.push(paralelo_id);
      paramCounter++;
    }

    if (mes_correspondiente) {
      whereConditions.push(`m.mes_correspondiente = $${paramCounter}`);
      queryParams.push(mes_correspondiente);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT m.*,
        e.codigo as estudiante_codigo,
        e.nombres,
        e.apellidos,
        p.nombre as paralelo,
        g.nombre as grado,
        mat.numero_matricula,
        COALESCE((
          SELECT SUM(pm.monto_pagado)
          FROM pago_mensualidad pm
          WHERE pm.mensualidad_id = m.id
            AND NOT pm.anulado
        ), 0) as total_pagado,
        (m.monto_final - COALESCE((
          SELECT SUM(pm.monto_pagado)
          FROM pago_mensualidad pm
          WHERE pm.mensualidad_id = m.id
            AND NOT pm.anulado
        ), 0)) as saldo_pendiente
      FROM mensualidad m
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      INNER JOIN paralelo p ON mat.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      ${whereClause}
      ORDER BY m.fecha_vencimiento ASC, e.apellidos ASC
    `;

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  // Actualizar estado manualmente
  static async updateEstado(id, estado, observaciones = null) {
    const query = `
      UPDATE mensualidad 
      SET estado = $1,
          observaciones = COALESCE($2, observaciones),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [estado, observaciones, id]);
    return result.rows[0];
  }

  // Anular mensualidad
  static async anular(id, motivo) {
    const query = `
      UPDATE mensualidad 
      SET estado = 'anulado',
          observaciones = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [motivo, id]);
    return result.rows[0];
  }

  // Obtener mensualidades vencidas
  static async findVencidas(periodo_academico_id = null) {
    let query = `
      SELECT m.*,
        e.codigo as estudiante_codigo,
        e.nombres,
        e.apellidos,
        p.nombre as paralelo,
        g.nombre as grado,
        CURRENT_DATE - m.fecha_vencimiento as dias_mora,
        COALESCE((
          SELECT SUM(pm.monto_pagado)
          FROM pago_mensualidad pm
          WHERE pm.mensualidad_id = m.id
            AND NOT pm.anulado
        ), 0) as total_pagado,
        (m.monto_final - COALESCE((
          SELECT SUM(pm.monto_pagado)
          FROM pago_mensualidad pm
          WHERE pm.mensualidad_id = m.id
            AND NOT pm.anulado
        ), 0)) as saldo_pendiente
      FROM mensualidad m
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      INNER JOIN paralelo p ON mat.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      WHERE m.estado IN ('pendiente', 'vencido')
        AND m.fecha_vencimiento < CURRENT_DATE
        AND mat.estado = 'activo'
        AND mat.deleted_at IS NULL
    `;

    const params = [];
    if (periodo_academico_id) {
      query += ` AND mat.periodo_academico_id = $1`;
      params.push(periodo_academico_id);
    }

    query += ` ORDER BY m.fecha_vencimiento ASC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * 🔧 NUEVA FUNCIÓN: Validar que existan exactamente 10 mensualidades
   */
  static async validarCantidadMensualidades(matricula_id) {
    const query = `
      SELECT COUNT(*) as total
      FROM mensualidad
      WHERE matricula_id = $1
        AND estado != 'anulado'
    `;

    const result = await pool.query(query, [matricula_id]);
    const total = parseInt(result.rows[0].total);

    return {
      es_valido: total === 10,
      total_encontrado: total,
      total_esperado: 10
    };
  }
}

// =============================================
// MODELO: PagoMensualidad
// =============================================
class PagoMensualidad {
  // Generar código de pago único
  static async generarCodigoPago() {
    const year = new Date().getFullYear();
    const sequence = await pool.query('SELECT NEXTVAL(\'pago_mensualidad_id_seq\')');
    const numero = String(sequence.rows[0].nextval).padStart(6, '0');
    return `PAG-${year}-${numero}`;
  }

  // Registrar pago individual
  static async create(data) {
    const {
      mensualidad_id,
      monto_pagado,
      metodo_pago,
      numero_comprobante,
      comprobante_url,
      entrego_factura,
      numero_factura,
      banco_origen,
      numero_referencia,
      registrado_por,
      observaciones
    } = data;

    const codigo_pago = await this.generarCodigoPago();

    const query = `
      INSERT INTO pago_mensualidad (
        codigo_pago, mensualidad_id, monto_pagado, metodo_pago,
        numero_comprobante, comprobante_url, entrego_factura, numero_factura,
        banco_origen, numero_referencia, registrado_por, observaciones
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await pool.query(query, [
      codigo_pago,
      mensualidad_id,
      monto_pagado,
      metodo_pago,
      numero_comprobante,
      comprobante_url,
      entrego_factura ?? false,
      numero_factura,
      banco_origen,
      numero_referencia,
      registrado_por,
      observaciones
    ]);

    return result.rows[0];
  }

  // Buscar por ID con detalles completos
  static async findById(id) {
    const query = `
      SELECT pm.*,
        m.numero_cuota,
        m.mes_correspondiente,
        m.monto_final as monto_mensualidad,
        mat.numero_matricula,
        e.codigo as estudiante_codigo,
        e.nombres,
        e.apellidos,
        u.username as registrado_por_username,
        ua.username as anulado_por_username
      FROM pago_mensualidad pm
      INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      INNER JOIN usuarios u ON pm.registrado_por = u.id
      LEFT JOIN usuarios ua ON pm.anulado_por = ua.id
      WHERE pm.id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Listar pagos con filtros
  static async findAll(filters = {}) {
    const {
      page = 1,
      limit = 50,
      estudiante_id,
      periodo_academico_id,
      metodo_pago,
      fecha_desde,
      fecha_hasta,
      anulado
    } = filters;

    const offset = (page - 1) * limit;

    let whereConditions = [];
    let queryParams = [];
    let paramCounter = 1;

    if (estudiante_id) {
      whereConditions.push(`e.id = $${paramCounter}`);
      queryParams.push(estudiante_id);
      paramCounter++;
    }

    if (periodo_academico_id) {
      whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (metodo_pago) {
      whereConditions.push(`pm.metodo_pago = $${paramCounter}`);
      queryParams.push(metodo_pago);
      paramCounter++;
    }

    if (fecha_desde) {
      whereConditions.push(`pm.fecha_pago >= $${paramCounter}`);
      queryParams.push(fecha_desde);
      paramCounter++;
    }

    if (fecha_hasta) {
      whereConditions.push(`pm.fecha_pago <= $${paramCounter}`);
      queryParams.push(fecha_hasta);
      paramCounter++;
    }

    if (anulado !== undefined) {
      whereConditions.push(`pm.anulado = $${paramCounter}`);
      queryParams.push(anulado);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Contar total
    const countQuery = `
      SELECT COUNT(*) FROM pago_mensualidad pm
      INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Obtener datos
    const dataQuery = `
      SELECT pm.*,
        m.numero_cuota,
        m.mes_correspondiente,
        mat.numero_matricula,
        e.codigo as estudiante_codigo,
        e.nombres,
        e.apellidos,
        u.username as registrado_por_username
      FROM pago_mensualidad pm
      INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      INNER JOIN usuarios u ON pm.registrado_por = u.id
      ${whereClause}
      ORDER BY pm.fecha_pago DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      pagos: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Obtener pagos de una mensualidad
  static async findByMensualidad(mensualidad_id) {
    const query = `
      SELECT pm.*,
        u.username as registrado_por_username
      FROM pago_mensualidad pm
      INNER JOIN usuarios u ON pm.registrado_por = u.id
      WHERE pm.mensualidad_id = $1
      ORDER BY pm.fecha_pago DESC
    `;

    const result = await pool.query(query, [mensualidad_id]);
    return result.rows;
  }

  // Anular pago
  static async anular(id, motivo, anulado_por) {
    const query = `
      UPDATE pago_mensualidad 
      SET anulado = true,
          motivo_anulacion = $1,
          anulado_por = $2,
          fecha_anulacion = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(query, [motivo, anulado_por, id]);
    return result.rows[0];
  }

  // Actualizar datos del pago
  static async update(id, data) {
    const {
      numero_comprobante,
      comprobante_url,
      entrego_factura,
      numero_factura,
      observaciones
    } = data;

    const query = `
      UPDATE pago_mensualidad 
      SET numero_comprobante = COALESCE($1, numero_comprobante),
          comprobante_url = COALESCE($2, comprobante_url),
          entrego_factura = COALESCE($3, entrego_factura),
          numero_factura = COALESCE($4, numero_factura),
          observaciones = COALESCE($5, observaciones),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;

    const result = await pool.query(query, [
      numero_comprobante,
      comprobante_url,
      entrego_factura,
      numero_factura,
      observaciones,
      id
    ]);

    return result.rows[0];
  }
}

// =============================================
// MODELO: PagoAnualCompleto - SISTEMA 10 MESES
// =============================================
class PagoAnualCompleto {
  /**
   * 🔧 Registrar pago anual de 10 meses con descuento de 1 mes (10%)
   */
  static async registrar(data) {
    const {
      matricula_id,
      monto_pagado,
      metodo_pago,
      registrado_por,
      numero_comprobante,
      entrego_factura,
      numero_factura,
      observaciones
    } = data;

    const query = `
      SELECT registrar_pago_anual_completo($1, $2, $3, $4, $5, $6, $7, $8) as pago_id
    `;

    const result = await pool.query(query, [
      matricula_id,
      monto_pagado,
      metodo_pago,
      registrado_por,
      numero_comprobante,
      entrego_factura ?? false,
      numero_factura,
      observaciones
    ]);

    const pagoId = result.rows[0].pago_id;
    return await this.findById(pagoId);
  }

  // Buscar por ID
  static async findById(id) {
    const query = `
      SELECT pac.*,
        mat.numero_matricula,
        e.codigo as estudiante_codigo,
        e.nombres,
        e.apellidos,
        p.nombre as paralelo,
        g.nombre as grado,
        u.username as registrado_por_username
      FROM pago_anual_completo pac
      INNER JOIN matricula mat ON pac.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      INNER JOIN paralelo p ON mat.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN usuarios u ON pac.registrado_por = u.id
      WHERE pac.id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Listar pagos anuales
  static async findAll(filters = {}) {
    const { periodo_academico_id, metodo_pago } = filters;

    let whereConditions = [];
    let queryParams = [];
    let paramCounter = 1;

    if (periodo_academico_id) {
      whereConditions.push(`mat.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (metodo_pago) {
      whereConditions.push(`pac.metodo_pago = $${paramCounter}`);
      queryParams.push(metodo_pago);
      paramCounter++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT pac.*,
        mat.numero_matricula,
        e.codigo as estudiante_codigo,
        e.nombres,
        e.apellidos,
        p.nombre as paralelo,
        g.nombre as grado
      FROM pago_anual_completo pac
      INNER JOIN matricula mat ON pac.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      INNER JOIN paralelo p ON mat.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      ${whereClause}
      ORDER BY pac.fecha_pago DESC
    `;

    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  // Verificar si existe pago anual para una matrícula
  static async existePagoAnual(matricula_id) {
    const query = `
      SELECT id FROM pago_anual_completo
      WHERE matricula_id = $1
      LIMIT 1
    `;
    const result = await pool.query(query, [matricula_id]);
    return result.rows.length > 0;
  }
}
// =============================================
// MODELO: AjusteCostoMensualidad
// Ajuste retroactivo de costo — SOLO cuotas que aún no vencieron
// =============================================
class AjusteCostoMensualidad {
  /**
   * Previsualizar el impacto de un ajuste de costo SIN aplicarlo
   * Regla: solo afecta cuotas con fecha_vencimiento >= fecha_corte
   * y que estén en 'pendiente' o 'pagado_parcial' (nunca 'vencido', 'pagado' ni 'anulado')
   */
  static async previsualizar(filters) {
    const {
      periodo_academico_id,
      nivel_academico_id,
      nuevo_monto_base,
      fecha_corte,
      grado_id,
      paralelo_id
    } = filters;

    let whereConditions = [
      `mat.periodo_academico_id = $1`,
      `g.nivel_academico_id = $2`,
      `mat.estado = 'activo'`,
      `mat.deleted_at IS NULL`,
      `m.estado IN ('pendiente', 'pagado_parcial')`,
      `m.fecha_vencimiento >= $3::date`
    ];
    let queryParams = [periodo_academico_id, nivel_academico_id, fecha_corte];
    let paramCounter = 4;

    if (grado_id) {
      whereConditions.push(`g.id = $${paramCounter}`);
      queryParams.push(grado_id);
      paramCounter++;
    }

    if (paralelo_id) {
      whereConditions.push(`p.id = $${paramCounter}`);
      queryParams.push(paralelo_id);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');
    queryParams.push(nuevo_monto_base); // último param: $N

    const query = `
      SELECT
        m.id as mensualidad_id,
        m.numero_cuota,
        m.mes_correspondiente,
        m.fecha_vencimiento,
        m.estado,
        m.monto_final as monto_actual,
        mat.porcentaje_beca,
        ROUND($${paramCounter}::numeric * (1 - COALESCE(mat.porcentaje_beca, 0) / 100), 2) as monto_nuevo,
        e.id as estudiante_id,
        e.codigo as estudiante_codigo,
        e.nombres,
        e.apellidos,
        g.nombre as grado,
        p.nombre as paralelo,
        COALESCE((
          SELECT SUM(pm.monto_pagado)
          FROM pago_mensualidad pm
          WHERE pm.mensualidad_id = m.id AND NOT pm.anulado
        ), 0) as total_pagado
      FROM mensualidad m
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN paralelo p ON mat.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      WHERE ${whereClause}
      ORDER BY e.apellidos ASC, m.numero_cuota ASC
    `;

    const result = await pool.query(query, queryParams);

    const detalle = result.rows.map(row => {
      const monto_actual = parseFloat(row.monto_actual);
      const monto_nuevo = parseFloat(row.monto_nuevo);
      const total_pagado = parseFloat(row.total_pagado);
      const saldo_nuevo = monto_nuevo - total_pagado;
      return {
        ...row,
        monto_actual,
        monto_nuevo,
        total_pagado,
        diferencia: monto_actual - monto_nuevo,
        saldo_nuevo,
        queda_saldado: saldo_nuevo <= 0 && total_pagado > 0
      };
    });

    const resumen = detalle.reduce((acc, row) => {
      acc.total_cuotas++;
      acc.estudiantes.add(row.estudiante_id);
      acc.monto_actual_total += row.monto_actual;
      acc.monto_nuevo_total += row.monto_nuevo;
      if (row.queda_saldado) acc.cuotas_que_quedan_saldadas++;
      return acc;
    }, { total_cuotas: 0, estudiantes: new Set(), monto_actual_total: 0, monto_nuevo_total: 0, cuotas_que_quedan_saldadas: 0 });

    return {
      detalle,
      resumen: {
        total_cuotas: resumen.total_cuotas,
        total_estudiantes: resumen.estudiantes.size,
        monto_actual_total: resumen.monto_actual_total,
        monto_nuevo_total: resumen.monto_nuevo_total,
        diferencia_total: resumen.monto_actual_total - resumen.monto_nuevo_total,
        cuotas_que_quedan_saldadas: resumen.cuotas_que_quedan_saldadas
      }
    };
  }
}
export { CostoMensualidad, Mensualidad, PagoMensualidad, PagoAnualCompleto, AjusteCostoMensualidad };