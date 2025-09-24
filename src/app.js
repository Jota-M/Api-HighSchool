import express from 'express';
import morgan from 'morgan';  
import cors from 'cors';
import preinscripcionRoutes from './routes/preinscripcionRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();

app.use(morgan('    dev'));  
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3001' })); 

app.use('/api/preinscripcion', preinscripcionRoutes);
app.use('/api/auth', userRoutes);
export default app;