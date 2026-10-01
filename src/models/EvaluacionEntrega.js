// models/EvaluacionEntrega.js
import { pool } from '../db/pool.js';
import UploadFile from '../utils/uploadFile.js';

class EvaluacionEntrega {

  /**
   * Obtener la entrega de un estudiante en una evaluación
   */
  static async obtenerEntrega(evaluacion_id, matricula_id) {
    const result = await pool.query(`
      SELECT *
      FROM evaluacion_entrega
      WHERE evaluacion_id = $1 AND matricula_id = $2
    `, [evaluacion_id, matricula_id]);
    return result.rows[0] || null;
  }

  /**
   * Guardar o actualizar la entrega de tarea/práctica de un estudiante
   */
  static async guardarEntrega({
    evaluacion_id,
    matricula_id,
    archivo_url,
    archivo_public_id,
    archivo_nombre,
    archivo_tipo,
    archivo_tamano,
    archivos = [],
    comentario_estudiante,
  }) {
    // 1. Validar que la evaluación exista, esté activa y permita entrega de archivo
    const evalRes = await pool.query(`
      SELECT id, nombre, fecha_limite, permite_entrega_archivo, activo
      FROM evaluacion
      WHERE id = $1 AND activo = true
    `, [evaluacion_id]);

    const evaluacion = evalRes.rows[0];
    if (!evaluacion) {
      throw new Error('La evaluación no existe o está inactiva');
    }

    if (!evaluacion.permite_entrega_archivo) {
      throw new Error('Esta evaluación no tiene habilitada la subida de archivos en la plataforma');
    }

    // 2. Validar fecha límite (plazo vencido)
    if (evaluacion.fecha_limite) {
      const fechaLimite = new Date(evaluacion.fecha_limite);
      const ahora = new Date();
      if (ahora > fechaLimite) {
        throw new Error('El plazo de entrega ha vencido. No se aceptan entregas fuera de fecha.');
      }
    }

    // 3. Revisar si ya existía una entrega previa
    const previa = await this.obtenerEntrega(evaluacion_id, matricula_id);

    if (previa) {
      // Eliminar los archivos anteriores en Cloudinary si existían
      const previosList = Array.isArray(previa.archivos) && previa.archivos.length > 0
        ? previa.archivos
        : (previa.archivo_public_id ? [{ public_id: previa.archivo_public_id }] : []);

      for (const arch of previosList) {
        if (arch.public_id) {
          try {
            await UploadFile.deleteFile(arch.public_id, 'auto');
          } catch (err) {
            console.warn('No se pudo eliminar archivo previo de Cloudinary:', err.message);
          }
        }
      }

      // Actualizar registro
      const result = await pool.query(`
        UPDATE evaluacion_entrega
        SET
          archivo_url           = $1,
          archivo_public_id     = $2,
          archivo_nombre        = $3,
          archivo_tipo          = $4,
          archivo_tamano        = $5,
          archivos              = $6::jsonb,
          comentario_estudiante = COALESCE($7, comentario_estudiante),
          fecha_entrega         = CURRENT_TIMESTAMP,
          updated_at            = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *
      `, [
        archivo_url,
        archivo_public_id || null,
        archivo_nombre || null,
        archivo_tipo || null,
        archivo_tamano || null,
        JSON.stringify(archivos && archivos.length > 0 ? archivos : [{ url: archivo_url, public_id: archivo_public_id, nombre: archivo_nombre, tipo: archivo_tipo, tamano: archivo_tamano }]),
        comentario_estudiante || null,
        previa.id,
      ]);

      return result.rows[0];
    } else {
      // Insertar nuevo registro
      const listArchivos = archivos && archivos.length > 0
        ? archivos
        : [{ url: archivo_url, public_id: archivo_public_id, nombre: archivo_nombre, tipo: archivo_tipo, tamano: archivo_tamano }];

      const result = await pool.query(`
        INSERT INTO evaluacion_entrega (
          evaluacion_id,
          matricula_id,
          archivo_url,
          archivo_public_id,
          archivo_nombre,
          archivo_tipo,
          archivo_tamano,
          archivos,
          comentario_estudiante,
          fecha_entrega,
          estado
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, CURRENT_TIMESTAMP, 'entregado')
        RETURNING *
      `, [
        evaluacion_id,
        matricula_id,
        archivo_url,
        archivo_public_id || null,
        archivo_nombre || null,
        archivo_tipo || null,
        archivo_tamano || null,
        JSON.stringify(listArchivos),
        comentario_estudiante || null,
      ]);

      return result.rows[0];
    }
  }

