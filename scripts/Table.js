import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function seedPaquetesVacacionales() {
  const client = await pool.connect();
  try {
    console.log('\n📦 AGREGAR PAQUETES VACACIONALES Y CAMPOS DE PAGO');
    console.log('Se realizarán los siguientes cambios:');
    console.log('1. Crear tabla paquete_vacacional');
    console.log('2. Insertar 3 paquetes (1, 2 y 3 cursos)');
    console.log('3. Agregar campos a inscripcion_vacacional');
    console.log('4. Crear índice para codigo_grupo\n');

    const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...');

    // 1️⃣ Crear tabla paquete_vacacional
    console.log('📋 Creando tabla paquete_vacacional...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS paquete_vacacional (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        cantidad_cursos INTEGER NOT NULL,
        precio NUMERIC(10,2) NOT NULL,
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla paquete_vacacional creada/verificada');

    // 2️⃣ Insertar paquetes
    console.log('📦 Insertando paquetes...');
    const paquetes = [
      { nombre: 'Paquete 3 Cursos', cantidad: 3, precio: 400.00 },
      { nombre: 'Paquete 2 Cursos', cantidad: 2, precio: 350.00 },
      { nombre: 'Paquete 1 Curso', cantidad: 1, precio: 250.00 }
    ];

    for (const paquete of paquetes) {
      const exists = await client.query(
        `SELECT id FROM paquete_vacacional WHERE cantidad_cursos = $1`,
        [paquete.cantidad]
      );

      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO paquete_vacacional 
           (nombre, cantidad_cursos, precio, activo, created_at, updated_at)
           VALUES ($1, $2, $3, TRUE, NOW(), NOW())`,
          [paquete.nombre, paquete.cantidad, paquete.precio]
        );
        console.log(`  ✓ ${paquete.nombre} - ${paquete.precio} Bs`);
      } else {
        console.log(`  ⚠️ ${paquete.nombre} ya existe`);
      }
    }

    // 3️⃣ Modificar tabla inscripcion_vacacional
    console.log('🔧 Modificando tabla inscripcion_vacacional...');

    // paquete_id
    const paqueteIdCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inscripcion_vacacional'
      AND column_name = 'paquete_id'
    `);

    if (paqueteIdCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE inscripcion_vacacional
        ADD COLUMN paquete_id INTEGER REFERENCES paquete_vacacional(id)
      `);
      console.log('  ✓ Columna paquete_id agregada');
    } else {
      console.log('  ⚠️ Columna paquete_id ya existe');
    }

    // codigo_grupo
    const codigoGrupoCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inscripcion_vacacional'
      AND column_name = 'codigo_grupo'
    `);

    if (codigoGrupoCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE inscripcion_vacacional
        ADD COLUMN codigo_grupo VARCHAR(50)
      `);
      console.log('  ✓ Columna codigo_grupo agregada');
    } else {
      console.log('  ⚠️ Columna codigo_grupo ya existe');
    }

    // metodo_pago
    const metodoPagoCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inscripcion_vacacional'
      AND column_name = 'metodo_pago'
    `);

    if (metodoPagoCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE inscripcion_vacacional
        ADD COLUMN metodo_pago VARCHAR(20) DEFAULT 'transferencia',
        ADD CONSTRAINT chk_metodo_pago
          CHECK (metodo_pago IN ('transferencia', 'efectivo', 'qr', 'tarjeta'))
      `);
      console.log('  ✓ Columna metodo_pago agregada');
    } else {
      console.log('  ⚠️ Columna metodo_pago ya existe');
    }

    // recibo_interno
    const reciboCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inscripcion_vacacional'
      AND column_name = 'recibo_interno'
    `);

    if (reciboCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE inscripcion_vacacional
        ADD COLUMN recibo_interno VARCHAR(50)
      `);
      console.log('  ✓ Columna recibo_interno agregada');
    } else {
      console.log('  ⚠️ Columna recibo_interno ya existe');
    }

    // observaciones_pago
    const observacionesCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inscripcion_vacacional'
      AND column_name = 'observaciones_pago'
    `);

    if (observacionesCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE inscripcion_vacacional
        ADD COLUMN observaciones_pago TEXT
      `);
      console.log('  ✓ Columna observaciones_pago agregada');
    } else {
      console.log('  ⚠️ Columna observaciones_pago ya existe');
    }

    // 4️⃣ Crear índice
    console.log('📇 Creando índice...');
    const indexCheck = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'inscripcion_vacacional'
      AND indexname = 'idx_inscripcion_codigo_grupo'
    `);

    if (indexCheck.rows.length === 0) {
      await client.query(`
        CREATE INDEX idx_inscripcion_codigo_grupo
        ON inscripcion_vacacional(codigo_grupo)
      `);
      console.log('  ✓ Índice idx_inscripcion_codigo_grupo creado');
    } else {
      console.log('  ⚠️ Índice ya existe');
    }

    await client.query('COMMIT');

    console.log('\n✅ ¡Seed ejecutado con éxito!');
    console.log('🎯 Paquetes vacacionales y sistema de pagos listos.');

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

seedPaquetesVacacionales().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
