// models/CupoPreinscripcion.js
import { pool } from '../db/pool.js';

class CupoPreinscripcion {
  
  // =============================================
  // CREAR CUPO
  // =============================================
  static async crear(datos, client = null) {
    const useClient = client || pool;
    
    const result = await useClient.query(`
      INSERT INTO cupo_preinscripcion (
        periodo_academico_id,
        grado_id,
        turno_id,
        cupos_totales,
        activo,
        observaciones
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      datos.periodo_academico_id,
      datos.grado_id,
      datos.turno_id,
      datos.cupos_totales,
      datos.activo ?? true,
      datos.observaciones || null
    ]);
    
    return result.rows[0];
  }
  
  // =============================================
  // OBTENER TODOS LOS CUPOS
  // =============================================
  static async obtenerTodos(filters = {}) {
    const { 
      periodo_academico_id, 
      grado_id, 
      turno_id,
      solo_activos = true,
      page = 1, 
      limit = 50 
    } = filters;
    
    const offset = (page - 1) * limit;
    
    let whereConditions = [];
    let params = [];
    let paramCount = 1;
    
    if (periodo_academico_id) {
      whereConditions.push(`cp.periodo_academico_id = $${paramCount}`);
      params.push(periodo_academico_id);
      paramCount++;
    }
    
    if (grado_id) {
      whereConditions.push(`cp.grado_id = $${paramCount}`);
      params.push(grado_id);
      paramCount++;
    }
    
    if (turno_id) {
      whereConditions.push(`cp.turno_id = $${paramCount}`);
      params.push(turno_id);
      paramCount++;
    }
    
    if (solo_activos) {
      whereConditions.push('cp.activo = true');
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ') 
      : '';
    
    const countQuery = `
      SELECT COUNT(*) FROM cupo_preinscripcion cp ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    const dataQuery = `
      SELECT 
        cp.*,
        pa.nombre as periodo_nombre,
        g.nombre as grado_nombre,
        t.nombre as turno_nombre,
        na.nombre as nivel_academico_nombre,
        ROUND((cp.cupos_ocupados::decimal / cp.cupos_totales * 100), 2) as porcentaje_ocupacion
      FROM cupo_preinscripcion cp
      LEFT JOIN periodo_academico pa ON cp.periodo_academico_id = pa.id
      LEFT JOIN grado g ON cp.grado_id = g.id
      LEFT JOIN nivel_academico na ON g.nivel_academico_id = na.id
      LEFT JOIN turno t ON cp.turno_id = t.id
      ${whereClause}
      ORDER BY pa.fecha_inicio DESC, na.orden, g.orden, t.nombre
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    const result = await pool.query(dataQuery, [...params, limit, offset]);
    
    return {
      cupos: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }
  
  // =============================================
  // OBTENER POR ID
  // =============================================
  static async obtenerPorId(id) {
    const result = await pool.query(`
      SELECT 
        cp.*,
        pa.nombre as periodo_nombre,
        g.nombre as grado_nombre,
        t.nombre as turno_nombre,
        na.nombre as nivel_academico_nombre,
        ROUND((cp.cupos_ocupados::decimal / cp.cupos_totales * 100), 2) as porcentaje_ocupacion,
        (
          SELECT COUNT(*) 
          FROM pre_inscripcion pi 
          WHERE pi.cupo_preinscripcion_id = cp.id 
            AND pi.deleted_at IS NULL
        ) as preinscripciones_vinculadas
      FROM cupo_preinscripcion cp
      LEFT JOIN periodo_academico pa ON cp.periodo_academico_id = pa.id
      LEFT JOIN grado g ON cp.grado_id = g.id
      LEFT JOIN nivel_academico na ON g.nivel_academico_id = na.id
      LEFT JOIN turno t ON cp.turno_id = t.id
      WHERE cp.id = $1
    `, [id]);
    
    return result.rows[0];
  }
  
  // =============================================
  // ACTUALIZAR CUPO
  // =============================================
  static async actualizar(id, datos) {
    const result = await pool.query(`
      UPDATE cupo_preinscripcion
      SET 
        cupos_totales = COALESCE($1, cupos_totales),
        activo = COALESCE($2, activo),
        observaciones = COALESCE($3, observaciones),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [
      datos.cupos_totales,
      datos.activo,
      datos.observaciones,
      id
    ]);
    
    return result.rows[0];
  }
  
