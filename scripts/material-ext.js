// seeds/crear_modulo_quiz.js
//
// Crea las tablas y secuencias del módulo de Quiz Automático.
//
// Ejecutar con:
// node seeds/crear_modulo_quiz.js

import { pool } from '../src/db/pool.js';

async function seed() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('🚀 Creando módulo de Quiz Automático...');

        await client.query(`
      -- =============================================
      -- MIGRACIÓN: Quiz automático por tema (Nivel 2)
      -- =============================================

      CREATE SEQUENCE IF NOT EXISTS tema_quiz_id_seq;

      CREATE TABLE IF NOT EXISTS public.tema_quiz (
        id integer NOT NULL DEFAULT nextval('tema_quiz_id_seq'::regclass),
        tema_id integer NOT NULL,
        pregunta text NOT NULL,
        opciones jsonb NOT NULL,
        respuesta_correcta integer NOT NULL
          CHECK (respuesta_correcta >= 0),
        explicacion text,
        orden integer DEFAULT 1,
        activo boolean DEFAULT true,
        generado_por_ia boolean DEFAULT true,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT tema_quiz_pkey PRIMARY KEY (id),
        CONSTRAINT tema_quiz_tema_id_fkey
          FOREIGN KEY (tema_id)
          REFERENCES public.tema(id)
      );

      CREATE INDEX IF NOT EXISTS idx_tema_quiz_tema_id
        ON public.tema_quiz(tema_id);

      CREATE SEQUENCE IF NOT EXISTS intento_quiz_id_seq;

      CREATE TABLE IF NOT EXISTS public.intento_quiz (
        id integer NOT NULL DEFAULT nextval('intento_quiz_id_seq'::regclass),
        tema_id integer NOT NULL,
        matricula_id integer NOT NULL,
        respuestas jsonb NOT NULL,
        total_preguntas integer NOT NULL,
        correctas integer NOT NULL,
        puntaje numeric NOT NULL
          CHECK (puntaje >= 0 AND puntaje <= 100),
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT intento_quiz_pkey PRIMARY KEY (id),
        CONSTRAINT intento_quiz_tema_id_fkey
          FOREIGN KEY (tema_id)
          REFERENCES public.tema(id),
        CONSTRAINT intento_quiz_matricula_id_fkey
          FOREIGN KEY (matricula_id)
          REFERENCES public.matricula(id)
      );

      CREATE INDEX IF NOT EXISTS idx_intento_quiz_tema_id
        ON public.intento_quiz(tema_id);

      CREATE INDEX IF NOT EXISTS idx_intento_quiz_matricula_id
        ON public.intento_quiz(matricula_id);
    `);

        await client.query('COMMIT');

        console.log(`
╔════════════════════════════════════╗
║  MÓDULO QUIZ CREADO CORRECTAMENTE  ║
╠════════════════════════════════════╣
║  Tabla: tema_quiz                 ║
║  Tabla: intento_quiz              ║
║  Índices creados                  ║
╚════════════════════════════════════╝
`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n💥 Error al crear el módulo Quiz:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();