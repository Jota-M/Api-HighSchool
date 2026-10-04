// models/ReservaCupoHermano.js
import { pool } from '../db/pool.js';
import ReservaCupo from './ReservaCupo.js';

class ReservaCupoHermano {
  /**
   * Obtiene el grado curricular anterior a un grado dado
   */
  static async obtenerGradoAnterior(gradoId, client = null) {
    const conn = client || pool;
    const gradoActualResult = await conn.query(`
      SELECT g.id, g.nombre, g.orden, na.id as nivel_id, na.orden as nivel_orden
      FROM grado g
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      WHERE g.id = $1
    `, [gradoId]);

    if (gradoActualResult.rows.length === 0) return null;
    const gActual = gradoActualResult.rows[0];

    const gradoAntResult = await conn.query(`
      SELECT g.id, g.nombre, g.orden, na.id as nivel_id, na.nombre as nivel_nombre
      FROM grado g
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      WHERE (na.orden < $1) OR (na.orden = $1 AND g.orden < $2)
      ORDER BY na.orden DESC, g.orden DESC
      LIMIT 1
    `, [gActual.nivel_orden, gActual.orden]);

    return gradoAntResult.rows[0] || null;
  }

  /**
   * Calcula la disponibilidad de cupos nativos y estado de lista de espera
   * para un hermano en un grado y turno específico para la siguiente gestión (2027)
   */
  static async consultarDisponibilidad({ gradoId, turnoId, periodoId = null, client = null }) {
    const conn = client || pool;

    // 1. Obtener periodo académico si no viene dado
    let periodo = null;
    if (periodoId) {
      const pRes = await conn.query('SELECT id, nombre FROM periodo_academico WHERE id = $1', [periodoId]);
      periodo = pRes.rows[0];
    } else {
      periodo = await ReservaCupo.obtenerPeriodoSiguiente();
    }

    if (!periodo) {
      throw new Error('No se encontró el periodo académico de destino (Gestión 2027)');
    }

    const yearMatch = periodo.nombre.match(/\d{4}/);
    const anioDestino = yearMatch ? parseInt(yearMatch[0], 10) : 2027;
    const anioActual = anioDestino - 1;

    // 2. Aforo total de paralelos para el grado y turno en 2027
    const aforoRes = await conn.query(`
      SELECT COALESCE(SUM(capacidad_maxima), 0)::int as aforo_total, COUNT(*)::int as total_paralelos
      FROM paralelo
      WHERE grado_id = $1 AND turno_id = $2 AND anio = $3
    `, [gradoId, turnoId, anioDestino]);

    const aforoTotal = aforoRes.rows[0]?.aforo_total || 0;
    const totalParalelos = aforoRes.rows[0]?.total_paralelos || 0;

    // 3. Regulares proyectados (protegidos): vienen del grado anterior matriculados en el año actual (2026) con ese turno
    const gradoAnterior = await this.obtenerGradoAnterior(gradoId, conn);
    let regularesProyectados = 0;

    if (gradoAnterior) {
      // Buscar periodo del año actual (ej. 2026)
      const periodoActualRes = await conn.query(`
        SELECT id FROM periodo_academico WHERE nombre ILIKE $1 LIMIT 1
      `, [`%${anioActual}%`]);
      const periodoActualId = periodoActualRes.rows[0]?.id;

      if (periodoActualId) {
        // Estudiantes matriculados activos en el grado anterior con ese turno
        const regRes = await conn.query(`
          SELECT COUNT(DISTINCT m.estudiante_id)::int as total_regulares
          FROM matricula m
          INNER JOIN paralelo p ON m.paralelo_id = p.id
          INNER JOIN estudiante e ON m.estudiante_id = e.id
          WHERE p.grado_id = $1 
            AND p.turno_id = $2 
            AND m.periodo_academico_id = $3
            AND m.estado = 'activo'
            AND m.deleted_at IS NULL
            AND e.activo = true
            AND e.deleted_at IS NULL
        `, [gradoAnterior.id, turnoId, periodoActualId]);

        regularesProyectados = regRes.rows[0]?.total_regulares || 0;
      }
    }

    // 4. Hermanos ya confirmados para ese grado, turno y periodo
    const hermanosConfRes = await conn.query(`
      SELECT COUNT(*)::int as total_confirmados
      FROM reserva_cupo_hermano
      WHERE grado_solicitado_id = $1 
        AND turno_solicitado_id = $2 
        AND periodo_academico_id = $3
        AND estado = 'confirmada'
        AND deleted_at IS NULL
    `, [gradoId, turnoId, periodo.id]);

    const hermanosConfirmados = hermanosConfRes.rows[0]?.total_confirmados || 0;

    // 5. Hermanos en lista de espera
    const hermanosEspRes = await conn.query(`
      SELECT COUNT(*)::int as total_espera
      FROM reserva_cupo_hermano
      WHERE grado_solicitado_id = $1 
        AND turno_solicitado_id = $2 
        AND periodo_academico_id = $3
        AND estado = 'en_espera'
        AND deleted_at IS NULL
    `, [gradoId, turnoId, periodo.id]);

    const totalEnEspera = hermanosEspRes.rows[0]?.total_espera || 0;

    // 6. Cálculo de cupos nativos libres (protegiendo el 100% de los regulares)
    // Si aforo es 0 (no hay paralelo configurado), por defecto no hay cupo
    const cuposDisponibles = Math.max(0, aforoTotal - regularesProyectados - hermanosConfirmados);
    const tieneCupoInmediato = cuposDisponibles > 0;
    const estadoAsignacion = tieneCupoInmediato ? 'confirmada' : 'en_espera';
    const posicionEspera = tieneCupoInmediato ? 0 : totalEnEspera + 1;

    // 7. Evaluar disponibilidad en el turno alternativo (para sugerir al padre si el elegido está lleno)
    const turnosRes = await conn.query('SELECT id, nombre FROM turno WHERE id != $1 ORDER BY id ASC', [turnoId]);
    const turnoAlternativoInfo = [];

    for (const tAlt of turnosRes.rows) {
      const aforoAltRes = await conn.query(`
        SELECT COALESCE(SUM(capacidad_maxima), 0)::int as aforo_total
        FROM paralelo
        WHERE grado_id = $1 AND turno_id = $2 AND anio = $3
      `, [gradoId, tAlt.id, anioDestino]);

      const aforoAlt = aforoAltRes.rows[0]?.aforo_total || 0;
      let regAlt = 0;

      if (gradoAnterior) {
        const periodoActualRes = await conn.query(`
          SELECT id FROM periodo_academico WHERE nombre ILIKE $1 LIMIT 1
        `, [`%${anioActual}%`]);
        const periodoActualId = periodoActualRes.rows[0]?.id;

        if (periodoActualId) {
          const regAltRes = await conn.query(`
            SELECT COUNT(DISTINCT m.estudiante_id)::int as total_regulares
            FROM matricula m
            INNER JOIN paralelo p ON m.paralelo_id = p.id
            INNER JOIN estudiante e ON m.estudiante_id = e.id
            WHERE p.grado_id = $1 
              AND p.turno_id = $2 
              AND m.periodo_academico_id = $3
              AND m.estado = 'activo'
              AND m.deleted_at IS NULL
              AND e.activo = true
              AND e.deleted_at IS NULL
          `, [gradoAnterior.id, tAlt.id, periodoActualId]);
          regAlt = regAltRes.rows[0]?.total_regulares || 0;
        }
      }

      const hermAltConfRes = await conn.query(`
        SELECT COUNT(*)::int as total_confirmados
        FROM reserva_cupo_hermano
        WHERE grado_solicitado_id = $1 
          AND turno_solicitado_id = $2 
          AND periodo_academico_id = $3
          AND estado = 'confirmada'
          AND deleted_at IS NULL
      `, [gradoId, tAlt.id, periodo.id]);
      const hermAltConf = hermAltConfRes.rows[0]?.total_confirmados || 0;

      const cuposAlt = Math.max(0, aforoAlt - regAlt - hermAltConf);

      turnoAlternativoInfo.push({
        turno_id: tAlt.id,
        turno_nombre: tAlt.nombre,
        tiene_cupo_inmediato: cuposAlt > 0,
        cupos_disponibles: cuposAlt
      });
    }

    return {
      periodo_id: periodo.id,
      periodo_nombre: periodo.nombre,
      grado_id: gradoId,
      turno_id: turnoId,
      aforo_total: aforoTotal,
      regulares_protegidos: regularesProyectados,
      hermanos_confirmados: hermanosConfirmados,
      total_en_espera: totalEnEspera,
      cupos_disponibles: cuposDisponibles,
      tiene_cupo_inmediato: tieneCupoInmediato,
      estado_asignacion: estadoAsignacion,
      posicion_espera: posicionEspera,
      turno_alternativo: turnoAlternativoInfo[0] || null,

      mensaje: tieneCupoInmediato
        ? `¡Hay ${cuposDisponibles} cupo(s) disponible(s) para este grado y turno!`
        : `Actualmente no hay cupos disponibles. Al finalizar la inscripción de estudiantes regulares, podrían liberarse algunos cupos. Tu hijo/a quedará en Lista de Espera con Prioridad Familiar, puesto N.º ${posicionEspera}.`
    };
  }

