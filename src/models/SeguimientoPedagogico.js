// models/SeguimientoPedagogico.js
import { pool } from '../db/pool.js';

// =============================================
// OBSERVACION PEDAGOGICA
// =============================================
class ObservacionPedagogica {

  // Generar código único: OBS-2025-000001
  static async generarCodigo() {
    const anio = new Date().getFullYear();
    const query = `
      SELECT codigo_observacion
      FROM observacion_pedagogica
      WHERE codigo_observacion LIKE $1
      ORDER BY codigo_observacion DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [`OBS-${anio}-%`]);

    if (result.rows.length === 0) return `OBS-${anio}-000001`;

    const ultimo = result.rows[0].codigo_observacion;
    const partes  = ultimo.split('-');
    const num     = parseInt(partes[partes.length - 1]) + 1;
    return `OBS-${anio}-${num.toString().padStart(6, '0')}`;
  }

  // Crear observación
  static async create(data) {
    const {
      docente_id, matricula_id, asignacion_docente_id, periodo_academico_id,
      categoria_observacion_id, nivel_relevancia, descripcion,
      fecha_ocurrencia, plantilla_id, visible_para_padre, publicado_por
    } = data;

    const codigo_observacion = await this.generarCodigo();

    const query = `
      INSERT INTO observacion_pedagogica (
        codigo_observacion,
        docente_id, matricula_id, asignacion_docente_id, periodo_academico_id,
        categoria_observacion_id, nivel_relevancia, descripcion,
        fecha_ocurrencia, plantilla_id, visible_para_padre,
        publicado_por, fecha_publicacion
      )
      VALUES (
        $1,
        $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, CASE WHEN $11 THEN CURRENT_TIMESTAMP ELSE NULL END
      )
      RETURNING *
    `;

    const result = await pool.query(query, [
      codigo_observacion,
      docente_id, matricula_id, asignacion_docente_id || null, periodo_academico_id,
      categoria_observacion_id, nivel_relevancia || 'informativo', descripcion,
      fecha_ocurrencia || new Date().toISOString().split('T')[0],
      plantilla_id || null, visible_para_padre ?? false,
      publicado_por || null
    ]);

    return result.rows[0];
  }

  // Listar con filtros (vista del docente)
  static async findAll(filters = {}) {
    const {
      page = 1, limit = 20,
      matricula_id, docente_id, asignacion_docente_id, periodo_academico_id,
      categoria_observacion_id, nivel_relevancia,
      visible_para_padre, fecha_inicio, fecha_fin,
      solo_activos = true
    } = filters;

    const offset = (page - 1) * limit;
    const where  = [];
    const params = [];
    let p = 1;

    if (solo_activos) {
      where.push(`op.activo = true AND op.deleted_at IS NULL`);
    }
    if (matricula_id) {
      where.push(`op.matricula_id = $${p++}`);
      params.push(matricula_id);
    }
    if (docente_id) {
      where.push(`op.docente_id = $${p++}`);
      params.push(docente_id);
    }
    if (asignacion_docente_id) {
      where.push(`op.asignacion_docente_id = $${p++}`);
      params.push(asignacion_docente_id);
    }
    if (periodo_academico_id) {
      where.push(`op.periodo_academico_id = $${p++}`);
      params.push(periodo_academico_id);
    }
    if (categoria_observacion_id) {
      where.push(`op.categoria_observacion_id = $${p++}`);
      params.push(categoria_observacion_id);
    }
    if (nivel_relevancia) {
      where.push(`op.nivel_relevancia = $${p++}`);
      params.push(nivel_relevancia);
    }
    if (visible_para_padre !== undefined && visible_para_padre !== null) {
      where.push(`op.visible_para_padre = $${p++}`);
      params.push(visible_para_padre);
    }
    if (fecha_inicio) {
      where.push(`op.fecha_ocurrencia >= $${p++}`);
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      where.push(`op.fecha_ocurrencia <= $${p++}`);
      params.push(fecha_fin);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM observacion_pedagogica op ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT
        op.*,
        co.nombre        AS categoria_nombre,
        co.color         AS categoria_color,
        co.icono         AS categoria_icono,
        e.nombres        AS estudiante_nombres,
        e.apellidos      AS estudiante_apellidos,
        e.codigo         AS estudiante_codigo,
        e.foto_url       AS estudiante_foto,
        d.nombres        AS docente_nombres,
        d.apellido_paterno AS docente_apellido,
        mat.nombre       AS materia_nombre,
        pa.nombre        AS periodo_nombre,
        -- Acuse de recibo (si hay alguno)
        COUNT(arp.id)    AS total_acuses,
        MAX(arp.fecha_lectura) AS ultimo_acuse
      FROM observacion_pedagogica op
      INNER JOIN categoria_observacion co  ON op.categoria_observacion_id = co.id
      INNER JOIN matricula m              ON op.matricula_id = m.id
      INNER JOIN estudiante e             ON m.estudiante_id = e.id
      INNER JOIN docente d                ON op.docente_id = d.id
      INNER JOIN periodo_academico pa     ON op.periodo_academico_id = pa.id
      LEFT JOIN  asignacion_docente ad    ON op.asignacion_docente_id = ad.id
      LEFT JOIN  grado_materia gm         ON ad.grado_materia_id = gm.id
      LEFT JOIN  materia mat              ON gm.materia_id = mat.id
      LEFT JOIN  acuse_recibo_padre arp   ON op.id = arp.observacion_pedagogica_id
      ${whereClause}
      GROUP BY
        op.id, co.nombre, co.color, co.icono,
        e.nombres, e.apellidos, e.codigo, e.foto_url,
        d.nombres, d.apellido_paterno,
        mat.nombre, pa.nombre
      ORDER BY op.fecha_ocurrencia DESC, op.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `;

    const result = await pool.query(dataQuery, [...params, limit, offset]);

    return {
      observaciones: result.rows,
      paginacion: {
        total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Obtener por ID
  static async findById(id) {
    const query = `
      SELECT
        op.*,
        co.nombre        AS categoria_nombre,
        co.color         AS categoria_color,
        co.icono         AS categoria_icono,
        e.nombres        AS estudiante_nombres,
        e.apellidos      AS estudiante_apellidos,
        e.codigo         AS estudiante_codigo,
        e.foto_url       AS estudiante_foto,
        d.nombres        AS docente_nombres,
        d.apellido_paterno AS docente_apellido,
        mat.nombre       AS materia_nombre,
        pa.nombre        AS periodo_nombre,
        u.username       AS publicado_por_username,
        pl.texto         AS plantilla_texto
      FROM observacion_pedagogica op
      INNER JOIN categoria_observacion co  ON op.categoria_observacion_id = co.id
      INNER JOIN matricula m              ON op.matricula_id = m.id
      INNER JOIN estudiante e             ON m.estudiante_id = e.id
      INNER JOIN docente d                ON op.docente_id = d.id
      INNER JOIN periodo_academico pa     ON op.periodo_academico_id = pa.id
      LEFT JOIN  asignacion_docente ad    ON op.asignacion_docente_id = ad.id
      LEFT JOIN  grado_materia gm         ON ad.grado_materia_id = gm.id
      LEFT JOIN  materia mat              ON gm.materia_id = mat.id
      LEFT JOIN  usuarios u               ON op.publicado_por = u.id
      LEFT JOIN  plantilla_observacion pl ON op.plantilla_id = pl.id
      WHERE op.id = $1 AND op.deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Actualizar observación
  static async update(id, data) {
    const {
      categoria_observacion_id, nivel_relevancia,
      descripcion, fecha_ocurrencia
    } = data;

    const query = `
      UPDATE observacion_pedagogica
      SET
        categoria_observacion_id = COALESCE($1, categoria_observacion_id),
        nivel_relevancia         = COALESCE($2, nivel_relevancia),
        descripcion              = COALESCE($3, descripcion),
        fecha_ocurrencia         = COALESCE($4, fecha_ocurrencia),
        updated_at               = CURRENT_TIMESTAMP
      WHERE id = $5
        AND activo = true
        AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [
      categoria_observacion_id || null,
      nivel_relevancia         || null,
      descripcion              || null,
      fecha_ocurrencia         || null,
      id
    ]);

    if (!result.rows[0]) throw new Error('Observación no encontrada o ya eliminada');
    return result.rows[0];
  }

  // Cambiar visibilidad para el padre
  static async cambiarVisibilidad(id, { visible_para_padre, publicado_por }) {
    const query = `
      UPDATE observacion_pedagogica
      SET
        visible_para_padre = $1,
        publicado_por      = $2,
        updated_at         = CURRENT_TIMESTAMP
      WHERE id = $3
        AND activo = true
        AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, [visible_para_padre, publicado_por, id]);
    if (!result.rows[0]) throw new Error('Observación no encontrada');
    return result.rows[0];
  }

  // Soft delete
  static async softDelete(id) {
    const query = `
      UPDATE observacion_pedagogica
      SET
        activo     = false,
        deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND activo = true
        AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    if (!result.rows[0]) throw new Error('Observación no encontrada o ya eliminada');
    return result.rows[0];
  }

  // Historial de auditoría
  static async getHistorial(observacion_id) {
    const query = `
      SELECT
        oph.*,
        u.username AS usuario_username
      FROM observacion_pedagogica_historial oph
      LEFT JOIN usuarios u ON oph.usuario_id = u.id
      WHERE oph.observacion_pedagogica_id = $1
      ORDER BY oph.created_at ASC
    `;
    const result = await pool.query(query, [observacion_id]);
    return result.rows;
  }

  // Línea de tiempo (stored procedure)
  static async getLineaTiempo({
    matricula_id, periodo_academico_id, categoria_id,
    nivel_relevancia, solo_visibles_padre
  }) {
    const query = `
      SELECT * FROM linea_tiempo_observaciones($1, $2, $3, $4, $5)
    `;
    const result = await pool.query(query, [
      matricula_id,
      periodo_academico_id || null,
      categoria_id         || null,
      nivel_relevancia      || null,
      solo_visibles_padre  ?? false
    ]);
    return result.rows;
  }

  // Resumen por asignación docente (stored procedure)
  static async getResumenPorAsignacion({ asignacion_docente_id, periodo_academico_id }) {
    const query = `SELECT * FROM resumen_obs_por_asignacion($1, $2)`;
    const result = await pool.query(query, [
      asignacion_docente_id,
      periodo_academico_id || null
    ]);
    return result.rows;
  }
}

// =============================================
// ACUSE RECIBO PADRE
// =============================================
class AcuseReciboPadre {

  // Registrar acuse de recibo
  static async create({ observacion_pedagogica_id, padre_familia_id, comentario_padre }) {
    // Verificar que la observación es visible para el padre
    const check = await pool.query(`
      SELECT id FROM observacion_pedagogica
      WHERE id = $1
        AND visible_para_padre = true
        AND activo = true
        AND deleted_at IS NULL
    `, [observacion_pedagogica_id]);

    if (!check.rows[0]) {
      throw new Error('Observación no encontrada o no está disponible para el padre');
    }

    const query = `
      INSERT INTO acuse_recibo_padre (
        observacion_pedagogica_id, padre_familia_id,
        fecha_lectura, comentario_padre
      )
      VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
      ON CONFLICT (observacion_pedagogica_id, padre_familia_id)
      DO UPDATE SET
        comentario_padre = COALESCE(EXCLUDED.comentario_padre, acuse_recibo_padre.comentario_padre)
      RETURNING *
    `;

    const result = await pool.query(query, [
      observacion_pedagogica_id,
      padre_familia_id,
      comentario_padre || null
    ]);

    return result.rows[0];
  }

  // Listar acuses de una observación
  static async findByObservacion(observacion_id) {
    const query = `
      SELECT
        arp.*,
        pf.nombres     AS padre_nombres,
        pf.apellidos   AS padre_apellidos,
        pf.parentesco
      FROM acuse_recibo_padre arp
      INNER JOIN padre_familia pf ON arp.padre_familia_id = pf.id
      WHERE arp.observacion_pedagogica_id = $1
      ORDER BY arp.fecha_lectura ASC
    `;
    const result = await pool.query(query, [observacion_id]);
    return result.rows;
  }

  // Resumen del padre — cuántas observaciones tiene sin leer por hijo
  static async getResumenPadre({ padre_familia_id, periodo_academico_id }) {
    const query = `SELECT * FROM resumen_observaciones_padre($1, $2)`;
    const result = await pool.query(query, [
      padre_familia_id,
      periodo_academico_id || null
    ]);
    return result.rows;
  }

  // Observaciones de un hijo para el padre (solo visibles)
  static async getObservacionesHijo({ matricula_id, padre_familia_id, periodo_academico_id }) {
    const query = `
      SELECT
        op.id,
        op.codigo_observacion,
        op.fecha_ocurrencia,
        op.nivel_relevancia,
        op.descripcion,
        op.fecha_publicacion,
        co.nombre   AS categoria_nombre,
        co.color    AS categoria_color,
        co.icono    AS categoria_icono,
        mat.nombre  AS materia_nombre,
        (d.nombres || ' ' || d.apellido_paterno) AS docente_nombre,
        arp.fecha_lectura,
        arp.comentario_padre,
        (arp.id IS NOT NULL) AS ya_leido
      FROM observacion_pedagogica op
      INNER JOIN categoria_observacion co ON op.categoria_observacion_id = co.id
      INNER JOIN docente d                ON op.docente_id = d.id
      LEFT JOIN  asignacion_docente ad    ON op.asignacion_docente_id = ad.id
      LEFT JOIN  grado_materia gm         ON ad.grado_materia_id = gm.id
      LEFT JOIN  materia mat              ON gm.materia_id = mat.id
      LEFT JOIN  acuse_recibo_padre arp   ON op.id = arp.observacion_pedagogica_id
                                        AND arp.padre_familia_id = $2
      WHERE op.matricula_id      = $1
        AND op.visible_para_padre = true
        AND op.activo             = true
        AND op.deleted_at         IS NULL
        AND ($3::INTEGER IS NULL OR op.periodo_academico_id = $3)
      ORDER BY op.fecha_ocurrencia DESC, op.created_at DESC
    `;

    const result = await pool.query(query, [
      matricula_id,
      padre_familia_id,
      periodo_academico_id || null
    ]);
    return result.rows;
  }
}

// =============================================
// CATEGORÍAS Y PLANTILLAS
// =============================================
class CategoriaObservacion {

  static async findAll() {
    const query = `
      SELECT
        co.*,
        COUNT(pl.id) AS total_plantillas
      FROM categoria_observacion co
      LEFT JOIN plantilla_observacion pl ON co.id = pl.categoria_observacion_id AND pl.activo = true
      WHERE co.activo = true
      GROUP BY co.id
      ORDER BY co.orden, co.nombre
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  static async getPlantillas(categoria_id) {
    const query = `
      SELECT *
      FROM plantilla_observacion
      WHERE categoria_observacion_id = $1
        AND activo = true
      ORDER BY nivel_relevancia, orden
    `;
    const result = await pool.query(query, [categoria_id]);
    return result.rows;
  }

  static async getAllPlantillas() {
    const query = `
      SELECT
        pl.*,
        co.nombre AS categoria_nombre,
        co.color  AS categoria_color,
        co.icono  AS categoria_icono
      FROM plantilla_observacion pl
      INNER JOIN categoria_observacion co ON pl.categoria_observacion_id = co.id
      WHERE pl.activo = true
        AND co.activo = true
      ORDER BY co.orden, pl.nivel_relevancia, pl.orden
    `;
    const result = await pool.query(query);
    return result.rows;
  }
}

export { ObservacionPedagogica, AcuseReciboPadre, CategoriaObservacion };