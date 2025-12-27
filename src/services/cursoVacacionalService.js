// services/cursoVacacionalService.js
import { pool } from '../db/pool.js';
import { PeriodoVacacional, CursoVacacional, InscripcionVacacional } from '../models/CursoVacacional.js';

class CursoVacacionalService {
  /**
   * Validar que el periodo esté activo y permita inscripciones
   */
  static async validarPeriodoActivo(periodo_id) {
    const periodo = await PeriodoVacacional.findById(periodo_id);
    
    if (!periodo) {
      return {
        valido: false,
        mensaje: 'Periodo no encontrado'
      };
    }

    if (!periodo.activo) {
      return {
        valido: false,
        mensaje: 'El periodo no está activo'
      };
    }

    if (!periodo.permite_inscripciones) {
      return {
        valido: false,
        mensaje: 'El periodo no permite inscripciones'
      };
    }

    const hoy = new Date();
    const fechaInicio = new Date(periodo.fecha_inicio_inscripciones);
    const fechaFin = new Date(periodo.fecha_fin_inscripciones);

    if (hoy < fechaInicio) {
      return {
        valido: false,
        mensaje: 'Las inscripciones aún no han iniciado'
      };
    }

    if (hoy > fechaFin) {
      return {
        valido: false,
        mensaje: 'El periodo de inscripciones ha finalizado'
      };
    }

    return {
      valido: true,
      periodo
    };
  }

  /**
   * Validar disponibilidad de cupos en un curso
   */
  static async validarDisponibilidadCupos(curso_id) {
    const curso = await CursoVacacional.findById(curso_id);
    
    if (!curso) {
      return {
        disponible: false,
        mensaje: 'Curso no encontrado'
      };
    }

    if (!curso.activo) {
      return {
        disponible: false,
        mensaje: 'El curso no está activo'
      };
    }

    const disponibilidad = await CursoVacacional.checkDisponibilidad(curso_id);

    if (!disponibilidad.disponible) {
      return {
        disponible: false,
        mensaje: 'El curso no tiene cupos disponibles',
        cupos_totales: disponibilidad.cupos_totales,
        cupos_ocupados: disponibilidad.cupos_ocupados
      };
    }

    return {
      disponible: true,
      curso,
      cupos_disponibles: disponibilidad.cupos_disponibles
    };
  }