  /**
   * Crea un registro de hermano en reserva_cupo_hermano dentro de una transacción activa
   */
  static async crearReservaHermanoTransaccional(datosHermano, client) {
    const {
      hermano_regular_id,
      periodo_academico_id,
      grado_solicitado_id,
      turno_solicitado_id,
      nombres,
      apellido_paterno,
      apellido_materno,
      ci,
      fecha_nacimiento,
      genero,
      tutor_nombre,
      tutor_ci,
      tutor_parentesco,
      tutor_telefono,
      observaciones
    } = datosHermano;

    // Año del periodo para prefijo (ej: 2027)
    const periodoQuery = await client.query('SELECT nombre FROM periodo_academico WHERE id = $1', [periodo_academico_id]);
    const periodoNombre = periodoQuery.rows[0]?.nombre || '';
    const yearMatch = periodoNombre.match(/\d{4}/);
    const anioPrefijo = yearMatch ? yearMatch[0] : '2027';

    // Bloquear tabla para correlativos
    await client.query('LOCK TABLE reserva_cupo_hermano IN SHARE ROW EXCLUSIVE MODE');

    // Consultar disponibilidad exacta en este instante
    const disp = await this.consultarDisponibilidad({
      gradoId: grado_solicitado_id,
      turnoId: turno_solicitado_id,
      periodoId: periodo_academico_id,
      client
    });

    const tieneCupo = disp.tiene_cupo_inmediato;
    const estado = tieneCupo ? 'confirmada' : 'en_espera';
    const posicionEspera = disp.posicion_espera;
    const prefijo = tieneCupo ? 'HER' : 'ESP';

    // Generar correlativo secuencial
    const ultimoCodigoRes = await client.query(`
      SELECT codigo_reserva
      FROM reserva_cupo_hermano
      WHERE codigo_reserva LIKE $1
      ORDER BY id DESC
      LIMIT 1
    `, [`${prefijo}-${anioPrefijo}-%`]);

    let siguienteNum = 1;
    if (ultimoCodigoRes.rows.length > 0) {
      const partes = ultimoCodigoRes.rows[0].codigo_reserva.split('-');
      const ultNum = parseInt(partes[partes.length - 1], 10);
      if (!isNaN(ultNum)) {
        siguienteNum = ultNum + 1;
      }
    }

    const seqStr = siguienteNum.toString().padStart(4, '0');
    const codigoReserva = `${prefijo}-${anioPrefijo}-${seqStr}`;
    const codigoRecibo = `REC-${prefijo}-${anioPrefijo}-${seqStr}`;

    const insertResult = await client.query(`
      INSERT INTO reserva_cupo_hermano (
        codigo_reserva,
        codigo_recibo,
        hermano_regular_id,
        periodo_academico_id,
        grado_solicitado_id,
        turno_solicitado_id,
        nombres,
        apellido_paterno,
        apellido_materno,
        ci,
        fecha_nacimiento,
        genero,
        tutor_nombre,
        tutor_ci,
        tutor_parentesco,
        tutor_telefono,
        estado,
        posicion_espera,
        observaciones,
        fecha_reserva
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
      RETURNING id
    `, [
      codigoReserva,
      codigoRecibo,
      hermano_regular_id,
      periodo_academico_id,
      grado_solicitado_id,
      turno_solicitado_id,
      nombres.trim(),
      apellido_paterno.trim(),
      apellido_materno ? apellido_materno.trim() : null,
      ci ? ci.trim() : null,
      fecha_nacimiento,
      genero || null,
      tutor_nombre.trim(),
      tutor_ci.trim(),
      tutor_parentesco.trim(),
      tutor_telefono.trim(),
      estado,
      posicionEspera,
      observaciones ? observaciones.trim() : null
    ]);

    const nuevaId = insertResult.rows[0].id;
    return await this.obtenerPorId(nuevaId, client);
  }