  /**
   * Eliminar la entrega antes de la fecha límite
   */
  static async eliminarEntrega({ evaluacion_id, matricula_id }) {
    const evalRes = await pool.query(`
      SELECT id, fecha_limite, permite_entrega_archivo
      FROM evaluacion
      WHERE id = $1 AND activo = true
    `, [evaluacion_id]);

    const evaluacion = evalRes.rows[0];
    if (!evaluacion) {
      throw new Error('Evaluación no encontrada');
    }

    if (evaluacion.fecha_limite) {
      const fechaLimite = new Date(evaluacion.fecha_limite);
      const ahora = new Date();
      if (ahora > fechaLimite) {
        throw new Error('El plazo de entrega ha vencido. No se puede anular ni eliminar la entrega.');
      }
    }

    const entrega = await this.obtenerEntrega(evaluacion_id, matricula_id);
    if (!entrega) {
      throw new Error('No hay ninguna entrega registrada para este estudiante');
    }

    const archivosAEliminar = Array.isArray(entrega.archivos) && entrega.archivos.length > 0
      ? entrega.archivos
      : (entrega.archivo_public_id ? [{ public_id: entrega.archivo_public_id }] : []);

    for (const arch of archivosAEliminar) {
      if (arch.public_id) {
        try {
          await UploadFile.deleteFile(arch.public_id, 'auto');
        } catch (err) {
          console.warn('No se pudo eliminar archivo de Cloudinary al anular entrega:', err.message);
        }
      }
    }

    await pool.query(`DELETE FROM evaluacion_entrega WHERE id = $1`, [entrega.id]);
    return { success: true };
  }

  /**
   * Todas las entregas de una evaluación (para vista docente)
   * Devuelve todos los estudiantes del curso/paralelo con su entrega y nota
   */
  static async listarEntregasPorEvaluacion(evaluacion_id) {
    const result = await pool.query(`
      SELECT
        m.id AS matricula_id,
        e.id AS estudiante_id,
        e.codigo AS estudiante_codigo,
        e.nombres AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos,
        e.foto_url AS estudiante_foto,
        p.nombre AS paralelo_nombre,
        ee.id AS entrega_id,
        ee.archivo_url,
        ee.archivo_nombre,
        ee.archivo_tipo,
        ee.archivo_tamano,
        COALESCE(
          ee.archivos,
          CASE 
            WHEN ee.archivo_url IS NOT NULL 
            THEN jsonb_build_array(jsonb_build_object('url', ee.archivo_url, 'nombre', ee.archivo_nombre, 'tipo', ee.archivo_tipo, 'tamano', ee.archivo_tamano))
            ELSE '[]'::jsonb 
          END
        ) AS archivos,
        ee.comentario_estudiante,
        ee.fecha_entrega,
        COALESCE(ee.estado, CASE WHEN ee.id IS NOT NULL THEN 'a_tiempo' ELSE 'sin_entrega' END) AS estado_entrega,
        CAST(c.puntaje_obtenido AS FLOAT8) AS puntaje_obtenido,
        COALESCE(c.esta_ausente, false) AS esta_ausente,
        c.observacion AS observacion_docente,
        c.id AS calificacion_id,
        (c.puntaje_obtenido IS NOT NULL OR c.esta_ausente = true) AS calificado
      FROM evaluacion ev
      INNER JOIN asignacion_docente ad ON ev.asignacion_docente_id = ad.id
      INNER JOIN matricula m
        ON  COALESCE(m.paralelo_cursado_id, m.paralelo_id) = ad.paralelo_id
        AND m.periodo_academico_id = ad.periodo_academico_id
        AND m.estado               = 'activo'
        AND m.deleted_at           IS NULL
      INNER JOIN estudiante e ON e.id = m.estudiante_id
      LEFT JOIN paralelo p ON m.paralelo_id = p.id
      LEFT JOIN evaluacion_entrega ee ON ee.evaluacion_id = ev.id AND ee.matricula_id = m.id
      LEFT JOIN calificacion c ON c.evaluacion_id = ev.id AND c.matricula_id = m.id
      WHERE ev.id = $1
      ORDER BY e.apellidos ASC, e.nombres ASC
    `, [evaluacion_id]);

    return result.rows;
  }
}

export default EvaluacionEntrega;
