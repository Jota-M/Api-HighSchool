// import pg from 'pg';
// import dotenv from 'dotenv';
// import { getEnv } from '../config/env.js';

// dotenv.config();

// const { user, host, port, database, password } = getEnv();

// export const pool = new pg.Pool({
//   user: user,
//   host: host,
//   port: port,
//   database: database,
//   password: password,
//   ssl: {
//     rejectUnauthorized: false, 
//   },
// });
import pg from 'pg';
import dotenv from 'dotenv';
import { getEnv } from '../config/env.js';

dotenv.config();
const { user, host, port, database, password } = getEnv();
export const pool = new pg.Pool({
    user: user,
    host: host,
    port: port,
    database: database,
    password: password,
});