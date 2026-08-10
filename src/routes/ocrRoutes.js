// routes/ocrRoutes.js
import { Router } from 'express';
import multer from 'multer';
import { escanearCedula } from '../controllers/ocrController.js';
import { authenticate } from '../Middlewares/auth.js';

const router = Router();

// Multer en memoria (no guarda en disco, pasa el buffer directo a Gemini)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máx
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan imágenes'));
    }
  },
});

/**
 * POST /ocr/cedula
 * Escanea una cédula de identidad boliviana y retorna los datos extraídos.
 * Requiere autenticación.
 */
router.post('/cedula', authenticate, upload.single('imagen'), escanearCedula);

export default router;
