// models/Horario.js
import { pool } from '../db/pool.js';

// =============================================
// BLOQUE HORARIO
// =============================================
class BloqueHorario {
  static async findAll(filters = {}) {
    const { turno_id, activo, incluir_recreos = true } = filters;

    let where = [];
    let params = [];
    let i = 1;

    if (turno_id) {
      where.push(`bh.turno_id = $${i++}`);
      params.push(turno_id);
    }
    if (activo !== undefined) {
      where.push(`bh.activo = $${i++}`);
      params.push(activo);
    }
    if (!incluir_recreos) {
      where.push(`bh.es_recreo = false`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT bh.*, t.nombre AS turno_nombre
      FROM bloque_horario bh
      INNER JOIN turno t ON bh.turno_id = t.id
      ${whereClause}
      ORDER BY bh.turno_id, bh.numero
    `, params);

    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT bh.*, t.nombre AS turno_nombre
      FROM bloque_horario bh
      INNER JOIN turno t ON bh.turno_id = t.id
      WHERE bh.id = $1
    `, [id]);
    return result.rows[0];
  }

  static async create(data) {
    const { turno_id, nombre, codigo, numero, hora_inicio, hora_fin, es_recreo } = data;

    const result = await pool.query(`
      INSERT INTO bloque_horario (turno_id, nombre, codigo, numero, hora_inicio, hora_fin, es_recreo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [turno_id, nombre, codigo || null, numero, hora_inicio, hora_fin, es_recreo ?? false]);

    return result.rows[0];
  }

  static async update(id, data) {
    const { nombre, codigo, numero, hora_inicio, hora_fin, es_recreo, activo } = data;

    const result = await pool.query(`
      UPDATE bloque_horario
      SET nombre      = COALESCE($1, nombre),
          codigo      = COALESCE($2, codigo),
          numero      = COALESCE($3, numero),
          hora_inicio = COALESCE($4, hora_inicio),
          hora_fin    = COALESCE($5, hora_fin),
          es_recreo   = COALESCE($6, es_recreo),
          activo      = COALESCE($7, activo),
          updated_at  = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [nombre, codigo, numero, hora_inicio, hora_fin, es_recreo, activo, id]);

    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(`
      UPDATE bloque_horario SET activo = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *
    `, [id]);
    return result.rows[0];
  }
}

// =============================================
// HORARIO (cabecera)
// =============================================
class Horario {
  static async findAll(filters = {}) {
    const { periodo_academico_id, paralelo_id, estado, grado_id, nivel_academico_id } = filters;

    let where = ['h.deleted_at IS NULL'];
    let params = [];
    let i = 1;

    if (periodo_academico_id) { where.push(`h.periodo_academico_id = $${i++}`); params.push(periodo_academico_id); }
    if (paralelo_id)          { where.push(`h.paralelo_id = $${i++}`);          params.push(paralelo_id); }
    if (estado)               { where.push(`h.estado = $${i++}`);               params.push(estado); }
    if (grado_id)             { where.push(`p.grado_id = $${i++}`);             params.push(grado_id); }
    if (nivel_academico_id)   { where.push(`g.nivel_academico_id = $${i++}`);   params.push(nivel_academico_id); }

    const result = await pool.query(`
      SELECT
        h.*,
        p.nombre          AS paralelo_nombre,
        p.aula            AS paralelo_aula,
        g.nombre          AS grado_nombre,
        n.nombre          AS nivel_nombre,
        t.nombre          AS turno_nombre,
        pa.nombre         AS periodo_nombre,
        pa.codigo         AS periodo_codigo,
        u.username        AS publicado_por_username,
        (SELECT COUNT(*) FROM horario_detalle hd WHERE hd.horario_id = h.id AND hd.activo = true) AS total_celdas
      FROM horario h
      INNER JOIN paralelo p          ON h.paralelo_id = p.id
      INNER JOIN grado g             ON p.grado_id = g.id
      INNER JOIN nivel_academico n   ON g.nivel_academico_id = n.id
      INNER JOIN turno t             ON p.turno_id = t.id
      INNER JOIN periodo_academico pa ON h.periodo_academico_id = pa.id
      LEFT JOIN  usuarios u          ON h.publicado_por = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY n.orden, g.orden, p.nombre
    `, params);

    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT
        h.*,
        p.nombre          AS paralelo_nombre,
        p.aula            AS paralelo_aula,
        g.id              AS grado_id,
        g.nombre          AS grado_nombre,
        n.nombre          AS nivel_nombre,
        t.id              AS turno_id,
        t.nombre          AS turno_nombre,
        pa.nombre         AS periodo_nombre,
        u.username        AS publicado_por_username
      FROM horario h
      INNER JOIN paralelo p          ON h.paralelo_id = p.id
      INNER JOIN grado g             ON p.grado_id = g.id
      INNER JOIN nivel_academico n   ON g.nivel_academico_id = n.id
      INNER JOIN turno t             ON p.turno_id = t.id
      INNER JOIN periodo_academico pa ON h.periodo_academico_id = pa.id
      LEFT JOIN  usuarios u          ON h.publicado_por = u.id
      WHERE h.id = $1 AND h.deleted_at IS NULL
    `, [id]);
    return result.rows[0];
  }

  static async create(data) {
    const { paralelo_id, periodo_academico_id, nombre, observaciones } = data;

    const result = await pool.query(`
      INSERT INTO horario (paralelo_id, periodo_academico_id, nombre, observaciones)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [paralelo_id, periodo_academico_id, nombre || null, observaciones || null]);

