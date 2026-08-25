// scripts/migration_solicitud_factura_grupo.js
// Ejecutar: node scripts/migration_solicitud_factura_grupo.js
//
// Contexto: hoy solicitud_factura tiene un vínculo 1 a 1 duro con
// pago_mensualidad (UNIQUE(pago_mensualidad_id)). Eso obliga a un padre a
// pedir una factura por cada cuota, aunque haya pagado varias en una sola
// transacción (mismo QR, o mismo lote cargado por el admin — ver
// pago_mensualidad.transaccion_id).
//
// Esta migración deja que UNA solicitud cubra VARIAS cuotas:
//   - pago_mensualidad_ids INTEGER[]  → todas las cuotas cubiertas por la solicitud
//   - transaccion_id       VARCHAR    → copia informativa de la transacción de origen
//   - pago_mensualidad_id (columna vieja) se mantiene como "cuota representativa"
//     (siempre pago_mensualidad_ids[1]) para no romper los JOIN existentes que
//     ya la usan para mostrar mes/monto de una cuota.
//
// No se borra ni renombra nada existente — es aditiva y con backfill.
import { pool } from '../src/db/pool.js';

async function migrar() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('\n🧾 MIGRANDO: solicitud_factura → soporte de grupo\n');

    // ─── 1. Columnas nuevas ─────────────────────────────────────────
    await client.query(`
      ALTER TABLE solicitud_factura
        ADD COLUMN IF NOT EXISTS pago_mensualidad_ids INTEGER[] NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS transaccion_id VARCHAR(100)
    `);
    console.log('✅ Columnas pago_mensualidad_ids / transaccion_id agregadas');

    // ─── 2. Backfill de solicitudes existentes ─────────────────────
    // Cada solicitud vieja cubre exactamente su propio pago_mensualidad_id.
    await client.query(`
      UPDATE solicitud_factura
      SET pago_mensualidad_ids = ARRAY[pago_mensualidad_id]
      WHERE pago_mensualidad_ids = '{}'
    `);
    console.log('✅ Backfill de pago_mensualidad_ids completado');

    // Copiamos transaccion_id desde el pago, si lo tiene (informativo —
    // no se usa para validar duplicados, eso lo hace la app).
    await client.query(`
      UPDATE solicitud_factura sf
      SET transaccion_id = pm.transaccion_id
      FROM pago_mensualidad pm
      WHERE sf.pago_mensualidad_id = pm.id
        AND sf.transaccion_id IS NULL
        AND pm.transaccion_id IS NOT NULL
    `);
    console.log('✅ Backfill de transaccion_id completado');

    // ─── 3. Soltar el UNIQUE viejo ──────────────────────────────────
    // Ya no tiene sentido: pago_mensualidad_id pasa a ser solo "la primera
    // cuota del grupo" (representativa), y la prevención de solicitudes
    // duplicadas se hace en la app contra pago_mensualidad_ids (ver
    // SolicitudFactura.findByPago, ahora `$1 = ANY(pago_mensualidad_ids)`).
    await client.query(`
      ALTER TABLE solicitud_factura
        DROP CONSTRAINT IF EXISTS uq_solicitud_factura_pago
    `);
    console.log('✅ Constraint uq_solicitud_factura_pago eliminada');

    // ─── 4. Índice GIN para "¿qué solicitud cubre este pago_id?" ────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_solicitud_factura_pago_ids
      ON solicitud_factura USING GIN (pago_mensualidad_ids)
    `);
    console.log('✅ Índice GIN sobre pago_mensualidad_ids creado');

    await client.query('COMMIT');
    console.log('\n═══════════════════════════════════════');
    console.log('✅ Migración completada correctamente');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrar();