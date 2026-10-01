import multer from "multer";

const storage = multer.memoryStorage();

const validMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf"     
];

const fileFilter = (req, file, cb) => {
  if (validMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  cb(new Error("Archivo no permitido. Solo imágenes o PDF."), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo para documentos estándar
  }
});

// Tipos permitidos para Materiales Educativos (Office, PDFs, imágenes, video, audio, comprimidos)
const ALLOWED_MATERIAL_MIMES = [
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Imágenes
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/mp3',
  // Video
  'video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv', 'video/webm', 'video/x-matroska',
  // Comprimidos
  'application/zip', 'application/x-zip-compressed', 'multipart/x-zip',
  'application/x-rar-compressed', 'application/vnd.rar', 'application/x-rar',
  'application/x-7z-compressed',
  // Texto y código
  'text/plain', 'text/html', 'text/css', 'application/javascript', 'text/csv'
];

const ALLOWED_MATERIAL_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'mp3', 'wav', 'ogg', 'm4a',
  'mp4', 'mov', 'avi', 'webm', 'wmv', 'mkv',
  'zip', 'rar', '7z', 'txt', 'csv'
]);

const materialFileFilter = (req, file, cb) => {
  const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
  
  if (ALLOWED_MATERIAL_MIMES.includes(file.mimetype) || (ext && ALLOWED_MATERIAL_EXTENSIONS.has(ext))) {
    return cb(null, true);
  }

  cb(new Error(`Tipo de archivo no permitido (.${ext || 'desconocido'}). Se permiten documentos (PDF, Word, Excel, PowerPoint), imágenes, audio, video y archivos comprimidos.`), false);
};

const uploadMaterial = multer({
  storage,
  fileFilter: materialFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB máximo para materiales educativos
  }
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "El archivo supera el tamaño máximo permitido."
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }

  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }

  next();
};

export { upload, uploadMaterial, handleMulterError };