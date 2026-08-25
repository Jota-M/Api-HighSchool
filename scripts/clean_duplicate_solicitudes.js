// scripts/clean_duplicate_solicitudes.js
import { pool } from '../src/db/pool.js';

async function limpiarDuplicados() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dupes = await client.query(`
      SELECT transaccion_id, MIN(id) as id_mantener, ARRAY_AGG(id) as todos_ids
      FROM solicitud_factura
      WHERE transaccion_id IS NOT NULL
      GROUP BY transaccion_id
      HAVING COUNT(*) > 1
    `);

    for (const row of dupes.rows) {
      const idsEliminar = row.todos_ids.filter(id => id !== row.id_mantener);

      const pagos = await client.query(
        'SELECT id FROM pago_mensualidad WHERE transaccion_id = $1 AND anulado = false ORDER BY id',
        [row.transaccion_id]
      );
      const pago_ids = pagos.rows.map(p => p.id);

      await client.query(
        'UPDATE solicitud_factura SET pago_mensualidad_ids = $1 WHERE id = $2',
        [pago_ids, row.id_mantener]
      );

      await client.query(
        'DELETE FROM solicitud_factura WHERE id = ANY($1)',
        [idsEliminar]
      );
      console.log(`✅ Consolidado lote ${row.transaccion_id}: mantenida solicitud #${row.id_mantener}, eliminadas: ${idsEliminar.join(', ')}`);
    }

    await client.query('COMMIT');

    const finalRows = await client.query('SELECT id, pago_mensualidad_id, pago_mensualidad_ids, transaccion_id, estado FROM solicitud_factura ORDER BY id');
    console.log('\n📊 Estado final de solicitudes_factura:');
    console.table(finalRows.rows);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error al limpiar duplicados:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

limpiarDuplicados();
