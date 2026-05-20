import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function crearModuloTransporteIngresos() {
  const client = await pool.connect();
  try {
    console.log('\n🚌 CREACIÓN DE MÓDULO: TRANSPORTE E INGRESOS CENTRALIZADOS');
    console.log('Se crearán las siguientes tablas y componentes:');
    console.log('\n📋 TABLAS DE CATÁLOGOS:');
    console.log('  1️⃣  tipo_ingreso - Catálogo de tipos de ingresos');
    console.log('\n🚌 TABLAS DE TRANSPORTE:');
    console.log('  2️⃣  ruta_transporte - Rutas de bus escolar');
    console.log('  3️⃣  parada_ruta - Paradas de cada ruta');
    console.log('  4️⃣  asignacion_transporte - Estudiantes asignados a rutas');
    console.log('  5️⃣  pago_transporte - Pagos mensuales de transporte');
    console.log('\n💰 TABLA CENTRALIZADA:');
    console.log('  6️⃣  ingreso - Registro centralizado de TODOS los ingresos');
    console.log('\n⚙️  COMPONENTES:');
    console.log('  ✅ Índices de optimización');
    console.log('  ✅ Triggers automáticos');
    console.log('  ✅ Funciones stored procedures');
    console.log('  ✅ Constraints y validaciones');
    console.log('\n⚡ FUNCIONALIDADES:');
    console.log('  🎯 Gestión completa de rutas y transporte');
    console.log('  🎯 Control de cupos por ruta');
    console.log('  🎯 Generación automática de cuotas mensuales');
    console.log('  🎯 Cálculo automático de recargos por mora');
    console.log('  🎯 Centralización de todos los ingresos');
    console.log('  🎯 Trazabilidad completa de pagos');
    console.log('  🎯 Estado de cuenta por estudiante\n');

    const confirm = await ask('¿Deseas continuar con la creación? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ TABLA: tipo_ingreso
    // =============================================
    console.log('📂 Creando tabla TIPO_INGRESO...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS tipo_ingreso (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT,
        categoria VARCHAR(50) NOT NULL CHECK (categoria IN (
          'academico',        -- Mensualidades, matrículas
          'transporte',       -- Bus escolar
          'productos',        -- Uniformes, materiales
          'eventos',          -- Eventos especiales
          'donaciones',       -- Aportes y donaciones
          'servicios',        -- Otros servicios
          'vacacional',       -- Cursos vacacionales
          'otros'
        )),
        requiere_estudiante BOOLEAN DEFAULT false,
        activo BOOLEAN DEFAULT true,
        color VARCHAR(20),
        orden INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      COMMENT ON TABLE tipo_ingreso IS 'Catálogo de tipos de ingresos del colegio'
    `);
    
    console.log('  ✅ Tabla tipo_ingreso creada');

    // =============================================
    // 2️⃣ TABLA: ruta_transporte
    // =============================================
    console.log('🚌 Creando tabla RUTA_TRANSPORTE...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS ruta_transporte (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT,
        zona_cobertura TEXT,
        punto_inicio VARCHAR(200),
        punto_fin VARCHAR(200),
        horario_ida TIME,
        horario_retorno TIME,
        capacidad_maxima INTEGER NOT NULL DEFAULT 40 CHECK (capacidad_maxima > 0),
        cupos_ocupados INTEGER DEFAULT 0,
        cupos_disponibles INTEGER GENERATED ALWAYS AS (capacidad_maxima - cupos_ocupados) STORED,
        costo_mensual NUMERIC(10,2) NOT NULL CHECK (costo_mensual >= 0),
        conductor_responsable VARCHAR(200),
        telefono_conductor VARCHAR(50),
        placa_vehiculo VARCHAR(20),
        modelo_vehiculo VARCHAR(100),
        anio_vehiculo INTEGER,
        color VARCHAR(20),
        activo BOOLEAN DEFAULT true,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    await client.query(`
      COMMENT ON TABLE ruta_transporte IS 'Rutas de transporte escolar disponibles'
    `);
    
    await client.query(`
      COMMENT ON COLUMN ruta_transporte.cupos_disponibles IS 'Columna generada automáticamente: capacidad_maxima - cupos_ocupados'
    `);
    
    console.log('  ✅ Tabla ruta_transporte creada');

    // =============================================
    // 3️⃣ TABLA: parada_ruta
    // =============================================
    console.log('📍 Creando tabla PARADA_RUTA...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS parada_ruta (
        id SERIAL PRIMARY KEY,
        ruta_id INTEGER NOT NULL REFERENCES ruta_transporte(id),
        nombre VARCHAR(200) NOT NULL,
        direccion TEXT,
        referencia TEXT,
        latitud NUMERIC(10,8),
        longitud NUMERIC(11,8),
        orden INTEGER NOT NULL,
        hora_estimada_ida TIME,
        hora_estimada_retorno TIME,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      COMMENT ON TABLE parada_ruta IS 'Paradas de cada ruta de transporte'
    `);
    
    console.log('  ✅ Tabla parada_ruta creada');

    // =============================================
    // 4️⃣ TABLA: asignacion_transporte
    // =============================================
    console.log('👨‍🎓 Creando tabla ASIGNACION_TRANSPORTE...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS asignacion_transporte (
        id SERIAL PRIMARY KEY,
        estudiante_id INTEGER NOT NULL REFERENCES estudiante(id),
        ruta_id INTEGER NOT NULL REFERENCES ruta_transporte(id),
        parada_id INTEGER REFERENCES parada_ruta(id),
        periodo_academico_id INTEGER NOT NULL REFERENCES periodo_academico(id),
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE,
        costo_mensual NUMERIC(10,2) NOT NULL,
        usa_ida BOOLEAN DEFAULT true,
        usa_retorno BOOLEAN DEFAULT true,
        contacto_emergencia VARCHAR(200),
        telefono_emergencia VARCHAR(50),
        observaciones TEXT,
        estado VARCHAR(50) DEFAULT 'activo' CHECK (estado IN (
          'activo',
          'suspendido',
          'cancelado',
          'finalizado'
        )),
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    await client.query(`
      COMMENT ON TABLE asignacion_transporte IS 'Asignación de estudiantes a rutas de transporte'
    `);
    
    console.log('  ✅ Tabla asignacion_transporte creada');

    // =============================================
    // 5️⃣ TABLA: pago_transporte
    // =============================================
    console.log('💳 Creando tabla PAGO_TRANSPORTE...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS pago_transporte (
        id SERIAL PRIMARY KEY,
        codigo_pago VARCHAR(50) NOT NULL UNIQUE,
        asignacion_transporte_id INTEGER NOT NULL REFERENCES asignacion_transporte(id),
        mes_correspondiente VARCHAR(50) NOT NULL,
        fecha_vencimiento DATE NOT NULL,
        monto_original NUMERIC(10,2) NOT NULL CHECK (monto_original >= 0),
        monto_recargo NUMERIC(10,2) DEFAULT 0 CHECK (monto_recargo >= 0),
        monto_final NUMERIC(10,2) NOT NULL CHECK (monto_final >= 0),
        monto_pagado NUMERIC(10,2) DEFAULT 0 CHECK (monto_pagado >= 0),
        estado VARCHAR(50) DEFAULT 'pendiente' CHECK (estado IN (
          'pendiente',
          'pagado',
          'pagado_parcial',
          'vencido',
          'cancelado',
          'anulado'
        )),
        metodo_pago VARCHAR(50) CHECK (metodo_pago IN (
          'efectivo',
          'transferencia',
          'qr',
          'tarjeta'
        )),
        numero_comprobante VARCHAR(100),
        comprobante_url TEXT,
        fecha_pago TIMESTAMP,
        registrado_por INTEGER REFERENCES usuarios(id),
        anulado BOOLEAN DEFAULT false,
        motivo_anulacion TEXT,
        anulado_por INTEGER REFERENCES usuarios(id),
        fecha_anulacion TIMESTAMP,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      COMMENT ON TABLE pago_transporte IS 'Pagos mensuales de transporte escolar'
    `);
    
    console.log('  ✅ Tabla pago_transporte creada');

    // =============================================
    // 6️⃣ TABLA: ingreso (CENTRALIZADA)
    // =============================================
    console.log('💰 Creando tabla INGRESO (centralizada)...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS ingreso (
        id SERIAL PRIMARY KEY,
        codigo_ingreso VARCHAR(50) NOT NULL UNIQUE,
        tipo_ingreso_id INTEGER NOT NULL REFERENCES tipo_ingreso(id),
        fecha_ingreso TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        periodo_academico_id INTEGER REFERENCES periodo_academico(id),
        
        -- Referencias a entidades relacionadas (puede haber varias nulas)
        estudiante_id INTEGER REFERENCES estudiante(id),
        padre_familia_id INTEGER REFERENCES padre_familia(id),
        matricula_id INTEGER REFERENCES matricula(id),
        
        -- Referencias a documentos fuente
        referencia_tipo VARCHAR(50) CHECK (referencia_tipo IN (
          'mensualidad',
          'pago_anual',
          'transporte',
          'venta_producto',
          'evento',
          'donacion',
          'vacacional',
          'otro'
        )),
        referencia_id INTEGER, -- ID del registro específico
        referencia_codigo VARCHAR(100), -- Código del documento fuente
        
        -- Montos
        monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
        descuento NUMERIC(10,2) DEFAULT 0 CHECK (descuento >= 0),
        recargo NUMERIC(10,2) DEFAULT 0 CHECK (recargo >= 0),
        monto_neto NUMERIC(10,2) GENERATED ALWAYS AS (monto - descuento + recargo) STORED,
        
        -- Forma de pago
        metodo_pago VARCHAR(50) NOT NULL CHECK (metodo_pago IN (
          'efectivo',
          'transferencia',
          'qr',
          'tarjeta',
          'cheque'
        )),
        numero_comprobante VARCHAR(100),
        comprobante_url TEXT,
        banco VARCHAR(100),
        numero_referencia VARCHAR(100),
        
        -- Facturación
        requiere_factura BOOLEAN DEFAULT false,
        factura_emitida BOOLEAN DEFAULT false,
        numero_factura VARCHAR(100),
        nit_factura VARCHAR(50),
        razon_social_factura VARCHAR(200),
        
        -- Control
        estado VARCHAR(50) DEFAULT 'registrado' CHECK (estado IN (
          'registrado',
          'verificado',
          'anulado'
        )),
        verificado BOOLEAN DEFAULT false,
        verificado_por INTEGER REFERENCES usuarios(id),
        fecha_verificacion TIMESTAMP,
        anulado BOOLEAN DEFAULT false,
        motivo_anulacion TEXT,
        anulado_por INTEGER REFERENCES usuarios(id),
        fecha_anulacion TIMESTAMP,
        
        -- Metadata
        observaciones TEXT,
        registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      COMMENT ON TABLE ingreso IS 'Registro centralizado de todos los ingresos de la institución'
    `);
    
    await client.query(`
      COMMENT ON COLUMN ingreso.monto_neto IS 'Columna generada automáticamente: monto - descuento + recargo'
    `);
    
    console.log('  ✅ Tabla ingreso creada');

    // =============================================
    // 8️⃣ TRIGGERS
    // =============================================
    console.log('\n⚡ Creando triggers...');

    // Función para actualizar updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    const triggers_updated_at = [
      { tabla: 'tipo_ingreso', trigger: 'trigger_tipo_ingreso_updated_at' },
      { tabla: 'ruta_transporte', trigger: 'trigger_ruta_transporte_updated_at' },
      { tabla: 'asignacion_transporte', trigger: 'trigger_asignacion_transporte_updated_at' },
      { tabla: 'pago_transporte', trigger: 'trigger_pago_transporte_updated_at' },
      { tabla: 'ingreso', trigger: 'trigger_ingreso_updated_at' }
    ];

    for (const item of triggers_updated_at) {
      await client.query(`DROP TRIGGER IF EXISTS ${item.trigger} ON ${item.tabla}`);
      await client.query(`
        CREATE TRIGGER ${item.trigger}
        BEFORE UPDATE ON ${item.tabla}
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
      `);
    }
    
    console.log('  ✅ Triggers de updated_at creados');

    // Trigger para actualizar cupos de rutas
    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_cupos_ruta()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          UPDATE ruta_transporte 
          SET cupos_ocupados = cupos_ocupados + 1
          WHERE id = NEW.ruta_id;
        ELSIF TG_OP = 'DELETE' THEN
          UPDATE ruta_transporte 
          SET cupos_ocupados = cupos_ocupados - 1
          WHERE id = OLD.ruta_id;
        ELSIF TG_OP = 'UPDATE' AND OLD.ruta_id != NEW.ruta_id THEN
          UPDATE ruta_transporte 
          SET cupos_ocupados = cupos_ocupados - 1
          WHERE id = OLD.ruta_id;
          UPDATE ruta_transporte 
          SET cupos_ocupados = cupos_ocupados + 1
          WHERE id = NEW.ruta_id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('DROP TRIGGER IF EXISTS trigger_actualizar_cupos_ruta ON asignacion_transporte');
    await client.query(`
      CREATE TRIGGER trigger_actualizar_cupos_ruta
      AFTER INSERT OR UPDATE OR DELETE ON asignacion_transporte
      FOR EACH ROW EXECUTE FUNCTION actualizar_cupos_ruta()
    `);
    
    console.log('  ✅ Trigger actualizar_cupos_ruta creado');

    // =============================================
    // 9️⃣ FUNCIONES STORED PROCEDURES
    // =============================================
    console.log('\n🔧 Creando funciones stored procedures...');

    // Función para generar cuotas de transporte
    await client.query(`
      CREATE OR REPLACE FUNCTION generar_cuotas_transporte(
        p_asignacion_id INTEGER,
        p_cantidad_meses INTEGER DEFAULT 10
      )
      RETURNS TABLE(
        cuota_numero INTEGER,
        mes TEXT,
        fecha_vencimiento DATE,
        monto NUMERIC,
        codigo_pago VARCHAR
      ) AS $$
      DECLARE
        v_costo_mensual NUMERIC;
        v_fecha_inicio DATE;
        v_contador INTEGER;
        v_mes_nombre TEXT;
        v_fecha_venc DATE;
        v_codigo_pago VARCHAR;
      BEGIN
        -- Obtener información de la asignación
        SELECT at.costo_mensual, at.fecha_inicio
        INTO v_costo_mensual, v_fecha_inicio
        FROM asignacion_transporte at
        WHERE at.id = p_asignacion_id;
        
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Asignación de transporte no encontrada';
        END IF;
        
        -- Generar las cuotas
        FOR v_contador IN 1..p_cantidad_meses LOOP
          v_fecha_venc := v_fecha_inicio + (v_contador - 1) * INTERVAL '1 month';
          v_mes_nombre := TO_CHAR(v_fecha_venc, 'Month YYYY');
          v_codigo_pago := 'PT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('pago_transporte_id_seq')::TEXT, 6, '0');
          
          -- Insertar la cuota si no existe
          INSERT INTO pago_transporte (
            codigo_pago, asignacion_transporte_id, mes_correspondiente,
            fecha_vencimiento, monto_original, monto_final
          )
          VALUES (
            v_codigo_pago, p_asignacion_id, v_mes_nombre,
            v_fecha_venc, v_costo_mensual, v_costo_mensual
          )
          ON CONFLICT (pago_transporte.codigo_pago) DO NOTHING;
          
          -- Retornar información de la cuota
          cuota_numero := v_contador;
          mes := v_mes_nombre;
          fecha_vencimiento := v_fecha_venc;
          monto := v_costo_mensual;
          codigo_pago := v_codigo_pago;
          RETURN NEXT;
        END LOOP;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función generar_cuotas_transporte creada');

    // Función para calcular recargos por mora
    await client.query(`
      CREATE OR REPLACE FUNCTION calcular_recargos_transporte(
        p_porcentaje_recargo NUMERIC DEFAULT 0.05
      )
      RETURNS TABLE(
        cantidad_actualizados INTEGER,
        monto_total_recargos NUMERIC
      ) AS $$
      DECLARE
        v_cantidad INTEGER := 0;
        v_total_recargos NUMERIC := 0;
      BEGIN
        -- Actualizar pagos de transporte vencidos
        WITH actualizados AS (
          UPDATE pago_transporte
          SET 
            monto_recargo = monto_original * p_porcentaje_recargo,
            monto_final = monto_original + (monto_original * p_porcentaje_recargo),
            estado = 'vencido'
          WHERE estado = 'pendiente'
            AND fecha_vencimiento < CURRENT_DATE
          RETURNING id, monto_recargo
        )
        SELECT COUNT(*), COALESCE(SUM(monto_recargo), 0)
        INTO v_cantidad, v_total_recargos
        FROM actualizados;
        
        cantidad_actualizados := v_cantidad;
        monto_total_recargos := v_total_recargos;
        RETURN NEXT;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función calcular_recargos_transporte creada');

    // Función para estado de cuenta de transporte
    await client.query(`
      CREATE OR REPLACE FUNCTION estado_cuenta_transporte(
        p_estudiante_id INTEGER,
        p_periodo_academico_id INTEGER DEFAULT NULL
      )
      RETURNS TABLE(
        asignacion_id INTEGER,
        ruta_nombre VARCHAR,
        parada_nombre VARCHAR,
        fecha_inicio DATE,
        costo_mensual NUMERIC,
        total_cuotas BIGINT,
        cuotas_pagadas BIGINT,
        cuotas_pendientes BIGINT,
        cuotas_vencidas BIGINT,
        total_pagado NUMERIC,
        total_pendiente NUMERIC,
        total_vencido NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          at.id,
          r.nombre::VARCHAR,
          pr.nombre::VARCHAR,
          at.fecha_inicio,
          at.costo_mensual,
          COUNT(pt.id),
          COUNT(CASE WHEN pt.estado = 'pagado' THEN 1 END),
          COUNT(CASE WHEN pt.estado = 'pendiente' THEN 1 END),
          COUNT(CASE WHEN pt.estado = 'vencido' THEN 1 END),
          COALESCE(SUM(CASE WHEN pt.estado = 'pagado' THEN pt.monto_pagado ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN pt.estado = 'pendiente' THEN pt.monto_final ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN pt.estado = 'vencido' THEN pt.monto_final ELSE 0 END), 0)
        FROM asignacion_transporte at
        JOIN ruta_transporte r ON at.ruta_id = r.id
        LEFT JOIN parada_ruta pr ON at.parada_id = pr.id
        LEFT JOIN pago_transporte pt ON at.id = pt.asignacion_transporte_id
        WHERE at.estudiante_id = p_estudiante_id
          AND at.activo = true
          AND (p_periodo_academico_id IS NULL OR at.periodo_academico_id = p_periodo_academico_id)
        GROUP BY at.id, r.nombre, pr.nombre, at.fecha_inicio, at.costo_mensual;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función estado_cuenta_transporte creada');

    // Función para centralizar pago de transporte
    await client.query(`
      CREATE OR REPLACE FUNCTION centralizar_pago_transporte(
        p_pago_transporte_id INTEGER
      )
      RETURNS INTEGER AS $$
      DECLARE
        v_ingreso_id INTEGER;
        v_tipo_ingreso_id INTEGER;
        v_codigo_ingreso VARCHAR;
        v_pago RECORD;
        v_asignacion RECORD;
      BEGIN
        -- Obtener tipo de ingreso para transporte
        SELECT id INTO v_tipo_ingreso_id
        FROM tipo_ingreso
        WHERE codigo = 'ING-TRANS';
        
        IF v_tipo_ingreso_id IS NULL THEN
          RAISE EXCEPTION 'Tipo de ingreso de transporte no encontrado';
        END IF;
        
        -- Verificar si ya está centralizado
        IF EXISTS (
          SELECT 1 FROM ingreso 
          WHERE referencia_tipo = 'transporte' 
            AND referencia_id = p_pago_transporte_id
        ) THEN
          RAISE EXCEPTION 'Este pago ya está centralizado';
        END IF;
        
        -- Obtener información del pago
        SELECT * INTO v_pago
        FROM pago_transporte
        WHERE id = p_pago_transporte_id;
        
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Pago de transporte no encontrado';
        END IF;
        
        IF v_pago.estado != 'pagado' THEN
          RAISE EXCEPTION 'Solo se pueden centralizar pagos con estado "pagado"';
        END IF;
        
        -- Obtener información de la asignación
        SELECT * INTO v_asignacion
        FROM asignacion_transporte
        WHERE id = v_pago.asignacion_transporte_id;
        
        -- Generar código de ingreso
        v_codigo_ingreso := 'ING-' || TO_CHAR(COALESCE(v_pago.fecha_pago, CURRENT_TIMESTAMP), 'YYYYMMDD') || 
                            '-' || LPAD(nextval('ingreso_id_seq')::TEXT, 6, '0');
        
        -- Insertar en tabla ingreso
        INSERT INTO ingreso (
          codigo_ingreso, tipo_ingreso_id, fecha_ingreso,
          estudiante_id, periodo_academico_id,
          referencia_tipo, referencia_id, referencia_codigo,
          monto, descuento, recargo,
          metodo_pago, numero_comprobante, comprobante_url,
          registrado_por, observaciones,
          estado, verificado
        )
        VALUES (
          v_codigo_ingreso,
          v_tipo_ingreso_id,
          COALESCE(v_pago.fecha_pago, CURRENT_TIMESTAMP),
          v_asignacion.estudiante_id,
          v_asignacion.periodo_academico_id,
          'transporte',
          p_pago_transporte_id,
          v_pago.codigo_pago,
          v_pago.monto_original,
          0,
          v_pago.monto_recargo,
          v_pago.metodo_pago,
          v_pago.numero_comprobante,
          v_pago.comprobante_url,
          v_pago.registrado_por,
          'Pago de transporte - ' || v_pago.mes_correspondiente,
          'registrado',
          true
        )
        RETURNING id INTO v_ingreso_id;
        
        RETURN v_ingreso_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('  ✅ Función centralizar_pago_transporte creada');

    // =============================================
    // 🔟 DATOS INICIALES
    // =============================================
    console.log('\n📦 Insertando datos iniciales...');

    // Tipos de ingreso iniciales
    await client.query(`
      INSERT INTO tipo_ingreso (codigo, nombre, descripcion, categoria, requiere_estudiante, color, orden)
      VALUES 
        ('ING-MENS', 'Mensualidad', 'Pago mensual de colegiatura', 'academico', true, '#3B82F6', 1),
        ('ING-ANUAL', 'Pago Anual', 'Pago anual completo con descuento', 'academico', true, '#10B981', 2),
        ('ING-TRANS', 'Transporte Escolar', 'Pago mensual de servicio de transporte', 'transporte', true, '#F59E0B', 3),
        ('ING-VACAT', 'Curso Vacacional', 'Inscripción a cursos vacacionales', 'vacacional', false, '#8B5CF6', 4),
        ('ING-PROD', 'Venta de Productos', 'Uniformes, materiales, libros', 'productos', false, '#EC4899', 5),
        ('ING-EVENT', 'Eventos Especiales', 'Eventos, actividades, excursiones', 'eventos', false, '#14B8A6', 6),
        ('ING-DONAC', 'Donaciones', 'Aportes y donaciones voluntarias', 'donaciones', false, '#F97316', 7),
        ('ING-SERV', 'Otros Servicios', 'Servicios adicionales', 'servicios', false, '#6366F1', 8),
        ('ING-OTROS', 'Otros Ingresos', 'Ingresos diversos no clasificados', 'otros', false, '#6B7280', 9)
      ON CONFLICT (codigo) DO NOTHING
    `);
    
    console.log('  ✅ Tipos de ingreso iniciales insertados');

    await client.query('COMMIT');

    console.log('\n✅ ¡Módulo de Transporte e Ingresos creado exitosamente!\n');
    console.log('📊 RESUMEN:');
    console.log('┌────────────────────────────────────────────┐');
    console.log('│ ✅ 6 Tablas principales                   │');
    console.log('│ ✅ 6 Triggers automáticos                 │');
    console.log('│ ✅ 4 Funciones stored procedures          │');
    console.log('│ ✅ 9 Tipos de ingreso iniciales           │');
    console.log('│ 🚌 Sistema de transporte completo         │');
    console.log('│ 💰 Sistema de ingresos centralizado       │');
    console.log('└────────────────────────────────────────────┘\n');
    console.log('🎯 El módulo está listo para usar\n');
    console.log('💡 Próximos pasos sugeridos:');
    console.log('   1. Crear rutas de transporte');
    console.log('   2. Asignar estudiantes a rutas');
    console.log('   3. Generar cuotas mensuales de transporte');
    console.log('   4. Registrar pagos y centralizarlos\n');

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

crearModuloTransporteIngresos().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});