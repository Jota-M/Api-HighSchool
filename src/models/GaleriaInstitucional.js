// models/GaleriaInstitucional.js
import { pool } from '../db/pool.js';

class GaleriaInstitucional {
    // ─── Lectura pública (cualquier rol logueado) ──────────────────────────
    // Las que se muestran HOY en el carrusel: activas y dentro de su rango
    // de fechas (o sin fechas, que equivale a "siempre vigente").
    static async findVigentes() {
        const result = await pool.query(`
      SELECT id, titulo, imagen_url, orden, fecha_inicio, fecha_fin
      FROM galeria_institucional
      WHERE activo = true
        AND (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_DATE)
        AND (fecha_fin    IS NULL OR fecha_fin    >= CURRENT_DATE)
      ORDER BY orden ASC, creado_en DESC
    `);
        return result.rows;
    }

    // ─── Gestión (admin/secretaría) ────────────────────────────────────────
    // Trae todo — incluidas inactivas y vencidas — para la pantalla de
    // administración, con el mismo shape de paginación que el resto de
    // los módulos (findAll con page/limit).
    static async findAll(filters = {}) {
        const { activo, vigente, page = 1, limit = 20 } = filters;
        const offset = (page - 1) * limit;

        let where = [];
        let params = [];
        let p = 1;

        if (activo !== undefined) { where.push(`activo = $${p++}`); params.push(activo); }
        if (vigente === true) {
            where.push(`(fecha_inicio IS NULL OR fecha_inicio <= CURRENT_DATE)`);
            where.push(`(fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)`);
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM galeria_institucional ${whereClause}`, params
        );
        const total = parseInt(countResult.rows[0].count);

        const result = await pool.query(`
      SELECT g.*, u.username AS creado_por_username
      FROM galeria_institucional g
      LEFT JOIN usuarios u ON g.creado_por = u.id
      ${whereClause}
      ORDER BY g.orden ASC, g.creado_en DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]);

        return {
            fotos: result.rows,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            total_paginas: Math.ceil(total / limit)
        };
    }

    static async findById(id) {
        const result = await pool.query(
            `SELECT g.*, u.username AS creado_por_username
       FROM galeria_institucional g
       LEFT JOIN usuarios u ON g.creado_por = u.id
       WHERE g.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    }

    static async create(data) {
        const {
            titulo, imagen_url, cloudinary_public_id,
            orden = 0, fecha_inicio = null, fecha_fin = null, creado_por
        } = data;

        const result = await pool.query(
            `INSERT INTO galeria_institucional
        (titulo, imagen_url, cloudinary_public_id, orden, fecha_inicio, fecha_fin, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
            [titulo, imagen_url, cloudinary_public_id, orden, fecha_inicio, fecha_fin, creado_por]
        );
        return result.rows[0];
    }

    // Update parcial — solo pisa los campos que vienen definidos en `data`,
    // así el front puede mandar nada más que lo que cambió (ej. solo el
    // título, sin tener que reenviar la imagen).
    static async update(id, data) {
        const campos = ['titulo', 'imagen_url', 'cloudinary_public_id', 'orden', 'fecha_inicio', 'fecha_fin', 'activo'];
        const sets = [];
        const params = [];
        let p = 1;

        for (const campo of campos) {
            if (data[campo] !== undefined) {
                sets.push(`${campo} = $${p++}`);
                params.push(data[campo]);
            }
        }

        if (sets.length === 0) return this.findById(id);

        params.push(id);
        const result = await pool.query(
            `UPDATE galeria_institucional SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
            params
        );
        return result.rows[0] || null;
    }

    static async delete(id) {
        const result = await pool.query(
            `DELETE FROM galeria_institucional WHERE id = $1 RETURNING id, cloudinary_public_id`,
            [id]
        );
        return result.rows[0] || null;
    }
}

export default GaleriaInstitucional;