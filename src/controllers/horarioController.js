// controllers/horarioController.js
import { BloqueHorario, Horario, HorarioDetalle } from '../models/Horario.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

const DIAS_SEMANA = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' };

// CORRECCIÓN: máquina de estados explícita — evita transiciones inválidas como archivado → publicado
const TRANSICIONES_VALIDAS = {
  borrador: ['publicado'],
  publicado: ['archivado', 'borrador'],
  archivado: [],
};

// =============================================
// BLOQUE HORARIO
// =============================================
class BloqueHorarioController {
  static async listar(req, res) {
    try {
      const { turno_id, nivel_academico_id, activo, incluir_recreos } = req.query;

      const bloques = await BloqueHorario.findAll({
        turno_id: turno_id ? parseInt(turno_id) : undefined,
        nivel_academico_id: nivel_academico_id ? parseInt(nivel_academico_id) : undefined,
        activo: activo !== undefined ? activo === 'true' : undefined,
        incluir_recreos: incluir_recreos !== 'false',
      });

      res.json({ success: true, data: { bloques } });
    } catch (error) {
      console.error('Error al listar bloques horarios:', error);
      res.status(500).json({ success: false, message: 'Error al listar bloques: ' + error.message });
    }
  }

  static async obtenerPorId(req, res) {
    try {
      const bloque = await BloqueHorario.findById(req.params.id);
      if (!bloque) return res.status(404).json({ success: false, message: 'Bloque no encontrado' });
      res.json({ success: true, data: { bloque } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener bloque: ' + error.message });
    }
  }

  static async crear(req, res) {
    try {
      const { turno_id, nombre, numero, hora_inicio, hora_fin } = req.body;

      if (!turno_id || !nombre || !numero || !hora_inicio || !hora_fin) {
        return res.status(400).json({ success: false, message: 'turno_id, nombre, numero, hora_inicio y hora_fin son requeridos' });
      }

      const bloque = await BloqueHorario.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'horario',
        tabla_afectada: 'bloque_horario',
        registro_id: bloque.id,
        datos_nuevos: bloque,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Bloque horario creado: ${bloque.nombre}`,
      });

      res.status(201).json({ success: true, message: 'Bloque creado exitosamente', data: { bloque } });
    } catch (error) {
      if (error.constraint === 'bloque_horario_turno_id_numero_key' ||
          error.constraint === 'uq_bloque_turno_nivel_numero' ||
          error.constraint === 'uq_bloque_turno_numero_sin_nivel') {
        return res.status(409).json({ success: false, message: 'Ya existe un bloque con ese número para este turno y nivel académico' });
      }
      res.status(500).json({ success: false, message: 'Error al crear bloque: ' + error.message });
    }
  }

  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const existente = await BloqueHorario.findById(id);
      if (!existente) return res.status(404).json({ success: false, message: 'Bloque no encontrado' });

      const bloque = await BloqueHorario.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'horario',
        tabla_afectada: 'bloque_horario',
        registro_id: bloque.id,
        datos_anteriores: existente,
        datos_nuevos: bloque,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Bloque horario actualizado: ${bloque.nombre}`,
      });

      res.json({ success: true, message: 'Bloque actualizado exitosamente', data: { bloque } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al actualizar bloque: ' + error.message });
    }
  }

  static async eliminar(req, res) {
    try {
      const { id } = req.params;
      const existente = await BloqueHorario.findById(id);
      if (!existente) return res.status(404).json({ success: false, message: 'Bloque no encontrado' });

      await BloqueHorario.delete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'horario',
        tabla_afectada: 'bloque_horario',
        registro_id: parseInt(id),
        datos_anteriores: existente,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Bloque horario desactivado: ${existente.nombre}`,
      });

      res.json({ success: true, message: 'Bloque eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar bloque: ' + error.message });
    }
  }
}

// =============================================
// HORARIO (cabecera)
// =============================================
class HorarioController {
  static async listar(req, res) {
    try {
      const { periodo_academico_id, paralelo_id, estado, grado_id, nivel_academico_id } = req.query;

      const horarios = await Horario.findAll({
        periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
        paralelo_id: paralelo_id ? parseInt(paralelo_id) : undefined,
        estado,
        grado_id: grado_id ? parseInt(grado_id) : undefined,
        nivel_academico_id: nivel_academico_id ? parseInt(nivel_academico_id) : undefined,
      });

      res.json({ success: true, data: { horarios, total: horarios.length } });
    } catch (error) {
      console.error('Error al listar horarios:', error);
      res.status(500).json({ success: false, message: 'Error al listar horarios: ' + error.message });
    }
  }

  static async obtenerPorId(req, res) {
    try {
      const horario = await Horario.findById(req.params.id);
      if (!horario) return res.status(404).json({ success: false, message: 'Horario no encontrado' });

      const detalle = await HorarioDetalle.findByHorario(horario.id);
      horario.detalle = detalle;

      res.json({ success: true, data: { horario } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener horario: ' + error.message });
    }
  }

  static async crear(req, res) {
    try {
      const { paralelo_id, periodo_academico_id } = req.body;

      if (!paralelo_id || !periodo_academico_id) {
        return res.status(400).json({ success: false, message: 'paralelo_id y periodo_academico_id son requeridos' });
      }

      const existente = await Horario.exists(paralelo_id, periodo_academico_id);
      if (existente) {
        return res.status(409).json({ success: false, message: 'Ya existe un horario para este paralelo en el período seleccionado' });
      }

      const horario = await Horario.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'horario',
        tabla_afectada: 'horario',
        registro_id: horario.id,
        datos_nuevos: horario,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Horario creado para paralelo ${paralelo_id} en período ${periodo_academico_id}`,
      });

      res.status(201).json({ success: true, message: 'Horario creado exitosamente', data: { horario } });
    } catch (error) {
      console.error('Error al crear horario:', error);
      res.status(500).json({ success: false, message: 'Error al crear horario: ' + error.message });
    }
  }

  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const existente = await Horario.findById(id);
      if (!existente) return res.status(404).json({ success: false, message: 'Horario no encontrado' });

