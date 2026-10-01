// scripts/migration_entrega_evaluacion.js
import { pool } from '../src/db/pool.js';

async function runMigration() {
  console.log('--- Iniciando migración de Entrega de Evaluaciones/Prácticas ---');

  try {
    // 1. Agregar permite_entrega_archivo a la tabla evaluacion si no existe
    await pool.query(`
      ALTER TABLE evaluacion 
      ADD COLUMN IF NOT EXISTS permite_entrega_archivo BOOLEAN DEFAULT false;
    `);
    console.log('✓ Columna permite_entrega_archivo asegurada en tabla evaluacion.');

    // 2. Crear tabla evaluacion_entrega
    await pool.query(`
      CREATE TABLE IF NOT EXISTS evaluacion_entrega (
        id SERIAL PRIMARY KEY,
        evaluacion_id INTEGER NOT NULL REFERENCES evaluacion(id) ON DELETE CASCADE,
        matricula_id INTEGER NOT NULL REFERENCES matricula(id) ON DELETE CASCADE,
        archivo_url TEXT NOT NULL,
        archivo_public_id VARCHAR(255),
        archivo_nombre VARCHAR(255),
        archivo_tipo VARCHAR(50),
        archivo_tamano INTEGER,
        comentario_estudiante TEXT,
        fecha_entrega TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(20) DEFAULT 'entregado',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_evaluacion_entrega_estudiante UNIQUE (evaluacion_id, matricula_id)
      );
    `);
    console.log('✓ Tabla evaluacion_entrega creada / asegurada.');

    // 3. Crear índice para búsquedas rápidas por evaluacion_id y matricula_id
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_evaluacion_entrega_eval ON evaluacion_entrega(evaluacion_id);
      CREATE INDEX IF NOT EXISTS idx_evaluacion_entrega_mat ON evaluacion_entrega(matricula_id);
    `);
    console.log('✓ Índices creados.');

    console.log('--- Migración completada exitosamente ---');
  } catch (error) {
    console.error('Error durante la migración:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
