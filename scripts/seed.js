import { pool } from '../src/db/pool.js';

async function createTables() {
  try {
    console.log("🧹 Eliminando tablas antiguas...");

    // ==========================================
    // 🔥 DROP TABLES (orden seguro)
    // ==========================================
    // await pool.query(`DROP TABLE IF EXISTS area_conocimiento CASCADE;`);
    // await pool.query(`DROP TABLE IF EXISTS campo_educativo CASCADE;`);
    // await pool.query(`DROP TABLE IF EXISTS campo_area CASCADE;`);
    // await pool.query(`DROP TABLE IF EXISTS materia CASCADE;`);
    // await pool.query(`DROP TABLE IF EXISTS materia_campo CASCADE;`);
    // await pool.query(`DROP TABLE IF EXISTS grado_materia CASCADE;`);
    
    

    // Si existían las antiguas

    console.log("🗑 Tablas antiguas eliminadas");

    // ==========================================
    // Tabla de roles del sistema
    // ==========================================
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rol_permisos (
        rol_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
        permiso_id INTEGER REFERENCES permisos(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (rol_id, permiso_id)
      );
    `);

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

    // ==========================================
    // 📚 MÓDULO ACADÉMICO BASE
    // ==========================================

    // 0️⃣ PERIODO_ACADEMICO
    await pool.query(`
      CREATE TABLE IF NOT EXISTS periodo_academico (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        codigo VARCHAR(20) UNIQUE,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        activo BOOLEAN DEFAULT TRUE,
        permite_inscripciones BOOLEAN DEFAULT TRUE,
        permite_calificaciones BOOLEAN DEFAULT TRUE,
        cerrado BOOLEAN DEFAULT FALSE,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `);

    // 1️⃣ TURNO
    await pool.query(`
      CREATE TABLE IF NOT EXISTS turno (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL UNIQUE,
        codigo VARCHAR(10) UNIQUE,
        hora_inicio TIME NOT NULL,
        hora_fin TIME NOT NULL,
        activo BOOLEAN DEFAULT TRUE,
        color VARCHAR(7),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `);

    // 2️⃣ NIVEL_ACADEMICO
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nivel_academico (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        codigo VARCHAR(20) UNIQUE,
        descripcion TEXT,
        orden INTEGER NOT NULL,
        edad_minima INTEGER,
        edad_maxima INTEGER,
        activo BOOLEAN DEFAULT TRUE,
        color VARCHAR(7),
        icono VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `);

    // 3️⃣ GRADO
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grado (
        id SERIAL PRIMARY KEY,
        nivel_academico_id INTEGER NOT NULL REFERENCES nivel_academico(id) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL,
        codigo VARCHAR(20) UNIQUE,
        descripcion TEXT,
        orden INTEGER NOT NULL,
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        UNIQUE(nivel_academico_id, nombre)
      );
    `);

    // 4️⃣ PARALELO
    await pool.query(`
      CREATE TABLE IF NOT EXISTS paralelo (
        id SERIAL PRIMARY KEY,
        grado_id INTEGER NOT NULL REFERENCES grado(id) ON DELETE CASCADE,
        turno_id INTEGER NOT NULL REFERENCES turno(id) ON DELETE RESTRICT,
        nombre VARCHAR(10) NOT NULL,
        capacidad_maxima INTEGER NOT NULL DEFAULT 30,
        capacidad_minima INTEGER DEFAULT 15,
        anio INTEGER NOT NULL,
        aula VARCHAR(50),
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        UNIQUE(grado_id, nombre, turno_id, anio)
      );
    `);

    // ==========================================
    // 🧠 📚 MÓDULO DE MATERIAS Y PLAN DE ESTUDIOS
    // ==========================================

    // 🔹 ÁREA DE CONOCIMIENTO
    await pool.query(`
      CREATE TABLE IF NOT EXISTS area_conocimiento (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion TEXT,
        color VARCHAR(7),
        orden INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 🔹 CAMPOS EDUCATIVOS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS materia  (
        id SERIAL PRIMARY KEY,
        area_conocimiento_id INTEGER REFERENCES area_conocimiento(id),
        codigo VARCHAR(20) NOT NULL UNIQUE,
        nombre VARCHAR(150) NOT NULL,
        descripcion TEXT,
        horas_semanales INTEGER,
        creditos INTEGER,
        es_obligatoria BOOLEAN DEFAULT TRUE,
        tiene_laboratorio BOOLEAN DEFAULT FALSE,
        color VARCHAR(7),
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `);

    // 🔹 RELACIÓN MUCHOS-MUCHOS ENTRE ÁREA Y CAMPO
    await pool.query(`
      CREATE TABLE IF NOT EXISTS materia_prerequisito  (
        id SERIAL PRIMARY KEY,
        materia_id INTEGER NOT NULL REFERENCES materia(id) ON DELETE CASCADE,
        prerequisito_id INTEGER NOT NULL REFERENCES materia(id) ON DELETE CASCADE,
        UNIQUE(materia_id, prerequisito_id),
        CHECK (materia_id != prerequisito_id)
      );
    `);

    // 🔹 MATERIAS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grado_materia  (
        id SERIAL PRIMARY KEY,
        grado_id INTEGER NOT NULL REFERENCES grado(id) ON DELETE CASCADE,
        materia_id INTEGER NOT NULL REFERENCES materia(id) ON DELETE CASCADE,
        orden INTEGER,
        activo BOOLEAN DEFAULT TRUE,
        nota_minima_aprobacion DECIMAL(5,2) DEFAULT 51.00,
        peso_porcentual DECIMAL(5,2), -- para promedio ponderado
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(grado_id, materia_id)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matricula (
        id SERIAL PRIMARY KEY,
        estudiante_id INTEGER NOT NULL REFERENCES estudiante(id) ON DELETE CASCADE,
        paralelo_id INTEGER NOT NULL REFERENCES paralelo(id) ON DELETE RESTRICT,
        periodo_academico_id INTEGER NOT NULL REFERENCES periodo_academico(id) ON DELETE RESTRICT,
        numero_matricula VARCHAR(50) UNIQUE,
        fecha_matricula DATE DEFAULT CURRENT_DATE,
        fecha_retiro DATE,
        motivo_retiro TEXT,
        estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'retirado', 'trasladado', 'graduado', 'suspendido', 'congelado')),
        es_repitente BOOLEAN DEFAULT FALSE,
        es_becado BOOLEAN DEFAULT FALSE,
        porcentaje_beca DECIMAL(5,2),
        tipo_beca VARCHAR(50),
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        UNIQUE(estudiante_id, periodo_academico_id)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matricula_documento (
        id SERIAL PRIMARY KEY,
        matricula_id INTEGER NOT NULL REFERENCES matricula(id) ON DELETE CASCADE,
        tipo_documento VARCHAR(50) NOT NULL,
        nombre_archivo VARCHAR(255) NOT NULL,
        url_archivo TEXT NOT NULL,
        verificado BOOLEAN DEFAULT FALSE,
        verificado_por INTEGER REFERENCES usuarios(id),
        fecha_verificacion TIMESTAMP,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS padre_familia (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        nombres VARCHAR(100) NOT NULL,
        apellido_paterno VARCHAR(50) NOT NULL,
        apellido_materno VARCHAR(50),
        apellidos VARCHAR(100) GENERATED ALWAYS AS (apellido_paterno || ' ' || COALESCE(apellido_materno, '')) STORED,
        ci VARCHAR(20) NOT NULL UNIQUE,
        fecha_nacimiento DATE,
        telefono VARCHAR(20) NOT NULL,
        celular VARCHAR(20),
        email VARCHAR(100),
        direccion TEXT,
        ocupacion VARCHAR(100),
        lugar_trabajo VARCHAR(100),
        telefono_trabajo VARCHAR(20),
        parentesco VARCHAR(20) CHECK (parentesco IN ('padre', 'madre', 'tutor', 'abuelo', 'abuela', 'tio', 'tia', 'hermano', 'hermana', 'otro')),
        estado_civil VARCHAR(20),
        nivel_educacion VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS estudiante_tutor (
        id SERIAL PRIMARY KEY,
        estudiante_id INTEGER NOT NULL REFERENCES estudiante(id) ON DELETE CASCADE,
        padre_familia_id INTEGER NOT NULL REFERENCES padre_familia(id) ON DELETE CASCADE,
        es_tutor_principal BOOLEAN DEFAULT FALSE,
        vive_con_estudiante BOOLEAN DEFAULT FALSE,
        autorizado_recoger BOOLEAN DEFAULT TRUE,
        puede_autorizar_salidas BOOLEAN DEFAULT TRUE,
        recibe_notificaciones BOOLEAN DEFAULT TRUE,
        prioridad_contacto INTEGER DEFAULT 1,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(estudiante_id, padre_familia_id)
      );
    `);
    
    // ==========================================
    // 🔐 AUTENTICACIÓN Y AUDITORÍA
    // ==========================================
    console.log("\n🎉 Base de datos recreada correctamente ✨");

  } catch (err) {
    console.error("❌ Error al crear tablas:", err);
  } finally {
    await pool.end();
  }
}

createTables();
