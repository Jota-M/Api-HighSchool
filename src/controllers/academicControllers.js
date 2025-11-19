// controllers/periodoAcademicoController.js
import { Turno ,PeriodoAcademico, NivelAcademico, Grado, Paralelo } from '../models/Academic.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';

class PeriodoAcademicoController {
  // Listar periodos académicos
  static async listar(req, res) {
    try {
      const { page, limit, search, activo, cerrado } = req.query;
      
      const result = await PeriodoAcademico.findAll({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        search,
        activo: activo !== undefined ? activo === 'true' : undefined,
        cerrado: cerrado !== undefined ? cerrado === 'true' : undefined
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error al listar periodos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar periodos académicos: ' + error.message
      });
    }
  }

  // Obtener periodo por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const periodo = await PeriodoAcademico.findById(id);

      if (!periodo) {
        return res.status(404).json({
          success: false,
          message: 'Periodo académico no encontrado'
        });
      }

      res.json({
        success: true,
        data: { periodo }
      });
    } catch (error) {
      console.error('Error al obtener periodo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener periodo académico: ' + error.message
      });
    }
  }

  // Crear periodo académico
  static async crear(req, res) {
    try {
      const data = req.body;

      // Verificar solapamiento de fechas
      const overlap = await PeriodoAcademico.checkOverlap(data.fecha_inicio, data.fecha_fin);
      if (overlap.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Ya existe un periodo académico que se solapa con estas fechas: ${overlap[0].nombre}`
        });
      }

      const periodo = await PeriodoAcademico.create(data);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'periodo_academico',
        tabla_afectada: 'periodo_academico',
        registro_id: periodo.id,
        datos_nuevos: periodo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Periodo académico creado: ${periodo.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Periodo académico creado exitosamente',
        data: { periodo }
      });
    } catch (error) {
      console.error('Error al crear periodo:', error);
      
      if (error.constraint === 'periodo_academico_nombre_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un periodo académico con ese nombre'
        });
      }

      if (error.constraint === 'periodo_academico_codigo_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un periodo académico con ese código'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear periodo académico: ' + error.message
      });
    }
  }

  // Actualizar periodo académico
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const periodoExistente = await PeriodoAcademico.findById(id);
      if (!periodoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Periodo académico no encontrado'
        });
      }

      // Verificar solapamiento si se cambian las fechas
      if (data.fecha_inicio || data.fecha_fin) {
        const overlap = await PeriodoAcademico.checkOverlap(
          data.fecha_inicio || periodoExistente.fecha_inicio,
          data.fecha_fin || periodoExistente.fecha_fin,
          id
        );
        if (overlap.length > 0) {
          return res.status(409).json({
            success: false,
            message: `Las nuevas fechas se solapan con: ${overlap[0].nombre}`
          });
        }
      }

      const periodo = await PeriodoAcademico.update(id, data);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'periodo_academico',
        tabla_afectada: 'periodo_academico',
        registro_id: periodo.id,
        datos_anteriores: periodoExistente,
        datos_nuevos: periodo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Periodo académico actualizado: ${periodo.nombre}`
      });

      res.json({
        success: true,
        message: 'Periodo académico actualizado exitosamente',
        data: { periodo }
      });
    } catch (error) {
      console.error('Error al actualizar periodo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar periodo académico: ' + error.message
      });
    }
  }

  // Eliminar periodo académico
  static async eliminar(req, res) {
    try {
      const { id } = req.params;

      const periodo = await PeriodoAcademico.findById(id);
      if (!periodo) {
        return res.status(404).json({
          success: false,
          message: 'Periodo académico no encontrado'
        });
      }

      await PeriodoAcademico.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'periodo_academico',
        tabla_afectada: 'periodo_academico',
        registro_id: parseInt(id),
        datos_anteriores: periodo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Periodo académico eliminado: ${periodo.nombre}`
      });

      res.json({
        success: true,
        message: 'Periodo académico eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar periodo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar periodo académico: ' + error.message
      });
    }
  }

  // Cerrar periodo académico
  static async cerrar(req, res) {
    try {
      const { id } = req.params;

      const periodo = await PeriodoAcademico.findById(id);
      if (!periodo) {
        return res.status(404).json({
          success: false,
          message: 'Periodo académico no encontrado'
        });
      }

      if (periodo.cerrado) {
        return res.status(400).json({
          success: false,
          message: 'El periodo académico ya está cerrado'
        });
      }

      const periodoActualizado = await PeriodoAcademico.cerrar(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'cerrar',
        modulo: 'periodo_academico',
        tabla_afectada: 'periodo_academico',
        registro_id: parseInt(id),
        datos_anteriores: periodo,
        datos_nuevos: periodoActualizado,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Periodo académico cerrado: ${periodo.nombre}`
      });

      res.json({
        success: true,
        message: 'Periodo académico cerrado exitosamente',
        data: { periodo: periodoActualizado }
      });
    } catch (error) {
      console.error('Error al cerrar periodo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cerrar periodo académico: ' + error.message
      });
    }
  }

  // Obtener periodo activo
  static async obtenerActivo(req, res) {
    try {
      const periodo = await PeriodoAcademico.getActivo();

      if (!periodo) {
        return res.status(404).json({
          success: false,
          message: 'No hay periodo académico activo'
        });
      }

      res.json({
        success: true,
        data: { periodo }
      });
    } catch (error) {
      console.error('Error al obtener periodo activo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener periodo académico activo: ' + error.message
      });
    }
  }
  // Activar un periodo académico
