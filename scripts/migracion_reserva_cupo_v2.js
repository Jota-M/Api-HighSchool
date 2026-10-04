import { pool } from '../src/db/pool.js';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Iniciando actualización de esquema para reserva_cupo (v2)...');
    await client.query('BEGIN');

    // 1. Modificar o actualizar CHECK constraint de estado
    await client.query(`
      ALTER TABLE public.reserva_cupo 
      DROP CONSTRAINT IF EXISTS reserva_cupo_estado_check;
    `);

    await client.query(`
      ALTER TABLE public.reserva_cupo 
      ADD CONSTRAINT reserva_cupo_estado_check 
      CHECK (estado IN ('confirmada', 'no_continua', 'solicitud_anulacion', 'anulada', 'cancelada', 'matriculada', 'vencida'));
    `);

    // 2. Añadir nuevas columnas si no existen
    await client.query(`
      ALTER TABLE public.reserva_cupo
      ADD COLUMN IF NOT EXISTS motivo_no_continua TEXT,
      ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT,
      ADD COLUMN IF NOT EXISTS fecha_solicitud_anulacion TIMESTAMP WITHOUT TIME ZONE,
      ADD COLUMN IF NOT EXISTS fecha_anulacion TIMESTAMP WITHOUT TIME ZONE,
      ADD COLUMN IF NOT EXISTS anulado_por_usuario_id INTEGER,
      ADD COLUMN IF NOT EXISTS fecha_reactivacion TIMESTAMP WITHOUT TIME ZONE,
      ADD COLUMN IF NOT EXISTS reactivado_por_usuario_id INTEGER;
    `);

    // 3. Crear índice para estado
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reserva_cupo_estado ON public.reserva_cupo(estado);
    `);

    await client.query('COMMIT');
    console.log('✅ Migración reserva_cupo v2 completada con éxito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
