// scripts/fix_monto_neto_ingreso.js
// node scripts/fix_monto_neto_ingreso.js

import { pool } from '../src/db/pool.js';

async function fixMontoNetoIngreso() {
  const client = await pool.connect();

  try {
    console.log('\n==========================================');
    console.log('🔧 ARREGLANDO monto_neto EN ingreso');
    console.log('==========================================\n');

    await client.query('BEGIN');

    await client.query(`
      CREATE OR REPLACE FUNCTION calcular_monto_neto_ingreso()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.monto_neto := COALESCE(NEW.monto, 0) - COALESCE(NEW.descuento, 0) + COALESCE(NEW.recargo, 0);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Función calcular_monto_neto_ingreso creada/actualizada');

    await client.query(`
      DROP TRIGGER IF EXISTS trg_calcular_monto_neto_ingreso ON ingreso;
    `);

    await client.query(`
      CREATE TRIGGER trg_calcular_monto_neto_ingreso
      BEFORE INSERT OR UPDATE OF monto, descuento, recargo
      ON ingreso
      FOR EACH ROW
      EXECUTE FUNCTION calcular_monto_neto_ingreso();
    `);

    console.log('✅ Trigger trg_calcular_monto_neto_ingreso creado');

    const updateResult = await client.query(`
      UPDATE ingreso
      SET monto_neto = COALESCE(monto, 0) - COALESCE(descuento, 0) + COALESCE(recargo, 0)
      WHERE monto_neto IS NULL
         OR monto_neto != COALESCE(monto, 0) - COALESCE(descuento, 0) + COALESCE(recargo, 0)
      RETURNING id, codigo_ingreso, monto, descuento, recargo, monto_neto;
    `);

    console.log(`✅ Ingresos reparados: ${updateResult.rowCount}`);
    console.table(updateResult.rows);

    await client.query('COMMIT');

    console.log('\n==========================================');
    console.log('🎉 MONTO NETO ARREGLADO');
    console.log('==========================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error al arreglar monto_neto:');
    console.error(err.message);
    console.error(err.stack);
  } finally {
    client.release();
    process.exit(0);
  }
}

fixMontoNetoIngreso();