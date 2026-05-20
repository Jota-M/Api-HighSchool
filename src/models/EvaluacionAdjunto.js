// models/EvaluacionAdjunto.js
import { pool } from '../db/pool.js';

// =============================================
// ADJUNTOS DE EVALUACIÓN (foto + PDF)
// =============================================
class EvaluacionAdjunto {

  // Guardar URL de foto subida a Cloudinary
  static async guardarFoto(evaluacion_id, { foto_url, foto_public_id }) {
    const result = await pool.query(`
      UPDATE evaluacion
      SET
        foto_url       = $1,
        foto_public_id = $2,
        updated_at     = CURRENT_TIMESTAMP
      WHERE id = $3 AND activo = true
      RETURNING id, nombre, foto_url, foto_public_id, pdf_url, pdf_nombre,
                visible_para_padres, publicado_en
    `, [foto_url, foto_public_id, evaluacion_id]);

    if (!result.rows[0]) throw new Error('Evaluación no encontrada o inactiva');
    return result.rows[0];
  }

  // Guardar URL de PDF subido a Cloudinary
  static async guardarPdf(evaluacion_id, { pdf_url, pdf_public_id, pdf_nombre }) {
    const result = await pool.query(`
      UPDATE evaluacion
      SET
        pdf_url        = $1,
        pdf_public_id  = $2,
        pdf_nombre     = $3,
        updated_at     = CURRENT_TIMESTAMP
      WHERE id = $4 AND activo = true
      RETURNING id, nombre, foto_url, foto_public_id, pdf_url, pdf_public_id,
                pdf_nombre, visible_para_padres, publicado_en
    `, [pdf_url, pdf_public_id, pdf_nombre, evaluacion_id]);

    if (!result.rows[0]) throw new Error('Evaluación no encontrada o inactiva');
    return result.rows[0];
  }

  // Eliminar foto (limpia las columnas, el borrado en Cloudinary va en el controller)
  static async eliminarFoto(evaluacion_id) {
    const result = await pool.query(`
      UPDATE evaluacion
      SET foto_url = NULL, foto_public_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, foto_public_id
    `, [evaluacion_id]);
    return result.rows[0];
  }

  // Eliminar PDF
  static async eliminarPdf(evaluacion_id) {
    const result = await pool.query(`
      UPDATE evaluacion
      SET pdf_url = NULL, pdf_public_id = NULL, pdf_nombre = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, pdf_public_id
    `, [evaluacion_id]);
    return result.rows[0];
  }

  // Publicar evaluación hacia padres/estudiantes
  // Si ya estaba publicada, solo actualiza fecha_limite e instrucciones
  static async publicar(evaluacion_id, { fecha_limite, instrucciones }) {
    const result = await pool.query(`
      UPDATE evaluacion
      SET
        visible_para_padres = true,
        publicado_en        = COALESCE(publicado_en, CURRENT_TIMESTAMP),
        fecha_limite        = $1,
        instrucciones       = $2,
        updated_at          = CURRENT_TIMESTAMP
      WHERE id = $3 AND activo = true
      RETURNING id, nombre, visible_para_padres, publicado_en,
                fecha_limite, instrucciones, foto_url, pdf_url, pdf_nombre
    `, [fecha_limite || null, instrucciones || null, evaluacion_id]);

    if (!result.rows[0]) throw new Error('Evaluación no encontrada o inactiva');
    return result.rows[0];
  }

  // Despublicar (ocultar a padres/estudiantes)
  static async despublicar(evaluacion_id) {
    const result = await pool.query(`
      UPDATE evaluacion
      SET visible_para_padres = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, nombre, visible_para_padres
    `, [evaluacion_id]);
    return result.rows[0];
  }

