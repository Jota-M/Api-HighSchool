import { pool } from '../src/db/pool.js';

async function main() {
  try {
    const res = await pool.query(`
      SELECT 
        e.codigo, e.nombres, e.apellidos,
        iq.id, iq.tema_id, iq.matricula_id, iq.total_preguntas, iq.correctas, iq.puntaje, iq.created_at,
        iq.respuestas
      FROM intento_quiz iq
      JOIN matricula mat ON iq.matricula_id = mat.id
      JOIN estudiante e ON mat.estudiante_id = e.id
      WHERE e.codigo = 'EST-2026-0051'
      ORDER BY iq.created_at ASC
    `);
    for (const row of res.rows) {
      console.log('--- INTENTO id:', row.id, '---');
      console.log('Fecha:', row.created_at);
      console.log('Total:', row.total_preguntas, 'Correctas:', row.correctas, 'Puntaje:', row.puntaje);
      console.log('Respuestas:', JSON.stringify(row.respuestas));
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();
