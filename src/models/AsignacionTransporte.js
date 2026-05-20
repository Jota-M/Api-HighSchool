// models/AsignacionTransporte.js
import { pool } from '../db/pool.js';

class AsignacionTransporte {
  // Crear asignación
  static async create(data) {
    const {
      estudiante_id, ruta_id, parada_id, periodo_academico_id,
      fecha_inicio, fecha_fin, costo_mensual, usa_ida, usa_retorno,
      contacto_emergencia, telefono_emergencia, observaciones
    } = data;

    const query = `
      INSERT INTO asignacion_transporte (
        estudiante_id, ruta_id, parada_id, periodo_academico_id,
        fecha_inicio, fecha_fin, costo_mensual, usa_ida, usa_retorno,
        contacto_emergencia, telefono_emergencia, observaciones,
        estado, activo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'activo', true)
      RETURNING *
    `;

    const result = await pool.query(query, [
      estudiante_id, ruta_id, parada_id || null, periodo_academico_id,
      fecha_inicio || new Date(), fecha_fin, costo_mensual,
      usa_ida ?? true, usa_retorno ?? true,
      contacto_emergencia, telefono_emergencia, observaciones
    ]);

    return result.rows[0];
  }

  // Verificar si ya existe asignación activa
  static async exists(estudiante_id, periodo_academico_id) {
    const query = `
      SELECT id, ruta_id FROM asignacion_transporte
      WHERE estudiante_id = $1 
        AND periodo_academico_id = $2 
        AND activo = true
        AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [estudiante_id, periodo_academico_id]);
    return result.rows[0];
  }

  // Listar asignaciones con filtros
  static async findAll(filters = {}) {
    const {
      page = 1, limit = 10, search, periodo_academico_id,
      ruta_id, estudiante_id, estado, activo
    } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['at.deleted_at IS NULL'];
    let queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(`(
        e.nombres ILIKE $${paramCounter} OR 
        e.apellido_paterno ILIKE $${paramCounter} OR 
        e.apellido_materno ILIKE $${paramCounter} OR
        e.codigo ILIKE $${paramCounter}
      )`);
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (periodo_academico_id) {
      whereConditions.push(`at.periodo_academico_id = $${paramCounter}`);
      queryParams.push(periodo_academico_id);
      paramCounter++;
    }

    if (ruta_id) {
      whereConditions.push(`at.ruta_id = $${paramCounter}`);
      queryParams.push(ruta_id);
      paramCounter++;
    }

    if (estudiante_id) {
      whereConditions.push(`at.estudiante_id = $${paramCounter}`);
      queryParams.push(estudiante_id);
      paramCounter++;
    }

    if (estado) {
      whereConditions.push(`at.estado = $${paramCounter}`);
      queryParams.push(estado);
      paramCounter++;
    }

    if (activo !== undefined) {
      whereConditions.push(`at.activo = $${paramCounter}`);
      queryParams.push(activo);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Contar total
    const countQuery = `
      SELECT COUNT(*)
      FROM asignacion_transporte at
      INNER JOIN estudiante e ON at.estudiante_id = e.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Obtener datos
    const dataQuery = `
      SELECT at.*,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        e.foto_url as estudiante_foto,
        r.nombre as ruta_nombre,
        r.codigo as ruta_codigo,
        r.zona_cobertura,
        pr.nombre as parada_nombre,
        pa.nombre as periodo_nombre,
        COUNT(pt.id) as total_cuotas,
        COUNT(CASE WHEN pt.estado = 'pagado' THEN 1 END) as cuotas_pagadas,
        COUNT(CASE WHEN pt.estado = 'pendiente' THEN 1 END) as cuotas_pendientes,
        COUNT(CASE WHEN pt.estado = 'vencido' THEN 1 END) as cuotas_vencidas,
        COALESCE(SUM(CASE WHEN pt.estado != 'pagado' THEN pt.monto_final ELSE 0 END), 0) as deuda_total
      FROM asignacion_transporte at
      INNER JOIN estudiante e ON at.estudiante_id = e.id
      INNER JOIN ruta_transporte r ON at.ruta_id = r.id
      LEFT JOIN parada_ruta pr ON at.parada_id = pr.id
      INNER JOIN periodo_academico pa ON at.periodo_academico_id = pa.id
      LEFT JOIN pago_transporte pt ON at.id = pt.asignacion_transporte_id
      WHERE ${whereClause}
      GROUP BY at.id, e.codigo, e.nombres, e.apellido_paterno, e.apellido_materno, 
               e.foto_url, r.nombre, r.codigo, r.zona_cobertura, pr.nombre, pa.nombre
      ORDER BY e.apellido_paterno, e.apellido_materno, e.nombres
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      asignaciones: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Buscar por ID con información completa
  static async findById(id) {
    const query = `
      SELECT at.*,
        e.id as estudiante_id,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        e.foto_url as estudiante_foto,
        e.telefono as estudiante_telefono,
        r.id as ruta_id,
        r.codigo as ruta_codigo,
        r.nombre as ruta_nombre,
        r.zona_cobertura,
        r.conductor_responsable,
        r.telefono_conductor,
        r.placa_vehiculo,
        pr.id as parada_id,
        pr.nombre as parada_nombre,
        pr.direccion as parada_direccion,
        pa.id as periodo_id,
        pa.nombre as periodo_nombre,
        pa.codigo as periodo_codigo
      FROM asignacion_transporte at
      INNER JOIN estudiante e ON at.estudiante_id = e.id
      INNER JOIN ruta_transporte r ON at.ruta_id = r.id
      LEFT JOIN parada_ruta pr ON at.parada_id = pr.id
      INNER JOIN periodo_academico pa ON at.periodo_academico_id = pa.id
      WHERE at.id = $1 AND at.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Actualizar asignación
  static async update(id, data) {
    const {
      ruta_id, parada_id, costo_mensual, usa_ida, usa_retorno,
      contacto_emergencia, telefono_emergencia, observaciones
    } = data;

    const query = `
      UPDATE asignacion_transporte
      SET ruta_id = $1, parada_id = $2, costo_mensual = $3,
          usa_ida = $4, usa_retorno = $5, contacto_emergencia = $6,
          telefono_emergencia = $7, observaciones = $8,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [
      ruta_id, parada_id, costo_mensual, usa_ida, usa_retorno,
      contacto_emergencia, telefono_emergencia, observaciones, id
    ]);

    return result.rows[0];
  }

  // Cambiar estado
  static async changeStatus(id, estado, motivo = null) {
    const query = `
      UPDATE asignacion_transporte
      SET estado = $1,
          fecha_fin = CASE WHEN $1 IN ('cancelado', 'finalizado') THEN CURRENT_DATE ELSE fecha_fin END,
          observaciones = CASE 
            WHEN $2 IS NOT NULL THEN CONCAT(COALESCE(observaciones, ''), E'\n', $2)
            ELSE observaciones
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [estado, motivo, id]);
    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    const query = `
      UPDATE asignacion_transporte
      SET deleted_at = CURRENT_TIMESTAMP, activo = false
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Listar estudiantes por ruta
  static async findByRuta(ruta_id, periodo_academico_id) {
    const query = `
      SELECT at.id as asignacion_id, at.costo_mensual, at.estado,
        e.id, e.codigo, e.nombres, e.apellido_paterno, e.apellido_materno,
        e.foto_url, e.telefono,
        pr.nombre as parada_nombre
      FROM asignacion_transporte at
      INNER JOIN estudiante e ON at.estudiante_id = e.id
      LEFT JOIN parada_ruta pr ON at.parada_id = pr.id
      WHERE at.ruta_id = $1 
        AND at.periodo_academico_id = $2
        AND at.activo = true
        AND at.deleted_at IS NULL
      ORDER BY e.apellido_paterno, e.apellido_materno, e.nombres
    `;

    const result = await pool.query(query, [ruta_id, periodo_academico_id]);
    return result.rows;
  }

  // Obtener estadísticas
  static async getEstadisticas(periodo_academico_id) {
    const query = `
      SELECT 
        COUNT(*) as total_asignaciones,
        COUNT(CASE WHEN estado = 'activo' THEN 1 END) as activas,
        COUNT(CASE WHEN estado = 'suspendido' THEN 1 END) as suspendidas,
        COUNT(DISTINCT ruta_id) as rutas_en_uso,
        COUNT(DISTINCT estudiante_id) as estudiantes_usando_transporte,
        SUM(costo_mensual) as ingreso_mensual_proyectado
      FROM asignacion_transporte
      WHERE periodo_academico_id = $1 
        AND activo = true 
        AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [periodo_academico_id]);
    return result.rows[0];
  }
}

