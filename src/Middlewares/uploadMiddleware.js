import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const validMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf"     // ⬅️ permitimos PDF
  ];

  if (validMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  cb(new Error("Archivo no permitido. Solo imágenes o PDF."), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // ⬅️ 10MB máximo para cualquier documento
  }
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Archivo demasiado grande (máximo 10MB)"
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }

  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }

  next();
};
export { upload, handleMulterError };