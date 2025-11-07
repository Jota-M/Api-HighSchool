import { NivelAcademicoModel } from '../models/nivelAcademicoModel.js';

export const NivelAcademicoController = {
  // GET /api/niveles - Obtener todos los niveles con sus grados
  async getAll(req, res) {
    try {
      const niveles = await NivelAcademicoModel.getAllWithGrados();
      res.json(niveles);
    } catch (error) {
      console.error('Error al obtener niveles:', error);
      res.status(500).json({ error: 'Error al obtener niveles académicos' });
    }
  },

  // GET /api/niveles/:id - Obtener un nivel por ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      const nivel = await NivelAcademicoModel.getById(id);
      
      if (!nivel) {
        return res.status(404).json({ error: 'Nivel no encontrado' });
      }
      
      res.json(nivel);
    } catch (error) {
      console.error('Error al obtener nivel:', error);
      res.status(500).json({ error: 'Error al obtener nivel académico' });
    }
  },

  // POST /api/niveles - Crear nivel
  async create(req, res) {
    try {
      const { nombre, descripcion, orden } = req.body;
      
      if (!nombre) {
        return res.status(400).json({ error: 'El nombre es requerido' });
      }
      
      const nuevoNivel = await NivelAcademicoModel.create({
        nombre,
        descripcion: descripcion || null,
        orden: orden || 0
      });
      
      res.status(201).json(nuevoNivel);
    } catch (error) {
      console.error('Error al crear nivel:', error);
      
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: 'Ya existe un nivel con ese nombre' });
      }
      
      res.status(500).json({ error: 'Error al crear nivel académico' });
    }
  },

  // PUT /api/niveles/:id - Actualizar nivel
  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, orden } = req.body;
      
      if (!nombre) {
        return res.status(400).json({ error: 'El nombre es requerido' });
      }
      
      const nivelActualizado = await NivelAcademicoModel.update(id, {
        nombre,
        descripcion: descripcion || null,
        orden: orden || 0
      });
      
      if (!nivelActualizado) {
        return res.status(404).json({ error: 'Nivel no encontrado' });
      }
      
      res.json(nivelActualizado);
    } catch (error) {
      console.error('Error al actualizar nivel:', error);
      
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ya existe un nivel con ese nombre' });
      }
      
      res.status(500).json({ error: 'Error al actualizar nivel académico' });
    }
  },

  // DELETE /api/niveles/:id - Eliminar nivel
  async delete(req, res) {
    try {
      const { id } = req.params;
      const nivelEliminado = await NivelAcademicoModel.delete(id);
      
      if (!nivelEliminado) {
        return res.status(404).json({ error: 'Nivel no encontrado' });
      }
      
      res.json({ message: 'Nivel eliminado exitosamente', nivel: nivelEliminado });
    } catch (error) {
      console.error('Error al eliminar nivel:', error);
      res.status(500).json({ error: 'Error al eliminar nivel académico' });
    }
  },

  // GET /api/niveles/stats - Obtener estadísticas
  async getStats(req, res) {
    try {
      const stats = await NivelAcademicoModel.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
  }
};