  /**
   * Verificar si un estudiante ya está inscrito en un curso
   */
  static async verificarInscripcionDuplicada(curso_id, ci) {
    if (!ci) return { duplicada: false };

    const query = `
      SELECT id, codigo_inscripcion, estado
      FROM inscripcion_vacacional
      WHERE curso_vacacional_id = $1 
        AND ci = $2 
        AND estado NOT IN ('rechazado', 'retirado')
        AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [curso_id, ci]);

    if (result.rows.length > 0) {
      return {
        duplicada: true,
        inscripcion_existente: result.rows[0]
      };
    }

    return { duplicada: false };
  }

  /**
   * Calcular estadísticas completas de un periodo
   */
  static async calcularEstadisticasPeriodo(periodo_id) {
    const query = `
      WITH inscripciones_stats AS (
        SELECT 
          COUNT(*) as total_inscripciones,
          COUNT(CASE WHEN iv.estado = 'pendiente' THEN 1 END) as pendientes,
          COUNT(CASE WHEN iv.estado = 'pago_verificado' THEN 1 END) as verificadas,
          COUNT(CASE WHEN iv.estado = 'activo' THEN 1 END) as activas,
          COUNT(CASE WHEN iv.estado = 'completado' THEN 1 END) as completadas,
          COUNT(CASE WHEN iv.estado = 'retirado' THEN 1 END) as retiradas,
          COUNT(CASE WHEN iv.estado = 'rechazado' THEN 1 END) as rechazadas,
          COUNT(CASE WHEN iv.pago_verificado = true THEN 1 END) as pagos_verificados,
          COALESCE(SUM(iv.monto_pagado), 0) as total_ingresos
        FROM inscripcion_vacacional iv
        INNER JOIN curso_vacacional cv ON iv.curso_vacacional_id = cv.id
        WHERE cv.periodo_vacacional_id = $1 AND iv.deleted_at IS NULL
      ),
      cursos_stats AS (
        SELECT 
          COUNT(*) as total_cursos,
          COUNT(CASE WHEN cv.activo = true THEN 1 END) as cursos_activos,
          COALESCE(SUM(cv.cupos_totales), 0) as total_cupos,
          COALESCE(SUM(cv.cupos_ocupados), 0) as cupos_ocupados,
          COALESCE(SUM(cv.cupos_disponibles), 0) as cupos_disponibles
        FROM curso_vacacional cv
        WHERE cv.periodo_vacacional_id = $1 AND cv.deleted_at IS NULL
      )
      SELECT 
        i.*,
        c.*
      FROM inscripciones_stats i, cursos_stats c
    `;

    const result = await pool.query(query, [periodo_id]);
    return result.rows[0];
  }

  /**
   * Obtener cursos más populares de un periodo
   */
  static async obtenerCursosPopulares(periodo_id, limit = 5) {
    const query = `
      SELECT 
        cv.id,
        cv.nombre,
        cv.codigo,
        cv.cupos_totales,
        cv.cupos_ocupados,
        cv.cupos_disponibles,
        cv.costo,
        COUNT(iv.id) as total_inscripciones,
        ROUND((cv.cupos_ocupados::numeric / cv.cupos_totales::numeric) * 100, 2) as porcentaje_ocupacion
      FROM curso_vacacional cv
      LEFT JOIN inscripcion_vacacional iv ON cv.id = iv.curso_vacacional_id 
        AND iv.deleted_at IS NULL
      WHERE cv.periodo_vacacional_id = $1 AND cv.deleted_at IS NULL
      GROUP BY cv.id
      ORDER BY cv.cupos_ocupados DESC, total_inscripciones DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [periodo_id, limit]);
    return result.rows;
  }

  /**
   * Obtener ingresos por curso
   */
  static async obtenerIngresosPorCurso(periodo_id) {
    const query = `
      SELECT 
        cv.id,
        cv.nombre,
        cv.codigo,
        COUNT(iv.id) as total_inscripciones,
        COUNT(CASE WHEN iv.pago_verificado = true THEN 1 END) as pagos_verificados,
        COALESCE(SUM(iv.monto_pagado), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN iv.pago_verificado = true THEN iv.monto_pagado ELSE 0 END), 0) as ingresos_verificados
      FROM curso_vacacional cv
      LEFT JOIN inscripcion_vacacional iv ON cv.id = iv.curso_vacacional_id 
        AND iv.deleted_at IS NULL
      WHERE cv.periodo_vacacional_id = $1 AND cv.deleted_at IS NULL
      GROUP BY cv.id
      ORDER BY total_ingresos DESC
    `;

    const result = await pool.query(query, [periodo_id]);
    return result.rows;
  }

  /**
   * Validar datos de inscripción
   */
  static validarDatosInscripcion(datos) {
    const errores = [];

    // Validar datos del estudiante
    if (!datos.nombres || datos.nombres.trim().length < 2) {
      errores.push('El nombre del estudiante es requerido (mínimo 2 caracteres)');
    }

    if (!datos.apellido_paterno || datos.apellido_paterno.trim().length < 2) {
      errores.push('El apellido paterno es requerido (mínimo 2 caracteres)');
    }

    if (!datos.fecha_nacimiento) {
      errores.push('La fecha de nacimiento es requerida');
    } else {
      const fechaNac = new Date(datos.fecha_nacimiento);
      const hoy = new Date();
      const edad = Math.floor((hoy - fechaNac) / (365.25 * 24 * 60 * 60 * 1000));
      
      if (edad < 3 || edad > 18) {
        errores.push('La edad del estudiante debe estar entre 3 y 18 años');
      }
    }

    if (datos.ci && (datos.ci.length < 5 || datos.ci.length > 15)) {
      errores.push('El CI debe tener entre 5 y 15 caracteres');
    }

    if (datos.telefono && datos.telefono.length < 7) {
      errores.push('El teléfono debe tener al menos 7 dígitos');
    }

    if (datos.email && !this.validarEmail(datos.email)) {
      errores.push('El email del estudiante no es válido');
    }

    // Validar datos del tutor
    if (!datos.nombre_tutor || datos.nombre_tutor.trim().length < 3) {
      errores.push('El nombre del tutor es requerido (mínimo 3 caracteres)');
    }

    if (!datos.telefono_tutor || datos.telefono_tutor.length < 7) {
      errores.push('El teléfono del tutor es requerido (mínimo 7 dígitos)');
    }

    if (datos.email_tutor && !this.validarEmail(datos.email_tutor)) {
      errores.push('El email del tutor no es válido');
    }

    // Validar pago
    if (!datos.monto_pagado || parseFloat(datos.monto_pagado) <= 0) {
      errores.push('El monto pagado debe ser mayor a 0');
    }

    return {
      valido: errores.length === 0,
      errores
    };
  }

  /**
   * Validar formato de email
   */
  static validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  /**
   * Generar reporte de inscripciones por estado
   */
  static async generarReportePorEstado(periodo_id) {
    const query = `
      SELECT 
        iv.estado,
        COUNT(*) as cantidad,
        COALESCE(SUM(iv.monto_pagado), 0) as total_ingresos,
        json_agg(
          json_build_object(
            'id', iv.id,
            'codigo', iv.codigo_inscripcion,
            'estudiante', iv.nombres || ' ' || iv.apellido_paterno,
            'curso', cv.nombre,
            'monto', iv.monto_pagado,
            'fecha_inscripcion', iv.created_at
          )
          ORDER BY iv.created_at DESC
        ) as inscripciones
      FROM inscripcion_vacacional iv
      INNER JOIN curso_vacacional cv ON iv.curso_vacacional_id = cv.id
      WHERE cv.periodo_vacacional_id = $1 AND iv.deleted_at IS NULL
      GROUP BY iv.estado
      ORDER BY cantidad DESC
    `;

    const result = await pool.query(query, [periodo_id]);
    return result.rows;
  }

  /**
   * Verificar conflictos de horario al inscribirse
   */
  static async verificarConflictoHorario(curso_id, ci) {
    if (!ci) return { conflicto: false };

    const query = `
      SELECT 
        cv.id,
        cv.nombre,
        cv.dias_semana,
        cv.hora_inicio,
        cv.hora_fin
      FROM inscripcion_vacacional iv
      INNER JOIN curso_vacacional cv ON iv.curso_vacacional_id = cv.id
      WHERE iv.ci = $1 
        AND iv.estado IN ('pago_verificado', 'activo')
        AND iv.deleted_at IS NULL
        AND cv.id != $2
        AND cv.deleted_at IS NULL
    `;

    const result = await pool.query(query, [ci, curso_id]);

    if (result.rows.length === 0) {
      return { conflicto: false };
    }

    // Obtener datos del curso nuevo
    const cursoNuevo = await CursoVacacional.findById(curso_id);
    
    // Verificar solapamiento de horarios
    for (const cursoExistente of result.rows) {
      const diasNuevo = cursoNuevo.dias_semana?.split(',') || [];
      const diasExistente = cursoExistente.dias_semana?.split(',') || [];
      
      // Verificar si hay días en común
      const diasComunes = diasNuevo.filter(dia => diasExistente.includes(dia));
      
      if (diasComunes.length > 0) {
        // Verificar solapamiento de horarios
        const horaInicioNuevo = cursoNuevo.hora_inicio;
        const horaFinNuevo = cursoNuevo.hora_fin;
        const horaInicioExistente = cursoExistente.hora_inicio;
        const horaFinExistente = cursoExistente.hora_fin;

        if (horaInicioNuevo && horaFinNuevo && horaInicioExistente && horaFinExistente) {
          const hayConflicto = (
            (horaInicioNuevo >= horaInicioExistente && horaInicioNuevo < horaFinExistente) ||
            (horaFinNuevo > horaInicioExistente && horaFinNuevo <= horaFinExistente) ||
            (horaInicioNuevo <= horaInicioExistente && horaFinNuevo >= horaFinExistente)
          );

          if (hayConflicto) {
            return {
              conflicto: true,
              curso_conflictivo: cursoExistente,
              dias_comunes: diasComunes
            };
          }
        }
      }
    }

    return { conflicto: false };
  }
}

export default CursoVacacionalService;