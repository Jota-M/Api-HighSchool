// utils/ocrCedulaNormalize.js
// Normaliza texto extraído de cédulas bolivianas (suele venir en MAYÚSCULAS).

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
const SIGLAS_DEPTO = new Set(['PT', 'LP', 'CB', 'SC', 'OR', 'TJ', 'BE', 'PD', 'BIO']);

function esMayormenteMayusculas(texto) {
  const letras = texto.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, '');
  if (letras.length < 2) return false;
  const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '').length;
  return mayus / letras.length >= 0.7;
}

function capitalizarPalabra(palabra) {
  if (!palabra) return palabra;
  const lower = palabra.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function normalizarAbreviaturaDireccion(palabra) {
  const map = {
    'c/.': 'C/.',
    'c/': 'C/.',
    'z/.': 'Z/.',
    'z/': 'Z/.',
    'av.': 'Av.',
    'av': 'Av.',
    's/n': 'S/N',
    'n°': 'N°',
    'no.': 'No.',
  };
  const key = palabra.toLowerCase();
  return map[key] ?? capitalizarPalabra(palabra);
}

function esTokenDireccion(token) {
  return /^(c\/\.|c\/|z\/\.|z\/|av\.|av|s\/n|n°|no\.)/i.test(token);
}

/**
 * Convierte texto en MAYÚSCULAS a formato legible (tipo título) respetando partículas y abreviaturas.
 */
export function aFormatoTitulo(texto) {
  if (texto == null || typeof texto !== 'string') return '';
  const trimmed = texto.trim();
  if (!trimmed) return '';

  const debeNormalizar =
    esMayormenteMayusculas(trimmed) || (trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(trimmed));

  if (!debeNormalizar) return trimmed;

  const palabras = trimmed.split(/\s+/);

  return palabras
    .map((token, i) => {
      if (!token) return token;

      const upper = token.toUpperCase();
      if (SIGLAS_DEPTO.has(upper) && token.length <= 4) return upper;

      const lower = token.toLowerCase();
      const prev = i > 0 ? palabras[i - 1] : '';
      const prevEsDireccion = esTokenDireccion(prev);

      if (PARTICULAS.has(lower) && i > 0 && !prevEsDireccion) return lower;

      if (esTokenDireccion(token)) return normalizarAbreviaturaDireccion(lower);

      if (token.includes('-')) {
        return token
          .split('-')
          .map((p) => (SIGLAS_DEPTO.has(p.toUpperCase()) ? p.toUpperCase() : capitalizarPalabra(p)))
          .join('-');
      }

      return capitalizarPalabra(token);
    })
    .join(' ');
}

export function normalizarGenero(valor) {
  const v = String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();

  if (!v) return '';

  if (['masculino', 'm', 'hombre', 'varon', 'h', 'masculino.'].some((x) => v === x || v.startsWith('mascul'))) {
    return 'masculino';
  }
  if (['femenino', 'f', 'mujer'].some((x) => v === x || v.startsWith('femen'))) {
    return 'femenino';
  }
  if (v === 'otro') return 'otro';
  return '';
}

export function normalizarEstadoCivil(valor) {
  const v = String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();

  if (!v) return '';
  if (v.includes('solter')) return 'soltero';
  if (v.includes('casad')) return 'casado';
  if (v.includes('divorci')) return 'divorciado';
  if (v.includes('viud')) return 'viudo';
  if (v.includes('union') || v.includes('unión')) return 'union_libre';
  return '';
}

/** Infiere género desde estado civil impreso en la CI cuando no hay campo explícito. */
function inferirGeneroDesdeEstadoCivil(estadoCivilRaw) {
  const raw = String(estadoCivilRaw ?? '').toUpperCase();
  if (/\bSOLTERO\b|\bCASADO\b|\bDIVORCIADO\b|\bVIUDO\b/.test(raw)) return 'masculino';
  if (/\bSOLTERA\b|\bCASADA\b|\bDIVORCIADA\b|\bVIUDA\b/.test(raw)) return 'femenino';
  return '';
}

const CAMPOS_TEXTO = [
  'nombres',
  'apellido_paterno',
  'apellido_materno',
  'lugar_nacimiento',
  'direccion',
  'zona',
  'ciudad',
  'padre_nombres',
  'madre_nombres',
  'ocupacion',
];

/**
 * Aplica formato título y valores normalizados al JSON devuelto por Gemini.
 */
export function normalizarDatosCedula(datos) {
  if (!datos || typeof datos !== 'object') return datos;

  const out = { ...datos };

  for (const campo of CAMPOS_TEXTO) {
    if (out[campo]) out[campo] = aFormatoTitulo(String(out[campo]));
  }

  if (out.complemento) {
    out.complemento = String(out.complemento).trim().toUpperCase();
  }

  const estadoCivilRaw = out.estado_civil;

  out.genero = normalizarGenero(out.genero);
  if (!out.genero && estadoCivilRaw) {
    out.genero = inferirGeneroDesdeEstadoCivil(estadoCivilRaw);
  }

  const estadoNorm = normalizarEstadoCivil(estadoCivilRaw);
  if (estadoNorm) out.estado_civil = estadoNorm;
  else if (out.estado_civil) out.estado_civil = aFormatoTitulo(String(out.estado_civil));

  return out;
}
