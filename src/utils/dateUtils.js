/**
 * Utilidades para manejo consistente de fechas y zonas horarias en la base de datos.
 * La aplicación escolar opera en la zona horaria de Bolivia (America/La_Paz, UTC-4).
 */

/**
 * Normaliza cualquier entrada de fecha/hora (string ISO con Z, naive string YYYY-MM-DDTHH:mm, o Date)
 * a un timestamp local de Bolivia ('YYYY-MM-DD HH:mm:ss') para columnas timestamp without time zone.
 *
 * @param {string|Date|null|undefined} val
 * @returns {string|null}
 */
export function parseToLocalTimestamp(val) {
  if (!val) return null;

  if (typeof val === 'string') {
    const trimmed = val.trim();
    // Si ya es un string local naive sin zona horaria como "2026-09-17T23:00" o "2026-09-17 23:00:00"
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      const formatted = trimmed.replace('T', ' ');
      return formatted.length === 16 ? `${formatted}:00` : formatted;
    }
  }

  const d = new Date(val);
  if (isNaN(d.getTime())) return null;

  // Convertir a fecha y hora en zona horaria America/La_Paz
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hr = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day} ${hr}:${map.minute}:${map.second}`;
}
