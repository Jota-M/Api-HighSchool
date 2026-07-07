import MaterialAsignado from '../models/MaterialAsignado.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import { pool } from '../db/pool.js';
import { buscarVideo } from '../utils/youtubeClient.js';

const ML_BASE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000/api/v1';
const ML_TIMEOUT = parseInt(process.env.ML_TIMEOUT_MS || '20000');

async function buscarVideosConML(base) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ML_TIMEOUT);

  try {
    const response = await fetch(`${ML_BASE_URL}/materiales/recursos-externos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tema_titulo: base.tema_titulo,
        tema_descripcion: base.tema_descripcion || null,
        palabras_clave: base.palabras_clave || null,
        nivel_dificultad: base.nivel_dificultad || null,
        objetivos_unidad: null,
        nivel_educativo: [base.nivel_nombre, base.grado_nombre].filter(Boolean).join(' ') || null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (!data.gemini_disponible || !Array.isArray(data.recursos)) return [];

    return data.recursos
      .filter(r => r?.url && r?.titulo)
      .map(r => ({
        titulo: r.titulo,
        url: r.url,
        origen_externo: r.origen_externo || 'youtube',
      }));
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('[materialAsignado] ML videos no disponible:', err.message);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

class MaterialAsignadoController {

  /**
   * POST /api/prediccion/asignar-material
   *
   * El docente asigna uno o varios materiales a un estudiante.
   * También puede asignar recursos externos (YouTube/web) sugeridos por IA.
   * Puede venir desde el análisis de Gemini (origen='gemini')
   * o desde la búsqueda manual (origen='manual').
   *
   * Body: {
   *   material_ids?:         number[]   ← puede ser uno o varios
   *   recursos_externos?:    Array<{
   *     url?: string,
   *     search_query?: string,
   *     titulo: string,
   *     origen_externo?: string
   *   }>
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
        recursos_externos = [],
      } = req.body;

      const tieneMaterialesInternos = Array.isArray(material_ids) && material_ids.length > 0;
      const tieneRecursosExternos = Array.isArray(recursos_externos) && recursos_externos.length > 0;

      if ((!tieneMaterialesInternos && !tieneRecursosExternos) || !matricula_id || !asignacion_docente_id) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere material_ids[] o recursos_externos[], además de matricula_id y asignacion_docente_id',
        });
      }

      const asignados = [];
      if (tieneMaterialesInternos) {
        for (const material_id of material_ids) {
          const reg = await MaterialAsignado.asignar({
            material_academico_id: parseInt(material_id),
            matricula_id: parseInt(matricula_id),
            asignacion_docente_id: parseInt(asignacion_docente_id),
            asignado_por: req.user.id,
            origen,
            mensaje_docente: mensaje_docente || null,
          });
          asignados.push(reg);
        }
      }

      if (tieneRecursosExternos) {
        for (const recurso of recursos_externos) {
          let url = recurso?.url?.trim();
          let titulo = recurso?.titulo?.trim();
          const searchQuery = recurso?.search_query?.trim();

          if (!url && searchQuery) {
            const video = await buscarVideo(searchQuery);
            if (video) {
              url = video.url;
              titulo = video.titulo || titulo;
            }
          }

          if (!url || !titulo) {
            return res.status(400).json({
              success: false,
              message: 'Cada recurso externo requiere url o search_query, además de titulo',
            });
          }

          const reg = await MaterialAsignado.asignarExterno({
            url_recurso_externo: url,
            titulo_recurso_externo: titulo,
            origen_externo: recurso.origen_externo || 'youtube',
            matricula_id: parseInt(matricula_id),
            asignacion_docente_id: parseInt(asignacion_docente_id),
            asignado_por: req.user.id,
            mensaje_docente: mensaje_docente || null,
          });
          asignados.push(reg);
        }
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'asignar_material',
        modulo: 'prediccion',
        tabla_afectada: 'material_asignado_estudiante',
        datos_nuevos: {
          material_ids: tieneMaterialesInternos ? material_ids : [],
          recursos_externos: tieneRecursosExternos
            ? recursos_externos.map(r => ({
              url: r.url,
              search_query: r.search_query,
              titulo: r.titulo,
              origen_externo: r.origen_externo || 'youtube',
            }))
            : [],
          matricula_id,
          asignacion_docente_id,
          origen,
        },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `${asignados.length} recurso(s) asignado(s) — origen: ${origen}`,
      });

      return res.status(201).json({
        success: true,
        message: `${asignados.length} recurso(s) asignado(s) exitosamente`,
        data: { asignados },
      });

    } catch (err) {
      console.error('[materialAsignado] asignar:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/prediccion/videos-recomendados/:matricula_id
   * Query: ?asignacion_docente_id=X&periodo_evaluacion_id=Y
   *
   * Sugiere videos reales de YouTube usando primero temas donde el estudiante
   * tuvo nota baja. Si aún no hay notas bajas con tema, usa temas del temario.
   */
  static async videosRecomendados(req, res) {
    try {
      const { matricula_id } = req.params;
      const { asignacion_docente_id, periodo_evaluacion_id } = req.query;

      if (!asignacion_docente_id) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id es requerido',
        });
      }

      const params = [parseInt(matricula_id), parseInt(asignacion_docente_id)];
      let periodoSql = '';
      if (periodo_evaluacion_id) {
        params.push(parseInt(periodo_evaluacion_id));
        periodoSql = `AND e.periodo_evaluacion_id = $${params.length}`;
      }

      const { rows: debilidades } = await pool.query(`
        SELECT
          t.id                       AS tema_id,
          t.titulo                   AS tema_titulo,
          t.descripcion              AS tema_descripcion,
          t.palabras_clave           AS palabras_clave,
          t.nivel_dificultad         AS nivel_dificultad,
          e.nombre                   AS evaluacion_nombre,
          ROUND((c.puntaje_obtenido::NUMERIC / NULLIF(e.puntaje_maximo, 0)) * 100, 1) AS nota_sobre_100,
          mat.nombre                 AS materia_nombre,
          g.nombre                   AS grado_nombre,
          na.nombre                  AS nivel_nombre
        FROM calificacion c
        JOIN evaluacion e             ON e.id = c.evaluacion_id
        JOIN asignacion_docente ad     ON ad.id = e.asignacion_docente_id
        JOIN grado_materia gm          ON gm.id = ad.grado_materia_id
        JOIN materia mat               ON mat.id = gm.materia_id
        JOIN grado g                   ON g.id = gm.grado_id
        LEFT JOIN nivel_academico na   ON na.id = g.nivel_academico_id
        JOIN tema t                    ON t.id = e.tema_id
        WHERE c.matricula_id = $1
          AND e.asignacion_docente_id = $2
          ${periodoSql}
          AND e.activo = true
          AND c.puntaje_obtenido IS NOT NULL
          AND e.puntaje_maximo > 0
          AND ((c.puntaje_obtenido::FLOAT / NULLIF(e.puntaje_maximo, 0)) * 100) < 60
        ORDER BY nota_sobre_100 ASC, c.fecha_registro DESC
        LIMIT 4
      `, params);

      let bases = debilidades.map(d => ({
        ...d,
        fuente: 'nota_baja',
      }));

      if (bases.length === 0) {
        const fallbackParams = [parseInt(asignacion_docente_id)];
        let fallbackPeriodoSql = '';
        if (periodo_evaluacion_id) {
          fallbackParams.push(parseInt(periodo_evaluacion_id));
          fallbackPeriodoSql = `AND (u.periodo_evaluacion_id IS NULL OR u.periodo_evaluacion_id = $${fallbackParams.length})`;
        }

        const { rows: temas } = await pool.query(`
          SELECT
            t.id                     AS tema_id,
            t.titulo                 AS tema_titulo,
            t.descripcion            AS tema_descripcion,
            t.palabras_clave         AS palabras_clave,
            t.nivel_dificultad       AS nivel_dificultad,
            NULL::TEXT               AS evaluacion_nombre,
            NULL::NUMERIC            AS nota_sobre_100,
            mat.nombre               AS materia_nombre,
            g.nombre                 AS grado_nombre,
            na.nombre                AS nivel_nombre
          FROM asignacion_docente ad
          JOIN grado_materia gm        ON gm.id = ad.grado_materia_id
          JOIN materia mat             ON mat.id = gm.materia_id
          JOIN grado g                 ON g.id = gm.grado_id
          LEFT JOIN nivel_academico na ON na.id = g.nivel_academico_id
          JOIN unidad_tematica u       ON u.grado_materia_id = gm.id
          JOIN tema t                  ON t.unidad_tematica_id = u.id
          WHERE ad.id = $1
            AND u.activo = true
            AND t.activo = true
            ${fallbackPeriodoSql}
          ORDER BY u.numero_unidad, t.numero_tema, t.orden
          LIMIT 4
        `, fallbackParams);

        bases = temas.map(t => ({
          ...t,
          fuente: 'temario',
        }));
      }

      const recursos = [];
      const urls = new Set();

      for (const base of bases) {
        if (recursos.length >= 4) break;

        const videosML = await buscarVideosConML(base);
        for (const video of videosML) {
          if (recursos.length >= 4) break;
          if (urls.has(video.url)) continue;

          urls.add(video.url);
          recursos.push({
            titulo: video.titulo,
            url: video.url,
            origen_externo: video.origen_externo || 'youtube',
            tipo: 'VIDEO',
            tema_id: base.tema_id,
            tema_titulo: base.tema_titulo,
            search_query: null,
            razon: base.fuente === 'nota_baja' && base.nota_sobre_100 != null
              ? `Recomendado porque obtuvo ${base.nota_sobre_100}/100 en "${base.evaluacion_nombre}" sobre este tema.`
              : `Recomendado como refuerzo del tema "${base.tema_titulo}".`,
          });
        }

        if (videosML.length > 0) continue;

        const nivel = [base.nivel_nombre, base.grado_nombre].filter(Boolean).join(' ');
        const queries = [
          `${base.tema_titulo} ${base.materia_nombre} explicación ${nivel}`.trim(),
          `${base.tema_titulo} ejercicios resueltos ${base.materia_nombre} ${nivel}`.trim(),
        ];

        for (const query of queries) {
          if (recursos.length >= 4) break;

          const video = await buscarVideo(query);
          if (!video || urls.has(video.url)) continue;

          urls.add(video.url);
          recursos.push({
            titulo: video.titulo,
            url: video.url,
            origen_externo: 'youtube',
            tipo: 'VIDEO',
            tema_id: base.tema_id,
            tema_titulo: base.tema_titulo,
            search_query: query,
            razon: base.fuente === 'nota_baja' && base.nota_sobre_100 != null
              ? `Recomendado porque obtuvo ${base.nota_sobre_100}/100 en "${base.evaluacion_nombre}" sobre este tema.`
              : `Recomendado como refuerzo del tema "${base.tema_titulo}".`,
          });
        }
      }

      return res.json({
        success: true,
        data: {
          recursos,
          total: recursos.length,
          fuente: debilidades.length > 0 ? 'nota_baja' : 'temario',
        },
      });

    } catch (err) {
      console.error('[materialAsignado] videosRecomendados:', err.message);
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
      const { matricula_id } = req.params;
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
      const materiales = await MaterialAsignado.listarParaEstudiante(matricula_id);
      const pendientes = materiales.filter(m => !m.visto_por_estudiante).length;

      return res.json({
        success: true,
        data: { materiales, total: materiales.length, pendientes },
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
