import { GradoModel } from '../models/gradoModel.js';

export const GradoController = {
  // Obtener todos los grados
  async getAll(req, res) {
    try {
      const grados = await GradoModel.getAll();
      res.json(grados);
    } catch (error) {
      console.error('Error al obtener grados:', error);
      res.status(500).json({ error: 'Error al obtener grados' });
    }
  },

  // Obtener un grado por ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      const grado = await GradoModel.getById(id);
      
      if (!grado) {
        return res.status(404).json({ error: 'Grado no encontrado' });
      }
      
      res.json(grado);
    } catch (error) {
      console.error('Error al obtener grado:', error);
      res.status(500).json({ error: 'Error al obtener grado' });
    }
  },

  // Crear un grado
  async create(req, res) {
    try {
      const { nivel_academico_id, nombre, descripcion, orden } = req.body;

      // Validaciones
      if (!nivel_academico_id || !nombre || !orden) {
        return res.status(400).json({ 
          error: 'Nivel académico, nombre y orden son obligatorios' 
        });
      }

      const nuevoGrado = await GradoModel.create({
        nivel_academico_id,
        nombre,
        descripcion,
        orden
      });

      res.status(201).json(nuevoGrado);
    } catch (error) {
      console.error('Error al crear grado:', error);
      
      if (error.code === '23505') {
        return res.status(400).json({ 
          error: 'Ya existe un grado con ese nombre en este nivel académico' 
        });
      }
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'Nivel académico no válido' 
        });
      }

      res.status(500).json({ error: 'Error al crear grado' });
    }
  },

  // Actualizar un grado
  async update(req, res) {
    try {
      const { id } = req.params;
      const { nivel_academico_id, nombre, descripcion, orden } = req.body;

      if (!nivel_academico_id || !nombre || !orden) {
        return res.status(400).json({ 
          error: 'Nivel académico, nombre y orden son obligatorios' 
        });
      }

      const gradoActualizado = await GradoModel.update(id, {
        nivel_academico_id,
        nombre,
        descripcion,
        orden
      });

      if (!gradoActualizado) {
        return res.status(404).json({ error: 'Grado no encontrado' });
      }

      res.json(gradoActualizado);
    } catch (error) {
      console.error('Error al actualizar grado:', error);
      
      if (error.code === '23505') {
        return res.status(400).json({ 
          error: 'Ya existe un grado con ese nombre en este nivel académico' 
        });
      }

      res.status(500).json({ error: 'Error al actualizar grado' });
    }
  },

  // Eliminar un grado
  async delete(req, res) {
    try {
      const { id } = req.params;
      const gradoEliminado = await GradoModel.delete(id);

      if (!gradoEliminado) {
        return res.status(404).json({ error: 'Grado no encontrado' });
      }

      res.json({ message: 'Grado eliminado correctamente', grado: gradoEliminado });
    } catch (error) {
      console.error('Error al eliminar grado:', error);
      
      if (error.code === '23503') {
        return res.status(400).json({ 
          error: 'No se puede eliminar el grado porque tiene paralelos asociados' 
        });
      }

      res.status(500).json({ error: 'Error al eliminar grado' });
    }
  },

  // Obtener grados por nivel
  async getByNivel(req, res) {
    try {
      const { nivelId } = req.params;
      const grados = await GradoModel.getByNivel(nivelId);
      res.json(grados);
    } catch (error) {
      console.error('Error al obtener grados por nivel:', error);
      res.status(500).json({ error: 'Error al obtener grados' });
    }
  }
};