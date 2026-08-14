// services/ocrLocalService.js
// OCR gratuito con Tesseract (sin tokens de Gemini).

import Tesseract from 'tesseract.js';
import { parseCedulaBolivianaText, tieneDatosUtiles } from '../utils/bolivianCedulaParser.js';
import { normalizarDatosCedula } from '../utils/ocrCedulaNormalize.js';

/**
 * Extrae datos de cédula boliviana desde el buffer de imagen.
 * @param {Buffer} buffer
 * @param {string} [mimeType]
 */
export async function escanearCedulaLocal(buffer, mimeType = 'image/jpeg') {
  const { data } = await Tesseract.recognize(buffer, 'spa', {
    logger: () => {},
    tessedit_pageseg_mode: '6',
  });

  const texto = data?.text ?? '';
  if (!texto.trim()) {
    const err = new Error(
      'No se detectó texto en la imagen. Usa buena luz, enfoque nítido y el dorso de la cédula (o frente+dorso).'
    );
    err.status = 422;
    throw err;
  }

  const parseado = parseCedulaBolivianaText(texto);
  const datos = normalizarDatosCedula(parseado);

  if (!tieneDatosUtiles(datos)) {
    const err = new Error(
      'Se leyó texto pero no se identificó una cédula boliviana. Sube el dorso con nombre y domicilio, o usa OCR_PROVIDER=gemini en el servidor.'
    );
    err.status = 422;
    err.rawText = texto.slice(0, 2000);
    throw err;
  }

  if (!datos.nombres && !datos.ci) {
    datos.confianza = 'baja';
  }

  return { datos, textoOcr: texto };
}
