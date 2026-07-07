// utils/youtubeClient.js
//
// Wrapper puro de YouTube Data API v3. Sin lógica de negocio — eso vive en
// services/recursosExternosYoutube.js, que orquesta este cliente junto con
// utils/geminiClient.js.

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const TIMEOUT_MS = 10000;

/**
 * Busca el primer video real que coincida con un query.
 * Costo: 100 unidades por llamada · 10,000 gratis/día → 100 búsquedas/día.
 *
 * @param {string} query
 * @returns {Promise<{ titulo: string, url: string, video_id: string } | null>}
 */
async function buscarVideo(query) {
    if (!YOUTUBE_API_KEY) {
        console.warn(
            '[youtubeClient] YOUTUBE_API_KEY no configurada. Agregá YOUTUBE_API_KEY=... ' +
            'al .env y activá YouTube Data API v3 en https://console.cloud.google.com'
        );
        return null;
    }

    const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: '1',
        relevanceLanguage: 'es',
        safeSearch: 'strict', // contenido seguro para estudiantes
        videoEmbeddable: 'true',
        key: YOUTUBE_API_KEY,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`, {
            signal: controller.signal,
        });

        if (!response.ok) {
            if (response.status === 403) {
                console.error('[youtubeClient] 403 — quota excedida o API key inválida');
            } else {
                console.warn(`[youtubeClient] HTTP ${response.status} para: "${query}"`);
            }
            return null;
        }

        const data = await response.json();
        const items = data.items || [];
        if (items.length === 0) {
            console.warn(`[youtubeClient] Sin resultados: "${query}"`);
            return null;
        }

        const item = items[0];
        const videoId = item.id?.videoId;
        if (!videoId) return null;

        return {
            titulo: item.snippet?.title || query,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            video_id: videoId,
        };

    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn(`[youtubeClient] Timeout para: "${query}"`);
        } else {
            console.warn('[youtubeClient] Error:', err.message);
        }
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

export { buscarVideo };