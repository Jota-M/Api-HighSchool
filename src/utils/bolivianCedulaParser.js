// utils/bolivianCedulaParser.js
// Parsea texto OCR de cédulas bolivianas (dorso / frente) a campos del formulario.

const MESES = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const CIUDAD_POR_DEPTO = {
  PT: 'Potosi',
  LP: 'La Paz',
  CB: 'Cochabamba',
  SC: 'Santa Cruz',
  OR: 'Oruro',
  TJ: 'Tarija',
  BE: 'Beni',
  PD: 'Pando',
  BIO: 'El Alto',
};

function limpiarLinea(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mesANumero(nombreMes) {
  const key = nombreMes
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return MESES[key] ?? null;
}

function formatearFecha(dia, mesNombre, anio) {
  const mes = mesANumero(mesNombre);
  if (!mes) return '';
  const d = String(dia).padStart(2, '0');
  const m = String(mes).padStart(2, '0');
  return `${d}/${m}/${anio}`;
}

/**
 * Separa nombre completo del campo A: en nombres + apellidos (heurística boliviana).
 */
export function dividirNombreCompleto(nombreCompleto) {
  const line = limpiarLinea(nombreCompleto);
  if (!line) {
    return { nombres: '', apellido_paterno: '', apellido_materno: '' };
  }

  const parts = line.split(/\s+/);
  if (parts.length === 1) {
    return { nombres: parts[0], apellido_paterno: '', apellido_materno: '' };
  }
  if (parts.length === 2) {
    return { nombres: parts[0], apellido_paterno: parts[1], apellido_materno: '' };
  }

  const lowerParts = parts.map((p) => p.toLowerCase());
  let maternoStart = parts.length - 1;
  if (lowerParts[parts.length - 2] === 'de') {
    maternoStart = parts.length - 2;
    return {
      nombres: parts.slice(0, maternoStart - 1).join(' '),
      apellido_paterno: parts[maternoStart - 1],
      apellido_materno: parts.slice(maternoStart).join(' '),
    };
  }

  if (parts.length >= 4) {
    return {
      nombres: parts.slice(0, parts.length - 2).join(' '),
      apellido_paterno: parts[parts.length - 2],
      apellido_materno: parts[parts.length - 1],
    };
  }

  return {
    nombres: parts[0],
    apellido_paterno: parts[1],
    apellido_materno: parts[2] ?? '',
  };
}

function parseDomicilio(domicilioRaw) {
  const domicilio = limpiarLinea(domicilioRaw);
  if (!domicilio) return { direccion: '', zona: '', ciudad: '' };

  let zona = '';
  const zonaMatch = domicilio.match(/Z\/\.?\s*([^-]+?)(?:\s*-|$)/i);
  if (zonaMatch) zona = limpiarLinea(zonaMatch[1]);

  let direccion = domicilio;
  direccion = direccion.replace(/\s+No\.?\s*\d[\d\s]*$/i, '').trim();

  let ciudad = '';
  const deptoMatch = direccion.match(/-\s*(PT|LP|CB|SC|OR|TJ|BE|PD|BIO)(?:\s*-\s*|$)/i);
  if (deptoMatch) {
    ciudad = CIUDAD_POR_DEPTO[deptoMatch[1].toUpperCase()] ?? '';
    direccion = direccion.replace(/\s*-\s*(PT|LP|CB|SC|OR|TJ|BE|PD|BIO)\s*$/i, '').trim();
  }

  return { direccion, zona, ciudad };
}

function normalizarTextoOcr(raw) {
  return String(raw ?? '')
    .replace(/\r/g, '\n')
    .replace(/[|¦]/g, 'I')
    .replace(/0/g, (m, idx, s) => {
      // En palabras (Nacido, Domicilio) el 0 suele ser o
      const before = s[idx - 1];
      const after = s[idx + 1];
      if (/[a-záéíóú]/i.test(before) && /[a-záéíóú]/i.test(after)) return 'o';
      return m;
    });
}

function inferNombreDesdeLineas(lines) {
  for (const line of lines) {
    const trimmed = limpiarLinea(line);
    if (!trimmed || trimmed.length < 6) continue;
    if (/nacido|domicilio|estado civil|profes|padre|madre|cedula|identidad|certifica|documento/i.test(trimmed)) {
      continue;
    }
    if (/^A\s*[:.]?\s*/i.test(trimmed)) {
      return dividirNombreCompleto(trimmed.replace(/^A\s*[:.]?\s*/i, ''));
    }
    const soloLetras = trimmed.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ\s]/g, '').trim();
    const words = soloLetras.split(/\s+/);
    if (words.length >= 3 && words.every((w) => w.length >= 2)) {
      const upperRatio =
        soloLetras.replace(/[^a-záéíóúñ]/gi, '').length > 0
          ? soloLetras.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length /
            soloLetras.replace(/[^a-záéíóúñA-ZÁÉÍÓÚÑ]/gi, '').length
          : 0;
      if (upperRatio >= 0.75) {
        return dividirNombreCompleto(soloLetras);
      }
    }
  }
  return null;
}

export function tieneDatosUtiles(datos) {
  return Boolean(
    datos.ci ||
      datos.nombres ||
      datos.apellido_paterno ||
      datos.direccion ||
      datos.fecha_nacimiento ||
      datos.lugar_nacimiento
  );
}

