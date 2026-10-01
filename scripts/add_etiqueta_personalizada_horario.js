// scripts/add_etiqueta_personalizada_horario.js
import { pool } from '../src/db/pool.js';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Añadiendo columna etiqueta_personalizada a horario_detalle...');

    await client.query(`
      ALTER TABLE horario_detalle 
      ADD COLUMN IF NOT EXISTS etiqueta_personalizada VARCHAR(100);
    `);

    console.log('✅ Columna etiqueta_personalizada añadida exitosamente.');
  } catch (err) {
    console.error('❌ Error en migración:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