      if (existente.estado === 'archivado') {
        return res.status(400).json({ success: false, message: 'No se puede editar un horario archivado' });
      }

      const horario = await Horario.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'horario',
        tabla_afectada: 'horario',
        registro_id: horario.id,
        datos_anteriores: existente,
        datos_nuevos: horario,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Horario actualizado: ${horario.id}`,
      });

      res.json({ success: true, message: 'Horario actualizado exitosamente', data: { horario } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al actualizar horario: ' + error.message });
    }
  }

  static async cambiarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      const existente = await Horario.findById(id);
      if (!existente) return res.status(404).json({ success: false, message: 'Horario no encontrado' });

      // CORRECCIÓN: máquina de estados — valida la transición completa
      const permitidas = TRANSICIONES_VALIDAS[existente.estado] ?? [];
      if (!estado || !permitidas.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: `Transición inválida: no se puede pasar de "${existente.estado}" a "${estado}". Transiciones permitidas: ${permitidas.join(', ') || 'ninguna'}`,
        });
      }

      const horario = await Horario.cambiarEstado(id, estado, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cambiar_estado',
        modulo: 'horario',
        tabla_afectada: 'horario',
        registro_id: horario.id,
        datos_anteriores: { estado: existente.estado },
        datos_nuevos: { estado: horario.estado },
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Horario ${estado}: ${id}`,
      });

      res.json({ success: true, message: `Horario ${estado} exitosamente`, data: { horario } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al cambiar estado: ' + error.message });
    }
  }

  static async eliminar(req, res) {
    try {
      const { id } = req.params;
      const existente = await Horario.findById(id);
      if (!existente) return res.status(404).json({ success: false, message: 'Horario no encontrado' });

      if (existente.estado === 'publicado') {
        return res.status(400).json({ success: false, message: 'No se puede eliminar un horario publicado. Archívalo primero.' });
      }

      await Horario.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'horario',
        tabla_afectada: 'horario',
        registro_id: parseInt(id),
        datos_anteriores: existente,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Horario eliminado: ${id}`,
      });

      res.json({ success: true, message: 'Horario eliminado exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar horario: ' + error.message });
    }
  }

  // Horario semanal de un docente
  // CORRECCIÓN: admins pueden pasar ?estado=borrador para previsualizar
  static async horarioDocente(req, res) {
    try {
      const { docente_id } = req.params;
      const { periodo_academico_id, estado = 'publicado' } = req.query;

      if (!periodo_academico_id) {
        return res.status(400).json({ success: false, message: 'periodo_academico_id es requerido' });
      }

      const detalle = await HorarioDetalle.findByDocente(
        parseInt(docente_id),
        parseInt(periodo_academico_id),
        estado,
      );

      res.json({ success: true, data: { detalle, dias: DIAS_SEMANA } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener horario del docente: ' + error.message });
    }
  }

  // Horario semanal de un paralelo (público para padres/alumnos)
  // CORRECCIÓN: admins pueden pasar ?estado=borrador para previsualizar
  static async horarioParalelo(req, res) {
    try {
      const { paralelo_id } = req.params;
      const { periodo_academico_id, estado = 'publicado' } = req.query;

      if (!periodo_academico_id) {
        return res.status(400).json({ success: false, message: 'periodo_academico_id es requerido' });
      }

      const detalle = await HorarioDetalle.findByParalelo(
        parseInt(paralelo_id),
        parseInt(periodo_academico_id),
        estado,
      );

      res.json({ success: true, data: { detalle, dias: DIAS_SEMANA } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener horario del paralelo: ' + error.message });
    }
  }
}

// =============================================
// HORARIO DETALLE (celdas)
// =============================================
class HorarioDetalleController {
  static async listar(req, res) {
    try {
      const { id: horario_id } = req.params;
      const horario = await Horario.findById(horario_id);
      if (!horario) return res.status(404).json({ success: false, message: 'Horario no encontrado' });

      const detalle = await HorarioDetalle.findByHorario(parseInt(horario_id));
      res.json({ success: true, data: { detalle, dias: DIAS_SEMANA } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al obtener detalle: ' + error.message });
    }
  }

  static async agregar(req, res) {
    try {
      const { id: horario_id } = req.params;
      const { dia_semana, bloque_horario_id, grado_materia_id, asignacion_docente_id } = req.body;

      if (!dia_semana || !bloque_horario_id || !grado_materia_id) {
        return res.status(400).json({ success: false, message: 'dia_semana, bloque_horario_id y grado_materia_id son requeridos' });
      }

      const horario = await Horario.findById(horario_id);
      if (!horario) return res.status(404).json({ success: false, message: 'Horario no encontrado' });

      if (horario.estado === 'archivado') {
        return res.status(400).json({ success: false, message: 'No se pueden agregar celdas a un horario archivado' });
      }

      // CORRECCIÓN: validar que el bloque pertenece al turno del paralelo
      const bloqueValido = await HorarioDetalle.validarBloqueEnTurno(bloque_horario_id, parseInt(horario_id));
      if (!bloqueValido) {
        return res.status(400).json({ success: false, message: 'El bloque horario no corresponde al turno del paralelo de este horario' });
      }

      // Verificar conflicto de docente antes de insertar
      if (asignacion_docente_id) {
        const conflicto = await HorarioDetalle.verificarConflictoDocente({
          asignacion_docente_id,
          dia_semana,
          bloque_horario_id,
          periodo_academico_id: horario.periodo_academico_id,
        });

        if (conflicto) {
          return res.status(409).json({
            success: false,
            message: `Conflicto de horario: el docente ya tiene clase en ${DIAS_SEMANA[dia_semana]} - ${conflicto.bloque_nombre || 'ese bloque'} (Paralelo: ${conflicto.paralelo_nombre})`,
            data: { conflicto },
          });
        }
      }

      const celda = await HorarioDetalle.create({ ...req.body, horario_id: parseInt(horario_id) });

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'horario',
        tabla_afectada: 'horario_detalle',
        registro_id: celda.id,
        datos_nuevos: celda,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Celda agregada: ${DIAS_SEMANA[dia_semana]} bloque ${bloque_horario_id}`,
      });

      res.status(201).json({ success: true, message: 'Celda agregada exitosamente', data: { celda } });
    } catch (error) {
      if (error.constraint?.includes('horario_detalle')) {
        return res.status(409).json({ success: false, message: 'Ya existe una asignación en ese día y bloque para este horario' });
      }
      if (error.constraint?.includes('idx_no_conflicto_docente')) {
        return res.status(409).json({ success: false, message: 'El docente ya tiene clase en ese día y bloque en otro paralelo' });
      }
      console.error('Error al agregar celda:', error);
      res.status(500).json({ success: false, message: 'Error al agregar celda: ' + error.message });
    }
  }

  static async actualizar(req, res) {
    try {
      const { id: horario_id, det_id } = req.params;

      const existente = await HorarioDetalle.findById(det_id);
      if (!existente) return res.status(404).json({ success: false, message: 'Celda no encontrada' });

      const { asignacion_docente_id, dia_semana, bloque_horario_id } = req.body;

      // CORRECCIÓN: validar el bloque si se está cambiando
      if (bloque_horario_id && bloque_horario_id !== existente.bloque_horario_id) {
        const bloqueValido = await HorarioDetalle.validarBloqueEnTurno(bloque_horario_id, parseInt(horario_id));
        if (!bloqueValido) {
          return res.status(400).json({ success: false, message: 'El bloque horario no corresponde al turno del paralelo de este horario' });
        }
      }

      // Verificar conflicto si se cambia el docente
      if (asignacion_docente_id) {
        const horario = await Horario.findById(horario_id);
        const conflicto = await HorarioDetalle.verificarConflictoDocente({
          asignacion_docente_id,
          dia_semana: dia_semana || existente.dia_semana,
          bloque_horario_id: bloque_horario_id || existente.bloque_horario_id,
          periodo_academico_id: horario.periodo_academico_id,
          excluir_detalle_id: parseInt(det_id),
        });

        if (conflicto) {
          return res.status(409).json({
            success: false,
            message: `Conflicto: el docente ya tiene clase en ${DIAS_SEMANA[dia_semana || existente.dia_semana]} (Paralelo: ${conflicto.paralelo_nombre})`,
            data: { conflicto },
          });
        }
      }

      // CORRECCIÓN: pasamos req.body completo para que el modelo distinga
      // entre "campo no enviado" y "campo enviado como null"
      const celda = await HorarioDetalle.update(det_id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'horario',
        tabla_afectada: 'horario_detalle',
        registro_id: celda.id,
        datos_anteriores: existente,
        datos_nuevos: celda,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Celda actualizada: ${det_id}`,
      });

      res.json({ success: true, message: 'Celda actualizada exitosamente', data: { celda } });
    } catch (error) {
      if (error.constraint?.includes('idx_no_conflicto_docente')) {
        return res.status(409).json({ success: false, message: 'El docente ya tiene clase en ese día y bloque en otro paralelo' });
      }
      res.status(500).json({ success: false, message: 'Error al actualizar celda: ' + error.message });
    }
  }

  static async eliminar(req, res) {
    try {
      const { det_id } = req.params;
      const existente = await HorarioDetalle.findById(det_id);
      if (!existente) return res.status(404).json({ success: false, message: 'Celda no encontrada' });

      await HorarioDetalle.delete(det_id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'horario',
        tabla_afectada: 'horario_detalle',
        registro_id: parseInt(det_id),
        datos_anteriores: existente,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Celda eliminada: ${det_id}`,
      });

      res.json({ success: true, message: 'Celda eliminada exitosamente' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al eliminar celda: ' + error.message });
    }
  }

  static async verificarConflicto(req, res) {
    try {
      const { asignacion_docente_id, dia_semana, bloque_horario_id, periodo_academico_id, excluir_detalle_id } = req.query;

      if (!asignacion_docente_id || !dia_semana || !bloque_horario_id || !periodo_academico_id) {
        return res.status(400).json({ success: false, message: 'asignacion_docente_id, dia_semana, bloque_horario_id y periodo_academico_id son requeridos' });
      }

      const conflicto = await HorarioDetalle.verificarConflictoDocente({
        asignacion_docente_id: parseInt(asignacion_docente_id),
        dia_semana: parseInt(dia_semana),
        bloque_horario_id: parseInt(bloque_horario_id),
        periodo_academico_id: parseInt(periodo_academico_id),
        excluir_detalle_id: excluir_detalle_id ? parseInt(excluir_detalle_id) : null,
      });

      res.json({
        success: true,
        data: {
          tiene_conflicto: !!conflicto,
          conflicto: conflicto || null,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error al verificar conflicto: ' + error.message });
    }
  }
}

export { BloqueHorarioController, HorarioController, HorarioDetalleController };