  // Vista completa para padres/estudiantes de UNA evaluación
  // Incluye adjuntos + rúbrica + nota del estudiante si ya fue calificado
  static async getVistaPublica(evaluacion_id, matricula_id) {
    // Verificar que la evaluación esté publicada
    const evalRes = await pool.query(`
      SELECT
        ev.id,
        ev.nombre,
        ev.tipo,
        ev.descripcion,
        ev.instrucciones,
        ev.fecha,
        ev.fecha_limite,
        ev.puntaje_maximo,
        ev.foto_url,
        ev.pdf_url,
        ev.pdf_nombre,
        ev.publicado_en,
        de.nombre               AS dimension_nombre,
        de.codigo               AS dimension_codigo,
        de.color                AS dimension_color,
        pe.nombre               AS trimestre_nombre,
        mat.nombre              AS materia_nombre,
        g.nombre                AS grado_nombre,
        p.nombre                AS paralelo_nombre
      FROM evaluacion ev
      INNER JOIN dimension_evaluacion de ON ev.dimension_evaluacion_id = de.id
      INNER JOIN periodo_evaluacion pe   ON ev.periodo_evaluacion_id   = pe.id
      INNER JOIN asignacion_docente ad   ON ev.asignacion_docente_id   = ad.id
      INNER JOIN grado_materia gm        ON ad.grado_materia_id        = gm.id
      INNER JOIN materia mat             ON gm.materia_id              = mat.id
      INNER JOIN grado g                 ON gm.grado_id                = g.id
      INNER JOIN paralelo p              ON ad.paralelo_id             = p.id
      WHERE ev.id = $1
        AND ev.visible_para_padres = true
        AND ev.activo = true
    `, [evaluacion_id]);

    if (!evalRes.rows[0]) return null;
    const evaluacion = evalRes.rows[0];

    // Rúbrica
    const rubricaRes = await pool.query(`
      SELECT id, orden, criterio, descripcion,
             nivel_excelente, nivel_bueno, nivel_basico, nivel_insuficiente,
             puntos_posibles
      FROM evaluacion_rubrica
      WHERE evaluacion_id = $1 AND activo = true
      ORDER BY orden
    `, [evaluacion_id]);

    // Nota del estudiante (si ya fue calificado)
    let calificacion = null;
    if (matricula_id) {
      const calRes = await pool.query(`
        SELECT
          c.puntaje_obtenido,
          c.esta_ausente,
          c.observacion,
          c.fecha_registro,
          -- Nota normalizada a 100 para mostrar al padre
          ROUND((c.puntaje_obtenido / ev.puntaje_maximo * 100)::NUMERIC, 1) AS nota_sobre_100
        FROM calificacion c
        INNER JOIN evaluacion ev ON c.evaluacion_id = ev.id
        WHERE c.evaluacion_id = $1
          AND c.matricula_id  = $2
      `, [evaluacion_id, matricula_id]);
      calificacion = calRes.rows[0] || null;
    }

    return {
      ...evaluacion,
      rubrica:       rubricaRes.rows,
      total_puntos_rubrica: rubricaRes.rows.reduce((s, r) => s + parseFloat(r.puntos_posibles), 0),
      calificacion   // null si aún no fue calificado
    };
  }

  // Todas las evaluaciones publicadas de una materia (vista padre/estudiante)
  static async getEvaluacionesPublicas({ asignacion_docente_id, periodo_evaluacion_id, matricula_id }) {
    const result = await pool.query(`
      SELECT
        ev.id,
        ev.nombre,
        ev.tipo,
        ev.descripcion,
        ev.instrucciones,
        ev.fecha,
        ev.fecha_limite,
        ev.puntaje_maximo,
        ev.foto_url,
        ev.pdf_url,
        ev.pdf_nombre,
        ev.publicado_en,
        de.nombre               AS dimension_nombre,
        de.codigo               AS dimension_codigo,
        de.color                AS dimension_color,
        -- Nota del estudiante (null si no calificado aún)
        c.puntaje_obtenido,
        c.esta_ausente,
        CASE
          WHEN c.puntaje_obtenido IS NOT NULL
          THEN ROUND((c.puntaje_obtenido / ev.puntaje_maximo * 100)::NUMERIC, 1)
        END                     AS nota_sobre_100,
        -- ¿Tiene rúbrica?
        EXISTS (
          SELECT 1 FROM evaluacion_rubrica r
          WHERE r.evaluacion_id = ev.id AND r.activo = true
        )                       AS tiene_rubrica
      FROM evaluacion ev
      INNER JOIN dimension_evaluacion de ON ev.dimension_evaluacion_id = de.id
      LEFT JOIN calificacion c
        ON c.evaluacion_id = ev.id
        AND c.matricula_id = $3
      WHERE ev.asignacion_docente_id  = $1
        AND ev.periodo_evaluacion_id  = $2
        AND ev.visible_para_padres    = true
        AND ev.activo                 = true
      ORDER BY de.orden, ev.fecha
    `, [asignacion_docente_id, periodo_evaluacion_id, matricula_id || null]);

    return result.rows;
  }
}

// =============================================
// RÚBRICA DE EVALUACIÓN
// =============================================
class EvaluacionRubrica {

