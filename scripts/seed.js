import { pool } from '../src/db/pool.js';

async function createTables() {
  try {
    console.log("🧱 Creando tablas base...");

    // 0️⃣ PERIODO_ACADEMICO (sin dependencias)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS periodo_academico (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        activo BOOLEAN DEFAULT TRUE
      );
    `);
    console.log("✅ Tabla periodo_academico creada");

    // 1️⃣ TURNO (sin dependencias)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS turno (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL UNIQUE,
        hora_inicio TIME NOT NULL,
        hora_fin TIME NOT NULL
      );
    `);
    console.log("✅ Tabla turno creada");

    // 2️⃣ NIVEL_ACADEMICO (sin dependencias)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nivel_academico (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion TEXT,
        orden INTEGER NOT NULL
      );
    `);
    console.log("✅ Tabla nivel_academico creada");

    // 3️⃣ MATERIA (sin dependencias)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS materia (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(20) NOT NULL UNIQUE,
        nombre VARCHAR(150) NOT NULL,
        descripcion TEXT,
        horas_semanales INTEGER,
        es_obligatoria BOOLEAN DEFAULT TRUE
      );
    `);
    console.log("✅ Tabla materia creada");

    // 4️⃣ GRADO (depende de nivel_academico)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grado (
        id SERIAL PRIMARY KEY,
        nivel_academico_id INTEGER NOT NULL REFERENCES nivel_academico(id) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        orden INTEGER NOT NULL,
        UNIQUE(nivel_academico_id, nombre)
      );
    `);
    console.log("✅ Tabla grado creada");

    // 5️⃣ PARALELO (depende de grado y turno)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS paralelo (
        id SERIAL PRIMARY KEY,
        grado_id INTEGER NOT NULL REFERENCES grado(id) ON DELETE CASCADE,
        nombre VARCHAR(10) NOT NULL,
        turno_id INTEGER NOT NULL REFERENCES turno(id) ON DELETE RESTRICT,
        capacidad_maxima INTEGER NOT NULL DEFAULT 30,
        anio INTEGER NOT NULL,
        UNIQUE(grado_id, nombre, turno_id, anio)
      );
    `);
    console.log("✅ Tabla paralelo creada");

    // 6️⃣ GRADO_MATERIA (tabla intermedia: depende de grado y materia)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grado_materia (
        id SERIAL PRIMARY KEY,
        grado_id INTEGER NOT NULL REFERENCES grado(id) ON DELETE CASCADE,
        materia_id INTEGER NOT NULL REFERENCES materia(id) ON DELETE CASCADE,
        orden INTEGER,
        activo BOOLEAN DEFAULT TRUE,
        UNIQUE(grado_id, materia_id)
      );
    `);
    console.log("✅ Tabla grado_materia creada");

    console.log("\n🎉 Todas las tablas creadas correctamente.");
  } catch (err) {
    console.error("❌ Error al crear tablas:", err);
  } finally {
    pool.end();
  }
}

createTables();