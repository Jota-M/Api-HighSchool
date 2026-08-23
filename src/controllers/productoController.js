// controllers/productoController.js
// CRUD de catálogo de productos (uniformes/deportivos) para administración

import { pool } from '../db/pool.js';
import { Producto, ProductoVariante } from '../models/Producto.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class ProductoController {
    // GET /api/productos
    static async listar(req, res) {
        try {
            const { categoria, nivel_academico_id, activo } = req.query;
            const productos = await Producto.findAll({
                categoria,
                nivel_academico_id: nivel_academico_id ? parseInt(nivel_academico_id) : undefined,
                activo: activo !== undefined ? activo === 'true' : undefined,
            });

            res.json({ success: true, data: { productos, total: productos.length } });
        } catch (error) {
            console.error('Error al listar productos:', error);
            res.status(500).json({ success: false, message: 'Error al listar productos: ' + error.message });
        }
    }

    // GET /api/productos/:id
    static async obtenerPorId(req, res) {
        try {
            const { id } = req.params;
            const producto = await Producto.findByIdConVariantes(id);

            if (!producto) {
                return res.status(404).json({ success: false, message: 'Producto no encontrado' });
            }

            res.json({ success: true, data: { producto } });
        } catch (error) {
            console.error('Error al obtener producto:', error);
            res.status(500).json({ success: false, message: 'Error al obtener producto: ' + error.message });
        }
    }

    // POST /api/productos (Soporta subida de foto a Cloudinary vía req.file)
    static async crear(req, res) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            let foto_url = req.body.foto_url || null;

            // Manejar subida de foto a Cloudinary si se proporciona un archivo
            if (req.file) {
                if (!UploadImage.isValidImage(req.file)) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        success: false,
                        message: 'El archivo debe ser una imagen válida (JPG, PNG, GIF, WEBP)',
                    });
                }

                if (!UploadImage.isValidSize(req.file, 5)) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        success: false,
                        message: 'La imagen es demasiado grande. Máximo 5MB',
                    });
                }

                const uploadResult = await UploadImage.uploadFromBuffer(
                    req.file.buffer,
                    'productos',
                    `producto_${Date.now()}`
                );

                foto_url = uploadResult.url;
            }

            // Parsear variantes si vienen como JSON string (caso multipart/form-data)
            let variantes = req.body.variantes;
            if (typeof variantes === 'string') {
                try {
                    variantes = JSON.parse(variantes);
                } catch (e) {
                    variantes = [];
                }
            }

            const productoData = {
                codigo: req.body.codigo,
                categoria: req.body.categoria,
                nombre: req.body.nombre,
                descripcion: req.body.descripcion,
                tiene_variantes: req.body.tiene_variantes !== undefined ? (req.body.tiene_variantes === 'true' || req.body.tiene_variantes === true) : true,
                precio_base: parseFloat(req.body.precio_base) || 0,
                nivel_academico_id: req.body.nivel_academico_id ? parseInt(req.body.nivel_academico_id) : null,
                foto_url,
            };

            const producto = await Producto.create(productoData, client);

            if (productoData.tiene_variantes) {
                // Producto con talla/color: se cargan las variantes que armó el formulario
                if (Array.isArray(variantes)) {
                    for (const variante of variantes) {
                        await ProductoVariante.create({ ...variante, producto_id: producto.id }, client);
                    }
                }
            } else {
                // Producto simple: se crea una única variante "por defecto" (sin
                // talla/color) que es la que va a llevar el stock. Es necesaria
                // porque pedido_producto_detalle.producto_variante_id es NOT NULL:
                // toda venta, tenga o no variantes visibles, pasa por acá.
                const stockInicial = parseInt(req.body.stock_total) || 0;
                await ProductoVariante.crearDefault(producto.id, stockInicial, client);
            }

            const reqInfo = RequestInfo.extract(req);
            await ActividadLog.create({
                usuario_id: req.user.id,
                accion: 'crear',
                modulo: 'producto',
                tabla_afectada: 'producto',
                registro_id: producto.id,
                datos_nuevos: producto,
                ip_address: reqInfo.ip,
                user_agent: reqInfo.userAgent,
                resultado: 'exitoso',
                mensaje: `Producto creado: ${producto.codigo} - ${producto.nombre}`,
            });

            await client.query('COMMIT');

            const productoCompleto = await Producto.findByIdConVariantes(producto.id);
            res.status(201).json({ success: true, message: 'Producto creado exitosamente', data: { producto: productoCompleto } });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al crear producto:', error);
            if (error.code === '23505') {
                return res.status(409).json({ success: false, message: 'Ya existe un producto con ese código' });
            }
            res.status(500).json({ success: false, message: 'Error al crear producto: ' + error.message });
        } finally {
            client.release();
        }
    }

    // PUT /api/productos/:id (Soporta actualización de foto a Cloudinary)
    static async actualizar(req, res) {
        try {
            const { id } = req.params;
            const productoExistente = await Producto.findById(id);

            if (!productoExistente) {
                return res.status(404).json({ success: false, message: 'Producto no encontrado' });
            }

            const updateData = { ...req.body };

            // Subir nueva foto si viene en req.file
            if (req.file) {
                if (!UploadImage.isValidImage(req.file)) {
                    return res.status(400).json({
                        success: false,
                        message: 'El archivo debe ser una imagen válida (JPG, PNG, GIF, WEBP)',
                    });
                }

                if (!UploadImage.isValidSize(req.file, 5)) {
                    return res.status(400).json({
                        success: false,
                        message: 'La imagen es demasiado grande. Máximo 5MB',
                    });
                }

                const uploadResult = await UploadImage.uploadFromBuffer(
                    req.file.buffer,
                    'productos',
                    `producto_${id}_${Date.now()}`
                );

                updateData.foto_url = uploadResult.url;

                // Eliminar foto anterior si existía en Cloudinary
                if (productoExistente.foto_url) {
                    const publicId = UploadImage.extractPublicIdFromUrl(productoExistente.foto_url);
                    if (publicId) {
                        UploadImage.deleteImage(publicId).catch((err) =>
                            console.error('Error al eliminar foto anterior de Cloudinary:', err)
                        );
                    }
                }
            }

            const producto = await Producto.update(id, updateData);

            // tiene_variantes no se puede cambiar desde el formulario de edición
            // (Producto.update ni lo acepta), así que usamos el valor existente
            // para decidir si este producto maneja su stock vía la variante
            // "por defecto".
            if (!productoExistente.tiene_variantes && req.body.stock_total !== undefined) {
                const nuevoStock = parseInt(req.body.stock_total) || 0;
                let varianteDefault = await ProductoVariante.findDefaultByProducto(id);

                if (varianteDefault) {
                    await ProductoVariante.setStockTotal(varianteDefault.id, nuevoStock);
                } else {
                    // Productos creados antes de este cambio pueden no tener
                    // todavía su variante por defecto — se crea recién ahora.
                    await ProductoVariante.crearDefault(id, nuevoStock);
                }
            }

            const productoActualizado = await Producto.findByIdConVariantes(id);
            res.json({ success: true, message: 'Producto actualizado exitosamente', data: { producto: productoActualizado } });
        } catch (error) {
            console.error('Error al actualizar producto:', error);
            res.status(500).json({ success: false, message: 'Error al actualizar producto: ' + error.message });
        }
    }

    // DELETE /api/productos/:id/foto
    static async eliminarFoto(req, res) {
        try {
            const { id } = req.params;
            const producto = await Producto.findById(id);

            if (!producto) {
                return res.status(404).json({ success: false, message: 'Producto no encontrado' });
            }

            if (producto.foto_url) {
                const publicId = UploadImage.extractPublicIdFromUrl(producto.foto_url);
                if (publicId) {
                    await UploadImage.deleteImage(publicId);
                }
                await Producto.update(id, { foto_url: null });
            }

            res.json({ success: true, message: 'Foto eliminada exitosamente' });
        } catch (error) {
            console.error('Error al eliminar foto:', error);
            res.status(500).json({ success: false, message: 'Error al eliminar foto: ' + error.message });
        }
    }

    // DELETE /api/productos/:id
    static async eliminar(req, res) {
        try {
            const { id } = req.params;
            const producto = await Producto.findById(id);

            if (!producto) {
                return res.status(404).json({ success: false, message: 'Producto no encontrado' });
            }

            // Eliminar foto de Cloudinary si existía
            if (producto.foto_url) {
                const publicId = UploadImage.extractPublicIdFromUrl(producto.foto_url);
                if (publicId) {
                    UploadImage.deleteImage(publicId).catch((err) =>
                        console.error('Error al eliminar foto de Cloudinary al borrar producto:', err)
                    );
                }
            }

            const eliminado = await Producto.delete(id);

            res.json({ success: true, message: 'Producto eliminado exitosamente' });
        } catch (error) {
            console.error('Error al eliminar producto:', error);
            res.status(500).json({ success: false, message: 'Error al eliminar producto: ' + error.message });
        }
    }

    // POST /api/productos/:id/variantes
    static async agregarVariante(req, res) {
        try {
            const { id } = req.params;
            const variante = await ProductoVariante.create({ ...req.body, producto_id: id });

            res.status(201).json({ success: true, message: 'Variante agregada exitosamente', data: { variante } });
        } catch (error) {
            console.error('Error al agregar variante:', error);
            if (error.code === '23505') {
                return res.status(409).json({ success: false, message: 'Ya existe una variante con ese SKU' });
            }
            res.status(500).json({ success: false, message: 'Error al agregar variante: ' + error.message });
        }
    }
}

export default ProductoController;