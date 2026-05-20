// scripts/add_reporte_clase.js
// Ejecutar: node scripts/add_reporte_clase.js
// Agrega la función reporte_asistencia_clase al schema existente

import { pool } from '../src/db/pool.js';

async function agregarReporteClase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // =============================================
    // FUNCIÓN: reporte de asistencia de toda la clase
    // Devuelve un row por estudiante + totales por estado
    // =============================================
    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_asistencia_clase(
        p_asignacion_docente_id INTEGER,
        p_fecha_inicio          DATE    DEFAULT NULL,
        p_fecha_fin             DATE    DEFAULT NULL
      )
      RETURNS TABLE(
        matricula_id          INTEGER,
        estudiante_id         INTEGER,
        estudiante_codigo     VARCHAR,
        estudiante_nombres    VARCHAR,
        estudiante_apellidos  VARCHAR,
        estudiante_foto       VARCHAR,
        total_clases          BIGINT,
        presentes             BIGINT,
        ausentes              BIGINT,
        tardanzas             BIGINT,
        justificados          BIGINT,
        faltas_parciales      BIGINT,
        porcentaje_asistencia NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          m.id::INTEGER                                               AS matricula_id,
          e.id::INTEGER                                               AS estudiante_id,
          e.codigo::VARCHAR                                           AS estudiante_codigo,
          e.nombres::VARCHAR                                          AS estudiante_nombres,
          e.apellidos::VARCHAR                                        AS estudiante_apellidos,
          e.foto_url::VARCHAR                                         AS estudiante_foto,
          COUNT(a.id)                                                 AS total_clases,
          COUNT(CASE WHEN a.estado = 'presente'      THEN 1 END)     AS presentes,
          COUNT(CASE WHEN a.estado = 'ausente'       THEN 1 END)     AS ausentes,
          COUNT(CASE WHEN a.estado = 'tardanza'      THEN 1 END)     AS tardanzas,
          COUNT(CASE WHEN a.estado = 'justificado'   THEN 1 END)     AS justificados,
          COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END)     AS faltas_parciales,
          ROUND(
            COUNT(CASE WHEN a.estado IN ('presente', 'tardanza', 'justificado') THEN 1 END)::NUMERIC
            / NULLIF(COUNT(a.id), 0) * 100,
            2
          )                                                           AS porcentaje_asistencia
        FROM asignacion_docente ad
        INNER JOIN matricula m
          ON  m.paralelo_id          = ad.paralelo_id
          AND m.periodo_academico_id = ad.periodo_academico_id
          AND m.estado               = 'activo'
          AND m.deleted_at           IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        LEFT JOIN asistencia a
          ON  a.matricula_id          = m.id
          AND a.asignacion_docente_id = p_asignacion_docente_id
          AND (p_fecha_inicio IS NULL OR a.fecha >= p_fecha_inicio)
          AND (p_fecha_fin    IS NULL OR a.fecha <= p_fecha_fin)
        WHERE ad.id = p_asignacion_docente_id
        GROUP BY m.id, e.id, e.codigo, e.nombres, e.apellidos, e.foto_url
        ORDER BY e.apellidos, e.nombres;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Función reporte_asistencia_clase creada');

    // =============================================
    // FUNCIÓN: resumen agregado de la clase (totales)
    // Un solo row con los totales globales
    // =============================================
    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_asistencia_clase(
        p_asignacion_docente_id INTEGER,
        p_fecha_inicio          DATE    DEFAULT NULL,
        p_fecha_fin             DATE    DEFAULT NULL
      )
      RETURNS TABLE(
        total_dias_registrados BIGINT,
        total_estudiantes      BIGINT,
        total_registros        BIGINT,
        presentes              BIGINT,
        ausentes               BIGINT,
        tardanzas              BIGINT,
        justificados           BIGINT,
        faltas_parciales       BIGINT,
        promedio_asistencia    NUMERIC,
        estudiantes_criticos   BIGINT   -- porcentaje_asistencia < 70%
      ) AS $$
      BEGIN
        RETURN QUERY
        WITH datos AS (
          SELECT
            a.fecha,
            a.estado,
            m.id AS matricula_id,
            ROUND(
              COUNT(CASE WHEN a2.estado IN ('presente','tardanza','justificado') THEN 1 END)::NUMERIC
              / NULLIF(COUNT(a2.id), 0) * 100, 2
            ) AS pct_estudiante
          FROM asignacion_docente ad
          INNER JOIN matricula m
            ON  m.paralelo_id          = ad.paralelo_id
            AND m.periodo_academico_id = ad.periodo_academico_id
            AND m.estado = 'activo' AND m.deleted_at IS NULL
          LEFT JOIN asistencia a
            ON  a.matricula_id          = m.id
            AND a.asignacion_docente_id = p_asignacion_docente_id
            AND (p_fecha_inicio IS NULL OR a.fecha >= p_fecha_inicio)
            AND (p_fecha_fin    IS NULL OR a.fecha <= p_fecha_fin)
          LEFT JOIN asistencia a2
            ON  a2.matricula_id          = m.id
            AND a2.asignacion_docente_id = p_asignacion_docente_id
          WHERE ad.id = p_asignacion_docente_id
          GROUP BY a.fecha, a.estado, m.id
        )
        SELECT
          COUNT(DISTINCT datos.fecha)                                 AS total_dias_registrados,
          COUNT(DISTINCT datos.matricula_id)                          AS total_estudiantes,
          COUNT(datos.estado)                                         AS total_registros,
          COUNT(CASE WHEN datos.estado = 'presente'      THEN 1 END) AS presentes,
          COUNT(CASE WHEN datos.estado = 'ausente'       THEN 1 END) AS ausentes,
          COUNT(CASE WHEN datos.estado = 'tardanza'      THEN 1 END) AS tardanzas,
          COUNT(CASE WHEN datos.estado = 'justificado'   THEN 1 END) AS justificados,
          COUNT(CASE WHEN datos.estado = 'falta_parcial' THEN 1 END) AS faltas_parciales,
          ROUND(AVG(datos.pct_estudiante), 2)                        AS promedio_asistencia,
          COUNT(CASE WHEN datos.pct_estudiante < 70 THEN 1 END)      AS estudiantes_criticos
        FROM datos;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Función resumen_asistencia_clase creada');

    // Permiso nuevo
    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES ('asistencia', 'reporte_clase', 'asistencia.reporte_clase', 'Ver reporte de asistencia de toda la clase')
      ON CONFLICT (nombre) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('\n✅ Migración completada exitosamente');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('💥 Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

agregarReporteClase();