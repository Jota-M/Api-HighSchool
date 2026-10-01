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
    instruccionesDocente,
    enfoque,
    incluirEjemplos = true,
    incluirEjercicios = false,
    incluirGlosario = false,
    tono,
    incluirIntroduccion = true,
    incluirConceptosClave = true,
    incluirDesarrollo = true,
    incluirResumen = true,
    seccionesPersonalizadas = [],
  } = datos;

  const model = genAI.getGenerativeModel({ model: MODEL });

  // ── Construir secciones estructurales dinámicamente ──────────────────────
  const seccionIntroduccion = incluirIntroduccion
    ? '\n  - "## Introducción"\n    Un párrafo motivador (2-4 líneas) que contextualice el tema, despierte la curiosidad del alumno y explique qué aprenderá.'
    : '';

  const seccionConceptos = incluirConceptosClave
    ? '\n  - "## Conceptos Clave"\n    Una lista de 3-5 puntos breves y claros con las ideas o definiciones esenciales que el estudiante debe memorizar y comprender.'
    : '';

  const subsecciones = [
    incluirEjemplos ? '- Subsección "### Ejemplos Prácticos y Resueltos": Incluye al menos 1-2 ejemplos concretos resueltos paso a paso.' : '',
    incluirEjercicios ? '- Subsección "### Ejercicios Propuestos y Autoevaluación": Incluye 2-3 preguntas o desafíos breves para que el alumno ponga a prueba lo aprendido.' : '',
    incluirGlosario ? '- Subsección "### Glosario de Términos": Una breve lista de 2-4 términos técnicos definidos de manera sencilla.' : '',
  ].filter(Boolean).join('\n     ');

  const seccionDesarrollo = incluirDesarrollo
    ? `\n  - "## Desarrollo"\n    La explicación principal, completa y rigurosa del tema, adaptada perfectamente al grado escolar indicado.\n    - Debe cumplir rigurosamente con cualquier aspecto específico solicitado por el docente.\n    - Utiliza sub-encabezados "###", negritas, listas ordenadas/desordenadas y tablas comparativas si clarifican el concepto.\n    - Si la materia es matemática o científica, incluye fórmulas y notación clara.\n     ${subsecciones}`
    : (subsecciones ? `\n  NOTA: Integra las siguientes subsecciones directamente en el cuerpo del contenido generado:\n     ${subsecciones}` : '');

  const seccionResumen = incluirResumen
    ? '\n  - "## Resumen"\n    Un párrafo de síntesis (2-4 líneas) que refuerce las conclusiones principales de la lección.'
    : '';

  const todasDesactivadas = !incluirIntroduccion && !incluirConceptosClave && !incluirDesarrollo && !incluirResumen && (!seccionesPersonalizadas || seccionesPersonalizadas.length === 0);

  const seccionesExtra = (seccionesPersonalizadas && seccionesPersonalizadas.length > 0)
    ? seccionesPersonalizadas.map(s => `\n  - "## ${s}"\n    Desarrolla esta sección de manera clara, didáctica y adaptada al nivel escolar indicado.`).join('')
    : '';

  const instruccionEstructura = todasDesactivadas
    ? '- Genera el contenido de forma libre sin estructura de secciones impuesta, pero de manera didáctica y completa.'
    : `- El contenido DEBE incluir ÚNICAMENTE las secciones habilitadas a continuación (no agregues ninguna sección extra no listada):${seccionIntroduccion}${seccionConceptos}${seccionDesarrollo}${seccionResumen}${seccionesExtra}`;

  const prompt = `
Eres un experto en pedagogía y redacción de material educativo de alto nivel. Genera el contenido didáctico
completo para una lección de un curso escolar interactivo, en formato Markdown limpio y enriquecido.

CONTEXTO ACADÉMICO:
- Materia: ${materiaNombre}
- Grado/Nivel: ${gradoNombre}
- Unidad temática: ${unidadTitulo}${unidadDescripcion ? `\n- Descripción de la unidad: ${unidadDescripcion}` : ''}${unidadObjetivos ? `\n- Objetivos de la unidad: ${unidadObjetivos}` : ''}
- Tema a desarrollar: ${temaTitulo}${temaDescripcion ? `\n- Descripción del tema: ${temaDescripcion}` : ''}${palabrasClave?.length ? `\n- Palabras clave: ${palabrasClave.join(', ')}` : ''}${nivelDificultad ? `\n- Nivel de dificultad: ${nivelDificultad}` : ''}
${enfoque ? `- Enfoque pedagógico prioritario: ${enfoque}` : ''}
${tono ? `- Tono de redacción: ${tono}` : ''}
${instruccionesDocente?.trim() ? `
INSTRUCCIONES Y REQUISITOS OBLIGATORIOS DEL DOCENTE:
El docente a cargo ha establecido los siguientes requerimientos específicos que DEBES incluir y enfatizar obligatoriamente en el contenido:
"""
${instruccionesDocente.trim()}
"""` : ''}

INSTRUCCIONES DE FORMATO Y ESTRUCTURA:
- Responde ÚNICAMENTE con el contenido en Markdown, sin preámbulos, sin notas de saludo y sin bloques de código que envuelvan todo el documento.
${instruccionEstructura}

- El tono debe ser pedagógico, claro, estimulante y en español neutro.
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

/**
 * Genera 2-3 search queries pedagógicamente precisos para buscar videos
 * de YouTube que refuercen un tema específico. Usado cuando un estudiante
 * saca nota baja y no hay materiales internos disponibles para ese tema.
 *
 * @param {Object} datos
 * @param {string} datos.temaTitulo
 * @param {string} [datos.temaDescripcion]
 * @param {string[]} [datos.palabrasClave]
 * @param {string} [datos.nivelDificultad]
 * @param {string} [datos.objetivosUnidad]
 * @param {string} [datos.nivelEducativo]
 * @returns {Promise<Array<{ titulo_sugerido: string, search_query: string }>>}
 */
async function generarQueriesRecursoExterno(datos) {
  const {
    temaTitulo,
    temaDescripcion,
    palabrasClave,
    nivelDificultad,
    objetivosUnidad,
    nivelEducativo,
  } = datos;

  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                titulo_sugerido: { type: 'string' },
                search_query: { type: 'string' },
              },
              required: ['titulo_sugerido', 'search_query'],
            },
          },
        },
        required: ['queries'],
      },
    },
  });

  const nivel = nivelEducativo || 'secundaria';
  const partes = [`Tema: "${temaTitulo}"`];
  if (temaDescripcion) partes.push(`Descripción: ${temaDescripcion}`);
  if (palabrasClave?.length) partes.push(`Palabras clave: ${palabrasClave.join(', ')}`);
  if (nivelDificultad) partes.push(`Nivel de dificultad: ${nivelDificultad}`);
  if (objetivosUnidad) partes.push(`Objetivos: ${objetivosUnidad}`);

  const prompt = `
