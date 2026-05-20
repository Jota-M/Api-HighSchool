// seeds/reporte_asistencia_trimestres.js
//
// Crea funciones de reporte de asistencia por trimestres
//
// Ejecutar con:
// node seeds/reporte_asistencia_trimestres.js

import { pool } from '../src/db/pool.js';

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🚀 Creando funciones de asistencia por trimestres...\n');

    // ============================================================
    // 1️⃣ DETALLE
    // ============================================================
    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_asistencia_trimestres_clase(
        p_asignacion_docente_id INTEGER
      )
      RETURNS TABLE(
        matricula_id INTEGER,
        estudiante_id INTEGER,
        estudiante_codigo VARCHAR,
        estudiante_nombres VARCHAR,
        estudiante_apellidos VARCHAR,
        estudiante_foto VARCHAR,
        periodo_evaluacion_id INTEGER,
        periodo_nombre VARCHAR,
        periodo_orden INTEGER,
        fecha_inicio DATE,
        fecha_fin DATE,
        total_clases BIGINT,
        presentes BIGINT,
        ausentes BIGINT,
        tardanzas BIGINT,
        justificados BIGINT,
        faltas_parciales BIGINT,
        porcentaje_asistencia NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          m.id, e.id, e.codigo, e.nombres, e.apellidos, e.foto_url,
          pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin,
          COUNT(a.id),
          COUNT(CASE WHEN a.estado = 'presente' THEN 1 END),
          COUNT(CASE WHEN a.estado = 'ausente' THEN 1 END),
          COUNT(CASE WHEN a.estado = 'tardanza' THEN 1 END),
          COUNT(CASE WHEN a.estado = 'justificado' THEN 1 END),
          COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END),
          ROUND(
            COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado') THEN 1 END)::NUMERIC
            / NULLIF(COUNT(a.id), 0) * 100,
            2
          )
        FROM asignacion_docente ad
        INNER JOIN matricula m
          ON m.paralelo_id = ad.paralelo_id
          AND m.periodo_academico_id = ad.periodo_academico_id
          AND m.estado = 'activo'
          AND m.deleted_at IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        INNER JOIN periodo_evaluacion pe
          ON pe.periodo_academico_id = ad.periodo_academico_id
          AND pe.activo = true
        LEFT JOIN asistencia a
          ON a.matricula_id = m.id
          AND a.asignacion_docente_id = p_asignacion_docente_id
          AND a.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
        WHERE ad.id = p_asignacion_docente_id
        GROUP BY m.id, e.id, e.codigo, e.nombres, e.apellidos, e.foto_url,
                 pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin
        ORDER BY e.apellidos, e.nombres, pe.orden;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Función detalle creada');

    // ============================================================
    // 2️⃣ RESUMEN
    // ============================================================
    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_asistencia_trimestres_clase(
        p_asignacion_docente_id INTEGER
      )
      RETURNS TABLE(
        periodo_evaluacion_id INTEGER,
        periodo_nombre VARCHAR,
        periodo_orden INTEGER,
        fecha_inicio DATE,
        fecha_fin DATE,
        total_estudiantes BIGINT,
        total_clases BIGINT,
        presentes BIGINT,
        ausentes BIGINT,
        tardanzas BIGINT,
        justificados BIGINT,
        faltas_parciales BIGINT,
        promedio_asistencia NUMERIC,
        estudiantes_criticos BIGINT
      ) AS $$
      BEGIN
        RETURN QUERY
        WITH por_estudiante AS (
          SELECT
            pe.id AS pe_id,
            pe.nombre AS pe_nombre,
            pe.orden AS pe_orden,
            pe.fecha_inicio AS pe_inicio,
            pe.fecha_fin AS pe_fin,
            m.id AS matricula_id,
            COUNT(a.id) AS total_clases_est,
            COUNT(CASE WHEN a.estado = 'presente' THEN 1 END) AS presentes_est,
            COUNT(CASE WHEN a.estado = 'ausente' THEN 1 END) AS ausentes_est,
            COUNT(CASE WHEN a.estado = 'tardanza' THEN 1 END) AS tardanzas_est,
            COUNT(CASE WHEN a.estado = 'justificado' THEN 1 END) AS justificados_est,
            COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END) AS faltas_parciales_est,
            ROUND(
              COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado') THEN 1 END)::NUMERIC
              / NULLIF(COUNT(a.id), 0) * 100,
              2
            ) AS pct_est
          FROM asignacion_docente ad
          INNER JOIN matricula m
            ON m.paralelo_id = ad.paralelo_id
            AND m.periodo_academico_id = ad.periodo_academico_id
            AND m.estado = 'activo'
            AND m.deleted_at IS NULL
          INNER JOIN periodo_evaluacion pe
            ON pe.periodo_academico_id = ad.periodo_academico_id
            AND pe.activo = true
          LEFT JOIN asistencia a
            ON a.matricula_id = m.id
            AND a.asignacion_docente_id = p_asignacion_docente_id
            AND a.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
          WHERE ad.id = p_asignacion_docente_id
          GROUP BY pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin, m.id
        )
        SELECT
          p.pe_id, p.pe_nombre, p.pe_orden, p.pe_inicio, p.pe_fin,
          COUNT(DISTINCT p.matricula_id),
          SUM(p.total_clases_est),
          SUM(p.presentes_est),
          SUM(p.ausentes_est),
          SUM(p.tardanzas_est),
          SUM(p.justificados_est),
          SUM(p.faltas_parciales_est),
          ROUND(AVG(p.pct_est), 2),
          COUNT(CASE WHEN p.pct_est < 70 THEN 1 END)
        FROM por_estudiante p
        GROUP BY p.pe_id, p.pe_nombre, p.pe_orden, p.pe_inicio, p.pe_fin
        ORDER BY p.pe_orden;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Función resumen creada');

    // ============================================================
    // 3️⃣ INDIVIDUAL
    // ============================================================
    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_asistencia_trimestres_estudiante(
        p_matricula_id INTEGER,
        p_asignacion_docente_id INTEGER
      )
      RETURNS TABLE(
        periodo_evaluacion_id INTEGER,
        periodo_nombre VARCHAR,
        periodo_orden INTEGER,
        fecha_inicio DATE,
        fecha_fin DATE,
        total_clases BIGINT,
        presentes BIGINT,
        ausentes BIGINT,
        tardanzas BIGINT,
        justificados BIGINT,
        faltas_parciales BIGINT,
        porcentaje_asistencia NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin,
          COUNT(a.id),
          COUNT(CASE WHEN a.estado = 'presente' THEN 1 END),
          COUNT(CASE WHEN a.estado = 'ausente' THEN 1 END),
          COUNT(CASE WHEN a.estado = 'tardanza' THEN 1 END),
          COUNT(CASE WHEN a.estado = 'justificado' THEN 1 END),
          COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END),
          ROUND(
            COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado') THEN 1 END)::NUMERIC
            / NULLIF(COUNT(a.id), 0) * 100,
            2
          )
        FROM asignacion_docente ad
        INNER JOIN periodo_evaluacion pe
          ON pe.periodo_academico_id = ad.periodo_academico_id
          AND pe.activo = true
        LEFT JOIN asistencia a
          ON a.matricula_id = p_matricula_id
          AND a.asignacion_docente_id = p_asignacion_docente_id
          AND a.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
        WHERE ad.id = p_asignacion_docente_id
        GROUP BY pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin
        ORDER BY pe.orden;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Función individual creada');

    // ============================================================
    // VERIFICACIÓN
    // ============================================================
    const verify = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_type = 'FUNCTION'
      AND (
        routine_name LIKE 'reporte_asistencia_trimestres%'
        OR routine_name = 'resumen_asistencia_trimestres_clase'
      );
    `);

    console.log('\n📊 Funciones registradas:');
    verify.rows.forEach(f => console.log(`   - ${f.routine_name}`));

    await client.query('COMMIT');

    console.log(`
╔══════════════════════════════════════╗
║  ✅ SEED COMPLETADO                 ║
╠══════════════════════════════════════╣
║  Funciones creadas: 3               ║
╚══════════════════════════════════════╝
    `);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error en seed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();