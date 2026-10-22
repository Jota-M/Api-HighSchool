// scripts/migracion_hermanos_entrevista.js
import { pool } from '../src/db/pool.js';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Iniciando migración: soporte de entrevistas para reserva_cupo_hermano...');
    await client.query('BEGIN');

    // 1. Agregar columnas para la gestión de entrevistas
    await client.query(`
      ALTER TABLE public.reserva_cupo_hermano
      ADD COLUMN IF NOT EXISTS estado_entrevista VARCHAR(30) DEFAULT 'pendiente',
      ADD COLUMN IF NOT EXISTS fecha_entrevista TIMESTAMP WITHOUT TIME ZONE,
      ADD COLUMN IF NOT EXISTS modalidad_entrevista VARCHAR(30) DEFAULT 'presencial',
      ADD COLUMN IF NOT EXISTS lugar_entrevista VARCHAR(255) DEFAULT 'Dirección del Colegio - Oficina Principal',
      ADD COLUMN IF NOT EXISTS enlace_entrevista VARCHAR(255),
      ADD COLUMN IF NOT EXISTS observaciones_entrevista TEXT,
      ADD COLUMN IF NOT EXISTS fecha_notificacion_entrevista TIMESTAMP WITHOUT TIME ZONE,
      ADD COLUMN IF NOT EXISTS notificado_whatsapp BOOLEAN DEFAULT false;
    `);

    // 2. Establecer 'pendiente' para registros previos que no tengan estado_entrevista
    await client.query(`
      UPDATE public.reserva_cupo_hermano
      SET estado_entrevista = 'pendiente'
      WHERE estado_entrevista IS NULL;
    `);

    // 3. Crear índice para optimizar consultas de entrevistas
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reserva_cupo_hermano_entrevista 
      ON public.reserva_cupo_hermano(estado_entrevista);
    `);

    await client.query('COMMIT');
    console.log('✅ Migración de entrevistas para hermanos ejecutada con éxito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en la migración de entrevistas:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
