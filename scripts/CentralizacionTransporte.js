import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function agregarTriggerCentralizacionTransporte() {
  const client = await pool.connect();
  try {
    console.log('\n🚌 CORRECCIÓN: Trigger de Centralización de Transporte');
    console.log('Se agregará el trigger automático faltante para centralizar pagos de transporte\n');
    console.log('📋 COMPONENTES A AGREGAR:');
    console.log('  ✅ Función trigger_centralizar_pago_transporte()');
    console.log('  ✅ Trigger auto_centralizar_pago_transporte');
    console.log('  ✅ Migración de pagos de transporte existentes\n');

    const confirm = await ask('¿Deseas continuar con la corrección? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ VERIFICAR QUE EXISTA LA FUNCIÓN BASE
    // =============================================
    console.log('🔍 Verificando función centralizar_pago_transporte...');
    
    const funcionExiste = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'centralizar_pago_transporte'
      ) as existe
    `);

    if (!funcionExiste.rows[0].existe) {
      console.log('  ❌ La función centralizar_pago_transporte no existe');
      console.log('  ℹ️  Asegúrate de haber ejecutado el script crearModuloTransporteIngresos.js primero');
      await client.query('ROLLBACK');
      process.exit(1);
    }
    
    console.log('  ✅ Función base encontrada');

    // =============================================
    // 2️⃣ CREAR FUNCIÓN TRIGGER
    // =============================================
    console.log('\n⚡ Creando función trigger...');
    
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_centralizar_pago_transporte()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Solo centralizar si el pago está en estado 'pagado' y no está anulado
        IF NEW.estado = 'pagado' AND NOT NEW.anulado THEN
          PERFORM centralizar_pago_transporte(NEW.id);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función trigger_centralizar_pago_transporte creada');

    // =============================================
    // 3️⃣ CREAR TRIGGER
    // =============================================
    console.log('⚡ Creando trigger automático...');
    
    await client.query('DROP TRIGGER IF EXISTS auto_centralizar_pago_transporte ON pago_transporte');
    await client.query(`
      CREATE TRIGGER auto_centralizar_pago_transporte
      AFTER INSERT OR UPDATE ON pago_transporte
      FOR EACH ROW EXECUTE FUNCTION trigger_centralizar_pago_transporte()
    `);
    
    console.log('  ✅ Trigger auto_centralizar_pago_transporte creado');

    // =============================================
    // 4️⃣ MIGRAR PAGOS EXISTENTES
    // =============================================
    console.log('\n🔄 Migrando pagos de transporte existentes...');
    
    const pagosPendientes = await client.query(`
      SELECT pt.id
      FROM pago_transporte pt
      LEFT JOIN ingreso i ON i.referencia_tipo = 'transporte' AND i.referencia_id = pt.id
      WHERE pt.estado = 'pagado'
        AND NOT pt.anulado
        AND i.id IS NULL
    `);

    console.log(`  📊 Encontrados ${pagosPendientes.rows.length} pagos sin centralizar`);

    let exitosos = 0;
    let fallidos = 0;

    for (const pago of pagosPendientes.rows) {
      try {
        await client.query('SELECT centralizar_pago_transporte($1)', [pago.id]);
        exitosos++;
      } catch (error) {
        console.error(`  ⚠️  Error en pago ${pago.id}: ${error.message}`);
        fallidos++;
      }
    }

    console.log(`  ✅ Migración completada: ${exitosos} exitosos, ${fallidos} fallidos`);

    // =============================================
    // 5️⃣ VERIFICACIÓN FINAL
    // =============================================
    console.log('\n🔍 Verificación final...');
    
    const stats = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE estado = 'pagado' AND NOT anulado) as total_pagados,
        COUNT(*) FILTER (
          WHERE estado = 'pagado' 
            AND NOT anulado 
            AND EXISTS (
              SELECT 1 FROM ingreso 
              WHERE referencia_tipo = 'transporte' 
                AND referencia_id = pago_transporte.id
            )
        ) as total_centralizados
      FROM pago_transporte
    `);

    const { total_pagados, total_centralizados } = stats.rows[0];

    console.log('┌────────────────────────────────────────┐');
    console.log(`│ Pagos pagados:      ${String(total_pagados).padStart(15)} │`);
    console.log(`│ Pagos centralizados: ${String(total_centralizados).padStart(14)} │`);
    console.log('└────────────────────────────────────────┘');

    await client.query('COMMIT');

    console.log('\n✅ ¡CORRECCIÓN COMPLETADA EXITOSAMENTE!\n');
    console.log('📊 RESUMEN:');
    console.log('┌────────────────────────────────────────────┐');
    console.log('│ ✅ Función trigger creada                 │');
    console.log('│ ✅ Trigger automático activado            │');
    console.log('│ ✅ Pagos históricos migrados              │');
    console.log('└────────────────────────────────────────────┘\n');
    console.log('🎯 PRÓXIMOS PASOS:');
    console.log('   ✓ Los nuevos pagos se centralizarán automáticamente');
    console.log('   ✓ Verifica que aparezcan en la tabla ingreso');
    console.log('   ✓ Registra un pago de prueba para confirmar\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error en la operación:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    rl.close();
    process.exit(0);
  }
}

agregarTriggerCentralizacionTransporte().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});