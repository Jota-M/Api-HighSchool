// models/ReservaCupo.js
import { pool } from '../db/pool.js';

class ReservaCupo {
  /**
   * Obtiene el periodo académico de la siguiente gestión (Gestión 2027)
   */
  static async obtenerPeriodoSiguiente() {
    // 1. Buscar periodo con año 2027
    const result2027 = await pool.query(`
      SELECT id, nombre, TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio, TO_CHAR(fecha_fin, 'YYYY-MM-DD') as fecha_fin, activo
      FROM periodo_academico
      WHERE nombre ILIKE '%2027%'
      ORDER BY fecha_inicio ASC
      LIMIT 1
    `);

    if (result2027.rows.length > 0) {
      return result2027.rows[0];
    }

    // 2. Si no existe explícitamente 2027, tomar el periodo con fecha de inicio más futura
    const resultFuturo = await pool.query(`
      SELECT id, nombre, TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio, TO_CHAR(fecha_fin, 'YYYY-MM-DD') as fecha_fin, activo
      FROM periodo_academico
      ORDER BY fecha_inicio DESC
      LIMIT 1
    `);

    return resultFuturo.rows[0];
  }

  /**
   * Valida un estudiante regular ingresando ÚNICAMENTE su CI
   */
  static async validarEstudiantePorCI(ci) {
    const ciLimpio = (ci || '').trim();

    if (!ciLimpio) {
      return {
        valido: false,
        error_tipo: 'CI_REQUERIDO',
        mensaje: 'Debe ingresar el Carnet de Identidad (CI) del estudiante'
      };
    }

    // Buscar estudiante por CI (limpiando posibles extensiones o espacios)
    const estudianteResult = await pool.query(`
      SELECT id, codigo, nombres, apellido_paterno, apellido_materno, ci, fecha_nacimiento, foto_url, telefono, email
      FROM estudiante
      WHERE TRIM(ci) ILIKE $1 AND deleted_at IS NULL AND activo = true
      ORDER BY id DESC
      LIMIT 1
    `, [ciLimpio]);

    if (estudianteResult.rows.length === 0) {
      return {
        valido: false,
        error_tipo: 'ESTUDIANTE_NO_ENCONTRADO',
        mensaje: `No se encontró ningún estudiante regular activo con el CI "${ciLimpio}". Verifique el número ingresado.`
      };
    }

    const estudiante = estudianteResult.rows[0];

    // Obtener la última matrícula (gestión más reciente del estudiante)
    const matriculaResult = await pool.query(`
      SELECT 
        m.id as matricula_id,
        m.estado as matricula_estado,
        pa.id as periodo_actual_id,
        pa.nombre as periodo_actual_nombre,
        pa.fecha_inicio as periodo_actual_fecha_inicio,
        g.id as grado_actual_id,
        g.nombre as grado_actual_nombre,
        g.orden as grado_actual_orden,
        na.id as nivel_actual_id,
        na.nombre as nivel_actual_nombre,
        na.orden as nivel_actual_orden,
        p.id as paralelo_actual_id,
        p.nombre as paralelo_actual_nombre,
        t.id as turno_actual_id,
        t.nombre as turno_actual_nombre
      FROM matricula m
      INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
      INNER JOIN paralelo p ON m.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      LEFT JOIN turno t ON p.turno_id = t.id
      WHERE m.estudiante_id = $1 AND m.deleted_at IS NULL
      ORDER BY pa.fecha_inicio DESC
      LIMIT 1
    `, [estudiante.id]);

    if (matriculaResult.rows.length === 0) {
      return {
        valido: false,
        error_tipo: 'NO_ES_REGULAR',
        mensaje: `El estudiante ${estudiante.nombres} ${estudiante.apellido_paterno} no cuenta con matrícula previa en el colegio (solo aplica a estudiantes regulares).`
      };
    }

    const ultimaMatricula = matriculaResult.rows[0];

    // Periodo destino: Gestión 2027
    const periodoDestino = await ReservaCupo.obtenerPeriodoSiguiente();

    if (!periodoDestino) {
      return {
        valido: false,
        error_tipo: 'SIN_PERIODO_DESTINO',
        mensaje: 'Aún no se ha configurado la Gestión 2027 en el sistema.'
      };
    }

    // Verificar si el estudiante ya tiene una reserva en la Gestión 2027
    const reservaExistente = await ReservaCupo.obtenerPorEstudianteYPeriodo(estudiante.id, periodoDestino.id);
    if (reservaExistente) {
      return {
        valido: true,
        ya_reservado: true,
        reserva: reservaExistente,
        mensaje: `El estudiante ya tiene su cupo reservado para ${periodoDestino.nombre}`
      };
    }

    // Determinar el Grado Siguiente en la progresión curricular
    const gradoSiguienteResult = await pool.query(`
      SELECT g.id, g.nombre, g.orden, na.id as nivel_id, na.nombre as nivel_nombre, na.orden as nivel_orden
      FROM grado g
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      WHERE (na.orden > $1) OR (na.orden = $1 AND g.orden > $2)
      ORDER BY na.orden ASC, g.orden ASC
      LIMIT 1
    `, [ultimaMatricula.nivel_actual_orden, ultimaMatricula.grado_actual_orden]);

    if (gradoSiguienteResult.rows.length === 0) {
      return {
        valido: false,
        error_tipo: 'BACHILLER_EGRESADO',
        mensaje: `El estudiante cursa ${ultimaMatricula.grado_actual_nombre}, que es el último grado del colegio (Promoción/Bachiller). No requiere reserva escolar.`
      };
    }

    const gradoDestino = gradoSiguienteResult.rows[0];

    // Obtener los turnos disponibles (Sin mostrar números de cupos, solo los turnos disponibles)
    const turnosResult = await pool.query(`
      SELECT t.id, t.nombre, t.hora_inicio, t.hora_fin
      FROM turno t
      ORDER BY t.hora_inicio ASC
    `);

    const turnosDisponibles = turnosResult.rows.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
      es_turno_actual: t.id === ultimaMatricula.turno_actual_id
    }));

    return {
      valido: true,
      ya_reservado: false,
      estudiante: {
        id: estudiante.id,
        codigo: estudiante.codigo,
        ci: estudiante.ci,
        nombre_completo: `${estudiante.nombres} ${estudiante.apellido_paterno} ${estudiante.apellido_materno || ''}`.trim(),
        nombres: estudiante.nombres,
        apellido_paterno: estudiante.apellido_paterno,
        apellido_materno: estudiante.apellido_materno,
        foto_url: estudiante.foto_url
      },
      gestion_actual: {
        periodo_id: ultimaMatricula.periodo_actual_id,
        periodo_nombre: ultimaMatricula.periodo_actual_nombre,
        grado_id: ultimaMatricula.grado_actual_id,
        grado_nombre: ultimaMatricula.grado_actual_nombre,
        nivel_nombre: ultimaMatricula.nivel_actual_nombre,
        paralelo_nombre: ultimaMatricula.paralelo_actual_nombre,
        turno_id: ultimaMatricula.turno_actual_id,
        turno_nombre: ultimaMatricula.turno_actual_nombre
      },
      proyeccion_siguiente: {
        periodo_id: periodoDestino.id,
        periodo_nombre: periodoDestino.nombre,
        grado_id: gradoDestino.id,
        grado_nombre: gradoDestino.nombre,
        nivel_nombre: gradoDestino.nivel_nombre,
        turnos_disponibles: turnosDisponibles,
        turno_sugerido_id: ultimaMatricula.turno_actual_id || turnosDisponibles[0]?.id
      }
    };
  }

  /**
   * Crea reserva para múltiples estudiantes en una sola transacción
   */
  static async crearReservaMultiple(datos) {
    const {
      estudiantes, // Array de { estudiante_id, grado_actual_id, grado_destino_id, turno_destino_id }
      periodo_academico_id,
      tutor_nombre,
      tutor_ci,
      tutor_parentesco,
      tutor_telefono,
      observaciones
    } = datos;

    if (!estudiantes || !Array.isArray(estudiantes) || estudiantes.length === 0) {
      throw new Error('Debe proporcionar al menos un estudiante para la reserva');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Obtener año del periodo para prefijo (ej: 2027)
      const periodoQuery = await client.query('SELECT nombre FROM periodo_academico WHERE id = $1', [periodo_academico_id]);
      const periodoNombre = periodoQuery.rows[0]?.nombre || '';
      const yearMatch = periodoNombre.match(/\d{4}/);
      const anioPrefijo = yearMatch ? yearMatch[0] : '2027';

      // Bloquear tabla para correlativos
      await client.query('LOCK TABLE reserva_cupo IN SHARE ROW EXCLUSIVE MODE');

      // Buscar último correlativo para ese año
      const ultimoCodigoResult = await client.query(`
        SELECT codigo_reserva
        FROM reserva_cupo
        WHERE codigo_reserva LIKE $1
        ORDER BY id DESC
        LIMIT 1
      `, [`RES-${anioPrefijo}-%`]);

      let siguienteNum = 1;
      if (ultimoCodigoResult.rows.length > 0) {
        const partes = ultimoCodigoResult.rows[0].codigo_reserva.split('-');
        const ultNum = parseInt(partes[partes.length - 1], 10);
        if (!isNaN(ultNum)) {
          siguienteNum = ultNum + 1;
        }
      }

      const reservasCreadas = [];

      for (const est of estudiantes) {
        // Verificar si ya existe reserva para este estudiante y periodo
        const checkExistente = await client.query(`
          SELECT id, codigo_reserva, codigo_recibo
          FROM reserva_cupo
          WHERE estudiante_id = $1 AND periodo_academico_id = $2 AND deleted_at IS NULL
        `, [est.estudiante_id, periodo_academico_id]);

        if (checkExistente.rows.length > 0) {
          // Ya tiene reserva -> saltar o registrar
          const resExist = await ReservaCupo.obtenerPorId(checkExistente.rows[0].id);
          reservasCreadas.push(resExist);
          continue;
        }

        const seqStr = siguienteNum.toString().padStart(4, '0');
        const codigoReserva = `RES-${anioPrefijo}-${seqStr}`;
        const codigoRecibo = `REC-RES-${anioPrefijo}-${seqStr}`;
        siguienteNum++;

        const insertResult = await client.query(`
          INSERT INTO reserva_cupo (
            codigo_reserva,
            codigo_recibo,
            estudiante_id,
            periodo_academico_id,
            grado_actual_id,
            grado_destino_id,
            turno_destino_id,
            tutor_nombre,
            tutor_ci,
            tutor_parentesco,
            tutor_telefono,
            observaciones,
            estado,
            fecha_reserva
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmada', NOW())
          RETURNING id
        `, [
          codigoReserva,
          codigoRecibo,
          est.estudiante_id,
          periodo_academico_id,
          est.grado_actual_id || null,
          est.grado_destino_id,
          est.turno_destino_id,
          tutor_nombre.trim(),
          tutor_ci.trim(),
          tutor_parentesco.trim(),
          tutor_telefono.trim(),
          observaciones ? observaciones.trim() : null
        ]);

        const nuevaId = insertResult.rows[0].id;
        const reservaCompleta = await ReservaCupo.obtenerPorId(nuevaId, client);
        reservasCreadas.push(reservaCompleta);
      }

      await client.query('COMMIT');

      return {
        exito: true,
        reservas: reservasCreadas,
        cantidad: reservasCreadas.length,
        mensaje: `¡Se confirmó la reserva de cupo para ${reservasCreadas.length} estudiante(s) con éxito!`
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene la reserva completa por ID con todos los joins necesarios para el recibo
   */
  static async obtenerPorId(id, client = null) {
    const conn = client || pool;
    const query = `
      SELECT 
        r.*,
        TO_CHAR(r.fecha_reserva, 'DD/MM/YYYY HH24:MI') as fecha_reserva_formateada,
        TO_CHAR(r.fecha_reserva, 'YYYY-MM-DD') as fecha_reserva_corta,
        e.codigo as estudiante_codigo,
        e.ci as estudiante_ci,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        TRIM(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''))) as estudiante_nombre_completo,
        e.foto_url as estudiante_foto_url,
        pa.nombre as periodo_nombre,
        ga.nombre as grado_actual_nombre,
        gd.nombre as grado_destino_nombre,
        nd.nombre as nivel_destino_nombre,
        td.nombre as turno_destino_nombre,
        td.hora_inicio as turno_hora_inicio,
        td.hora_fin as turno_hora_fin
      FROM reserva_cupo r
      INNER JOIN estudiante e ON r.estudiante_id = e.id
      INNER JOIN periodo_academico pa ON r.periodo_academico_id = pa.id
      LEFT JOIN grado ga ON r.grado_actual_id = ga.id
      INNER JOIN grado gd ON r.grado_destino_id = gd.id
      INNER JOIN nivel_academico nd ON gd.nivel_academico_id = nd.id
      INNER JOIN turno td ON r.turno_destino_id = td.id
      WHERE r.id = $1 AND r.deleted_at IS NULL
    `;
    const result = await conn.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Obtiene la reserva completa por código de reserva o código de recibo
   */
  static async obtenerPorCodigo(codigo) {
    const query = `
      SELECT 
        r.*,
        TO_CHAR(r.fecha_reserva, 'DD/MM/YYYY HH24:MI') as fecha_reserva_formateada,
        TO_CHAR(r.fecha_reserva, 'YYYY-MM-DD') as fecha_reserva_corta,
        e.codigo as estudiante_codigo,
        e.ci as estudiante_ci,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        TRIM(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''))) as estudiante_nombre_completo,
        e.foto_url as estudiante_foto_url,
        pa.nombre as periodo_nombre,
        ga.nombre as grado_actual_nombre,
        gd.nombre as grado_destino_nombre,
        nd.nombre as nivel_destino_nombre,
        td.nombre as turno_destino_nombre,
        td.hora_inicio as turno_hora_inicio,
        td.hora_fin as turno_hora_fin
      FROM reserva_cupo r
      INNER JOIN estudiante e ON r.estudiante_id = e.id
      INNER JOIN periodo_academico pa ON r.periodo_academico_id = pa.id
      LEFT JOIN grado ga ON r.grado_actual_id = ga.id
      INNER JOIN grado gd ON r.grado_destino_id = gd.id
      INNER JOIN nivel_academico nd ON gd.nivel_academico_id = nd.id
      INNER JOIN turno td ON r.turno_destino_id = td.id
      WHERE (r.codigo_reserva = $1 OR r.codigo_recibo = $1) AND r.deleted_at IS NULL
    `;
    const result = await pool.query(query, [codigo.trim()]);
    return result.rows[0] || null;
  }

  /**
   * Obtiene la reserva activa de un estudiante para un periodo
   */
  static async obtenerPorEstudianteYPeriodo(estudianteId, periodoId) {
    const query = `
      SELECT 
        r.*,
        TO_CHAR(r.fecha_reserva, 'DD/MM/YYYY HH24:MI') as fecha_reserva_formateada,
        TO_CHAR(r.fecha_reserva, 'YYYY-MM-DD') as fecha_reserva_corta,
        e.codigo as estudiante_codigo,
        e.ci as estudiante_ci,
        e.nombres as estudiante_nombres,
        e.apellido_paterno as estudiante_apellido_paterno,
        e.apellido_materno as estudiante_apellido_materno,
        TRIM(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''))) as estudiante_nombre_completo,
        e.foto_url as estudiante_foto_url,
        pa.nombre as periodo_nombre,
        ga.nombre as grado_actual_nombre,
        gd.nombre as grado_destino_nombre,
        nd.nombre as nivel_destino_nombre,
        td.nombre as turno_destino_nombre,
        td.hora_inicio as turno_hora_inicio,
        td.hora_fin as turno_hora_fin
      FROM reserva_cupo r
      INNER JOIN estudiante e ON r.estudiante_id = e.id
      INNER JOIN periodo_academico pa ON r.periodo_academico_id = pa.id
      LEFT JOIN grado ga ON r.grado_actual_id = ga.id
      INNER JOIN grado gd ON r.grado_destino_id = gd.id
      INNER JOIN nivel_academico nd ON gd.nivel_academico_id = nd.id
      INNER JOIN turno td ON r.turno_destino_id = td.id
      WHERE r.estudiante_id = $1 AND r.periodo_academico_id = $2 AND r.deleted_at IS NULL
    `;
    const result = await pool.query(query, [estudianteId, periodoId]);
    return result.rows[0] || null;
  }

  /**
   * Listar reservas para el panel administrativo
   */
  static async listar(filtros = {}) {
    const {
      periodo_academico_id,
      grado_destino_id,
      nivel_destino_id,
      turno_destino_id,
      estado,
      search,
      page = 1,
      limit = 20
    } = filtros;

    const offset = (page - 1) * limit;
    const whereConditions = ['r.deleted_at IS NULL'];
    const params = [];
    let paramCounter = 1;

    if (periodo_academico_id) {
      whereConditions.push(`r.periodo_academico_id = $${paramCounter}`);
      params.push(periodo_academico_id);
      paramCounter++;
    }

    if (grado_destino_id) {
      whereConditions.push(`r.grado_destino_id = $${paramCounter}`);
      params.push(grado_destino_id);
      paramCounter++;
    }

    if (nivel_destino_id) {
      whereConditions.push(`nd.id = $${paramCounter}`);
      params.push(nivel_destino_id);
      paramCounter++;
    }

    if (turno_destino_id) {
      whereConditions.push(`r.turno_destino_id = $${paramCounter}`);
      params.push(turno_destino_id);
      paramCounter++;
    }

    if (estado) {
      whereConditions.push(`r.estado = $${paramCounter}`);
      params.push(estado);
      paramCounter++;
    }

    if (search) {
      whereConditions.push(`(
        e.nombres ILIKE $${paramCounter} OR
        e.apellido_paterno ILIKE $${paramCounter} OR
        e.apellido_materno ILIKE $${paramCounter} OR
        e.ci ILIKE $${paramCounter} OR
        r.codigo_reserva ILIKE $${paramCounter} OR
        r.tutor_nombre ILIKE $${paramCounter} OR
        r.tutor_telefono ILIKE $${paramCounter}
      )`);
      params.push(`%${search}%`);
      paramCounter++;
    }

    const whereClause = whereConditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*) as total
      FROM reserva_cupo r
      INNER JOIN estudiante e ON r.estudiante_id = e.id
      INNER JOIN grado gd ON r.grado_destino_id = gd.id
      INNER JOIN nivel_academico nd ON gd.nivel_academico_id = nd.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total || 0, 10);

    const dataQuery = `
      SELECT 
        r.*,
        TO_CHAR(r.fecha_reserva, 'DD/MM/YYYY HH24:MI') as fecha_reserva_formateada,
        e.codigo as estudiante_codigo,
        e.ci as estudiante_ci,
        TRIM(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''))) as estudiante_nombre_completo,
        pa.nombre as periodo_nombre,
        ga.nombre as grado_actual_nombre,
        gd.nombre as grado_destino_nombre,
        nd.nombre as nivel_destino_nombre,
        td.nombre as turno_destino_nombre
      FROM reserva_cupo r
      INNER JOIN estudiante e ON r.estudiante_id = e.id
      INNER JOIN periodo_academico pa ON r.periodo_academico_id = pa.id
      LEFT JOIN grado ga ON r.grado_actual_id = ga.id
      INNER JOIN grado gd ON r.grado_destino_id = gd.id
      INNER JOIN nivel_academico nd ON gd.nivel_academico_id = nd.id
      INNER JOIN turno td ON r.turno_destino_id = td.id
      WHERE ${whereClause}
      ORDER BY r.fecha_reserva DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    params.push(limit, offset);
    const dataResult = await pool.query(dataQuery, params);

    return {
      reservas: dataResult.rows,
      paginacion: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Estadísticas generales de reservas de cupo para el dashboard administrativo
   */
  static async obtenerEstadisticas(periodoId = null) {
    let wherePeriodo = '';
    const params = [];
    if (periodoId) {
      wherePeriodo = 'AND r.periodo_academico_id = $1';
      params.push(periodoId);
    }

    const queryResumen = `
      SELECT 
        COUNT(*)::int as total_reservas,
        COUNT(CASE WHEN nd.nombre ILIKE '%inicial%' THEN 1 END)::int as total_inicial,
        COUNT(CASE WHEN nd.nombre ILIKE '%primaria%' THEN 1 END)::int as total_primaria,
        COUNT(CASE WHEN nd.nombre ILIKE '%secundaria%' THEN 1 END)::int as total_secundaria
      FROM reserva_cupo r
      INNER JOIN grado gd ON r.grado_destino_id = gd.id
      INNER JOIN nivel_academico nd ON gd.nivel_academico_id = nd.id
      WHERE r.deleted_at IS NULL ${wherePeriodo}
    `;

    const queryPorGrado = `
      SELECT 
        gd.id as grado_id,
        gd.nombre as grado_nombre,
        nd.nombre as nivel_nombre,
        COUNT(r.id)::int as total_reservados
      FROM grado gd
      INNER JOIN nivel_academico nd ON gd.nivel_academico_id = nd.id
      LEFT JOIN reserva_cupo r ON r.grado_destino_id = gd.id AND r.deleted_at IS NULL ${wherePeriodo ? 'AND r.periodo_academico_id = $1' : ''}
      GROUP BY gd.id, gd.nombre, nd.nombre, gd.orden
      ORDER BY gd.orden ASC
    `;

    const resumenRes = await pool.query(queryResumen, params);
    const porGradoRes = await pool.query(queryPorGrado, params);

    return {
      resumen: resumenRes.rows[0] || {
        total_reservas: 0,
        total_inicial: 0,
        total_primaria: 0,
        total_secundaria: 0
      },
      por_grado: porGradoRes.rows || []
    };
  }
}

export default ReservaCupo;
