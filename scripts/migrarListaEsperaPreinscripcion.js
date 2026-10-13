// scripts/migrarListaEsperaPreinscripcion.js
import { pool } from '../src/db/pool.js';

async function migrar() {
  const client = await pool.connect();
  try {
    console.log('🔄 Verificando y aplicando migraciones para Lista de Espera en pre_inscripcion...');

    await client.query('BEGIN');

    // 1. Agregar columna posicion_espera si no existe
    await client.query(`
      ALTER TABLE pre_inscripcion 
      ADD COLUMN IF NOT EXISTS posicion_espera INTEGER DEFAULT 0;
    `);
    console.log('✅ Columna posicion_espera verificada/creada');

    // 2. Modificar el check constraint de estado si existe para permitir 'en_espera'
    // Primero buscamos los check constraints en pre_inscripcion para 'estado'
    const checkConstraints = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'pre_inscripcion' AND c.contype = 'c';
    `);

    for (const row of checkConstraints.rows) {
      if (row.def.includes('estado')) {
        console.log(`📌 Encontrado constraint de estado: ${row.conname} -> ${row.def}`);
        if (!row.def.includes("'en_espera'")) {
          console.log(`🔧 Actualizando constraint ${row.conname} para incluir 'en_espera'...`);
          await client.query(`ALTER TABLE pre_inscripcion DROP CONSTRAINT ${row.conname};`);
          await client.query(`
            ALTER TABLE pre_inscripcion ADD CONSTRAINT pre_inscripcion_estado_check CHECK (estado::text = ANY (ARRAY[
              'iniciada'::character varying, 
              'datos_completos'::character varying, 
              'documentos_pendientes'::character varying,
              'en_revision'::character varying, 
              'documentos_aprobados'::character varying,
              'entrevista_pendiente'::character varying,
              'entrevista_programada'::character varying,
              'entrevista_completada'::character varying,
              'aprobada'::character varying,
              'rechazada'::character varying,
              'convertida'::character varying,
              'expirada'::character varying,
              'cancelada'::character varying,
              'en_espera'::character varying
            ]::text[]));
          `);
          console.log('✅ Constraint actualizado con éxito');
        } else {
          console.log('✅ Constraint ya contiene "en_espera"');
        }
      }
    }

    // Si no había ningún check constraint de estado, crearlo asegurando 'en_espera'
    const tieneCheckEstado = checkConstraints.rows.some(r => r.def.includes('estado'));
    if (!tieneCheckEstado) {
      await client.query(`
        ALTER TABLE pre_inscripcion ADD CONSTRAINT pre_inscripcion_estado_check CHECK (estado::text = ANY (ARRAY[
          'iniciada'::character varying, 
          'datos_completos'::character varying, 
          'documentos_pendientes'::character varying,
          'en_revision'::character varying, 
          'documentos_aprobados'::character varying,
          'entrevista_pendiente'::character varying,
          'entrevista_programada'::character varying,
          'entrevista_completada'::character varying,
          'aprobada'::character varying,
          'rechazada'::character varying,
          'convertida'::character varying,
          'expirada'::character varying,
          'cancelada'::character varying,
          'en_espera'::character varying
        ]::text[]));
      `);
      console.log('✅ Nuevo constraint de estado creado con éxito');
    }

    await client.query('COMMIT');
    console.log('🎉 Migración completada correctamente.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

migrar();
