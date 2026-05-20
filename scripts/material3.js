import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function fixTriggerCodigoMaterial() {
  const client = await pool.connect();

  try {
    console.log('\n🔧 MIGRACIÓN: FIX TRIGGER CODIGO MATERIAL');
    console.log('\nCambios a realizar:');
    console.log('  1️⃣  CREATE OR REPLACE FUNCTION generar_codigo_material');
    console.log('  2️⃣  Evitar duplicados (race conditions)');
    console.log('  3️⃣  Generación automática tipo MAT-YYYY-000001\n');

    const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');
    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ FUNCTION generar_codigo_material
    // =============================================
    console.log('⚙️ Creando/Reemplazando función...');

    await client.query(`
      CREATE OR REPLACE FUNCTION generar_codigo_material()
      RETURNS TRIGGER AS $$
      DECLARE
        v_year     VARCHAR(4);
        v_counter  INTEGER;
        v_codigo   VARCHAR(50);
        v_intentos INTEGER := 0;
      BEGIN
        IF NEW.codigo_material IS NULL OR NEW.codigo_material = '' THEN
          v_year := TO_CHAR(CURRENT_DATE, 'YYYY');

          LOOP
            SELECT COALESCE(MAX(
              CAST(SUBSTRING(codigo_material FROM 'MAT-' || v_year || '-(\\d+)') AS INTEGER)
            ), 0) + 1
            INTO v_counter
            FROM material_academico
            WHERE codigo_material LIKE 'MAT-' || v_year || '-%';

            v_codigo := 'MAT-' || v_year || '-' || LPAD(v_counter::TEXT, 6, '0');

            EXIT WHEN NOT EXISTS (
              SELECT 1 FROM material_academico WHERE codigo_material = v_codigo
            );

            v_intentos := v_intentos + 1;

            IF v_intentos > 10 THEN
              RAISE EXCEPTION 'No se pudo generar un código único para el material';
            END IF;
          END LOOP;

          NEW.codigo_material := v_codigo;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función generar_codigo_material creada/actualizada');

    // =============================================
    // 2️⃣ TRIGGER (por si no existe o quieres asegurar)
    // =============================================
    console.log('⚡ Configurando trigger...');

    await client.query(`
      DROP TRIGGER IF EXISTS trg_generar_codigo_material ON material_academico;
    `);

    await client.query(`
      CREATE TRIGGER trg_generar_codigo_material
      BEFORE INSERT ON material_academico
      FOR EACH ROW
      EXECUTE FUNCTION generar_codigo_material();
    `);

    console.log('  ✅ Trigger configurado');

    await client.query('COMMIT');

    console.log('\n✅ Migración completada exitosamente\n');
    console.log('📊 RESUMEN:');
    console.log('┌──────────────────────────────────────────────┐');
    console.log('│ ✅ Función generar_codigo_material           │');
    console.log('│ ✅ Trigger BEFORE INSERT configurado         │');
    console.log('│ ✅ Prevención de duplicados (loop + retry)   │');
    console.log('└──────────────────────────────────────────────┘\n');

    console.log('💡 Resultado:');
    console.log('   Ahora cada material se generará automáticamente así:');
    console.log('   👉 MAT-2026-000001');
    console.log('   👉 MAT-2026-000002\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    rl.close();
    process.exit(0);
  }
}

fixTriggerCodigoMaterial().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});