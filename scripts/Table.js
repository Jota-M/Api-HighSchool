import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function insertMateria() {
  const client = await pool.connect();
  try {
    console.log('\n📌 INSERTAR ÁREA Y MATERIA');
    console.log('Se creará (si no existe) el área "Ciencias"');
    console.log('Luego se insertará la materia "Química" asignada a esa área.\n');

    const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se insertó nada.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...');

    // 1️⃣ Crear área si no existe
    const existingArea = await client.query(
      `SELECT id FROM area_conocimiento WHERE nombre = 'Ciencias'`
    );

    let areaId;

    if (existingArea.rows.length > 0) {
      areaId = existingArea.rows[0].id;
      console.log(`🔎 Área ya existente — id = ${areaId}`);
    } else {
      const insertedArea = await client.query(
        `INSERT INTO area_conocimiento (nombre, descripcion, color, orden, created_at)
         VALUES ('Ciencias', 'Área relacionada a Química, Física y Biología', '#0088FF', 1, NOW())
         RETURNING id`
      );
      areaId = insertedArea.rows[0].id;
      console.log(`🆕 Área creada — id = ${areaId}`);
    }

    // 2️⃣ Insertar materia (si no existe)
    const existingMateria = await client.query(
      `SELECT id FROM materia WHERE codigo = 'COQUI'`
    );

    if (existingMateria.rows.length > 0) {
      console.log('⚠️ La materia con código "COQUI" ya existe — no se volverá a crear.');
    } else {
      await client.query(
        `INSERT INTO materia (
          area_conocimiento_id,
          codigo,
          nombre,
          descripcion,
          horas_semanales,
          creditos,
          es_obligatoria,
          tiene_laboratorio,
          color,
          activo,
          created_at,
          updated_at
        ) VALUES (
          $1, 'CO0QUI', 'Quimica', '', 0, NULL, TRUE, FALSE, NULL, TRUE, NOW(), NOW()
        )`,
        [areaId]
      );
      console.log('🧪 Materia "Química" creada correctamente.');
    }

    await client.query('COMMIT');

    console.log('\n✅ Operación completada con éxito.');
    console.log('🎯 Área vinculada a la materia correctamente.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error en la operación:', error.message);
  } finally {
    client.release();
    rl.close();
    process.exit(0);
  }
}

insertMateria().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