  /**
   * Obtiene la reserva de un hermano por ID con datos completos
   */
  static async obtenerPorId(id, client = null) {
    const conn = client || pool;
    const query = `
      SELECT 
        rh.*,
        TO_CHAR(rh.fecha_reserva, 'DD/MM/YYYY HH24:MI') as fecha_reserva_formateada,
        TO_CHAR(rh.fecha_reserva, 'YYYY-MM-DD') as fecha_reserva_corta,
        TO_CHAR(rh.fecha_nacimiento, 'YYYY-MM-DD') as fecha_nacimiento_formateada,
        TRIM(CONCAT(rh.nombres, ' ', rh.apellido_paterno, ' ', COALESCE(rh.apellido_materno, ''))) as nombre_completo,
        pa.nombre as periodo_nombre,
        g.nombre as grado_solicitado_nombre,
        na.nombre as nivel_solicitado_nombre,
        t.nombre as turno_solicitado_nombre,
        t.hora_inicio as turno_hora_inicio,
        t.hora_fin as turno_hora_fin,
        -- Datos del estudiante regular que respalda al hermanito
        e.codigo as regular_codigo,
        e.ci as regular_ci,
        TRIM(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''))) as regular_nombre_completo,
        e.foto_url as regular_foto_url
      FROM reserva_cupo_hermano rh
      INNER JOIN estudiante e ON rh.hermano_regular_id = e.id
      INNER JOIN periodo_academico pa ON rh.periodo_academico_id = pa.id
      INNER JOIN grado g ON rh.grado_solicitado_id = g.id
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      INNER JOIN turno t ON rh.turno_solicitado_id = t.id
      WHERE rh.id = $1 AND rh.deleted_at IS NULL
    `;
    const res = await conn.query(query, [id]);
    return res.rows[0] || null;
  }

