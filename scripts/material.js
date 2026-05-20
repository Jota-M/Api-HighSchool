import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function crearModuloMateriales() {
  const client = await pool.connect();
  try {
    console.log('\n📚 CREACIÓN DE MÓDULO: MATERIALES ACADÉMICOS');
    console.log('Se crearán las siguientes tablas y componentes:');
    console.log('\n📋 ESTRUCTURA DEL MÓDULO:');
    console.log('  1️⃣  unidad_tematica           - Unidades del temario de la materia');
    console.log('  2️⃣  tema                      - Temas específicos dentro de cada unidad');
    console.log('  3️⃣  tipo_material             - Categorización de materiales (PDF, video, etc.)');
    console.log('  4️⃣  material_academico        - Repositorio de archivos y recursos');
    console.log('  5️⃣  material_tema             - Relación material-tema (muchos a muchos)');
    console.log('  6️⃣  acceso_material           - Log de descargas y visualizaciones');
    console.log('  7️⃣  comentario_material       - Sistema de comentarios y dudas');
    console.log('  8️⃣  favorito_material         - Marcadores de estudiantes');
    console.log('  9️⃣  progreso_estudiante       - Seguimiento de avance por tema');
    console.log('\n⚙️  COMPONENTES:');
    console.log('  ✅ Índices de optimización');
    console.log('  ✅ Triggers automáticos');
    console.log('  ✅ Funciones stored procedures');
    console.log('  ✅ Vistas materializadas para reportes');
    console.log('  ✅ Datos semilla (tipos de materiales y permisos)');
    console.log('\n⚡ FUNCIONALIDADES:');
    console.log('  🎯 Temario estructurado por unidades y temas');
    console.log('  🎯 Biblioteca de materiales con versionado');
    console.log('  🎯 Control de acceso y visibilidad por fecha');
    console.log('  🎯 Sistema de comentarios y dudas');
    console.log('  🎯 Seguimiento de progreso del estudiante');
    console.log('  🎯 Estadísticas de uso y engagement');
    console.log('  🎯 Buscador full-text en contenidos\n');

    const confirm = await ask('¿Deseas continuar con la creación? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // 1️⃣ TABLA: unidad_tematica
    // =============================================
    console.log('📋 Creando tabla UNIDAD_TEMATICA...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS unidad_tematica (
        id                    SERIAL PRIMARY KEY,
        grado_materia_id      INTEGER NOT NULL REFERENCES grado_materia(id),
        periodo_evaluacion_id INTEGER REFERENCES periodo_evaluacion(id), -- NULL = todo el año
        numero_unidad         INTEGER NOT NULL CHECK (numero_unidad > 0),
        titulo                VARCHAR(200) NOT NULL,
        descripcion           TEXT,
        objetivos             TEXT,                                -- objetivos de aprendizaje
        orden                 INTEGER NOT NULL DEFAULT 1,
        fecha_inicio_prevista DATE,
        fecha_fin_prevista    DATE,
        activo                BOOLEAN DEFAULT true,
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (grado_materia_id, numero_unidad)
      )
    `);

    await client.query(`COMMENT ON TABLE unidad_tematica IS 'Unidades temáticas del programa de estudio de cada materia'`);
    await client.query(`COMMENT ON COLUMN unidad_tematica.periodo_evaluacion_id IS 'NULL = unidad transversal a todo el año académico'`);

    console.log('  ✅ Tabla unidad_tematica creada');

    // =============================================
    // 2️⃣ TABLA: tema
    // =============================================
    console.log('📋 Creando tabla TEMA...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS tema (
        id                 SERIAL PRIMARY KEY,
        unidad_tematica_id INTEGER NOT NULL REFERENCES unidad_tematica(id) ON DELETE CASCADE,
        numero_tema        INTEGER NOT NULL CHECK (numero_tema > 0),
        titulo             VARCHAR(200) NOT NULL,
        descripcion        TEXT,
        contenido          TEXT,                                   -- contenido detallado del tema
        palabras_clave     TEXT[],                                 -- tags para búsqueda
        duracion_estimada  INTEGER,                                -- minutos de clase estimados
        es_obligatorio     BOOLEAN DEFAULT true,
        orden              INTEGER NOT NULL DEFAULT 1,
        nivel_dificultad   VARCHAR(20) CHECK (nivel_dificultad IN (
          'basico',
          'intermedio',
          'avanzado'
        )),
        activo             BOOLEAN DEFAULT true,
        created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (unidad_tematica_id, numero_tema)
      )
    `);

    await client.query(`COMMENT ON TABLE tema IS 'Temas específicos dentro de cada unidad temática'`);
    await client.query(`COMMENT ON COLUMN tema.palabras_clave IS 'Array de tags para facilitar búsquedas full-text'`);

    console.log('  ✅ Tabla tema creada');

    // =============================================
    // 3️⃣ TABLA: tipo_material
    // =============================================
    console.log('📋 Creando tabla TIPO_MATERIAL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS tipo_material (
        id          SERIAL PRIMARY KEY,
        nombre      VARCHAR(100) NOT NULL UNIQUE,
        codigo      VARCHAR(20) NOT NULL UNIQUE,
        descripcion TEXT,
        icono       VARCHAR(50),                                   -- nombre del icono en la UI
        extensiones TEXT[],                                        -- extensiones permitidas: ['.pdf', '.docx']
        color       VARCHAR(20),                                   -- color en la UI
        activo      BOOLEAN DEFAULT true,
        orden       INTEGER DEFAULT 1,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE tipo_material IS 'Catálogo de tipos de materiales académicos'`);

    console.log('  ✅ Tabla tipo_material creada');

    // =============================================
    // 4️⃣ TABLA: material_academico
    // =============================================
    console.log('📋 Creando tabla MATERIAL_ACADEMICO...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS material_academico (
        id                    SERIAL PRIMARY KEY,
        codigo_material       VARCHAR(50) NOT NULL UNIQUE,         -- MAT-2025-000001
        asignacion_docente_id INTEGER NOT NULL REFERENCES asignacion_docente(id),
        tipo_material_id      INTEGER NOT NULL REFERENCES tipo_material(id),
        titulo                VARCHAR(200) NOT NULL,
        descripcion           TEXT,
        
        -- Archivo o enlace externo
        es_enlace_externo     BOOLEAN DEFAULT false,
        url_archivo           TEXT,                                -- URL de Cloudinary o storage
        url_externa           TEXT,                                -- YouTube, Drive, etc.
        nombre_archivo        VARCHAR(255),
        tamano_bytes          BIGINT,
        tipo_mime             VARCHAR(100),
                
        -- Versión y autor
        version               INTEGER DEFAULT 1,
        material_anterior_id  INTEGER REFERENCES material_academico(id), -- versionado
        subido_por            INTEGER NOT NULL REFERENCES usuarios(id),
        
        -- Visibilidad y acceso
        visible_para_estudiantes BOOLEAN DEFAULT true,
        fecha_publicacion     TIMESTAMP,                           -- NULL = no publicado aún
        fecha_despublicacion  TIMESTAMP,                           -- NULL = sin límite
        requiere_descarga     BOOLEAN DEFAULT false,               -- true = no preview, solo descarga
        
        -- Métricas
        contador_vistas       INTEGER DEFAULT 0,
        contador_descargas    INTEGER DEFAULT 0,
        
        -- Estado
        activo                BOOLEAN DEFAULT true,
        es_destacado          BOOLEAN DEFAULT false,               -- aparece en portada de la materia
        
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at            TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE material_academico IS 'Repositorio de materiales académicos subidos por docentes'`);
    await client.query(`COMMENT ON COLUMN material_academico.material_anterior_id IS 'Permite versionado: apunta a la versión anterior del mismo material'`);
    await client.query(`COMMENT ON COLUMN material_academico.fecha_publicacion IS 'Control de visibilidad temporal: se muestra solo entre fecha_publicacion y fecha_despublicacion'`);

    console.log('  ✅ Tabla material_academico creada');

    // =============================================
    // 5️⃣ TABLA: material_tema
    // =============================================
    console.log('📋 Creando tabla MATERIAL_TEMA...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS material_tema (
        id                  SERIAL PRIMARY KEY,
        material_academico_id INTEGER NOT NULL REFERENCES material_academico(id) ON DELETE CASCADE,
        tema_id             INTEGER NOT NULL REFERENCES tema(id) ON DELETE CASCADE,
        es_principal        BOOLEAN DEFAULT false,                 -- material principal del tema
        orden               INTEGER DEFAULT 1,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (material_academico_id, tema_id)
      )
    `);

    await client.query(`COMMENT ON TABLE material_tema IS 'Relación muchos a muchos entre materiales y temas'`);
    await client.query(`COMMENT ON COLUMN material_tema.es_principal IS 'true = material obligatorio/principal para estudiar este tema'`);

    console.log('  ✅ Tabla material_tema creada');

    // =============================================
    // 6️⃣ TABLA: acceso_material
    // =============================================
    console.log('📋 Creando tabla ACCESO_MATERIAL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS acceso_material (
        id                    SERIAL PRIMARY KEY,
        material_academico_id INTEGER NOT NULL REFERENCES material_academico(id) ON DELETE CASCADE,
        matricula_id          INTEGER REFERENCES matricula(id),    -- NULL = acceso anónimo/docente
        usuario_id            INTEGER REFERENCES usuarios(id),     -- quién accedió
        tipo_accion           VARCHAR(20) NOT NULL CHECK (tipo_accion IN (
          'visualizacion',
          'descarga',
          'compartido',
          'impresion'
        )),
        ip_address            VARCHAR(50),
        user_agent            TEXT,
        dispositivo           VARCHAR(20) CHECK (dispositivo IN ('web', 'movil', 'tablet')),
        duracion_segundos     INTEGER,                             -- para videos: tiempo visto
        completado            BOOLEAN DEFAULT false,               -- si vio/leyó completo
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE acceso_material IS 'Log de accesos para análisis de uso y engagement'`);

    console.log('  ✅ Tabla acceso_material creada');

    // =============================================
    // 7️⃣ TABLA: comentario_material
    // =============================================
    console.log('📋 Creando tabla COMENTARIO_MATERIAL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS comentario_material (
        id                    SERIAL PRIMARY KEY,
        material_academico_id INTEGER NOT NULL REFERENCES material_academico(id) ON DELETE CASCADE,
        usuario_id            INTEGER NOT NULL REFERENCES usuarios(id),
        comentario_padre_id   INTEGER REFERENCES comentario_material(id), -- para hilos/respuestas
        contenido             TEXT NOT NULL,
        es_duda               BOOLEAN DEFAULT false,               -- true = pregunta académica
        es_resuelto           BOOLEAN DEFAULT false,               -- para dudas
        resuelto_por          INTEGER REFERENCES usuarios(id),    -- quién respondió la duda
        fecha_resolucion      TIMESTAMP,
        editado               BOOLEAN DEFAULT false,
        fecha_edicion         TIMESTAMP,
        activo                BOOLEAN DEFAULT true,               -- false = eliminado/oculto
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`COMMENT ON TABLE comentario_material IS 'Sistema de comentarios y dudas sobre materiales'`);
    await client.query(`COMMENT ON COLUMN comentario_material.comentario_padre_id IS 'NULL = comentario raíz; con valor = respuesta a otro comentario'`);

    console.log('  ✅ Tabla comentario_material creada');

    // =============================================
    // 8️⃣ TABLA: favorito_material
    // =============================================
    console.log('📋 Creando tabla FAVORITO_MATERIAL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS favorito_material (
        id                    SERIAL PRIMARY KEY,
        material_academico_id INTEGER NOT NULL REFERENCES material_academico(id) ON DELETE CASCADE,
        matricula_id          INTEGER NOT NULL REFERENCES matricula(id),
        notas_personales      TEXT,                                -- apuntes del estudiante
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (material_academico_id, matricula_id)
      )
    `);

    await client.query(`COMMENT ON TABLE favorito_material IS 'Materiales marcados como favoritos por estudiantes'`);

    console.log('  ✅ Tabla favorito_material creada');

    // =============================================
    // 9️⃣ TABLA: progreso_estudiante
    // =============================================
    console.log('📋 Creando tabla PROGRESO_ESTUDIANTE...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS progreso_estudiante (
        id               SERIAL PRIMARY KEY,
        matricula_id     INTEGER NOT NULL REFERENCES matricula(id),
        tema_id          INTEGER NOT NULL REFERENCES tema(id) ON DELETE CASCADE,
        estado           VARCHAR(20) DEFAULT 'no_iniciado' CHECK (estado IN (
          'no_iniciado',
          'en_progreso',
          'completado',
          'revisando'
        )),
        porcentaje_avance NUMERIC(5,2) DEFAULT 0 CHECK (porcentaje_avance >= 0 AND porcentaje_avance <= 100),
        fecha_inicio     TIMESTAMP,
        fecha_completado TIMESTAMP,
        tiempo_dedicado  INTEGER DEFAULT 0,                        -- minutos acumulados
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (matricula_id, tema_id)
      )
    `);

    await client.query(`COMMENT ON TABLE progreso_estudiante IS 'Seguimiento del avance del estudiante por cada tema'`);
    await client.query(`COMMENT ON COLUMN progreso_estudiante.tiempo_dedicado IS 'Tiempo acumulado en minutos estudiando este tema'`);

    console.log('  ✅ Tabla progreso_estudiante creada');

    // =============================================
    // ÍNDICES DE OPTIMIZACIÓN
    // =============================================
    console.log('\n🔍 Creando índices...');

    const indices = [
      // unidad_tematica
      `CREATE INDEX IF NOT EXISTS idx_unidad_grado_materia ON unidad_tematica(grado_materia_id)`,
      `CREATE INDEX IF NOT EXISTS idx_unidad_periodo ON unidad_tematica(periodo_evaluacion_id) WHERE periodo_evaluacion_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_unidad_activo ON unidad_tematica(activo) WHERE activo = true`,
      
      // tema
      `CREATE INDEX IF NOT EXISTS idx_tema_unidad ON tema(unidad_tematica_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tema_activo ON tema(activo) WHERE activo = true`,
      `CREATE INDEX IF NOT EXISTS idx_tema_palabras_clave ON tema USING GIN(palabras_clave)`,
      
      // material_academico
      `CREATE INDEX IF NOT EXISTS idx_material_asignacion ON material_academico(asignacion_docente_id)`,
      `CREATE INDEX IF NOT EXISTS idx_material_tipo ON material_academico(tipo_material_id)`,
      `CREATE INDEX IF NOT EXISTS idx_material_subido_por ON material_academico(subido_por)`,
      `CREATE INDEX IF NOT EXISTS idx_material_visible ON material_academico(visible_para_estudiantes) WHERE visible_para_estudiantes = true`,
      `CREATE INDEX IF NOT EXISTS idx_material_publicacion ON material_academico(fecha_publicacion) WHERE fecha_publicacion IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_material_destacado ON material_academico(es_destacado) WHERE es_destacado = true`,
      `CREATE INDEX IF NOT EXISTS idx_material_activo ON material_academico(activo, deleted_at) WHERE activo = true AND deleted_at IS NULL`,
      
      // material_tema
      `CREATE INDEX IF NOT EXISTS idx_material_tema_material ON material_tema(material_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_material_tema_tema ON material_tema(tema_id)`,
      
      // acceso_material
      `CREATE INDEX IF NOT EXISTS idx_acceso_material ON acceso_material(material_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_acceso_matricula ON acceso_material(matricula_id) WHERE matricula_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_acceso_fecha ON acceso_material(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_acceso_tipo ON acceso_material(tipo_accion)`,
      
      // comentario_material
      `CREATE INDEX IF NOT EXISTS idx_comentario_material ON comentario_material(material_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_comentario_usuario ON comentario_material(usuario_id)`,
      `CREATE INDEX IF NOT EXISTS idx_comentario_padre ON comentario_material(comentario_padre_id) WHERE comentario_padre_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_comentario_duda ON comentario_material(es_duda, es_resuelto) WHERE es_duda = true`,
      
      // favorito_material
      `CREATE INDEX IF NOT EXISTS idx_favorito_material ON favorito_material(material_academico_id)`,
      `CREATE INDEX IF NOT EXISTS idx_favorito_matricula ON favorito_material(matricula_id)`,
      
      // progreso_estudiante
      `CREATE INDEX IF NOT EXISTS idx_progreso_matricula ON progreso_estudiante(matricula_id)`,
      `CREATE INDEX IF NOT EXISTS idx_progreso_tema ON progreso_estudiante(tema_id)`,
      `CREATE INDEX IF NOT EXISTS idx_progreso_estado ON progreso_estudiante(estado)`,
    ];

    for (const idx of indices) {
      await client.query(idx);
    }

    console.log(`  ✅ ${indices.length} índices creados`);

    // =============================================
    // ÍNDICE FULL-TEXT SEARCH
    // =============================================
    console.log('\n🔎 Creando índices de búsqueda full-text...');

    // Índice para búsqueda en materiales
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_material_busqueda_texto 
      ON material_academico 
      USING GIN(to_tsvector('spanish', 
        COALESCE(titulo, '') || ' ' || 
        COALESCE(descripcion, '') || ' ' || 
        COALESCE(nombre_archivo, '')
      ))
    `);

    // Índice para búsqueda en temas
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tema_busqueda_texto 
      ON tema 
      USING GIN(to_tsvector('spanish', 
        COALESCE(titulo, '') || ' ' || 
        COALESCE(descripcion, '') || ' ' || 
        COALESCE(contenido, '')
      ))
    `);

    console.log('  ✅ Índices full-text creados');

    // =============================================
    // TRIGGERS
    // =============================================
    console.log('\n⚡ Creando triggers...');

    // Función reutilizable updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    const triggersUpdatedAt = [
      { tabla: 'unidad_tematica',      trigger: 'trg_unidad_tematica_updated_at' },
      { tabla: 'tema',                 trigger: 'trg_tema_updated_at' },
      { tabla: 'material_academico',   trigger: 'trg_material_academico_updated_at' },
      { tabla: 'comentario_material',  trigger: 'trg_comentario_material_updated_at' },
      { tabla: 'progreso_estudiante',  trigger: 'trg_progreso_estudiante_updated_at' },
    ];

    for (const item of triggersUpdatedAt) {
      await client.query(`DROP TRIGGER IF EXISTS ${item.trigger} ON ${item.tabla}`);
      await client.query(`
        CREATE TRIGGER ${item.trigger}
        BEFORE UPDATE ON ${item.tabla}
        FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at()
      `);
    }

    console.log('  ✅ Triggers de updated_at creados');

    // Trigger: incrementar contador de vistas/descargas automáticamente
    await client.query(`
      CREATE OR REPLACE FUNCTION incrementar_contador_material()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.tipo_accion = 'visualizacion' THEN
          UPDATE material_academico
          SET contador_vistas = contador_vistas + 1
          WHERE id = NEW.material_academico_id;
        ELSIF NEW.tipo_accion = 'descarga' THEN
          UPDATE material_academico
          SET contador_descargas = contador_descargas + 1
          WHERE id = NEW.material_academico_id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_incrementar_contador ON acceso_material`);
    await client.query(`
      CREATE TRIGGER trg_incrementar_contador
      AFTER INSERT ON acceso_material
      FOR EACH ROW EXECUTE FUNCTION incrementar_contador_material()
    `);

    console.log('  ✅ Trigger de contadores de material creado');

    // Trigger: actualizar progreso del estudiante cuando accede a materiales
    await client.query(`
      CREATE OR REPLACE FUNCTION actualizar_progreso_tema()
      RETURNS TRIGGER AS $$
      DECLARE
        v_tema_id INTEGER;
      BEGIN
        -- Obtener el tema asociado al material
        SELECT mt.tema_id INTO v_tema_id
        FROM material_tema mt
        WHERE mt.material_academico_id = NEW.material_academico_id
          AND mt.es_principal = true
        LIMIT 1;

        IF v_tema_id IS NOT NULL AND NEW.matricula_id IS NOT NULL THEN
          -- Insertar o actualizar progreso
          INSERT INTO progreso_estudiante (matricula_id, tema_id, estado, fecha_inicio, tiempo_dedicado)
          VALUES (
            NEW.matricula_id,
            v_tema_id,
            'en_progreso',
            CURRENT_TIMESTAMP,
            COALESCE(NEW.duracion_segundos / 60, 0)
          )
          ON CONFLICT (matricula_id, tema_id)
          DO UPDATE SET
            estado = CASE
              WHEN progreso_estudiante.estado = 'no_iniciado' THEN 'en_progreso'
              ELSE progreso_estudiante.estado
            END,
            tiempo_dedicado = progreso_estudiante.tiempo_dedicado + COALESCE(NEW.duracion_segundos / 60, 0),
            updated_at = CURRENT_TIMESTAMP;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_actualizar_progreso ON acceso_material`);
    await client.query(`
      CREATE TRIGGER trg_actualizar_progreso
      AFTER INSERT ON acceso_material
      FOR EACH ROW 
      WHEN (NEW.tipo_accion IN ('visualizacion', 'descarga'))
      EXECUTE FUNCTION actualizar_progreso_tema()
    `);

    console.log('  ✅ Trigger de progreso automático creado');

    // Trigger: generar código único de material
    await client.query(`
      CREATE OR REPLACE FUNCTION generar_codigo_material()
      RETURNS TRIGGER AS $$
      DECLARE
        v_year VARCHAR(4);
        v_counter INTEGER;
        v_codigo VARCHAR(50);
      BEGIN
        IF NEW.codigo_material IS NULL OR NEW.codigo_material = '' THEN
          v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
          
          SELECT COALESCE(MAX(
            CAST(SUBSTRING(codigo_material FROM 'MAT-' || v_year || '-(\d+)') AS INTEGER)
          ), 0) + 1
          INTO v_counter
          FROM material_academico
          WHERE codigo_material LIKE 'MAT-' || v_year || '-%';
          
          v_codigo := 'MAT-' || v_year || '-' || LPAD(v_counter::TEXT, 6, '0');
          NEW.codigo_material := v_codigo;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`DROP TRIGGER IF EXISTS trg_generar_codigo_material ON material_academico`);
    await client.query(`
      CREATE TRIGGER trg_generar_codigo_material
      BEFORE INSERT ON material_academico
      FOR EACH ROW EXECUTE FUNCTION generar_codigo_material()
    `);

    console.log('  ✅ Trigger de generación de código creado');

    // =============================================
    // STORED PROCEDURES
    // =============================================
    console.log('\n🔧 Creando funciones stored procedures...');

    // Función: obtener temario completo de una materia
    await client.query(`
      CREATE OR REPLACE FUNCTION obtener_temario_materia(
        p_grado_materia_id INTEGER,
        p_periodo_evaluacion_id INTEGER DEFAULT NULL
      )
      RETURNS TABLE(
        unidad_id           INTEGER,
        unidad_numero       INTEGER,
        unidad_titulo       VARCHAR,
        unidad_descripcion  TEXT,
        tema_id             INTEGER,
        tema_numero         INTEGER,
        tema_titulo         VARCHAR,
        tema_descripcion    TEXT,
        total_materiales    BIGINT,
        nivel_dificultad    VARCHAR
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          u.id::INTEGER,
          u.numero_unidad::INTEGER,
          u.titulo::VARCHAR,
          u.descripcion::TEXT,
          t.id::INTEGER,
          t.numero_tema::INTEGER,
          t.titulo::VARCHAR,
          t.descripcion::TEXT,
          COUNT(DISTINCT mt.material_academico_id),
          t.nivel_dificultad::VARCHAR
        FROM unidad_tematica u
        LEFT JOIN tema t ON u.id = t.unidad_tematica_id AND t.activo = true
        LEFT JOIN material_tema mt ON t.id = mt.tema_id
        WHERE u.grado_materia_id = p_grado_materia_id
          AND u.activo = true
          AND (p_periodo_evaluacion_id IS NULL OR u.periodo_evaluacion_id = p_periodo_evaluacion_id)
        GROUP BY u.id, u.numero_unidad, u.titulo, u.descripcion,
                 t.id, t.numero_tema, t.titulo, t.descripcion, t.nivel_dificultad
        ORDER BY u.numero_unidad, t.numero_tema;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función obtener_temario_materia creada');

    // Función: buscar materiales full-text
    await client.query(`
      CREATE OR REPLACE FUNCTION buscar_materiales(
        p_query TEXT,
        p_asignacion_docente_id INTEGER DEFAULT NULL,
        p_tipo_material_id INTEGER DEFAULT NULL,
        p_solo_visibles BOOLEAN DEFAULT true
      )
      RETURNS TABLE(
        material_id       INTEGER,
        codigo            VARCHAR,
        titulo            VARCHAR,
        descripcion       TEXT,
        tipo_material     VARCHAR,
        fecha_publicacion TIMESTAMP,
        contador_vistas   INTEGER,
        relevancia        REAL
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          m.id::INTEGER,
          m.codigo_material::VARCHAR,
          m.titulo::VARCHAR,
          m.descripcion::TEXT,
          tm.nombre::VARCHAR,
          m.fecha_publicacion,
          m.contador_vistas::INTEGER,
          ts_rank(
            to_tsvector('spanish', 
              COALESCE(m.titulo, '') || ' ' || 
              COALESCE(m.descripcion, '') || ' ' || 
              COALESCE(m.nombre_archivo, '')
            ),
            plainto_tsquery('spanish', p_query)
          ) AS relevancia
        FROM material_academico m
        INNER JOIN tipo_material tm ON m.tipo_material_id = tm.id
        WHERE
          to_tsvector('spanish', 
            COALESCE(m.titulo, '') || ' ' || 
            COALESCE(m.descripcion, '') || ' ' || 
            COALESCE(m.nombre_archivo, '')
          ) @@ plainto_tsquery('spanish', p_query)
          AND m.activo = true
          AND m.deleted_at IS NULL
          AND (p_asignacion_docente_id IS NULL OR m.asignacion_docente_id = p_asignacion_docente_id)
          AND (p_tipo_material_id IS NULL OR m.tipo_material_id = p_tipo_material_id)
          AND (NOT p_solo_visibles OR (
            m.visible_para_estudiantes = true
            AND m.fecha_publicacion IS NOT NULL
            AND m.fecha_publicacion <= CURRENT_TIMESTAMP
            AND (m.fecha_despublicacion IS NULL OR m.fecha_despublicacion > CURRENT_TIMESTAMP)
          ))
        ORDER BY relevancia DESC, m.fecha_publicacion DESC;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función buscar_materiales creada');

    // Función: estadísticas de uso de materiales
    await client.query(`
      CREATE OR REPLACE FUNCTION estadisticas_material(
        p_material_id INTEGER,
        p_fecha_inicio DATE DEFAULT NULL,
        p_fecha_fin DATE DEFAULT NULL
      )
      RETURNS TABLE(
        total_vistas      BIGINT,
        total_descargas   BIGINT,
        estudiantes_unicos BIGINT,
        promedio_duracion NUMERIC,
        tasa_completado   NUMERIC,
        total_comentarios BIGINT,
        total_dudas_abiertas BIGINT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          COUNT(CASE WHEN am.tipo_accion = 'visualizacion' THEN 1 END),
          COUNT(CASE WHEN am.tipo_accion = 'descarga' THEN 1 END),
          COUNT(DISTINCT am.matricula_id),
          ROUND(AVG(am.duracion_segundos)::NUMERIC / 60, 2),
          ROUND(
            COUNT(CASE WHEN am.completado = true THEN 1 END)::NUMERIC 
            / NULLIF(COUNT(am.id), 0) * 100,
            2
          ),
          (SELECT COUNT(*) FROM comentario_material 
           WHERE material_academico_id = p_material_id AND activo = true),
          (SELECT COUNT(*) FROM comentario_material 
           WHERE material_academico_id = p_material_id 
             AND es_duda = true AND es_resuelto = false AND activo = true)
        FROM acceso_material am
        WHERE am.material_academico_id = p_material_id
          AND (p_fecha_inicio IS NULL OR am.created_at >= p_fecha_inicio)
          AND (p_fecha_fin IS NULL OR am.created_at <= p_fecha_fin);
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función estadisticas_material creada');

    // Función: reporte de progreso de estudiante por materia
    await client.query(`
      CREATE OR REPLACE FUNCTION reporte_progreso_estudiante(
        p_matricula_id INTEGER,
        p_grado_materia_id INTEGER
      )
      RETURNS TABLE(
        unidad_titulo         VARCHAR,
        tema_titulo           VARCHAR,
        estado_progreso       VARCHAR,
        porcentaje_avance     NUMERIC,
        tiempo_dedicado       INTEGER,
        materiales_vistos     BIGINT,
        materiales_totales    BIGINT,
        fecha_ultima_actividad TIMESTAMP
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          u.titulo::VARCHAR,
          t.titulo::VARCHAR,
          COALESCE(pe.estado, 'no_iniciado')::VARCHAR,
          COALESCE(pe.porcentaje_avance, 0)::NUMERIC,
          COALESCE(pe.tiempo_dedicado, 0)::INTEGER,
          COUNT(DISTINCT CASE 
            WHEN am.matricula_id = p_matricula_id THEN am.material_academico_id 
          END),
          COUNT(DISTINCT mt.material_academico_id),
          MAX(am.created_at)
        FROM unidad_tematica u
        INNER JOIN tema t ON u.id = t.unidad_tematica_id
        LEFT JOIN material_tema mt ON t.id = mt.tema_id
        LEFT JOIN acceso_material am ON mt.material_academico_id = am.material_academico_id
          AND am.matricula_id = p_matricula_id
        LEFT JOIN progreso_estudiante pe ON t.id = pe.tema_id 
          AND pe.matricula_id = p_matricula_id
        WHERE u.grado_materia_id = p_grado_materia_id
          AND u.activo = true
          AND t.activo = true
        GROUP BY u.titulo, u.numero_unidad, t.titulo, t.numero_tema, 
                 pe.estado, pe.porcentaje_avance, pe.tiempo_dedicado
        ORDER BY u.numero_unidad, t.numero_tema;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función reporte_progreso_estudiante creada');

    // Función: materiales destacados de una materia
    await client.query(`
      CREATE OR REPLACE FUNCTION materiales_destacados_materia(
        p_asignacion_docente_id INTEGER,
        p_limite INTEGER DEFAULT 5
      )
      RETURNS TABLE(
        material_id       INTEGER,
        codigo            VARCHAR,
        titulo            VARCHAR,
        tipo_material     VARCHAR,
        fecha_publicacion TIMESTAMP,
        contador_vistas   INTEGER,
        contador_descargas INTEGER,
        total_comentarios BIGINT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          m.id::INTEGER,
          m.codigo_material::VARCHAR,
          m.titulo::VARCHAR,
          tm.nombre::VARCHAR,
          m.fecha_publicacion,
          m.contador_vistas::INTEGER,
          m.contador_descargas::INTEGER,
          COUNT(cm.id)
        FROM material_academico m
        INNER JOIN tipo_material tm ON m.tipo_material_id = tm.id
        LEFT JOIN comentario_material cm ON m.id = cm.material_academico_id AND cm.activo = true
        WHERE m.asignacion_docente_id = p_asignacion_docente_id
          AND m.es_destacado = true
          AND m.visible_para_estudiantes = true
          AND m.activo = true
          AND m.deleted_at IS NULL
          AND m.fecha_publicacion IS NOT NULL
          AND m.fecha_publicacion <= CURRENT_TIMESTAMP
          AND (m.fecha_despublicacion IS NULL OR m.fecha_despublicacion > CURRENT_TIMESTAMP)
        GROUP BY m.id, m.codigo_material, m.titulo, tm.nombre, 
                 m.fecha_publicacion, m.contador_vistas, m.contador_descargas
        ORDER BY m.fecha_publicacion DESC, m.contador_vistas DESC
        LIMIT p_limite;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función materiales_destacados_materia creada');

    // =============================================
    // VISTAS MATERIALIZADAS
    // =============================================
    console.log('\n📊 Creando vistas materializadas...');

    // Vista: ranking de materiales más populares
    await client.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS vista_materiales_populares AS
      SELECT
        m.id AS material_id,
        m.codigo_material,
        m.titulo,
        tm.nombre AS tipo_material,
        mat.nombre AS materia_nombre,
        m.contador_vistas,
        m.contador_descargas,
        COUNT(DISTINCT am.matricula_id) AS estudiantes_unicos,
        COUNT(DISTINCT cm.id) AS total_comentarios,
        ROUND(
          AVG(CASE 
            WHEN am.duracion_segundos IS NOT NULL 
            THEN am.duracion_segundos / 60.0 
          END)::NUMERIC,
          2
        ) AS promedio_duracion_minutos,
        m.fecha_publicacion
      FROM material_academico m
      INNER JOIN tipo_material tm ON m.tipo_material_id = tm.id
      INNER JOIN asignacion_docente ad ON m.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat ON gm.materia_id = mat.id
      LEFT JOIN acceso_material am ON m.id = am.material_academico_id
      LEFT JOIN comentario_material cm ON m.id = cm.material_academico_id AND cm.activo = true
      WHERE m.activo = true
        AND m.deleted_at IS NULL
        AND m.visible_para_estudiantes = true
      GROUP BY m.id, m.codigo_material, m.titulo, tm.nombre, mat.nombre, 
               m.contador_vistas, m.contador_descargas, m.fecha_publicacion;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_vista_materiales_populares_id 
      ON vista_materiales_populares(material_id);
    `);

    console.log('  ✅ Vista materializada vista_materiales_populares creada');

    // =============================================
    // DATOS SEMILLA
    // =============================================
    console.log('\n📦 Insertando datos semilla...');

    // Tipos de materiales
    await client.query(`
      INSERT INTO tipo_material (nombre, codigo, descripcion, icono, extensiones, color, orden)
      VALUES
        (
          'Documento PDF',
          'PDF',
          'Documentos en formato PDF',
          'file-pdf',
          ARRAY['.pdf'],
          '#DC2626',
          1
        ),
        (
          'Presentación',
          'PPT',
          'Presentaciones PowerPoint o similares',
          'presentation',
          ARRAY['.ppt', '.pptx', '.odp'],
          '#F59E0B',
          2
        ),
        (
          'Documento Word',
          'DOC',
          'Documentos de texto editables',
          'file-text',
          ARRAY['.doc', '.docx', '.odt'],
          '#2563EB',
          3
        ),
        (
          'Hoja de cálculo',
          'XLS',
          'Hojas de cálculo Excel o similares',
          'file-spreadsheet',
          ARRAY['.xls', '.xlsx', '.ods', '.csv'],
          '#10B981',
          4
        ),
        (
          'Video',
          'VIDEO',
          'Videos educativos',
          'video',
          ARRAY['.mp4', '.avi', '.mov', '.wmv', '.webm'],
          '#8B5CF6',
          5
        ),
        (
          'Audio',
          'AUDIO',
          'Archivos de audio y podcasts',
          'music',
          ARRAY['.mp3', '.wav', '.ogg', '.m4a'],
          '#EC4899',
          6
        ),
        (
          'Imagen',
          'IMG',
          'Imágenes, diagramas e infografías',
          'image',
          ARRAY['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
          '#06B6D4',
          7
        ),
        (
          'Enlace externo',
          'LINK',
          'Enlaces a recursos externos (YouTube, Drive, etc.)',
          'link',
          NULL,
          '#6366F1',
          8
        ),
        (
          'Código fuente',
          'CODE',
          'Archivos de código y scripts',
          'code',
          ARRAY['.py', '.js', '.java', '.cpp', '.html', '.css', '.sql'],
          '#64748B',
          9
        ),
        (
          'Libro digital',
          'EBOOK',
          'Libros electrónicos y publicaciones',
          'book-open',
          ARRAY['.epub', '.mobi', '.azw'],
          '#7C3AED',
          10
        ),
        (
          'Archivo comprimido',
          'ZIP',
          'Archivos comprimidos con múltiples recursos',
          'archive',
          ARRAY['.zip', '.rar', '.7z', '.tar', '.gz'],
          '#78716C',
          11
        ),
        (
          'Otro',
          'OTHER',
          'Otros tipos de archivos',
          'file',
          NULL,
          '#94A3B8',
          99
        )
      ON CONFLICT (codigo) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        icono = EXCLUDED.icono,
        extensiones = EXCLUDED.extensiones,
        color = EXCLUDED.color
    `);

    console.log('  ✅ 12 tipos de materiales insertados');

    // Permisos del módulo
    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES
        -- Unidades temáticas
        ('unidad_tematica', 'leer',      'unidad_tematica.leer',      'Ver unidades temáticas'),
        ('unidad_tematica', 'crear',     'unidad_tematica.crear',     'Crear unidades temáticas'),
        ('unidad_tematica', 'actualizar','unidad_tematica.actualizar','Editar unidades temáticas'),
        ('unidad_tematica', 'eliminar',  'unidad_tematica.eliminar',  'Eliminar unidades temáticas'),
        
        -- Temas
        ('tema', 'leer',      'tema.leer',      'Ver temas'),
        ('tema', 'crear',     'tema.crear',     'Crear temas'),
        ('tema', 'actualizar','tema.actualizar','Editar temas'),
        ('tema', 'eliminar',  'tema.eliminar',  'Eliminar temas'),
        
        -- Materiales
        ('material', 'leer',      'material.leer',      'Ver materiales'),
        ('material', 'crear',     'material.crear',     'Subir materiales'),
        ('material', 'actualizar','material.actualizar','Editar materiales'),
        ('material', 'eliminar',  'material.eliminar',  'Eliminar materiales'),
        ('material', 'descargar', 'material.descargar', 'Descargar materiales'),
        ('material', 'publicar',  'material.publicar',  'Publicar/despublicar materiales'),
        
        -- Comentarios
        ('comentario_material', 'leer',      'comentario_material.leer',      'Ver comentarios'),
        ('comentario_material', 'crear',     'comentario_material.crear',     'Comentar en materiales'),
        ('comentario_material', 'actualizar','comentario_material.actualizar','Editar comentarios propios'),
        ('comentario_material', 'eliminar',  'comentario_material.eliminar',  'Eliminar comentarios'),
        ('comentario_material', 'moderar',   'comentario_material.moderar',   'Moderar comentarios de otros'),
        
        -- Progreso
        ('progreso', 'leer',      'progreso.leer',      'Ver progreso de estudiantes'),
        ('progreso', 'actualizar','progreso.actualizar','Actualizar progreso'),
        ('progreso', 'reporte',   'progreso.reporte',   'Ver reportes de progreso'),
        
        -- Estadísticas
        ('estadisticas_material', 'leer', 'estadisticas_material.leer', 'Ver estadísticas de materiales')
      ON CONFLICT (nombre) DO NOTHING
    `);

    console.log('  ✅ 23 permisos del módulo insertados');

    await client.query('COMMIT');

    console.log('\n✅ ¡Módulo de Materiales Académicos creado exitosamente!\n');
    console.log('📊 RESUMEN:');
    console.log('┌────────────────────────────────────────────────────┐');
    console.log('│ ✅ 9 Tablas creadas                               │');
    console.log('│ ✅ 29 Índices de optimización                     │');
    console.log('│ ✅ 2 Índices full-text search                     │');
    console.log('│ ✅ 6 Triggers automáticos                         │');
    console.log('│ ✅ 5 Stored procedures                            │');
    console.log('│ ✅ 1 Vista materializada                          │');
    console.log('│ ✅ 12 Tipos de materiales                         │');
    console.log('│ ✅ 23 Permisos de acceso registrados              │');
    console.log('└────────────────────────────────────────────────────┘\n');
    console.log('💡 FUNCIONALIDADES PRINCIPALES:');
    console.log('   ✨ Temario estructurado por unidades y temas');
    console.log('   ✨ Repositorio de materiales con versionado');
    console.log('   ✨ Control de visibilidad temporal');
    console.log('   ✨ Sistema de comentarios y dudas');
    console.log('   ✨ Seguimiento automático de progreso');
    console.log('   ✨ Búsqueda full-text en español');
    console.log('   ✨ Estadísticas de uso detalladas');
    console.log('   ✨ Materiales favoritos por estudiante\n');
    console.log('🚀 PRÓXIMOS PASOS:');
    console.log('   1. Crear unidades temáticas para cada materia');
    console.log('   2. Agregar temas dentro de cada unidad');
    console.log('   3. Subir materiales y vincularlos a temas');
    console.log('   4. Configurar visibilidad y fechas de publicación');
    console.log('   5. Monitorear estadísticas de uso\n');
    console.log('📚 EJEMPLOS DE USO:');
    console.log('   -- Ver temario completo:');
    console.log('   SELECT * FROM obtener_temario_materia(1);');
    console.log('');
    console.log('   -- Buscar materiales:');
    console.log("   SELECT * FROM buscar_materiales('algebra');");
    console.log('');
    console.log('   -- Ver progreso de estudiante:');
    console.log('   SELECT * FROM reporte_progreso_estudiante(100, 5);');
    console.log('');
    console.log('   -- Estadísticas de un material:');
    console.log('   SELECT * FROM estadisticas_material(50);\n');

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

crearModuloMateriales().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});