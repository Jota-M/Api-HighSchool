import express from 'express';
import morgan from 'morgan';  
import cors from 'cors';
import preinscripcionRoutes from './routes/preinscripcionRoutes.js';
import userRoutes from './routes/userRoutes.js';
import teacherRoutes from "./routes/teacherRoutes.js";
import periodoRoutes from "./routes/periodoRoutes.js";
import nivelRoutes from "./routes/nivelAcademicoRoutes.js";
import gradoRoutes from "./routes/gradoRoutes.js";
import paraleloRoutes from "./routes/paraleloRoutes.js";
import materiaRoutes from "./routes/materiaRoutes.js";
import gradoMateriaRoutes from "./routes/gradoMateriaRoutes.js";
import turnoRoutes from "./routes/turnoRoutes.js";

const app = express();

app.use(morgan('    dev'));  
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3001' })); 

app.use("/api/preinscripcion", preinscripcionRoutes);
app.use('/api/auth', userRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/periodos", periodoRoutes);
app.use("/api/niveles", nivelRoutes);
app.use("/api/grados", gradoRoutes);
app.use("/api/paralelos", paraleloRoutes);
app.use("/api/materias", materiaRoutes);
app.use("/api/grado-materias", gradoMateriaRoutes);
app.use('/api/turnos', turnoRoutes);


export default app;