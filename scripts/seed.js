import { pool } from '../src/db/pool.js';

async function createTables() {
  try {
    await pool.query(`
      -- Tabla: Estudiante
      CREATE TABLE IF NOT EXISTS estudiante (
        id SERIAL PRIMARY KEY,
        nombres VARCHAR(100) NOT NULL,
        apellido_paterno VARCHAR(100) NOT NULL,
        apellido_materno VARCHAR(100),
        ci VARCHAR(20) UNIQUE NOT NULL,
        fecha_nacimiento DATE,
        genero VARCHAR(20),
        nacionalidad VARCHAR(50),
        institucion_procedencia VARCHAR(150),
        ultimo_grado_cursado VARCHAR(100),
        grado_solicitado VARCHAR(100),
        repite_grado BOOLEAN DEFAULT false,
        turno VARCHAR(50),
        discapacidad BOOLEAN DEFAULT false,
        descripcion_discapacidad TEXT,
        direccion TEXT,
        numero_casa VARCHAR(20),
        departamento VARCHAR(100),
        ciudad VARCHAR(100),
        telefono_domicilio VARCHAR(20),
        telefono_movil VARCHAR(20),
        correo VARCHAR(100)
      );

      -- Tabla: Representante
      CREATE TABLE IF NOT EXISTS representante (
        id SERIAL PRIMARY KEY,
        tipo_representante VARCHAR(50),
        nombres VARCHAR(100) NOT NULL,
        apellido_paterno VARCHAR(100) NOT NULL,
        apellido_materno VARCHAR(100),
        ci VARCHAR(20) UNIQUE NOT NULL,
        fecha_nacimiento DATE,
        genero VARCHAR(20),
        nacionalidad VARCHAR(50),
        profesion VARCHAR(100),
        lugar_trabajo VARCHAR(150),
        telefono VARCHAR(20),
        correo VARCHAR(100)
      );

      -- Tabla: Preinscripción
      CREATE TABLE IF NOT EXISTS preinscripcion (
        id SERIAL PRIMARY KEY,
        estudiante_id INT REFERENCES estudiante(id) ON DELETE CASCADE,
        representante_id INT REFERENCES representante(id) ON DELETE CASCADE,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(50) DEFAULT 'pendiente'
      );

      -- Tabla: Documentos
      CREATE TABLE IF NOT EXISTS documentos (
        id SERIAL PRIMARY KEY,
        preinscripcion_id INT REFERENCES preinscripcion(id) ON DELETE CASCADE,
        cedula_estudiante TEXT,
        certificado_nacimiento TEXT,
        libreta_notas TEXT,
        cedula_representante TEXT,
        fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Tablas creadas correctamente.");
  } catch (err) {
    console.error("❌ Error al crear tablas:", err);
  } finally {
    pool.end();
  }
}

createTables();