static async activar(req, res) {
  try {
    const { id } = req.params;

    const periodo = await PeriodoAcademico.findById(id);
    if (!periodo) {
      return res.status(404).json({
        success: false,
        message: 'Periodo académico no encontrado'
      });
    }

    if (periodo.cerrado) {
      return res.status(400).json({
        success: false,
        message: 'El periodo está cerrado y no puede activarse'
      });
    }

    const activo = await PeriodoAcademico.activar(id);

    res.json({
      success: true,
      message: 'Periodo académico activado correctamente',
      data: { periodo: activo }
    });

  } catch (error) {
    console.error('Error al activar periodo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al activar periodo académico: ' + error.message
    });
  }
}
}

class TurnoController {
  static async listar(req, res) {
    try {
      const { activo } = req.query;
      
      const turnos = await Turno.findAll({
        activo: activo !== undefined ? activo === 'true' : undefined
      });

      res.json({
        success: true,
        data: { turnos }
      });
    } catch (error) {
      console.error('Error al listar turnos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar turnos: ' + error.message
      });
    }
  }

  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const turno = await Turno.findById(id);

      if (!turno) {
        return res.status(404).json({
          success: false,
          message: 'Turno no encontrado'
        });
      }

      res.json({
        success: true,
        data: { turno }
      });
    } catch (error) {
      console.error('Error al obtener turno:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener turno: ' + error.message
      });
    }
  }

  static async crear(req, res) {
    try {
       console.log('BODY RECIBIDO:', req.body);
      const turno = await Turno.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'turno',
        tabla_afectada: 'turno',
        registro_id: turno.id,
        datos_nuevos: turno,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Turno creado: ${turno.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Turno creado exitosamente',
        data: { turno }
      });
    } catch (error) {
      console.error('Error al crear turno:', error);
      
      if (error.constraint === 'turno_nombre_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un turno con ese nombre'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear turno: ' + error.message
      });
    }
  }

  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const turnoExistente = await Turno.findById(id);

      if (!turnoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Turno no encontrado'
        });
      }

      const turno = await Turno.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'turno',
        tabla_afectada: 'turno',
        registro_id: turno.id,
        datos_anteriores: turnoExistente,
        datos_nuevos: turno,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Turno actualizado: ${turno.nombre}`
      });

      res.json({
        success: true,
        message: 'Turno actualizado exitosamente',
        data: { turno }
      });
    } catch (error) {
      console.error('Error al actualizar turno:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar turno: ' + error.message
      });
    }
  }

  static async eliminar(req, res) {
    try {
      const { id } = req.params;
      const turno = await Turno.findById(id);

      if (!turno) {
        return res.status(404).json({
          success: false,
          message: 'Turno no encontrado'
        });
      }

      await Turno.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'turno',
        tabla_afectada: 'turno',
        registro_id: parseInt(id),
        datos_anteriores: turno,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Turno eliminado: ${turno.nombre}`
      });

      res.json({
        success: true,
        message: 'Turno eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar turno:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar turno: ' + error.message
      });
    }
  }
}
class NivelAcademicoController {
  // Listar niveles académicos
  static async listar(req, res) {
    try {
      const { activo } = req.query;
      
      const niveles = await NivelAcademico.findAll({
        activo: activo !== undefined ? activo === 'true' : undefined
      });

      res.json({
        success: true,
        data: { niveles }
      });
    } catch (error) {
      console.error('Error al listar niveles académicos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar niveles académicos: ' + error.message
      });
    }
  }

  // Obtener nivel académico por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const nivel = await NivelAcademico.findById(id);

      if (!nivel) {
        return res.status(404).json({
          success: false,
          message: 'Nivel académico no encontrado'
        });
      }

      res.json({
        success: true,
        data: { nivel }
      });
    } catch (error) {
      console.error('Error al obtener nivel académico:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener nivel académico: ' + error.message
      });
    }
  }

  // Crear nivel académico
  static async crear(req, res) {
    try {
      const nivel = await NivelAcademico.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'nivel_academico',
        tabla_afectada: 'nivel_academico',
        registro_id: nivel.id,
        datos_nuevos: nivel,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Nivel académico creado: ${nivel.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Nivel académico creado exitosamente',
        data: { nivel }
      });
    } catch (error) {
      console.error('Error al crear nivel académico:', error);
      
      if (error.constraint === 'nivel_academico_nombre_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un nivel académico con ese nombre'
        });
      }

      if (error.constraint === 'nivel_academico_codigo_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un nivel académico con ese código'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear nivel académico: ' + error.message
      });
    }
  }

  // Actualizar nivel académico
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const nivelExistente = await NivelAcademico.findById(id);

      if (!nivelExistente) {
        return res.status(404).json({
          success: false,
          message: 'Nivel académico no encontrado'
        });
      }

      const nivel = await NivelAcademico.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'nivel_academico',
        tabla_afectada: 'nivel_academico',
        registro_id: nivel.id,
        datos_anteriores: nivelExistente,
        datos_nuevos: nivel,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Nivel académico actualizado: ${nivel.nombre}`
      });

      res.json({
        success: true,
        message: 'Nivel académico actualizado exitosamente',
        data: { nivel }
      });
    } catch (error) {
      console.error('Error al actualizar nivel académico:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar nivel académico: ' + error.message
      });
    }
  }

  // Eliminar nivel académico
  static async eliminar(req, res) {
    try {
      const { id } = req.params;
      const nivel = await NivelAcademico.findById(id);

      if (!nivel) {
        return res.status(404).json({
          success: false,
          message: 'Nivel académico no encontrado'
        });
      }

      await NivelAcademico.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'nivel_academico',
        tabla_afectada: 'nivel_academico',
        registro_id: parseInt(id),
        datos_anteriores: nivel,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Nivel académico eliminado: ${nivel.nombre}`
      });

      res.json({
        success: true,
        message: 'Nivel académico eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar nivel académico:', error);
      
      if (error.message.includes('grados asociados')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al eliminar nivel académico: ' + error.message
      });
    }
  }
}

