import { pool } from '../db/pool.js';

export const ParaleloModel = {
  // Obtener todos los paralelos con información relacionada
  async getAll() {
  const query = `
    SELECT 
      p.*,
      g.nombre AS grado_nombre,
      g.nivel_academico_id,
      na.nombre AS nivel_nombre,
      na.orden AS nivel_orden,
      t.nombre AS turno_nombre,
      t.hora_inicio,
      t.hora_fin,
      0 AS total_estudiantes  -- no hay inscripciones aún
    FROM paralelo p
    INNER JOIN grado g ON p.grado_id = g.id
    INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
    INNER JOIN turno t ON p.turno_id = t.id
    ORDER BY na.orden, g.orden, p.nombre
  `;
  const result = await pool.query(query);
  return result.rows;
},


  // Obtener un paralelo por ID
  async getById(id) {
  const query = `
    SELECT 
      p.*,
      g.nombre AS grado_nombre,
      g.nivel_academico_id,
      na.nombre AS nivel_nombre,
      na.orden AS nivel_orden,
      t.nombre AS turno_nombre,
      t.hora_inicio,
      t.hora_fin,
      0 AS total_estudiantes
    FROM paralelo p
    INNER JOIN grado g ON p.grado_id = g.id
    INNER JOIN nivel_academico na ON g.nivel_academico_id = na.id
    INNER JOIN turno t ON p.turno_id = t.id
    WHERE p.id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
},


  // Crear un paralelo
  async create(data) {
    const { nombre, grado_id, turno_id, capacidad_maxima, anio } = data;
    const query = `
      INSERT INTO paralelo (nombre, grado_id, turno_id, capacidad_maxima, anio)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(query, [
      nombre,
      grado_id,
      turno_id,
      capacidad_maxima,
      anio
    ]);
    return result.rows[0];
  },

  // Actualizar un paralelo
  async update(id, data) {
    const { nombre, grado_id, turno_id, capacidad_maxima, anio } = data;
    const query = `
      UPDATE paralelo
      SET nombre = $1, grado_id = $2, turno_id = $3, 
          capacidad_maxima = $4, anio = $5
      WHERE id = $6
      RETURNING *
    `;
    const result = await pool.query(query, [
      nombre,
      grado_id,
      turno_id,
      capacidad_maxima,
      anio,
      id
    ]);
    return result.rows[0];
  },

  // Eliminar un paralelo
  async delete(id) {
    const query = 'DELETE FROM paralelo WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Obtener estadísticas (funciona aunque no haya estudiantes)
  async getEstadisticas() {
  const query = `
    SELECT 
      COUNT(*) AS total_paralelos,
      0 AS total_estudiantes,
      0 AS promedio_estudiantes,
      0 AS paralelos_llenos
    FROM paralelo;
  `;
  const result = await pool.query(query);
  return result.rows[0];
},


  // Obtener paralelos por grado
  async getByGrado(gradoId) {
  const query = `
    SELECT 
      p.*,
      t.nombre AS turno_nombre,
      t.hora_inicio,
      t.hora_fin,
      0 AS total_estudiantes
    FROM paralelo p
    INNER JOIN turno t ON p.turno_id = t.id
    WHERE p.grado_id = $1
    ORDER BY p.nombre;
  `;
  const result = await pool.query(query, [gradoId]);
  return result.rows;
},

};