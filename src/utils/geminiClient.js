// utils/geminiClient.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = 'gemini-2.5-flash';

const MAX_RETRIES = 3;
const RETRIABLE = new Set([
  429, 500, 503, 504,
  '429', '500', '503', '504',
]);

async function withRetry(fn) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status ?? err?.statusCode;
      if (!RETRIABLE.has(status)) throw err;
      lastError = err;
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.warn(`[Gemini] ${status} en intento ${attempt + 1}/${MAX_RETRIES}. Reintentando en ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  const retryError = new Error(`Gemini no disponible tras ${MAX_RETRIES} intentos: ${lastError.message}`);
  retryError.status = lastError?.status ?? 503;
  throw retryError;
}

/**
 * Genera contenido educativo en Markdown para un tema, usando el contexto
 * de la unidad temática y la materia a la que pertenece.
 * Estructura: Introducción → Conceptos Clave → Desarrollo → Resumen.
 */
async function generarContenidoTema(datos) {
  const {
    materiaNombre,
    gradoNombre,
    unidadTitulo,
    unidadDescripcion,
    unidadObjetivos,
    temaTitulo,
    temaDescripcion,
    palabrasClave,
    nivelDificultad,
  } = datos;

  const model = genAI.getGenerativeModel({ model: MODEL });

  const prompt = `
Eres un experto en pedagogía y redacción de material educativo. Genera el contenido
de una sección de un curso en línea (estilo Platzi/Coursera), en formato Markdown.

CONTEXTO:
- Materia: ${materiaNombre}
- Grado/Nivel: ${gradoNombre}
- Unidad temática: ${unidadTitulo}${unidadDescripcion ? `\n- Descripción de la unidad: ${unidadDescripcion}` : ''}${unidadObjetivos ? `\n- Objetivos de la unidad: ${unidadObjetivos}` : ''}
- Tema a desarrollar: ${temaTitulo}${temaDescripcion ? `\n- Descripción del tema: ${temaDescripcion}` : ''}${palabrasClave?.length ? `\n- Palabras clave: ${palabrasClave.join(', ')}` : ''}${nivelDificultad ? `\n- Nivel de dificultad: ${nivelDificultad}` : ''}

INSTRUCCIONES DE FORMATO:
- Responde ÚNICAMENTE con el contenido en Markdown, sin explicaciones adicionales, sin
  bloques de código que envuelvan todo (no uses \`\`\`markdown).
- El contenido DEBE seguir EXACTAMENTE esta estructura de 4 secciones, en este orden:

  1. "## Introducción"
     Un párrafo breve (2-4 líneas) que contextualice el tema, explique por qué es
     importante y qué aprenderá el estudiante.

  2. "## Conceptos Clave"
     Una lista de 3-5 puntos breves con las ideas o definiciones esenciales que el
     estudiante debe recordar de esta sección.

  3. "## Desarrollo"
     La explicación principal y más extensa del tema, adecuada al nivel del grado
     indicado. Puede incluir sub-encabezados "###", ejemplos numéricos o prácticos,
     listas, negritas, bloques de código (si la materia lo requiere) y tablas si
     son útiles.

  4. "## Resumen"
     Un párrafo o lista breve (2-4 líneas) que cierre la sección, reforzando las
     ideas principales y conectando con lo aprendido.

- El tono debe ser claro, directo y pedagógico, en español.
- No inventes datos curriculares oficiales; enfócate en explicar el concepto correctamente.
`.trim();

  return await withRetry(async () => {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  });
}

/**
 * Genera un quiz de opción múltiple en formato JSON, basado en el contenido
 * (markdown) de un tema.
 *
 * @param {Object} datos
 * @param {string} datos.temaTitulo
 * @param {string} datos.contenido      - Contenido markdown del tema (base del quiz)
 * @param {string} [datos.nivelDificultad]
 * @param {number} [cantidad=5]         - Número de preguntas a generar
 * @returns {Promise<Array<{ pregunta: string, opciones: string[], respuesta_correcta: number, explicacion: string }>>}
 */
async function generarQuizTema(datos, cantidad = 5) {
  const { temaTitulo, contenido, nivelDificultad } = datos;

  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          preguntas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pregunta: { type: 'string' },
                opciones: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
                respuesta_correcta: { type: 'integer' },
                explicacion: { type: 'string' },
              },
              required: ['pregunta', 'opciones', 'respuesta_correcta', 'explicacion'],
            },
          },
        },
        required: ['preguntas'],
      },
    },
  });

  const prompt = `
Eres un experto en evaluación educativa. Basándote ÚNICAMENTE en el siguiente contenido
de un tema (en Markdown), genera exactamente ${cantidad} preguntas de opción múltiple
para evaluar la comprensión del estudiante.

TEMA: ${temaTitulo}${nivelDificultad ? `\nNIVEL DE DIFICULTAD: ${nivelDificultad}` : ''}

CONTENIDO DEL TEMA:
"""
${contenido}
"""

INSTRUCCIONES:
- Cada pregunta debe tener EXACTAMENTE 4 opciones de respuesta.
- "respuesta_correcta" es el ÍNDICE (0, 1, 2 o 3) de la opción correcta dentro del array "opciones".
- "explicacion" debe explicar brevemente por qué esa opción es la correcta, en 1-2 líneas.
- Las preguntas deben cubrir los puntos más importantes del contenido, variando el nivel
  de dificultad de forma equilibrada.
- No repitas preguntas ni opciones idénticas entre preguntas distintas.
- Responde en español.
`.trim();

  return await withRetry(async () => {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text()).preguntas;
  });
}

export { generarContenidoTema, generarQuizTema };