    return result.rows[0];
  }

  static async update(id, data) {
    const { nombre, observaciones } = data;

    const result = await pool.query(`
      UPDATE horario
      SET nombre        = COALESCE($1, nombre),
          observaciones = COALESCE($2, observaciones),
          updated_at    = CURRENT_TIMESTAMP
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `, [nombre, observaciones, id]);

    return result.rows[0];
  }

  static async cambiarEstado(id, estado, usuario_id) {
    const result = await pool.query(`
      UPDATE horario
  SET 
    estado        = $1::VARCHAR,
    publicado_por = CASE WHEN $1::VARCHAR = 'publicado' THEN $3 ELSE publicado_por END
  WHERE id = $2::INTEGER
  RETURNING *
`, [estado, usuario_id, id]);

    return result.rows[0];
  }

  static async softDelete(id) {
    const result = await pool.query(`
      UPDATE horario SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id
    `, [id]);
    return result.rows[0];
  }

  static async exists(paralelo_id, periodo_academico_id) {
    const result = await pool.query(`
      SELECT id FROM horario
      WHERE paralelo_id = $1 AND periodo_academico_id = $2 AND deleted_at IS NULL
    `, [paralelo_id, periodo_academico_id]);
    return result.rows[0];
  }
}

// =============================================
// HORARIO DETALLE (celdas)
// =============================================
class HorarioDetalle {
  // Obtener todas las celdas de un horario (para la grilla semanal)
  static async findByHorario(horario_id) {
    const result = await pool.query(`
      SELECT
        hd.*,
        bh.nombre       AS bloque_nombre,
        bh.numero       AS bloque_numero,
        bh.hora_inicio,
        bh.hora_fin,
        bh.es_recreo,
        m.id            AS materia_id,
        m.nombre        AS materia_nombre,
        m.color         AS materia_color,
        d.id            AS docente_id,
        d.nombres       AS docente_nombres,
        d.apellidos     AS docente_apellidos
      FROM horario_detalle hd
      INNER JOIN bloque_horario bh      ON hd.bloque_horario_id = bh.id
      INNER JOIN grado_materia gm       ON hd.grado_materia_id = gm.id
      INNER JOIN materia m              ON gm.materia_id = m.id
      LEFT JOIN  asignacion_docente ad  ON hd.asignacion_docente_id = ad.id
      LEFT JOIN  docente d              ON ad.docente_id = d.id
      WHERE hd.horario_id = $1 AND hd.activo = true
      ORDER BY hd.dia_semana, bh.numero
    `, [horario_id]);

    return result.rows;
  }

