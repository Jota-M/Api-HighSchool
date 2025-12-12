// index.js
import dotenv from 'dotenv';
dotenv.config();

console.log('=== ENVIRONMENT DEBUG ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL first 30 chars:', process.env.DATABASE_URL?.substring(0, 30));
console.log('PORT:', process.env.PORT);
console.log('========================');

import app from './src/app.js';
import { getEnv } from './src/config/env.js';
import { pool } from './src/db/pool.js';

const { PORT } = getEnv();

async function startServer() {
  try {
    console.log('Attempting database connection...');
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW()');
      console.log('✅ Database connected:', result.rows[0]);
    } finally {
      client.release();
    }

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error starting server:', err);
    process.exit(1);
  }
}

startServer();