function estimarConfianza(campos) {
  const claves = ['ci', 'nombres', 'fecha_nacimiento', 'direccion'];
  const llenos = claves.filter((k) => campos[k] && String(campos[k]).trim()).length;
  if (llenos >= 3 && campos.nombres && campos.ci) return 'alta';
  if (llenos >= 2) return 'media';
  return 'baja';
}

/**
 * @param {string} rawText - Texto devuelto por Tesseract u otro OCR
 */
export function parseCedulaBolivianaText(rawText) {
  const text = normalizarTextoOcr(rawText);
  const flat = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const datos = {
    ci: '',
    complemento: '',
    nombres: '',
    apellido_paterno: '',
    apellido_materno: '',
    fecha_nacimiento: '',
    lugar_nacimiento: '',
    genero: '',
    estado_civil: '',
    ocupacion: '',
    direccion: '',
    zona: '',
    ciudad: '',
    padre_nombres: '',
    padre_ci: '',
    madre_nombres: '',
    madre_ci: '',
    confianza: 'baja',
  };

  const ciNo = flat.match(/\bNo\.?\s*(\d{6,10})\b/i);
  if (ciNo) datos.ci = ciNo[1];

  const deDepto = flat.match(/\bde\s+(POTOS[IÍ]|LA\s+PAZ|COCHABAMBA|ORURO|TARIJA|BENI|PANDO|SANTA\s+CRUZ)\b/i);
  if (deDepto) {
    const map = {
      potosi: 'PT',
      'la paz': 'LP',
      cochabamba: 'CB',
      oruro: 'OR',
      tarija: 'TJ',
      beni: 'BE',
      pando: 'PD',
      'santa cruz': 'SC',
    };
    const norm = deDepto[1].toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    datos.complemento = map[norm] ?? '';
  }

  const nombreMatch = flat.match(
    /\bA\s*[:.]?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ\s.]+?)(?=\s+Nac[ií]d[o0]\s+el|\s+Estad[o0]\s+C[ií]v|\s+Profes)/i
  );
  if (nombreMatch) {
    const partes = dividirNombreCompleto(nombreMatch[1]);
    Object.assign(datos, partes);
  } else {
    const inferido = inferNombreDesdeLineas(lines);
    if (inferido) Object.assign(datos, inferido);
  }

  const fechaMatch =
    flat.match(/Nac[ií]d[o0]\s+el\s+(\d{1,2})\s+de\s+([A-Za-záéíóúÁÉÍÓÚñ]+)\s+de\s+(\d{4})/i) ||
    flat.match(/\b(\d{1,2})\s+de\s+([A-Za-záéíóúÁÉÍÓÚñ]+)\s+de\s+(19\d{2}|20\d{2})\b/i);
  if (fechaMatch) {
    datos.fecha_nacimiento = formatearFecha(fechaMatch[1], fechaMatch[2], fechaMatch[3]);
  }

  const lugarMatch = flat.match(/\bEn\s+([^]+?)(?=\s+Estad[o0]\s+C[ií]v|\s+Profes)/i);
  if (lugarMatch) datos.lugar_nacimiento = limpiarLinea(lugarMatch[1]);

  const estadoMatch = flat.match(/Estad[o0]\s+C[ií]v[ií]l\s+([A-Za-záéíóúÁÉÍÓÚñ]+)/i);
  if (estadoMatch) datos.estado_civil = limpiarLinea(estadoMatch[1]);

  const ocupMatch = flat.match(/Profes(?:i|í)on\/Ocupaci(?:o|ó)n\s+([^]+?)(?=\s+Domicilio|\s+Padre|\s+Madre|$)/i);
  if (ocupMatch) datos.ocupacion = limpiarLinea(ocupMatch[1]);

  const domMatch = flat.match(
    /Dom[ií]c[ií]l[ií]o\s+([^]+?)(?=\s+Padre|\s+Madre|\s+DOCUMENTOS|\s+No\.?\s*\d|$)/i
  );
  if (domMatch) {
    const domParts = parseDomicilio(domMatch[1]);
    datos.direccion = domParts.direccion;
    datos.zona = domParts.zona;
    datos.ciudad = domParts.ciudad;
  }

  const padreMatch = flat.match(/Padre\s*:?\s*([A-Za-záéíóúÁÉÍÓÚñ\s]+?)(?=\s+\d{6,}|\s+Madre|$)/i);
  if (padreMatch) datos.padre_nombres = limpiarLinea(padreMatch[1]);

  const padreCiMatch = flat.match(/Padre[^0-9]*(\d{6,10})/i);
  if (padreCiMatch) datos.padre_ci = padreCiMatch[1];

  const madreMatch = flat.match(/Madre\s*:?\s*([A-Za-záéíóúÁÉÍÓÚñ\s]+?)(?=\s+\d{6,}|$)/i);
  if (madreMatch) datos.madre_nombres = limpiarLinea(madreMatch[1]);

  const madreCiMatch = flat.match(/Madre[^0-9]*(\d{6,10})/i);
  if (madreCiMatch) datos.madre_ci = madreCiMatch[1];

  if (!datos.ci) {
    const nums = flat.match(/\b(\d{6,10})\b/g);
    if (nums?.length) {
      const preferido = nums.find((n) => n.length >= 7) ?? nums[0];
      datos.ci = preferido;
    }
  }

  datos.confianza = estimarConfianza(datos);
  return datos;
}