  static async findById(id) {
    const result = await pool.query(`
      SELECT hd.*, bh.nombre AS bloque_nombre, bh.hora_inicio, bh.hora_fin,
        m.nombre AS materia_nombre, d.nombres AS docente_nombres, d.apellidos AS docente_apellidos
      FROM horario_detalle hd
      INNER JOIN bloque_horario bh     ON hd.bloque_horario_id = bh.id
      INNER JOIN grado_materia gm      ON hd.grado_materia_id = gm.id
      INNER JOIN materia m             ON gm.materia_id = m.id
      LEFT JOIN  asignacion_docente ad ON hd.asignacion_docente_id = ad.id
      LEFT JOIN  docente d             ON ad.docente_id = d.id
      WHERE hd.id = $1
    `, [id]);
    return result.rows[0];
  }

  static async create(data) {
    const { horario_id, dia_semana, bloque_horario_id, grado_materia_id, asignacion_docente_id, aula, color, observaciones } = data;

    const result = await pool.query(`
      INSERT INTO horario_detalle
        (horario_id, dia_semana, bloque_horario_id, grado_materia_id, asignacion_docente_id, aula, color, observaciones)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [horario_id, dia_semana, bloque_horario_id, grado_materia_id, asignacion_docente_id || null, aula || null, color || null, observaciones || null]);

    return result.rows[0];
  }

  // CORRECCIÓN: asignacion_docente_id distingue entre "no enviado" (conservar) y "null explícito" (borrar)
  static async update(id, data) {
    const { grado_materia_id, aula, color, observaciones } = data;

    // Si la clave existe en data (aunque sea null), se actualiza. Si no existe, se conserva el valor actual.
    const tieneAsignacion = 'asignacion_docente_id' in data;
    const asignacion_docente_id = tieneAsignacion ? (data.asignacion_docente_id ?? null) : undefined;

    const result = await pool.query(`
      UPDATE horario_detalle
      SET grado_materia_id      = COALESCE($1, grado_materia_id),
          asignacion_docente_id = CASE WHEN $2::boolean THEN $3::integer ELSE asignacion_docente_id END,
          aula                  = COALESCE($4, aula),
          color                 = COALESCE($5, color),
          observaciones         = COALESCE($6, observaciones),
          updated_at            = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [
      grado_materia_id,
      tieneAsignacion,         // $2: flag — ¿se envió el campo?
      asignacion_docente_id,   // $3: el valor (puede ser null para quitar docente)
      aula,
      color,
      observaciones,
      id
    ]);

    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(`
      UPDATE horario_detalle SET activo = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *
    `, [id]);
    return result.rows[0];
  }

