// controllers/ocrController.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { normalizarDatosCedula } from '../utils/ocrCedulaNormalize.js';
import { escanearCedulaLocal } from '../services/ocrLocalService.js';

const OCR_PROVIDER = (process.env.OCR_PROVIDER || 'gemini').toLowerCase();

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const PROMPT_GEMINI = `Eres un sistema de OCR especializado en cédulas de identidad bolivianas (Cédula de Identidad - Estado Plurinacional de Bolivia).

Analiza esta imagen de cédula y extrae TODOS los datos visibles. La cédula puede ser la cara frontal, el dorso, o ambas juntas en una misma foto.

CARA FRONTAL: CI (junto a "No."), departamento (sigla BIO, LP, CB, OR, PT, TJ, SC, BE, PD), serie, sección.

DORSO: nombre ("A:"), "Nacido el", "En" (lugar nacimiento), "Estado Civil", "Profesión/Ocupación", "Domicilio", padre/madre y sus CI si aparecen.

FORMATO DE TEXTO (MUY IMPORTANTE):
- En la cédula el texto suele estar impreso en MAYÚSCULAS; NO copies las mayúsculas tal cual.
- Devuelve nombres, apellidos, lugares y dirección en formato normal: primera letra de cada palabra en mayúscula y el resto en minúscula (ej: "Rene Abel", "Cabrera", "Potosi", "Av. La Paz S/N Z. Cantumarca").
- Mantén en mayúsculas solo abreviaturas de dirección: C/., Z/., Av., S/N, y siglas de departamento al final del domicilio (PT, LP, etc.).
- Partículas en minúscula: de, del, la, los (ej: "Quispe de Relos").

GÉNERO:
- Si hay campo "Sexo" o equivalente, úsalo.
- Si no, dedúcelo del estado civil: Soltero/Casado/Divorciado/Viudo → "masculino"; Soltera/Casada/Divorciada/Viuda → "femenino".
- Valores permitidos: "masculino", "femenino", "otro" o "" si no se puede determinar.

DOMICILIO: separa cuando sea posible:
- "direccion": calle/avenida y número (sin la zona ni el sufijo de departamento).
- "zona": texto después de Z/. o Zona (ej: de "Z/. SAN ROQUE" → zona "San Roque").
- "ciudad": municipio o ciudad principal; si el domicilio termina en "- PT" usa Potosi, "- LP" La Paz, etc.

Retorna ÚNICAMENTE un objeto JSON válido (sin markdown):
{
  "ci": "número sin espacios",
  "complemento": "sigla departamento en MAYÚSCULAS (BIO, LP, PT) o vacío",
  "nombres": "solo nombres, formato título",
  "apellido_paterno": "formato título",
  "apellido_materno": "formato título o vacío",
  "fecha_nacimiento": "DD/MM/YYYY",
  "lugar_nacimiento": "formato título",
  "genero": "masculino | femenino | otro | vacío",
  "estado_civil": "texto como aparece (Soltero, Casada, etc.) o vacío",
  "ocupacion": "profesión u ocupación en formato título o vacío",
  "direccion": "calle/avenida en formato título con abreviaturas correctas",
  "zona": "formato título o vacío",
  "ciudad": "formato título o vacío",
  "padre_nombres": "formato título o vacío",
  "padre_ci": "solo dígitos o vacío",
  "madre_nombres": "formato título o vacío",
  "madre_ci": "solo dígitos o vacío",
  "confianza": "alta | media | baja"
}

Si un campo no es visible, usa "". No inventes datos.`;

async function escanearConGemini(file) {
  if (!genAI) {
    const err = new Error('GEMINI_API_KEY no configurada. Usa OCR_PROVIDER=local (gratis) o agrega la API key.');
    err.status = 503;
    throw err;
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const imagePart = {
    inlineData: {
      data: file.buffer.toString('base64'),
      mimeType: file.mimetype,
    },
  };

  const result = await model.generateContent([PROMPT_GEMINI, imagePart]);
  const text = result.response.text().trim();

  const jsonText = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return normalizarDatosCedula(JSON.parse(jsonText));
  } catch {
    const err = new Error('No se pudo leer la cédula correctamente. Asegúrate de que la imagen sea clara y legible.');
    err.status = 422;
    err.raw = text;
    throw err;
  }
}

/**
 * POST /ocr/cedula
 * Recibe una imagen de cédula boliviana y extrae sus datos.
 * Por defecto Gemini Vision. OCR_PROVIDER=local para Tesseract (gratis, menos preciso).
 * Body: multipart/form-data con campo "imagen"
 */
export const escanearCedula = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere una imagen de la cédula.',
      });
    }

    if (OCR_PROVIDER === 'gemini') {
      const datos = await escanearConGemini(req.file);
      return res.json({
        success: true,
        datos,
        fuente: 'gemini',
      });
    }

    const { datos } = await escanearCedulaLocal(req.file.buffer, req.file.mimetype);
    return res.json({
      success: true,
      datos,
      fuente: 'local',
    });
  } catch (error) {
    if (error.status === 422) {
      return res.status(422).json({
        success: false,
        message: error.message,
        raw: error.raw,
        rawText: error.rawText,
      });
    }
    if (error.status === 503) {
      return res.status(503).json({ success: false, message: error.message });
    }
    console.error('Error en OCR de cédula:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la imagen. Inténtalo de nuevo.',
    });
  }
};