// =============================================
// PAGO TRANSPORTE - MÉTODOS EXTENDIDOS
// =============================================
class PagoTransporte {
  // Generar cuotas mensuales (llama a la función SQL)
  static async generarCuotas(asignacion_id, cantidad_meses = 10) {
    const query = 'SELECT * FROM generar_cuotas_transporte($1, $2)';
    const result = await pool.query(query, [asignacion_id, cantidad_meses]);
    return result.rows;
  }

  // Crear pago manual
  static async create(data) {
    const {
      codigo_pago, asignacion_transporte_id, mes_correspondiente,
      fecha_vencimiento, monto_original, monto_recargo, monto_final
    } = data;

    const query = `
      INSERT INTO pago_transporte (
        codigo_pago, asignacion_transporte_id, mes_correspondiente,
        fecha_vencimiento, monto_original, monto_recargo, monto_final,
        estado
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente')
      RETURNING *
    `;

    const result = await pool.query(query, [
      codigo_pago, asignacion_transporte_id, mes_correspondiente,
      fecha_vencimiento, monto_original, monto_recargo || 0, monto_final
    ]);

    return result.rows[0];
  }

  // Listar pagos con filtros
  static async findAll(filters = {}) {
    const {
      page = 1, limit = 10, asignacion_transporte_id,
      estudiante_id, ruta_id, estado, mes_correspondiente
    } = filters;
    const offset = (page - 1) * limit;

    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramCounter = 1;

    if (asignacion_transporte_id) {
      whereConditions.push(`pt.asignacion_transporte_id = $${paramCounter}`);
      queryParams.push(asignacion_transporte_id);
      paramCounter++;
    }

    if (estudiante_id) {
      whereConditions.push(`at.estudiante_id = $${paramCounter}`);
      queryParams.push(estudiante_id);
      paramCounter++;
    }

    if (ruta_id) {
      whereConditions.push(`at.ruta_id = $${paramCounter}`);
      queryParams.push(ruta_id);
      paramCounter++;
    }

    if (estado) {
      whereConditions.push(`pt.estado = $${paramCounter}`);
      queryParams.push(estado);
      paramCounter++;
    }

    if (mes_correspondiente) {
      whereConditions.push(`pt.mes_correspondiente = $${paramCounter}`);
      queryParams.push(mes_correspondiente);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)
      FROM pago_transporte pt
      INNER JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT pt.*,
        pt.monto_final - COALESCE(pt.monto_pagado, 0) as saldo_pendiente,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        r.nombre as ruta_nombre,
        r.codigo as ruta_codigo,
        u.username as registrado_por_username
      FROM pago_transporte pt
      INNER JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
      INNER JOIN estudiante e ON at.estudiante_id = e.id
      INNER JOIN ruta_transporte r ON at.ruta_id = r.id
      LEFT JOIN usuarios u ON pt.registrado_por = u.id
      WHERE ${whereClause}
      ORDER BY pt.fecha_vencimiento ASC
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

  // Buscar por ID
  static async findById(id) {
    const query = `
      SELECT pt.*,
        pt.monto_final - COALESCE(pt.monto_pagado, 0) as saldo_pendiente,
        at.estudiante_id,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        r.nombre as ruta_nombre,
        pa.id as periodo_academico_id,
        u.username as registrado_por_username
      FROM pago_transporte pt
      INNER JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
      INNER JOIN estudiante e ON at.estudiante_id = e.id
      INNER JOIN ruta_transporte r ON at.ruta_id = r.id
      INNER JOIN periodo_academico pa ON at.periodo_academico_id = pa.id
      LEFT JOIN usuarios u ON pt.registrado_por = u.id
      WHERE pt.id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Buscar por código
  static async findByCodigo(codigo_pago) {
    const query = `
      SELECT pt.*,
        pt.monto_final - COALESCE(pt.monto_pagado, 0) as saldo_pendiente,
        at.estudiante_id,
        at.periodo_academico_id,
        e.codigo as estudiante_codigo,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        r.nombre as ruta_nombre
      FROM pago_transporte pt
      INNER JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
      INNER JOIN estudiante e ON at.estudiante_id = e.id
      INNER JOIN ruta_transporte r ON at.ruta_id = r.id
      WHERE pt.codigo_pago = $1
    `;

    const result = await pool.query(query, [codigo_pago]);
    return result.rows[0];
  }

  // Registrar pago individual
  static async registrarPago(id, data, usuario_id) {
    const {
      monto_pagado, metodo_pago, numero_comprobante,
      comprobante_url, observaciones
    } = data;

    const query = `
      UPDATE pago_transporte
      SET monto_pagado = COALESCE(monto_pagado, 0) + $1,
          estado = CASE 
            WHEN (COALESCE(monto_pagado, 0) + $1) >= monto_final THEN 'pagado'
            WHEN (COALESCE(monto_pagado, 0) + $1) > 0 THEN 'pagado_parcial'
            ELSE estado
          END,
          metodo_pago = $2,
          numero_comprobante = $3,
          comprobante_url = $4,
          fecha_pago = CURRENT_TIMESTAMP,
          registrado_por = $5,
          observaciones = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `;

    const result = await pool.query(query, [
      monto_pagado, metodo_pago, numero_comprobante,
      comprobante_url, usuario_id, observaciones, id
    ]);

    return result.rows[0];
  }

  // 🆕 REGISTRAR PAGO MÚLTIPLE
  static async registrarPagoMultiple(data, usuario_id) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { pagos, metodo_pago, numero_comprobante, observaciones } = data;
    
    let monto_total = 0;
    let cantidad_pagos = 0;
    const pagosRegistrados = [];

    for (const pagoData of pagos) {
      const { pago_transporte_id, monto_pagado } = pagoData;

      const query = `
        UPDATE pago_transporte
        SET monto_pagado = COALESCE(monto_pagado, 0) + $1,
            estado = CASE 
              WHEN (COALESCE(monto_pagado, 0) + $1) >= monto_final THEN 'pagado'
              WHEN (COALESCE(monto_pagado, 0) + $1) > 0 THEN 'pagado_parcial'
              ELSE estado
            END,
            metodo_pago = $2,
            numero_comprobante = $3,
            fecha_pago = CURRENT_TIMESTAMP,
            registrado_por = $4,
            observaciones = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `;

      const result = await client.query(query, [
        monto_pagado,
        metodo_pago,
        numero_comprobante,
        usuario_id,
        observaciones,
        pago_transporte_id
      ]);

      if (result.rows[0]) {
        monto_total += parseFloat(monto_pagado);
        cantidad_pagos++;
        pagosRegistrados.push(result.rows[0]);
      }
    }

    await client.query('COMMIT');

    return {
      cantidad_pagos,
      monto_total,
      pagos: pagosRegistrados
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// 🆕 CALCULAR DISTRIBUCIÓN (sin cambios)
static async calcularDistribucion(asignacion_id, monto_total) {
  const query = `
    SELECT 
      pt.id as pago_id,
      pt.mes_correspondiente,
      pt.monto_final,
      COALESCE(pt.monto_pagado, 0) as monto_pagado,
      pt.monto_final - COALESCE(pt.monto_pagado, 0) as saldo_pendiente
    FROM pago_transporte pt
    WHERE pt.asignacion_transporte_id = $1
      AND pt.estado IN ('pendiente', 'vencido', 'pagado_parcial')
      AND pt.anulado = false
    ORDER BY pt.fecha_vencimiento ASC
  `;

  const result = await pool.query(query, [asignacion_id]);
  const pagosPendientes = result.rows;

  if (pagosPendientes.length === 0) {
    return {
      monto_total,
      monto_distribuido: 0,
      monto_sobrante: monto_total,
      pagos_completos: 0,
      pagos_parciales: 0,
      distribucion: [],
      advertencias: ['No hay pagos pendientes para esta asignación']
    };
  }

  let montoRestante = parseFloat(monto_total);
  const distribucion = [];
  let pagosCompletos = 0;
  let pagosParciales = 0;
  const advertencias = [];

  for (const pago of pagosPendientes) {
    if (montoRestante <= 0) break;

    const saldoPendiente = parseFloat(pago.saldo_pendiente);
    const montoAPagar = Math.min(montoRestante, saldoPendiente);
    const saldoRestante = saldoPendiente - montoAPagar;
    const porcentajePago = (montoAPagar / saldoPendiente) * 100;
    const esPagoCompleto = montoAPagar >= saldoPendiente;

    distribucion.push({
      pago_id: pago.pago_id,
      mes_correspondiente: pago.mes_correspondiente,
      saldo_pendiente: saldoPendiente,
      monto_a_pagar: montoAPagar,
      saldo_restante: saldoRestante,
      porcentaje_pago: porcentajePago,
      es_pago_completo: esPagoCompleto,
      es_pago_parcial: !esPagoCompleto
    });

    if (esPagoCompleto) {
      pagosCompletos++;
    } else {
      pagosParciales++;
    }

    montoRestante -= montoAPagar;
  }

  const montoDistribuido = parseFloat(monto_total) - montoRestante;

  if (montoRestante > 0.01) {
    advertencias.push(`Sobra Bs. ${montoRestante.toFixed(2)} después de cubrir todos los pagos pendientes`);
  }

  return {
    monto_total: parseFloat(monto_total),
    monto_distribuido: montoDistribuido,
    monto_sobrante: montoRestante,
    pagos_completos: pagosCompletos,
    pagos_parciales: pagosParciales,
    distribucion,
    advertencias
  };
}

// 🆕 REGISTRAR PAGO DISTRIBUIDO (CORREGIDO - sin banco_origen ni numero_referencia)
static async registrarPagoDistribuido(data, usuario_id) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { asignacion_id, monto_total, metodo_pago, numero_comprobante, observaciones } = data;

    // Calcular distribución
    const distribucion = await this.calcularDistribucion(asignacion_id, monto_total);

    if (distribucion.distribucion.length === 0) {
      throw new Error('No hay pagos pendientes para distribuir');
    }

    const pagosRegistrados = [];

    // Registrar cada pago según la distribución
    for (const item of distribucion.distribucion) {
      const query = `
        UPDATE pago_transporte
        SET monto_pagado = COALESCE(monto_pagado, 0) + $1,
            estado = CASE 
              WHEN (COALESCE(monto_pagado, 0) + $1) >= monto_final THEN 'pagado'
              WHEN (COALESCE(monto_pagado, 0) + $1) > 0 THEN 'pagado_parcial'
              ELSE estado
            END,
            metodo_pago = $2,
            numero_comprobante = $3,
            fecha_pago = CURRENT_TIMESTAMP,
            registrado_por = $4,
            observaciones = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `;

      const result = await client.query(query, [
        item.monto_a_pagar,
        metodo_pago,
        numero_comprobante,
        usuario_id,
        observaciones,
        item.pago_id
      ]);

      if (result.rows[0]) {
        pagosRegistrados.push(result.rows[0]);
      }
    }

    await client.query('COMMIT');

    return {
      cantidad_pagos: pagosRegistrados.length,
      monto_distribuido: distribucion.monto_distribuido,
      monto_sobrante: distribucion.monto_sobrante,
      pagos_completos: distribucion.pagos_completos,
      pagos_parciales: distribucion.pagos_parciales,
      pagos: pagosRegistrados
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

  // 🆕 CALCULAR DISTRIBUCIÓN
  static async calcularDistribucion(asignacion_id, monto_total) {
    const query = `
      SELECT 
        pt.id as pago_id,
        pt.mes_correspondiente,
        pt.monto_final,
        COALESCE(pt.monto_pagado, 0) as monto_pagado,
        pt.monto_final - COALESCE(pt.monto_pagado, 0) as saldo_pendiente
      FROM pago_transporte pt
      WHERE pt.asignacion_transporte_id = $1
        AND pt.estado IN ('pendiente', 'vencido', 'pagado_parcial')
        AND pt.anulado = false
      ORDER BY pt.fecha_vencimiento ASC
    `;

    const result = await pool.query(query, [asignacion_id]);
    const pagosPendientes = result.rows;

    if (pagosPendientes.length === 0) {
      return {
        monto_total,
        monto_distribuido: 0,
        monto_sobrante: monto_total,
        pagos_completos: 0,
        pagos_parciales: 0,
        distribucion: [],
        advertencias: ['No hay pagos pendientes para esta asignación']
      };
    }

    let montoRestante = parseFloat(monto_total);
    const distribucion = [];
    let pagosCompletos = 0;
    let pagosParciales = 0;
    const advertencias = [];

    for (const pago of pagosPendientes) {
      if (montoRestante <= 0) break;

      const saldoPendiente = parseFloat(pago.saldo_pendiente);
      const montoAPagar = Math.min(montoRestante, saldoPendiente);
      const saldoRestante = saldoPendiente - montoAPagar;
      const porcentajePago = (montoAPagar / saldoPendiente) * 100;
      const esPagoCompleto = montoAPagar >= saldoPendiente;

      distribucion.push({
        pago_id: pago.pago_id,
        mes_correspondiente: pago.mes_correspondiente,
        saldo_pendiente: saldoPendiente,
        monto_a_pagar: montoAPagar,
        saldo_restante: saldoRestante,
        porcentaje_pago: porcentajePago,
        es_pago_completo: esPagoCompleto,
        es_pago_parcial: !esPagoCompleto
      });

      if (esPagoCompleto) {
        pagosCompletos++;
      } else {
        pagosParciales++;
      }

      montoRestante -= montoAPagar;
    }

    const montoDistribuido = parseFloat(monto_total) - montoRestante;

    if (montoRestante > 0.01) {
      advertencias.push(`Sobra Bs. ${montoRestante.toFixed(2)} después de cubrir todos los pagos pendientes`);
    }

    return {
      monto_total: parseFloat(monto_total),
      monto_distribuido: montoDistribuido,
      monto_sobrante: montoRestante,
      pagos_completos: pagosCompletos,
      pagos_parciales: pagosParciales,
      distribucion,
      advertencias
    };
  }

  // Anular pago
  static async anular(id, motivo, usuario_id) {
    const query = `
      UPDATE pago_transporte
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

  // Obtener estado de cuenta
  static async getEstadoCuenta(estudiante_id, periodo_academico_id = null) {
    const query = 'SELECT * FROM estado_cuenta_transporte($1, $2)';
    const result = await pool.query(query, [estudiante_id, periodo_academico_id]);
    return result.rows[0];
  }

  // Calcular recargos por mora
  static async calcularRecargos(porcentaje = 0.05) {
    const query = 'SELECT * FROM calcular_recargos_transporte($1)';
    const result = await pool.query(query, [porcentaje]);
    return result.rows[0];
  }
}

export { AsignacionTransporte, PagoTransporte };