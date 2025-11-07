import { ParaleloModel } from '../models/paraleloModel.js';

export const ParaleloController = {
  // Obtener todos los paralelos
  async getAll(req, res) {
    try {
      const paralelos = await ParaleloModel.getAll();
      res.json(paralelos);
    } catch (error) {
      console.error('Error al obtener paralelos:', error);
      res.status(500).json({ error: 'Error al obtener paralelos' });
    }
  },

  // Obtener un paralelo por ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      const paralelo = await ParaleloModel.getById(id);
      
      if (!paralelo) {
        return res.status(404).json({ error: 'Paralelo no encontrado' });
      }
      
      res.json(paralelo);
    } catch (error) {
      console.error('Error al obtener paralelo:', error);
      res.status(500).json({ error: 'Error al obtener paralelo' });
    }
  },

  // Crear un paralelo
  async create(req, res) {
    try {
      const { nombre, grado_id, turno_id, capacidad_maxima, anio } = req.body;

      // Validaciones
      if (!nombre || !grado_id || !turno_id) {
        return res.status(400).json({ 
          error: 'Nombre, grado y turno son obligatorios' 
        });
      }

      const nuevoParalelo = await ParaleloModel.create({
        nombre,
        grado_id,
        turno_id,
        capacidad_maxima: capacidad_maxima || 30,
        anio: anio || new Date().getFullYear()
      });

      res.status(201).json(nuevoParalelo);
    } catch (error) {
      console.error('Error al crear paralelo:', error);
      
      // Error de duplicado
      if (error.code === '23505') {
        return res.status(400).json({ 
          error: 'Ya existe un paralelo con ese nombre para este grado, turno y año' 
        });
      }
      
      // Error de llave foránea
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Grado o turno no válido' 
        });
      }

      res.status(500).json({ error: 'Error al crear paralelo' });
    }
  },

  // Actualizar un paralelo
  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, grado_id, turno_id, capacidad_maxima, anio } = req.body;

      // Validaciones
      if (!nombre || !grado_id || !turno_id) {
        return res.status(400).json({ 
          error: 'Nombre, grado y turno son obligatorios' 
        });
      }

      const paraleloActualizado = await ParaleloModel.update(id, {
        nombre,
        grado_id,
        turno_id,
        capacidad_maxima,
        anio
      });

      if (!paraleloActualizado) {
        return res.status(404).json({ error: 'Paralelo no encontrado' });
      }

      res.json(paraleloActualizado);
    } catch (error) {
      console.error('Error al actualizar paralelo:', error);
      
      if (error.code === '23505') {
        return res.status(400).json({ 
          error: 'Ya existe un paralelo con ese nombre para este grado, turno y año' 
        });
      }

      res.status(500).json({ error: 'Error al actualizar paralelo' });
    }
  },

  // Eliminar un paralelo
  async delete(req, res) {
    try {
      const { id } = req.params;
      const paraleloEliminado = await ParaleloModel.delete(id);

      if (!paraleloEliminado) {
        return res.status(404).json({ error: 'Paralelo no encontrado' });
      }

      res.json({ message: 'Paralelo eliminado correctamente', paralelo: paraleloEliminado });
    } catch (error) {
      console.error('Error al eliminar paralelo:', error);
      
      // Error de restricción de llave foránea
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'No se puede eliminar el paralelo porque tiene estudiantes inscritos o registros relacionados' 
        });
      }

      res.status(500).json({ error: 'Error al eliminar paralelo' });
    }
  },

  // Obtener estadísticas
  async getEstadisticas(req, res) {
    try {
      const stats = await ParaleloModel.getEstadisticas();
      res.json(stats);
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
  },

  // Obtener paralelos por grado
  async getByGrado(req, res) {
    try {
      const { gradoId } = req.params;
      const paralelos = await ParaleloModel.getByGrado(gradoId);
      res.json(paralelos);
    } catch (error) {
      console.error('Error al obtener paralelos por grado:', error);
      res.status(500).json({ error: 'Error al obtener paralelos' });
    }
  }
};