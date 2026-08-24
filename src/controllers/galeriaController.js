// controllers/galeriaController.js
import GaleriaInstitucional from '../models/GaleriaInstitucional.js';
import UploadImage from '../utils/uploadImage.js';

class GaleriaController {
    // ─── GET /api/galeria/vigentes ─────────────────────────────────────────
    // Pública para cualquier rol logueado — la usa el carrusel del home
    // (app y web). Solo authenticate, sin permiso de módulo.
    static async vigentes(req, res) {
        try {
            const fotos = await GaleriaInstitucional.findVigentes();
            res.json({ success: true, data: { fotos } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener la galería: ' + error.message });
        }
    }

    // ─── GET /api/galeria ───────────────────────────────────────────────────
    // Gestión — incluye inactivas y vencidas, paginado.
    // Query: ?activo=true&vigente=true&page=1&limit=20
    static async listar(req, res) {
        try {
            const { activo, vigente, page, limit } = req.query;
            const result = await GaleriaInstitucional.findAll({
                activo: activo !== undefined ? activo === 'true' : undefined,
                vigente: vigente === 'true',
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 20
            });
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al listar la galería: ' + error.message });
        }
    }

    // ─── GET /api/galeria/:id ───────────────────────────────────────────────
    static async obtenerPorId(req, res) {
        try {
            const foto = await GaleriaInstitucional.findById(req.params.id);
            if (!foto) {
                return res.status(404).json({ success: false, message: 'Foto no encontrada' });
            }
            res.json({ success: true, data: { foto } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener la foto: ' + error.message });
        }
    }

    // ─── POST /api/galeria ──────────────────────────────────────────────────
    // multipart/form-data: campo "foto" (imagen) + titulo, orden?,
    // fecha_inicio?, fecha_fin?
    static async crear(req, res) {
        try {
            const { titulo, orden, fecha_inicio, fecha_fin } = req.body;

            if (!titulo || !titulo.trim()) {
                return res.status(400).json({ success: false, message: 'El título es requerido' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'La imagen es requerida' });
            }

            const subida = await UploadImage.uploadFromBuffer(req.file.buffer, 'galeria_institucional');

            const foto = await GaleriaInstitucional.create({
                titulo: titulo.trim(),
                imagen_url: subida.url,
                cloudinary_public_id: subida.public_id,
                orden: orden ? parseInt(orden) : 0,
                fecha_inicio: fecha_inicio || null,
                fecha_fin: fecha_fin || null,
                creado_por: req.user.id
            });

            res.status(201).json({ success: true, message: 'Foto agregada a la galería', data: { foto } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al crear la foto: ' + error.message });
        }
    }

    // ─── PUT /api/galeria/:id ───────────────────────────────────────────────
    // La imagen (campo "foto") es opcional acá — si no viene, se actualizan
    // solo los demás campos y se deja la imagen actual tal cual.
    static async actualizar(req, res) {
        try {
            const { id } = req.params;
            const existente = await GaleriaInstitucional.findById(id);
            if (!existente) {
                return res.status(404).json({ success: false, message: 'Foto no encontrada' });
            }

            const { titulo, orden, fecha_inicio, fecha_fin, activo } = req.body;
            const data = {};
            if (titulo !== undefined) data.titulo = titulo.trim();
            if (orden !== undefined) data.orden = parseInt(orden);
            if (fecha_inicio !== undefined) data.fecha_inicio = fecha_inicio || null;
            if (fecha_fin !== undefined) data.fecha_fin = fecha_fin || null;
            if (activo !== undefined) data.activo = activo === 'true' || activo === true;

            // Si mandaron una imagen nueva, la subimos y borramos la vieja de
            // Cloudinary para no dejar basura acumulándose ahí.
            if (req.file) {
                const subida = await UploadImage.uploadFromBuffer(req.file.buffer, 'galeria_institucional');
                data.imagen_url = subida.url;
                data.cloudinary_public_id = subida.public_id;

                if (existente.cloudinary_public_id) {
                    UploadImage.deleteImage(existente.cloudinary_public_id).catch(err =>
                        console.error('No se pudo borrar la imagen anterior de Cloudinary:', err.message)
                    );
                }
            }

            const foto = await GaleriaInstitucional.update(id, data);
            res.json({ success: true, message: 'Foto actualizada', data: { foto } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al actualizar la foto: ' + error.message });
        }
    }

    // ─── PATCH /api/galeria/:id/activo ──────────────────────────────────────
    // Ocultar/mostrar sin borrar — para sacar una foto de circulación
    // rápido sin perder el registro ni la imagen en Cloudinary.
    static async toggleActivo(req, res) {
        try {
            const { id } = req.params;
            const existente = await GaleriaInstitucional.findById(id);
            if (!existente) {
                return res.status(404).json({ success: false, message: 'Foto no encontrada' });
            }
            const foto = await GaleriaInstitucional.update(id, { activo: !existente.activo });
            res.json({
                success: true,
                message: foto.activo ? 'Foto activada' : 'Foto desactivada',
                data: { foto }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al cambiar el estado: ' + error.message });
        }
    }

    // ─── DELETE /api/galeria/:id ─────────────────────────────────────────────
    // Borrado físico: saca la fila Y la imagen de Cloudinary. Si preferís
    // conservar historial, usar PATCH /:id/activo en vez de esto.
    static async eliminar(req, res) {
        try {
            const eliminado = await GaleriaInstitucional.delete(req.params.id);
            if (!eliminado) {
                return res.status(404).json({ success: false, message: 'Foto no encontrada' });
            }
            if (eliminado.cloudinary_public_id) {
                UploadImage.deleteImage(eliminado.cloudinary_public_id).catch(err =>
                    console.error('No se pudo borrar la imagen de Cloudinary:', err.message)
                );
            }
            res.json({ success: true, message: 'Foto eliminada de la galería' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al eliminar la foto: ' + error.message });
        }
    }
}

export default GaleriaController;