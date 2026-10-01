/**
 * actualizarPagoAnual.js
 * ---------------------------------------------------------------
 * Script puntual: reemplaza la función registrar_pago_anual_completo
 * en la BD con la versión correcta que usa la tabla pago_anual_completo.
 *
 * Comportamiento:
 *   - Acepta que el padre haya pagado N cuotas mensualmente antes.
 *   - El descuento 10% se calcula sobre el TOTAL anual (10 meses).
 *   - El monto esperado = (total x 90%) - ya_pagado.
 *   - Inserta en pago_anual_completo y actualiza las cuotas pendientes a 'pagado'.
 *
 * Uso:
 *   node --env-file .env ./scripts/actualizarPagoAnual.js
 * ---------------------------------------------------------------
 */

import { pool } from '../src/db/pool.js';

const SQL = `
  CREATE OR REPLACE FUNCTION registrar_pago_anual_completo(
    p_matricula_id       INTEGER,
    p_monto_pagado       NUMERIC,
    p_metodo_pago        VARCHAR,
    p_registrado_por     INTEGER,
    p_numero_comprobante VARCHAR DEFAULT NULL,
    p_entrego_factura    BOOLEAN DEFAULT false,
    p_numero_factura     VARCHAR DEFAULT NULL,
    p_observaciones      TEXT DEFAULT NULL
  )
  RETURNS INTEGER AS $$
  DECLARE
    v_codigo_pago               VARCHAR(50);
    v_monto_total_sin_descuento NUMERIC(10,2);
    v_monto_total_con_beca      NUMERIC(10,2);
    v_monto_beca_total          NUMERIC(10,2);
    v_descuento_porcentaje      NUMERIC(5,2);
    v_monto_descuento           NUMERIC(10,2);
    v_monto_esperado            NUMERIC(10,2);
    v_pago_id                   INTEGER;
    v_cantidad_pendientes       INTEGER;
    v_cantidad_pagadas          INTEGER;
    v_total_cuotas              INTEGER;
    v_ya_pagado                 NUMERIC(10,2);
  BEGIN
    -- Contar cuotas pendientes/vencidas y ya pagadas por separado
    SELECT COUNT(*) INTO v_cantidad_pendientes
      FROM mensualidad
     WHERE matricula_id = p_matricula_id
       AND estado IN ('pendiente', 'parcial', 'vencido');

    SELECT COUNT(*) INTO v_cantidad_pagadas
      FROM mensualidad
     WHERE matricula_id = p_matricula_id
       AND estado = 'pagado';

    v_total_cuotas := v_cantidad_pendientes + v_cantidad_pagadas;

    -- El total de cuotas activas (pagadas + pendientes) debe ser exactamente 10
    IF v_total_cuotas != 10 THEN
      RAISE EXCEPTION 'Se necesitan 10 cuotas en total (pagadas + pendientes), pero hay % cuotas registradas', v_total_cuotas;
    END IF;

    IF v_cantidad_pendientes = 0 THEN
      RAISE EXCEPTION 'Todas las cuotas ya están pagadas, no es necesario un pago anual';
    END IF;

    -- Obtener porcentaje de descuento (10% por defecto = 1 mes gratis)
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

    -- Calcular el TOTAL ANUAL COMPLETO sobre las 10 cuotas (pagadas + pendientes)
    SELECT 
      SUM(monto_original),
      SUM(monto_final),
      SUM(monto_beca)
    INTO 
      v_monto_total_sin_descuento,
      v_monto_total_con_beca,
      v_monto_beca_total
      FROM mensualidad
     WHERE matricula_id = p_matricula_id
       AND estado IN ('pendiente', 'parcial', 'vencido', 'pagado');

    -- Descuento se aplica sobre el TOTAL ANUAL de 10 meses (no solo los pendientes)
    v_monto_descuento := ROUND((v_monto_total_con_beca * v_descuento_porcentaje / 100), 2);

    -- Sumar lo que el padre ya pagó en cuotas mensuales anteriores
    SELECT COALESCE(SUM(pm.monto_pagado), 0) INTO v_ya_pagado
      FROM pago_mensualidad pm
      INNER JOIN mensualidad m ON pm.mensualidad_id = m.id
     WHERE m.matricula_id = p_matricula_id
       AND NOT pm.anulado;

    -- Monto esperado = total anual con descuento - lo que ya pagó mensualmente
    v_monto_esperado := v_monto_total_con_beca - v_monto_descuento - v_ya_pagado;

    -- Validar monto (permitir 1 Bs de diferencia por redondeos)
    IF ABS(p_monto_pagado - v_monto_esperado) > 1.00 THEN
      RAISE EXCEPTION 'Monto incorrecto. Esperado: Bs % (Total anual: Bs %, Descuento %: Bs %, Ya pagado antes: Bs %)', 
        v_monto_esperado, v_monto_total_con_beca, v_descuento_porcentaje, v_monto_descuento, v_ya_pagado;
    END IF;

    -- Generar código único para el pago anual
    v_codigo_pago := 'ANUAL-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                    LPAD(NEXTVAL('pago_anual_completo_id_seq')::TEXT, 5, '0');

    -- Registrar el pago anual en pago_anual_completo
    INSERT INTO pago_anual_completo (
      codigo_pago, matricula_id, monto_total_sin_descuento, monto_descuento,
      monto_beca_total, monto_pagado, metodo_pago, numero_comprobante, 
      entrego_factura, numero_factura, registrado_por, observaciones
    ) VALUES (
      v_codigo_pago, p_matricula_id, v_monto_total_sin_descuento, v_monto_descuento,
      v_monto_beca_total, p_monto_pagado, p_metodo_pago, p_numero_comprobante, 
      p_entrego_factura, p_numero_factura, p_registrado_por, 
      COALESCE(
        p_observaciones,
        'Pago anual completo - ' || v_descuento_porcentaje || '% descuento' ||
        CASE WHEN v_cantidad_pagadas > 0 
          THEN ' (completado: ' || v_cantidad_pagadas || ' cuota(s) pagada(s) mensualmente antes)'
          ELSE ''
        END
      )
    ) RETURNING id INTO v_pago_id;

    -- Marcar solo las cuotas PENDIENTES/PARCIALES/VENCIDAS como pagadas
    UPDATE mensualidad
       SET estado = 'pagado', updated_at = CURRENT_TIMESTAMP
     WHERE matricula_id = p_matricula_id
       AND estado IN ('pendiente', 'parcial', 'vencido');

    RETURN v_pago_id;
  END;
  $$ LANGUAGE plpgsql;
`;

async function main() {
  const client = await pool.connect();
  try {
    console.log('');
    console.log('🔄 Actualizando funcion registrar_pago_anual_completo...');
    console.log('');

    await client.query(SQL);

    console.log('✅ Funcion actualizada correctamente en la BD.\n');
    console.log('Cambios aplicados:');
    console.log('  • Acepta que el padre haya pagado N cuotas mensualmente antes');
    console.log('  • Descuento 10% calculado sobre el TOTAL ANUAL (10 meses)');
    console.log('  • Monto esperado = (total x 90%) - ya_pagado_previamente');
    console.log('  • Guarda en la tabla nativa pago_anual_completo');
    console.log('  • Solo marca como pagadas las cuotas que estaban pendientes');
    console.log('');
  } catch (err) {
    console.error('❌ Error al actualizar la funcion:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
