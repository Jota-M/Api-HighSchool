// models/ReservaCupo.js
import { pool } from '../db/pool.js';
import ReservaCupoHermano from './ReservaCupoHermano.js';

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

    // Verificar que la matrícula del estudiante esté activa
    if (ultimaMatricula.matricula_estado !== 'activo') {
      const estadoDesc = {
        retirado: 'se encuentra RETIRADO',
        inactivo: 'tiene su matrícula INACTIVA',
        suspendido: 'se encuentra con matrícula SUSPENDIDA',
        anulado: 'tiene su matrícula ANULADA',
        trasladado: 'se encuentra TRASLADADO',
      }[ultimaMatricula.matricula_estado] || `tiene su matrícula en estado "${ultimaMatricula.matricula_estado}"`;

      return {
        valido: false,
        error_tipo: 'MATRICULA_INACTIVA',
        matricula_estado: ultimaMatricula.matricula_estado,
        mensaje: `El estudiante ${estudiante.nombres} ${estudiante.apellido_paterno} ${estadoDesc}. El formulario de reserva de cupo web está habilitado únicamente para estudiantes regulares con matrícula activa. Por favor, acérquese a Secretaría o Dirección.`
      };
    }

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
      // Caso 1: Reserva anulada o cancelada previamente -> NO se puede volver a registrar por web
      if (reservaExistente.estado === 'anulada' || reservaExistente.estado === 'cancelada') {
        return {
          valido: false,
          error_tipo: 'RESERVA_ANULADA',
          mensaje: `La reserva para este estudiante fue anulada previamente. Debido a esto, no es posible registrarse nuevamente desde el formulario web. Por favor, acérquese a Secretaría o Dirección para gestionar su cupo de forma presencial.`
        };
      }

      // Caso 2: Declaró No Continuidad
      if (reservaExistente.estado === 'no_continua') {
        return {
          valido: true,
          ya_reservado: true,
          estado_reserva: 'no_continua',
          reserva: reservaExistente,
          mensaje: `El estudiante ya tiene registrada su declaración de No Continuidad para ${periodoDestino.nombre}`
        };
      }

      // Caso 3: Solicitud de anulación en trámite
      if (reservaExistente.estado === 'solicitud_anulacion') {
        return {
          valido: true,
          ya_reservado: true,
          estado_reserva: 'solicitud_anulacion',
          reserva: reservaExistente,
          mensaje: `El estudiante tiene una solicitud de anulación de cupo en trámite ante Secretaría.`
        };
      }

      // Caso 4: Confirmada
      return {
        valido: true,
        ya_reservado: true,
        estado_reserva: 'confirmada',
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
   * Crea reserva para múltiples estudiantes y hermanos en una sola transacción
   */
  static async crearReservaMultiple(datos) {
    const {
      estudiantes = [], // Array de { estudiante_id, grado_actual_id, grado_destino_id, turno_destino_id, continua, confirma_continuidad, motivo_no_continua }
      hermanos = [],    // Array de { hermano_regular_id, grado_solicitado_id, turno_solicitado_id, nombres, apellido_paterno, apellido_materno, ci, fecha_nacimiento, genero, observaciones }
      periodo_academico_id,
      tutor_nombre,
      tutor_ci,
      tutor_parentesco,
      tutor_telefono,
      observaciones
    } = datos;

    const listaEstudiantes = Array.isArray(estudiantes) ? estudiantes : [];
    const listaHermanos = Array.isArray(hermanos) ? hermanos : [];

    if (listaEstudiantes.length === 0 && listaHermanos.length === 0) {
      throw new Error('Debe proporcionar al menos un estudiante regular o hermano para la reserva');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Obtener año del periodo para prefijo (ej: 2027)
      const periodoQuery = await client.query('SELECT nombre FROM periodo_academico WHERE id = $1', [periodo_academico_id]);
      const periodoNombre = periodoQuery.rows[0]?.nombre || '';
      const yearMatch = periodoNombre.match(/\d{4}/);
      const anioPrefijo = yearMatch ? yearMatch[0] : '2027';

      // 1. Procesar Estudiantes Regulares
      const reservasCreadas = [];

      if (listaEstudiantes.length > 0) {
        // Bloquear tabla para correlativos
        await client.query('LOCK TABLE reserva_cupo IN SHARE ROW EXCLUSIVE MODE');

        // Buscar último correlativo para ese año (tanto RES como NOC)
        const ultimoCodigoResult = await client.query(`
          SELECT codigo_reserva
          FROM reserva_cupo
          WHERE codigo_reserva LIKE $1 OR codigo_reserva LIKE $2
          ORDER BY id DESC
          LIMIT 1
        `, [`RES-${anioPrefijo}-%`, `NOC-${anioPrefijo}-%`]);

        let siguienteNum = 1;
        if (ultimoCodigoResult.rows.length > 0) {
          const partes = ultimoCodigoResult.rows[0].codigo_reserva.split('-');
          const ultNum = parseInt(partes[partes.length - 1], 10);
          if (!isNaN(ultNum)) {
            siguienteNum = ultNum + 1;
          }
        }

        for (const est of listaEstudiantes) {
          // Verificar que el estudiante regular tenga matrícula activa
          const checkMatricula = await client.query(`
            SELECT m.estado
            FROM matricula m
            INNER JOIN periodo_academico pa ON m.periodo_academico_id = pa.id
            WHERE m.estudiante_id = $1 AND m.deleted_at IS NULL
            ORDER BY pa.fecha_inicio DESC
            LIMIT 1
          `, [est.estudiante_id]);

          if (checkMatricula.rows.length === 0 || checkMatricula.rows[0].estado !== 'activo') {
            throw new Error('El estudiante regular seleccionado no cuenta con matrícula activa para registrar su reserva.');
          }

          // Verificar si ya existe reserva para este estudiante y periodo
          const checkExistente = await client.query(`
            SELECT id, codigo_reserva, codigo_recibo, estado
            FROM reserva_cupo
            WHERE estudiante_id = $1 AND periodo_academico_id = $2 AND deleted_at IS NULL
          `, [est.estudiante_id, periodo_academico_id]);

          if (checkExistente.rows.length > 0) {
            // Ya tiene registro -> devolver el existente
            const resExist = await ReservaCupo.obtenerPorId(checkExistente.rows[0].id, client);
            reservasCreadas.push(resExist);
            continue;
          }

          const seqStr = siguienteNum.toString().padStart(4, '0');
          const continua = est.continua !== false && est.confirma_continuidad !== false;
          const prefijo = continua ? 'RES' : 'NOC';
          const codigoReserva = `${prefijo}-${anioPrefijo}-${seqStr}`;
          const codigoRecibo = `REC-${prefijo}-${anioPrefijo}-${seqStr}`;
          const estado = continua ? 'confirmada' : 'no_continua';
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
              motivo_no_continua,
              estado,
              fecha_reserva
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
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
            observaciones ? observaciones.trim() : null,
            !continua ? (est.motivo_no_continua || observaciones || 'Declaración de no continuidad').trim() : null,
            estado
          ]);

          const nuevaId = insertResult.rows[0].id;
          const reservaCompleta = await ReservaCupo.obtenerPorId(nuevaId, client);
          reservasCreadas.push(reservaCompleta);
        }
      }

      // 2. Procesar Hermanos Nuevos (con Prioridad Familiar)
      const hermanosCreados = [];

      if (listaHermanos.length > 0) {
        for (const herm of listaHermanos) {
          // El hermano debe estar respaldado por un regular
          const hermanoRegularId = herm.hermano_regular_id || (listaEstudiantes[0]?.estudiante_id);
          if (!hermanoRegularId) {
            throw new Error(`El hermano ${herm.nombres || ''} debe estar respaldado por un estudiante regular activo.`);
          }

          const hermCreado = await ReservaCupoHermano.crearReservaHermanoTransaccional({
            ...herm,
            hermano_regular_id: hermanoRegularId,
            periodo_academico_id: periodo_academico_id,
            tutor_nombre: tutor_nombre.trim(),
            tutor_ci: tutor_ci.trim(),
            tutor_parentesco: tutor_parentesco.trim(),
            tutor_telefono: tutor_telefono.trim(),
            observaciones: herm.observaciones || observaciones
          }, client);

          hermanosCreados.push(hermCreado);
        }
      }

      await client.query('COMMIT');

      const cantContinuaran = reservasCreadas.filter(r => r.estado === 'confirmada').length;
      const cantNoContinuaran = reservasCreadas.filter(r => r.estado === 'no_continua').length;
      const cantHermanosConf = hermanosCreados.filter(h => h.estado === 'confirmada').length;
      const cantHermanosEsp = hermanosCreados.filter(h => h.estado === 'en_espera').length;

      let mensajeExito = `¡Registro procesado exitosamente!`;
      const partesMsg = [];
      if (cantContinuaran > 0) partesMsg.push(`${cantContinuaran} regular(es) con cupo confirmado`);
      if (cantNoContinuaran > 0) partesMsg.push(`${cantNoContinuaran} con constancia de no continuidad`);
      if (cantHermanosConf > 0) partesMsg.push(`${cantHermanosConf} hermano(s) con cupo confirmado`);
      if (cantHermanosEsp > 0) partesMsg.push(`${cantHermanosEsp} hermano(s) en lista de espera prioritaria`);

      if (partesMsg.length > 0) {
        mensajeExito = `¡Registro completado: ${partesMsg.join(', ')}!`;
      }

      return {
        exito: true,
        reservas: reservasCreadas,
        hermanos: hermanosCreados,
        cantidad_regulares: reservasCreadas.length,
        cantidad_hermanos: hermanosCreados.length,
        mensaje: mensajeExito
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
   * Solicitar anulación de reserva (por el padre/tutor desde el formulario/recibo público)
   */
  static async solicitarAnulacion({ codigo, motivo, tutor_ci, estudiante_ci, ci }) {
    const reserva = await ReservaCupo.obtenerPorCodigo(codigo);
    if (!reserva) {
      // Si no es reserva regular, verificar si es reserva de hermano nuevo
      const hermano = await ReservaCupoHermano.obtenerPorCodigo(codigo);
      if (hermano) {
        return await ReservaCupoHermano.solicitarAnulacion({ codigo, motivo, tutor_ci, estudiante_ci, ci });
      }
      throw new Error('No se encontró la reserva con el código especificado');
    }

    if (reserva.estado === 'anulada' || reserva.estado === 'cancelada') {
      throw new Error('Esta reserva ya se encuentra anulada');
    }

    if (reserva.estado === 'solicitud_anulacion') {
      throw new Error('Ya existe una solicitud de anulación en trámite para esta reserva');
    }

    if (reserva.estado === 'no_continua') {
      throw new Error('Este registro corresponde a una constancia de no continuidad, no a una reserva activa');
    }

    // Validación por CI del estudiante (o tutor como respaldo)
    const ciIngresado = (estudiante_ci || ci || tutor_ci || '').trim().toLowerCase();
    if (ciIngresado) {
      const coincideEst = reserva.estudiante_ci && reserva.estudiante_ci.trim().toLowerCase() === ciIngresado;
      const coincideTutor = reserva.tutor_ci && reserva.tutor_ci.trim().toLowerCase() === ciIngresado;
      if (!coincideEst && !coincideTutor) {
        throw new Error('El Carnet de Identidad (CI) ingresado no coincide con el del estudiante en esta reserva');
      }
    }

    await pool.query(`
      UPDATE reserva_cupo
      SET 
        estado = 'solicitud_anulacion',
        motivo_anulacion = $1,
        fecha_solicitud_anulacion = NOW(),
        updated_at = NOW()
      WHERE id = $2
    `, [motivo ? motivo.trim() : 'Solicitud de anulación por el tutor', reserva.id]);

    return await ReservaCupo.obtenerPorId(reserva.id);
  }

  /**
   * Anular reserva definitivamente (por el administrador desde el panel)
   */
  static async anularReserva(id, { motivo, usuario_id } = {}) {
    const reserva = await ReservaCupo.obtenerPorId(id);
    if (!reserva) {
      throw new Error('Reserva no encontrada');
    }

    await pool.query(`
      UPDATE reserva_cupo
      SET 
        estado = 'anulada',
        motivo_anulacion = COALESCE($1, motivo_anulacion, 'Anulación efectuada por administración'),
        fecha_anulacion = NOW(),
        anulado_por_usuario_id = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [motivo ? motivo.trim() : null, usuario_id || null, id]);

    return await ReservaCupo.obtenerPorId(id);
  }

  /**
   * Reactivar / Restituir reserva de cupo (por el administrador desde el panel)
   */
  static async reactivarReserva(id, { motivo, usuario_id } = {}) {
    const reserva = await ReservaCupo.obtenerPorId(id);
    if (!reserva) {
      throw new Error('Reserva no encontrada');
    }

    await pool.query(`
      UPDATE reserva_cupo
      SET 
        estado = 'confirmada',
        fecha_reactivacion = NOW(),
        reactivado_por_usuario_id = $1,
        motivo_anulacion = NULL,
        fecha_solicitud_anulacion = NULL,
        fecha_anulacion = NULL,
        observaciones = CASE 
          WHEN $2::text IS NOT NULL AND $2::text != '' 
          THEN CONCAT(COALESCE(observaciones, ''), ' [Reactivado por administración: ', $2::text, ']')
          ELSE observaciones 
        END,
        updated_at = NOW()
      WHERE id = $3
    `, [usuario_id || null, motivo ? motivo.trim() : null, id]);

    return await ReservaCupo.obtenerPorId(id);
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
        COUNT(*)::int as total_registros,
        COUNT(CASE WHEN r.estado = 'confirmada' THEN 1 END)::int as total_confirmadas,
        COUNT(CASE WHEN r.estado = 'no_continua' THEN 1 END)::int as total_no_continua,
        COUNT(CASE WHEN r.estado = 'solicitud_anulacion' THEN 1 END)::int as total_solicitud_anulacion,
        COUNT(CASE WHEN r.estado IN ('anulada', 'cancelada') THEN 1 END)::int as total_anuladas,
        COUNT(CASE WHEN nd.nombre ILIKE '%inicial%' AND r.estado = 'confirmada' THEN 1 END)::int as total_inicial,
        COUNT(CASE WHEN nd.nombre ILIKE '%primaria%' AND r.estado = 'confirmada' THEN 1 END)::int as total_primaria,
        COUNT(CASE WHEN nd.nombre ILIKE '%secundaria%' AND r.estado = 'confirmada' THEN 1 END)::int as total_secundaria
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
        COUNT(CASE WHEN r.estado = 'confirmada' THEN 1 END)::int as total_confirmados,
        COUNT(CASE WHEN r.estado = 'no_continua' THEN 1 END)::int as total_no_continuan,
        COUNT(CASE WHEN r.estado = 'solicitud_anulacion' THEN 1 END)::int as total_solicitudes_anulacion,
        COUNT(CASE WHEN r.estado IN ('anulada', 'cancelada') THEN 1 END)::int as total_anuladas,
        COUNT(r.id)::int as total_registrados
      FROM grado gd
      INNER JOIN nivel_academico nd ON gd.nivel_academico_id = nd.id
      LEFT JOIN reserva_cupo r ON r.grado_destino_id = gd.id AND r.deleted_at IS NULL ${wherePeriodo ? 'AND r.periodo_academico_id = $1' : ''}
      GROUP BY gd.id, gd.nombre, nd.nombre, gd.orden
      ORDER BY gd.orden ASC
    `;

    const resumenRes = await pool.query(queryResumen, params);
    const porGradoRes = await pool.query(queryPorGrado, params);

    const resumenData = resumenRes.rows[0] || {};

    return {
      resumen: {
        total_reservas: resumenData.total_confirmadas || 0,
        total_confirmadas: resumenData.total_confirmadas || 0,
        total_no_continua: resumenData.total_no_continua || 0,
        total_solicitud_anulacion: resumenData.total_solicitud_anulacion || 0,
        total_anuladas: resumenData.total_anuladas || 0,
        total_registros: resumenData.total_registros || 0,
        total_inicial: resumenData.total_inicial || 0,
        total_primaria: resumenData.total_primaria || 0,
        total_secundaria: resumenData.total_secundaria || 0
      },
      por_grado: porGradoRes.rows || []
    };
  }
}

export default ReservaCupo;