Eres un asistente educativo. Un estudiante de nivel "${nivel}" necesita videos de
YouTube para reforzar este tema:

${partes.join('\n')}

Genera 2 o 3 queries de búsqueda para YouTube que encuentren videos educativos
específicos y útiles. Los videos deben ser en español y apropiados para el nivel.

Reglas para search_query:
- Específico al tema, no genérico.
- Incluir palabras clave del tema + nivel educativo + "educativo" o "tutorial".
- En español.
`.trim();

  return await withRetry(async () => {
    const result = await model.generateContent(prompt);
    const data = JSON.parse(result.response.text());
    return data.queries || [];
  });
}

/**
 * Genera un examen evaluativo formal para un tema con preguntas de opción múltiple,
 * verdadero/falso y desarrollo.
 *
 * @param {Object} datos
 * @param {string} datos.temaTitulo
 * @param {string} datos.contenido
 * @param {string} [datos.nivelDificultad]
 * @param {Object} [config]
 * @param {number} [config.cantidadOpcionMultiple=5]
 * @param {number} [config.cantidadVerdaderoFalso=2]
 * @param {number} [config.cantidadDesarrollo=1]
 * @returns {Promise<Array>} Lista de preguntas estructuradas
 */
async function generarExamenTema(datos, config = {}) {
  const { temaTitulo, contenido, nivelDificultad } = datos;
  const {
    cantidadOpcionMultiple = 5,
    cantidadVerdaderoFalso = 2,
    cantidadDesarrollo = 1,
  } = config;

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
                tipo: { type: 'string', enum: ['opcion_multiple', 'verdadero_falso', 'desarrollo'] },
                pregunta: { type: 'string' },
                opciones: { type: 'array', items: { type: 'string' } },
                respuesta_correcta: { type: 'integer' },
                respuesta_esperada: { type: 'string' },
                puntos: { type: 'number' },
              },
              required: ['tipo', 'pregunta', 'puntos'],
            },
          },
        },
        required: ['preguntas'],
      },
    },
  });

  const prompt = `
