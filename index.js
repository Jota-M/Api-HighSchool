// index.js
import dotenv from 'dotenv';
dotenv.config();

console.log('=== ENVIRONMENT DEBUG ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL first 30 chars:', process.env.DATABASE_URL?.substring(0, 30));
console.log('PORT:', process.env.PORT);
console.log('========================\n');

import app from './src/app.js';
import { getEnv } from './src/config/env.js';
import { pool } from './src/db/pool.js';

const { PORT } = getEnv();

// 🆕 Función de conexión con retry
async function connectWithRetry(maxRetries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Database connection attempt ${attempt}/${maxRetries}...`);
      console.time(`Connection attempt ${attempt}`);
      
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT NOW() as now');
        console.timeEnd(`Connection attempt ${attempt}`);
        console.log('✅ Database connected:', result.rows[0]);
        return result;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`❌ Connection attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${delayMs / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.error('💥 All connection attempts exhausted');
        throw error;
      }
    }
  }
}

// 🆕 Graceful shutdown
async function closePool() {
  try {
    console.log('🔌 Closing database pool...');
    await pool.end();
    console.log('✅ Database pool closed');
  } catch (error) {
    console.error('❌ Error closing pool:', error);
  }
}

async function startServer() {
  try {
    console.log('🚀 Starting server...\n');

    // 1️⃣ Iniciar servidor PRIMERO (Render detecta el puerto rápido)
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });

    // 2️⃣ Conectar a DB con retry (no bloquea el servidor)
    console.log('Attempting database connection...');
    await connectWithRetry(3, 5000);

    // 3️⃣ Manejar errores del servidor
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      process.exit(1);
    });

    // 4️⃣ Graceful shutdown handlers
    process.on('SIGTERM', async () => {
      console.log('\n⚠️  SIGTERM received: closing server...');
      server.close(async () => {
        console.log('🔌 HTTP server closed');
        await closePool();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('\n⚠️  SIGINT received: closing server...');
      server.close(async () => {
        console.log('🔌 HTTP server closed');
        await closePool();
        process.exit(0);
      });
    });

  } catch (err) {
    console.error('❌ Error starting server:', err);
    await closePool();
    process.exit(1);
  }
}

startServer();