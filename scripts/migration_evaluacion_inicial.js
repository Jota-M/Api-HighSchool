// scripts/migration_evaluacion_inicial.js
import { pool } from '../src/db/pool.js';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🚀 Iniciando migración de Evaluación Nivel Inicial...');
    await client.query('BEGIN');

    // 1. Agregar columna modalidad_evaluacion en nivel_academico
    console.log('1️⃣ Actualizando tabla nivel_academico...');
    await client.query(`
      ALTER TABLE public.nivel_academico
        ADD COLUMN IF NOT EXISTS modalidad_evaluacion VARCHAR(20) NOT NULL DEFAULT 'dimensional'
        CHECK (modalidad_evaluacion IN ('dimensional', 'cualitativa'));
    `);

    // Settear 'cualitativa' para Educación Inicial (id: 1, codigo: EDU-INI)
    await client.query(`
      UPDATE public.nivel_academico
        SET modalidad_evaluacion = 'cualitativa'
        WHERE id = 1 OR codigo = 'EDU-INI' OR nombre ILIKE '%INICIAL%';
    `);

    // 2. Crear tabla nivel_logro
    console.log('2️⃣ Creando tabla nivel_logro...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.nivel_logro (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL UNIQUE,
        codigo VARCHAR(10) NOT NULL UNIQUE,
        descripcion TEXT,
        orden INTEGER NOT NULL,
        color VARCHAR(20),
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed de los 4 niveles de logro
    await client.query(`
      INSERT INTO public.nivel_logro (nombre, codigo, orden, color, descripcion) VALUES
        ('En Desarrollo', 'ED', 1, '#EF4444', 'Demuestra avances iniciales; requiere acompañamiento continuo'),
        ('Desarrollo Aceptable', 'DA', 2, '#F59E0B', 'Alcanza el logro esperado con apoyo eventual'),
        ('Desarrollo Óptimo', 'DO', 3, '#3B82F6', 'Demuestra solvencia y autonomía en las actividades'),
        ('Desarrollo Pleno', 'DP', 4, '#10B981', 'Supera ampliamente las expectativas con iniciativa y creatividad')
      ON CONFLICT (codigo) DO UPDATE 
        SET nombre = EXCLUDED.nombre,
            orden = EXCLUDED.orden,
            color = EXCLUDED.color,
            descripcion = EXCLUDED.descripcion;
    `);

    // 3. Crear tabla indicador_logro
    console.log('3️⃣ Creando tabla indicador_logro...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.indicador_logro (
        id SERIAL PRIMARY KEY,
        grado_materia_id INTEGER NOT NULL REFERENCES public.grado_materia(id) ON DELETE CASCADE,
        periodo_evaluacion_id INTEGER REFERENCES public.periodo_evaluacion(id) ON DELETE SET NULL,
        descripcion TEXT NOT NULL,
        orden INTEGER NOT NULL DEFAULT 1,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_indicador_logro_gm ON public.indicador_logro(grado_materia_id);
    `);

    // 4. Crear tabla registro_cotejo
    console.log('4️⃣ Creando tabla registro_cotejo...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.registro_cotejo (
        id SERIAL PRIMARY KEY,
        matricula_id INTEGER NOT NULL REFERENCES public.matricula(id) ON DELETE CASCADE,
        indicador_logro_id INTEGER NOT NULL REFERENCES public.indicador_logro(id) ON DELETE CASCADE,
        periodo_evaluacion_id INTEGER NOT NULL REFERENCES public.periodo_evaluacion(id) ON DELETE RESTRICT,
        nivel_logro_id INTEGER REFERENCES public.nivel_logro(id) ON DELETE SET NULL,
        observaciones TEXT,
        registrado_por INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT registro_cotejo_unico UNIQUE (matricula_id, indicador_logro_id, periodo_evaluacion_id)
      );
      CREATE INDEX IF NOT EXISTS idx_registro_cotejo_mat_per ON public.registro_cotejo(matricula_id, periodo_evaluacion_id);
    `);

    // 5. Crear tabla informe_cualitativo
    console.log('5️⃣ Creando tabla informe_cualitativo...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.informe_cualitativo (
        id SERIAL PRIMARY KEY,
        matricula_id INTEGER NOT NULL REFERENCES public.matricula(id) ON DELETE CASCADE,
        periodo_evaluacion_id INTEGER NOT NULL REFERENCES public.periodo_evaluacion(id) ON DELETE RESTRICT,
        texto TEXT NOT NULL,
        generado_por_ia BOOLEAN DEFAULT false,
        estado VARCHAR(20) DEFAULT 'borrador' CHECK (estado IN ('borrador', 'publicado')),
        redactado_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
        fecha_publicacion TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT informe_cualitativo_unico UNIQUE (matricula_id, periodo_evaluacion_id)
      );
      CREATE INDEX IF NOT EXISTS idx_informe_cualitativo_mat_per ON public.informe_cualitativo(matricula_id, periodo_evaluacion_id);
    `);

    // 6. Permisos del módulo
    console.log('6️⃣ Insertando permisos y asignaciones de roles...');
    const permisosData = [
      { modulo: 'cotejo', accion: 'ver', nombre: 'cotejo.ver', descripcion: 'Ver listas de cotejo de Nivel Inicial' },
      { modulo: 'cotejo', accion: 'registrar', nombre: 'cotejo.registrar', descripcion: 'Registrar niveles de logro en la lista de cotejo' },
      { modulo: 'cotejo', accion: 'gestionar_indicadores', nombre: 'cotejo.gestionar_indicadores', descripcion: 'Crear y editar indicadores de logro de Inicial' },
      { modulo: 'informe_cualitativo', accion: 'ver', nombre: 'informe_cualitativo.ver', descripcion: 'Ver informes cualitativos de Inicial' },
      { modulo: 'informe_cualitativo', accion: 'redactar', nombre: 'informe_cualitativo.redactar', descripcion: 'Redactar y generar informe cualitativo' },
      { modulo: 'informe_cualitativo', accion: 'publicar', nombre: 'informe_cualitativo.publicar', descripcion: 'Publicar informe cualitativo a padres de familia' },
    ];

    for (const p of permisosData) {
      await client.query(`
        INSERT INTO public.permisos (modulo, accion, nombre, descripcion)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion;
      `, [p.modulo, p.accion, p.nombre, p.descripcion]);
    }

    // Asignar permisos a roles:
    // super_admin (1): todos
    // docente (3): cotejo.ver, cotejo.registrar, cotejo.gestionar_indicadores, informe_cualitativo.ver, informe_cualitativo.redactar, informe_cualitativo.publicar
    // secretaria (2): cotejo.ver, informe_cualitativo.ver, informe_cualitativo.publicar
    // padre (5) y estudiante (4): informe_cualitativo.ver
    const rolPermisos = [
      { rolId: 1, permisos: ['cotejo.ver', 'cotejo.registrar', 'cotejo.gestionar_indicadores', 'informe_cualitativo.ver', 'informe_cualitativo.redactar', 'informe_cualitativo.publicar'] },
      { rolId: 3, permisos: ['cotejo.ver', 'cotejo.registrar', 'cotejo.gestionar_indicadores', 'informe_cualitativo.ver', 'informe_cualitativo.redactar', 'informe_cualitativo.publicar'] },
      { rolId: 2, permisos: ['cotejo.ver', 'informe_cualitativo.ver', 'informe_cualitativo.publicar'] },
      { rolId: 4, permisos: ['informe_cualitativo.ver'] },
      { rolId: 5, permisos: ['informe_cualitativo.ver'] },
    ];

    for (const rp of rolPermisos) {
      for (const pName of rp.permisos) {
        await client.query(`
          INSERT INTO public.rol_permisos (rol_id, permiso_id)
          SELECT $1, id FROM public.permisos WHERE nombre = $2
          ON CONFLICT (rol_id, permiso_id) DO NOTHING;
        `, [rp.rolId, pName]);
      }
    }

    // 7. Seed de los 4 Campos en 'materia' y asociación a 'grado_materia'
    console.log('7️⃣ Creando campos curriculares de Inicial en materia...');
    const camposInicial = [
      {
        codigo: 'INI-COM',
        nombre: 'Desarrollo De La Comunicación, Lenguajes Y Artes',
        area_conocimiento_id: 1, // Comunidad y Sociedad
        descripcion:
          'Desarrollo de la expresión oral, gráfica, plástica, musical y corporal.'
      },
      {
        codigo: 'INI-CON',
        nombre: 'Desarrollo Del Conocimiento Y De La Producción',
        area_conocimiento_id: 2, // Ciencia, Tecnología y Producción
        descripcion:
          'Desarrollo del pensamiento lógico matemático, nociones temporo-espaciales y exploración del entorno.'
      },
      {
        codigo: 'INI-BIO',
        nombre: 'Desarrollo Bio Sicomotriz',
        area_conocimiento_id: 3, // Vida, Tierra y Territorio
        descripcion:
          'Desarrollo de la psicomotricidad gruesa, fina, esquema corporal, salud, nutrición y cuidado del cuerpo.'
      },
      {
        codigo: 'INI-SOC',
        nombre: 'Desarrollo Socio Cultural, Afectivo Y Espiritual',
        area_conocimiento_id: 4, // Cosmos y Pensamiento
        descripcion:
          'Desarrollo de la autoestima, autonomía, identidad, convivencia armónica y valores sociocomunitarios.'
      }
    ];

    const materiaIds = {};
    for (const c of camposInicial) {
      const res = await client.query(`
        INSERT INTO public.materia (codigo, nombre, area_conocimiento_id, descripcion, horas_semanales, es_obligatoria, activo)
        VALUES ($1, $2, $3, $4, 5, true, true)
        ON CONFLICT (codigo) DO UPDATE 
          SET nombre = EXCLUDED.nombre,
              area_conocimiento_id = EXCLUDED.area_conocimiento_id,
              descripcion = EXCLUDED.descripcion
        RETURNING id, codigo;
      `, [c.codigo, c.nombre, c.area_conocimiento_id, c.descripcion]);
      materiaIds[c.codigo] = res.rows[0].id;
    }

    // Asociar a grados de Inicial: PreKinder (id: 3) y Kínder (id: 4)
    console.log('8️⃣ Asociando campos a PreKinder y Kínder en grado_materia...');
    const gradosInicial = [3, 4];
    let orden = 1;
    for (const gradoId of gradosInicial) {
      orden = 1;
      for (const codigo of ['INI-COM', 'INI-CON', 'INI-BIO', 'INI-SOC']) {
        const matId = materiaIds[codigo];
        await client.query(`
          INSERT INTO public.grado_materia (grado_id, materia_id, orden, activo)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (grado_id, materia_id) DO NOTHING;
        `, [gradoId, matId, orden++]);
      }
    }

    await client.query('COMMIT');
    console.log(' Migración completada con éxito!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
