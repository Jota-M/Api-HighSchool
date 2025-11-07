import { MateriaModel } from "../models/materiaModel.js";

export const MateriaController = {
  async getAll(req, res) {
    try {
      const data = await MateriaModel.getAll();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      const data = await MateriaModel.getById(id);
      if (!data) return res.status(404).json({ message: "Materia no encontrada" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req, res) {
    try {
      const materia = await MateriaModel.create(req.body);
      res.status(201).json(materia);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const updated = await MateriaModel.update(id, req.body);
      if (!updated) return res.status(404).json({ message: "Materia no encontrada" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;
      await MateriaModel.delete(id);
      res.json({ message: "Materia eliminada" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};