// ============== GRADO CONTROLLER ==============
class GradoController {
  // Listar grados
  static async listar(req, res) {
    try {
      const { nivel_academico_id, activo } = req.query;
      
      const grados = await Grado.findAll({
        nivel_academico_id: nivel_academico_id ? parseInt(nivel_academico_id) : undefined,
        activo: activo !== undefined ? activo === 'true' : undefined
      });

      res.json({
        success: true,
        data: { grados }
      });
    } catch (error) {
      console.error('Error al listar grados:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar grados: ' + error.message
      });
    }
  }

  // Obtener grado por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const grado = await Grado.findById(id);

      if (!grado) {
        return res.status(404).json({
          success: false,
          message: 'Grado no encontrado'
        });
      }

      res.json({
        success: true,
        data: { grado }
      });
    } catch (error) {
      console.error('Error al obtener grado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener grado: ' + error.message
      });
    }
  }

  // Crear grado
  static async crear(req, res) {
    try {
      const grado = await Grado.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'grado',
        tabla_afectada: 'grado',
        registro_id: grado.id,
        datos_nuevos: grado,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Grado creado: ${grado.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Grado creado exitosamente',
        data: { grado }
      });
    } catch (error) {
      console.error('Error al crear grado:', error);
      
      if (error.constraint === 'grado_nivel_academico_id_codigo_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un grado con ese código en este nivel académico'
        });
      }

      if (error.code === '23503') {
        return res.status(400).json({
          success: false,
          message: 'El nivel académico especificado no existe'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear grado: ' + error.message
      });
    }
  }

  // Actualizar grado
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const gradoExistente = await Grado.findById(id);

      if (!gradoExistente) {
        return res.status(404).json({
          success: false,
          message: 'Grado no encontrado'
        });
      }

      const grado = await Grado.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'grado',
        tabla_afectada: 'grado',
        registro_id: grado.id,
        datos_anteriores: gradoExistente,
        datos_nuevos: grado,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Grado actualizado: ${grado.nombre}`
      });

      res.json({
        success: true,
        message: 'Grado actualizado exitosamente',
        data: { grado }
      });
    } catch (error) {
      console.error('Error al actualizar grado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar grado: ' + error.message
      });
    }
  }

  // Eliminar grado
  static async eliminar(req, res) {
    try {
      const { id } = req.params;
      const grado = await Grado.findById(id);

      if (!grado) {
        return res.status(404).json({
          success: false,
          message: 'Grado no encontrado'
        });
      }

      await Grado.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'grado',
        tabla_afectada: 'grado',
        registro_id: parseInt(id),
        datos_anteriores: grado,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Grado eliminado: ${grado.nombre}`
      });

      res.json({
        success: true,
        message: 'Grado eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar grado:', error);
      
      if (error.message.includes('paralelos asociados')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al eliminar grado: ' + error.message
      });
    }
  }
}