Eres un experto en evaluación educativa. Basándote ÚNICAMENTE en el siguiente contenido de un
tema (en Markdown), genera un examen con:
- ${cantidadOpcionMultiple} preguntas de opción múltiple (4 opciones cada una)
- ${cantidadVerdaderoFalso} preguntas de verdadero/falso (2 opciones: "Verdadero", "Falso")
- ${cantidadDesarrollo} preguntas de desarrollo (respuesta abierta, sin opciones)

TEMA: ${temaTitulo}${nivelDificultad ? `\nNIVEL DE DIFICULTAD: ${nivelDificultad}` : ''}

CONTENIDO:
"""
${contenido}
"""

INSTRUCCIONES:
- "respuesta_correcta" es el ÍNDICE dentro de "opciones", solo para opcion_multiple/verdadero_falso.
- Para "desarrollo", deja "opciones" vacío y "respuesta_correcta" en -1; completa "respuesta_esperada"
  con una guía breve de lo que debería incluir una buena respuesta (para apoyar la corrección manual).
- "puntos" debe reflejar la dificultad relativa (objetivas 1-2, desarrollo 3-5).
- No repitas preguntas ni contenido entre sí.
- Responde en español.
`.trim();

  return await withRetry(async () => {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text()).preguntas;
  });
}

/**
 * Genera el informe descriptivo cualitativo oficial para el boletín de un estudiante de Nivel Inicial,
 * traduciendo los indicadores de logro observados en un párrafo pedagógico cálido, fluido y positivo.
 *
 * @param {Object} datos
 * @param {string} datos.estudianteNombre
 * @param {string} [datos.genero]
 * @param {string} [datos.gradoNombre]
 * @param {string} [datos.periodoNombre]
 * @param {Array} [datos.cotejos]
 * @param {string} [datos.observacionesDocente]
 * @returns {Promise<string>} Texto del informe cualitativo
 */
async function generarInformeInicial(datos) {
  const {
    estudianteNombre,
    genero,
    gradoNombre,
    periodoNombre,
    cotejos = [],
    observacionesDocente
  } = datos;

  const model = genAI.getGenerativeModel({ model: MODEL });

  // Agrupar cotejos evaluados por campo
  const camposMap = {};
  for (const c of cotejos) {
    if (!c.nivel_nombre && !c.observaciones) continue;
    const campo = c.campo_nombre || 'Desarrollo General';
    if (!camposMap[campo]) camposMap[campo] = [];
    camposMap[campo].push(`- ${c.indicador_descripcion}: ${c.nivel_nombre || 'Observación'}${c.observaciones ? ` (${c.observaciones})` : ''}`);
  }

  const resumenCotejos = Object.entries(camposMap)
    .map(([campo, inds]) => `CAMPO: ${campo}\n${inds.join('\n')}`)
    .join('\n\n');

  const generoRef = (genero || '').toLowerCase() === 'femenino' ? 'de la niña' : ((genero || '').toLowerCase() === 'masculino' ? 'del niño' : 'del estudiante');
  const esFinal = Boolean(datos.esFinal);

  const prompt = `
