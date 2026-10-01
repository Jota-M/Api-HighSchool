// scripts/fix_actualizar_updated_at_trigger.js
import { pool } from '../src/db/pool.js';

async function fixTrigger() {
  const client = await pool.connect();
  try {
    console.log('🔄 Corrigiendo función global actualizar_updated_at()...');

    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
        EXCEPTION WHEN undefined_column THEN
          -- Si la tabla no tiene updated_at, omitir
        END;
        
        BEGIN
          NEW.actualizado_en = CURRENT_TIMESTAMP;
        EXCEPTION WHEN undefined_column THEN
          -- Si la tabla no tiene actualizado_en, omitir
        END;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Función actualizar_updated_at() corregida y protegida exitosamente.');
  } catch (err) {
    console.error('❌ Error al corregir función trigger:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

fixTrigger();
