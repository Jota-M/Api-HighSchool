const envs = {
    development: {
        PORT: process.env.PORT,
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
    },
    production: {
        PORT: process.env.PORT,
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
    }
};

export function getEnv(){
    return envs[process.env.NODE_ENV || 'development'];
};