Eres una maestra especialista en Educación Inicial en Familia Comunitaria (Bolivia) con alta sensibilidad pedagógica.
Redacta el ${esFinal ? '"Informe Anual Consolidado y Certificación de Promoción" oficial para la libreta escolar escolarizada' : '"Informe Descriptivo Cualitativo" oficial para el boletín escolar'} ${generoRef}.

DATOS:
- Estudiante: ${estudianteNombre}
- Nivel/Año de escolaridad: ${gradoNombre || 'Nivel Inicial'}
- Periodo/Trimestre: ${esFinal ? 'Evaluación Final Anual y Promoción (Consolidado de 4 Campos)' : (periodoNombre || 'Trimestre en curso')}

OBSERVACIONES DE LOGRO EN LA LISTA DE COTEJO (4 CAMPOS INTEGRADOS):
${resumenCotejos || 'El estudiante ha participado activamente en las experiencias de aprendizaje lúdicas.'}
${observacionesDocente ? `\nAPUNTES ADICIONALES DE LA MAESTRA:\n"${observacionesDocente}"` : ''}

CRITERIOS OBLIGATORIOS DE REDACCIÓN:
1. Redacta en UN SOLO PÁRRAFO continuo (entre 70 y 130 palabras), fluido, armonioso y holístico.
2. Inicia obligatoriamente con el nombre del estudiante en MAYÚSCULAS (ej: "DANIEL demuestra gran entusiasmo...").
3. Tono pedagógico, cálido, motivador y formativo en tercera persona.
4. Integra armónicamente los 4 campos (desarrollo cognitivo, socio-afectivo, psicomotriz y creativo) sin dividirlos en subtítulos.
5. NO uses listas, viñetas, subtítulos ni enumeraciones.
6. NO menciones siglas técnicas como ED, DA, DO, DP. Traduce esos avances en lenguaje natural y estimulante (ej. "muestra gran habilidad en...", "progresa satisfactoriamente al...", "desarrolla con alegría su expresión...").
7. ${esFinal ? 'Concluye felicitando sus logros anuales y certificando con entusiasmo su preparación y promoción al siguiente año de escolaridad.' : 'Concluye con un mensaje propositivo de estímulo hacia la familia para continuar acompañando su desarrollo integral.'}
8. Responde ÚNICAMENTE con el texto del párrafo en texto plano, sin comillas ni preámbulos.
`.trim();

  return await withRetry(async () => {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  });
}

/**
 * Genera actividades lúdicas e interactivas adaptadas para niños de Nivel Inicial (3-5 años).
 * Todos los juegos se juegan DENTRO de la plataforma — sin actividades físicas, sin "dibujar",
 * sin "traer de casa". Solo experiencias digitales interactivas completables en pantalla.
 *
 * @param {Object} datos
 * @param {string} datos.campoCodigo
 * @param {string} datos.campoNombre
 * @param {string} datos.tema
/**
 * Genera actividades lúdicas o minijuegos con Gemini IA para Nivel Inicial
 * @param {Object} datos
 * @param {string} datos.campoCodigo
 * @param {string} datos.campoNombre
 * @param {string} datos.tema
 * @param {string} [datos.gradoNombre]
 * @param {number} [datos.cantidad=3]
 * @param {string} [datos.formato='juego'] - 'juego' | 'actividad'
 * @param {string} [datos.tipoJuego='mixto'] - 'memorama' | 'adivinanza' | 'arrastrar' | 'tarjetas' | 'mixto'
 */
async function generarActividadesLudicasInicial(datos) {
  const { campoCodigo, campoNombre, tema, gradoNombre, cantidad = 3, formato = 'juego', tipoJuego = 'mixto' } = datos;

  const esActividadLudica = formato === 'actividad';

  const tiposPermitidos = {
    memorama: ['memorama'],
    adivinanza: ['adivinanza'],
    arrastrar: ['arrastrar'],
    tarjetas: ['tarjetas_exploracion'],
    tarjetas_exploracion: ['tarjetas_exploracion'],
    mixto: ['memorama', 'adivinanza', 'arrastrar', 'tarjetas_exploracion'],
  };
  const tiposEnum = tiposPermitidos[tipoJuego] || tiposPermitidos.mixto;

  const schemaPropuesta = esActividadLudica
    ? {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          descripcion: { type: 'string' },
          tipo: { type: 'string', enum: ['actividad'] },
          emoji: { type: 'string' },
          color_fondo: { type: 'string' },
          contenido_interactivo: {
            type: 'object',
            properties: {
              instruccion: { type: 'string' },
              recompensa: { type: 'string' },
            },
            required: ['instruccion'],
          },
        },
        required: ['titulo', 'descripcion', 'tipo', 'emoji', 'color_fondo'],
      }
    : {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          descripcion: { type: 'string' },
          tipo: { type: 'string', enum: ['juego'] },
          emoji: { type: 'string' },
          color_fondo: { type: 'string' },
          contenido_interactivo: {
            type: 'object',
            properties: {
              tipo_interaccion: { type: 'string', enum: tiposEnum },
              instruccion: { type: 'string' },
              elementos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    nombre: { type: 'string' },
                    emoji: { type: 'string' },
                    pista: { type: 'string' },
                    es_correcta: { type: 'boolean' },
                    categoria: { type: 'string' },
                    es_zona: { type: 'boolean' },
                    zona_correcta: { type: 'string' },
                  },
                  required: ['id', 'nombre', 'emoji'],
                },
              },
              zonas: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    nombre: { type: 'string' },
                    emoji: { type: 'string' },
                    color: { type: 'string' },
                  },
                  required: ['id', 'nombre', 'emoji'],
                },
              },
              recompensa: { type: 'string' },
            },
            required: ['tipo_interaccion', 'instruccion', 'elementos'],
          },
        },
        required: ['titulo', 'descripcion', 'tipo', 'emoji', 'color_fondo', 'contenido_interactivo'],
      };

  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          propuestas: {
            type: 'array',
            items: schemaPropuesta,
          },
        },
        required: ['propuestas'],
      },
    },
  });

  const descripcionTipos = {
    memorama: `SOLO "memorama": exactamente 5 a 6 pares de cartas con emojis tiernos y nombres cortos.`,
    adivinanza: `SOLO "adivinanza": pregunta divertida con 3 opciones visuales (emojis + nombre), SOLO UNA tiene es_correcta:true.`,
    arrastrar: `SOLO "arrastrar": el niño arrastra elementos (4-6 items con emoji+nombre+zona_correcta) hacia zonas de destino (2-3 zonas con id+nombre+emoji+color). Ejemplo: arrastrar animales → granja o zoológico.`,
    tarjetas: `SOLO "tarjetas_exploracion": 4-5 tarjetas temáticas que el niño toca para explorar, con emoji grande y pista descriptiva.`,
    tarjetas_exploracion: `SOLO "tarjetas_exploracion": 4-5 tarjetas temáticas que el niño toca para explorar, con emoji grande y pista descriptiva.`,
    mixto: `Usa VARIEDAD de tipos: memorama, adivinanza, arrastrar y tarjetas_exploracion. Rota los tipos para que no se repitan entre propuestas.`,
  };

  const instruccionTipo = descripcionTipos[tipoJuego] || descripcionTipos.mixto;

  const prompt = esActividadLudica
    ? `
