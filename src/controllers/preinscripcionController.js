import { Estudiante } from "../models/estudianteModel.js";
import { Representante } from "../models/representanteModel.js";
import { Preinscripcion } from "../models/preinscripcionModel.js";
import { Documentos } from "../models/documentosModel.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

// Configurar Cloudinary
cloudinary.config({
  cloud_name: "dg2bus9eq",
  api_key: "561997663751764",
  api_secret: "_jUoi2acVyfyYCgxsb8XOVPAQus",
});

export const createPreinscripcion = async (req, res) => {
  try {
    // Recibimos los datos y los archivos
    const data = JSON.parse(req.body.data);
    const files = req.files;

    // 1️⃣ Crear estudiante
    const estudiante = await Estudiante.create(data.estudiante);

    // 2️⃣ Crear representante
    const representante = await Representante.create(data.representante);

    // 3️⃣ Crear preinscripción
    const preinscripcion = await Preinscripcion.create(estudiante.id, representante.id);

    // 4️⃣ Subir archivos a Cloudinary
    const uploadToCloudinary = async (file) => {
      if (!file) return null;
      const result = await cloudinary.uploader.upload(file.path, { folder: "preinscripciones" });
      fs.unlinkSync(file.path); // eliminar archivo temporal
      return result.secure_url;
    };

    const documentosUrls = {
      cedula_estudiante: await uploadToCloudinary(files.cedula_estudiante?.[0]),
      certificado_nacimiento: await uploadToCloudinary(files.certificado_nacimiento?.[0]),
      libreta_notas: await uploadToCloudinary(files.libreta_notas?.[0]),
      cedula_representante: await uploadToCloudinary(files.cedula_representante?.[0]),
    };

    // 5️⃣ Guardar rutas de archivos en la BD
    await Documentos.create(preinscripcion.id, documentosUrls);

    res.status(201).json({ success: true, message: "Preinscripción creada correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Error al crear preinscripción", error: err.message });
  }
};
