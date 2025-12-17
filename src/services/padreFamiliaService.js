// backend/services/padreFamiliaService.js
import { pool } from '../db/pool.js';
import { PadreFamilia } from '../models/Estudiantes.js';

class PadreFamiliaService {
  /**
   * Buscar padre por CI con información de sus hijos matriculados
   */
  static async buscarPorCI(ci) {
    const client = await pool.connect();
    try {
      // Buscar padre
      const padre = await PadreFamilia.findByCI(ci, client);
      
      if (!padre) {
        return {
          encontrado: false,
          padre: null,
          hijos: []
        };
      }

      // Obtener hijos matriculados actualmente
      const queryHijos = `
        SELECT 
          e.id,
          e.codigo,
          e.nombres,
          e.apellido_paterno,
          e.apellido_materno,
          g.nombre as grado_actual,
          p.nombre as paralelo,
          m.estado as estado_matricula
        FROM estudiante e
        INNER JOIN estudiante_tutor et ON et.estudiante_id = e.id
        LEFT JOIN LATERAL (
          SELECT m.*, pa.nombre as paralelo_nombre, g.nombre as grado_nombre
          FROM matricula m
          INNER JOIN paralelo pa ON m.paralelo_id = pa.id
          INNER JOIN grado g ON pa.grado_id = g.id
          WHERE m.estudiante_id = e.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) m ON true
        LEFT JOIN paralelo p ON m.paralelo_id = p.id
        LEFT JOIN grado g ON p.grado_id = g.id
        WHERE et.padre_familia_id = $1
          AND e.activo = true
          AND (m.estado = 'activo' OR m.estado IS NULL)
        ORDER BY e.nombres
      `;

      const resultHijos = await client.query(queryHijos, [padre.id]);

      return {
        encontrado: true,
        padre: {
          id: padre.id,
          nombres: padre.nombres,
          apellido_paterno: padre.apellido_paterno,
          apellido_materno: padre.apellido_materno,
          ci: padre.ci,
          telefono: padre.telefono,
          celular: padre.celular,
          email: padre.email,
          direccion: padre.direccion,
          ocupacion: padre.ocupacion,
          lugar_trabajo: padre.lugar_trabajo,
          tiene_hijos_matriculados: resultHijos.rows.length > 0
        },
        hijos: resultHijos.rows.map(hijo => ({
          id: hijo.id,
          codigo: hijo.codigo,
          nombres: hijo.nombres,
          apellido_paterno: hijo.apellido_paterno,
          apellido_materno: hijo.apellido_materno,
          grado_actual: hijo.grado_actual || 'Sin matrícula',
          paralelo: hijo.paralelo || '',
          estado_matricula: hijo.estado_matricula
        }))
      };

    } finally {
      client.release();
    }
  }

  /**
   * Verificar si un CI ya está registrado
   */
  static async existeCI(ci) {
    const padre = await PadreFamilia.findByCI(ci);
    return !!padre;
  }
}

export default PadreFamiliaService;