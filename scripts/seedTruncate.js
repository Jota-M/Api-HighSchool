// scripts/truncateEducationTables.mjs
import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function truncateTables() {
  const client = await pool.connect();
  try {
    console.log('\n⚠️  ATENCIÓN — ELIMINARÁS TODOS LOS DATOS DE MATRÍCULA');
    console.log('Tablas afectadas: estudiante, matricula, matricula_documento, padre_familia, estudiante_tutor\n');

    const confirm = await ask('¿Seguro que deseas continuar? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('❌ Cancelado, no se borró nada.');
      process.exit(0);
    }

    await client.query('BEGIN');

    console.log('\n⏳ Limpiando tablas...');

    await client.query(`
      UPDATE matricula 
      SET numero_matricula = 'MAT-GEST-2025-0002' 
      WHERE id = 2;
    `);

    await client.query('COMMIT');

    console.log('\n✅ Tablas truncadas exitosamente.');
    console.log('🧹 Todos los registros eliminados y los IDs reiniciados.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('💥 Error al truncar tablas:', error.message);
  } finally {
    client.release();
    rl.close();
    process.exit(0);
  }
}

truncateTables().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
