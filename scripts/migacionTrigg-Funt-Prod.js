// scripts/migrate_functions_triggers.js
// Reconstrucción COMPLETA de funciones, triggers, vistas e índices
// Fuente: todos los scripts de módulos del proyecto
// Uso: node scripts/migrate_functions_triggers.js

import { pool } from '../src/db/pool.js';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('\n==============================');
    console.log('🚀 MIGRACIÓN: FUNCIONES, TRIGGERS, VISTAS E ÍNDICES');
    console.log('==============================\n');

    await client.query('BEGIN');

    // ════════════════════════════════════════════════════
    // 1. FUNCIONES BASE updated_at
    // ════════════════════════════════════════════════════
    console.log('📋 [1] Funciones base updated_at...');

    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER AS $$
      BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$;
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$;
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION mae_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$;
    `);
    console.log('   ✅ update_updated_at_column, actualizar_updated_at, mae_updated_at');

    // ════════════════════════════════════════════════════
    // 2. TRIGGERS updated_at POR TABLA
    // ════════════════════════════════════════════════════
    console.log('\n📋 [2] Triggers updated_at por tabla...');

    const updatedAtTriggers = [
      { tabla: 'costo_mensualidad',            trigger: 'update_costo_mensualidad_updated_at',       fn: 'update_updated_at_column' },
      { tabla: 'mensualidad',                  trigger: 'update_mensualidad_updated_at',              fn: 'update_updated_at_column' },
      { tabla: 'pago_mensualidad',             trigger: 'update_pago_mensualidad_updated_at',         fn: 'update_updated_at_column' },
      { tabla: 'tipo_ingreso',                 trigger: 'trigger_tipo_ingreso_updated_at',            fn: 'actualizar_updated_at' },
      { tabla: 'ruta_transporte',              trigger: 'trigger_ruta_transporte_updated_at',         fn: 'actualizar_updated_at' },
      { tabla: 'asignacion_transporte',        trigger: 'trigger_asignacion_transporte_updated_at',   fn: 'actualizar_updated_at' },
      { tabla: 'pago_transporte',              trigger: 'trigger_pago_transporte_updated_at',         fn: 'actualizar_updated_at' },
      { tabla: 'ingreso',                      trigger: 'trigger_ingreso_updated_at',                 fn: 'actualizar_updated_at' },
      { tabla: 'backup_registro',              trigger: 'trg_backup_updated_at',                     fn: 'actualizar_updated_at' },
      { tabla: 'bloque_horario',               trigger: 'trg_bloque_horario_updated_at',             fn: 'actualizar_updated_at' },
      { tabla: 'horario',                      trigger: 'trg_horario_updated_at',                    fn: 'actualizar_updated_at' },
      { tabla: 'horario_detalle',              trigger: 'trg_horario_detalle_updated_at',            fn: 'actualizar_updated_at' },
      { tabla: 'unidad_tematica',              trigger: 'trg_unidad_tematica_updated_at',            fn: 'actualizar_updated_at' },
      { tabla: 'tema',                         trigger: 'trg_tema_updated_at',                       fn: 'actualizar_updated_at' },
      { tabla: 'material_academico',           trigger: 'trg_material_academico_updated_at',         fn: 'actualizar_updated_at' },
      { tabla: 'comentario_material',          trigger: 'trg_comentario_material_updated_at',        fn: 'actualizar_updated_at' },
      { tabla: 'progreso_estudiante',          trigger: 'trg_progreso_estudiante_updated_at',        fn: 'actualizar_updated_at' },
      { tabla: 'material_asignado_estudiante', trigger: 'trg_mae_updated_at',                        fn: 'mae_updated_at' },
      { tabla: 'solicitud_permiso',            trigger: 'trg_solicitud_permiso_updated_at',          fn: 'actualizar_updated_at' },
      { tabla: 'asistencia',                   trigger: 'trg_asistencia_updated_at',                 fn: 'actualizar_updated_at' },
      { tabla: 'periodo_evaluacion',           trigger: 'trg_periodo_evaluacion_updated_at',         fn: 'actualizar_updated_at' },
      { tabla: 'evaluacion',                   trigger: 'trg_evaluacion_updated_at',                 fn: 'actualizar_updated_at' },
      { tabla: 'calificacion',                 trigger: 'trg_calificacion_updated_at',               fn: 'actualizar_updated_at' },
      { tabla: 'nota_dimension',               trigger: 'trg_nota_dimension_updated_at',             fn: 'actualizar_updated_at' },
      { tabla: 'calificacion_periodo',         trigger: 'trg_calificacion_periodo_updated_at',       fn: 'actualizar_updated_at' },
      { tabla: 'notificacion_institucional',   trigger: 'trg_notificacion_institucional_updated_at', fn: 'actualizar_updated_at' },
      { tabla: 'notificacion_destinatario',    trigger: 'trg_notificacion_destinatario_updated_at',  fn: 'actualizar_updated_at' },
      { tabla: 'observacion_pedagogica',       trigger: 'trg_obs_ped_updated_at',                    fn: 'actualizar_updated_at' },
    ];

    for (const t of updatedAtTriggers) {
      await client.query(`DROP TRIGGER IF EXISTS ${t.trigger} ON ${t.tabla};`);
      await client.query(`
        CREATE TRIGGER ${t.trigger}
        BEFORE UPDATE ON ${t.tabla}
        FOR EACH ROW EXECUTE FUNCTION ${t.fn}();
      `);
    }
    console.log(`   ✅ ${updatedAtTriggers.length} triggers updated_at`);

    // ════════════════════════════════════════════════════
    // 3. MÓDULO MENSUALIDADES
    // ════════════════════════════════════════════════════
    console.log('\n📋 [3] Módulo Mensualidades...');

    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_estado_mensualidad()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER AS $$
      DECLARE
        v_mensualidad_id integer;
        v_monto_final    numeric;
        v_total_pagado   numeric;
        v_nuevo_estado   character varying(20);
      BEGIN
        v_mensualidad_id := NEW.mensualidad_id;
        SELECT monto_final INTO v_monto_final FROM mensualidad WHERE id = v_mensualidad_id;
        SELECT COALESCE(SUM(monto_pagado),0) INTO v_total_pagado
          FROM pago_mensualidad WHERE mensualidad_id = v_mensualidad_id AND anulado = false;
        IF v_total_pagado <= 0 THEN v_nuevo_estado := 'pendiente';
        ELSIF v_total_pagado < v_monto_final THEN v_nuevo_estado := 'parcial';
        ELSE v_nuevo_estado := 'pagado';
        END IF;
        UPDATE mensualidad SET estado = v_nuevo_estado, updated_at = CURRENT_TIMESTAMP WHERE id = v_mensualidad_id;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_actualizar_estado_mensualidad ON pago_mensualidad;
      CREATE TRIGGER trigger_actualizar_estado_mensualidad
        AFTER INSERT OR UPDATE ON pago_mensualidad
        FOR EACH ROW EXECUTE FUNCTION actualizar_estado_mensualidad();
    `);
    console.log('   ✅ trigger_actualizar_estado_mensualidad');

    await client.query(`
      CREATE OR REPLACE FUNCTION generar_mensualidades(
        p_matricula_id         integer,
        p_periodo_academico_id integer,
        p_nivel_academico_id   integer,
        p_porcentaje_beca      numeric DEFAULT 0
      )
      RETURNS TABLE(mensualidad_id integer, numero_cuota integer, monto_final numeric)
      LANGUAGE plpgsql SECURITY INVOKER AS $$
      DECLARE
        v_costo_mensual  numeric; v_total_cuotas integer;
        v_monto_beca     numeric; v_monto_neto   numeric;
        v_cuota          integer; v_fecha_venc   date;
        v_nuevo_id       integer; v_periodo_inicio date;
      BEGIN
        SELECT cm.monto, cm.total_cuotas, pa.fecha_inicio
          INTO v_costo_mensual, v_total_cuotas, v_periodo_inicio
          FROM costo_mensualidad cm JOIN periodo_academico pa ON pa.id = cm.periodo_academico_id
         WHERE cm.nivel_academico_id = p_nivel_academico_id
           AND cm.periodo_academico_id = p_periodo_academico_id AND cm.activo = true LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'No se encontró costo de mensualidad para nivel_academico_id=% y periodo_academico_id=%',
            p_nivel_academico_id, p_periodo_academico_id;
        END IF;
        v_monto_beca := ROUND(v_costo_mensual * (p_porcentaje_beca / 100.0), 2);
        v_monto_neto := v_costo_mensual - v_monto_beca;
        FOR v_cuota IN 1..v_total_cuotas LOOP
          v_fecha_venc := (date_trunc('month', v_periodo_inicio) + ((v_cuota-1) * interval '1 month') + interval '9 days')::date;
          INSERT INTO mensualidad (matricula_id, periodo_academico_id, numero_cuota, monto_original,
            descuento_beca, porcentaje_beca, monto_final, fecha_vencimiento, estado, created_at, updated_at)
          VALUES (p_matricula_id, p_periodo_academico_id, v_cuota, v_costo_mensual,
            v_monto_beca, p_porcentaje_beca, v_monto_neto, v_fecha_venc, 'pendiente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id INTO v_nuevo_id;
          mensualidad_id := v_nuevo_id; numero_cuota := v_cuota; monto_final := v_monto_neto;
          RETURN NEXT;
        END LOOP;
      END; $$;
    `);
    console.log('   ✅ generar_mensualidades');

    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_pago_anual_completo(
        p_matricula_id       integer,
        p_monto_pagado       numeric,
        p_metodo_pago        character varying,
        p_registrado_por     integer,
        p_numero_comprobante character varying DEFAULT NULL,
        p_entrego_factura    boolean           DEFAULT false,
        p_numero_factura     character varying DEFAULT NULL,
        p_observaciones      text              DEFAULT NULL
      )
      RETURNS integer LANGUAGE plpgsql SECURITY INVOKER AS $$
      DECLARE
        v_mensualidad     RECORD; v_ingreso_id      integer;
        v_codigo_ingreso  character varying(50); v_codigo_pago character varying(50);
        v_tipo_ingreso_id integer; v_total_cuotas    integer;
        v_periodo_id      integer; v_estudiante_id   integer;
        v_padre_id        integer; v_monto_por_cuota numeric;
      BEGIN
        SELECT m.periodo_academico_id, m.estudiante_id INTO v_periodo_id, v_estudiante_id
          FROM matricula m WHERE m.id = p_matricula_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula no encontrada: %', p_matricula_id; END IF;

        SELECT pf.id INTO v_padre_id FROM padre_familia pf
          JOIN estudiante_tutor et ON et.padre_familia_id = pf.id
         WHERE et.estudiante_id = v_estudiante_id AND et.es_principal = true LIMIT 1;

        SELECT id INTO v_tipo_ingreso_id FROM tipo_ingreso WHERE codigo = 'ING-ANUAL' AND activo = true LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró tipo_ingreso con codigo=ING-ANUAL'; END IF;

        SELECT COUNT(*) INTO v_total_cuotas FROM mensualidad
         WHERE matricula_id = p_matricula_id AND estado IN ('pendiente','parcial') AND anulado = false;
        IF v_total_cuotas = 0 THEN
          RAISE EXCEPTION 'No hay mensualidades pendientes para la matrícula %', p_matricula_id;
        END IF;

        v_monto_por_cuota := ROUND(p_monto_pagado / v_total_cuotas, 2);
        v_codigo_ingreso  := 'ING-' || to_char(CURRENT_TIMESTAMP,'YYYYMMDD-HH24MISS') || '-' || p_matricula_id;

        INSERT INTO ingreso (codigo_ingreso, tipo_ingreso_id, periodo_academico_id,
          estudiante_id, padre_familia_id, matricula_id, monto, monto_neto,
          metodo_pago, numero_comprobante, factura_emitida, numero_factura,
          estado, verificado, observaciones, registrado_por, created_at, updated_at)
        VALUES (v_codigo_ingreso, v_tipo_ingreso_id, v_periodo_id,
          v_estudiante_id, v_padre_id, p_matricula_id, p_monto_pagado, p_monto_pagado,
          p_metodo_pago, p_numero_comprobante, p_entrego_factura, p_numero_factura,
          'registrado', true, p_observaciones, p_registrado_por, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id INTO v_ingreso_id;

        FOR v_mensualidad IN
          SELECT id, monto_final FROM mensualidad
           WHERE matricula_id = p_matricula_id AND estado IN ('pendiente','parcial') AND anulado = false
           ORDER BY numero_cuota
        LOOP
          v_codigo_pago := 'PAG-' || to_char(CURRENT_TIMESTAMP,'YYYYMMDD-HH24MISS') || '-' || v_mensualidad.id;
          INSERT INTO pago_mensualidad (codigo_pago, mensualidad_id, ingreso_id, monto_pagado,
            metodo_pago, numero_comprobante, fecha_pago, registrado_por, anulado, created_at, updated_at)
          VALUES (v_codigo_pago, v_mensualidad.id, v_ingreso_id, v_monto_por_cuota,
            p_metodo_pago, p_numero_comprobante, CURRENT_TIMESTAMP, p_registrado_por, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        END LOOP;
        RETURN v_ingreso_id;
      END; $$;
    `);
    console.log('   ✅ registrar_pago_anual_completo');

    // ════════════════════════════════════════════════════
    // 4. MÓDULO TRANSPORTE
    // ════════════════════════════════════════════════════
    console.log('\n📋 [4] Módulo Transporte...');

    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_cupos_ruta()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          UPDATE ruta_transporte SET cupos_ocupados = cupos_ocupados + 1 WHERE id = NEW.ruta_id;
        ELSIF TG_OP = 'DELETE' THEN
          UPDATE ruta_transporte SET cupos_ocupados = cupos_ocupados - 1 WHERE id = OLD.ruta_id;
        ELSIF TG_OP = 'UPDATE' AND OLD.ruta_id != NEW.ruta_id THEN
          UPDATE ruta_transporte SET cupos_ocupados = cupos_ocupados - 1 WHERE id = OLD.ruta_id;
          UPDATE ruta_transporte SET cupos_ocupados = cupos_ocupados + 1 WHERE id = NEW.ruta_id;
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_actualizar_cupos_ruta ON asignacion_transporte;
      CREATE TRIGGER trigger_actualizar_cupos_ruta
        AFTER INSERT OR UPDATE OR DELETE ON asignacion_transporte
        FOR EACH ROW EXECUTE FUNCTION actualizar_cupos_ruta();
    `);
    console.log('   ✅ trigger_actualizar_cupos_ruta');

    await client.query(`
      CREATE OR REPLACE FUNCTION generar_cuotas_transporte(
        p_asignacion_id  integer,
        p_cantidad_meses integer DEFAULT 10
      )
      RETURNS TABLE(cuota_numero integer, mes text, fecha_vencimiento date, monto numeric, codigo_pago varchar)
      LANGUAGE plpgsql AS $$
      DECLARE
        v_costo_mensual numeric; v_fecha_inicio date;
        v_contador integer; v_mes_nombre text;
        v_fecha_venc date; v_codigo_pago varchar;
      BEGIN
        SELECT at.costo_mensual, at.fecha_inicio INTO v_costo_mensual, v_fecha_inicio
          FROM asignacion_transporte at WHERE at.id = p_asignacion_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Asignación de transporte no encontrada'; END IF;
        FOR v_contador IN 1..p_cantidad_meses LOOP
          v_fecha_venc  := v_fecha_inicio + (v_contador-1) * INTERVAL '1 month';
          v_mes_nombre  := TO_CHAR(v_fecha_venc,'Month YYYY');
          v_codigo_pago := 'PT-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(nextval('pago_transporte_id_seq')::text,6,'0');
          INSERT INTO pago_transporte (codigo_pago, asignacion_transporte_id, mes_correspondiente,
            fecha_vencimiento, monto_original, monto_final)
          VALUES (v_codigo_pago, p_asignacion_id, v_mes_nombre, v_fecha_venc, v_costo_mensual, v_costo_mensual)
          ON CONFLICT DO NOTHING;
          cuota_numero := v_contador; mes := v_mes_nombre;
          fecha_vencimiento := v_fecha_venc; monto := v_costo_mensual; codigo_pago := v_codigo_pago;
          RETURN NEXT;
        END LOOP;
      END; $$;
    `);
    console.log('   ✅ generar_cuotas_transporte');

    await client.query(`
      CREATE OR REPLACE FUNCTION calcular_recargos_transporte(p_porcentaje_recargo numeric DEFAULT 0.05)
      RETURNS TABLE(cantidad_actualizados integer, monto_total_recargos numeric)
      LANGUAGE plpgsql AS $$
      DECLARE v_cantidad integer := 0; v_total_recargos numeric := 0;
      BEGIN
        WITH actualizados AS (
          UPDATE pago_transporte
             SET monto_recargo = monto_original * p_porcentaje_recargo,
                 monto_final   = monto_original + (monto_original * p_porcentaje_recargo),
                 estado        = 'vencido'
           WHERE estado = 'pendiente' AND fecha_vencimiento < CURRENT_DATE
           RETURNING id, monto_recargo
        )
        SELECT COUNT(*), COALESCE(SUM(monto_recargo),0) INTO v_cantidad, v_total_recargos FROM actualizados;
        cantidad_actualizados := v_cantidad; monto_total_recargos := v_total_recargos; RETURN NEXT;
      END; $$;
    `);
    console.log('   ✅ calcular_recargos_transporte');

    await client.query(`
      CREATE OR REPLACE FUNCTION estado_cuenta_transporte(
        p_estudiante_id integer, p_periodo_academico_id integer DEFAULT NULL
      )
      RETURNS TABLE(
        asignacion_id integer, ruta_nombre varchar, parada_nombre varchar,
        fecha_inicio date, costo_mensual numeric,
        total_cuotas bigint, cuotas_pagadas bigint, cuotas_pendientes bigint, cuotas_vencidas bigint,
        total_pagado numeric, total_pendiente numeric, total_vencido numeric
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT at.id, r.nombre::varchar, pr.nombre::varchar, at.fecha_inicio, at.costo_mensual,
          COUNT(pt.id),
          COUNT(CASE WHEN pt.estado = 'pagado'    THEN 1 END),
          COUNT(CASE WHEN pt.estado = 'pendiente' THEN 1 END),
          COUNT(CASE WHEN pt.estado = 'vencido'   THEN 1 END),
          COALESCE(SUM(CASE WHEN pt.estado = 'pagado'    THEN pt.monto_pagado ELSE 0 END),0),
          COALESCE(SUM(CASE WHEN pt.estado = 'pendiente' THEN pt.monto_final  ELSE 0 END),0),
          COALESCE(SUM(CASE WHEN pt.estado = 'vencido'   THEN pt.monto_final  ELSE 0 END),0)
        FROM asignacion_transporte at
        JOIN ruta_transporte r    ON at.ruta_id   = r.id
        LEFT JOIN parada_ruta pr  ON at.parada_id = pr.id
        LEFT JOIN pago_transporte pt ON at.id = pt.asignacion_transporte_id
        WHERE at.estudiante_id = p_estudiante_id AND at.activo = true
          AND (p_periodo_academico_id IS NULL OR at.periodo_academico_id = p_periodo_academico_id)
        GROUP BY at.id, r.nombre, pr.nombre, at.fecha_inicio, at.costo_mensual;
      END; $$;
    `);
    console.log('   ✅ estado_cuenta_transporte');

    await client.query(`
      CREATE OR REPLACE FUNCTION centralizar_pago_transporte(p_pago_transporte_id integer)
      RETURNS integer LANGUAGE plpgsql AS $$
      DECLARE
        v_ingreso_id integer; v_tipo_ingreso_id integer;
        v_codigo_ingreso varchar; v_pago RECORD; v_asignacion RECORD;
      BEGIN
        SELECT id INTO v_tipo_ingreso_id FROM tipo_ingreso WHERE codigo = 'ING-TRANS';
        IF v_tipo_ingreso_id IS NULL THEN RAISE EXCEPTION 'Tipo ING-TRANS no encontrado'; END IF;

        SELECT id INTO v_ingreso_id FROM ingreso
         WHERE referencia_tipo = 'transporte' AND referencia_id = p_pago_transporte_id;
        IF v_ingreso_id IS NOT NULL THEN RETURN v_ingreso_id; END IF;

        SELECT * INTO v_pago FROM pago_transporte WHERE id = p_pago_transporte_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pago de transporte % no encontrado', p_pago_transporte_id; END IF;
        IF v_pago.estado != 'pagado' THEN RAISE EXCEPTION 'Solo se centralizan pagos con estado pagado'; END IF;

        SELECT * INTO v_asignacion FROM asignacion_transporte WHERE id = v_pago.asignacion_transporte_id;
        v_codigo_ingreso := 'ING-' || TO_CHAR(COALESCE(v_pago.fecha_pago,CURRENT_TIMESTAMP),'YYYYMMDD')
                         || '-' || LPAD(nextval('ingreso_id_seq')::text,6,'0');

        INSERT INTO ingreso (codigo_ingreso, tipo_ingreso_id, fecha_ingreso,
          estudiante_id, periodo_academico_id, referencia_tipo, referencia_id, referencia_codigo,
          monto, descuento, recargo, metodo_pago, numero_comprobante, comprobante_url,
          registrado_por, observaciones, estado, verificado)
        VALUES (v_codigo_ingreso, v_tipo_ingreso_id, COALESCE(v_pago.fecha_pago,CURRENT_TIMESTAMP),
          v_asignacion.estudiante_id, v_asignacion.periodo_academico_id,
          'transporte', p_pago_transporte_id, v_pago.codigo_pago,
          v_pago.monto_original, 0, v_pago.monto_recargo, v_pago.metodo_pago,
          v_pago.numero_comprobante, v_pago.comprobante_url,
          v_pago.registrado_por, 'Pago de transporte - ' || v_pago.mes_correspondiente,
          'registrado', true)
        RETURNING id INTO v_ingreso_id;
        RETURN v_ingreso_id;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_centralizar_pago_transporte()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.estado = 'pagado' AND NOT NEW.anulado THEN
          PERFORM centralizar_pago_transporte(NEW.id);
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS auto_centralizar_pago_transporte ON pago_transporte;
      CREATE TRIGGER auto_centralizar_pago_transporte
        AFTER INSERT OR UPDATE ON pago_transporte
        FOR EACH ROW EXECUTE FUNCTION trigger_centralizar_pago_transporte();
    `);
    console.log('   ✅ centralizar_pago_transporte + trigger');

    // ════════════════════════════════════════════════════
    // 5. MÓDULO CENTRALIZACIÓN DE INGRESOS
    // ════════════════════════════════════════════════════
    console.log('\n📋 [5] Centralización de Ingresos...');

    await client.query(`
      CREATE OR REPLACE FUNCTION centralizar_pago_mensualidad(p_pago_mensualidad_id integer)
      RETURNS integer LANGUAGE plpgsql AS $$
      DECLARE
        v_ingreso_id integer; v_tipo_ingreso_id integer;
        v_codigo_ingreso varchar; v_pago RECORD; v_mensualidad RECORD; v_matricula RECORD;
      BEGIN
        SELECT id INTO v_tipo_ingreso_id FROM tipo_ingreso WHERE codigo = 'ING-MENS';
        IF v_tipo_ingreso_id IS NULL THEN RAISE EXCEPTION 'Tipo ING-MENS no encontrado'; END IF;

        SELECT id INTO v_ingreso_id FROM ingreso
         WHERE referencia_tipo = 'mensualidad' AND referencia_id = p_pago_mensualidad_id;
        IF v_ingreso_id IS NOT NULL THEN RETURN v_ingreso_id; END IF;

        SELECT * INTO v_pago FROM pago_mensualidad WHERE id = p_pago_mensualidad_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pago mensualidad % no encontrado', p_pago_mensualidad_id; END IF;
        IF v_pago.anulado THEN RETURN NULL; END IF;

        SELECT * INTO v_mensualidad FROM mensualidad WHERE id = v_pago.mensualidad_id;
        SELECT * INTO v_matricula   FROM matricula   WHERE id = v_mensualidad.matricula_id;
        v_codigo_ingreso := 'ING-' || TO_CHAR(v_pago.fecha_pago,'YYYYMMDD')
                         || '-' || LPAD(nextval('ingreso_id_seq')::text,6,'0');

        INSERT INTO ingreso (codigo_ingreso, tipo_ingreso_id, fecha_ingreso,
          periodo_academico_id, estudiante_id, matricula_id,
          referencia_tipo, referencia_id, referencia_codigo,
          monto, descuento, recargo, metodo_pago, numero_comprobante, comprobante_url,
          requiere_factura, factura_emitida, numero_factura,
          registrado_por, observaciones, estado, verificado)
        VALUES (v_codigo_ingreso, v_tipo_ingreso_id, v_pago.fecha_pago,
          v_matricula.periodo_academico_id, v_matricula.estudiante_id, v_mensualidad.matricula_id,
          'mensualidad', p_pago_mensualidad_id, v_pago.codigo_pago,
          v_mensualidad.monto_original, v_mensualidad.monto_beca, v_mensualidad.monto_recargo,
          v_pago.metodo_pago, v_pago.numero_comprobante, v_pago.comprobante_url,
          v_pago.entrego_factura, v_pago.entrego_factura, v_pago.numero_factura,
          v_pago.registrado_por,
          'Mensualidad #' || v_mensualidad.numero_cuota || ' - ' || v_mensualidad.mes_correspondiente,
          'registrado', true)
        RETURNING id INTO v_ingreso_id;
        RETURN v_ingreso_id;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION centralizar_pago_anual(p_pago_anual_id integer)
      RETURNS integer LANGUAGE plpgsql AS $$
      DECLARE
        v_ingreso_id integer; v_tipo_ingreso_id integer;
        v_codigo_ingreso varchar; v_pago RECORD; v_matricula RECORD;
      BEGIN
        SELECT id INTO v_tipo_ingreso_id FROM tipo_ingreso WHERE codigo = 'ING-ANUAL';
        IF v_tipo_ingreso_id IS NULL THEN RAISE EXCEPTION 'Tipo ING-ANUAL no encontrado'; END IF;

        SELECT id INTO v_ingreso_id FROM ingreso
         WHERE referencia_tipo = 'pago_anual' AND referencia_id = p_pago_anual_id;
        IF v_ingreso_id IS NOT NULL THEN RETURN v_ingreso_id; END IF;

        SELECT * INTO v_pago FROM pago_anual_completo WHERE id = p_pago_anual_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pago anual % no encontrado', p_pago_anual_id; END IF;

        SELECT * INTO v_matricula FROM matricula WHERE id = v_pago.matricula_id;
        v_codigo_ingreso := 'ING-' || TO_CHAR(v_pago.fecha_pago,'YYYYMMDD')
                         || '-' || LPAD(nextval('ingreso_id_seq')::text,6,'0');

        INSERT INTO ingreso (codigo_ingreso, tipo_ingreso_id, fecha_ingreso,
          periodo_academico_id, estudiante_id, matricula_id,
          referencia_tipo, referencia_id, referencia_codigo,
          monto, descuento, recargo, metodo_pago, numero_comprobante, comprobante_url,
          requiere_factura, factura_emitida, numero_factura,
          registrado_por, observaciones, estado, verificado)
        VALUES (v_codigo_ingreso, v_tipo_ingreso_id, v_pago.fecha_pago,
          v_matricula.periodo_academico_id, v_matricula.estudiante_id, v_pago.matricula_id,
          'pago_anual', p_pago_anual_id, v_pago.codigo_pago,
          v_pago.monto_total_sin_descuento,
          v_pago.monto_descuento + v_pago.monto_beca_total, 0,
          v_pago.metodo_pago, v_pago.numero_comprobante, v_pago.comprobante_url,
          v_pago.entrego_factura, v_pago.entrego_factura, v_pago.numero_factura,
          v_pago.registrado_por, 'Pago anual completo - 10 meses', 'registrado', true)
        RETURNING id INTO v_ingreso_id;
        RETURN v_ingreso_id;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION centralizar_pago_vacacional(p_inscripcion_id integer)
      RETURNS integer LANGUAGE plpgsql AS $$
      DECLARE
        v_ingreso_id integer; v_tipo_ingreso_id integer;
        v_codigo_ingreso varchar; v_inscripcion RECORD;
      BEGIN
        SELECT id INTO v_tipo_ingreso_id FROM tipo_ingreso WHERE codigo = 'ING-VACAT';
        IF v_tipo_ingreso_id IS NULL THEN RAISE EXCEPTION 'Tipo ING-VACAT no encontrado'; END IF;

        SELECT id INTO v_ingreso_id FROM ingreso
         WHERE referencia_tipo = 'vacacional' AND referencia_id = p_inscripcion_id;
        IF v_ingreso_id IS NOT NULL THEN RETURN v_ingreso_id; END IF;

        SELECT * INTO v_inscripcion FROM inscripcion_vacacional WHERE id = p_inscripcion_id;
        IF NOT FOUND OR NOT v_inscripcion.pago_verificado THEN RETURN NULL; END IF;

        v_codigo_ingreso := 'ING-' || TO_CHAR(COALESCE(v_inscripcion.fecha_verificacion,CURRENT_TIMESTAMP),'YYYYMMDD')
                         || '-' || LPAD(nextval('ingreso_id_seq')::text,6,'0');

        INSERT INTO ingreso (codigo_ingreso, tipo_ingreso_id, fecha_ingreso,
          referencia_tipo, referencia_id, referencia_codigo,
          monto, descuento, recargo, metodo_pago, numero_comprobante, comprobante_url,
          registrado_por, verificado_por, fecha_verificacion, observaciones, estado, verificado)
        VALUES (v_codigo_ingreso, v_tipo_ingreso_id,
          COALESCE(v_inscripcion.fecha_verificacion,CURRENT_TIMESTAMP),
          'vacacional', p_inscripcion_id, v_inscripcion.codigo_inscripcion,
          v_inscripcion.monto_pagado, 0, 0,
          v_inscripcion.metodo_pago, v_inscripcion.numero_comprobante, v_inscripcion.comprobante_pago_url,
          v_inscripcion.verificado_por, v_inscripcion.verificado_por, v_inscripcion.fecha_verificacion,
          'Inscripción vacacional', 'registrado', true)
        RETURNING id INTO v_ingreso_id;
        RETURN v_ingreso_id;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_centralizar_pago_mensualidad()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT NEW.anulado THEN PERFORM centralizar_pago_mensualidad(NEW.id); END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS auto_centralizar_pago_mensualidad ON pago_mensualidad;
      CREATE TRIGGER auto_centralizar_pago_mensualidad
        AFTER INSERT ON pago_mensualidad
        FOR EACH ROW EXECUTE FUNCTION trigger_centralizar_pago_mensualidad();
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_centralizar_pago_anual()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN PERFORM centralizar_pago_anual(NEW.id); RETURN NEW; END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS auto_centralizar_pago_anual ON pago_anual_completo;
      CREATE TRIGGER auto_centralizar_pago_anual
        AFTER INSERT ON pago_anual_completo
        FOR EACH ROW EXECUTE FUNCTION trigger_centralizar_pago_anual();
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_centralizar_pago_vacacional()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.pago_verificado = true AND (OLD.pago_verificado = false OR OLD.pago_verificado IS NULL) THEN
          PERFORM centralizar_pago_vacacional(NEW.id);
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS auto_centralizar_pago_vacacional ON inscripcion_vacacional;
      CREATE TRIGGER auto_centralizar_pago_vacacional
        AFTER UPDATE ON inscripcion_vacacional
        FOR EACH ROW EXECUTE FUNCTION trigger_centralizar_pago_vacacional();
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION migrar_ingresos_historicos()
      RETURNS TABLE(tipo varchar, procesados integer, exitosos integer, fallidos integer)
      LANGUAGE plpgsql AS $$
      DECLARE v_proc integer; v_exit integer; v_fail integer; v_id integer;
      BEGIN
        v_proc:=0; v_exit:=0; v_fail:=0;
        FOR v_id IN SELECT id FROM pago_mensualidad WHERE NOT anulado LOOP
          v_proc:=v_proc+1;
          BEGIN PERFORM centralizar_pago_mensualidad(v_id); v_exit:=v_exit+1;
          EXCEPTION WHEN OTHERS THEN v_fail:=v_fail+1; END;
        END LOOP;
        tipo:='Mensualidades'; procesados:=v_proc; exitosos:=v_exit; fallidos:=v_fail; RETURN NEXT;

        v_proc:=0; v_exit:=0; v_fail:=0;
        FOR v_id IN SELECT id FROM pago_anual_completo LOOP
          v_proc:=v_proc+1;
          BEGIN PERFORM centralizar_pago_anual(v_id); v_exit:=v_exit+1;
          EXCEPTION WHEN OTHERS THEN v_fail:=v_fail+1; END;
        END LOOP;
        tipo:='Pagos Anuales'; procesados:=v_proc; exitosos:=v_exit; fallidos:=v_fail; RETURN NEXT;

        v_proc:=0; v_exit:=0; v_fail:=0;
        FOR v_id IN SELECT id FROM inscripcion_vacacional WHERE pago_verificado = true LOOP
          v_proc:=v_proc+1;
          BEGIN PERFORM centralizar_pago_vacacional(v_id); v_exit:=v_exit+1;
          EXCEPTION WHEN OTHERS THEN v_fail:=v_fail+1; END;
        END LOOP;
        tipo:='Vacacionales'; procesados:=v_proc; exitosos:=v_exit; fallidos:=v_fail; RETURN NEXT;
      END; $$;
    `);
    console.log('   ✅ centralizar_pago_mensualidad/anual/vacacional + triggers + migrar_ingresos_historicos');

    // ════════════════════════════════════════════════════
    // 6. MÓDULO HORARIOS
    // ════════════════════════════════════════════════════
    console.log('\n📋 [6] Módulo Horarios...');

    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_publicacion_horario()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.estado = 'publicado' AND OLD.estado != 'publicado' THEN
          NEW.publicado_en = CURRENT_TIMESTAMP;
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_publicacion_horario ON horario;
      CREATE TRIGGER trg_publicacion_horario
        BEFORE UPDATE ON horario
        FOR EACH ROW EXECUTE FUNCTION registrar_publicacion_horario();
    `);
    console.log('   ✅ trg_publicacion_horario');

    // ════════════════════════════════════════════════════
    // 7. MÓDULO MATERIALES ACADÉMICOS
    // ════════════════════════════════════════════════════
    console.log('\n📋 [7] Módulo Materiales...');

    await client.query(`
      CREATE OR REPLACE FUNCTION incrementar_contador_material()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.tipo_accion = 'visualizacion' THEN
          UPDATE material_academico SET contador_vistas    = contador_vistas    + 1 WHERE id = NEW.material_academico_id;
        ELSIF NEW.tipo_accion = 'descarga' THEN
          UPDATE material_academico SET contador_descargas = contador_descargas + 1 WHERE id = NEW.material_academico_id;
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_incrementar_contador ON acceso_material;
      CREATE TRIGGER trg_incrementar_contador
        AFTER INSERT ON acceso_material
        FOR EACH ROW EXECUTE FUNCTION incrementar_contador_material();
    `);
    console.log('   ✅ trg_incrementar_contador');

    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_progreso_tema()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE v_tema_id integer;
      BEGIN
        SELECT mt.tema_id INTO v_tema_id FROM material_tema mt
         WHERE mt.material_academico_id = NEW.material_academico_id AND mt.es_principal = true LIMIT 1;
        IF v_tema_id IS NOT NULL AND NEW.matricula_id IS NOT NULL THEN
          INSERT INTO progreso_estudiante (matricula_id, tema_id, estado, fecha_inicio, tiempo_dedicado)
          VALUES (NEW.matricula_id, v_tema_id, 'en_progreso', CURRENT_TIMESTAMP, COALESCE(NEW.duracion_segundos/60,0))
          ON CONFLICT (matricula_id, tema_id) DO UPDATE SET
            estado          = CASE WHEN progreso_estudiante.estado = 'no_iniciado' THEN 'en_progreso' ELSE progreso_estudiante.estado END,
            tiempo_dedicado = progreso_estudiante.tiempo_dedicado + COALESCE(NEW.duracion_segundos/60,0),
            updated_at      = CURRENT_TIMESTAMP;
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_actualizar_progreso ON acceso_material;
      CREATE TRIGGER trg_actualizar_progreso
        AFTER INSERT ON acceso_material
        FOR EACH ROW
        WHEN (NEW.tipo_accion IN ('visualizacion','descarga'))
        EXECUTE FUNCTION actualizar_progreso_tema();
    `);
    console.log('   ✅ trg_actualizar_progreso');

    await client.query(`
      CREATE OR REPLACE FUNCTION generar_codigo_material()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE
        v_year varchar(4); v_counter integer; v_codigo varchar(50); v_intentos integer := 0;
      BEGIN
        IF NEW.codigo_material IS NULL OR NEW.codigo_material = '' THEN
          v_year := TO_CHAR(CURRENT_DATE,'YYYY');
          LOOP
            SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_material FROM 'MAT-' || v_year || '-(\\d+)') AS integer)),0) + 1
              INTO v_counter FROM material_academico WHERE codigo_material LIKE 'MAT-' || v_year || '-%';
            v_codigo := 'MAT-' || v_year || '-' || LPAD(v_counter::text,6,'0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM material_academico WHERE codigo_material = v_codigo);
            v_intentos := v_intentos + 1;
            IF v_intentos > 10 THEN RAISE EXCEPTION 'No se pudo generar código único para el material'; END IF;
          END LOOP;
          NEW.codigo_material := v_codigo;
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_generar_codigo_material ON material_academico;
      CREATE TRIGGER trg_generar_codigo_material
        BEFORE INSERT ON material_academico
        FOR EACH ROW EXECUTE FUNCTION generar_codigo_material();
    `);
    console.log('   ✅ trg_generar_codigo_material');

    await client.query(`
      CREATE OR REPLACE FUNCTION obtener_temario_materia(
        p_grado_materia_id integer, p_periodo_evaluacion_id integer DEFAULT NULL
      )
      RETURNS TABLE(
        unidad_id integer, unidad_numero integer, unidad_titulo varchar, unidad_descripcion text,
        tema_id integer, tema_numero integer, tema_titulo varchar, tema_descripcion text,
        total_materiales bigint, nivel_dificultad varchar
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT u.id::integer, u.numero_unidad::integer, u.titulo::varchar, u.descripcion::text,
          t.id::integer, t.numero_tema::integer, t.titulo::varchar, t.descripcion::text,
          COUNT(DISTINCT mt.material_academico_id), t.nivel_dificultad::varchar
        FROM unidad_tematica u
        LEFT JOIN tema t           ON u.id = t.unidad_tematica_id AND t.activo = true
        LEFT JOIN material_tema mt ON t.id = mt.tema_id
        WHERE u.grado_materia_id = p_grado_materia_id AND u.activo = true
          AND (p_periodo_evaluacion_id IS NULL OR u.periodo_evaluacion_id = p_periodo_evaluacion_id)
        GROUP BY u.id, u.numero_unidad, u.titulo, u.descripcion,
                 t.id, t.numero_tema, t.titulo, t.descripcion, t.nivel_dificultad
        ORDER BY u.numero_unidad, t.numero_tema;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION buscar_materiales(
        p_query text, p_asignacion_docente_id integer DEFAULT NULL,
        p_tipo_material_id integer DEFAULT NULL, p_solo_visibles boolean DEFAULT true
      )
      RETURNS TABLE(
        material_id integer, codigo varchar, titulo varchar, descripcion text,
        tipo_material varchar, fecha_publicacion timestamp, contador_vistas integer, relevancia real
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT m.id::integer, m.codigo_material::varchar, m.titulo::varchar, m.descripcion::text,
          tm.nombre::varchar, m.fecha_publicacion, m.contador_vistas::integer,
          ts_rank(
            to_tsvector('spanish', COALESCE(m.titulo,'') || ' ' || COALESCE(m.descripcion,'') || ' ' || COALESCE(m.nombre_archivo,'')),
            plainto_tsquery('spanish', p_query)
          ) AS relevancia
        FROM material_academico m
        INNER JOIN tipo_material tm ON m.tipo_material_id = tm.id
        WHERE to_tsvector('spanish', COALESCE(m.titulo,'') || ' ' || COALESCE(m.descripcion,'') || ' ' || COALESCE(m.nombre_archivo,''))
              @@ plainto_tsquery('spanish', p_query)
          AND m.activo = true AND m.deleted_at IS NULL
          AND (p_asignacion_docente_id IS NULL OR m.asignacion_docente_id = p_asignacion_docente_id)
          AND (p_tipo_material_id IS NULL OR m.tipo_material_id = p_tipo_material_id)
          AND (NOT p_solo_visibles OR (
            m.visible_para_estudiantes = true AND m.fecha_publicacion IS NOT NULL
            AND m.fecha_publicacion <= CURRENT_TIMESTAMP
            AND (m.fecha_despublicacion IS NULL OR m.fecha_despublicacion > CURRENT_TIMESTAMP)
          ))
        ORDER BY relevancia DESC, m.fecha_publicacion DESC;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION estadisticas_material(
        p_material_id integer, p_fecha_inicio date DEFAULT NULL, p_fecha_fin date DEFAULT NULL
      )
      RETURNS TABLE(
        total_vistas bigint, total_descargas bigint, estudiantes_unicos bigint,
        promedio_duracion numeric, tasa_completado numeric,
        total_comentarios bigint, total_dudas_abiertas bigint
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT
          COUNT(CASE WHEN am.tipo_accion = 'visualizacion' THEN 1 END),
          COUNT(CASE WHEN am.tipo_accion = 'descarga'      THEN 1 END),
          COUNT(DISTINCT am.matricula_id),
          ROUND(AVG(am.duracion_segundos)::numeric / 60, 2),
          ROUND(COUNT(CASE WHEN am.completado = true THEN 1 END)::numeric / NULLIF(COUNT(am.id),0) * 100, 2),
          (SELECT COUNT(*) FROM comentario_material WHERE material_academico_id = p_material_id AND activo = true),
          (SELECT COUNT(*) FROM comentario_material WHERE material_academico_id = p_material_id AND es_duda = true AND es_resuelto = false AND activo = true)
        FROM acceso_material am
        WHERE am.material_academico_id = p_material_id
          AND (p_fecha_inicio IS NULL OR am.created_at >= p_fecha_inicio)
          AND (p_fecha_fin    IS NULL OR am.created_at <= p_fecha_fin);
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_progreso_estudiante(p_matricula_id integer, p_grado_materia_id integer)
      RETURNS TABLE(
        unidad_titulo varchar, tema_titulo varchar, estado_progreso varchar,
        porcentaje_avance numeric, tiempo_dedicado integer,
        materiales_vistos bigint, materiales_totales bigint, fecha_ultima_actividad timestamp
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT u.titulo::varchar, t.titulo::varchar,
          COALESCE(pe.estado,'no_iniciado')::varchar, COALESCE(pe.porcentaje_avance,0)::numeric,
          COALESCE(pe.tiempo_dedicado,0)::integer,
          COUNT(DISTINCT CASE WHEN am.matricula_id = p_matricula_id THEN am.material_academico_id END),
          COUNT(DISTINCT mt.material_academico_id), MAX(am.created_at)
        FROM unidad_tematica u
        INNER JOIN tema t ON u.id = t.unidad_tematica_id
        LEFT JOIN material_tema mt ON t.id = mt.tema_id
        LEFT JOIN acceso_material am ON mt.material_academico_id = am.material_academico_id AND am.matricula_id = p_matricula_id
        LEFT JOIN progreso_estudiante pe ON t.id = pe.tema_id AND pe.matricula_id = p_matricula_id
        WHERE u.grado_materia_id = p_grado_materia_id AND u.activo = true AND t.activo = true
        GROUP BY u.titulo, u.numero_unidad, t.titulo, t.numero_tema, pe.estado, pe.porcentaje_avance, pe.tiempo_dedicado
        ORDER BY u.numero_unidad, t.numero_tema;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION materiales_destacados_materia(p_asignacion_docente_id integer, p_limite integer DEFAULT 5)
      RETURNS TABLE(
        material_id integer, codigo varchar, titulo varchar, tipo_material varchar,
        fecha_publicacion timestamp, contador_vistas integer, contador_descargas integer, total_comentarios bigint
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT m.id::integer, m.codigo_material::varchar, m.titulo::varchar, tm.nombre::varchar,
          m.fecha_publicacion, m.contador_vistas::integer, m.contador_descargas::integer, COUNT(cm.id)
        FROM material_academico m
        INNER JOIN tipo_material tm ON m.tipo_material_id = tm.id
        LEFT JOIN comentario_material cm ON m.id = cm.material_academico_id AND cm.activo = true
        WHERE m.asignacion_docente_id = p_asignacion_docente_id AND m.es_destacado = true
          AND m.visible_para_estudiantes = true AND m.activo = true AND m.deleted_at IS NULL
          AND m.fecha_publicacion IS NOT NULL AND m.fecha_publicacion <= CURRENT_TIMESTAMP
          AND (m.fecha_despublicacion IS NULL OR m.fecha_despublicacion > CURRENT_TIMESTAMP)
        GROUP BY m.id, m.codigo_material, m.titulo, tm.nombre, m.fecha_publicacion, m.contador_vistas, m.contador_descargas
        ORDER BY m.fecha_publicacion DESC, m.contador_vistas DESC LIMIT p_limite;
      END; $$;
    `);
    console.log('   ✅ obtener_temario_materia, buscar_materiales, estadisticas_material, reporte_progreso_estudiante, materiales_destacados_materia');

    // ════════════════════════════════════════════════════
    // 8. MÓDULO ASISTENCIA Y NOTAS
    // ════════════════════════════════════════════════════
    console.log('\n📋 [8] Módulo Asistencia y Notas...');

    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_historial_permiso()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.estado IS DISTINCT FROM NEW.estado THEN
          INSERT INTO solicitud_permiso_historial (solicitud_permiso_id, estado_anterior, estado_nuevo, usuario_id, comentario)
          VALUES (NEW.id, OLD.estado, NEW.estado, NEW.revisado_por,
            CASE WHEN NEW.estado = 'rechazada' THEN NEW.motivo_rechazo
                 WHEN NEW.estado = 'aprobada'  THEN NEW.observaciones_revisor ELSE NULL END);
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_historial_permiso ON solicitud_permiso;
      CREATE TRIGGER trg_historial_permiso
        AFTER UPDATE ON solicitud_permiso
        FOR EACH ROW EXECUTE FUNCTION registrar_historial_permiso();
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION sincronizar_asistencia_con_permiso()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.estado = 'aprobada' AND OLD.estado != 'aprobada' THEN
          UPDATE asistencia SET
            estado               = 'justificado',
            solicitud_permiso_id = NEW.id,
            justificacion        = 'Permiso aprobado: ' || NEW.motivo,
            updated_at           = CURRENT_TIMESTAMP
          WHERE matricula_id IN (SELECT id FROM matricula WHERE estudiante_id = NEW.estudiante_id AND deleted_at IS NULL)
            AND fecha  = NEW.fecha_ausencia AND estado = 'ausente'
            AND (NEW.asignacion_docente_id IS NULL OR asignacion_docente_id = NEW.asignacion_docente_id);
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_sincronizar_asistencia_permiso ON solicitud_permiso;
      CREATE TRIGGER trg_sincronizar_asistencia_permiso
        AFTER UPDATE ON solicitud_permiso
        FOR EACH ROW EXECUTE FUNCTION sincronizar_asistencia_con_permiso();
    `);
    console.log('   ✅ trg_historial_permiso, trg_sincronizar_asistencia_permiso');

    await client.query(`
      CREATE OR REPLACE FUNCTION calcular_nota_dimension(
        p_matricula_id integer, p_grado_materia_id integer,
        p_periodo_evaluacion_id integer, p_dimension_evaluacion_id integer
      )
      RETURNS numeric LANGUAGE plpgsql AS $$
      DECLARE v_nota_promedio numeric(5,2); v_total_evs integer; v_total_peso numeric;
      BEGIN
        SELECT
          ROUND(COALESCE(SUM((c.puntaje_obtenido/e.puntaje_maximo*100)*e.peso_en_dimension)/NULLIF(SUM(e.peso_en_dimension),0),0)::numeric,2),
          COUNT(c.id), SUM(e.peso_en_dimension)
        INTO v_nota_promedio, v_total_evs, v_total_peso
        FROM evaluacion e
        INNER JOIN asignacion_docente ad ON e.asignacion_docente_id = ad.id
        INNER JOIN calificacion c        ON e.id = c.evaluacion_id
        WHERE ad.grado_materia_id = p_grado_materia_id
          AND e.periodo_evaluacion_id = p_periodo_evaluacion_id
          AND e.dimension_evaluacion_id = p_dimension_evaluacion_id
          AND e.activo = true AND c.matricula_id = p_matricula_id;

        INSERT INTO nota_dimension (matricula_id, grado_materia_id, periodo_evaluacion_id, dimension_evaluacion_id, nota_promedio, total_evaluaciones)
        VALUES (p_matricula_id, p_grado_materia_id, p_periodo_evaluacion_id, p_dimension_evaluacion_id, v_nota_promedio, v_total_evs)
        ON CONFLICT (matricula_id, grado_materia_id, periodo_evaluacion_id, dimension_evaluacion_id) DO UPDATE SET
          nota_promedio = EXCLUDED.nota_promedio, total_evaluaciones = EXCLUDED.total_evaluaciones,
          calculado_en = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP;
        RETURN v_nota_promedio;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION calcular_calificacion_periodo(
        p_matricula_id integer, p_grado_materia_id integer, p_periodo_evaluacion_id integer
      )
      RETURNS numeric LANGUAGE plpgsql AS $$
      DECLARE v_nota_final numeric(5,2); v_nota_minima numeric(5,2); v_aprobado boolean;
      BEGIN
        PERFORM calcular_nota_dimension(p_matricula_id, p_grado_materia_id, p_periodo_evaluacion_id, de.id)
          FROM dimension_evaluacion de WHERE de.activo = true;

        SELECT ROUND(COALESCE(SUM(nd.nota_promedio*de.porcentaje_ponderacion)/100,0)::numeric,2)
          INTO v_nota_final
          FROM nota_dimension nd INNER JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
         WHERE nd.matricula_id = p_matricula_id AND nd.grado_materia_id = p_grado_materia_id AND nd.periodo_evaluacion_id = p_periodo_evaluacion_id;

        SELECT nota_minima_aprobacion INTO v_nota_minima FROM grado_materia WHERE id = p_grado_materia_id;
        v_aprobado := COALESCE(v_nota_final,0) >= COALESCE(v_nota_minima,51);

        INSERT INTO calificacion_periodo (matricula_id, grado_materia_id, periodo_evaluacion_id, nota_final, aprobado)
        VALUES (p_matricula_id, p_grado_materia_id, p_periodo_evaluacion_id, v_nota_final, v_aprobado)
        ON CONFLICT (matricula_id, grado_materia_id, periodo_evaluacion_id) DO UPDATE SET
          nota_final   = CASE WHEN calificacion_periodo.es_nota_manual THEN calificacion_periodo.nota_final   ELSE EXCLUDED.nota_final   END,
          aprobado     = CASE WHEN calificacion_periodo.es_nota_manual THEN calificacion_periodo.aprobado     ELSE EXCLUDED.aprobado     END,
          calculado_en = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE calificacion_periodo.estado != 'cerrada';
        RETURN v_nota_final;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_asistencia_estudiante(
        p_matricula_id integer, p_asignacion_docente_id integer DEFAULT NULL,
        p_fecha_inicio date DEFAULT NULL, p_fecha_fin date DEFAULT NULL
      )
      RETURNS TABLE(
        asignacion_id integer, materia_nombre varchar, total_clases bigint,
        presentes bigint, ausentes bigint, tardanzas bigint,
        justificados bigint, faltas_parciales bigint, porcentaje_asistencia numeric
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT a.asignacion_docente_id::integer, m.nombre::varchar, COUNT(a.id),
          COUNT(CASE WHEN a.estado = 'presente'      THEN 1 END),
          COUNT(CASE WHEN a.estado = 'ausente'       THEN 1 END),
          COUNT(CASE WHEN a.estado = 'tardanza'      THEN 1 END),
          COUNT(CASE WHEN a.estado = 'justificado'   THEN 1 END),
          COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END),
          ROUND(COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado') THEN 1 END)::numeric/NULLIF(COUNT(a.id),0)*100,2)
        FROM asistencia a
        INNER JOIN asignacion_docente ad ON a.asignacion_docente_id = ad.id
        INNER JOIN grado_materia gm      ON ad.grado_materia_id = gm.id
        INNER JOIN materia m             ON gm.materia_id = m.id
        WHERE a.matricula_id = p_matricula_id
          AND (p_asignacion_docente_id IS NULL OR a.asignacion_docente_id = p_asignacion_docente_id)
          AND (p_fecha_inicio IS NULL OR a.fecha >= p_fecha_inicio)
          AND (p_fecha_fin    IS NULL OR a.fecha <= p_fecha_fin)
        GROUP BY a.asignacion_docente_id, m.nombre;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION boletin_notas(p_matricula_id integer, p_periodo_evaluacion_id integer)
      RETURNS TABLE(
        materia_nombre varchar, materia_codigo varchar,
        nota_ser numeric, nota_saber numeric, nota_hacer numeric,
        nota_final numeric, nota_minima numeric, aprobado boolean, estado_periodo varchar
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT mat.nombre::varchar, mat.codigo::varchar,
          MAX(CASE WHEN de.codigo = 'SER' THEN nd.nota_promedio END),
          MAX(CASE WHEN de.codigo = 'SAB' THEN nd.nota_promedio END),
          MAX(CASE WHEN de.codigo = 'HAC' THEN nd.nota_promedio END),
          cp.nota_final, gm.nota_minima_aprobacion, cp.aprobado, cp.estado::varchar
        FROM calificacion_periodo cp
        INNER JOIN grado_materia gm ON cp.grado_materia_id = gm.id
        INNER JOIN materia mat      ON gm.materia_id = mat.id
        LEFT JOIN nota_dimension nd ON nd.matricula_id = cp.matricula_id AND nd.grado_materia_id = cp.grado_materia_id AND nd.periodo_evaluacion_id = cp.periodo_evaluacion_id
        LEFT JOIN dimension_evaluacion de ON nd.dimension_evaluacion_id = de.id
        WHERE cp.matricula_id = p_matricula_id AND cp.periodo_evaluacion_id = p_periodo_evaluacion_id
        GROUP BY mat.nombre, mat.codigo, cp.nota_final, gm.nota_minima_aprobacion, cp.aprobado, cp.estado
        ORDER BY mat.nombre;
      END; $$;
    `);
    console.log('   ✅ calcular_nota_dimension, calcular_calificacion_periodo, reporte_asistencia_estudiante, boletin_notas');

    // ════════════════════════════════════════════════════
    // 9. REPORTES DE ASISTENCIA POR CLASE Y TRIMESTRES
    // ════════════════════════════════════════════════════
    console.log('\n📋 [9] Reportes de Asistencia por Clase...');

    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_asistencia_clase(
        p_asignacion_docente_id integer, p_fecha_inicio date DEFAULT NULL, p_fecha_fin date DEFAULT NULL
      )
      RETURNS TABLE(
        matricula_id integer, estudiante_id integer, estudiante_codigo varchar,
        estudiante_nombres varchar, estudiante_apellidos varchar, estudiante_foto varchar,
        total_clases bigint, presentes bigint, ausentes bigint, tardanzas bigint,
        justificados bigint, faltas_parciales bigint, porcentaje_asistencia numeric
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT m.id::integer, e.id::integer, e.codigo::varchar,
          e.nombres::varchar, e.apellidos::varchar, e.foto_url::varchar,
          COUNT(a.id),
          COUNT(CASE WHEN a.estado = 'presente'      THEN 1 END),
          COUNT(CASE WHEN a.estado = 'ausente'       THEN 1 END),
          COUNT(CASE WHEN a.estado = 'tardanza'      THEN 1 END),
          COUNT(CASE WHEN a.estado = 'justificado'   THEN 1 END),
          COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END),
          ROUND(COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado') THEN 1 END)::numeric/NULLIF(COUNT(a.id),0)*100,2)
        FROM asignacion_docente ad
        INNER JOIN matricula m  ON m.paralelo_id = ad.paralelo_id AND m.periodo_academico_id = ad.periodo_academico_id AND m.estado = 'activo' AND m.deleted_at IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        LEFT JOIN asistencia a  ON a.matricula_id = m.id AND a.asignacion_docente_id = p_asignacion_docente_id
          AND (p_fecha_inicio IS NULL OR a.fecha >= p_fecha_inicio)
          AND (p_fecha_fin    IS NULL OR a.fecha <= p_fecha_fin)
        WHERE ad.id = p_asignacion_docente_id
        GROUP BY m.id, e.id, e.codigo, e.nombres, e.apellidos, e.foto_url
        ORDER BY e.apellidos, e.nombres;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_asistencia_clase(
        p_asignacion_docente_id integer, p_fecha_inicio date DEFAULT NULL, p_fecha_fin date DEFAULT NULL
      )
      RETURNS TABLE(
        total_dias_registrados bigint, total_estudiantes bigint, total_registros bigint,
        presentes bigint, ausentes bigint, tardanzas bigint, justificados bigint,
        faltas_parciales bigint, promedio_asistencia numeric, estudiantes_criticos bigint
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        WITH datos AS (
          SELECT a.fecha, a.estado, m.id AS matricula_id,
            ROUND(COUNT(CASE WHEN a2.estado IN ('presente','tardanza','justificado') THEN 1 END)::numeric/NULLIF(COUNT(a2.id),0)*100,2) AS pct_estudiante
          FROM asignacion_docente ad
          INNER JOIN matricula m ON m.paralelo_id = ad.paralelo_id AND m.periodo_academico_id = ad.periodo_academico_id AND m.estado = 'activo' AND m.deleted_at IS NULL
          LEFT JOIN asistencia a  ON a.matricula_id = m.id AND a.asignacion_docente_id = p_asignacion_docente_id
            AND (p_fecha_inicio IS NULL OR a.fecha >= p_fecha_inicio)
            AND (p_fecha_fin    IS NULL OR a.fecha <= p_fecha_fin)
          LEFT JOIN asistencia a2 ON a2.matricula_id = m.id AND a2.asignacion_docente_id = p_asignacion_docente_id
          WHERE ad.id = p_asignacion_docente_id GROUP BY a.fecha, a.estado, m.id
        )
        SELECT COUNT(DISTINCT datos.fecha), COUNT(DISTINCT datos.matricula_id), COUNT(datos.estado),
          COUNT(CASE WHEN datos.estado = 'presente'      THEN 1 END),
          COUNT(CASE WHEN datos.estado = 'ausente'       THEN 1 END),
          COUNT(CASE WHEN datos.estado = 'tardanza'      THEN 1 END),
          COUNT(CASE WHEN datos.estado = 'justificado'   THEN 1 END),
          COUNT(CASE WHEN datos.estado = 'falta_parcial' THEN 1 END),
          ROUND(AVG(datos.pct_estudiante),2),
          COUNT(CASE WHEN datos.pct_estudiante < 70 THEN 1 END)
        FROM datos;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_asistencia_trimestres_clase(p_asignacion_docente_id integer)
      RETURNS TABLE(
        matricula_id integer, estudiante_id integer, estudiante_codigo varchar,
        estudiante_nombres varchar, estudiante_apellidos varchar, estudiante_foto varchar,
        periodo_evaluacion_id integer, periodo_nombre varchar, periodo_orden integer,
        fecha_inicio date, fecha_fin date,
        total_clases bigint, presentes bigint, ausentes bigint, tardanzas bigint,
        justificados bigint, faltas_parciales bigint, porcentaje_asistencia numeric
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT m.id, e.id, e.codigo, e.nombres, e.apellidos, e.foto_url,
          pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin,
          COUNT(a.id),
          COUNT(CASE WHEN a.estado = 'presente'      THEN 1 END),
          COUNT(CASE WHEN a.estado = 'ausente'       THEN 1 END),
          COUNT(CASE WHEN a.estado = 'tardanza'      THEN 1 END),
          COUNT(CASE WHEN a.estado = 'justificado'   THEN 1 END),
          COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END),
          ROUND(COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado') THEN 1 END)::numeric/NULLIF(COUNT(a.id),0)*100,2)
        FROM asignacion_docente ad
        INNER JOIN matricula m  ON m.paralelo_id = ad.paralelo_id AND m.periodo_academico_id = ad.periodo_academico_id AND m.estado = 'activo' AND m.deleted_at IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        INNER JOIN periodo_evaluacion pe ON pe.periodo_academico_id = ad.periodo_academico_id AND pe.activo = true
        LEFT JOIN asistencia a ON a.matricula_id = m.id AND a.asignacion_docente_id = p_asignacion_docente_id AND a.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
        WHERE ad.id = p_asignacion_docente_id
        GROUP BY m.id, e.id, e.codigo, e.nombres, e.apellidos, e.foto_url, pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin
        ORDER BY e.apellidos, e.nombres, pe.orden;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_asistencia_trimestres_clase(p_asignacion_docente_id integer)
      RETURNS TABLE(
        periodo_evaluacion_id integer, periodo_nombre varchar, periodo_orden integer,
        fecha_inicio date, fecha_fin date, total_estudiantes bigint, total_clases bigint,
        presentes bigint, ausentes bigint, tardanzas bigint, justificados bigint,
        faltas_parciales bigint, promedio_asistencia numeric, estudiantes_criticos bigint
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        WITH por_estudiante AS (
          SELECT pe.id AS pe_id, pe.nombre AS pe_nombre, pe.orden AS pe_orden,
            pe.fecha_inicio AS pe_inicio, pe.fecha_fin AS pe_fin, m.id AS matricula_id,
            COUNT(a.id) AS total_clases_est,
            COUNT(CASE WHEN a.estado = 'presente'      THEN 1 END) AS presentes_est,
            COUNT(CASE WHEN a.estado = 'ausente'       THEN 1 END) AS ausentes_est,
            COUNT(CASE WHEN a.estado = 'tardanza'      THEN 1 END) AS tardanzas_est,
            COUNT(CASE WHEN a.estado = 'justificado'   THEN 1 END) AS justificados_est,
            COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END) AS faltas_parciales_est,
            ROUND(COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado') THEN 1 END)::numeric/NULLIF(COUNT(a.id),0)*100,2) AS pct_est
          FROM asignacion_docente ad
          INNER JOIN matricula m ON m.paralelo_id = ad.paralelo_id AND m.periodo_academico_id = ad.periodo_academico_id AND m.estado = 'activo' AND m.deleted_at IS NULL
          INNER JOIN periodo_evaluacion pe ON pe.periodo_academico_id = ad.periodo_academico_id AND pe.activo = true
          LEFT JOIN asistencia a ON a.matricula_id = m.id AND a.asignacion_docente_id = p_asignacion_docente_id AND a.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
          WHERE ad.id = p_asignacion_docente_id
          GROUP BY pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin, m.id
        )
        SELECT p.pe_id, p.pe_nombre, p.pe_orden, p.pe_inicio, p.pe_fin,
          COUNT(DISTINCT p.matricula_id), SUM(p.total_clases_est),
          SUM(p.presentes_est), SUM(p.ausentes_est), SUM(p.tardanzas_est),
          SUM(p.justificados_est), SUM(p.faltas_parciales_est),
          ROUND(AVG(p.pct_est),2), COUNT(CASE WHEN p.pct_est < 70 THEN 1 END)
        FROM por_estudiante p
        GROUP BY p.pe_id, p.pe_nombre, p.pe_orden, p.pe_inicio, p.pe_fin ORDER BY p.pe_orden;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_asistencia_trimestres_estudiante(
        p_matricula_id integer, p_asignacion_docente_id integer
      )
      RETURNS TABLE(
        periodo_evaluacion_id integer, periodo_nombre varchar, periodo_orden integer,
        fecha_inicio date, fecha_fin date, total_clases bigint,
        presentes bigint, ausentes bigint, tardanzas bigint,
        justificados bigint, faltas_parciales bigint, porcentaje_asistencia numeric
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin, COUNT(a.id),
          COUNT(CASE WHEN a.estado = 'presente'      THEN 1 END),
          COUNT(CASE WHEN a.estado = 'ausente'       THEN 1 END),
          COUNT(CASE WHEN a.estado = 'tardanza'      THEN 1 END),
          COUNT(CASE WHEN a.estado = 'justificado'   THEN 1 END),
          COUNT(CASE WHEN a.estado = 'falta_parcial' THEN 1 END),
          ROUND(COUNT(CASE WHEN a.estado IN ('presente','tardanza','justificado') THEN 1 END)::numeric/NULLIF(COUNT(a.id),0)*100,2)
        FROM asignacion_docente ad
        INNER JOIN periodo_evaluacion pe ON pe.periodo_academico_id = ad.periodo_academico_id AND pe.activo = true
        LEFT JOIN asistencia a ON a.matricula_id = p_matricula_id AND a.asignacion_docente_id = p_asignacion_docente_id AND a.fecha BETWEEN pe.fecha_inicio AND pe.fecha_fin
        WHERE ad.id = p_asignacion_docente_id
        GROUP BY pe.id, pe.nombre, pe.orden, pe.fecha_inicio, pe.fecha_fin ORDER BY pe.orden;
      END; $$;
    `);
    console.log('   ✅ reporte/resumen_asistencia_clase, reporte_asistencia_trimestres_*');

    // ════════════════════════════════════════════════════
    // 10. MÓDULO EVALUACIÓN ↔ TEMA
    // ════════════════════════════════════════════════════
    console.log('\n📋 [10] Módulo Evaluación-Tema...');

    await client.query(`
      CREATE OR REPLACE FUNCTION evaluaciones_por_tema(
        p_tema_id integer, p_periodo_evaluacion_id integer DEFAULT NULL
      )
      RETURNS TABLE(
        evaluacion_id integer, evaluacion_nombre varchar, tipo varchar,
        dimension_nombre varchar, dimension_codigo varchar, dimension_color varchar,
        puntaje_maximo numeric, peso_en_dimension numeric, fecha date,
        visible_para_padres boolean, total_calificados bigint
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT e.id::integer, e.nombre::varchar, e.tipo::varchar,
          de.nombre::varchar, de.codigo::varchar, de.color::varchar,
          e.puntaje_maximo, e.peso_en_dimension, e.fecha,
          e.visible_para_padres, COUNT(c.id)
        FROM evaluacion e
        INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
        LEFT JOIN calificacion c ON e.id = c.evaluacion_id
        WHERE e.tema_id = p_tema_id AND e.activo = true
          AND (p_periodo_evaluacion_id IS NULL OR e.periodo_evaluacion_id = p_periodo_evaluacion_id)
        GROUP BY e.id, e.nombre, e.tipo, de.nombre, de.codigo, de.color,
                 e.puntaje_maximo, e.peso_en_dimension, e.fecha, e.visible_para_padres, de.orden
        ORDER BY de.orden, e.fecha, e.nombre;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_evaluaciones_unidad(
        p_grado_materia_id integer, p_periodo_evaluacion_id integer DEFAULT NULL
      )
      RETURNS TABLE(
        unidad_id integer, unidad_titulo varchar, numero_unidad integer,
        tema_id integer, tema_titulo varchar, numero_tema integer,
        dimension_codigo varchar, dimension_nombre varchar,
        total_evaluaciones bigint, puntaje_total numeric
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT u.id::integer, u.titulo::varchar, u.numero_unidad::integer,
          t.id::integer, t.titulo::varchar, t.numero_tema::integer,
          de.codigo::varchar, de.nombre::varchar, COUNT(e.id), COALESCE(SUM(e.puntaje_maximo),0)
        FROM unidad_tematica u
        INNER JOIN tema t ON t.unidad_tematica_id = u.id AND t.activo = true
        LEFT JOIN evaluacion e ON e.tema_id = t.id AND e.activo = true
          AND (p_periodo_evaluacion_id IS NULL OR e.periodo_evaluacion_id = p_periodo_evaluacion_id)
        LEFT JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
        WHERE u.grado_materia_id = p_grado_materia_id AND u.activo = true
        GROUP BY u.id, u.titulo, u.numero_unidad, t.id, t.titulo, t.numero_tema, de.codigo, de.nombre, de.orden
        ORDER BY u.numero_unidad, t.numero_tema, de.orden;
      END; $$;
    `);
    console.log('   ✅ evaluaciones_por_tema, resumen_evaluaciones_unidad');

    // ════════════════════════════════════════════════════
    // 11. MÓDULO NOTIFICACIONES
    // ════════════════════════════════════════════════════
    console.log('\n📋 [11] Módulo Notificaciones...');

    await client.query(`
      CREATE OR REPLACE FUNCTION generar_codigo_notificacion()
      RETURNS varchar LANGUAGE plpgsql AS $$
      DECLARE v_anio integer := EXTRACT(YEAR FROM CURRENT_DATE); v_ultimo varchar; v_num integer;
      BEGIN
        SELECT codigo INTO v_ultimo FROM notificacion_institucional
         WHERE codigo LIKE 'NOTIF-' || v_anio || '-%' ORDER BY codigo DESC LIMIT 1;
        v_num := CASE WHEN v_ultimo IS NULL THEN 1 ELSE CAST(SPLIT_PART(v_ultimo,'-',3) AS integer) + 1 END;
        RETURN 'NOTIF-' || v_anio || '-' || LPAD(v_num::text,6,'0');
      END; $$;
    `);
    console.log('   ✅ generar_codigo_notificacion');

    // ════════════════════════════════════════════════════
    // 12. MÓDULO SEGUIMIENTO PEDAGÓGICO
    // ════════════════════════════════════════════════════
    console.log('\n📋 [12] Módulo Seguimiento Pedagógico...');

    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_historial_observacion()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.visible_para_padre IS DISTINCT FROM NEW.visible_para_padre THEN
          INSERT INTO observacion_pedagogica_historial (observacion_pedagogica_id, campo_modificado, valor_anterior, valor_nuevo, usuario_id, comentario)
          VALUES (NEW.id, 'visible_para_padre', OLD.visible_para_padre::text, NEW.visible_para_padre::text, NEW.publicado_por,
            CASE WHEN NEW.visible_para_padre THEN 'Observación publicada al padre' ELSE 'Observación ocultada al padre' END);
        END IF;
        IF OLD.nivel_relevancia IS DISTINCT FROM NEW.nivel_relevancia THEN
          INSERT INTO observacion_pedagogica_historial (observacion_pedagogica_id, campo_modificado, valor_anterior, valor_nuevo)
          VALUES (NEW.id, 'nivel_relevancia', OLD.nivel_relevancia, NEW.nivel_relevancia);
        END IF;
        IF OLD.descripcion IS DISTINCT FROM NEW.descripcion THEN
          INSERT INTO observacion_pedagogica_historial (observacion_pedagogica_id, campo_modificado, valor_anterior, valor_nuevo, comentario)
          VALUES (NEW.id, 'descripcion', LEFT(OLD.descripcion,200), LEFT(NEW.descripcion,200), 'Descripción editada');
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_historial_observacion ON observacion_pedagogica;
      CREATE TRIGGER trg_historial_observacion
        AFTER UPDATE ON observacion_pedagogica
        FOR EACH ROW EXECUTE FUNCTION registrar_historial_observacion();
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION registrar_fecha_publicacion_obs()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.visible_para_padre = true AND (OLD.visible_para_padre = false OR OLD.visible_para_padre IS NULL) THEN
          NEW.fecha_publicacion = CURRENT_TIMESTAMP;
        END IF;
        IF NEW.visible_para_padre = false AND OLD.visible_para_padre = true THEN
          NEW.fecha_publicacion = NULL;
        END IF;
        RETURN NEW;
      END; $$;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trg_fecha_publicacion_obs ON observacion_pedagogica;
      CREATE TRIGGER trg_fecha_publicacion_obs
        BEFORE UPDATE ON observacion_pedagogica
        FOR EACH ROW EXECUTE FUNCTION registrar_fecha_publicacion_obs();
    `);
    console.log('   ✅ trg_historial_observacion, trg_fecha_publicacion_obs');

    await client.query(`
      CREATE OR REPLACE FUNCTION linea_tiempo_observaciones(
        p_matricula_id integer, p_periodo_academico_id integer DEFAULT NULL,
        p_categoria_id integer DEFAULT NULL, p_nivel_relevancia varchar DEFAULT NULL,
        p_solo_visibles_padre boolean DEFAULT false
      )
      RETURNS TABLE(
        observacion_id integer, codigo_observacion varchar, fecha_ocurrencia date,
        categoria_nombre varchar, categoria_color varchar, nivel_relevancia varchar,
        descripcion text, materia_nombre varchar, docente_nombres varchar,
        visible_para_padre boolean, fecha_publicacion timestamp,
        acuse_leido boolean, fecha_lectura timestamp, comentario_padre text
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT op.id::integer, op.codigo_observacion::varchar, op.fecha_ocurrencia::date,
          co.nombre::varchar, co.color::varchar, op.nivel_relevancia::varchar, op.descripcion::text,
          m.nombre::varchar, (d.nombres || ' ' || d.apellido_paterno)::varchar,
          op.visible_para_padre::boolean, op.fecha_publicacion::timestamp,
          (arp.id IS NOT NULL)::boolean, arp.fecha_lectura::timestamp, arp.comentario_padre::text
        FROM observacion_pedagogica op
        INNER JOIN categoria_observacion co ON op.categoria_observacion_id = co.id
        INNER JOIN docente d                ON op.docente_id = d.id
        LEFT JOIN asignacion_docente ad     ON op.asignacion_docente_id = ad.id
        LEFT JOIN grado_materia gm          ON ad.grado_materia_id = gm.id
        LEFT JOIN materia m                 ON gm.materia_id = m.id
        LEFT JOIN acuse_recibo_padre arp    ON op.id = arp.observacion_pedagogica_id
        LEFT JOIN estudiante_tutor et       ON et.estudiante_id = (SELECT estudiante_id FROM matricula WHERE id = p_matricula_id)
                                           AND et.padre_familia_id = arp.padre_familia_id
        WHERE op.matricula_id = p_matricula_id AND op.activo = true AND op.deleted_at IS NULL
          AND (p_periodo_academico_id IS NULL OR op.periodo_academico_id = p_periodo_academico_id)
          AND (p_categoria_id IS NULL OR op.categoria_observacion_id = p_categoria_id)
          AND (p_nivel_relevancia IS NULL OR op.nivel_relevancia = p_nivel_relevancia)
          AND (NOT p_solo_visibles_padre OR op.visible_para_padre = true)
        ORDER BY op.fecha_ocurrencia DESC, op.created_at DESC;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_observaciones_padre(
        p_padre_familia_id integer, p_periodo_academico_id integer DEFAULT NULL
      )
      RETURNS TABLE(
        estudiante_id integer, estudiante_nombres varchar, estudiante_apellidos varchar,
        estudiante_codigo varchar, total_observaciones bigint, informativos bigint,
        requieren_atencion bigint, urgentes bigint, no_leidos bigint, ultima_observacion date
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT e.id::integer, e.nombres::varchar, e.apellidos::varchar, e.codigo::varchar,
          COUNT(op.id),
          COUNT(CASE WHEN op.nivel_relevancia = 'informativo'       THEN 1 END),
          COUNT(CASE WHEN op.nivel_relevancia = 'requiere_atencion' THEN 1 END),
          COUNT(CASE WHEN op.nivel_relevancia = 'urgente'           THEN 1 END),
          COUNT(CASE WHEN arp.id IS NULL THEN 1 END),
          MAX(op.fecha_ocurrencia)
        FROM estudiante_tutor et
        INNER JOIN estudiante e    ON et.estudiante_id = e.id
        INNER JOIN matricula mat_e ON mat_e.estudiante_id = e.id AND mat_e.deleted_at IS NULL AND mat_e.estado = 'activo'
        INNER JOIN observacion_pedagogica op ON op.matricula_id = mat_e.id AND op.visible_para_padre = true AND op.activo = true AND op.deleted_at IS NULL
        LEFT JOIN acuse_recibo_padre arp ON arp.observacion_pedagogica_id = op.id AND arp.padre_familia_id = p_padre_familia_id
        WHERE et.padre_familia_id = p_padre_familia_id AND et.recibe_notificaciones = true
          AND (p_periodo_academico_id IS NULL OR op.periodo_academico_id = p_periodo_academico_id)
        GROUP BY e.id, e.nombres, e.apellidos, e.codigo
        ORDER BY COUNT(CASE WHEN arp.id IS NULL THEN 1 END) DESC, e.apellidos;
      END; $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_obs_por_asignacion(
        p_asignacion_docente_id integer, p_periodo_academico_id integer DEFAULT NULL
      )
      RETURNS TABLE(
        matricula_id integer, estudiante_nombres varchar, estudiante_apellidos varchar,
        estudiante_codigo varchar, total_obs bigint, informativos bigint,
        requieren_atencion bigint, urgentes bigint, visibles_padre bigint,
        no_acusados bigint, ultima_obs_fecha date
      ) LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT m.id::integer, e.nombres::varchar, e.apellidos::varchar, e.codigo::varchar,
          COUNT(op.id),
          COUNT(CASE WHEN op.nivel_relevancia = 'informativo'       THEN 1 END),
          COUNT(CASE WHEN op.nivel_relevancia = 'requiere_atencion' THEN 1 END),
          COUNT(CASE WHEN op.nivel_relevancia = 'urgente'           THEN 1 END),
          COUNT(CASE WHEN op.visible_para_padre = true              THEN 1 END),
          COUNT(CASE WHEN op.visible_para_padre = true AND arp.id IS NULL THEN 1 END),
          MAX(op.fecha_ocurrencia)
        FROM asignacion_docente ad
        INNER JOIN matricula m  ON m.paralelo_id = ad.paralelo_id AND m.periodo_academico_id = ad.periodo_academico_id AND m.estado = 'activo' AND m.deleted_at IS NULL
        INNER JOIN estudiante e ON e.id = m.estudiante_id
        LEFT JOIN observacion_pedagogica op ON op.matricula_id = m.id AND op.asignacion_docente_id = ad.id AND op.activo = true AND op.deleted_at IS NULL
          AND (p_periodo_academico_id IS NULL OR op.periodo_academico_id = p_periodo_academico_id)
        LEFT JOIN acuse_recibo_padre arp ON arp.observacion_pedagogica_id = op.id
        WHERE ad.id = p_asignacion_docente_id
        GROUP BY m.id, e.nombres, e.apellidos, e.codigo ORDER BY e.apellidos, e.nombres;
      END; $$;
    `);
    console.log('   ✅ linea_tiempo_observaciones, resumen_observaciones_padre, resumen_obs_por_asignacion');

    // ════════════════════════════════════════════════════
    // 13. VISTAS
    // ════════════════════════════════════════════════════
    console.log('\n📋 [13] Vistas...');

    await client.query(`
      CREATE OR REPLACE VIEW v_ingresos_consolidados AS
      SELECT i.id, i.codigo_ingreso, ti.nombre AS tipo_ingreso, ti.categoria,
        i.fecha_ingreso, pa.nombre AS periodo,
        e.codigo AS codigo_estudiante, e.nombres || ' ' || e.apellidos AS estudiante,
        i.monto, i.descuento, i.recargo, i.monto_neto, i.metodo_pago,
        i.estado, u.username AS registrado_por
      FROM ingreso i
      JOIN tipo_ingreso ti        ON i.tipo_ingreso_id = ti.id
      LEFT JOIN periodo_academico pa ON i.periodo_academico_id = pa.id
      LEFT JOIN estudiante e         ON i.estudiante_id = e.id
      LEFT JOIN usuarios u           ON i.registrado_por = u.id
      WHERE NOT i.anulado ORDER BY i.fecha_ingreso DESC;
    `);

    await client.query(`
      CREATE OR REPLACE VIEW v_ingresos_por_categoria AS
      SELECT ti.categoria, ti.nombre AS tipo_ingreso,
        COUNT(i.id) AS cantidad, SUM(i.monto_neto) AS total_ingresos,
        DATE_TRUNC('month', i.fecha_ingreso) AS mes
      FROM ingreso i JOIN tipo_ingreso ti ON i.tipo_ingreso_id = ti.id
      WHERE NOT i.anulado
      GROUP BY ti.categoria, ti.nombre, DATE_TRUNC('month', i.fecha_ingreso)
      ORDER BY mes DESC, total_ingresos DESC;
    `);

    await client.query(`
      CREATE OR REPLACE VIEW vista_evaluaciones_con_tema AS
      SELECT e.id AS evaluacion_id, e.nombre AS evaluacion_nombre, e.tipo, e.fecha,
        e.puntaje_maximo, e.peso_en_dimension, e.visible_para_padres, e.activo,
        de.id AS dimension_id, de.nombre AS dimension_nombre, de.codigo AS dimension_codigo, de.color AS dimension_color,
        pe.id AS periodo_evaluacion_id, pe.nombre AS periodo_nombre, pe.orden AS periodo_orden,
        t.id AS tema_id, t.titulo AS tema_titulo, t.numero_tema, t.nivel_dificultad,
        u.id AS unidad_id, u.titulo AS unidad_titulo, u.numero_unidad,
        e.asignacion_docente_id
      FROM evaluacion e
      INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
      INNER JOIN periodo_evaluacion pe   ON e.periodo_evaluacion_id   = pe.id
      LEFT JOIN tema t                   ON e.tema_id = t.id
      LEFT JOIN unidad_tematica u        ON t.unidad_tematica_id = u.id;
    `);
    console.log('   ✅ v_ingresos_consolidados, v_ingresos_por_categoria, vista_evaluaciones_con_tema');

    // ════════════════════════════════════════════════════
    // 14. ÍNDICES ADICIONALES
    // ════════════════════════════════════════════════════
    console.log('\n📋 [14] Índices adicionales...');

    const indices = [
      `CREATE INDEX IF NOT EXISTS idx_backup_creado_por       ON backup_registro(creado_por)`,
      `CREATE INDEX IF NOT EXISTS idx_backup_status            ON backup_registro(status)`,
      `CREATE INDEX IF NOT EXISTS idx_backup_created_at        ON backup_registro(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_backup_activos            ON backup_registro(deleted_at) WHERE deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_bloque_horario_turno     ON bloque_horario(turno_id)`,
      `CREATE INDEX IF NOT EXISTS idx_horario_paralelo          ON horario(paralelo_id)`,
      `CREATE INDEX IF NOT EXISTS idx_horario_periodo           ON horario(periodo_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_horario_estado            ON horario(estado)`,
      `CREATE INDEX IF NOT EXISTS idx_horario_detalle_horario   ON horario_detalle(horario_id)`,
      `CREATE INDEX IF NOT EXISTS idx_horario_detalle_asignacion ON horario_detalle(asignacion_docente_id) WHERE asignacion_docente_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_horario_detalle_gm        ON horario_detalle(grado_materia_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_no_conflicto_docente ON horario_detalle(asignacion_docente_id, dia_semana, bloque_horario_id) WHERE activo = true AND asignacion_docente_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_unidad_grado_materia      ON unidad_tematica(grado_materia_id)`,
      `CREATE INDEX IF NOT EXISTS idx_unidad_periodo             ON unidad_tematica(periodo_evaluacion_id) WHERE periodo_evaluacion_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_tema_unidad               ON tema(unidad_tematica_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tema_palabras_clave        ON tema USING GIN(palabras_clave)`,
      `CREATE INDEX IF NOT EXISTS idx_material_asignacion        ON material_academico(asignacion_docente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_material_activo            ON material_academico(activo, deleted_at) WHERE activo = true AND deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_material_busqueda_texto    ON material_academico USING GIN(to_tsvector('spanish', COALESCE(titulo,'') || ' ' || COALESCE(descripcion,'') || ' ' || COALESCE(nombre_archivo,'')))`,
      `CREATE INDEX IF NOT EXISTS idx_tema_busqueda_texto        ON tema USING GIN(to_tsvector('spanish', COALESCE(titulo,'') || ' ' || COALESCE(descripcion,'') || ' ' || COALESCE(contenido,'')))`,
      `CREATE INDEX IF NOT EXISTS idx_acceso_material            ON acceso_material(material_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_acceso_matricula           ON acceso_material(matricula_id) WHERE matricula_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_favorito_material          ON favorito_material(material_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_favorito_matricula         ON favorito_material(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_progreso_matricula         ON progreso_estudiante(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_progreso_tema              ON progreso_estudiante(tema_id)`,
      `CREATE INDEX IF NOT EXISTS idx_mae_matricula              ON material_asignado_estudiante(matricula_id) WHERE activo = true`,
      `CREATE INDEX IF NOT EXISTS idx_mae_asignacion             ON material_asignado_estudiante(asignacion_docente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_mae_material               ON material_asignado_estudiante(material_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_mae_no_visto               ON material_asignado_estudiante(matricula_id, visto_por_estudiante) WHERE activo = true AND visto_por_estudiante = false`,
      `CREATE INDEX IF NOT EXISTS idx_asistencia_matricula       ON asistencia(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_asistencia_asignacion      ON asistencia(asignacion_docente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_asistencia_fecha           ON asistencia(fecha)`,
      `CREATE INDEX IF NOT EXISTS idx_asistencia_estado          ON asistencia(estado)`,
      `CREATE INDEX IF NOT EXISTS idx_solicitud_permiso_est      ON solicitud_permiso(estudiante_id)`,
      `CREATE INDEX IF NOT EXISTS idx_solicitud_permiso_fecha    ON solicitud_permiso(fecha_ausencia)`,
      `CREATE INDEX IF NOT EXISTS idx_evaluacion_asignacion      ON evaluacion(asignacion_docente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_evaluacion_dimension       ON evaluacion(dimension_evaluacion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_evaluacion_periodo         ON evaluacion(periodo_evaluacion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_evaluacion_tema            ON evaluacion(tema_id) WHERE tema_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_calificacion_evaluacion    ON calificacion(evaluacion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_calificacion_matricula     ON calificacion(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nota_dimension_matricula   ON nota_dimension(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_nota_dimension_gm          ON nota_dimension(grado_materia_id)`,
      `CREATE INDEX IF NOT EXISTS idx_calificacion_periodo_mat   ON calificacion_periodo(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_calificacion_periodo_gm    ON calificacion_periodo(grado_materia_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_inst_estado          ON notificacion_institucional(estado)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_inst_tipo            ON notificacion_institucional(tipo)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_inst_creada_por      ON notificacion_institucional(creada_por)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_inst_programada      ON notificacion_institucional(programada_para) WHERE programada_para IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_notif_dest_notif           ON notificacion_destinatario(notificacion_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_dest_usuario         ON notificacion_destinatario(usuario_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_dest_leido           ON notificacion_destinatario(usuario_id, leido) WHERE canal = 'interno'`,
      `CREATE INDEX IF NOT EXISTS idx_notif_dest_estado          ON notificacion_destinatario(estado_envio)`,
      `CREATE INDEX IF NOT EXISTS idx_asignacion_trans_est       ON asignacion_transporte(estudiante_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pago_trans_asignacion      ON pago_transporte(asignacion_transporte_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pago_trans_estado          ON pago_transporte(estado)`,
      `CREATE INDEX IF NOT EXISTS idx_ingreso_tipo               ON ingreso(tipo_ingreso_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ingreso_fecha              ON ingreso(fecha_ingreso)`,
      `CREATE INDEX IF NOT EXISTS idx_ingreso_estudiante         ON ingreso(estudiante_id) WHERE estudiante_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_ingreso_ref                ON ingreso(referencia_tipo, referencia_id) WHERE referencia_tipo IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_matricula          ON observacion_pedagogica(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_docente            ON observacion_pedagogica(docente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_periodo            ON observacion_pedagogica(periodo_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_visible            ON observacion_pedagogica(visible_para_padre) WHERE visible_para_padre = true`,
      `CREATE INDEX IF NOT EXISTS idx_obs_ped_padre_panel        ON observacion_pedagogica(matricula_id, visible_para_padre, periodo_academico_id) WHERE activo = true AND deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_obs_hist_observacion       ON observacion_pedagogica_historial(observacion_pedagogica_id)`,
      `CREATE INDEX IF NOT EXISTS idx_acuse_observacion          ON acuse_recibo_padre(observacion_pedagogica_id)`,
      `CREATE INDEX IF NOT EXISTS idx_acuse_padre               ON acuse_recibo_padre(padre_familia_id)`,
      `CREATE INDEX IF NOT EXISTS idx_plantilla_categoria        ON plantilla_observacion(categoria_observacion_id)`,
    ];

    let idxOk = 0;
    for (const idx of indices) {
      try { await client.query(idx); idxOk++; } catch (_) { /* tabla aún no existe o índice ya existe */ }
    }
    console.log(`   ✅ ${idxOk}/${indices.length} índices creados`);

    await client.query('COMMIT');

    console.log('\n══════════════════════════════════════════════');
    console.log('✅ MIGRACIÓN COMPLETA');
    console.log('══════════════════════════════════════════════');
    console.log(`\n  Triggers updated_at : ${updatedAtTriggers.length}`);
    console.log('  Triggers de lógica  : 13 (mensualidades, transporte, materiales, asistencia, pedagógico)');
    console.log('  Stored procedures   : 28 funciones');
    console.log('  Vistas              : 3');
    console.log(`  Índices             : ${idxOk}\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error — se hizo ROLLBACK');
    console.error('   Detalle:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();