  /**
   * Obtiene la reserva de un hermano por su código de reserva o recibo
   */
  static async obtenerPorCodigo(codigo) {
    const query = `
      SELECT 
        rh.*,
        TO_CHAR(rh.fecha_reserva, 'DD/MM/YYYY HH24:MI') as fecha_reserva_formateada,
        TO_CHAR(rh.fecha_reserva, 'YYYY-MM-DD') as fecha_reserva_corta,
        TO_CHAR(rh.fecha_nacimiento, 'YYYY-MM-DD') as fecha_nacimiento_formateada,
        TRIM(CONCAT(rh.nombres, ' ', rh.apellido_paterno, ' ', COALESCE(rh.apellido_materno, ''))) as nombre_completo,
        pa.nombre as periodo_nombre,
        g.nombre as grado_solicitado_nombre,
        na.nombre as nivel_solicitado_nombre,
        t.nombre as turno_solicitado_nombre,
        t.hora_inicio as turno_hora_inicio,
        t.hora_fin as turno_hora_fin,
        e.codigo as regular_codigo,
        e.ci as regular_ci,
        TRIM(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''))) as regular_nombre_completo
      FROM reserva_cupo_hermano rh
      INNER JOIN estudiante e ON rh.hermano_regular_id = e.id
      INNER JOIN periodo_academico pa ON rh.periodo_academico_id = pa.id
      INNER JOIN grado g ON rh.grado_solicitado_id = g.id
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      INNER JOIN turno t ON rh.turno_solicitado_id = t.id
      WHERE (rh.codigo_reserva = $1 OR rh.codigo_recibo = $1) AND rh.deleted_at IS NULL
    `;
    const res = await pool.query(query, [codigo]);
    return res.rows[0] || null;
  }

