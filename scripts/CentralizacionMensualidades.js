import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function agregarCentralizacionMensualidades() {
  const client = await pool.connect();
  try {
    console.log('\n💰 INTEGRACIÓN: CENTRALIZACIÓN DE MENSUALIDADES Y VACACIONALES');
    console.log('Se agregarán funciones y triggers para centralizar:');
    console.log('\n📋 COMPONENTES A AGREGAR:');
    console.log('  ✅ Función centralizar_pago_mensualidad()');
    console.log('  ✅ Función centralizar_pago_anual()');
    console.log('  ✅ Función centralizar_pago_vacacional()');
    console.log('  ✅ Triggers automáticos para cada tipo');
    console.log('  ✅ Función migrar_ingresos_historicos()');
    console.log('  ✅ Vistas de reportes consolidados');
    console.log('\n⚡ NOTA:');
    console.log('  ℹ️  Las tablas tipo_ingreso e ingreso ya existen');
    console.log('  ℹ️  El módulo de transporte ya está configurado');
    console.log('  ℹ️  Solo se agregarán las funciones faltantes\n');

    const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ VERIFICAR TIPOS DE INGRESO EXISTENTES
    // =============================================
    console.log('🔍 Verificando tipos de ingreso...');
    
    const tiposExistentes = await client.query(`
      SELECT codigo FROM tipo_ingreso WHERE codigo IN ('ING-MENS', 'ING-ANUAL', 'ING-VACAT')
    `);
    
    const codigosExistentes = tiposExistentes.rows.map(r => r.codigo);
    console.log(`  ✅ Encontrados: ${codigosExistentes.join(', ')}`);

    // Verificar si faltan tipos
    const tiposFaltantes = [];
    if (!codigosExistentes.includes('ING-MENS')) tiposFaltantes.push("('ING-MENS', 'Mensualidad', 'Pago mensual de colegiatura', 'academico', true, '#3B82F6', 1)");
    if (!codigosExistentes.includes('ING-ANUAL')) tiposFaltantes.push("('ING-ANUAL', 'Pago Anual', 'Pago anual completo con descuento', 'academico', true, '#10B981', 2)");
    if (!codigosExistentes.includes('ING-VACAT')) tiposFaltantes.push("('ING-VACAT', 'Curso Vacacional', 'Inscripción a cursos vacacionales', 'vacacional', false, '#8B5CF6', 4)");

    if (tiposFaltantes.length > 0) {
      console.log('  📝 Insertando tipos faltantes...');
      await client.query(`
        INSERT INTO tipo_ingreso (codigo, nombre, descripcion, categoria, requiere_estudiante, color, orden)
        VALUES ${tiposFaltantes.join(', ')}
      `);
      console.log(`  ✅ ${tiposFaltantes.length} tipos agregados`);
    }

    // =============================================
    // 2️⃣ FUNCIÓN: centralizar_pago_mensualidad
    // =============================================
    console.log('\n🔧 Creando función centralizar_pago_mensualidad...');
    
    await client.query(`
      CREATE OR REPLACE FUNCTION centralizar_pago_mensualidad(
        p_pago_mensualidad_id INTEGER
      )
      RETURNS INTEGER AS $$
      DECLARE
        v_ingreso_id INTEGER;
        v_tipo_ingreso_id INTEGER;
        v_codigo_ingreso VARCHAR;
        v_pago RECORD;
        v_mensualidad RECORD;
        v_matricula RECORD;
      BEGIN
        -- Obtener tipo de ingreso
        SELECT id INTO v_tipo_ingreso_id
        FROM tipo_ingreso
        WHERE codigo = 'ING-MENS';
        
        IF v_tipo_ingreso_id IS NULL THEN
          RAISE EXCEPTION 'Tipo de ingreso ING-MENS no encontrado';
        END IF;
        
        -- Verificar si ya está centralizado
        SELECT id INTO v_ingreso_id
        FROM ingreso 
        WHERE referencia_tipo = 'mensualidad' 
          AND referencia_id = p_pago_mensualidad_id;
          
        IF v_ingreso_id IS NOT NULL THEN
          RETURN v_ingreso_id; -- Ya existe, retornar ID
        END IF;
        
        -- Obtener datos del pago
        SELECT * INTO v_pago
        FROM pago_mensualidad
        WHERE id = p_pago_mensualidad_id;
        
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Pago de mensualidad % no encontrado', p_pago_mensualidad_id;
        END IF;
        
        -- No centralizar si está anulado
        IF v_pago.anulado THEN
          RETURN NULL;
        END IF;
        
        -- Obtener datos de la mensualidad
        SELECT * INTO v_mensualidad
        FROM mensualidad
        WHERE id = v_pago.mensualidad_id;
        
        -- Obtener datos de la matrícula
        SELECT * INTO v_matricula
        FROM matricula
        WHERE id = v_mensualidad.matricula_id;
        
        -- Generar código único
        v_codigo_ingreso := 'ING-' || TO_CHAR(v_pago.fecha_pago, 'YYYYMMDD') || 
                            '-' || LPAD(nextval('ingreso_id_seq')::TEXT, 6, '0');
        
        -- Insertar en tabla centralizada
        INSERT INTO ingreso (
          codigo_ingreso, tipo_ingreso_id, fecha_ingreso,
          periodo_academico_id, estudiante_id, matricula_id,
          referencia_tipo, referencia_id, referencia_codigo,
          monto, descuento, recargo,
          metodo_pago, numero_comprobante, comprobante_url,
          banco, numero_referencia,
          requiere_factura, factura_emitida, numero_factura,
          registrado_por, observaciones,
          estado, verificado
        )
        VALUES (
          v_codigo_ingreso,
          v_tipo_ingreso_id,
          v_pago.fecha_pago,
          v_matricula.periodo_academico_id,
          v_matricula.estudiante_id,
          v_mensualidad.matricula_id,
          'mensualidad',
          p_pago_mensualidad_id,
          v_pago.codigo_pago,
          v_mensualidad.monto_original,
          v_mensualidad.monto_beca,
          v_mensualidad.monto_recargo,
          v_pago.metodo_pago,
          v_pago.numero_comprobante,
          v_pago.comprobante_url,
          v_pago.banco_origen,
          v_pago.numero_referencia,
          v_pago.entrego_factura,
          v_pago.entrego_factura,
          v_pago.numero_factura,
          v_pago.registrado_por,
          'Mensualidad #' || v_mensualidad.numero_cuota || ' - ' || v_mensualidad.mes_correspondiente,
          'registrado',
          true
        )
        RETURNING id INTO v_ingreso_id;
        
        RETURN v_ingreso_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función centralizar_pago_mensualidad creada');

    // =============================================
    // 3️⃣ FUNCIÓN: centralizar_pago_anual
    // =============================================
    console.log('🔧 Creando función centralizar_pago_anual...');
    
    await client.query(`
      CREATE OR REPLACE FUNCTION centralizar_pago_anual(
        p_pago_anual_id INTEGER
      )
      RETURNS INTEGER AS $$
      DECLARE
        v_ingreso_id INTEGER;
        v_tipo_ingreso_id INTEGER;
        v_codigo_ingreso VARCHAR;
        v_pago RECORD;
        v_matricula RECORD;
      BEGIN
        SELECT id INTO v_tipo_ingreso_id
        FROM tipo_ingreso
        WHERE codigo = 'ING-ANUAL';
        
        IF v_tipo_ingreso_id IS NULL THEN
          RAISE EXCEPTION 'Tipo de ingreso ING-ANUAL no encontrado';
        END IF;
        
        SELECT id INTO v_ingreso_id
        FROM ingreso 
        WHERE referencia_tipo = 'pago_anual' 
          AND referencia_id = p_pago_anual_id;
          
        IF v_ingreso_id IS NOT NULL THEN
          RETURN v_ingreso_id;
        END IF;
        
        SELECT * INTO v_pago
        FROM pago_anual_completo
        WHERE id = p_pago_anual_id;
        
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Pago anual % no encontrado', p_pago_anual_id;
        END IF;
        
        SELECT * INTO v_matricula
        FROM matricula
        WHERE id = v_pago.matricula_id;
        
        v_codigo_ingreso := 'ING-' || TO_CHAR(v_pago.fecha_pago, 'YYYYMMDD') || 
                            '-' || LPAD(nextval('ingreso_id_seq')::TEXT, 6, '0');
        
        INSERT INTO ingreso (
          codigo_ingreso, tipo_ingreso_id, fecha_ingreso,
          periodo_academico_id, estudiante_id, matricula_id,
          referencia_tipo, referencia_id, referencia_codigo,
          monto, descuento, recargo,
          metodo_pago, numero_comprobante, comprobante_url,
          banco, numero_referencia,
          requiere_factura, factura_emitida, numero_factura,
          registrado_por, observaciones,
          estado, verificado
        )
        VALUES (
          v_codigo_ingreso,
          v_tipo_ingreso_id,
          v_pago.fecha_pago,
          v_matricula.periodo_academico_id,
          v_matricula.estudiante_id,
          v_pago.matricula_id,
          'pago_anual',
          p_pago_anual_id,
          v_pago.codigo_pago,
          v_pago.monto_total_sin_descuento,
          v_pago.monto_descuento + v_pago.monto_beca_total,
          0,
          v_pago.metodo_pago,
          v_pago.numero_comprobante,
          v_pago.comprobante_url,
          v_pago.banco_origen,
          v_pago.numero_referencia,
          v_pago.entrego_factura,
          v_pago.entrego_factura,
          v_pago.numero_factura,
          v_pago.registrado_por,
          'Pago anual completo - 10 meses',
          'registrado',
          true
        )
        RETURNING id INTO v_ingreso_id;
        
        RETURN v_ingreso_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función centralizar_pago_anual creada');

    // =============================================
    // 4️⃣ FUNCIÓN: centralizar_pago_vacacional
    // =============================================
    console.log('🔧 Creando función centralizar_pago_vacacional...');
    
    await client.query(`
      CREATE OR REPLACE FUNCTION centralizar_pago_vacacional(
        p_inscripcion_id INTEGER
      )
      RETURNS INTEGER AS $$
      DECLARE
        v_ingreso_id INTEGER;
        v_tipo_ingreso_id INTEGER;
        v_codigo_ingreso VARCHAR;
        v_inscripcion RECORD;
      BEGIN
        SELECT id INTO v_tipo_ingreso_id
        FROM tipo_ingreso
        WHERE codigo = 'ING-VACAT';
        
        IF v_tipo_ingreso_id IS NULL THEN
          RAISE EXCEPTION 'Tipo de ingreso ING-VACAT no encontrado';
        END IF;
        
        SELECT id INTO v_ingreso_id
        FROM ingreso 
        WHERE referencia_tipo = 'vacacional' 
          AND referencia_id = p_inscripcion_id;
          
        IF v_ingreso_id IS NOT NULL THEN
          RETURN v_ingreso_id;
        END IF;
        
        SELECT * INTO v_inscripcion
        FROM inscripcion_vacacional
        WHERE id = p_inscripcion_id;
        
        IF NOT FOUND OR NOT v_inscripcion.pago_verificado THEN
          RETURN NULL;
        END IF;
        
        v_codigo_ingreso := 'ING-' || TO_CHAR(COALESCE(v_inscripcion.fecha_verificacion, CURRENT_TIMESTAMP), 'YYYYMMDD') || 
                            '-' || LPAD(nextval('ingreso_id_seq')::TEXT, 6, '0');
        
        INSERT INTO ingreso (
          codigo_ingreso, tipo_ingreso_id, fecha_ingreso,
          referencia_tipo, referencia_id, referencia_codigo,
          monto, descuento, recargo,
          metodo_pago, numero_comprobante, comprobante_url,
          registrado_por, verificado_por, fecha_verificacion,
          observaciones, estado, verificado
        )
        VALUES (
          v_codigo_ingreso,
          v_tipo_ingreso_id,
          COALESCE(v_inscripcion.fecha_verificacion, CURRENT_TIMESTAMP),
          'vacacional',
          p_inscripcion_id,
          v_inscripcion.codigo_inscripcion,
          v_inscripcion.monto_pagado,
          0, 0,
          v_inscripcion.metodo_pago,
          v_inscripcion.numero_comprobante,
          v_inscripcion.comprobante_pago_url,
          v_inscripcion.verificado_por,
          v_inscripcion.verificado_por,
          v_inscripcion.fecha_verificacion,
          'Inscripción vacacional',
          'registrado',
          true
        )
        RETURNING id INTO v_ingreso_id;
        
        RETURN v_ingreso_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función centralizar_pago_vacacional creada');

    // =============================================
    // 5️⃣ TRIGGERS AUTOMÁTICOS
    // =============================================
    console.log('\n⚡ Creando triggers automáticos...');

    // Trigger para mensualidades
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_centralizar_pago_mensualidad()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT NEW.anulado THEN
          PERFORM centralizar_pago_mensualidad(NEW.id);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('DROP TRIGGER IF EXISTS auto_centralizar_pago_mensualidad ON pago_mensualidad');
    await client.query(`
      CREATE TRIGGER auto_centralizar_pago_mensualidad
      AFTER INSERT ON pago_mensualidad
      FOR EACH ROW EXECUTE FUNCTION trigger_centralizar_pago_mensualidad()
    `);
    
    console.log('  ✅ Trigger auto_centralizar_pago_mensualidad');

    // Trigger para pagos anuales
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_centralizar_pago_anual()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM centralizar_pago_anual(NEW.id);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('DROP TRIGGER IF EXISTS auto_centralizar_pago_anual ON pago_anual_completo');
    await client.query(`
      CREATE TRIGGER auto_centralizar_pago_anual
      AFTER INSERT ON pago_anual_completo
      FOR EACH ROW EXECUTE FUNCTION trigger_centralizar_pago_anual()
    `);
    
    console.log('  ✅ Trigger auto_centralizar_pago_anual');

    // Trigger para vacacionales
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_centralizar_pago_vacacional()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.pago_verificado = true AND (OLD.pago_verificado = false OR OLD.pago_verificado IS NULL) THEN
          PERFORM centralizar_pago_vacacional(NEW.id);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('DROP TRIGGER IF EXISTS auto_centralizar_pago_vacacional ON inscripcion_vacacional');
    await client.query(`
      CREATE TRIGGER auto_centralizar_pago_vacacional
      AFTER UPDATE ON inscripcion_vacacional
      FOR EACH ROW EXECUTE FUNCTION trigger_centralizar_pago_vacacional()
    `);
    
    console.log('  ✅ Trigger auto_centralizar_pago_vacacional');

    // =============================================
    // 6️⃣ FUNCIÓN DE MIGRACIÓN HISTÓRICA
    // =============================================
    console.log('\n📦 Creando función de migración histórica...');

    await client.query(`
      CREATE OR REPLACE FUNCTION migrar_ingresos_historicos()
      RETURNS TABLE(
        tipo VARCHAR,
        procesados INTEGER,
        exitosos INTEGER,
        fallidos INTEGER
      ) AS $$
      DECLARE
        v_proc INTEGER;
        v_exit INTEGER;
        v_fail INTEGER;
        v_id INTEGER;
      BEGIN
        -- Mensualidades
        v_proc := 0; v_exit := 0; v_fail := 0;
        FOR v_id IN SELECT id FROM pago_mensualidad WHERE NOT anulado LOOP
          v_proc := v_proc + 1;
          BEGIN
            PERFORM centralizar_pago_mensualidad(v_id);
            v_exit := v_exit + 1;
          EXCEPTION WHEN OTHERS THEN
            v_fail := v_fail + 1;
          END;
        END LOOP;
        tipo := 'Mensualidades'; procesados := v_proc; exitosos := v_exit; fallidos := v_fail;
        RETURN NEXT;
        
        -- Pagos anuales
        v_proc := 0; v_exit := 0; v_fail := 0;
        FOR v_id IN SELECT id FROM pago_anual_completo LOOP
          v_proc := v_proc + 1;
          BEGIN
            PERFORM centralizar_pago_anual(v_id);
            v_exit := v_exit + 1;
          EXCEPTION WHEN OTHERS THEN
            v_fail := v_fail + 1;
          END;
        END LOOP;
        tipo := 'Pagos Anuales'; procesados := v_proc; exitosos := v_exit; fallidos := v_fail;
        RETURN NEXT;
        
        -- Vacacionales
        v_proc := 0; v_exit := 0; v_fail := 0;
        FOR v_id IN SELECT id FROM inscripcion_vacacional WHERE pago_verificado = true LOOP
          v_proc := v_proc + 1;
          BEGIN
            PERFORM centralizar_pago_vacacional(v_id);
            v_exit := v_exit + 1;
          EXCEPTION WHEN OTHERS THEN
            v_fail := v_fail + 1;
          END;
        END LOOP;
        tipo := 'Vacacionales'; procesados := v_proc; exitosos := v_exit; fallidos := v_fail;
        RETURN NEXT;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función migrar_ingresos_historicos');

    // =============================================
    // 7️⃣ VISTAS DE REPORTES
    // =============================================
    console.log('\n📊 Creando vistas de reportes...');

    await client.query(`
      CREATE OR REPLACE VIEW v_ingresos_consolidados AS
      SELECT 
        i.id,
        i.codigo_ingreso,
        ti.nombre as tipo_ingreso,
        ti.categoria,
        i.fecha_ingreso,
        pa.nombre as periodo,
        e.codigo as codigo_estudiante,
        e.nombres || ' ' || e.apellidos as estudiante,
        i.monto,
        i.descuento,
        i.recargo,
        i.monto_neto,
        i.metodo_pago,
        i.estado,
        u.username as registrado_por
      FROM ingreso i
      JOIN tipo_ingreso ti ON i.tipo_ingreso_id = ti.id
      LEFT JOIN periodo_academico pa ON i.periodo_academico_id = pa.id
      LEFT JOIN estudiante e ON i.estudiante_id = e.id
      LEFT JOIN usuarios u ON i.registrado_por = u.id
      WHERE NOT i.anulado
      ORDER BY i.fecha_ingreso DESC
    `);
    
    console.log('  ✅ Vista v_ingresos_consolidados');

    await client.query(`
      CREATE OR REPLACE VIEW v_ingresos_por_categoria AS
      SELECT 
        ti.categoria,
        ti.nombre as tipo_ingreso,
        COUNT(i.id) as cantidad,
        SUM(i.monto_neto) as total_ingresos,
        DATE_TRUNC('month', i.fecha_ingreso) as mes
      FROM ingreso i
      JOIN tipo_ingreso ti ON i.tipo_ingreso_id = ti.id
      WHERE NOT i.anulado
      GROUP BY ti.categoria, ti.nombre, DATE_TRUNC('month', i.fecha_ingreso)
      ORDER BY mes DESC, total_ingresos DESC
    `);
    
    console.log('  ✅ Vista v_ingresos_por_categoria');

    // =============================================
    // 8️⃣ MIGRAR DATOS EXISTENTES
    // =============================================
    console.log('\n🔄 Migrando datos históricos...');
    
    const resultados = await client.query('SELECT * FROM migrar_ingresos_historicos()');
    
    console.log('\n📊 RESULTADOS DE MIGRACIÓN:');
    console.log('┌─────────────────┬────────────┬──────────┬──────────┐');
    console.log('│ Tipo            │ Procesados │ Exitosos │ Fallidos │');
    console.log('├─────────────────┼────────────┼──────────┼──────────┤');
    resultados.rows.forEach(row => {
      console.log(`│ ${row.tipo.padEnd(15)} │ ${String(row.procesados).padStart(10)} │ ${String(row.exitosos).padStart(8)} │ ${String(row.fallidos).padStart(8)} │`);
    });
    console.log('└─────────────────┴────────────┴──────────┴──────────┘');

    await client.query('COMMIT');

    console.log('\n✅ ¡INTEGRACIÓN COMPLETADA EXITOSAMENTE!\n');
    console.log('📊 RESUMEN:');
    console.log('┌────────────────────────────────────────┐');
    console.log('│ ✅ 3 Funciones de centralización      │');
    console.log('│ ✅ 3 Triggers automáticos             │');
    console.log('│ ✅ 1 Función de migración             │');
    console.log('│ ✅ 2 Vistas de reportes               │');
    console.log('│ ✅ Datos históricos migrados          │');
    console.log('└────────────────────────────────────────┘\n');
    console.log('🎯 SISTEMA COMPLETO:');
    console.log('   ✓ Mensualidades → centralizadas');
    console.log('   ✓ Pagos anuales → centralizados');
    console.log('   ✓ Vacacionales → centralizados');
    console.log('   ✓ Transporte → centralizado');
    console.log('\n💡 Todos los nuevos pagos se centralizarán automáticamente\n');

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

agregarCentralizacionMensualidades().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});