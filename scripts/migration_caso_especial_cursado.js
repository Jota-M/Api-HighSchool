// scripts/migration_caso_especial_cursado.js
import { pool } from '../src/db/pool.js';

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Iniciando migración: soporte para casos especiales de turno cursado...');
    await client.query('BEGIN');

    // 1. Agregar columnas a tabla matricula si no existen
    await client.query(`
      ALTER TABLE matricula 
      ADD COLUMN IF NOT EXISTS paralelo_cursado_id INTEGER REFERENCES paralelo(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS motivo_cursado_especial TEXT;
    `);
    console.log('Columnas paralelo_cursado_id y motivo_cursado_especial creadas o verificadas.');

    // 2. Crear índice funcional para optimizar consultas de curso
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_matricula_paralelo_efectivo
      ON matricula (COALESCE(paralelo_cursado_id, paralelo_id))
      WHERE estado = 'activo' AND deleted_at IS NULL;
    `);
    console.log('Índice idx_matricula_paralelo_efectivo creado o verificado.');

    await client.query('COMMIT');
    console.log('Migración completada exitosamente.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error durante la migración:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
