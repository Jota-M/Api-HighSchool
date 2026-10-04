import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { pool } from '../src/db/pool.js';

async function check() {
  try {
    const res = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid) 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'reserva_cupo';
    `);
    console.log('CONSTRAINTS:', res.rows);

    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'reserva_cupo'
      ORDER BY ordinal_position;
    `);
    console.log('COLUMNS:', cols.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
