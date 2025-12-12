import pg from 'pg';
import dotenv from 'dotenv';
import { getEnv } from '../config/env.js';

dotenv.config();

const env = getEnv();

export const pool = new pg.Pool(
  env.connectionString 
    ? {
        connectionString: env.connectionString,
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: env.user,
        host: env.host,
        port: env.port,
        database: env.database,
        password: env.password,
        ssl: { rejectUnauthorized: false },
        family: 4
      }
);