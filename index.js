// index.js
import app from './src/app.js';
import dotenv from 'dotenv';
dotenv.config(); 
import { getEnv } from './src/config/env.js';
import { pool } from './src/db/pool.js';

const { PORT } = getEnv();

async function startServer() {
  try {
    // Conectar a la base de datos
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW()');
      console.log('Database connected:', result.rows[0]);
    } finally {
      client.release(); // liberar el cliente siempre
    }

    // Arrancar servidor
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1); // salir si falla la conexión a la DB
  }
}

startServer();