Eres una educadora experta en Educación Inicial / Parvularia (niños de 3 a 5 años).
Diseña exactamente ${cantidad} ACTIVIDADES LÚDICAS PEDAGÓGICAS Y DINÁMICAS (tipo: "actividad") para realizar en clase con la docente o en grupo.
Son dinámicas divertidas, canciones con mímica, rondas, juegos de imitación o desafíos pedagógicos.

CAMPO DE SABERES: ${campoNombre || campoCodigo || 'General'} (${campoCodigo || ''})
NIVEL / AÑO: ${gradoNombre || 'Nivel Inicial (Pre-Kínder / Kínder - 4 a 5 años)'}
TEMA CENTRAL SOLICITADO: "${tema || 'Descubriendo mi entorno a través del juego'}"

REGLAS:
1. tipo SIEMPRE debe ser "actividad".
2. titulo: corto, divertido y motivador.
3. descripcion: explicación paso a paso de la dinámica lúdica (en 2 o 3 frases claras para la docente y niños).
4. emoji: representativo de la dinámica.
5. color_fondo: color HEX llamativo (#6366F1, #8B5CF6, #EC4899, #10B981, #F59E0B, #0EA5E9).
6. contenido_interactivo.instruccion: consigna motivadora para los niños.
7. contenido_interactivo.recompensa: mensaje de celebración y felicitación (ej: "¡Fantástico! ¡Gran trabajo en equipo! ⭐⭐⭐").
`.trim()
    : `
Eres una educadora experta en Educación Inicial / Parvularia (niños de 3 a 5 años) y diseñadora de juegos digitales educativos.
Diseña exactamente ${cantidad} MINIJUEGOS INTERACTIVOS (tipo: "juego") para jugar en pantalla.

CAMPO DE SABERES: ${campoNombre || campoCodigo || 'General'} (${campoCodigo || ''})
NIVEL / AÑO: ${gradoNombre || 'Nivel Inicial (Pre-Kínder / Kínder - 4 a 5 años)'}
TEMA CENTRAL SOLICITADO: "${tema || 'Descubriendo mi entorno a través del juego'}"

TIPO DE JUEGO A GENERAR: ${instruccionTipo}

REGLAS ABSOLUTAS:
1. TODAS las actividades deben ser 100% jugables dentro de la pantalla del dispositivo.
2. tipo SIEMPRE debe ser "juego".
3. Para "memorama": genera 5-6 pares distintos con emojis únicos y nombres simples.
4. Para "adivinanza": la instruccion debe ser la pregunta/adivinanza. Los elementos son las 3 opciones, SOLO UNA con es_correcta:true.
5. Para "arrastrar": incluye el array "zonas" (2-3 zonas destino) y cada elemento tiene "zona_correcta" = id de la zona correcta.
6. Para "tarjetas_exploracion": 4-5 tarjetas que el niño toca para leer su pista y descubrir el elemento.
7. color_fondo: color HEX vibrante o pastel (#EC4899, #8B5CF6, #3B82F6, #10B981, #F59E0B, #06B6D4, #F97316).
8. instruccion: mensaje cálido y motivador en 1 frase corta para el niño.
9. recompensa: mensaje de celebración emoji cuando el niño gana (ej: "¡Ganaste 3 estrellas! ⭐⭐⭐").
10. Todo en español cálido y estimulante para niños de 3 a 5 años.
`.trim();

  return await withRetry(async () => {
    const result = await model.generateContent(prompt);
    const data = JSON.parse(result.response.text());
    return data.propuestas || [];
  });
}

export {
  generarContenidoTema,
  generarQuizTema,
  generarQueriesRecursoExterno,
  generarExamenTema,
  generarInformeInicial,
  generarActividadesLudicasInicial,
};


