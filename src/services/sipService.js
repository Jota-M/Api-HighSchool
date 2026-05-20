// services/sipService.js
// Servicio de integración con el banco Bisa - SIP
// Maneja: token, generación de QR, estado de transacción e inhabilitación

import 'dotenv/config';

// =============================================
// CONFIGURACIÓN DESDE .env
// =============================================
const SIP_URL         = process.env.SIP_URL;
const SIP_APIKEY      = process.env.SIP_APIKEY;
const SIP_USERNAME    = process.env.SIP_USERNAME;
const SIP_PASSWORD    = process.env.SIP_PASSWORD;
const SIP_APIKEY_SERV = process.env.SIP_APIKEY_SERVICIO;
const CALLBACK_USER   = process.env.CALLBACK_USER;
const CALLBACK_PASS   = process.env.CALLBACK_PASSWORD;

// =============================================
// ESTADO DEL TOKEN EN MEMORIA
// Un solo token compartido para todos los requests
// Dura 4 horas, se renueva automáticamente
// =============================================
let _token      = null;
let _tokenExpAt = null; // timestamp en ms cuando vence

// =============================================
// HELPERS INTERNOS
// =============================================

/**
 * Hace un fetch a la API de SIP con manejo de errores centralizado
 */
async function _sipFetch(endpoint, options = {}) {
  const url = `${SIP_URL}${endpoint}`;

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (networkError) {
    throw new Error(
      `No se pudo conectar con el servidor SIP. ` +
      `Verificá que la URL sea correcta y que el servidor esté activo. ` +
      `Detalle: ${networkError.message}`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      `SIP devolvió una respuesta inválida (status ${response.status})`
    );
  }

  return { status: response.status, data };
}

/**
 * Verifica si el token actual es válido.
 * Le damos un margen de 5 minutos antes de que venza para renovarlo.
 */
function _tokenEsValido() {
  if (!_token || !_tokenExpAt) return false;
  const MARGEN_MS = 5 * 60 * 1000; // 5 minutos
  return Date.now() < (_tokenExpAt - MARGEN_MS);
}

// =============================================
// 1. OBTENER TOKEN
// Documentación: POST /autenticacion/v1/generarToken
// El token dura 4 horas. Lo guardamos en memoria y
// lo reutilizamos. Solo pedimos uno nuevo cuando vence.
// =============================================
async function obtenerToken() {
  if (_tokenEsValido()) {
    return _token;
  }

  console.log('[SIP] Solicitando token...');
  console.log('[SIP] URL:', `${SIP_URL}/autenticacion/v1/generarToken`);
  console.log('[SIP] APIKEY existe:', !!SIP_APIKEY);
  console.log('[SIP] APIKEY primeros 8 chars:', SIP_APIKEY?.substring(0, 8));
  console.log('[SIP] USERNAME:', SIP_USERNAME);
  console.log('[SIP] PASSWORD existe:', !!SIP_PASSWORD);
  console.log('[SIP] PASSWORD primeros 3 chars:', SIP_PASSWORD?.substring(0, 3));
  console.log('[SIP] PASSWORD length:', SIP_PASSWORD?.length);

  const { status, data } = await _sipFetch('/autenticacion/v1/generarToken', {
    method: 'POST',
    headers: {
      apikey: SIP_APIKEY,
    },
    body: JSON.stringify({
      username: SIP_USERNAME,
      password: SIP_PASSWORD,
    }),
  });

  console.log('[SIP] Respuesta status:', status);
  console.log('[SIP] Respuesta data:', JSON.stringify(data));

  if (status !== 200 || data.codigo !== 'OK') {
    throw new Error(
      `Error al obtener token de SIP: ${data.mensaje || 'Credenciales incorrectas'}`
    );
  }

  _token      = data.objeto.token;
  _tokenExpAt = Date.now() + (4 * 60 * 60 * 1000);

  console.log('[SIP] Nuevo token obtenido. Vence en 4 horas.');
  return _token;
}

// =============================================
// 2. GENERAR QR
// Documentación: POST /api/v1/generaQr
// Genera un QR de único uso para el pago de una mensualidad
//
// @param {object} opciones
//   alias            - Identificador único del pago (ej: "mens-123-mayo-2026")
//   monto            - Monto a pagar (número)
//   moneda           - "BOB" o "USD"
//   glosa            - Descripción corta (máx 30 caracteres)
//   fechaVencimiento - Fecha límite del QR (formato dd/mm/yyyy)
//   callbackUrl      - URL donde SIP avisará cuando se pague
// =============================================
async function generarQR({ alias, monto, moneda = 'BOB', glosa, fechaVencimiento, callbackUrl }) {

  if (!alias)               throw new Error('El alias es requerido para generar el QR');
  if (!monto || monto <= 0) throw new Error('El monto debe ser mayor a 0');
  if (!glosa)               throw new Error('La glosa es requerida');
  if (glosa.length > 30)    throw new Error('La glosa no puede superar 30 caracteres');
  if (!fechaVencimiento)    throw new Error('La fecha de vencimiento es requerida');
  if (!callbackUrl)         throw new Error('La URL de callback es requerida');

  const token = await obtenerToken();

  const { status, data } = await _sipFetch('/api/v1/generaQr', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      apikeyServicio: SIP_APIKEY_SERV,
    },
    body: JSON.stringify({
      alias,
      callback:         callbackUrl,
      detalleGlosa:     glosa,
      monto:            parseFloat(monto),
      moneda,
      fechaVencimiento,
      tipoSolicitud:    'API',
      unicoUso:         'true',
    }),
  });

  // Token vencido → limpiar y reintentar una vez
  if (status === 401) {
    console.log('[SIP] Token rechazado (401), renovando y reintentando...');
    _token      = null;
    _tokenExpAt = null;
    return generarQR({ alias, monto, moneda, glosa, fechaVencimiento, callbackUrl });
  }

  if (status !== 200 || data.codigo !== '0000') {
    throw new Error(
      `Error al generar QR en SIP: ${data.mensaje || 'Error desconocido'}`
    );
  }

  return {
    imagenQr:         data.objeto.imagenQr,         // Base64 para mostrar en el frontend
    idQr:             data.objeto.idQr,              // Identificador del QR en SIP
    fechaVencimiento: data.objeto.fechaVencimiento,
    bancoDestino:     data.objeto.bancoDestino,
    cuentaDestino:    data.objeto.cuentaDestino,
    idTransaccion:    data.objeto.idTransaccion,
  };
}