  // =============================================
  // MOTOR DINÁMICO DE CUPOS (INTEGRACIÓN RESERVA ⟷ PREINSCRIPCIÓN)
  // Opción A: Aforo total de paralelos - Regulares confirmados - Hermanos confirmados - Preinscritos activos
  // =============================================
  static async calcularDisponibilidadDinamica({ gradoId, turnoId, periodoAcademicoId, client = null }) {
    const conn = client || pool;

    // 1. Obtener información del periodo académico
    let periodoId = periodoAcademicoId;
    let anioDestino = null;
    let periodoNombre = '';

    if (periodoId) {
      const pRes = await conn.query('SELECT id, nombre, fecha_inicio FROM periodo_academico WHERE id = $1', [periodoId]);
      if (pRes.rows.length > 0) {
        const p = pRes.rows[0];
        periodoNombre = p.nombre;
        const matchYear = p.nombre.match(/\d{4}/);
        anioDestino = matchYear ? parseInt(matchYear[0], 10) : (p.fecha_inicio ? new Date(p.fecha_inicio).getFullYear() : null);
      }
    }

    if (!periodoId) {
      const pSig = await conn.query(`
        SELECT id, nombre, fecha_inicio FROM periodo_academico
        ORDER BY fecha_inicio DESC LIMIT 1
      `);
      if (pSig.rows.length > 0) {
        periodoId = pSig.rows[0].id;
        periodoNombre = pSig.rows[0].nombre;
        const matchYear = pSig.rows[0].nombre.match(/\d{4}/);
        anioDestino = matchYear ? parseInt(matchYear[0], 10) : new Date(pSig.rows[0].fecha_inicio).getFullYear();
      }
    }

    // 2. Nombres de grado y turno
    const [gradoInfoRes, turnoInfoRes] = await Promise.all([
      conn.query('SELECT id, nombre FROM grado WHERE id = $1', [gradoId]),
      conn.query('SELECT id, nombre FROM turno WHERE id = $1', [turnoId]),
    ]);
    const gradoNombre = gradoInfoRes.rows[0]?.nombre || '';
    const turnoNombre = turnoInfoRes.rows[0]?.nombre || '';

    // 3. Aforo total configurado en paralelos
    let aforoTotal = 0;
    let paralelosConfigurados = 0;

    let queryAforo = `
      SELECT COALESCE(SUM(capacidad_maxima), 0)::int as aforo_total, COUNT(*)::int as total_paralelos
      FROM paralelo
      WHERE grado_id = $1 AND turno_id = $2
    `;
    const paramsAforo = [gradoId, turnoId];
    if (anioDestino) {
      queryAforo += ` AND anio = $3`;
      paramsAforo.push(anioDestino);
    }
    const aforoRes = await conn.query(queryAforo, paramsAforo);
    aforoTotal = aforoRes.rows[0]?.aforo_total || 0;
    paralelosConfigurados = aforoRes.rows[0]?.total_paralelos || 0;

    // Si no hay paralelos para ese año exacto, buscar paralelos generales
    if (aforoTotal === 0) {
      const fallbackAforo = await conn.query(`
        SELECT COALESCE(SUM(capacidad_maxima), 0)::int as aforo_total, COUNT(*)::int as total_paralelos
        FROM paralelo WHERE grado_id = $1 AND turno_id = $2
      `, [gradoId, turnoId]);
      aforoTotal = fallbackAforo.rows[0]?.aforo_total || 0;
      paralelosConfigurados = fallbackAforo.rows[0]?.total_paralelos || 0;
    }

    // Si aún es 0, buscar si hay cupos manuales en cupo_preinscripcion
    let cupoFila = null;
    const cupoFilaRes = await conn.query(`
      SELECT * FROM cupo_preinscripcion 
      WHERE grado_id = $1 AND turno_id = $2 AND periodo_academico_id = $3
      LIMIT 1
    `, [gradoId, turnoId, periodoId]);
    if (cupoFilaRes.rows.length > 0) {
      cupoFila = cupoFilaRes.rows[0];
      if (aforoTotal === 0 && cupoFila.cupos_totales > 0) {
        aforoTotal = cupoFila.cupos_totales;
      }
    }

    // 4. Regulares CONFIRMADOS (Opción A: de la tabla reserva_cupo)
    const regConfRes = await conn.query(`
      SELECT COUNT(*)::int as total
      FROM reserva_cupo
      WHERE grado_destino_id = $1 
        AND turno_destino_id = $2 
        AND periodo_academico_id = $3
        AND estado = 'confirmada'
        AND deleted_at IS NULL
    `, [gradoId, turnoId, periodoId]);
    const regularesConfirmados = regConfRes.rows[0]?.total || 0;

    // 5. Hermanos postulantes CONFIRMADOS (de reserva_cupo_hermano)
    const hermConfRes = await conn.query(`
      SELECT COUNT(*)::int as total
      FROM reserva_cupo_hermano
      WHERE grado_solicitado_id = $1 
        AND turno_solicitado_id = $2 
        AND periodo_academico_id = $3
        AND estado = 'confirmada'
        AND deleted_at IS NULL
    `, [gradoId, turnoId, periodoId]);
    const hermanosConfirmados = hermConfRes.rows[0]?.total || 0;

    // 6. Preinscripciones activas de nuevos alumnos (sin contar las que están en espera)
    const preinsRes = await conn.query(`
      SELECT COUNT(*)::int as total
      FROM pre_inscripcion
      WHERE grado_id = $1 
        AND turno_preferido_id = $2 
        AND periodo_academico_id = $3
        AND estado NOT IN ('cancelada', 'rechazada', 'convertida', 'en_espera')
        AND deleted_at IS NULL
    `, [gradoId, turnoId, periodoId]);
    const preinscripcionesActivas = preinsRes.rows[0]?.total || 0;

    // 6.b Preinscripciones en lista de espera
    const preinsEspRes = await conn.query(`
      SELECT COUNT(*)::int as total_espera
      FROM pre_inscripcion
      WHERE grado_id = $1 
        AND turno_preferido_id = $2 
        AND periodo_academico_id = $3
        AND estado = 'en_espera'
        AND deleted_at IS NULL
    `, [gradoId, turnoId, periodoId]);
    const totalEnEspera = preinsEspRes.rows[0]?.total_espera || 0;

    // 7. Cálculo final de cupos disponibles
    const cuposOcupados = regularesConfirmados + hermanosConfirmados + preinscripcionesActivas;
    const cuposDisponibles = Math.max(0, aforoTotal - cuposOcupados);
    const tieneCupos = aforoTotal > 0 && cuposDisponibles > 0;
    const posicionEspera = tieneCupos ? 0 : totalEnEspera + 1;

    // 7.b Verificar si existe un turno alternativo con vacantes
    let turnoAlternativo = null;
    if (!tieneCupos) {
      try {
        const turnosAltRes = await conn.query(`
          SELECT id, nombre FROM turno WHERE id != $1 AND deleted_at IS NULL ORDER BY id ASC
        `, [turnoId]);

        for (const tAlt of turnosAltRes.rows) {
          const aforoAltRes = await conn.query(`
            SELECT COALESCE(SUM(capacidad_maxima), 0)::int as aforo
            FROM paralelo
            WHERE grado_id = $1 AND turno_id = $2 ${anioDestino ? 'AND anio = $3' : ''}
          `, anioDestino ? [gradoId, tAlt.id, anioDestino] : [gradoId, tAlt.id]);
          const aforoAlt = aforoAltRes.rows[0]?.aforo || 0;

          if (aforoAlt > 0) {
            const regAltRes = await conn.query(`
              SELECT COUNT(*)::int as total FROM reserva_cupo
              WHERE grado_destino_id = $1 AND turno_destino_id = $2 AND periodo_academico_id = $3 AND estado = 'confirmada' AND deleted_at IS NULL
            `, [gradoId, tAlt.id, periodoId]);
            const hermAltRes = await conn.query(`
              SELECT COUNT(*)::int as total FROM reserva_cupo_hermano
              WHERE grado_solicitado_id = $1 AND turno_solicitado_id = $2 AND periodo_academico_id = $3 AND estado = 'confirmada' AND deleted_at IS NULL
            `, [gradoId, tAlt.id, periodoId]);
            const preinsAltRes = await conn.query(`
              SELECT COUNT(*)::int as total FROM pre_inscripcion
              WHERE grado_id = $1 AND turno_preferido_id = $2 AND periodo_academico_id = $3 AND estado NOT IN ('cancelada', 'rechazada', 'convertida', 'en_espera') AND deleted_at IS NULL
            `, [gradoId, tAlt.id, periodoId]);

            const ocupadosAlt = (regAltRes.rows[0]?.total || 0) + (hermAltRes.rows[0]?.total || 0) + (preinsAltRes.rows[0]?.total || 0);
            const disponiblesAlt = Math.max(0, aforoAlt - ocupadosAlt);
            if (disponiblesAlt > 0) {
              turnoAlternativo = {
                turno_id: tAlt.id,
                turno_nombre: tAlt.nombre,
                cupos_disponibles: disponiblesAlt
              };
              break;
            }
          }
        }
      } catch (errAlt) {
        console.warn('Error al verificar turno alternativo:', errAlt);
      }
    }

    // 8. Sincronizar registro en cupo_preinscripcion para consistencia en dashboards
    let cupoId = cupoFila?.id || null;
    if (cupoFila) {
      await conn.query(`
        UPDATE cupo_preinscripcion
        SET cupos_totales = $1,
            cupos_ocupados = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [aforoTotal, cuposOcupados, cupoFila.id]);
    } else if (aforoTotal > 0 && periodoId) {
      try {
        const nuevoCupo = await conn.query(`
          INSERT INTO cupo_preinscripcion (
            periodo_academico_id, grado_id, turno_id, cupos_totales, cupos_ocupados, activo
          ) VALUES ($1, $2, $3, $4, $5, true)
          RETURNING id
        `, [periodoId, gradoId, turnoId, aforoTotal, cuposOcupados]);
        cupoId = nuevoCupo.rows[0]?.id || null;
      } catch (errInsert) {
        // En caso de concurrencia o constraint existente
        const buscarDeNuevo = await conn.query(`
          SELECT id FROM cupo_preinscripcion
          WHERE grado_id = $1 AND turno_id = $2 AND periodo_academico_id = $3
          LIMIT 1
        `, [gradoId, turnoId, periodoId]);
        cupoId = buscarDeNuevo.rows[0]?.id || null;
      }
    }

    return {
      id: cupoId,
      cupo_id: cupoId,
      periodo_academico_id: periodoId,
      periodo_nombre: periodoNombre,
      grado_id: gradoId,
      grado_nombre: gradoNombre,
      turno_id: turnoId,
      turno_nombre: turnoNombre,
      aforo_total: aforoTotal,
      cupos_totales: aforoTotal,
      regulares_confirmados: regularesConfirmados,
      hermanos_confirmados: hermanosConfirmados,
      preinscripciones_activas: preinscripcionesActivas,
      total_en_espera: totalEnEspera,
      posicion_espera: posicionEspera,
      turno_alternativo: turnoAlternativo,
      cupos_ocupados: cuposOcupados,
      cupos_disponibles: cuposDisponibles,
      tiene_cupos: tieneCupos,
      total_paralelos: paralelosConfigurados,
      mensaje: tieneCupos
        ? `Hay ${cuposDisponibles} cupo(s) disponible(s)`
        : (aforoTotal === 0
            ? `No hay aforo configurado para este curso. El postulante quedará en Lista de Espera puesto #${posicionEspera}.`
            : `Cupos agotados (${cuposOcupados}/${aforoTotal} ocupados). El postulante quedará en Lista de Espera puesto #${posicionEspera}.`)
    };
  }

