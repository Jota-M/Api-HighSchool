import MaterialAsignado from '../models/MaterialAsignado.js';
import ActividadLog     from '../models/actividadLog.js';
import RequestInfo      from '../utils/requestInfo.js';
import { pool }         from '../db/pool.js';
 
class MaterialAsignadoController {
 
  /**
   * POST /api/prediccion/asignar-material
   *
   * El docente asigna uno o varios materiales a un estudiante.
   * Puede venir desde el análisis de Gemini (origen='gemini')
   * o desde la búsqueda manual (origen='manual').
   *
   * Body: {
   *   material_ids:          number[]   ← puede ser uno o varios
   *   matricula_id:          number
   *   asignacion_docente_id: number
   *   origen?:               'gemini' | 'manual'
   *   mensaje_docente?:      string
   * }
   */
  static async asignar(req, res) {
    try {
      const {
        material_ids,
        matricula_id,
        asignacion_docente_id,
        origen = 'manual',
        mensaje_docente,
      } = req.body;
 
      if (!material_ids?.length || !matricula_id || !asignacion_docente_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requieren: material_ids[], matricula_id, asignacion_docente_id',
        });
      }
 
      const asignados = [];
      for (const material_id of material_ids) {
        const reg = await MaterialAsignado.asignar({
          material_academico_id: parseInt(material_id),
          matricula_id:          parseInt(matricula_id),
          asignacion_docente_id: parseInt(asignacion_docente_id),
          asignado_por:          req.user.id,
          origen,
          mensaje_docente:       mensaje_docente || null,
        });
        asignados.push(reg);
      }
 
      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'asignar_material',
        modulo:         'prediccion',
        tabla_afectada: 'material_asignado_estudiante',
        datos_nuevos:   { material_ids, matricula_id, asignacion_docente_id, origen },
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `${asignados.length} material(es) asignado(s) — origen: ${origen}`,
      });
 
      return res.status(201).json({
        success: true,
        message: `${asignados.length} material(es) asignado(s) exitosamente`,
        data:    { asignados },
      });
 
    } catch (err) {
      console.error('[materialAsignado] asignar:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
 
  /**
   * GET /api/prediccion/materiales-asignados/:matricula_id
   * Query: ?asignacion_docente_id=X
   *
   * El docente ve qué materiales asignó a un estudiante específico.
   */
  static async listarPorEstudiante(req, res) {
    try {
      const { matricula_id }        = req.params;
      const { asignacion_docente_id } = req.query;
 
      if (!asignacion_docente_id) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id es requerido',
        });
      }
 
      const materiales = await MaterialAsignado.listarPorEstudiante(
        parseInt(matricula_id),
        parseInt(asignacion_docente_id),
      );
 
      return res.json({ success: true, data: { materiales } });
    } catch (err) {
      console.error('[materialAsignado] listarPorEstudiante:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
 
  /**
   * DELETE /api/prediccion/asignar-material/:id
   *
   * El docente quita una asignación.
   */
  static async quitar(req, res) {
    try {
      const reg = await MaterialAsignado.quitar(parseInt(req.params.id));
      if (!reg) {
        return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
      }
      return res.json({ success: true, message: 'Asignación eliminada' });
    } catch (err) {
      console.error('[materialAsignado] quitar:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
 
  /**
   * GET /api/estudianted/materiales-asignados
   *
   * El estudiante ve sus materiales asignados (desde su JWT).
   */
  static async listarParaEstudiante(req, res) {
    try {
      // Obtener matricula_id desde el JWT/usuario autenticado
      const { rows } = await pool.query(`
        SELECT m.id AS matricula_id
        FROM   matricula m
        JOIN   estudiante e ON e.id = m.estudiante_id
        WHERE  e.usuario_id = $1
          AND  m.estado     = 'activo'
          AND  m.deleted_at IS NULL
        ORDER BY m.created_at DESC
        LIMIT 1
      `, [req.user.id]);
 
      if (!rows[0]) {
        return res.json({ success: true, data: { materiales: [], total: 0, pendientes: 0 } });
      }
 
      const matricula_id = rows[0].matricula_id;
      const materiales   = await MaterialAsignado.listarParaEstudiante(matricula_id);
      const pendientes   = materiales.filter(m => !m.visto_por_estudiante).length;
 
      return res.json({
        success: true,
        data:    { materiales, total: materiales.length, pendientes },
      });
    } catch (err) {
      console.error('[materialAsignado] listarParaEstudiante:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
 
  /**
   * PATCH /api/estudianted/materiales-asignados/:id/visto
   *
   * El estudiante marca un material como visto.
   */
  static async marcarVisto(req, res) {
    try {
      const { rows } = await pool.query(`
        SELECT m.id FROM matricula m
        JOIN estudiante e ON e.id = m.estudiante_id
        WHERE e.usuario_id = $1 AND m.estado = 'activo' LIMIT 1
      `, [req.user.id]);
 
      if (!rows[0]) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }
 
      const reg = await MaterialAsignado.marcarVisto(
        parseInt(req.params.id),
        rows[0].id,
      );
 
      if (!reg) {
        return res.status(404).json({ success: false, message: 'Asignación no encontrada' });
      }
 
      return res.json({ success: true, message: 'Marcado como visto', data: { asignacion: reg } });
    } catch (err) {
      console.error('[materialAsignado] marcarVisto:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
 
  /**
   * GET /api/estudianted/materiales-asignados/pendientes
   *
   * Cuenta materiales no vistos (para badge).
   */
  static async pendientes(req, res) {
    try {
      const { rows } = await pool.query(`
        SELECT m.id FROM matricula m
        JOIN estudiante e ON e.id = m.estudiante_id
        WHERE e.usuario_id = $1 AND m.estado = 'activo' LIMIT 1
      `, [req.user.id]);
 
      if (!rows[0]) return res.json({ success: true, data: { total: 0 } });
 
      const total = await MaterialAsignado.contarPendientes(rows[0].id);
      return res.json({ success: true, data: { total } });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
 
export default MaterialAsignadoController;