// =============================================
// 3. CONSULTAR ESTADO DE TRANSACCIÓN
// Documentación: POST /api/v1/estadoTransaccion
// Plan B: si el webhook falló, esto nos dice si ya se pagó
//
// @param {string} alias - El alias del QR generado
// @returns estadoActual: PENDIENTE | PAGADO | INHABILITADO | ERROR
// =============================================
async function consultarEstado(alias) {
  if (!alias) throw new Error('El alias es requerido para consultar el estado');

  const token = await obtenerToken();

  const { status, data } = await _sipFetch('/api/v1/estadoTransaccion', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      apikeyServicio: SIP_APIKEY_SERV,
    },
    body: JSON.stringify({ alias }),
  });

  if (status === 401) {
    console.log('[SIP] Token rechazado (401), renovando y reintentando...');
    _token      = null;
    _tokenExpAt = null;
    return consultarEstado(alias);
  }

  if (status !== 200 || data.codigo !== '0000') {
    throw new Error(
      `Error al consultar estado en SIP: ${data.mensaje || 'Error desconocido'}`
    );
  }

  return {
    alias:                 data.objeto.alias,
    estadoActual:          data.objeto.estadoActual, // PENDIENTE | PAGADO | INHABILITADO | ERROR
    fechaProcesamiento:    data.objeto.fechaProcesamiento    || null,
    numeroOrdenOriginante: data.objeto.numeroOrdenOriginante || null,
    monto:                 data.objeto.monto                 || null,
    idQr:                  data.objeto.idQr                  || null,
    moneda:                data.objeto.moneda                || null,
    cuentaCliente:         data.objeto.cuentaCliente         || null,
    nombreCliente:         data.objeto.nombreCliente         || null,
    documentoCliente:      data.objeto.documentoCliente      || null,
  };
}

// =============================================
// 4. INHABILITAR QR
// Documentación: POST /api/v1/inhabilitarPago
// Cancela un QR para que no pueda ser usado
//
// @param {string} alias - El alias del QR a cancelar
// =============================================
async function inhabilitarQR(alias) {
  if (!alias) throw new Error('El alias es requerido para inhabilitar el QR');

  const token = await obtenerToken();

  const { status, data } = await _sipFetch('/api/v1/inhabilitarPago', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      apikeyServicio: SIP_APIKEY_SERV,
    },
    body: JSON.stringify({ alias }),
  });

  if (status === 401) {
    console.log('[SIP] Token rechazado (401), renovando y reintentando...');
    _token      = null;
    _tokenExpAt = null;
    return inhabilitarQR(alias);
  }

  if (status !== 200 || data.codigo !== '0000') {
    throw new Error(
      `Error al inhabilitar QR en SIP: ${data.mensaje || 'Error desconocido'}`
    );
  }

  console.log(`[SIP] QR inhabilitado exitosamente. Alias: ${alias}`);
  return true;
}

// =============================================
// 5. VALIDAR CALLBACK
// Valida que el request del webhook realmente viene de SIP
// SIP usa autenticación Basic con las credenciales que vos definís
// y le informás a MC4 para que las configuren en SIP
//
// @param {string} authHeader - El header Authorization del request entrante
// @returns {boolean}
// =============================================
function validarCallbackAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const base64  = authHeader.slice('Basic '.length);
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');

  return user === CALLBACK_USER && pass === CALLBACK_PASS;
}

// =============================================
// 6. HELPERS DE FORMATO
// =============================================

/**
 * Genera un alias único para una mensualidad
 * Formato: mens-{mensualidad_id}-{timestamp}
 * El alias identifica exactamente qué mensualidad se está pagando
 */
function generarAlias(mensualidadId) {
  const ts = Date.now();
  return `mens-${mensualidadId}-${ts}`;
}

/**
 * Formatea una fecha JS a dd/mm/yyyy que espera SIP
 */
function formatearFechaSIP(fecha) {
  const d    = new Date(fecha);
  const dia  = String(d.getDate()).padStart(2, '0');
  const mes  = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

/**
 * Trunca la glosa a 30 caracteres si es necesario
 */
function truncarGlosa(texto) {
  return texto.length > 30 ? texto.substring(0, 30) : texto;
}

export {
  obtenerToken,
  generarQR,
  consultarEstado,
  inhabilitarQR,
  validarCallbackAuth,
  generarAlias,
  formatearFechaSIP,
  truncarGlosa,
};