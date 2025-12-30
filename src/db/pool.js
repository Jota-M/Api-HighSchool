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
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }
    : {
        user: env.user,
        host: env.host,
        port: env.port,
        database: env.database,
        password: env.password,
        ssl: { rejectUnauthorized: false },
        family: 4,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }
);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});
