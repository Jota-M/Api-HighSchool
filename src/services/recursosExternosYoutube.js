// services/recursosExternosYoutube.js — v2.0
//
// Migración de app/services/gemini_service.py (generar_recursos_externos v8.3)
// desde el ML service (Python/FastAPI) al backend Node.
//
// v2.0: reescrito para reusar utils/geminiClient.js (SDK oficial @google/generative-ai
// + retry + responseSchema, en vez del fetch crudo + regex de la v1.0) y
// utils/youtubeClient.js (wrapper puro de la API).
//
// Este archivo es solo orquestación: no llama a Gemini ni a YouTube directamente,
// delega a los clientes en utils/.
//
// Flujo de dos pasos (idéntico al original en Python):
//   1. Gemini genera 2-3 search_queries pedagógicamente precisos para el tema.
//   2. YouTube Data API v3 busca con esos queries y retorna IDs de videos REALES.
// Esto evita que Gemini invente URLs de YouTube inexistentes.

import { generarQueriesRecursoExterno } from '../utils/geminiClient.js';
import { buscarVideo } from '../utils/youtubeClient.js';

/**
 * Devuelve 2-3 videos REALES de YouTube para reforzar un tema.
 * Si Gemini no responde o falla el parseo → [] (sin acción, el caller decide qué hacer).
 * Si un query individual no tiene resultados en YouTube → se omite, no rompe el resto.
 *
 * @param {Object} datos
 * @param {string} datos.temaTitulo
 * @param {string} [datos.temaDescripcion]
 * @param {string[]} [datos.palabrasClave]
 * @param {string} [datos.nivelDificultad]
 * @param {string} [datos.objetivosUnidad]
 * @param {string} [datos.nivelEducativo]
 * @returns {Promise<Array<{ titulo: string, url: string, origen_externo: string }>>}
 */
export async function obtenerRecursosExternosGemini(datos) {
    const { temaTitulo } = datos;

    let queries;
    try {
        queries = await generarQueriesRecursoExterno(datos);
    } catch (err) {
        console.warn(`[recursosExternosYoutube] Gemini falló | tema: ${temaTitulo}:`, err.message);
        queries = null;
    }

    if (!queries || queries.length === 0) {
        console.warn(`[recursosExternosYoutube] Sin queries de Gemini | tema: ${temaTitulo}`);
        // Fallback: query directo con el título del tema (igual que en el original Python)
        const nivel = datos.nivelEducativo || 'secundaria';
        queries = [{
            titulo_sugerido: temaTitulo,
            search_query: `${temaTitulo} educativo ${nivel} tutorial`,
        }];
    }

    console.info(
        `[recursosExternosYoutube] ${queries.length} query(s) de Gemini | tema: ${temaTitulo}`
    );

    const resultado = [];
    for (const q of queries) {
        console.info(`[recursosExternosYoutube] Buscando: "${q.search_query}"`);
        const video = await buscarVideo(q.search_query);

        if (video) {
            resultado.push({
                titulo: video.titulo,
                url: video.url,
                origen_externo: 'youtube',
            });
            console.info(`[recursosExternosYoutube] ✓ ${video.titulo} → ${video.url}`);
        } else {
            console.warn(`[recursosExternosYoutube] Sin resultado para: "${q.search_query}"`);
        }
    }

    console.info(
        `[recursosExternosYoutube] ${resultado.length} video(s) real(es) | tema: ${temaTitulo}`
    );

    return resultado;
}