  // Crear criterio
  static async create(data) {
    const {
      evaluacion_id, orden, criterio, descripcion,
      nivel_excelente, nivel_bueno, nivel_basico, nivel_insuficiente,
      puntos_posibles
    } = data;

    const result = await pool.query(`
      INSERT INTO evaluacion_rubrica (
        evaluacion_id, orden, criterio, descripcion,
        nivel_excelente, nivel_bueno, nivel_basico, nivel_insuficiente,
        puntos_posibles
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      evaluacion_id, orden, criterio, descripcion || null,
      nivel_excelente || null, nivel_bueno || null,
      nivel_basico || null, nivel_insuficiente || null,
      puntos_posibles
    ]);
    return result.rows[0];
  }

  // Reemplazar rúbrica completa en una operación
  // El docente manda el array completo y se reemplaza todo
  static async reemplazar(evaluacion_id, criterios) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Validar que la evaluación existe y el docente puede editarla
      const evalRes = await client.query(
        `SELECT id, puntaje_maximo, nombre FROM evaluacion WHERE id = $1 AND activo = true`,
        [evaluacion_id]
      );
      if (!evalRes.rows[0]) throw new Error('Evaluación no encontrada o inactiva');

      // Validar que la suma de puntos no supere el puntaje máximo
      const sumaTotal = criterios.reduce((s, c) => s + parseFloat(c.puntos_posibles), 0);
      if (sumaTotal > parseFloat(evalRes.rows[0].puntaje_maximo)) {
        throw new Error(
          `La suma de puntos de la rúbrica (${sumaTotal}) supera el puntaje máximo ` +
          `de la evaluación (${evalRes.rows[0].puntaje_maximo})`
        );
      }

      // Borrar criterios anteriores y reinsertar
      await client.query(
        `DELETE FROM evaluacion_rubrica WHERE evaluacion_id = $1`, [evaluacion_id]
      );

      const insertados = [];
      for (let i = 0; i < criterios.length; i++) {
        const c = criterios[i];
        const r = await client.query(`
          INSERT INTO evaluacion_rubrica (
            evaluacion_id, orden, criterio, descripcion,
            nivel_excelente, nivel_bueno, nivel_basico, nivel_insuficiente,
            puntos_posibles
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING *
        `, [
          evaluacion_id, i + 1, c.criterio, c.descripcion || null,
          c.nivel_excelente || null, c.nivel_bueno || null,
          c.nivel_basico || null, c.nivel_insuficiente || null,
          c.puntos_posibles
        ]);
        insertados.push(r.rows[0]);
      }

      await client.query('COMMIT');
      return {
        evaluacion_id,
        evaluacion_nombre: evalRes.rows[0].nombre,
        puntaje_maximo:    evalRes.rows[0].puntaje_maximo,
        suma_rubrica:      sumaTotal,
        criterios:         insertados
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Listar criterios de una evaluación
  static async findByEvaluacion(evaluacion_id) {
    const result = await pool.query(`
      SELECT *
      FROM evaluacion_rubrica
      WHERE evaluacion_id = $1 AND activo = true
      ORDER BY orden
    `, [evaluacion_id]);
    return result.rows;
  }

  // Actualizar un criterio individual
  static async update(id, data) {
    const {
      orden, criterio, descripcion,
      nivel_excelente, nivel_bueno, nivel_basico, nivel_insuficiente,
      puntos_posibles
    } = data;

    const result = await pool.query(`
      UPDATE evaluacion_rubrica SET
        orden              = COALESCE($1, orden),
        criterio           = COALESCE($2, criterio),
        descripcion        = $3,
        nivel_excelente    = $4,
        nivel_bueno        = $5,
        nivel_basico       = $6,
        nivel_insuficiente = $7,
        puntos_posibles    = COALESCE($8, puntos_posibles),
        updated_at         = CURRENT_TIMESTAMP
      WHERE id = $9 AND activo = true
      RETURNING *
    `, [
      orden, criterio, descripcion || null,
      nivel_excelente || null, nivel_bueno || null,
      nivel_basico || null, nivel_insuficiente || null,
      puntos_posibles, id
    ]);
    return result.rows[0];
  }

  // Eliminar criterio individual
  static async delete(id) {
    const result = await pool.query(
      `UPDATE evaluacion_rubrica SET activo = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }
}

export { EvaluacionAdjunto, EvaluacionRubrica };