// scripts/migration_temario_inicial.js
import { pool } from '../src/db/pool.js';

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Iniciando migracion: Temario Inicial (actividad_inicial)...');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.actividad_inicial (
        id SERIAL PRIMARY KEY,
        grado_materia_id INTEGER NOT NULL REFERENCES public.grado_materia(id) ON DELETE CASCADE,
        campo_codigo VARCHAR(20) NOT NULL,
        tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('video', 'imagen', 'actividad', 'juego')),
        titulo VARCHAR(200) NOT NULL,
        descripcion TEXT,
        url TEXT,
        emoji VARCHAR(10) DEFAULT '⭐',
        color_fondo VARCHAR(20) DEFAULT '#6366F1',
        contenido_interactivo JSONB DEFAULT NULL,
        orden INTEGER NOT NULL DEFAULT 1,
        activo BOOLEAN DEFAULT true,
        creado_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Asegurar columna y constraint si la tabla ya existía
      ALTER TABLE public.actividad_inicial
        ADD COLUMN IF NOT EXISTS contenido_interactivo JSONB DEFAULT NULL;

      ALTER TABLE public.actividad_inicial
        DROP CONSTRAINT IF EXISTS actividad_inicial_tipo_check;

      ALTER TABLE public.actividad_inicial
        ADD CONSTRAINT actividad_inicial_tipo_check CHECK (tipo IN ('video', 'imagen', 'actividad', 'juego'));

      CREATE INDEX IF NOT EXISTS idx_actividad_inicial_gm ON public.actividad_inicial(grado_materia_id);
      CREATE INDEX IF NOT EXISTS idx_actividad_inicial_campo ON public.actividad_inicial(campo_codigo);
    `);

    // Permisos para el modulo
    const permisos = [
      { modulo: 'temario_inicial', accion: 'ver', nombre: 'temario_inicial.ver', descripcion: 'Ver actividades del temario de Inicial' },
      { modulo: 'temario_inicial', accion: 'gestionar', nombre: 'temario_inicial.gestionar', descripcion: 'Crear, editar y eliminar actividades del temario de Inicial' },
    ];
    for (const p of permisos) {
      await client.query(`
        INSERT INTO public.permisos (modulo, accion, nombre, descripcion)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion;
      `, [p.modulo, p.accion, p.nombre, p.descripcion]);
    }

    const roles = [
      { rolId: 1, permisos: ['temario_inicial.ver', 'temario_inicial.gestionar'] },
      { rolId: 3, permisos: ['temario_inicial.ver', 'temario_inicial.gestionar'] },
      { rolId: 2, permisos: ['temario_inicial.ver'] },
      { rolId: 4, permisos: ['temario_inicial.ver'] },
      { rolId: 5, permisos: ['temario_inicial.ver'] },
    ];
    for (const rp of roles) {
      for (const pName of rp.permisos) {
        await client.query(`
          INSERT INTO public.rol_permisos (rol_id, permiso_id)
          SELECT $1, id FROM public.permisos WHERE nombre = $2
          ON CONFLICT (rol_id, permiso_id) DO NOTHING;
        `, [rp.rolId, pName]);
      }
    }

    await client.query('COMMIT');
    console.log('Migracion completada: tabla actividad_inicial creada.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error durante la migracion:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
