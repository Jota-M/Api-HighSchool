// scripts/migration_alerta_rendimiento.js
// Ejecutar: node scripts/migration_alerta_rendimiento.js
import { pool } from '../src/db/pool.js';

async function crearModuloAlertaRendimiento() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('\n🎓 CREANDO MÓDULO: ALERTAS DE RENDIMIENTO ML\n');

    // ─── 1. alerta_rendimiento ────────────────────────────────────
    // Snapshot semanal del ML service por estudiante × materia × semana.
    // Se regenera cada semana — separado de notificacion_institucional
    // para no contaminar el historial de comunicados institucionales.
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerta_rendimiento (
        id                      SERIAL PRIMARY KEY,

        -- Contexto académico
        estudiante_id           INTEGER NOT NULL REFERENCES estudiante(id),
        asignacion_docente_id   INTEGER NOT NULL REFERENCES asignacion_docente(id),
        periodo_evaluacion_id   INTEGER REFERENCES periodo_evaluacion(id),
        trimestre               INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
        semana                  INTEGER NOT NULL CHECK (semana >= 1),

        -- Resultado del modelo ML (snapshot)
        nivel_riesgo            VARCHAR(10) NOT NULL CHECK (nivel_riesgo IN (
          'bajo', 'medio', 'alto', 'critico'
        )),
        nota_estimada           NUMERIC(5,1),
        asistencia_pct          NUMERIC(5,1),
        probabilidad_reprobar   NUMERIC(5,4),   -- 0.0000 a 1.0000
        racha_trims_riesgo      INTEGER DEFAULT 0,

        -- Mensaje generado por Gemini para el padre (tono empático, sin jerga)
        mensaje_padre           TEXT,

        -- Vínculo a la notificación institucional creada para esta alerta
        -- NULL si nivel_riesgo='bajo' (no se notifica)
        notificacion_id         INTEGER REFERENCES notificacion_institucional(id)
                                  ON DELETE SET NULL,

        -- Control de envío
        -- 'pendiente'  → generada, aún no notificada
        -- 'notificada' → notificacion_institucional creada y despachada
        -- 'omitida'    → nivel bajo, no requiere notificación
        -- 'error'      → falló la llamada al ML service o a Gemini
        estado_envio            VARCHAR(15) DEFAULT 'pendiente' CHECK (estado_envio IN (
          'pendiente', 'notificada', 'omitida', 'error'
        )),
        error_detalle           TEXT,           -- detalle si estado_envio='error'

        -- Auditoría
        created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Evitar duplicados si el job corre más de una vez por semana
        UNIQUE (estudiante_id, asignacion_docente_id, trimestre, semana)
      )
    `);
    console.log('  ✅ Tabla alerta_rendimiento');

    // ─── 2. alerta_rendimiento_lectura ───────────────────────────
    // Registro de cuándo el padre leyó cada alerta en el portal.
    // Separado para no tocar la tabla principal en cada visita.
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerta_rendimiento_lectura (
        id                  SERIAL PRIMARY KEY,
        alerta_id           INTEGER NOT NULL
                              REFERENCES alerta_rendimiento(id)
                              ON DELETE CASCADE,
        usuario_id          INTEGER NOT NULL REFERENCES usuarios(id),
        leido_en            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Un padre solo registra lectura una vez por alerta
        UNIQUE (alerta_id, usuario_id)
      )
    `);
    console.log('  ✅ Tabla alerta_rendimiento_lectura');

    // ─── 3. Índices ───────────────────────────────────────────────
    const indices = [
      // El padre consulta sus alertas filtrando por estudiante
      `CREATE INDEX IF NOT EXISTS idx_alerta_rend_estudiante
         ON alerta_rendimiento(estudiante_id)`,

      // El docente ve el estado de notificación de su clase
      `CREATE INDEX IF NOT EXISTS idx_alerta_rend_asignacion
         ON alerta_rendimiento(asignacion_docente_id)`,

      // El job semanal busca por trimestre + semana
      `CREATE INDEX IF NOT EXISTS idx_alerta_rend_periodo
         ON alerta_rendimiento(trimestre, semana)`,

      // Filtrar solo alertas con riesgo relevante
      `CREATE INDEX IF NOT EXISTS idx_alerta_rend_nivel
         ON alerta_rendimiento(nivel_riesgo)`,

      // Alertas pendientes de notificar
      `CREATE INDEX IF NOT EXISTS idx_alerta_rend_estado_envio
         ON alerta_rendimiento(estado_envio)
         WHERE estado_envio = 'pendiente'`,

      // Lecturas por usuario (para el badge de no leídas)
      `CREATE INDEX IF NOT EXISTS idx_alerta_lectura_usuario
         ON alerta_rendimiento_lectura(usuario_id)`,
    ];

    for (const idx of indices) await client.query(idx);
    console.log(`  ✅ ${indices.length} índices`);

    // ─── 4. Trigger updated_at ────────────────────────────────────
    await client.query(`
      DROP TRIGGER IF EXISTS trg_alerta_rendimiento_updated_at
        ON alerta_rendimiento
    `);
    await client.query(`
      CREATE TRIGGER trg_alerta_rendimiento_updated_at
      BEFORE UPDATE ON alerta_rendimiento
      FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
    `);
    console.log('  ✅ Trigger updated_at');

    // ─── 5. Permisos ──────────────────────────────────────────────
    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion) VALUES
        ('alerta_rendimiento', 'leer',
         'alerta_rendimiento.leer',
         'Ver alertas de rendimiento de sus hijos (padre)'),
        ('alerta_rendimiento', 'leer_clase',
         'alerta_rendimiento.leer_clase',
         'Ver alertas de rendimiento de su clase (docente)'),
        ('alerta_rendimiento', 'gestionar',
         'alerta_rendimiento.gestionar',
         'Gestión completa de alertas (admin)')
      ON CONFLICT (nombre) DO NOTHING
    `);
    console.log('  ✅ Permisos registrados');

    // ─── 6. Vista para el portal del padre ───────────────────────
    // Devuelve todas las materias activas del hijo con su última alerta.
    // Si no hay alerta aún (semana 1, primer run del job), igual aparece
    // la materia con nivel_riesgo NULL para que el padre vea el dashboard.
    await client.query(`
      CREATE OR REPLACE VIEW v_portal_padre AS
      SELECT
        -- Identificación del estudiante
        e.id                        AS estudiante_id,
        e.nombres                   AS estudiante_nombres,
        e.apellidos                 AS estudiante_apellidos,
        e.codigo                    AS estudiante_codigo,
        e.foto_url                  AS estudiante_foto,

        -- Materia
        mat.id                      AS materia_id,
        mat.nombre                  AS materia_nombre,
        mat.codigo                  AS materia_codigo,
        mat.color                   AS materia_color,

        -- Docente
        d_user.nombres              AS docente_nombres,
        d_user.apellidos            AS docente_apellidos,

        -- Asignación
        ad.id                       AS asignacion_docente_id,

        -- Última alerta ML (puede ser NULL si el job aún no corrió)
        ar.id                       AS alerta_id,
        ar.trimestre,
        ar.semana                   AS semana_alerta,
        ar.nivel_riesgo,
        ar.nota_estimada,
        ar.asistencia_pct,
        ar.probabilidad_reprobar,
        ar.racha_trims_riesgo,
        ar.mensaje_padre,
        ar.created_at               AS alerta_generada_en,

        -- ¿El padre ya leyó esta alerta?
        CASE WHEN arl.id IS NOT NULL THEN true ELSE false END AS leida

      FROM matricula m
      INNER JOIN estudiante e         ON m.estudiante_id      = e.id
      INNER JOIN asignacion_docente ad ON ad.paralelo_id      = m.paralelo_id
                                      AND ad.periodo_academico_id = m.periodo_academico_id
                                      AND ad.activo           = true
                                      AND ad.deleted_at       IS NULL
      INNER JOIN grado_materia gm     ON ad.grado_materia_id  = gm.id
      INNER JOIN materia mat          ON gm.materia_id        = mat.id
      INNER JOIN docente doc          ON ad.docente_id        = doc.id
      INNER JOIN usuarios d_user      ON doc.usuario_id       = d_user.id

      -- Última alerta de esa materia (el subquery trae solo la más reciente)
      LEFT JOIN LATERAL (
        SELECT *
        FROM alerta_rendimiento
        WHERE estudiante_id         = e.id
          AND asignacion_docente_id = ad.id
        ORDER BY trimestre DESC, semana DESC
        LIMIT 1
      ) ar ON true

      -- ¿Ya la leyó el padre? (se une más tarde con usuario_id del padre)
      LEFT JOIN alerta_rendimiento_lectura arl
        ON arl.alerta_id = ar.id

      WHERE m.estado      = 'activo'
        AND m.deleted_at  IS NULL
    `);
    console.log('  ✅ Vista v_portal_padre');

    await client.query('COMMIT');
    console.log('\n✅ Módulo alerta_rendimiento creado exitosamente');
    console.log('──────────────────────────────────────────────────────');
    console.log('  2 tablas  |  6 índices  |  1 trigger  |  3 permisos  |  1 vista\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error:', err.message);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

crearModuloAlertaRendimiento();