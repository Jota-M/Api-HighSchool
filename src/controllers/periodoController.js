import { PeriodoModel } from "../models/periodoModel.js";

export const PeriodoController = {
  async getAll(req, res) {
    try {
      const data = await PeriodoModel.getAll();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      const data = await PeriodoModel.getById(id);
      if (!data) return res.status(404).json({ message: "Periodo no encontrado" });
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req, res) {
    try {
      const periodo = await PeriodoModel.create(req.body);
      res.status(201).json(periodo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const updated = await PeriodoModel.update(id, req.body);
      if (!updated) return res.status(404).json({ message: "Periodo no encontrado" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;
      await PeriodoModel.delete(id);
      res.json({ message: "Periodo eliminado" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};
