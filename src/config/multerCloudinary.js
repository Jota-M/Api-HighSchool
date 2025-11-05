import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "preinscripciones";

    // asignamos carpetas según tipo de documento
    if (file.fieldname === "cedula_estudiante") folder += "/cedulas_estudiante";
    else if (file.fieldname === "certificado_nacimiento") folder += "/certificados_nacimiento";
    else if (file.fieldname === "libreta_notas") folder += "/libretas";
    else if (file.fieldname === "cedula_representante") folder += "/cedulas_representante";

    return {
      folder,
      allowed_formats: ["jpg", "jpeg", "png", "pdf"],
      public_id: `${Date.now()}-${file.originalname}`,
      resource_type: "auto", // Permite PDF e imágenes
    };
  },
});

export const uploadCloudinary = multer({ storage });
