import { GradoMateriaModel } from "../models/gradoMateriaModel.js";

export const GradoMateriaController = {
  async getAll(req, res) {
    try {
      const data = await GradoMateriaModel.getAll();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      const data = await GradoMateriaModel.getById(id);
      if (!data) return res.status(404).json({ message: "Relación no encontrada" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req, res) {
    try {
      const relation = await GradoMateriaModel.create(req.body);
      res.status(201).json(relation);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const updated = await GradoMateriaModel.update(id, req.body);
      if (!updated) return res.status(404).json({ message: "Relación no encontrada" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;
      await GradoMateriaModel.delete(id);
      res.json({ message: "Relación eliminada" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};
