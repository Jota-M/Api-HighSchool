import { TurnoModel } from '../models/turnoModel.js';

export const TurnoController = {
  // Obtener todos los turnos
  async getAll(req, res) {
    try {
      const turnos = await TurnoModel.getAll();
      res.json(turnos);
    } catch (error) {
      console.error('Error al obtener turnos:', error);
      res.status(500).json({ error: 'Error al obtener turnos' });
    }
  },

  // Obtener un turno por ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      const turno = await TurnoModel.getById(id);
      
      if (!turno) {
        return res.status(404).json({ error: 'Turno no encontrado' });
      }
      
      res.json(turno);
    } catch (error) {
      console.error('Error al obtener turno:', error);
      res.status(500).json({ error: 'Error al obtener turno' });
    }
  },

  // Crear un turno
  async create(req, res) {
    try {
      const { nombre, hora_inicio, hora_fin } = req.body;

      // Validaciones
      if (!nombre || !hora_inicio || !hora_fin) {
        return res.status(400).json({ 
          error: 'Nombre, hora de inicio y hora de fin son obligatorios' 
        });
      }

      const nuevoTurno = await TurnoModel.create({
        nombre,
        hora_inicio,
        hora_fin
      });

      res.status(201).json(nuevoTurno);
    } catch (error) {
      console.error('Error al crear turno:', error);
      
      if (error.code === '23505') {
        return res.status(400).json({ 
          error: 'Ya existe un turno con ese nombre' 
        });
      }

      res.status(500).json({ error: 'Error al crear turno' });
    }
  },

  // Actualizar un turno
  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, hora_inicio, hora_fin } = req.body;

      if (!nombre || !hora_inicio || !hora_fin) {
        return res.status(400).json({ 
          error: 'Nombre, hora de inicio y hora de fin son obligatorios' 
        });
      }

      const turnoActualizado = await TurnoModel.update(id, {
        nombre,
        hora_inicio,
        hora_fin
      });

      if (!turnoActualizado) {
        return res.status(404).json({ error: 'Turno no encontrado' });
      }

      res.json(turnoActualizado);
    } catch (error) {
      console.error('Error al actualizar turno:', error);
      
      if (error.code === '23505') {
        return res.status(400).json({ 
          error: 'Ya existe un turno con ese nombre' 
        });
      }

      res.status(500).json({ error: 'Error al actualizar turno' });
    }
  },

  // Eliminar un turno
  async delete(req, res) {
    try {
      const { id } = req.params;
      const turnoEliminado = await TurnoModel.delete(id);

      if (!turnoEliminado) {
        return res.status(404).json({ error: 'Turno no encontrado' });
      }

      res.json({ message: 'Turno eliminado correctamente', turno: turnoEliminado });
    } catch (error) {
      console.error('Error al eliminar turno:', error);
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'No se puede eliminar el turno porque tiene paralelos asociados' 
        });
      }

      res.status(500).json({ error: 'Error al eliminar turno' });
    }
  }
};