// ============== PARALELO CONTROLLER ==============
class ParaleloController {
  // Listar paralelos
  static async listar(req, res) {
    try {
      const { grado_id, turno_id, anio, activo } = req.query;
      
      const paralelos = await Paralelo.findAll({
        grado_id: grado_id ? parseInt(grado_id) : undefined,
        turno_id: turno_id ? parseInt(turno_id) : undefined,
        anio: anio ? parseInt(anio) : undefined,
        activo: activo !== undefined ? activo === 'true' : undefined
      });

      res.json({
        success: true,
        data: { paralelos }
      });
    } catch (error) {
      console.error('Error al listar paralelos:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar paralelos: ' + error.message
      });
    }
  }

  // Obtener paralelo por ID
  static async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const paralelo = await Paralelo.findById(id);

      if (!paralelo) {
        return res.status(404).json({
          success: false,
          message: 'Paralelo no encontrado'
        });
      }

      res.json({
        success: true,
        data: { paralelo }
      });
    } catch (error) {
      console.error('Error al obtener paralelo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener paralelo: ' + error.message
      });
    }
  }

  // Crear paralelo
  static async crear(req, res) {
    try {
      const paralelo = await Paralelo.create(req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'crear',
        modulo: 'paralelo',
        tabla_afectada: 'paralelo',
        registro_id: paralelo.id,
        datos_nuevos: paralelo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Paralelo creado: ${paralelo.nombre}`
      });

      res.status(201).json({
        success: true,
        message: 'Paralelo creado exitosamente',
        data: { paralelo }
      });
    } catch (error) {
      console.error('Error al crear paralelo:', error);
      
      if (error.constraint === 'paralelo_grado_id_turno_id_nombre_anio_key') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un paralelo con ese nombre para este grado, turno y año'
        });
      }

      if (error.code === '23503') {
        return res.status(400).json({
          success: false,
          message: 'El grado o turno especificado no existe'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al crear paralelo: ' + error.message
      });
    }
  }

  // Actualizar paralelo
  static async actualizar(req, res) {
    try {
      const { id } = req.params;
      const paraleloExistente = await Paralelo.findById(id);

      if (!paraleloExistente) {
        return res.status(404).json({
          success: false,
          message: 'Paralelo no encontrado'
        });
      }

      const paralelo = await Paralelo.update(id, req.body);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'actualizar',
        modulo: 'paralelo',
        tabla_afectada: 'paralelo',
        registro_id: paralelo.id,
        datos_anteriores: paraleloExistente,
        datos_nuevos: paralelo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Paralelo actualizado: ${paralelo.nombre}`
      });

      res.json({
        success: true,
        message: 'Paralelo actualizado exitosamente',
        data: { paralelo }
      });
    } catch (error) {
      console.error('Error al actualizar paralelo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar paralelo: ' + error.message
      });
    }
  }

  // Eliminar paralelo
  static async eliminar(req, res) {
    try {
      const { id } = req.params;
      const paralelo = await Paralelo.findById(id);

      if (!paralelo) {
        return res.status(404).json({
          success: false,
          message: 'Paralelo no encontrado'
        });
      }

      await Paralelo.softDelete(id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id: req.user.id,
        accion: 'eliminar',
        modulo: 'paralelo',
        tabla_afectada: 'paralelo',
        registro_id: parseInt(id),
        datos_anteriores: paralelo,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        resultado: 'exitoso',
        mensaje: `Paralelo eliminado: ${paralelo.nombre}`
      });

      res.json({
        success: true,
        message: 'Paralelo eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar paralelo:', error);
      
      if (error.message.includes('estudiantes activos')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al eliminar paralelo: ' + error.message
      });
    }
  }
}

// Exportar todos los controladores
export { NivelAcademicoController, 
  GradoController, 
  ParaleloController, PeriodoAcademicoController, TurnoController };

// NOTA: Los controladores para NivelAcademico, Grado y Paralelo siguen exactamente 
// el mismo patrón. Por brevedad, puedes replicar la estructura de los controllers anteriores.
// Te puedo generar el código completo de los otros 3 controladores si lo necesitas.