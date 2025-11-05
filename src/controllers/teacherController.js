import { TeacherModel } from "../models/teacherModel.js";
import { pool } from "../db/pool.js";

export const TeacherController = {
    async getTeachers(req, res) {
    try {
      const result = await pool.query(`
        SELECT id, first_name, last_name, mother_last_name, email,
               account_status, birth_date, level, subject
        FROM teachers
        ORDER BY id DESC;
      `);

      res.json(result.rows);
    } catch (error) {
      console.error("Error obteniendo docentes:", error);
      res.status(500).json({ message: "Error en el servidor" });
    }
  },
  async createTeacher(req, res) {
    try {
      const teacherData = req.body;
      const newTeacher = await TeacherModel.create(teacherData);

      res.status(201).json({
        message: "Docente creado exitosamente",
        data: newTeacher,
      });
    } catch (error) {
      console.error("Error creando docente:", error);
      res.status(500).json({ message: "Error en el servidor" });
    }
  },
};