  // =============================================
  // VERIFICAR DISPONIBILIDAD (COMPATIBLE)
  // =============================================
  static async verificarDisponibilidad(gradoId, turnoId, periodoAcademicoId) {
    return this.calcularDisponibilidadDinamica({ gradoId, turnoId, periodoAcademicoId });
  }

  // =============================================
  // SINCRONIZAR TODOS LOS CUPOS CON AFOROS Y RESERVAS (1 CLIC - ALTO RENDIMIENTO)
  // =============================================
  static async sincronizarTodos(periodoAcademicoId = null) {
    let periodoId = periodoAcademicoId;
    let anioDestino = null;

    if (periodoId) {
      const pRes = await pool.query('SELECT id, nombre, fecha_inicio FROM periodo_academico WHERE id = $1', [periodoId]);
      if (pRes.rows.length > 0) {
        const p = pRes.rows[0];
        const matchYear = p.nombre.match(/\d{4}/);
        anioDestino = matchYear ? parseInt(matchYear[0], 10) : (p.fecha_inicio ? new Date(p.fecha_inicio).getFullYear() : null);
      }
    }

    if (!periodoId) {
      const pSig = await pool.query(`
        SELECT id, nombre, fecha_inicio FROM periodo_academico
        WHERE permite_inscripciones = true AND deleted_at IS NULL
        ORDER BY fecha_inicio DESC LIMIT 1
      `);
      if (pSig.rows.length === 0) return { total_sincronizados: 0, mensaje: 'No hay periodos académicos activos' };
      periodoId = pSig.rows[0].id;
      const matchYear = pSig.rows[0].nombre.match(/\d{4}/);
      anioDestino = matchYear ? parseInt(matchYear[0], 10) : new Date(pSig.rows[0].fecha_inicio).getFullYear();
    }

    // 1. Obtener aforos de paralelos agrupados por grado y turno
    let queryParalelos = `
      SELECT p.grado_id, p.turno_id, SUM(p.capacidad_maxima)::int as aforo_total
      FROM paralelo p
      WHERE p.activo = true AND p.deleted_at IS NULL
    `;
    const paramsParalelos = [];
    if (anioDestino) {
      queryParalelos += ` AND p.anio = $1`;
      paramsParalelos.push(anioDestino);
    }
    queryParalelos += ` GROUP BY p.grado_id, p.turno_id`;
    const paralelosRes = await pool.query(queryParalelos, paramsParalelos);

    const mapAforo = new Map();
    paralelosRes.rows.forEach(r => {
      mapAforo.set(`${r.grado_id}:${r.turno_id}`, r.aforo_total);
    });

    // Fallback: si no hay paralelos para ese anio exacto, buscar generales
    if (mapAforo.size === 0) {
      const fallParalelos = await pool.query(`
        SELECT p.grado_id, p.turno_id, SUM(p.capacidad_maxima)::int as aforo_total
        FROM paralelo p
        WHERE p.activo = true AND p.deleted_at IS NULL
        GROUP BY p.grado_id, p.turno_id
      `);
      fallParalelos.rows.forEach(r => {
        mapAforo.set(`${r.grado_id}:${r.turno_id}`, r.aforo_total);
      });
    }

    // 2. Regulares confirmados agrupados
    const regRes = await pool.query(`
      SELECT grado_destino_id as grado_id, turno_destino_id as turno_id, COUNT(*)::int as total
      FROM reserva_cupo
      WHERE periodo_academico_id = $1 AND estado = 'confirmada' AND deleted_at IS NULL
      GROUP BY grado_destino_id, turno_destino_id
    `, [periodoId]);
    const mapRegulares = new Map();
    regRes.rows.forEach(r => mapRegulares.set(`${r.grado_id}:${r.turno_id}`, r.total));

    // 3. Hermanos confirmados agrupados
    const hermRes = await pool.query(`
      SELECT grado_solicitado_id as grado_id, turno_solicitado_id as turno_id, COUNT(*)::int as total
      FROM reserva_cupo_hermano
      WHERE periodo_academico_id = $1 AND estado = 'confirmada' AND deleted_at IS NULL
      GROUP BY grado_solicitado_id, turno_solicitado_id
    `, [periodoId]);
    const mapHermanos = new Map();
    hermRes.rows.forEach(r => mapHermanos.set(`${r.grado_id}:${r.turno_id}`, r.total));

    // 4. Preinscritos activos agrupados
    const preinsRes = await pool.query(`
      SELECT grado_id, turno_preferido_id as turno_id, COUNT(*)::int as total
      FROM pre_inscripcion
      WHERE periodo_academico_id = $1 AND estado NOT IN ('cancelada', 'rechazada', 'convertida', 'en_espera') AND deleted_at IS NULL
      GROUP BY grado_id, turno_preferido_id
    `, [periodoId]);
    const mapPreins = new Map();
    preinsRes.rows.forEach(r => mapPreins.set(`${r.grado_id}:${r.turno_id}`, r.total));

    // 5. Todos los grados y turnos existentes
    const todasCombos = await pool.query(`
      SELECT g.id as grado_id, t.id as turno_id
      FROM grado g
      CROSS JOIN turno t
      WHERE g.deleted_at IS NULL AND t.deleted_at IS NULL
      ORDER BY g.orden, g.id, t.id
    `);

    // 6. Ejecutar UPSERT atómico en una sola transacción
    const client = await pool.connect();
    let totalSincronizados = 0;
    try {
      await client.query('BEGIN');

      for (const row of todasCombos.rows) {
        const key = `${row.grado_id}:${row.turno_id}`;
        const aforo = mapAforo.get(key) || 25;
        const ocupados = (mapRegulares.get(key) || 0) + (mapHermanos.get(key) || 0) + (mapPreins.get(key) || 0);
        const disponibles = Math.max(0, aforo - ocupados);

        await client.query(`
          INSERT INTO cupo_preinscripcion (
            periodo_academico_id, grado_id, turno_id, cupos_totales, cupos_ocupados, activo, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, true, NOW())
          ON CONFLICT (periodo_academico_id, grado_id, turno_id)
          DO UPDATE SET 
            cupos_totales = EXCLUDED.cupos_totales,
            cupos_ocupados = EXCLUDED.cupos_ocupados,
            activo = true,
            updated_at = NOW()
        `, [periodoId, row.grado_id, row.turno_id, aforo, ocupados]);

        totalSincronizados++;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return {
      periodo_academico_id: periodoId,
      total_sincronizados: totalSincronizados,
    };
  }
  
  // =============================================
  // OBTENER RESUMEN DE CUPOS POR PERIODO
  // =============================================
  static async obtenerResumenPorPeriodo(periodoAcademicoId) {
    const result = await pool.query(`
      SELECT 
        na.nombre as nivel_academico,
        g.nombre as grado,
        t.nombre as turno,
        cp.cupos_totales,
        cp.cupos_ocupados,
        cp.cupos_disponibles,
        ROUND((cp.cupos_ocupados::decimal / cp.cupos_totales * 100), 2) as porcentaje_ocupacion,
        cp.activo
      FROM cupo_preinscripcion cp
      INNER JOIN grado g ON cp.grado_id = g.id
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      INNER JOIN turno t ON cp.turno_id = t.id
      WHERE cp.periodo_academico_id = $1
      ORDER BY na.orden, g.orden, t.nombre
    `, [periodoAcademicoId]);
    
    // Agrupar por nivel académico
    const resumen = {};
    
    result.rows.forEach(row => {
      if (!resumen[row.nivel_academico]) {
        resumen[row.nivel_academico] = {
          nivel: row.nivel_academico,
          grados: []
        };
      }
      
      resumen[row.nivel_academico].grados.push({
        grado: row.grado,
        turno: row.turno,
        cupos_totales: row.cupos_totales,
        cupos_ocupados: row.cupos_ocupados,
        cupos_disponibles: row.cupos_disponibles,
        porcentaje_ocupacion: parseFloat(row.porcentaje_ocupacion),
        activo: row.activo
      });
    });
    
    return Object.values(resumen);
  }
  
  // =============================================
  // ELIMINAR CUPO
  // =============================================
  static async eliminar(id) {
    // Verificar que no tenga preinscripciones activas
    const checkResult = await pool.query(`
      SELECT COUNT(*) 
      FROM pre_inscripcion 
      WHERE cupo_preinscripcion_id = $1 
        AND estado NOT IN ('cancelada', 'rechazada', 'convertida')
        AND deleted_at IS NULL
    `, [id]);
    
    const preinscripcionesActivas = parseInt(checkResult.rows[0].count);
    
    if (preinscripcionesActivas > 0) {
      throw new Error(`No se puede eliminar el cupo porque tiene ${preinscripcionesActivas} preinscripción(es) activa(s)`);
    }
    
    const result = await pool.query(
      'DELETE FROM cupo_preinscripcion WHERE id = $1 RETURNING *',
      [id]
    );
    
    return result.rows[0];
  }
}

export { CupoPreinscripcion };