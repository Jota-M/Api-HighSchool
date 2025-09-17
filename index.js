import app from './src/app.js';
import {getEnv} from './src/config/env.js'
import { pool } from './src/db/pool.js';

const {PORT} = getEnv();

app.listen(PORT, () => {
    try{
        pool.connect((err,client, release) => {
            if(err) return console.log(err)
            client.query('SELECT NOW()', (err, result) => {
            
                console.log('Database connected:', result.rows);
                console.log(`Server running on port ${PORT}`);
                console.log(result.rows)
            }
        )})
    }catch(error){ 
        console.log(error)
    }
})