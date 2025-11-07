import { Estudiante } from "../models/estudianteModel.js";
import { Representante } from "../models/representanteModel.js";
import { Preinscripcion } from "../models/preinscripcionModel.js";
import { Documentos } from "../models/documentosModel.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: "dg2bus9eq",
  api_key: "561997663751764",
  api_secret: "_jUoi2acVyfyYCgxsb8XOVPAQus",
});

// Crear preinscripción
export const createPreinscripcion = async (req, res) => {
  try {
    const data = JSON.parse(req.body.data);
    const files = req.files;

    const estudiante = await Estudiante.create(data.estudiante);
    const representante = await Representante.create(data.representante);
    const preinscripcion = await Preinscripcion.create(estudiante.id, representante.id);

    const uploadToCloudinary = async (file) => {
  if (!file) return null;
  
  // Determinar el tipo de recurso basado en la extensión
  const isImage = file.mimetype.startsWith('image/');
  const isPdf = file.mimetype === 'application/pdf';
  
  // Obtener la extensión del archivo original
  const extension = file.originalname.split('.').pop();
  const nombreSinExtension = file.originalname.replace(`.${extension}`, '');
  
  const uploadOptions = {
    folder: "preinscripciones",
    resource_type: isImage ? 'image' : 'raw',
    access_mode: 'public',
    use_filename: true,
    unique_filename: true,
    // Agregar la extensión al public_id para archivos raw (PDFs)
    ...(isPdf && {
      public_id: `${nombreSinExtension}_${Date.now()}`,
      format: extension, // Esto preserva la extensión
    }),
  };
  
  const result = await cloudinary.uploader.upload(file.path, uploadOptions);
  fs.unlinkSync(file.path);
  
  // Para PDFs, asegurar que la URL tenga la extensión
  if (isPdf && !result.secure_url.endsWith('.pdf')) {
    return `${result.secure_url}.pdf`;
  }
  
  return result.secure_url;
};

    const documentosUrls = {
      cedula_estudiante: await uploadToCloudinary(files.cedula_estudiante?.[0]),
      certificado_nacimiento: await uploadToCloudinary(files.certificado_nacimiento?.[0]),
      libreta_notas: await uploadToCloudinary(files.libreta_notas?.[0]),
      cedula_representante: await uploadToCloudinary(files.cedula_representante?.[0]),
    };

    await Documentos.create(preinscripcion.id, documentosUrls);

    res.status(201).json({ success: true, message: "Preinscripción creada correctamente", preinscripcionId: preinscripcion.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error al crear preinscripción", error: err.message });
  }
};

// Obtener todas las preinscripciones
export const getAllPreinscripciones = async (req, res) => {
  try {
    const preinscripciones = await Preinscripcion.getAll();
    res.json(preinscripciones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Obtener preinscripción por ID
export const getPreinscripcionById = async (req, res) => {
  try {
    const { id } = req.params;
    const preinscripcion = await Preinscripcion.getById(id);
    if (!preinscripcion) return res.status(404).json({ message: "Preinscripción no encontrada" });
    res.json(preinscripcion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Eliminar preinscripción
export const deletePreinscripcion = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Preinscripcion.delete(id);
    if (!deleted) return res.status(404).json({ message: "Preinscripción no encontrada" });
    res.json({ message: "Preinscripción eliminada", deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Actualizar estado
export const updateEstadoPreinscripcion = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const updated = await Preinscripcion.updateEstado(id, estado);
    res.json({ message: "Estado actualizado", updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

