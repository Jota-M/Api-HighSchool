// controllers/estudiantedController.js
import EstudianteDashboard from '../models/EstudianteDashboard.js';
import { AccesoMaterial, ComentarioMaterial, FavoritoMaterial, ProgresoEstudiante } from '../models/Material.js';
import RequestInfo from '../utils/requestInfo.js';
import { pool } from '../db/pool.js';

// ─────────────────────────────────────────────────────────────
// PERFIL
// ─────────────────────────────────────────────────────────────
class EstudiantePerfilController {

  /**
   * GET /api/estudiante/perfil
   * Datos del estudiante autenticado + matrícula activa + grado/paralelo/turno.
   */
  static async getPerfil(req, res) {
    try {
      const perfil = await EstudianteDashboard.getPerfil(req.user.id);

      if (!perfil) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró matrícula activa para este usuario'
        });
      }

      res.json({ success: true, data: { perfil } });
    } catch (error) {
      console.error('Error al obtener perfil del estudiante:', error);
      res.status(500).json({ success: false, message: 'Error al obtener perfil: ' + error.message });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// MATERIAS
// ─────────────────────────────────────────────────────────────
class EstudianteMateriasController {

  /**
   * GET /api/estudiante/mis-materias
   * Todas las materias del estudiante con resumen (materiales, progreso, notas, asistencia).
   * Query: ?periodo_evaluacion_id=X (opcional, filtra por trimestre)
   *
   * Flujo de uso en frontend:
   *   1. Estudiante inicia sesión
   *   2. GET /mis-materias → ve sus materias con card resumen
   *   3. Selecciona materia → GET /mis-materias/:grado_materia_id/temario
   *   4. Selecciona tema → GET /mis-materias/:asignacion_docente_id/materiales?tema_id=X
   */
  static async getMisMaterias(req, res) {
    try {
      const { periodo_evaluacion_id } = req.query;

      const materias = await EstudianteDashboard.getMisMaterias(
        req.user.id,
        periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : null
      );

      if (!materias.length) {
        return res.status(404).json({
          success: false,
          message: 'No se encontraron materias activas para este estudiante'
        });
      }

      res.json({
        success: true,
        data: {
          total: materias.length,
          materias
        }
      });
    } catch (error) {
      console.error('Error al obtener materias del estudiante:', error);
      res.status(500).json({ success: false, message: 'Error al obtener materias: ' + error.message });
    }
  }

  /**
   * GET /api/estudiante/mis-materias/:grado_materia_id/temario
   * Temario completo de una materia (unidades + temas) con el progreso del estudiante.
   * Valida que la materia pertenezca al grado del estudiante.
   */
  static async getTemario(req, res) {
    try {
      const { grado_materia_id } = req.params;

      const temario = await EstudianteDashboard.getDetalleMateriaConTemario(
        req.user.id,
        parseInt(grado_materia_id)
      );

      if (!temario) {
        return res.status(404).json({
          success: false,
          message: 'Materia no encontrada o no pertenece a tu grado'
        });
      }

      res.json({ success: true, data: { temario } });
    } catch (error) {
      console.error('Error al obtener temario:', error);
      res.status(500).json({ success: false, message: 'Error al obtener temario: ' + error.message });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// MATERIALES
// ─────────────────────────────────────────────────────────────

class EstudianteMaterialesController {

  /**
   * GET /api/estudiante/materiales/:asignacion_docente_id
   * Lista materiales publicados y visibles de una materia.
   * Query: ?tipo_material_id=X&tema_id=Y&page=1&limit=20
   */
  static async listar(req, res) {
    try {
      const { asignacion_docente_id } = req.params;
      const { tipo_material_id, tema_id, page, limit } = req.query;

      const result = await EstudianteDashboard.getMaterialesDeMateriaParaEstudiante(
        req.user.id,
        parseInt(asignacion_docente_id),
        {
          tipo_material_id: tipo_material_id ? parseInt(tipo_material_id) : undefined,
          tema_id:          tema_id          ? parseInt(tema_id)          : undefined,
          page:             parseInt(page)   || 1,
          limit:            parseInt(limit)  || 20
        }
      );

      if (!result.paginacion) {
        return res.status(403).json({
          success: false,
          message: 'No tienes acceso a esta materia'
        });
      }

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Error al listar materiales:', error);
      res.status(500).json({ success: false, message: 'Error al listar materiales: ' + error.message });
    }
  }

  /**
   * GET /api/estudiante/materiales/:asignacion_docente_id/buscar
   * Búsqueda full-text en los materiales de una materia.
   * Query: ?q=algebra&tipo_material_id=X
   */
  static async buscar(req, res) {
    try {
      const { q, tipo_material_id } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'El término de búsqueda debe tener al menos 2 caracteres'
        });
      }

      const materiales = await EstudianteDashboard.buscarMateriales(
        req.user.id,
        q.trim(),
        { tipo_material_id: tipo_material_id ? parseInt(tipo_material_id) : undefined }
      );

      res.json({ success: true, data: { materiales, total: materiales.length } });
    } catch (error) {
      console.error('Error en búsqueda:', error);
      res.status(500).json({ success: false, message: 'Error en búsqueda: ' + error.message });
    }
  }

  /**
   * GET /api/estudiante/material/:material_id
   * Detalle de un material. Valida que el estudiante tenga acceso.
   */
  static async obtenerDetalle(req, res) {
    try {
      const material = await EstudianteDashboard.getMaterialDetalle(
        req.user.id,
        parseInt(req.params.material_id)
      );

      if (!material) {
        return res.status(404).json({
          success: false,
          message: 'Material no encontrado o no tienes acceso'
        });
      }

      res.json({ success: true, data: { material } });
    } catch (error) {
      console.error('Error al obtener material:', error);
      res.status(500).json({ success: false, message: 'Error al obtener material: ' + error.message });
    }
  }

  /**
   * POST /api/estudiante/material/:material_id/acceso
   * Registra que el estudiante vio o descargó el material.
   * El trigger en BD actualiza contadores y progreso automáticamente.
   * Body: { tipo_accion, dispositivo?, duracion_segundos?, completado? }
   */
  static async registrarAcceso(req, res) {
    try {
      const { material_id } = req.params;
      const { tipo_accion, dispositivo, duracion_segundos, completado } = req.body;

      const tiposValidos = ['visualizacion', 'descarga', 'compartido', 'impresion'];
      if (!tipo_accion || !tiposValidos.includes(tipo_accion)) {
        return res.status(400).json({
          success: false,
          message: `tipo_accion inválido. Debe ser: ${tiposValidos.join(', ')}`
        });
      }

      // Obtener matricula_id del material (ya validado en getMaterialDetalle)
      const material = await EstudianteDashboard.getMaterialDetalle(req.user.id, parseInt(material_id));
      if (!material) {
        return res.status(404).json({ success: false, message: 'Material no encontrado o sin acceso' });
      }

      const reqInfo = RequestInfo.extract(req);
      const acceso = await AccesoMaterial.registrar({
        material_academico_id: parseInt(material_id),
        matricula_id:          material.matricula_id,
        usuario_id:            req.user.id,
        tipo_accion,
        ip_address:            reqInfo.ip,
        user_agent:            reqInfo.userAgent,
        dispositivo:           dispositivo || 'web',
        duracion_segundos:     duracion_segundos ? parseInt(duracion_segundos) : null,
        completado:            completado ?? false
      });

      res.status(201).json({ success: true, data: { acceso } });
    } catch (error) {
      console.error('Error al registrar acceso:', error);
      res.status(500).json({ success: false, message: 'Error al registrar acceso: ' + error.message });
    }
  }

  /**
   * POST /api/estudiante/material/:material_id/favorito
   * Toggle favorito: agrega si no existe, quita si ya existe.
   * Body: { notas_personales? }
   */
  static async toggleFavorito(req, res) {
    try {
      const { material_id } = req.params;
      const { notas_personales } = req.body;

      // Verificar acceso y obtener matricula_id
      const material = await EstudianteDashboard.getMaterialDetalle(req.user.id, parseInt(material_id));
      if (!material) {
        return res.status(404).json({ success: false, message: 'Material no encontrado o sin acceso' });
      }

      const resultado = await FavoritoMaterial.toggle(
        parseInt(material_id),
        material.matricula_id,
        notas_personales || null
      );

      res.json({
        success: true,
        message: resultado.accion === 'agregado'
          ? 'Material agregado a favoritos'
          : 'Material removido de favoritos',
        data: resultado
      });
    } catch (error) {
      console.error('Error al gestionar favorito:', error);
      res.status(500).json({ success: false, message: 'Error al gestionar favorito: ' + error.message });
    }
  }

  /**
   * GET /api/estudiante/favoritos
   * Lista de materiales favoritos del estudiante.
   */
  static async getFavoritos(req, res) {
    try {
      // Obtener matricula_id
      const perfil = await EstudianteDashboard.getPerfil(req.user.id);
      if (!perfil) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      const favoritos = await FavoritoMaterial.findByMatricula(perfil.matricula_id);
      res.json({ success: true, data: { favoritos, total: favoritos.length } });
    } catch (error) {
      console.error('Error al obtener favoritos:', error);
      res.status(500).json({ success: false, message: 'Error al obtener favoritos: ' + error.message });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// COMENTARIOS
// ─────────────────────────────────────────────────────────────
class EstudianteComentariosController {

  /**
   * GET /api/estudiante/material/:material_id/comentarios
   * Lista comentarios del material con respuestas anidadas.
   * Query: ?solo_dudas=true
   */
  static async listar(req, res) {
    try {
      const { material_id } = req.params;
      const { solo_dudas } = req.query;

      // Verificar que tiene acceso al material
      const material = await EstudianteDashboard.getMaterialDetalle(req.user.id, parseInt(material_id));
      if (!material) {
        return res.status(404).json({ success: false, message: 'Material no encontrado o sin acceso' });
      }

      const comentarios = await ComentarioMaterial.findByMaterial(
        parseInt(material_id), solo_dudas === 'true'
      );

      // Cargar respuestas para cada comentario raíz
      const comentariosConRespuestas = await Promise.all(
        comentarios.map(async (c) => {
          const respuestas = await ComentarioMaterial.getRespuestas(c.id);
          return { ...c, respuestas };
        })
      );

      res.json({ success: true, data: { comentarios: comentariosConRespuestas } });
    } catch (error) {
      console.error('Error al obtener comentarios:', error);
      res.status(500).json({ success: false, message: 'Error al obtener comentarios: ' + error.message });
    }
  }

  /**
   * POST /api/estudiante/material/:material_id/comentarios
   * Crear comentario o duda.
   * Body: { contenido, comentario_padre_id?, es_duda? }
   */
  static async crear(req, res) {
    try {
      const { material_id } = req.params;
      const { contenido, comentario_padre_id, es_duda } = req.body;

      if (!contenido || contenido.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'El contenido es requerido' });
      }

      // Verificar acceso al material
      const material = await EstudianteDashboard.getMaterialDetalle(req.user.id, parseInt(material_id));
      if (!material) {
        return res.status(404).json({ success: false, message: 'Material no encontrado o sin acceso' });
      }

      const comentario = await ComentarioMaterial.create({
        material_academico_id: parseInt(material_id),
        usuario_id:            req.user.id,
        comentario_padre_id:   comentario_padre_id ? parseInt(comentario_padre_id) : null,
        contenido:             contenido.trim(),
        es_duda:               es_duda ?? false
      });

      res.status(201).json({
        success: true,
        message: 'Comentario creado exitosamente',
        data: { comentario }
      });
    } catch (error) {
      console.error('Error al crear comentario:', error);
      res.status(500).json({ success: false, message: 'Error al crear comentario: ' + error.message });
    }
  }

  /**
   * PUT /api/estudiante/material/:material_id/comentarios/:comentario_id
   * Editar comentario propio.
   * Body: { contenido }
   */
  static async actualizar(req, res) {
    try {
      const { comentario_id } = req.params;
      const { contenido } = req.body;

      if (!contenido || contenido.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'El contenido es requerido' });
      }

      // update() valida que usuario_id coincida con el del comentario
      const comentario = await ComentarioMaterial.update(
        parseInt(comentario_id), req.user.id, contenido.trim()
      );

      if (!comentario) {
        return res.status(404).json({
          success: false,
          message: 'Comentario no encontrado o no tienes permiso para editarlo'
        });
      }

      res.json({ success: true, message: 'Comentario actualizado', data: { comentario } });
    } catch (error) {
      console.error('Error al actualizar comentario:', error);
      res.status(500).json({ success: false, message: 'Error al actualizar comentario: ' + error.message });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// PROGRESO
// ─────────────────────────────────────────────────────────────
class EstudianteProgresoController {

  /**
   * GET /api/estudiante/progreso/:grado_materia_id
   * Reporte de progreso en los temas de una materia.
   */
  static async getProgreso(req, res) {
    try {
      const { grado_materia_id } = req.params;

      const progreso = await EstudianteDashboard.getProgreso(
        req.user.id, parseInt(grado_materia_id)
      );

      res.json({ success: true, data: { progreso } });
    } catch (error) {
      console.error('Error al obtener progreso:', error);
      res.status(500).json({ success: false, message: 'Error al obtener progreso: ' + error.message });
    }
  }

  /**
   * PUT /api/estudiante/progreso/:tema_id
   * Actualizar el progreso manual en un tema.
   * Body: { estado?, porcentaje_avance?, tiempo_dedicado? }
   */
  static async actualizarProgreso(req, res) {
    try {
      const { tema_id } = req.params;
      const { estado, porcentaje_avance, tiempo_dedicado } = req.body;

      const estadosValidos = ['no_iniciado', 'en_progreso', 'completado', 'revisando'];
      if (estado && !estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Estado inválido. Debe ser: ${estadosValidos.join(', ')}`
        });
      }

      const perfil = await EstudianteDashboard.getPerfil(req.user.id);
      if (!perfil) {
        return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
      }

      const progreso = await ProgresoEstudiante.actualizar(
        perfil.matricula_id,
        parseInt(tema_id),
        { estado, porcentaje_avance, tiempo_dedicado }
      );

      res.json({ success: true, message: 'Progreso actualizado', data: { progreso } });
    } catch (error) {
      console.error('Error al actualizar progreso:', error);
      res.status(500).json({ success: false, message: 'Error al actualizar progreso: ' + error.message });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// NOTAS
// ─────────────────────────────────────────────────────────────
class EstudianteNotasController {

  /**
   * GET /api/estudiante/notas/boletin/:periodo_evaluacion_id
   * Boletín completo del período (todas las materias con Ser/Saber/Hacer).
   */
  static async getPeriodosEvaluacion(req, res) {
  try {
    const matricula = await EstudianteDashboard._getMatriculaActiva(req.user.id);
    if (!matricula) {
      return res.status(404).json({ success: false, message: 'Matrícula no encontrada' });
    }

    const result = await pool.query(`
      SELECT id, nombre, fecha_inicio, fecha_fin, orden
      FROM periodo_evaluacion
      WHERE periodo_academico_id = $1
        AND activo = true
      ORDER BY orden ASC
    `, [matricula.periodo_academico_id]);

    res.json({ success: true, data: { periodos: result.rows } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener períodos: ' + error.message });
  }
}
  static async getBoletin(req, res) {
    try {
      const { periodo_evaluacion_id } = req.params;

      const boletin = await EstudianteDashboard.getBoletin(
        req.user.id, parseInt(periodo_evaluacion_id)
      );

      res.json({ success: true, data: { boletin } });
    } catch (error) {
      console.error('Error al obtener boletín:', error);
      res.status(500).json({ success: false, message: 'Error al obtener boletín: ' + error.message });
    }
  }

  /**
   * GET /api/estudiante/notas/:grado_materia_id/:periodo_evaluacion_id
   * Detalle de notas de una materia: dimensiones + lista de evaluaciones con calificaciones.
   */
  static async getNotasPorMateria(req, res) {
    try {
      const { grado_materia_id, periodo_evaluacion_id } = req.params;

      const notas = await EstudianteDashboard.getNotasPorMateria(
        req.user.id,
        parseInt(grado_materia_id),
        parseInt(periodo_evaluacion_id)
      );

      if (!notas) {
        return res.status(404).json({
          success: false,
          message: 'Materia no encontrada o no pertenece a tu grado'
        });
      }

      res.json({ success: true, data: notas });
    } catch (error) {
      console.error('Error al obtener notas:', error);
      res.status(500).json({ success: false, message: 'Error al obtener notas: ' + error.message });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// ASISTENCIA
// ─────────────────────────────────────────────────────────────
class EstudianteAsistenciaController {

  /**
   * GET /api/estudiante/asistencia
   * Resumen de asistencia por materia (porcentajes).
   * Query: ?asignacion_docente_id=X&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
   */
  static async getResumen(req, res) {
    try {
      const { asignacion_docente_id, fecha_inicio, fecha_fin } = req.query;

      const reporte = await EstudianteDashboard.getAsistenciaResumen(req.user.id, {
        asignacion_docente_id: asignacion_docente_id ? parseInt(asignacion_docente_id) : undefined,
        fecha_inicio,
        fecha_fin
      });

      res.json({ success: true, data: { reporte } });
    } catch (error) {
      console.error('Error al obtener asistencia:', error);
      res.status(500).json({ success: false, message: 'Error al obtener asistencia: ' + error.message });
    }
  }

  /**
   * GET /api/estudiante/asistencia/detalle
   * Historial diario de asistencia con fecha y estado por materia.
   * Query: ?asignacion_docente_id=X&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
   */
  static async getDetalle(req, res) {
    try {
      const { asignacion_docente_id, fecha_inicio, fecha_fin } = req.query;

      const detalle = await EstudianteDashboard.getAsistenciaDetalle(req.user.id, {
        asignacion_docente_id: asignacion_docente_id ? parseInt(asignacion_docente_id) : undefined,
        fecha_inicio,
        fecha_fin
      });

      res.json({ success: true, data: { detalle, total: detalle.length } });
    } catch (error) {
      console.error('Error al obtener detalle de asistencia:', error);
      res.status(500).json({ success: false, message: 'Error al obtener detalle: ' + error.message });
    }
  }
}
class EstudianteHorarioController {
 
  /**
   * GET /api/estudiante/horario
   * Horario semanal del estudiante autenticado.
   * Resuelve paralelo desde el JWT — el estudiante no necesita pasar ningún param.
   * Si el horario del paralelo no fue publicado aún, devuelve 404.
   *
   * Respuesta:
   * {
   *   horario_id, nombre, publicado_en, observaciones,
   *   dias: { 1:"Lunes", 2:"Martes", ... },
   *   grilla: [
   *     { dia_numero: 1, dia_nombre: "Lunes", bloques: [ { bloque_nombre, hora_inicio, hora_fin, materia_nombre, ... } ] },
   *     ...
   *   ],
   *   total_celdas: N
   * }
   */
  static async getHorario(req, res) {
    try {
      const horario = await EstudianteDashboard.getHorario(req.user.id);
 
      if (!horario) {
        return res.status(404).json({
          success: false,
          message: 'El horario de tu curso aún no fue publicado'
        });
      }
 
      res.json({ success: true, data: { horario } });
    } catch (error) {
      console.error('Error al obtener horario del estudiante:', error);
      res.status(500).json({ success: false, message: 'Error al obtener horario: ' + error.message });
    }
  }
}

class EstudianteTareasController {
 
  /**
   * GET /api/estudiante/tareas
   * Evaluaciones publicadas del estudiante con su estado de calificación.
   * Query:
   *   ?periodo_evaluacion_id=X   → filtra por trimestre
   *   ?estado=pendiente|entregado|atrasado|ausente
   *
   * Estado calculado:
   *   - 'entregado' → tiene calificación registrada
   *   - 'atrasado'  → sin nota Y fecha_limite < ahora
   *   - 'pendiente' → sin nota Y (fecha_limite >= ahora O sin fecha_limite)
   *   - 'ausente'   → calificacion.esta_ausente = true
   *
   * Ordena: atrasados → pendientes próximos a vencer → entregados recientes
   */
  static async listarTareas(req, res) {
    try {
      const { periodo_evaluacion_id, estado } = req.query;
 
      const estadosValidos = ['pendiente', 'entregado', 'atrasado', 'ausente'];
      if (estado && !estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Estado inválido. Debe ser: ${estadosValidos.join(', ')}`
        });
      }
 
      const resultado = await EstudianteDashboard.getTareas(req.user.id, {
        periodo_evaluacion_id: periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : undefined,
        estado: estado || undefined
      });
 
      res.json({ success: true, data: resultado });
    } catch (error) {
      console.error('Error al listar tareas del estudiante:', error);
      res.status(500).json({ success: false, message: 'Error al listar tareas: ' + error.message });
    }
  }
  
}
 

export {
  EstudiantePerfilController,
  EstudianteMateriasController,
  EstudianteMaterialesController,
  EstudianteComentariosController,
  EstudianteProgresoController,
  EstudianteNotasController,
  EstudianteAsistenciaController,
  EstudianteHorarioController,    
  EstudianteTareasController  
};