  // Detectar conflicto de docente (mismo día + bloque en otro horario del mismo período)
  static async verificarConflictoDocente({ asignacion_docente_id, dia_semana, bloque_horario_id, periodo_academico_id, excluir_detalle_id = null }) {
    if (!asignacion_docente_id) return null;

    let query = `
      SELECT hd.id, hd.horario_id, h.paralelo_id, p.nombre AS paralelo_nombre,
        m.nombre AS materia_nombre, bh.hora_inicio, bh.hora_fin
      FROM horario_detalle hd
      INNER JOIN horario h         ON hd.horario_id = h.id
      INNER JOIN paralelo p        ON h.paralelo_id = p.id
      INNER JOIN grado_materia gm  ON hd.grado_materia_id = gm.id
      INNER JOIN materia m         ON gm.materia_id = m.id
      INNER JOIN bloque_horario bh ON hd.bloque_horario_id = bh.id
      WHERE hd.asignacion_docente_id = $1
        AND hd.dia_semana            = $2
        AND hd.bloque_horario_id     = $3
        AND h.periodo_academico_id   = $4
        AND hd.activo                = true
    `;
    const params = [asignacion_docente_id, dia_semana, bloque_horario_id, periodo_academico_id];

    if (excluir_detalle_id) {
      query += ` AND hd.id != $5`;
      params.push(excluir_detalle_id);
    }

    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  // Horario semanal de un docente en un período
  // CORRECCIÓN: acepta parámetro estado para que admin pueda ver borradores
  static async findByDocente(docente_id, periodo_academico_id, estado = 'publicado') {
    const result = await pool.query(`
      SELECT
        hd.dia_semana,
        bh.numero       AS bloque_numero,
        bh.nombre       AS bloque_nombre,
        bh.hora_inicio,
        bh.hora_fin,
        m.nombre        AS materia_nombre,
        m.color         AS materia_color,
        p.nombre        AS paralelo_nombre,
        g.nombre        AS grado_nombre,
        hd.aula
      FROM horario_detalle hd
      INNER JOIN horario h           ON hd.horario_id = h.id
      INNER JOIN bloque_horario bh   ON hd.bloque_horario_id = bh.id
      INNER JOIN grado_materia gm    ON hd.grado_materia_id = gm.id
      INNER JOIN materia m           ON gm.materia_id = m.id
      INNER JOIN paralelo p          ON h.paralelo_id = p.id
      INNER JOIN grado g             ON p.grado_id = g.id
      INNER JOIN asignacion_docente ad ON hd.asignacion_docente_id = ad.id
      WHERE ad.docente_id          = $1
        AND h.periodo_academico_id = $2
        AND hd.activo              = true
        AND h.estado               = $3
      ORDER BY hd.dia_semana, bh.numero
    `, [docente_id, periodo_academico_id, estado]);

    return result.rows;
  }

  // Horario semanal de un paralelo (para padres/alumnos)
  // CORRECCIÓN: acepta parámetro estado para que admin pueda ver borradores
  static async findByParalelo(paralelo_id, periodo_academico_id, estado = 'publicado') {
    const result = await pool.query(`
      SELECT
        hd.dia_semana,
        bh.numero       AS bloque_numero,
        bh.nombre       AS bloque_nombre,
        bh.hora_inicio,
        bh.hora_fin,
        bh.es_recreo,
        m.nombre        AS materia_nombre,
        m.color         AS materia_color,
        d.nombres       AS docente_nombres,
        d.apellidos     AS docente_apellidos,
        hd.aula,
        hd.color
      FROM horario h
      INNER JOIN horario_detalle hd  ON hd.horario_id = h.id
      INNER JOIN bloque_horario bh   ON hd.bloque_horario_id = bh.id
      INNER JOIN grado_materia gm    ON hd.grado_materia_id = gm.id
      INNER JOIN materia m           ON gm.materia_id = m.id
      LEFT JOIN  asignacion_docente ad ON hd.asignacion_docente_id = ad.id
      LEFT JOIN  docente d           ON ad.docente_id = d.id
      WHERE h.paralelo_id          = $1
        AND h.periodo_academico_id = $2
        AND hd.activo              = true
        AND h.estado               = $3
        AND h.deleted_at IS NULL
      ORDER BY hd.dia_semana, bh.numero
    `, [paralelo_id, periodo_academico_id, estado]);

    return result.rows;
  }

  // NUEVO: validar que el bloque pertenece al mismo turno que el paralelo del horario
  static async validarBloqueEnTurno(bloque_horario_id, horario_id) {
    const result = await pool.query(`
      SELECT bh.id
      FROM bloque_horario bh
      INNER JOIN horario h   ON h.id = $2
      INNER JOIN paralelo p  ON p.id = h.paralelo_id
      WHERE bh.id = $1
        AND bh.turno_id = p.turno_id
    `, [bloque_horario_id, horario_id]);

    return !!result.rows[0]; // true = bloque pertenece al turno correcto
  }
}

export { BloqueHorario, Horario, HorarioDetalle };