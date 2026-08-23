// controllers/egresoController.js
import { Egreso, TipoEgreso } from '../models/Egreso.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo from '../utils/requestInfo.js';
import UploadImage from '../utils/uploadImage.js';

class EgresoController {
    // Listar egresos
    static async listar(req, res) {
        try {
            const {
                page, limit, search, tipo_egreso_id, periodo_academico_id,
                docente_id, fecha_desde, fecha_hasta, metodo_pago,
                estado, referencia_tipo
            } = req.query;

            const result = await Egreso.findAll({
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 10,
                search,
                tipo_egreso_id: tipo_egreso_id ? parseInt(tipo_egreso_id) : undefined,
                periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
                docente_id: docente_id ? parseInt(docente_id) : undefined,
                fecha_desde,
                fecha_hasta,
                metodo_pago,
                estado,
                referencia_tipo
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error al listar egresos:', error);
            res.status(500).json({
                success: false,
                message: 'Error al listar egresos: ' + error.message
            });
        }
    }

    // Obtener egreso por ID
    static async obtenerPorId(req, res) {
        try {
            const { id } = req.params;
            const egreso = await Egreso.findById(id);

            if (!egreso) {
                return res.status(404).json({
                    success: false,
                    message: 'Egreso no encontrado'
                });
            }

            res.json({
                success: true,
                data: { egreso }
            });
        } catch (error) {
            console.error('Error al obtener egreso:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener egreso: ' + error.message
            });
        }
    }

    // Obtener egreso por código
    static async obtenerPorCodigo(req, res) {
        try {
            const { codigo } = req.params;
            const egreso = await Egreso.findByCodigo(codigo);

            if (!egreso) {
                return res.status(404).json({
                    success: false,
                    message: 'Egreso no encontrado'
                });
            }

            res.json({
                success: true,
                data: { egreso }
            });
        } catch (error) {
            console.error('Error al obtener egreso:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener egreso: ' + error.message
            });
        }
    }

    // Crear egreso (registro manual)
    static async crear(req, res) {
        try {
            const {
                tipo_egreso_id, monto, metodo_pago, concepto,
                docente_id, periodo_academico_id
            } = req.body;

            // Validaciones básicas
            if (!tipo_egreso_id || !monto || !metodo_pago || !concepto) {
                return res.status(400).json({
                    success: false,
                    message: 'Tipo de egreso, concepto, monto y método de pago son requeridos'
                });
            }

            // Verificar que el tipo de egreso existe
            const tipoEgreso = await TipoEgreso.findById(tipo_egreso_id);
            if (!tipoEgreso) {
                return res.status(404).json({
                    success: false,
                    message: 'Tipo de egreso no encontrado'
                });
            }

            // Si requiere docente, validar que esté presente
            if (tipoEgreso.requiere_docente && !docente_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Este tipo de egreso requiere un docente'
                });
            }

            // Manejar comprobante si existe
            let comprobante_url = null;
            if (req.file) {
                try {
                    const uploadResult = await UploadImage.uploadFromBuffer(
                        req.file.buffer,
                        'comprobantes_egresos',
                        `egreso_${Date.now()}`
                    );
                    comprobante_url = uploadResult.url;
                } catch (uploadError) {
                    console.error('Error al subir comprobante:', uploadError);
                }
            }

            // Generar código de egreso
            const codigo_egreso = await Egreso.generateCodigo();

            // Crear egreso
            const egreso = await Egreso.create({
                ...req.body,
                codigo_egreso,
                comprobante_url,
                registrado_por: req.user.id
            });

            const reqInfo = RequestInfo.extract(req);
            await ActividadLog.create({
                usuario_id: req.user.id,
                accion: 'crear',
                modulo: 'egresos',
                tabla_afectada: 'egreso',
                registro_id: egreso.id,
                datos_nuevos: egreso,
                ip_address: reqInfo.ip,
                user_agent: reqInfo.userAgent,
                resultado: 'exitoso',
                mensaje: `Egreso creado: ${egreso.codigo_egreso} - Bs. ${egreso.monto_neto}`
            });

