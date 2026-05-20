// controllers/docenteController.js
import { pool } from '../db/pool.js';

export default class DocenteController {
  static async miPerfil(req, res) {
    try {
      const usuario_id = req.user.id; // viene del JWT / middleware authenticate

    const result = await pool.query(
      `SELECT id, nombres, apellidos, codigo, email, foto_url, especialidad
       FROM docente
       WHERE usuario_id = $1 AND deleted_at IS NULL AND activo = true
       LIMIT 1`,
      [usuario_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'No hay un perfil de docente vinculado a este usuario',
      });
    }

    res.json({ success: true, data: { docente: result.rows[0] } });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener perfil docente: ' + error.message,
    });
  }
    }
}