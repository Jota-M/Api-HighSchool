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

    // 7️⃣ ROLES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL UNIQUE,
        descripcion TEXT,
        es_sistema BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Tabla roles creada");

    // 8️⃣ PERMISOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permisos (
        id SERIAL PRIMARY KEY,
        modulo VARCHAR(50) NOT NULL,
        accion VARCHAR(50) NOT NULL,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Tabla permisos creada");

    // 9️⃣ ROL_PERMISOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rol_permisos (
        rol_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
        permiso_id INTEGER REFERENCES permisos(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (rol_id, permiso_id)
      );
    `);
    console.log("✅ Tabla rol_permisos creada");

    // 🔟 USUARIOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) UNIQUE,
        password VARCHAR(255) NOT NULL,
        activo BOOLEAN DEFAULT TRUE,
        verificado BOOLEAN DEFAULT FALSE,
        token_verificacion VARCHAR(255),
        token_recuperacion VARCHAR(255),
        token_expiracion TIMESTAMP,
        ultimo_acceso TIMESTAMP,
        intentos_fallidos INTEGER DEFAULT 0,
        bloqueado_hasta TIMESTAMP,
        debe_cambiar_password BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `);
    console.log("✅ Tabla usuarios creada");

    // 1️⃣1️⃣ USUARIO_ROLES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuario_roles (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        asignado_por INTEGER REFERENCES usuarios(id),
        fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (usuario_id, rol_id)
      );
    `);
    console.log("✅ Tabla usuario_roles creada");

    // 1️⃣2️⃣ SESIONES
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sesiones (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        token VARCHAR(500) NOT NULL UNIQUE,
        refresh_token VARCHAR(500),
        ip_address VARCHAR(45),
        user_agent TEXT,
        dispositivo VARCHAR(100),
        ubicacion VARCHAR(200),
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Tabla sesiones creada");

    // 1️⃣3️⃣ ACTIVIDAD_LOG
    await pool.query(`
      CREATE TABLE IF NOT EXISTS actividad_log (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        accion VARCHAR(100) NOT NULL,
        modulo VARCHAR(50) NOT NULL,
        tabla_afectada VARCHAR(50),
        registro_id INTEGER,
        datos_anteriores JSONB,
        datos_nuevos JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        resultado VARCHAR(20) CHECK (resultado IN ('exitoso', 'fallido', 'pendiente')),
        mensaje TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Tabla actividad_log creada");

    console.log("\n🎉 Todas las tablas creadas correctamente.");
  } catch (err) {
    console.error("❌ Error al crear tablas:", err);
  } finally {
    pool.end();
  }
}

createTables();