            res.status(201).json({
                success: true,
                message: 'Egreso registrado exitosamente',
                data: { egreso }
            });
        } catch (error) {
            console.error('Error al crear egreso:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear egreso: ' + error.message
            });
        }
    }

    // Verificar egreso
    static async verificar(req, res) {
        try {
            const { id } = req.params;

            const egresoExistente = await Egreso.findById(id);
            if (!egresoExistente) {
                return res.status(404).json({
                    success: false,
                    message: 'Egreso no encontrado'
                });
            }

            if (egresoExistente.verificado) {
                return res.status(409).json({
                    success: false,
                    message: 'Este egreso ya está verificado'
                });
            }

            const egreso = await Egreso.verificar(id, req.user.id);

            const reqInfo = RequestInfo.extract(req);
            await ActividadLog.create({
                usuario_id: req.user.id,
                accion: 'verificar',
                modulo: 'egresos',
                tabla_afectada: 'egreso',
                registro_id: egreso.id,
                datos_anteriores: { verificado: false },
                datos_nuevos: { verificado: true },
                ip_address: reqInfo.ip,
                user_agent: reqInfo.userAgent,
                resultado: 'exitoso',
                mensaje: `Egreso verificado: ${egreso.codigo_egreso}`
            });

            res.json({
                success: true,
                message: 'Egreso verificado exitosamente',
                data: { egreso }
            });
        } catch (error) {
            console.error('Error al verificar egreso:', error);
            res.status(500).json({
                success: false,
                message: 'Error al verificar egreso: ' + error.message
            });
        }
    }

    // Anular egreso
    static async anular(req, res) {
        try {
            const { id } = req.params;
            const { motivo } = req.body;

            if (!motivo) {
                return res.status(400).json({
                    success: false,
                    message: 'El motivo de anulación es requerido'
                });
            }

            const egresoExistente = await Egreso.findById(id);
            if (!egresoExistente) {
                return res.status(404).json({
                    success: false,
                    message: 'Egreso no encontrado'
                });
            }

            if (egresoExistente.anulado) {
                return res.status(409).json({
                    success: false,
                    message: 'Este egreso ya está anulado'
                });
            }

            const egreso = await Egreso.anular(id, motivo, req.user.id);

            const reqInfo = RequestInfo.extract(req);
            await ActividadLog.create({
                usuario_id: req.user.id,
                accion: 'anular',
                modulo: 'egresos',
                tabla_afectada: 'egreso',
                registro_id: egreso.id,
                datos_anteriores: egresoExistente,
                datos_nuevos: { anulado: true, motivo },
                ip_address: reqInfo.ip,
                user_agent: reqInfo.userAgent,
                resultado: 'exitoso',
                mensaje: `Egreso anulado: ${egreso.codigo_egreso}`
            });

            res.json({
                success: true,
                message: 'Egreso anulado exitosamente',
                data: { egreso }
            });
        } catch (error) {
            console.error('Error al anular egreso:', error);
            res.status(500).json({
                success: false,
                message: 'Error al anular egreso: ' + error.message
            });
        }
    }

    // Obtener resumen por categoría
    static async obtenerResumenPorCategoria(req, res) {
        try {
            const { periodo_academico_id, fecha_desde, fecha_hasta } = req.query;

            const resumen = await Egreso.getResumenPorCategoria({
                periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
                fecha_desde,
                fecha_hasta
            });

            res.json({
                success: true,
                data: { resumen }
            });
        } catch (error) {
            console.error('Error al obtener resumen:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener resumen: ' + error.message
            });
        }
    }

    // Obtener resumen por método de pago
    static async obtenerResumenPorMetodoPago(req, res) {
        try {
            const { periodo_academico_id, fecha_desde, fecha_hasta } = req.query;

            const resumen = await Egreso.getResumenPorMetodoPago({
                periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
                fecha_desde,
                fecha_hasta
            });

            res.json({
                success: true,
                data: { resumen }
            });
        } catch (error) {
            console.error('Error al obtener resumen:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener resumen: ' + error.message
            });
        }
    }

    // Obtener egresos diarios
    static async obtenerEgresosDiarios(req, res) {
        try {
            const { fecha_desde, fecha_hasta, periodo_academico_id } = req.query;

            const egresos = await Egreso.getEgresosDiarios({
                periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
                fecha_desde,
                fecha_hasta
            });

            res.json({
                success: true,
                data: { egresos }
            });
        } catch (error) {
            console.error('Error al obtener egresos diarios:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener egresos diarios: ' + error.message
            });
        }
    }

    // Obtener estadísticas generales
    static async obtenerEstadisticas(req, res) {
        try {
            const { periodo_academico_id, fecha_desde, fecha_hasta } = req.query;

            const estadisticas = await Egreso.getEstadisticas({
                periodo_academico_id: periodo_academico_id ? parseInt(periodo_academico_id) : undefined,
                fecha_desde,
                fecha_hasta
            });

            res.json({
                success: true,
                data: { estadisticas }
            });
        } catch (error) {
            console.error('Error al obtener estadísticas:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener estadísticas: ' + error.message
            });
        }
    }
}

