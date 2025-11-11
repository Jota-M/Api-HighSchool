import { pool } from "../db/pool.js";

export const MateriaModel = {
  /**
   * Obtener todas las materias
   */
  async getAll() {
    const { rows } = await pool.query(
      "SELECT * FROM materia ORDER BY codigo;"
    );
    return rows;
  },

  /**
   * Obtener una materia por ID
   */
  async getById(id) {
    const { rows } = await pool.query(
      "SELECT * FROM materia WHERE id = $1;",
      [id]
    );
    return rows[0];
  },

  /**
   * Obtener una materia por código
   */
  async getByCodigo(codigo) {
    const { rows } = await pool.query(
      "SELECT * FROM materia WHERE codigo = $1;",
      [codigo]
    );
    return rows[0];
  },

  /**
   * Crear una nueva materia
   */
  async create({ codigo, nombre, descripcion, horas_semanales, es_obligatoria }) {
    const { rows } = await pool.query(
      `INSERT INTO materia (codigo, nombre, descripcion, horas_semanales, es_obligatoria)
       VALUES ($1, $2, $3, $4, $5) RETURNING *;`,
      [codigo, nombre, descripcion, horas_semanales, es_obligatoria]
    );
    return rows[0];
  },

  /**
   * Actualizar una materia existente
   */
  async update(id, { codigo, nombre, descripcion, horas_semanales, es_obligatoria }) {
    const { rows } = await pool.query(
      `UPDATE materia
       SET codigo = $1, 
           nombre = $2, 
           descripcion = $3, 
           horas_semanales = $4, 
           es_obligatoria = $5
       WHERE id = $6 
       RETURNING *;`,
      [codigo, nombre, descripcion, horas_semanales, es_obligatoria, id]
    );
    return rows[0];
  },

  /**
   * Eliminar una materia
   */
  async delete(id) {
    await pool.query("DELETE FROM materia WHERE id = $1;", [id]);
  },

  /**
   * Obtener materias obligatorias
   */
  async getObligatorias() {
    const { rows } = await pool.query(
      "SELECT * FROM materia WHERE es_obligatoria = TRUE ORDER BY codigo;"
    );
    return rows;
  },

  /**
   * Obtener materias electivas
   */
  async getElectivas() {
    const { rows } = await pool.query(
      "SELECT * FROM materia WHERE es_obligatoria = FALSE ORDER BY codigo;"
    );
    return rows;
  },

  /**
   * Buscar materias por nombre
   */
  async searchByNombre(searchTerm) {
    const { rows } = await pool.query(
      `SELECT * FROM materia 
       WHERE nombre ILIKE $1 OR descripcion ILIKE $1 
       ORDER BY codigo;`,
      [`%${searchTerm}%`]
    );
    return rows;
  },

  /**
   * Validar si existe un código
   */
  async existsCodigo(codigo, excludeId = null) {
    let query = "SELECT id FROM materia WHERE codigo = $1";
    const params = [codigo];
    
    if (excludeId) {
      query += " AND id != $2";
      params.push(excludeId);
    }
    
    const { rows } = await pool.query(query, params);
    return rows.length > 0;
  },

  /**
   * Obtener estadísticas de materias
   */
  async getEstadisticas() {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN es_obligatoria = TRUE THEN 1 END) as obligatorias,
        COUNT(CASE WHEN es_obligatoria = FALSE THEN 1 END) as electivas,
        AVG(horas_semanales) as promedio_horas
      FROM materia;
    `);
    return rows[0];
  }
};