// models/Asistencia.js
import { pool } from '../db/pool.js';

// =============================================
// SOLICITUD PERMISO
// =============================================
class SolicitudPermiso {

  // Generar código único: SOL-2025-000001
  static async generarCodigo() {
    const anio = new Date().getFullYear();
    const query = `
      SELECT codigo_solicitud
      FROM solicitud_permiso
      WHERE codigo_solicitud LIKE $1
      ORDER BY codigo_solicitud DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [`SOL-${anio}-%`]);

    if (result.rows.length === 0) {
      return `SOL-${anio}-000001`;
    }

    const ultimo = result.rows[0].codigo_solicitud;
    const partes = ultimo.split('-');
    const num = parseInt(partes[partes.length - 1]) + 1;
    return `SOL-${anio}-${num.toString().padStart(6, '0')}`;
  }

  // Crear solicitud de permiso
  static async create(data) {
    const {
      estudiante_id, padre_familia_id, asignacion_docente_id,
      fecha_ausencia, es_dia_completo, hora_inicio, hora_fin,
      motivo, descripcion, archivo_adjunto_url
    } = data;

    const codigo_solicitud = await this.generarCodigo();

    const query = `
      INSERT INTO solicitud_permiso (
        codigo_solicitud, estudiante_id, padre_familia_id, asignacion_docente_id,
        fecha_ausencia, es_dia_completo, hora_inicio, hora_fin,
        motivo, descripcion, archivo_adjunto_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await pool.query(query, [
      codigo_solicitud, estudiante_id, padre_familia_id, asignacion_docente_id || null,
      fecha_ausencia, es_dia_completo ?? true, hora_inicio || null, hora_fin || null,
      motivo, descripcion || null, archivo_adjunto_url || null
    ]);

    // Insertar historial inicial
    await pool.query(`
      INSERT INTO solicitud_permiso_historial
        (solicitud_permiso_id, estado_anterior, estado_nuevo, comentario)
      VALUES ($1, NULL, 'pendiente', 'Solicitud creada')
    `, [result.rows[0].id]);

    return result.rows[0];
  }

  // Listar solicitudes con filtros
  static async findAll(filters = {}) {
    const {
      page = 1, limit = 10,
      estudiante_id, padre_familia_id, estado,
      fecha_inicio, fecha_fin, asignacion_docente_id
    } = filters;
    const offset = (page - 1) * limit;

    let where = [];
    let params = [];
    let p = 1;

    if (estudiante_id) {
      where.push(`sp.estudiante_id = $${p++}`);
      params.push(estudiante_id);
    }
    if (padre_familia_id) {
      where.push(`sp.padre_familia_id = $${p++}`);
      params.push(padre_familia_id);
    }
    if (estado) {
      where.push(`sp.estado = $${p++}`);
      params.push(estado);
    }
    if (fecha_inicio) {
      where.push(`sp.fecha_ausencia >= $${p++}`);
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      where.push(`sp.fecha_ausencia <= $${p++}`);
      params.push(fecha_fin);
    }
    if (asignacion_docente_id) {
      where.push(`sp.asignacion_docente_id = $${p++}`);
      params.push(asignacion_docente_id);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM solicitud_permiso sp ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT
        sp.*,
        e.nombres      AS estudiante_nombres,
        e.apellidos    AS estudiante_apellidos,
        e.codigo       AS estudiante_codigo,
        pf.nombres     AS padre_nombres,
        pf.apellidos   AS padre_apellidos,
        pf.telefono    AS padre_telefono,
        mat.nombre     AS materia_nombre,
        u.username     AS revisado_por_username
      FROM solicitud_permiso sp
      INNER JOIN estudiante e      ON sp.estudiante_id = e.id
      LEFT JOIN  padre_familia pf  ON sp.padre_familia_id = pf.id
      LEFT JOIN  asignacion_docente ad ON sp.asignacion_docente_id = ad.id
      LEFT JOIN  grado_materia gm  ON ad.grado_materia_id = gm.id
      LEFT JOIN  materia mat       ON gm.materia_id = mat.id
      LEFT JOIN  usuarios u        ON sp.revisado_por = u.id
      ${whereClause}
      ORDER BY sp.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `;

    const result = await pool.query(dataQuery, [...params, limit, offset]);

    return {
      solicitudes: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Obtener por ID
  static async findById(id) {
    const query = `
      SELECT
        sp.*,
        e.nombres      AS estudiante_nombres,
        e.apellidos    AS estudiante_apellidos,
        e.codigo       AS estudiante_codigo,
        e.foto_url     AS estudiante_foto,
        pf.nombres     AS padre_nombres,
        pf.apellidos   AS padre_apellidos,
        pf.telefono    AS padre_telefono,
        mat.nombre     AS materia_nombre,
        u.username     AS revisado_por_username
      FROM solicitud_permiso sp
      INNER JOIN estudiante e      ON sp.estudiante_id = e.id
      LEFT JOIN  padre_familia pf  ON sp.padre_familia_id = pf.id
      LEFT JOIN  asignacion_docente ad ON sp.asignacion_docente_id = ad.id
      LEFT JOIN  grado_materia gm  ON ad.grado_materia_id = gm.id
      LEFT JOIN  materia mat       ON gm.materia_id = mat.id
      LEFT JOIN  usuarios u        ON sp.revisado_por = u.id
      WHERE sp.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Aprobar o rechazar solicitud
  static async cambiarEstado(id, { estado, revisado_por, motivo_rechazo, observaciones_revisor }) {
    const estadosValidos = ['aprobada', 'rechazada', 'cancelada'];
    if (!estadosValidos.includes(estado)) {
      throw new Error(`Estado inválido: ${estado}`);
    }

    const query = `
      UPDATE solicitud_permiso
      SET
        estado                = $1,
        revisado_por          = $2,
        fecha_revision        = CURRENT_TIMESTAMP,
        motivo_rechazo        = $3,
        observaciones_revisor = $4,
        updated_at            = CURRENT_TIMESTAMP
      WHERE id = $5
        AND estado = 'pendiente'
      RETURNING *
    `;

    const result = await pool.query(query, [
      estado, revisado_por,
      motivo_rechazo || null, observaciones_revisor || null,
      id
    ]);

    if (!result.rows[0]) {
      throw new Error('Solicitud no encontrada o ya fue procesada');
    }

    return result.rows[0];
  }

  // Historial de una solicitud
  static async getHistorial(solicitud_permiso_id) {
    const query = `
      SELECT
        sph.*,
        u.username AS usuario_username
      FROM solicitud_permiso_historial sph
      LEFT JOIN usuarios u ON sph.usuario_id = u.id
      WHERE sph.solicitud_permiso_id = $1
      ORDER BY sph.created_at ASC
    `;
    const result = await pool.query(query, [solicitud_permiso_id]);
    return result.rows;
  }

  // Verificar si ya existe solicitud para la misma fecha/estudiante
  static async existeParaFecha(estudiante_id, fecha_ausencia, asignacion_docente_id = null) {
    const query = `
      SELECT id FROM solicitud_permiso
      WHERE estudiante_id = $1
        AND fecha_ausencia = $2
        AND estado NOT IN ('rechazada', 'cancelada')
        AND (
          $3::INTEGER IS NULL
          OR asignacion_docente_id = $3
          OR asignacion_docente_id IS NULL
        )
      LIMIT 1
    `;
    const result = await pool.query(query, [estudiante_id, fecha_ausencia, asignacion_docente_id]);
    return result.rows[0] || null;
  }
}

// =============================================
// ASISTENCIA
// =============================================
class Asistencia {

  // Registrar asistencia (individual)
  static async create(data) {
    const {
      matricula_id, asignacion_docente_id, fecha, estado,
      solicitud_permiso_id, justificacion, marcado_por,
      hora_marcacion, dispositivo, observaciones
    } = data;

    const query = `
      INSERT INTO asistencia (
        matricula_id, asignacion_docente_id, fecha, estado,
        solicitud_permiso_id, justificacion, marcado_por,
        hora_marcacion, dispositivo, observaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (matricula_id, asignacion_docente_id, fecha)
      DO UPDATE SET
        estado               = EXCLUDED.estado,
        solicitud_permiso_id = EXCLUDED.solicitud_permiso_id,
        justificacion        = EXCLUDED.justificacion,
        marcado_por          = EXCLUDED.marcado_por,
        hora_marcacion       = EXCLUDED.hora_marcacion,
        dispositivo          = EXCLUDED.dispositivo,
        observaciones        = EXCLUDED.observaciones,
        updated_at           = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      matricula_id, asignacion_docente_id, fecha, estado,
      solicitud_permiso_id || null, justificacion || null, marcado_por,
      hora_marcacion || new Date().toTimeString().slice(0, 8),
      dispositivo || 'web', observaciones || null
    ]);

    return result.rows[0];
  }

  // Registrar asistencia masiva (lista completa de un paralelo/materia)
  // data.registros = [{ matricula_id, estado, observaciones? }, ...]
  static async registrarMasivo({ asignacion_docente_id, fecha, marcado_por, dispositivo, registros }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Validar que todas las matrículas del payload pertenecen al paralelo
      // Y al período académico correctos de esta asignación docente.
      // Esto evita que lleguen IDs de otros grados por error o manipulación.
      const matriculaIds = registros.map(r => r.matricula_id);

      const validacionRes = await client.query(`
        SELECT m.id
        FROM matricula m
        INNER JOIN asignacion_docente ad ON ad.id = $1
        WHERE m.id                   = ANY($2::int[])
          AND m.paralelo_id          = ad.paralelo_id
          AND m.periodo_academico_id = ad.periodo_academico_id
          AND m.estado               = 'activo'
          AND m.deleted_at           IS NULL
      `, [asignacion_docente_id, matriculaIds]);

      const idsValidos = new Set(validacionRes.rows.map(r => r.id));
      const idsInvalidos = matriculaIds.filter(id => !idsValidos.has(id));

      if (idsInvalidos.length > 0) {
        throw new Error(
          `Las siguientes matrículas no pertenecen a este paralelo/período: ${idsInvalidos.join(', ')}`
        );
      }

      const hora_marcacion = new Date().toTimeString().slice(0, 8);
      const resultados = [];

      for (const reg of registros) {
        const q = `
          INSERT INTO asistencia (
            matricula_id, asignacion_docente_id, fecha, estado,
            solicitud_permiso_id, justificacion, marcado_por,
            hora_marcacion, dispositivo, observaciones
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (matricula_id, asignacion_docente_id, fecha)
          DO UPDATE SET
            estado         = EXCLUDED.estado,
            marcado_por    = EXCLUDED.marcado_por,
            hora_marcacion = EXCLUDED.hora_marcacion,
            observaciones  = EXCLUDED.observaciones,
            updated_at     = CURRENT_TIMESTAMP
          RETURNING *
        `;
        const r = await client.query(q, [
          reg.matricula_id, asignacion_docente_id, fecha, reg.estado,
          reg.solicitud_permiso_id || null, reg.justificacion || null, marcado_por,
          hora_marcacion, dispositivo || 'web', reg.observaciones || null
        ]);
        resultados.push(r.rows[0]);
      }

      await client.query('COMMIT');
      return resultados;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Listar asistencia con filtros
  static async findAll(filters = {}) {
    const {
      page = 1, limit = 10,
      matricula_id, asignacion_docente_id,
      fecha, fecha_inicio, fecha_fin, estado
    } = filters;
    const offset = (page - 1) * limit;

    let where = [];
    let params = [];
    let p = 1;

    if (matricula_id) {
      where.push(`a.matricula_id = $${p++}`);
      params.push(matricula_id);
    }
    if (asignacion_docente_id) {
      where.push(`a.asignacion_docente_id = $${p++}`);
      params.push(asignacion_docente_id);
    }
    if (fecha) {
      where.push(`a.fecha = $${p++}`);
      params.push(fecha);
    }
    if (fecha_inicio) {
      where.push(`a.fecha >= $${p++}`);
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      where.push(`a.fecha <= $${p++}`);
      params.push(fecha_fin);
    }
    if (estado) {
      where.push(`a.estado = $${p++}`);
      params.push(estado);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM asistencia a ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT
        a.*,
        e.nombres   AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos,
        e.codigo    AS estudiante_codigo,
        mat.nombre  AS materia_nombre,
        u.username  AS marcado_por_username
      FROM asistencia a
      INNER JOIN matricula m         ON a.matricula_id = m.id
      INNER JOIN estudiante e        ON m.estudiante_id = e.id
      INNER JOIN asignacion_docente ad ON a.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm    ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat         ON gm.materia_id = mat.id
      INNER JOIN usuarios u          ON a.marcado_por = u.id
      ${whereClause}
      ORDER BY a.fecha DESC, e.apellidos, e.nombres
      LIMIT $${p} OFFSET $${p + 1}
    `;

    const result = await pool.query(dataQuery, [...params, limit, offset]);

    return {
      asistencias: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Obtener asistencia por ID
  static async findById(id) {
    const query = `
      SELECT
        a.*,
        e.nombres   AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos,
        e.codigo    AS estudiante_codigo,
        mat.nombre  AS materia_nombre,
        u.username  AS marcado_por_username,
        sp.codigo_solicitud AS permiso_codigo
      FROM asistencia a
      INNER JOIN matricula m           ON a.matricula_id = m.id
      INNER JOIN estudiante e          ON m.estudiante_id = e.id
      INNER JOIN asignacion_docente ad ON a.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm      ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat           ON gm.materia_id = mat.id
      INNER JOIN usuarios u            ON a.marcado_por = u.id
      LEFT JOIN  solicitud_permiso sp  ON a.solicitud_permiso_id = sp.id
      WHERE a.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Actualizar registro de asistencia
  static async update(id, data) {
    const { estado, justificacion, observaciones, solicitud_permiso_id } = data;

    const query = `
      UPDATE asistencia
      SET
        estado               = COALESCE($1, estado),
        justificacion        = $2,
        observaciones        = $3,
        solicitud_permiso_id = $4,
        updated_at           = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;

    const result = await pool.query(query, [
      estado, justificacion || null,
      observaciones || null, solicitud_permiso_id || null,
      id
    ]);
    return result.rows[0];
  }

  // Reporte de asistencia (llama al stored procedure)
  static async getReporte({ matricula_id, asignacion_docente_id, fecha_inicio, fecha_fin }) {
    const query = `
      SELECT * FROM reporte_asistencia_estudiante($1, $2, $3, $4)
    `;
    const result = await pool.query(query, [
      matricula_id,
      asignacion_docente_id || null,
      fecha_inicio || null,
      fecha_fin || null
    ]);
    return result.rows;
  }

  // Obtener asistencia del día para una asignación docente (lista de paralelo)
  static async getListaDia({ asignacion_docente_id, fecha }) {
    const query = `
      SELECT
        a.id,
        a.estado,
        a.hora_marcacion,
        a.observaciones,
        a.solicitud_permiso_id,
        m.id        AS matricula_id,
        e.id        AS estudiante_id,
        e.codigo    AS estudiante_codigo,
        e.nombres   AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos,
        e.foto_url  AS estudiante_foto
      FROM asignacion_docente ad
      -- Con el JOIN directo obtenemos paralelo_id Y periodo_academico_id en un solo paso
      INNER JOIN matricula m
        ON  m.paralelo_id          = ad.paralelo_id
        AND m.periodo_academico_id = ad.periodo_academico_id
        AND m.estado               = 'activo'
        AND m.deleted_at           IS NULL
      INNER JOIN estudiante e ON e.id = m.estudiante_id
      LEFT JOIN asistencia a
        ON  a.matricula_id          = m.id
        AND a.asignacion_docente_id = $1
        AND a.fecha                 = $2
      WHERE ad.id     = $1
        AND ad.activo = true
      ORDER BY e.apellidos, e.nombres
    `;

    const result = await pool.query(query, [asignacion_docente_id, fecha]);
    return result.rows;
  }
  static async getMisAsignaciones({ usuario_id, fecha }) {
    const query = `
      SELECT
        ad.id                     AS asignacion_id,
        ad.es_titular,
        ad.grado_materia_id,
        -- Materia
        mat.id                    AS materia_id,
        mat.nombre                AS materia_nombre,
        mat.codigo                AS materia_codigo,
        mat.color                 AS materia_color,
        -- Grado y nivel
        g.id                      AS grado_id,
        g.nombre                  AS grado_nombre,
        n.nombre                  AS nivel_nombre,
        -- Paralelo y turno
        p.id                      AS paralelo_id,
        p.nombre                  AS paralelo_nombre,
        p.aula,
        t.nombre                  AS turno_nombre,
        t.hora_inicio             AS turno_hora_inicio,
        t.hora_fin                AS turno_hora_fin,
        -- Período académico
        pa.id                     AS periodo_academico_id,
        pa.nombre                 AS periodo_nombre,
        pe.id                     AS periodo_evaluacion_id,
        -- Resumen del día para esta asignación
        COUNT(m.id)               AS total_estudiantes,
        COUNT(a.id)               AS total_marcados,
        COUNT(m.id) - COUNT(a.id) AS total_pendientes,
        COUNT(CASE WHEN a.estado = 'presente'      THEN 1 END) AS presentes,
        COUNT(CASE WHEN a.estado = 'ausente'       THEN 1 END) AS ausentes,
        COUNT(CASE WHEN a.estado = 'tardanza'      THEN 1 END) AS tardanzas,
        COUNT(CASE WHEN a.estado = 'justificado'   THEN 1 END) AS justificados,
        COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END) AS faltas_parciales,
        -- ¿Ya se tomó asistencia hoy? (true si todos están marcados)
        CASE
          WHEN COUNT(m.id) > 0 AND COUNT(m.id) = COUNT(a.id) THEN true
          ELSE false
        END                       AS asistencia_completa
      FROM docente d
      INNER JOIN asignacion_docente ad  ON ad.docente_id          = d.id
                                       AND ad.activo              = true
                                       AND ad.deleted_at          IS NULL
      INNER JOIN grado_materia gm       ON ad.grado_materia_id    = gm.id
      INNER JOIN materia mat            ON gm.materia_id          = mat.id
      INNER JOIN grado g                ON gm.grado_id            = g.id
      INNER JOIN nivel_academico n      ON g.nivel_academico_id   = n.id
      INNER JOIN paralelo p             ON ad.paralelo_id         = p.id
      INNER JOIN turno t                ON p.turno_id             = t.id
      INNER JOIN periodo_academico pa   ON ad.periodo_academico_id = pa.id
      INNER JOIN periodo_evaluacion pe
      ON  pe.periodo_academico_id = pa.id
      AND pe.activo               = true
      AND CURRENT_DATE BETWEEN pe.fecha_inicio AND pe.fecha_fin
      -- Matrículas activas de ese paralelo/período
      LEFT JOIN matricula m
        ON  m.paralelo_id          = ad.paralelo_id
        AND m.periodo_academico_id = ad.periodo_academico_id
        AND m.estado               = 'activo'
        AND m.deleted_at           IS NULL
      -- Asistencia del día solicitado
      LEFT JOIN asistencia a
        ON  a.matricula_id          = m.id
        AND a.asignacion_docente_id = ad.id
        AND a.fecha                 = $2
      WHERE d.usuario_id = $1
      GROUP BY
        ad.id, ad.es_titular,
        mat.id, mat.nombre, mat.codigo, mat.color,
        g.id, g.nombre, n.nombre,
        p.id, p.nombre, p.aula,
        t.nombre, t.hora_inicio, t.hora_fin,
        pa.id, pa.nombre
        , pe.id
      ORDER BY t.hora_inicio, mat.nombre
    `;

    const result = await pool.query(query, [usuario_id, fecha]);
    return result.rows;
  }
  static async getReporteClase({ asignacion_docente_id, fecha_inicio = null, fecha_fin = null }) {
    const query = `
      SELECT * FROM reporte_asistencia_clase($1, $2, $3)
    `;
    const result = await pool.query(query, [asignacion_docente_id, fecha_inicio, fecha_fin]);
    return result.rows;
  }
 
  // Resumen agregado de la clase (totales en un solo row)
  static async getResumenClase({ asignacion_docente_id, fecha_inicio = null, fecha_fin = null }) {
    const query = `
      SELECT * FROM resumen_asistencia_clase($1, $2, $3)
    `;
    const result = await pool.query(query, [asignacion_docente_id, fecha_inicio, fecha_fin]);
    return result.rows[0] || null;
  }
 
  // Eliminar registro (soft: pone estado null no, eliminación real solo admin)
  // Para el docente usamos update → en vez de delete proveemos corrección
  static async corregir(id, { estado, justificacion, observaciones, solicitud_permiso_id, corregido_por }) {
    // Primero verificar que existe
    const check = await pool.query('SELECT id FROM asistencia WHERE id = $1', [id]);
    if (!check.rows[0]) throw new Error('Registro de asistencia no encontrado');
 
    const query = `
      UPDATE asistencia
      SET
        estado               = COALESCE($1, estado),
        justificacion        = $2,
        observaciones        = $3,
        solicitud_permiso_id = $4,
        marcado_por          = $5,
        updated_at           = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
    const result = await pool.query(query, [
      estado,
      justificacion        || null,
      observaciones        || null,
      solicitud_permiso_id || null,
      corregido_por,
      id,
    ]);
    return result.rows[0];
  }
}

export { SolicitudPermiso, Asistencia };