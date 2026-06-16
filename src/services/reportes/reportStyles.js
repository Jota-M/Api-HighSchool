// services/reportes/reportStyles.js
import { fileURLToPath } from 'url';
import path              from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ══════════════════════════════════════════════════════════
//  INFORMACIÓN INSTITUCIONAL — U.E.P. La Voz de Cristo
// ══════════════════════════════════════════════════════════
export const institutionInfo = {
  nombre:   'U.E.P. La Voz de Cristo',
  ciudad:   'Potosí - Bolivia',
  direccion: 'Potosí - Bolivia',
  telefono:  '',
  email:     '',
  // Ruta resuelta desde la ubicación de este archivo → src/public/logo.png
  logoPath:  path.join(__dirname, '../../public/logo.png'),
};

// ══════════════════════════════════════════════════════════
//  PALETA — exacta al comprobante de matrícula
// ══════════════════════════════════════════════════════════
export const colors = {
  // PDF (sin '#')
  azul:     '1B3A6B',
  dorado:   'D4A017',
  rojo:     'C0392B',
  gris:     '6B7280',
  negro:    '1A1A2E',
  bgCampo:  'EBF0FA',
  border:   'D1D5DB',
  rowAlt:   'EBF0FA',
  bgWhite:  'FFFFFF',
  approved: '27AE60',
  failed:   'C0392B',
  pending:  'E67E22',

  // ExcelJS (ARGB con prefijo FF)
  xl: {
    primary:    'FF1B3A6B',
    secondary:  'FFD4A017',
    rojo:       'FFC0392B',
    text:       'FF1A1A2E',
    textLight:  'FF6B7280',
    white:      'FFFFFFFF',
    headerBg:   'FF1B3A6B',
    rowAlt:     'FFEBF0FA',
    border:     'FFD1D5DB',
    background: 'FFF4F7FA',
    approved:   'FF27AE60',
    failed:     'FFC0392B',
    pending:    'FFE67E22',
  },
};

// ══════════════════════════════════════════════════════════
//  ESTILOS PDF
// ══════════════════════════════════════════════════════════
export const pdfStyles = {
  margins: { page: 50 },
  colors,
  fonts: {
    title:      { name: 'Helvetica-Bold', size: 18 },
    heading:    { name: 'Helvetica-Bold', size: 10.5 },
    subheading: { name: 'Helvetica-Bold', size: 9 },
    body:       { name: 'Helvetica',      size: 9 },
    small:      { name: 'Helvetica',      size: 8 },
    caption:    { name: 'Helvetica',      size: 7.5 },
    tableHdr:   { name: 'Helvetica-Bold', size: 8 },
  },
};

// ══════════════════════════════════════════════════════════
//  ESTILOS EXCEL
// ══════════════════════════════════════════════════════════
const XL = colors.xl;

export const excelStyles = {
  title: {
    font:      { name: 'Calibri', size: 15, bold: true, color: { argb: XL.white } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.primary } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  },
  sectionHeader: {
    font:      { name: 'Calibri', size: 10, bold: true, color: { argb: XL.primary } },
    alignment: { horizontal: 'left', vertical: 'middle' },
  },
  tableHeader: {
    font:      { name: 'Calibri', size: 9, bold: true, color: { argb: XL.white } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.headerBg } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
      top:    { style: 'thin',   color: { argb: XL.border } },
      bottom: { style: 'medium', color: { argb: XL.secondary } },
      left:   { style: 'hair',   color: { argb: XL.border } },
      right:  { style: 'hair',   color: { argb: XL.border } },
    },
  },
  cell: {
    font:      { name: 'Calibri', size: 9, color: { argb: XL.text } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      bottom: { style: 'hair', color: { argb: XL.border } },
      left:   { style: 'hair', color: { argb: XL.border } },
      right:  { style: 'hair', color: { argb: XL.border } },
    },
  },
  cellLeft: {
    font:      { name: 'Calibri', size: 9, color: { argb: XL.text } },
    alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
    border: {
      bottom: { style: 'hair', color: { argb: XL.border } },
      left:   { style: 'hair', color: { argb: XL.border } },
      right:  { style: 'hair', color: { argb: XL.border } },
    },
  },
  alternateRow: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.rowAlt } },
  },
  label: {
    font:      { name: 'Calibri', size: 9, bold: true, color: { argb: XL.primary } },
    alignment: { horizontal: 'left', vertical: 'middle' },
  },
  statCell: {
    font:      { name: 'Calibri', size: 14, bold: true, color: { argb: XL.primary } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.white } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      bottom: { style: 'medium', color: { argb: XL.secondary } },
      left:   { style: 'thin',   color: { argb: XL.border } },
      right:  { style: 'thin',   color: { argb: XL.border } },
    },
  },
};

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════
export function formatearFecha(fecha, tipo = 'largo') {
  if (!fecha) return '—';
  try {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(d.getTime())) return '—';
    if (tipo === 'solo-anio') return d.getFullYear().toString();
    if (tipo === 'corto')
      return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

export function formatearTelefono(tel) {
  if (!tel) return '—';
  const limpio = tel.toString().replace(/\D/g, '');
  if (limpio.length === 8) return `${limpio.slice(0, 4)}-${limpio.slice(4)}`;
  return tel;
}

export function getColorEstado(estado) {
  const mapa = {
    pendiente:   { bg: 'FFF8E1', text: 'F39C12', border: 'F39C12' },
    aprobado:    { bg: 'E8F5E9', text: '27AE60', border: '27AE60' },
    rechazado:   { bg: 'FDECEA', text: 'C0392B', border: 'C0392B' },
    matriculado: { bg: 'EBF0FA', text: '1B3A6B', border: '1B3A6B' },
    cancelado:   { bg: 'F5F5F5', text: '6B7280', border: 'D1D5DB' },
    activo:      { bg: 'E8F5E9', text: '27AE60', border: '27AE60' },
    inactivo:    { bg: 'F5F5F5', text: '6B7280', border: 'D1D5DB' },
    retirado:    { bg: 'FDECEA', text: 'C0392B', border: 'C0392B' },
    reprobado:   { bg: 'FDECEA', text: 'C0392B', border: 'C0392B' },
    ausente:     { bg: 'FFF8E1', text: 'E67E22', border: 'E67E22' },
  };
  const key = (estado ?? '').toLowerCase().trim();
  return mapa[key] ?? { bg: 'F4F7FA', text: '6B7280', border: 'D1D5DB' };
}