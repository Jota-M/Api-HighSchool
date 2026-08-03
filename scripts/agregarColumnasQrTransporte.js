import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(resolve => rl.question(q, resolve)); }

async function agregarColumnasQrTransporte() {
    const client = await pool.connect();
    try {
        console.log('\n🔧 Agregando columnas QR a pago_transporte (mismo patrón que pago_mensualidad)...');
        const confirm = await ask('¿Continuar? (SI para confirmar): ');
        if (confirm !== 'SI') {
            console.log('❌ Cancelado.');
            process.exit(0);
        }

        await client.query('BEGIN');

        await client.query(`
      ALTER TABLE pago_transporte
        ADD COLUMN IF NOT EXISTS qr_data VARCHAR(150),
        ADD COLUMN IF NOT EXISTS qr_image_url TEXT,
        ADD COLUMN IF NOT EXISTS qr_expiracion TIMESTAMP,
        ADD COLUMN IF NOT EXISTS qr_estado VARCHAR(20)
          CHECK (qr_estado IN ('generado', 'pagado', 'cancelado')),
        ADD COLUMN IF NOT EXISTS transaccion_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS banco_origen VARCHAR(100),
        ADD COLUMN IF NOT EXISTS numero_referencia VARCHAR(100)
    `);

        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pago_transporte_qr_data
      ON pago_transporte(qr_data)
      WHERE qr_data IS NOT NULL
    `);

        await client.query('COMMIT');
        console.log('✅ Columnas agregadas exitosamente.\n');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('💥 Error:', error.message);
    } finally {
        client.release();
        rl.close();
        process.exit(0);
    }
}

agregarColumnasQrTransporte().catch(err => { console.error(err); process.exit(1); });