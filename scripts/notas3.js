import { pool } from '../src/db/pool.js';

/**
 * 📅 SEED: Trimestres del período académico
 *
 * Ajusta `periodo_academico_id` al ID que tengas en tu tabla `periodo_academico`
 * para la gestión en curso (p.ej. 2025).
 *
 * Fechas referenciales Bolivia gestión 2025:
 *   T1 → febrero  – mayo
 *   T2 → junio    – septiembre
 *   T3 → octubre  – diciembre
 */

const PERIODO_ACADEMICO_ID = 3; // ← CAMBIA ESTO al id real de tu gestión

const trimestres = [
  {
    nombre:      'Primer Trimestre',
    codigo:      'T1-2025',
    orden:       1,
    fecha_inicio: '2025-02-03',
    fecha_fin:    '2025-05-30',
  },
  {
    nombre:      'Segundo Trimestre',
    codigo:      'T2-2025',
    orden:       2,
    fecha_inicio: '2025-06-02',
    fecha_fin:    '2025-09-19',
  },
  {
    nombre:      'Tercer Trimestre',
    codigo:      'T3-2025',
    orden:       3,
    fecha_inicio: '2025-09-22',
    fecha_fin:    '2025-12-19',
  },
];

async function seedTrimestres() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('\n📅 SEED: Períodos de evaluación (Trimestres)\n');

    for (const t of trimestres) {
      const { rows } = await client.query(
        `
        INSERT INTO periodo_evaluacion
          (periodo_academico_id, nombre, codigo, orden, fecha_inicio, fecha_fin, activo)
        VALUES
          ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (periodo_academico_id, orden) DO UPDATE SET
          nombre       = EXCLUDED.nombre,
          codigo       = EXCLUDED.codigo,
          fecha_inicio = EXCLUDED.fecha_inicio,
          fecha_fin    = EXCLUDED.fecha_fin,
          updated_at   = CURRENT_TIMESTAMP
        RETURNING id, nombre, codigo, fecha_inicio, fecha_fin
        `,
        [
          PERIODO_ACADEMICO_ID,
          t.nombre,
          t.codigo,
          t.orden,
          t.fecha_inicio,
          t.fecha_fin,
        ]
      );

      const row = rows[0];
      console.log(`  ✅ ${row.nombre} (${row.codigo}) — ${row.fecha_inicio} → ${row.fecha_fin}  [id: ${row.id}]`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 Trimestres insertados correctamente.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error al insertar trimestres:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedTrimestres();