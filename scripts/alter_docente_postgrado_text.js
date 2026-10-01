// scripts/alter_docente_postgrado_text.js
import { pool } from '../src/db/pool.js';

async function alterDocenteColumns() {
  const client = await pool.connect();
  try {
    console.log('🔄 Modificando columnas de la tabla docente a TEXT...');

    await client.query(`
      ALTER TABLE docente 
      ALTER COLUMN titulo_postgrado TYPE TEXT,
      ALTER COLUMN titulo_profesional TYPE TEXT,
      ALTER COLUMN especialidad TYPE TEXT;
    `);

    console.log('✅ Columnas modificadas a TEXT exitosamente en la tabla docente.');
  } catch (error) {
    console.error('❌ Error al modificar columnas:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

alterDocenteColumns();