  /**
   * Lista de reservas de hermanos para el panel administrativo
   */
  static async listarAdmin(filtros = {}) {
    const {
      periodo_academico_id,
      grado_solicitado_id,
      turno_solicitado_id,
      estado,
      search,
      page = 1,
      limit = 20
    } = filtros;

    let whereConditions = ['rh.deleted_at IS NULL'];
    const params = [];
    let pIdx = 1;

    if (periodo_academico_id) {
      whereConditions.push(`rh.periodo_academico_id = $${pIdx++}`);
      params.push(periodo_academico_id);
    }
    if (grado_solicitado_id) {
      whereConditions.push(`rh.grado_solicitado_id = $${pIdx++}`);
      params.push(grado_solicitado_id);
    }
    if (turno_solicitado_id) {
      whereConditions.push(`rh.turno_solicitado_id = $${pIdx++}`);
      params.push(turno_solicitado_id);
    }
    if (estado) {
      whereConditions.push(`rh.estado = $${pIdx++}`);
      params.push(estado);
    }
    if (search && search.trim()) {
      whereConditions.push(`(
        rh.codigo_reserva ILIKE $${pIdx} OR 
        rh.nombres ILIKE $${pIdx} OR 
        rh.apellido_paterno ILIKE $${pIdx} OR 
        rh.ci ILIKE $${pIdx} OR
        e.nombres ILIKE $${pIdx} OR
        e.apellido_paterno ILIKE $${pIdx}
      )`);
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    const whereClause = whereConditions.join(' AND ');
    const countRes = await pool.query(`
      SELECT COUNT(*)::int as total
      FROM reserva_cupo_hermano rh
      INNER JOIN estudiante e ON rh.hermano_regular_id = e.id
      WHERE ${whereClause}
    `, params);
    const total = countRes.rows[0]?.total || 0;

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const dataQuery = `
      SELECT 
        rh.*,
        TO_CHAR(rh.fecha_reserva, 'DD/MM/YYYY HH24:MI') as fecha_reserva_formateada,
        TO_CHAR(rh.fecha_reserva, 'YYYY-MM-DD') as fecha_reserva_corta,
        TO_CHAR(rh.fecha_nacimiento, 'YYYY-MM-DD') as fecha_nacimiento_formateada,
        TRIM(CONCAT(rh.nombres, ' ', rh.apellido_paterno, ' ', COALESCE(rh.apellido_materno, ''))) as nombre_completo,
        pa.nombre as periodo_nombre,
        g.nombre as grado_solicitado_nombre,
        na.nombre as nivel_solicitado_nombre,
        t.nombre as turno_solicitado_nombre,
        e.codigo as regular_codigo,
        e.ci as regular_ci,
        TRIM(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''))) as regular_nombre_completo,
        e.foto_url as regular_foto_url
      FROM reserva_cupo_hermano rh
      INNER JOIN estudiante e ON rh.hermano_regular_id = e.id
      INNER JOIN periodo_academico pa ON rh.periodo_academico_id = pa.id
      INNER JOIN grado g ON rh.grado_solicitado_id = g.id
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      INNER JOIN turno t ON rh.turno_solicitado_id = t.id
      WHERE ${whereClause}
      ORDER BY rh.estado ASC, rh.posicion_espera ASC, rh.id DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    const dataRes = await pool.query(dataQuery, params);

    return {
      hermanos: dataRes.rows,
      paginacion: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Promover un hermano de 'en_espera' a 'confirmada' (por el administrador cuando se libere un cupo)
   */
  static async promoverAConfirmado(id, { motivo_reasignacion = null, usuario_id = null } = {}) {
    const hermano = await this.obtenerPorId(id);
    if (!hermano) throw new Error('Registro de hermano no encontrado');
    if (hermano.estado === 'confirmada') throw new Error('El hermano ya tiene cupo confirmado');

    const yearMatch = hermano.periodo_nombre.match(/\d{4}/);
    const anioPrefijo = yearMatch ? yearMatch[0] : '2027';

    // Generar correlativo oficial HER-2027-XXXX
    const ultimoCodigoRes = await pool.query(`
      SELECT codigo_reserva
      FROM reserva_cupo_hermano
      WHERE codigo_reserva LIKE $1
      ORDER BY id DESC
      LIMIT 1
    `, [`HER-${anioPrefijo}-%`]);

    let siguienteNum = 1;
    if (ultimoCodigoRes.rows.length > 0) {
      const partes = ultimoCodigoRes.rows[0].codigo_reserva.split('-');
      const ultNum = parseInt(partes[partes.length - 1], 10);
      if (!isNaN(ultNum)) siguienteNum = ultNum + 1;
    }

    const seqStr = siguienteNum.toString().padStart(4, '0');
    const nuevoCodigoReserva = `HER-${anioPrefijo}-${seqStr}`;
    const nuevoCodigoRecibo = `REC-HER-${anioPrefijo}-${seqStr}`;

    await pool.query(`
      UPDATE reserva_cupo_hermano
      SET 
        codigo_reserva = $1,
        codigo_recibo = $2,
        estado = 'confirmada',
        posicion_espera = 0,
        motivo_reasignacion = $3,
        updated_at = NOW()
      WHERE id = $4
    `, [
      nuevoCodigoReserva,
      nuevoCodigoRecibo,
      motivo_reasignacion || 'Cupo asignado por administración tras liberación de vacante.',
      id
    ]);

    // Recalcular posiciones de espera para los demás hermanos de ese grado y turno
    await pool.query(`
      WITH reordenados AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) as nueva_pos
        FROM reserva_cupo_hermano
        WHERE grado_solicitado_id = $1 
          AND turno_solicitado_id = $2 
          AND periodo_academico_id = $3
          AND estado = 'en_espera'
          AND deleted_at IS NULL
      )
      UPDATE reserva_cupo_hermano rh
      SET posicion_espera = r.nueva_pos
      FROM reordenados r
      WHERE rh.id = r.id;
    `, [hermano.grado_solicitado_id, hermano.turno_solicitado_id, hermano.periodo_academico_id]);

    return await this.obtenerPorId(id);
  }

  /**
   * Solicitar anulación de reserva de hermano (por el tutor desde el recibo web)
   */
  static async solicitarAnulacion({ codigo, motivo, tutor_ci, estudiante_ci, ci }) {
    const hermano = await this.obtenerPorCodigo(codigo);
    if (!hermano) {
      throw new Error('No se encontró la reserva de hermano con el código especificado');
    }

    if (hermano.estado === 'anulada' || hermano.estado === 'cancelada') {
      throw new Error('Esta reserva de hermano ya se encuentra anulada');
    }

    if (hermano.estado === 'solicitud_anulacion') {
      throw new Error('Ya existe una solicitud de anulación en trámite para esta reserva');
    }

    // Validación por CI del hermano o del estudiante regular que lo respalda (o tutor)
    const ciIngresado = (estudiante_ci || ci || tutor_ci || '').trim().toLowerCase();
    if (ciIngresado) {
      const coincideHermano = hermano.ci && hermano.ci.trim().toLowerCase() === ciIngresado;
      const coincideRegular = hermano.regular_ci && hermano.regular_ci.trim().toLowerCase() === ciIngresado;
      const coincideTutor = hermano.tutor_ci && hermano.tutor_ci.trim().toLowerCase() === ciIngresado;
      if (!coincideHermano && !coincideRegular && !coincideTutor) {
        throw new Error('El Carnet de Identidad (CI) ingresado no coincide con el del estudiante en esta reserva');
      }
    }

    const obsActual = hermano.observaciones || '';
    const obsNueva = motivo ? `${obsActual} [Sol. Anulación: ${motivo.trim()}]`.trim() : obsActual;

    await pool.query(`
      UPDATE reserva_cupo_hermano
      SET 
        estado = 'solicitud_anulacion',
        observaciones = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [obsNueva, hermano.id]);

    return await this.obtenerPorId(hermano.id);
  }

  /**
   * Anular reserva de hermano definitivamente (por el administrador o tras confirmar desistimiento)
   * Si tenía cupo confirmado, el cupo se libera inmediatamente.
   */
  static async anularReserva(id, { motivo = null, usuario_id = null } = {}) {
    const hermano = await this.obtenerPorId(id);
    if (!hermano) throw new Error('Reserva de hermano no encontrada');

    const obsActual = hermano.observaciones || '';
    const obsNueva = motivo ? `${obsActual} [Anulada por admin: ${motivo.trim()}]`.trim() : obsActual;

    await pool.query(`
      UPDATE reserva_cupo_hermano
      SET 
        estado = 'anulada',
        observaciones = $1,
        posicion_espera = 0,
        updated_at = NOW()
      WHERE id = $2
    `, [obsNueva, id]);

    // Si estaba en lista de espera, reordenar a los demás
    if (hermano.estado === 'en_espera') {
      await pool.query(`
        WITH reordenados AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) as nueva_pos
          FROM reserva_cupo_hermano
          WHERE grado_solicitado_id = $1 
            AND turno_solicitado_id = $2 
            AND periodo_academico_id = $3
            AND estado = 'en_espera'
            AND deleted_at IS NULL
        )
        UPDATE reserva_cupo_hermano rh
        SET posicion_espera = r.nueva_pos
        FROM reordenados r
        WHERE rh.id = r.id;
      `, [hermano.grado_solicitado_id, hermano.turno_solicitado_id, hermano.periodo_academico_id]);
    }

    return await this.obtenerPorId(id);
  }

  /**
   * Reactivar / Restituir reserva de hermano (por el administrador si la familia se arrepiente de haber cancelado)
   */
  static async reactivarReserva(id, { motivo = null, usuario_id = null } = {}) {
    const hermano = await this.obtenerPorId(id);
    if (!hermano) throw new Error('Reserva de hermano no encontrada');

    const disp = await this.consultarDisponibilidad({
      gradoId: hermano.grado_solicitado_id,
      turnoId: hermano.turno_solicitado_id,
      periodoId: hermano.periodo_academico_id
    });

    const tieneCupo = disp.tiene_cupo_inmediato;
    const nuevoEstado = tieneCupo ? 'confirmada' : 'en_espera';
    const nuevaPosicion = tieneCupo ? 0 : disp.posicion_espera;

    const obsActual = hermano.observaciones || '';
    const obsNueva = motivo ? `${obsActual} [Reactivada: ${motivo.trim()}]`.trim() : obsActual;

    await pool.query(`
      UPDATE reserva_cupo_hermano
      SET 
        estado = $1,
        posicion_espera = $2,
        observaciones = $3,
        updated_at = NOW()
      WHERE id = $4
    `, [nuevoEstado, nuevaPosicion, obsNueva, id]);

    return await this.obtenerPorId(id);
  }

  /**
   * Obtiene estadísticas y resumen cuantitativo de hermanos postulantes
   */
  static async obtenerEstadisticas(periodoId = null) {
    let wherePeriodo = '';
    const params = [];
    if (periodoId) {
      wherePeriodo = 'AND rh.periodo_academico_id = $1';
      params.push(periodoId);
    }

    const query = `
      SELECT 
        COUNT(*)::int as total_registros,
        COUNT(CASE WHEN rh.estado = 'confirmada' THEN 1 END)::int as total_confirmadas,
        COUNT(CASE WHEN rh.estado = 'en_espera' THEN 1 END)::int as total_en_espera,
        COUNT(CASE WHEN rh.estado = 'solicitud_anulacion' THEN 1 END)::int as total_solicitud_anulacion,
        COUNT(CASE WHEN rh.estado IN ('anulada', 'cancelada') THEN 1 END)::int as total_anuladas
      FROM reserva_cupo_hermano rh
      WHERE rh.deleted_at IS NULL ${wherePeriodo}
    `;

    const res = await pool.query(query, params);
    const row = res.rows[0] || {};

    return {
      total_registros: row.total_registros || 0,
      total_confirmadas: row.total_confirmadas || 0,
      total_en_espera: row.total_en_espera || 0,
      total_solicitud_anulacion: row.total_solicitud_anulacion || 0,
      total_anuladas: row.total_anuladas || 0
    };
  }
}

export default ReservaCupoHermano;
