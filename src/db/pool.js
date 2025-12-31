import pg from 'pg';
import dotenv from 'dotenv';
import { getEnv } from '../config/env.js';
import dns from 'dns';

// Forzar resolución DNS a IPv4
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const env = getEnv();

console.log('Pool config:', env.connectionString ? 'Using connectionString' : 'Using individual params');

export const pool = new pg.Pool(
  env.connectionString 
    ? {
        connectionString: env.connectionString,
        ssl: { rejectUnauthorized: false },
        // 🆕 TIMEOUTS AUMENTADOS para cold starts
        connectionTimeoutMillis: 30000,  // 30 segundos (antes: 0 = sin límite pero falla rápido)
        idleTimeoutMillis: 30000,        // 30 segundos
        query_timeout: 60000,            // 60 segundos para queries
        statement_timeout: 60000,        // 60 segundos para statements
        max: 20,                         // Máximo de conexiones en el pool
        min: 2,                          // Mínimo de conexiones activas
        allowExitOnIdle: false           // No cerrar el pool si está idle
      }
    : {
        user: env.user,
        host: env.host,
        port: env.port,
        database: env.database,
        password: env.password,
        ssl: { rejectUnauthorized: false },
        family: 4,
        // 🆕 TIMEOUTS AUMENTADOS
        connectionTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        query_timeout: 60000,
        statement_timeout: 60000,
        max: 20,
        min: 2,
        allowExitOnIdle: false
      }
);

// 🆕 EVENT HANDLERS para debugging
pool.on('connect', () => {
  console.log('✅ New client connected to the pool');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

pool.on('remove', () => {
  console.log('🔌 Client removed from pool');
});

// 🆕 FUNCIÓN DE CONEXIÓN CON RETRY
export async function connectWithRetry(maxRetries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Database connection attempt ${attempt}/${maxRetries}...`);
      console.time(`Connection attempt ${attempt}`);
      
      const result = await pool.query('SELECT NOW() as now, version() as version');
      
      console.timeEnd(`Connection attempt ${attempt}`);
      console.log('✅ Database connected successfully');
      console.log('📅 Server time:', result.rows[0].now);
      console.log('🗄️  PostgreSQL version:', result.rows[0].version.split(' ')[1]);
      
      return result;
    } catch (error) {
      console.error(`❌ Connection attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${delayMs / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.error('💥 All connection attempts failed');
        throw error;
      }
    }
  }
}

// 🆕 HEALTH CHECK mejorado
export async function checkDatabaseHealth() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    return { 
      success: true, 
      timestamp: result.rows[0].now,
      poolSize: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// 🆕 GRACEFUL SHUTDOWN
export async function closePool() {
  try {
    console.log('🔌 Closing database pool...');
    await pool.end();
    console.log('✅ Database pool closed successfully');
  } catch (error) {
    console.error('❌ Error closing pool:', error);
  }
}

// Manejar señales de terminación
process.on('SIGTERM', async () => {
  console.log('⚠️  SIGTERM received');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('⚠️  SIGINT received');
  await closePool();
  process.exit(0);
});