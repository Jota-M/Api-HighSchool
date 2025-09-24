import { PreinscripcionModel } from '../models/preinscripcionModel.js';

export const PreinscripcionController = {
  async getAll(req, res) {
    try {
      const data = await PreinscripcionModel.getAll();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener datos' });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      const data = await PreinscripcionModel.getById(id);
      if (!data) return res.status(404).json({ message: 'No encontrado' });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener el registro' });
    }
  },

  async create(req, res) {
    try {
      const { nombre, edad, curso } = req.body;
      const newData = await PreinscripcionModel.create({ nombre, edad, curso });
      res.status(201).json(newData);
    } catch (err) {
      res.status(500).json({ error: 'Error al crear registro' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { nombre, edad, curso } = req.body;
      const updatedData = await PreinscripcionModel.update(id, { nombre, edad, curso });
      if (!updatedData) return res.status(404).json({ message: 'No encontrado' });
      res.json(updatedData);
    } catch (err) {
      res.status(500).json({ error: 'Error al actualizar registro' });
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      const deleted = await PreinscripcionModel.remove(id);
      if (!deleted) return res.status(404).json({ message: 'No encontrado' });
      res.json({ message: 'Eliminado correctamente' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar registro' });
    }
  },
};
