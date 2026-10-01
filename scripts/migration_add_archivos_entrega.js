// scripts/migration_add_archivos_entrega.js
import { pool } from '../src/db/pool.js';

async function run() {
  console.log('--- Migración: Agregar columna archivos JSONB a evaluacion_entrega ---');
  try {
    // 1. Agregar columna archivos JSONB si no existe
    await pool.query(`
      ALTER TABLE evaluacion_entrega
      ADD COLUMN IF NOT EXISTS archivos JSONB DEFAULT '[]'::jsonb;
    `);
    console.log('✓ Columna archivos JSONB agregada o ya existente.');

    // 2. Si hay filas existentes con archivo_url y archivos vacío/nulo, sincronizarlas
    const updateRes = await pool.query(`
      UPDATE evaluacion_entrega
      SET archivos = jsonb_build_array(
        jsonb_build_object(
          'url', archivo_url,
          'public_id', archivo_public_id,
          'nombre', archivo_nombre,
          'tipo', archivo_tipo,
          'tamano', archivo_tamano
        )
      )
      WHERE archivo_url IS NOT NULL 
        AND (archivos IS NULL OR jsonb_array_length(archivos) = 0);
    `);
    console.log(`✓ Sincronizadas ${updateRes.rowCount} entregas previas con formato array.`);

    // 3. Verificar estructura
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'evaluacion_entrega';
    `);
    console.log('Columnas actuales de evaluacion_entrega:', cols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
  } catch (err) {
    console.error('Error en migración:', err);
  } finally {
    await pool.end();
  }
}

run();
