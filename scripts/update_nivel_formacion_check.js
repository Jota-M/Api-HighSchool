// scripts/update_nivel_formacion_check.js
import { pool } from '../src/db/pool.js';

async function updateCheck() {
  const client = await pool.connect();
  try {
    console.log('🔄 Actualizando restricción de nivel_formacion en tabla docente...');

    await client.query(`
      ALTER TABLE docente DROP CONSTRAINT IF EXISTS docente_nivel_formacion_check;
      
      ALTER TABLE docente ADD CONSTRAINT docente_nivel_formacion_check 
      CHECK (nivel_formacion::text = ANY (ARRAY[
        'bachiller'::text,
        'tecnico'::text,
        'tecnico_medio'::text,
        'tecnico_superior'::text,
        'licenciatura'::text,
        'diplomado'::text,
        'especialidad'::text,
        'maestria'::text,
        'doctorado'::text
      ]));
    `);

    console.log('✅ Restricción docente_nivel_formacion_check actualizada exitosamente.');
  } catch (err) {
    console.error('❌ Error actualizando restricción:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

updateCheck();
