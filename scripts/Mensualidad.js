import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function crearTablasPayments() {
  const client = await pool.connect();
  try {
    console.log('\n💰 CREACIÓN DE SISTEMA DE PAGOS DE MENSUALIDADES');
    console.log('Se crearán las siguientes tablas y componentes:');
    console.log('\n📋 TABLAS:');
    console.log('  1️⃣  costo_mensualidad - Configuración de costos por nivel');
    console.log('  2️⃣  mensualidad - Cuotas mensuales por matrícula');
    console.log('  3️⃣  pago_mensualidad - Registro de pagos individuales');
    console.log('  4️⃣  pago_anual_completo - Pagos de 10 meses con descuento');
    console.log('\n⚙️  COMPONENTES:');
    console.log('  ✅ Índices de optimización');
    console.log('  ✅ Triggers automáticos');
    console.log('  ✅ Funciones stored procedures');
    console.log('  ✅ Vistas para reportes');
    console.log('\n⚡ FUNCIONALIDADES:');
    console.log('  🎯 Generación automática de 10 mensualidades');
    console.log('  🎯 Aplicación automática de becas');
    console.log('  🎯 Descuento de 1 mes al pagar completo');
    console.log('  🎯 Soporte para múltiples métodos de pago');
    console.log('  🎯 Preparado para QR dinámico (futuro)');
    console.log('  🎯 Reportes de morosidad y ingresos\n');

    const confirm = await ask('¿Deseas continuar con la creación? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ TABLA: costo_mensualidad
    // =============================================
    console.log('💵 Creando tabla COSTO_MENSUALIDAD...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS costo_mensualidad (
        id SERIAL PRIMARY KEY,
        periodo_academico_id INTEGER NOT NULL REFERENCES periodo_academico(id),
        nivel_academico_id INTEGER NOT NULL REFERENCES nivel_academico(id),
        monto_base NUMERIC(10,2) NOT NULL CHECK (monto_base > 0),
        descuento_pago_completo NUMERIC(5,2) DEFAULT 10.00 
          CHECK (descuento_pago_completo >= 0 AND descuento_pago_completo <= 100),
        activo BOOLEAN DEFAULT true,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const constraintCheck = await client.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'costo_mensualidad' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name = 'costo_mensualidad_periodo_nivel_unique'
    `);

    if (constraintCheck.rows.length === 0) {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_costo_mensualidad_periodo_nivel_activo
        ON costo_mensualidad(periodo_academico_id, nivel_academico_id)
        WHERE activo = true
      `);
    }

    await client.query(`
      COMMENT ON TABLE costo_mensualidad IS 'Configuración de costos de mensualidad por nivel académico - Sistema de 10 meses'
    `);
    
    console.log('  ✅ Tabla costo_mensualidad creada');

    // =============================================
    // 2️⃣ TABLA: mensualidad
    // =============================================
    console.log('📅 Creando tabla MENSUALIDAD...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS mensualidad (
        id SERIAL PRIMARY KEY,
        matricula_id INTEGER NOT NULL REFERENCES matricula(id),
        numero_cuota INTEGER NOT NULL CHECK (numero_cuota BETWEEN 1 AND 10),
        mes_correspondiente VARCHAR(20) NOT NULL,
        fecha_vencimiento DATE NOT NULL,
        
        monto_original NUMERIC(10,2) NOT NULL CHECK (monto_original >= 0),
        monto_beca NUMERIC(10,2) DEFAULT 0 CHECK (monto_beca >= 0),
        monto_recargo NUMERIC(10,2) DEFAULT 0 CHECK (monto_recargo >= 0),
        monto_final NUMERIC(10,2) NOT NULL CHECK (monto_final >= 0),
        
        estado VARCHAR(20) DEFAULT 'pendiente' 
          CHECK (estado IN ('pendiente', 'pagado', 'pagado_parcial', 'vencido', 'cancelado', 'anulado')),
        
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(matricula_id, numero_cuota)
      )
    `);

    await client.query(`
      COMMENT ON TABLE mensualidad IS 'Cuotas mensuales (10 meses) generadas automáticamente al matricular'
    `);
    
    console.log('  ✅ Tabla mensualidad creada');

    // =============================================
    // 3️⃣ TABLA: pago_mensualidad
    // =============================================
    console.log('💳 Creando tabla PAGO_MENSUALIDAD...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS pago_mensualidad (
        id SERIAL PRIMARY KEY,
        codigo_pago VARCHAR(50) UNIQUE NOT NULL,
        mensualidad_id INTEGER NOT NULL REFERENCES mensualidad(id),
        
        monto_pagado NUMERIC(10,2) NOT NULL CHECK (monto_pagado > 0),
        metodo_pago VARCHAR(20) NOT NULL 
          CHECK (metodo_pago IN ('efectivo', 'transferencia', 'qr', 'tarjeta')),
        
        numero_comprobante VARCHAR(100),
        comprobante_url TEXT,
        
        entrego_factura BOOLEAN DEFAULT false,
        numero_factura VARCHAR(50),
        
        banco_origen VARCHAR(100),
        numero_referencia VARCHAR(100),
        
        fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
        observaciones TEXT,
        
        anulado BOOLEAN DEFAULT false,
        motivo_anulacion TEXT,
        anulado_por INTEGER REFERENCES usuarios(id),
        fecha_anulacion TIMESTAMP,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Campos para QR dinámico (futuro)
        qr_data TEXT,
        qr_image_url TEXT,
        qr_expiracion TIMESTAMP,
        qr_estado VARCHAR(20) CHECK (qr_estado IN ('generado', 'pagado', 'expirado', 'cancelado')),
        transaccion_id VARCHAR(100)
      )
    `);

    await client.query(`
      COMMENT ON TABLE pago_mensualidad IS 'Registro de todos los pagos de mensualidades'
    `);
    
    console.log('  ✅ Tabla pago_mensualidad creada');

    // =============================================
    // 4️⃣ TABLA: pago_anual_completo
    // =============================================
    console.log('📆 Creando tabla PAGO_ANUAL_COMPLETO...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS pago_anual_completo (
        id SERIAL PRIMARY KEY,
        codigo_pago VARCHAR(50) UNIQUE NOT NULL,
        matricula_id INTEGER NOT NULL REFERENCES matricula(id),
        
        monto_total_sin_descuento NUMERIC(10,2) NOT NULL,
        monto_descuento NUMERIC(10,2) NOT NULL,
        monto_beca_total NUMERIC(10,2) DEFAULT 0,
        monto_pagado NUMERIC(10,2) NOT NULL,
        
        metodo_pago VARCHAR(20) NOT NULL 
          CHECK (metodo_pago IN ('efectivo', 'transferencia', 'qr', 'tarjeta')),
        numero_comprobante VARCHAR(100),
        comprobante_url TEXT,
        
        entrego_factura BOOLEAN DEFAULT false,
        numero_factura VARCHAR(50),
        
        banco_origen VARCHAR(100),
        numero_referencia VARCHAR(100),
        
        fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
        observaciones TEXT,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      COMMENT ON TABLE pago_anual_completo IS 'Pagos completos de 10 meses con descuento de 1 mes (10%)'
    `);
    
    console.log('  ✅ Tabla pago_anual_completo creada');

    // =============================================
    // 5️⃣ ÍNDICES
    // =============================================
    console.log('\n🔍 Creando índices...');
    
    const indices = [
      { name: 'idx_mensualidad_matricula', sql: 'CREATE INDEX IF NOT EXISTS idx_mensualidad_matricula ON mensualidad(matricula_id)' },
      { name: 'idx_mensualidad_estado', sql: 'CREATE INDEX IF NOT EXISTS idx_mensualidad_estado ON mensualidad(estado) WHERE estado != \'anulado\'' },
      { name: 'idx_mensualidad_vencimiento', sql: 'CREATE INDEX IF NOT EXISTS idx_mensualidad_vencimiento ON mensualidad(fecha_vencimiento)' },
      { name: 'idx_pago_mensualidad_fecha', sql: 'CREATE INDEX IF NOT EXISTS idx_pago_mensualidad_fecha ON pago_mensualidad(fecha_pago)' },
      { name: 'idx_pago_mensualidad_metodo', sql: 'CREATE INDEX IF NOT EXISTS idx_pago_mensualidad_metodo ON pago_mensualidad(metodo_pago)' },
      { name: 'idx_pago_anual_matricula', sql: 'CREATE INDEX IF NOT EXISTS idx_pago_anual_matricula ON pago_anual_completo(matricula_id)' },
      { name: 'idx_costo_mensualidad_periodo', sql: 'CREATE INDEX IF NOT EXISTS idx_costo_mensualidad_periodo ON costo_mensualidad(periodo_academico_id)' },
      { name: 'idx_costo_mensualidad_nivel', sql: 'CREATE INDEX IF NOT EXISTS idx_costo_mensualidad_nivel ON costo_mensualidad(nivel_academico_id)' },
    ];

    for (const idx of indices) {
      await client.query(idx.sql);
      console.log(`  ✅ ${idx.name}`);
    }

    // =============================================
    // 6️⃣ TRIGGERS
    // =============================================
    console.log('\n⚡ Creando triggers...');

    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    const triggers = [
      'CREATE TRIGGER update_mensualidad_updated_at BEFORE UPDATE ON mensualidad FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      'CREATE TRIGGER update_pago_mensualidad_updated_at BEFORE UPDATE ON pago_mensualidad FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      'CREATE TRIGGER update_costo_mensualidad_updated_at BEFORE UPDATE ON costo_mensualidad FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()'
    ];

    for (const trigger of triggers) {
      await client.query(`DROP TRIGGER IF EXISTS ${trigger.split(' ')[2]} ON ${trigger.split(' ON ')[1].split(' FOR')[0]}`);
      await client.query(trigger);
    }
    
    console.log('  ✅ Triggers de updated_at creados');

    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_estado_mensualidad()
      RETURNS TRIGGER AS $$
      DECLARE
        v_monto_final NUMERIC(10,2);
        v_total_pagado NUMERIC(10,2);
      BEGIN
        IF NOT NEW.anulado THEN
          SELECT monto_final INTO v_monto_final
          FROM mensualidad
          WHERE id = NEW.mensualidad_id;
          
          SELECT COALESCE(SUM(monto_pagado), 0) INTO v_total_pagado
          FROM pago_mensualidad
          WHERE mensualidad_id = NEW.mensualidad_id
            AND NOT anulado;
          
          IF v_total_pagado >= v_monto_final THEN
            UPDATE mensualidad
            SET estado = 'pagado'
            WHERE id = NEW.mensualidad_id;
          ELSIF v_total_pagado > 0 THEN
            UPDATE mensualidad
            SET estado = 'pagado_parcial'
            WHERE id = NEW.mensualidad_id;
          END IF;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await client.query('DROP TRIGGER IF EXISTS trigger_actualizar_estado_mensualidad ON pago_mensualidad');
    await client.query(`
      CREATE TRIGGER trigger_actualizar_estado_mensualidad
        AFTER INSERT OR UPDATE ON pago_mensualidad
        FOR EACH ROW
        EXECUTE FUNCTION actualizar_estado_mensualidad()
    `);
    
    console.log('  ✅ Trigger actualizar_estado_mensualidad creado');

    // =============================================
    // 7️⃣ FUNCIONES STORED PROCEDURES
    // =============================================
    console.log('\n🔧 Creando funciones stored procedures...');

    // 🔧 MODIFICADO: generar_mensualidades para 10 meses
    await client.query(`
      CREATE OR REPLACE FUNCTION generar_mensualidades(
        p_matricula_id INTEGER,
        p_periodo_academico_id INTEGER,
        p_nivel_academico_id INTEGER,
        p_porcentaje_beca NUMERIC DEFAULT 0
      )
      RETURNS TABLE(mensualidad_id INTEGER, numero_cuota INTEGER, monto_final NUMERIC) AS $$
      DECLARE
        v_monto_base NUMERIC(10,2);
        v_monto_beca NUMERIC(10,2);
        v_monto_final NUMERIC(10,2);
        v_mes VARCHAR(20);
        v_fecha_vencimiento DATE;
        v_fecha_inicio DATE;
        v_mensualidad_id INTEGER;
        v_meses TEXT[] := ARRAY['febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 
                                'agosto', 'septiembre', 'octubre', 'noviembre'];
      BEGIN
        SELECT monto_base INTO v_monto_base
        FROM costo_mensualidad
        WHERE periodo_academico_id = p_periodo_academico_id
          AND nivel_academico_id = p_nivel_academico_id
          AND activo = true
        LIMIT 1;
        
        IF v_monto_base IS NULL THEN
          RAISE EXCEPTION 'No existe configuración de costo para este nivel y período';
        END IF;
        
        SELECT fecha_inicio INTO v_fecha_inicio
        FROM periodo_academico
        WHERE id = p_periodo_academico_id;
        
        -- 🔧 CAMBIO: Ahora son 10 iteraciones en lugar de 11
        FOR i IN 1..10 LOOP
          v_mes := v_meses[i];
          
          v_fecha_vencimiento := DATE_TRUNC('month', v_fecha_inicio) + 
                                (i || ' months')::INTERVAL + 
                                '9 days'::INTERVAL;
          
          v_monto_beca := ROUND(v_monto_base * (p_porcentaje_beca / 100), 2);
          v_monto_final := v_monto_base - v_monto_beca;
          
          INSERT INTO mensualidad (
            matricula_id, numero_cuota, mes_correspondiente, fecha_vencimiento,
            monto_original, monto_beca, monto_recargo, monto_final, estado
          ) VALUES (
            p_matricula_id, i, v_mes, v_fecha_vencimiento,
            v_monto_base, v_monto_beca, 0, v_monto_final, 'pendiente'
          ) RETURNING id INTO v_mensualidad_id;
          
          mensualidad_id := v_mensualidad_id;
          numero_cuota := i;
          monto_final := v_monto_final;
          RETURN NEXT;
        END LOOP;
        
        RETURN;
      END;
      $$ LANGUAGE plpgsql
    `);
    
    console.log('  ✅ Función generar_mensualidades creada (10 meses)');

    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_pago_anual_completo(
        p_matricula_id INTEGER,
        p_monto_pagado NUMERIC,
        p_metodo_pago VARCHAR,
        p_registrado_por INTEGER,
        p_numero_comprobante VARCHAR DEFAULT NULL,
        p_entrego_factura BOOLEAN DEFAULT false,
        p_numero_factura VARCHAR DEFAULT NULL,
        p_observaciones TEXT DEFAULT NULL
      )
      RETURNS INTEGER AS $$
      DECLARE
        v_codigo_pago VARCHAR(50);
        v_monto_total_sin_descuento NUMERIC(10,2);
        v_monto_total_con_beca NUMERIC(10,2);
        v_monto_beca_total NUMERIC(10,2);
        v_descuento_porcentaje NUMERIC(5,2);
        v_monto_descuento NUMERIC(10,2);
        v_monto_esperado NUMERIC(10,2);
        v_pago_id INTEGER;
        v_cantidad_pendientes INTEGER;
      BEGIN
        -- 🔧 VALIDACIÓN: Exactamente 10 mensualidades pendientes
        SELECT COUNT(*) INTO v_cantidad_pendientes
        FROM mensualidad
        WHERE matricula_id = p_matricula_id
          AND estado IN ('pendiente', 'vencido');
        
        IF v_cantidad_pendientes != 10 THEN
          RAISE EXCEPTION 'Se esperan 10 mensualidades pendientes, pero hay %', v_cantidad_pendientes;
        END IF;

        -- Obtener porcentaje de descuento (10%)
        SELECT cm.descuento_pago_completo INTO v_descuento_porcentaje
        FROM mensualidad m
        INNER JOIN matricula mat ON m.matricula_id = mat.id
        INNER JOIN costo_mensualidad cm ON 
          cm.periodo_academico_id = mat.periodo_academico_id AND
          cm.activo = true
        WHERE m.matricula_id = p_matricula_id
        LIMIT 1;

        IF v_descuento_porcentaje IS NULL THEN
          v_descuento_porcentaje := 10.00;
        END IF;

        -- Calcular totales
        SELECT 
          SUM(monto_original) as total_original,
          SUM(monto_final) as total_final,
          SUM(monto_beca) as total_beca
        INTO 
          v_monto_total_sin_descuento,
          v_monto_total_con_beca,
          v_monto_beca_total
        FROM mensualidad
        WHERE matricula_id = p_matricula_id
          AND estado IN ('pendiente', 'vencido');

        -- 🔧 CÁLCULO CORRECTO: Descuento 10% sobre total con beca
        v_monto_descuento := ROUND((v_monto_total_con_beca * v_descuento_porcentaje / 100), 2);
        v_monto_esperado := v_monto_total_con_beca - v_monto_descuento;

        -- Validar monto (permitir 1 Bs de diferencia)
        IF ABS(p_monto_pagado - v_monto_esperado) > 1.00 THEN
          RAISE EXCEPTION 'Monto incorrecto. Esperado: Bs % (Total: Bs %, Descuento %: Bs %, Becas: Bs %)', 
            v_monto_esperado, v_monto_total_con_beca, v_descuento_porcentaje, v_monto_descuento, v_monto_beca_total;
        END IF;

        -- Generar código
        v_codigo_pago := 'ANUAL-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                        LPAD(NEXTVAL('pago_anual_completo_id_seq')::TEXT, 5, '0');

        -- Registrar pago
        INSERT INTO pago_anual_completo (
          codigo_pago, matricula_id, monto_total_sin_descuento, monto_descuento,
          monto_beca_total, monto_pagado, metodo_pago, numero_comprobante, 
          entrego_factura, numero_factura, registrado_por, observaciones
        ) VALUES (
          v_codigo_pago, p_matricula_id, v_monto_total_sin_descuento, v_monto_descuento,
          v_monto_beca_total, p_monto_pagado, p_metodo_pago, p_numero_comprobante, 
          p_entrego_factura, p_numero_factura, p_registrado_por, 
          COALESCE(p_observaciones, 'Pago anual completo - 10 meses con ' || v_descuento_porcentaje || '% descuento')
        ) RETURNING id INTO v_pago_id;

        -- Marcar como pagadas
        UPDATE mensualidad
        SET estado = 'pagado', updated_at = CURRENT_TIMESTAMP
        WHERE matricula_id = p_matricula_id
          AND estado IN ('pendiente', 'vencido');

        RETURN v_pago_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función registrar_pago_anual_completo creada');

    // =============================================
    // 8️⃣ VISTAS
    // =============================================
    console.log('\n📊 Creando vistas para reportes...');

    await client.query(`
      CREATE OR REPLACE VIEW v_estado_pagos_estudiante AS
      SELECT 
        e.id as estudiante_id,
        e.codigo as estudiante_codigo,
        e.nombres,
        e.apellidos,
        mat.id as matricula_id,
        mat.numero_matricula,
        mat.es_becado,
        mat.porcentaje_beca,
        p.nombre as paralelo,
        g.nombre as grado,
        n.nombre as nivel,
        pa.nombre as periodo_academico,
        
        COUNT(m.id) as total_mensualidades,
        COUNT(CASE WHEN m.estado = 'pagado' THEN 1 END) as mensualidades_pagadas,
        COUNT(CASE WHEN m.estado = 'pendiente' THEN 1 END) as mensualidades_pendientes,
        COUNT(CASE WHEN m.estado = 'vencido' THEN 1 END) as mensualidades_vencidas,
        
        COALESCE(SUM(m.monto_final), 0) as monto_total,
        COALESCE(SUM(CASE WHEN m.estado = 'pagado' THEN m.monto_final ELSE 0 END), 0) as monto_pagado,
        COALESCE(SUM(CASE WHEN m.estado != 'pagado' THEN m.monto_final ELSE 0 END), 0) as monto_pendiente
        
      FROM estudiante e
      INNER JOIN matricula mat ON e.id = mat.estudiante_id
      INNER JOIN paralelo p ON mat.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      INNER JOIN nivel_academico n ON g.nivel_academico_id = n.id
      INNER JOIN periodo_academico pa ON mat.periodo_academico_id = pa.id
      LEFT JOIN mensualidad m ON mat.id = m.matricula_id
      WHERE mat.deleted_at IS NULL
        AND mat.estado = 'activo'
      GROUP BY e.id, mat.id, p.nombre, g.nombre, n.nombre, pa.nombre
    `);
    
    console.log('  ✅ Vista v_estado_pagos_estudiante creada');

    await client.query(`
      CREATE OR REPLACE VIEW v_ingresos_por_periodo AS
      SELECT 
        pa.id as periodo_id,
        pa.nombre as periodo,
        DATE_TRUNC('month', pm.fecha_pago) as mes,
        pm.metodo_pago,
        COUNT(pm.id) as cantidad_pagos,
        SUM(pm.monto_pagado) as total_ingreso
      FROM pago_mensualidad pm
      INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN periodo_academico pa ON mat.periodo_academico_id = pa.id
      WHERE NOT pm.anulado
      GROUP BY pa.id, pa.nombre, DATE_TRUNC('month', pm.fecha_pago), pm.metodo_pago
      ORDER BY mes DESC
    `);
    
    console.log('  ✅ Vista v_ingresos_por_periodo creada');

    await client.query(`
      CREATE OR REPLACE VIEW v_lista_morosos AS
      SELECT 
        e.id as estudiante_id,
        e.codigo,
        e.nombres,
        e.apellidos,
        g.nombre as grado,
        p.nombre as paralelo,
        m.numero_cuota,
        m.mes_correspondiente,
        m.fecha_vencimiento,
        m.monto_final,
        CURRENT_DATE - m.fecha_vencimiento as dias_mora
      FROM mensualidad m
      INNER JOIN matricula mat ON m.matricula_id = mat.id
      INNER JOIN estudiante e ON mat.estudiante_id = e.id
      INNER JOIN paralelo p ON mat.paralelo_id = p.id
      INNER JOIN grado g ON p.grado_id = g.id
      WHERE m.estado IN ('pendiente', 'vencido')
        AND m.fecha_vencimiento < CURRENT_DATE
        AND mat.estado = 'activo'
        AND mat.deleted_at IS NULL
      ORDER BY m.fecha_vencimiento ASC
    `);
    
    console.log('  ✅ Vista v_lista_morosos creada');

    await client.query('COMMIT');

    console.log('\n✅ ¡Sistema de pagos creado exitosamente!\n');
    console.log('📊 RESUMEN:');
    console.log('┌────────────────────────────────────────┐');
    console.log('│ ✅ 4 Tablas principales               │');
    console.log('│ ✅ 8 Índices de optimización          │');
    console.log('│ ✅ 4 Triggers automáticos             │');
    console.log('│ ✅ 2 Funciones stored procedures      │');
    console.log('│ ✅ 3 Vistas para reportes             │');
    console.log('│ 🔧 Sistema de 10 MESES               │');
    console.log('└────────────────────────────────────────┘\n');
    console.log('🎯 Siguiente paso: Crear permisos y modelos\n');

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

crearTablasPayments().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});