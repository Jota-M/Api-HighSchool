import { pool } from '../src/db/pool.js';

async function diagnosticarCuotasTransporte() {
  const client = await pool.connect();
  try {
    console.log('\n🔍 DIAGNÓSTICO: Generación de Cuotas de Transporte\n');

    // 1. Verificar asignaciones existentes
    console.log('📋 ASIGNACIONES DE TRANSPORTE:');
    console.log('─'.repeat(80));
    const asignaciones = await client.query(`
      SELECT 
        id,
        estudiante_id,
        ruta_id,
        fecha_inicio,
        fecha_fin,
        costo_mensual,
        estado
      FROM asignacion_transporte
      ORDER BY id
      LIMIT 5
    `);
    
    if (asignaciones.rows.length === 0) {
      console.log('⚠️  No hay asignaciones de transporte creadas');
    } else {
      asignaciones.rows.forEach(row => {
        console.log(`ID: ${row.id}`);
        console.log(`  Estudiante ID: ${row.estudiante_id}`);
        console.log(`  Ruta ID: ${row.ruta_id}`);
        console.log(`  Fecha Inicio: ${row.fecha_inicio}`);
        console.log(`  Fecha Fin: ${row.fecha_fin || 'N/A'}`);
        console.log(`  Costo: Bs. ${row.costo_mensual}`);
        console.log(`  Estado: ${row.estado}`);
        console.log('─'.repeat(80));
      });
    }

    // 2. Verificar cuotas generadas
    console.log('\n💳 CUOTAS GENERADAS:');
    console.log('─'.repeat(80));
    const cuotas = await client.query(`
      SELECT 
        pt.id,
        pt.codigo_pago,
        pt.asignacion_transporte_id,
        pt.mes_correspondiente,
        pt.fecha_vencimiento,
        pt.monto_original,
        pt.estado,
        at.fecha_inicio as asignacion_fecha_inicio
      FROM pago_transporte pt
      JOIN asignacion_transporte at ON pt.asignacion_transporte_id = at.id
      ORDER BY pt.asignacion_transporte_id, pt.fecha_vencimiento
      LIMIT 20
    `);
    
    if (cuotas.rows.length === 0) {
      console.log('⚠️  No hay cuotas generadas todavía');
    } else {
      let currentAsignacion = null;
      cuotas.rows.forEach(row => {
        if (row.asignacion_transporte_id !== currentAsignacion) {
          currentAsignacion = row.asignacion_transporte_id;
          console.log(`\n🎫 ASIGNACIÓN #${row.asignacion_transporte_id} (Inicio: ${row.asignacion_fecha_inicio})`);
        }
        console.log(`  ${row.codigo_pago} | ${row.mes_correspondiente.padEnd(20)} | ${row.fecha_vencimiento} | Bs. ${row.monto_original} | ${row.estado}`);
      });
      console.log('─'.repeat(80));
    }

    // 3. Probar la función con una fecha específica
    console.log('\n🧪 PRUEBA DE LA FUNCIÓN generar_cuotas_transporte:');
    console.log('─'.repeat(80));
    console.log('Simulando generación con fecha_inicio = 2025-02-01');
    
    const prueba = await client.query(`
      SELECT * FROM (
        SELECT 
          generate_series AS contador,
          DATE '2025-02-01' + ((generate_series - 1) * INTERVAL '1 month') AS fecha_calculada,
          TO_CHAR(DATE '2025-02-01' + ((generate_series - 1) * INTERVAL '1 month'), 'TMMonth YYYY') AS mes_nombre
        FROM generate_series(1, 10)
      ) AS test
    `);
    
    prueba.rows.forEach(row => {
      console.log(`  Cuota ${row.contador}: ${row.mes_nombre.padEnd(20)} | ${row.fecha_calculada}`);
    });
    console.log('─'.repeat(80));

    // 4. Verificar la función actual
    console.log('\n🔧 VERIFICANDO LA FUNCIÓN generar_cuotas_transporte:');
    console.log('─'.repeat(80));
    const funcionInfo = await client.query(`
      SELECT 
        pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' 
        AND p.proname = 'generar_cuotas_transporte'
    `);
    
    if (funcionInfo.rows.length > 0) {
      const def = funcionInfo.rows[0].definition;
      // Extraer solo la línea del cálculo de fecha
      const lines = def.split('\n');
      const relevantLines = lines.filter(line => 
        line.includes('v_fecha_venc') || 
        line.includes('INTERVAL') ||
        line.includes('fecha_inicio')
      );
      console.log('Líneas relevantes de la función:');
      relevantLines.forEach(line => console.log(`  ${line.trim()}`));
    } else {
      console.log('⚠️  Función no encontrada');
    }
    console.log('─'.repeat(80));

    console.log('\n✅ Diagnóstico completado\n');

  } catch (error) {
    console.error('\n💥 Error en diagnóstico:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    process.exit(0);
  }
}

diagnosticarCuotasTransporte().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});