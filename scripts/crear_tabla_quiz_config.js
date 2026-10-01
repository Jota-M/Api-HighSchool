// scripts/crear_tabla_quiz_config.js
import { pool } from '../src/db/pool.js';

async function main() {
  const client = await pool.connect();
  try {
    console.log('Creando tabla tema_quiz_config...');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.tema_quiz_config (
        id serial PRIMARY KEY,
        tema_id integer NOT NULL REFERENCES public.tema(id) ON DELETE CASCADE,
        paralelo_id integer NOT NULL REFERENCES public.paralelo(id) ON DELETE CASCADE,
        activo boolean NOT NULL DEFAULT true,
        fecha_inicio timestamp without time zone NULL,
        fecha_fin timestamp without time zone NULL,
        limite_intentos integer DEFAULT 1,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_tema_quiz_config_tema_paralelo UNIQUE (tema_id, paralelo_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tema_quiz_config_tema_id
        ON public.tema_quiz_config(tema_id);

      CREATE INDEX IF NOT EXISTS idx_tema_quiz_config_paralelo_id
        ON public.tema_quiz_config(paralelo_id);
    `);

    await client.query('COMMIT');
    console.log('Tabla tema_quiz_config creada exitosamente.');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear tabla tema_quiz_config:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

main();
