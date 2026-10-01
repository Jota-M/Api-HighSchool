// server/scripts/actualizar_calificacion_directa.js
//
// Script de migración de funciones SQL para:
// 1. Calificación directa por dimensión (SER /10, SABER /45, HACER /40, AUTO /5, etc.)
// 2. Cálculo 100% dinámico basado en dimension_evaluacion.porcentaje_ponderacion y activo=true
// 3. Inclusión de nota_auto en boletin_notas()
// 4. Recalcular las calificaciones existentes en el sistema
//
// Ejecución: node --env-file .env.dev ./scripts/actualizar_calificacion_directa.js

import { pool } from '../src/db/pool.js';

async function ejecutarMigracion() {
  const client = await pool.connect();
  try {
    console.log('🚀 Iniciando migración de funciones para Calificación Directa...');
    await client.query('BEGIN');

    // ─────────────────────────────────────────────────────────────
    // 1. FUNCIÓN: calcular_nota_dimension
    // ─────────────────────────────────────────────────────────────
    console.log('1️⃣ Actualizando calcular_nota_dimension()...');
    await client.query(`
      CREATE OR REPLACE FUNCTION calcular_nota_dimension(
        p_matricula_id            INTEGER,
        p_grado_materia_id        INTEGER,
        p_periodo_evaluacion_id   INTEGER,
        p_dimension_evaluacion_id INTEGER
      )
      RETURNS NUMERIC AS $$
      DECLARE
        v_nota_promedio   NUMERIC(5,2);
        v_total_evs       INTEGER;
        v_total_peso      NUMERIC;
        v_dim_peso        NUMERIC;
      BEGIN
        -- Obtener dinámicamente el valor/peso máximo de la dimensión (ej. SER=10, SAB=45, HAC=40, AUT=5)
        SELECT COALESCE(porcentaje_ponderacion, 0)
        INTO v_dim_peso
        FROM dimension_evaluacion
        WHERE id = p_dimension_evaluacion_id;

        IF v_dim_peso IS NULL OR v_dim_peso <= 0 THEN
          v_dim_peso := 100;
        END IF;

        -- Calcular la nota promedio de la dimensión DIRECTAMENTE sobre el valor de su dimensión:
        -- (puntaje_obtenido / puntaje_maximo * v_dim_peso)
        -- Si la evaluación se creó sobre el valor de la dimensión (ej. 45 pts),
        -- entonces (puntaje_obtenido / 45 * 45) = puntaje_obtenido.
        -- Si la evaluación era antigua con base 100, se escala proporcionalmente.
        SELECT
          ROUND(
            COALESCE(
              SUM(
                (c.puntaje_obtenido / NULLIF(e.puntaje_maximo, 0) * v_dim_peso) * e.peso_en_dimension
              ) / NULLIF(SUM(e.peso_en_dimension), 0),
              0
            )::NUMERIC,
            2
          ),
          COUNT(c.id),
          COALESCE(SUM(e.peso_en_dimension), 0)
        INTO v_nota_promedio, v_total_evs, v_total_peso
        FROM evaluacion e
        INNER JOIN asignacion_docente ad ON e.asignacion_docente_id = ad.id
        INNER JOIN calificacion c       ON e.id = c.evaluacion_id
        WHERE ad.grado_materia_id             = p_grado_materia_id
          AND e.periodo_evaluacion_id         = p_periodo_evaluacion_id
          AND e.dimension_evaluacion_id       = p_dimension_evaluacion_id
          AND e.activo                        = true
          AND c.matricula_id                  = p_matricula_id;

        -- Insertar o actualizar nota_dimension
        INSERT INTO nota_dimension (
          matricula_id, grado_materia_id, periodo_evaluacion_id,
          dimension_evaluacion_id, nota_promedio, total_evaluaciones
        )
        VALUES (
          p_matricula_id, p_grado_materia_id, p_periodo_evaluacion_id,
          p_dimension_evaluacion_id, v_nota_promedio, v_total_evs
        )
        ON CONFLICT (matricula_id, grado_materia_id, periodo_evaluacion_id, dimension_evaluacion_id)
        DO UPDATE SET
          nota_promedio      = EXCLUDED.nota_promedio,
          total_evaluaciones = EXCLUDED.total_evaluaciones,
          calculado_en       = CURRENT_TIMESTAMP,
          updated_at         = CURRENT_TIMESTAMP;

        RETURN v_nota_promedio;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('   ✅ calcular_nota_dimension() actualizada');

    // ─────────────────────────────────────────────────────────────
    // 2. FUNCIÓN: calcular_calificacion_periodo
    // ─────────────────────────────────────────────────────────────
    console.log('2️⃣ Actualizando calcular_calificacion_periodo()...');
    await client.query(`
      CREATE OR REPLACE FUNCTION calcular_calificacion_periodo(
        p_matricula_id          INTEGER,
        p_grado_materia_id      INTEGER,
        p_periodo_evaluacion_id INTEGER
      )
      RETURNS NUMERIC AS $$
      DECLARE
        v_nota_final        NUMERIC(5,2);
        v_nota_minima       NUMERIC(5,2);
        v_aprobado          BOOLEAN;
      BEGIN
        -- Recalcular dimensiones activas
        PERFORM calcular_nota_dimension(
          p_matricula_id,
          p_grado_materia_id,
          p_periodo_evaluacion_id,
          de.id
        )
        FROM dimension_evaluacion de
        WHERE de.activo = true;

        -- Suma directa de las notas de cada dimensión activa (cada una ya está sobre su puntaje)
        SELECT
          ROUND(
            COALESCE(
              SUM(nd.nota_promedio),
              0
            )::NUMERIC,
            2
          )
        INTO v_nota_final
        FROM nota_dimension nd
        INNER JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
        WHERE nd.matricula_id          = p_matricula_id
          AND nd.grado_materia_id      = p_grado_materia_id
          AND nd.periodo_evaluacion_id = p_periodo_evaluacion_id
          AND de.activo                = true;

        -- Obtener nota mínima de aprobación
        SELECT nota_minima_aprobacion
        INTO v_nota_minima
        FROM grado_materia
        WHERE id = p_grado_materia_id;

        v_aprobado := COALESCE(v_nota_final, 0) >= COALESCE(v_nota_minima, 51);

        -- Insertar o actualizar calificacion_periodo
        INSERT INTO calificacion_periodo (
          matricula_id, grado_materia_id, periodo_evaluacion_id,
          nota_final, aprobado
        )
        VALUES (
          p_matricula_id, p_grado_materia_id, p_periodo_evaluacion_id,
          v_nota_final, v_aprobado
        )
        ON CONFLICT (matricula_id, grado_materia_id, periodo_evaluacion_id)
        DO UPDATE SET
          nota_final   = CASE
                           WHEN calificacion_periodo.es_nota_manual THEN calificacion_periodo.nota_final
                           ELSE EXCLUDED.nota_final
                         END,
          aprobado     = CASE
                           WHEN calificacion_periodo.es_nota_manual THEN calificacion_periodo.aprobado
                           ELSE EXCLUDED.aprobado
                         END,
          calculado_en = CURRENT_TIMESTAMP,
          updated_at   = CURRENT_TIMESTAMP
        WHERE calificacion_periodo.estado != 'cerrada';

        RETURN v_nota_final;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('   ✅ calcular_calificacion_periodo() actualizada');

    // ─────────────────────────────────────────────────────────────
    // 3. FUNCIÓN: boletin_notas (Dropear y recrear por cambio de firma)
    // ─────────────────────────────────────────────────────────────
    console.log('3️⃣ Actualizando boletin_notas()...');
    await client.query(`DROP FUNCTION IF EXISTS boletin_notas(INTEGER, INTEGER);`);

    await client.query(`
      CREATE OR REPLACE FUNCTION boletin_notas(
        p_matricula_id          INTEGER,
        p_periodo_evaluacion_id INTEGER
      )
      RETURNS TABLE(
        materia_nombre       VARCHAR,
        materia_codigo       VARCHAR,
        nota_ser             NUMERIC,
        nota_saber           NUMERIC,
        nota_hacer           NUMERIC,
        nota_auto            NUMERIC,
        nota_final           NUMERIC,
        nota_minima          NUMERIC,
        aprobado             BOOLEAN,
        estado_periodo       VARCHAR
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          mat.nombre::VARCHAR,
          mat.codigo::VARCHAR,
          MAX(CASE WHEN de.codigo = 'SER' THEN nd.nota_promedio END),
          MAX(CASE WHEN de.codigo = 'SAB' THEN nd.nota_promedio END),
          MAX(CASE WHEN de.codigo = 'HAC' THEN nd.nota_promedio END),
          MAX(CASE WHEN de.codigo IN ('AUT', 'AUTO') THEN nd.nota_promedio END),
          cp.nota_final,
          gm.nota_minima_aprobacion,
          cp.aprobado,
          cp.estado::VARCHAR
        FROM calificacion_periodo cp
        INNER JOIN grado_materia gm  ON cp.grado_materia_id = gm.id
        INNER JOIN materia mat       ON gm.materia_id = mat.id
        LEFT JOIN nota_dimension nd  ON nd.matricula_id          = cp.matricula_id
                                    AND nd.grado_materia_id      = cp.grado_materia_id
                                    AND nd.periodo_evaluacion_id = cp.periodo_evaluacion_id
        LEFT JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
        WHERE cp.matricula_id          = p_matricula_id
          AND cp.periodo_evaluacion_id = p_periodo_evaluacion_id
        GROUP BY mat.nombre, mat.codigo, cp.nota_final,
                 gm.nota_minima_aprobacion, cp.aprobado, cp.estado
        ORDER BY mat.nombre;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('   ✅ boletin_notas() actualizada con columna nota_auto');

    // ─────────────────────────────────────────────────────────────
    // 4. RECALCULAR CALIFICACIONES EXISTENTES
    // ─────────────────────────────────────────────────────────────
    console.log('\n4️⃣ Recalculando todas las calificaciones registradas...');
    const periodosCalificados = await client.query(`
      SELECT DISTINCT
        c.matricula_id,
        ad.grado_materia_id,
        e.periodo_evaluacion_id
      FROM calificacion c
      INNER JOIN evaluacion e ON c.evaluacion_id = e.id
      INNER JOIN asignacion_docente ad ON e.asignacion_docente_id = ad.id
      WHERE e.activo = true
      UNION
      SELECT DISTINCT
        matricula_id,
        grado_materia_id,
        periodo_evaluacion_id
      FROM calificacion_periodo
    `);

    let recalcCount = 0;
    for (const fila of periodosCalificados.rows) {
      await client.query(
        `SELECT calcular_calificacion_periodo($1, $2, $3)`,
        [fila.matricula_id, fila.grado_materia_id, fila.periodo_evaluacion_id]
      );
      recalcCount++;
    }
    console.log(`   ✅ ${recalcCount} calificaciones de periodo recalculadas exitosamente`);

    await client.query('COMMIT');

    // ─────────────────────────────────────────────────────────────
    // 5. VERIFICACIÓN Y MUESTRA
    // ─────────────────────────────────────────────────────────────
    console.log('\n🔍 Verificación de muestra tras recalcular:');
    const muestra = await client.query(`
      SELECT
        cp.matricula_id,
        m.nombre AS materia,
        MAX(CASE WHEN de.codigo = 'SER' THEN nd.nota_promedio END) AS ser,
        MAX(CASE WHEN de.codigo = 'SAB' THEN nd.nota_promedio END) AS saber,
        MAX(CASE WHEN de.codigo = 'HAC' THEN nd.nota_promedio END) AS hacer,
        MAX(CASE WHEN de.codigo IN ('AUT', 'AUTO') THEN nd.nota_promedio END) AS auto,
        cp.nota_final
      FROM calificacion_periodo cp
      INNER JOIN grado_materia gm ON cp.grado_materia_id = gm.id
      INNER JOIN materia m ON gm.materia_id = m.id
      LEFT JOIN nota_dimension nd ON nd.matricula_id = cp.matricula_id
                                 AND nd.grado_materia_id = cp.grado_materia_id
                                 AND nd.periodo_evaluacion_id = cp.periodo_evaluacion_id
      LEFT JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
      GROUP BY cp.matricula_id, m.nombre, cp.nota_final
      ORDER BY cp.matricula_id DESC
      LIMIT 5
    `);

    console.table(muestra.rows);

    console.log('\n🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE! Todo el backend ahora opera con calificación directa.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('💥 Error durante la migración:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

ejecutarMigracion();