// ==========================================
// CONTROLADOR TIPO EGRESO
// ==========================================
class TipoEgresoController {
    // Listar tipos de egreso
    static async listar(req, res) {
        try {
            const { activo, categoria } = req.query;

            const tipos = await TipoEgreso.findAll({
                activo: activo !== undefined ? activo === 'true' : undefined,
                categoria
            });

            res.json({
                success: true,
                data: { tipos }
            });
        } catch (error) {
            console.error('Error al listar tipos de egreso:', error);
            res.status(500).json({
                success: false,
                message: 'Error al listar tipos de egreso: ' + error.message
            });
        }
    }

    // Obtener tipo de egreso por ID
    static async obtenerPorId(req, res) {
        try {
            const { id } = req.params;
            const tipo = await TipoEgreso.findById(id);

            if (!tipo) {
                return res.status(404).json({
                    success: false,
                    message: 'Tipo de egreso no encontrado'
                });
            }

            res.json({
                success: true,
                data: { tipo }
            });
        } catch (error) {
            console.error('Error al obtener tipo de egreso:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener tipo de egreso: ' + error.message
            });
        }
    }

    // Crear tipo de egreso
    static async crear(req, res) {
        try {
            const { codigo, nombre, categoria } = req.body;

            if (!codigo || !nombre || !categoria) {
                return res.status(400).json({
                    success: false,
                    message: 'Código, nombre y categoría son requeridos'
                });
            }

            // Verificar que el código no exista
            const existente = await TipoEgreso.findByCodigo(codigo);
            if (existente) {
                return res.status(409).json({
                    success: false,
                    message: 'Ya existe un tipo de egreso con este código'
                });
            }

            const tipo = await TipoEgreso.create(req.body);

            const reqInfo = RequestInfo.extract(req);
            await ActividadLog.create({
                usuario_id: req.user.id,
                accion: 'crear',
                modulo: 'egresos',
                tabla_afectada: 'tipo_egreso',
                registro_id: tipo.id,
                datos_nuevos: tipo,
                ip_address: reqInfo.ip,
                user_agent: reqInfo.userAgent,
                resultado: 'exitoso',
                mensaje: `Tipo de egreso creado: ${tipo.nombre}`
            });

            res.status(201).json({
                success: true,
                message: 'Tipo de egreso creado exitosamente',
                data: { tipo }
            });
        } catch (error) {
            console.error('Error al crear tipo de egreso:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear tipo de egreso: ' + error.message
            });
        }
    }

    // Actualizar tipo de egreso
    static async actualizar(req, res) {
        try {
            const { id } = req.params;

            const tipoExistente = await TipoEgreso.findById(id);
            if (!tipoExistente) {
                return res.status(404).json({
                    success: false,
                    message: 'Tipo de egreso no encontrado'
                });
            }

            // Validar categoría si se está actualizando
            if (req.body.categoria) {
                const categoriasValidas = [
                    'personal',        // Planilla docente, planilla administrativa
                    'operativo',       // Servicios básicos, mantenimiento, material, transporte
                    'administrativo',  // Impuestos, legal, marketing, eventos
                    'otro'
                ];

                if (!categoriasValidas.includes(req.body.categoria)) {
                    return res.status(400).json({
                        success: false,
                        message: `Categoría inválida. Debe ser una de: ${categoriasValidas.join(', ')}`
                    });
                }
            }

            const updateData = {};
            if (req.body.nombre !== undefined) updateData.nombre = req.body.nombre;
            if (req.body.descripcion !== undefined) updateData.descripcion = req.body.descripcion;
            if (req.body.categoria !== undefined) updateData.categoria = req.body.categoria;
            if (req.body.requiere_docente !== undefined) updateData.requiere_docente = req.body.requiere_docente;
            if (req.body.activo !== undefined) updateData.activo = req.body.activo;
            if (req.body.color !== undefined) updateData.color = req.body.color;
            if (req.body.orden !== undefined) updateData.orden = req.body.orden;

            const tipo = await TipoEgreso.update(id, updateData);

            const reqInfo = RequestInfo.extract(req);
            await ActividadLog.create({
                usuario_id: req.user.id,
                accion: 'actualizar',
                modulo: 'egresos',
                tabla_afectada: 'tipo_egreso',
                registro_id: tipo.id,
                datos_anteriores: tipoExistente,
                datos_nuevos: tipo,
                ip_address: reqInfo.ip,
                user_agent: reqInfo.userAgent,
                resultado: 'exitoso',
                mensaje: `Tipo de egreso actualizado: ${tipo.nombre}`
            });

            res.json({
                success: true,
                message: 'Tipo de egreso actualizado exitosamente',
                data: { tipo }
            });
        } catch (error) {
            console.error('Error al actualizar tipo de egreso:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar tipo de egreso: ' + error.message
            });
        }
    }
}

export { EgresoController, TipoEgresoController };