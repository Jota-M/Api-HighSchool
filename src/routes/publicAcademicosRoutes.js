// routes/publicAcademicosRoutes.js
import express from 'express';
import { pool } from '../db/pool.js';

const router = express.Router();

/**
 * 🌐 Obtener periodo académico activo (PÚBLICO)
 */
router.get('/periodo-activo', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM periodo_academico 
      WHERE activo = true 
        AND permite_inscripciones = true
        AND deleted_at IS NULL
      ORDER BY fecha_inicio DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No hay período académico activo'
      });
    }

    res.json({
      success: true,
      data: {
        periodo: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error al obtener periodo activo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener periodo activo'
    });
  }
});

/**
 * 🌐 Listar grados activos (PÚBLICO)
 */
router.get('/grados', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        g.*,
        na.nombre as nivel_nombre
      FROM grado g
      INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
      WHERE g.activo = true 
        AND g.deleted_at IS NULL
        AND na.activo = true
      ORDER BY na.orden, g.orden
    `);

    res.json({
      success: true,
      data: {
        grados: result.rows
      }
    });
  } catch (error) {
    console.error('Error al listar grados:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar grados'
    });
  }
});

/**
 * 🌐 Listar turnos activos (PÚBLICO)
 */
router.get('/turnos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM turno 
      WHERE activo = true 
        AND deleted_at IS NULL
      ORDER BY hora_inicio
    `);

    res.json({
      success: true,
      data: {
        turnos: result.rows
      }
    });
  } catch (error) {
    console.error('Error al listar turnos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar turnos'
    });
  }
});

/**
 * 🌐 Listar niveles académicos activos (PÚBLICO)
 */
router.get('/niveles', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM nivel_academico 
      WHERE activo = true 
        AND deleted_at IS NULL
      ORDER BY orden
    `);

    res.json({
      success: true,
      data: {
        niveles: result.rows
      }
    });
  } catch (error) {
    console.error('Error al listar niveles:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar niveles'
    });
  }
});

export default router;