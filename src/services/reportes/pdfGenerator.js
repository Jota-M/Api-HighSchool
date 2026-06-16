// services/reportes/pdfGenerator.js
import PDFDocument from 'pdfkit';
import fs          from 'fs';
import path        from 'path';
import { institutionInfo, formatearFecha } from './reportStyles.js';

const AZUL     = '#1B3A6B';
const DORADO   = '#D4A017';
const ROJO     = '#C0392B';
const GRIS     = '#6B7280';
const NEGRO    = '#1A1A2E';
const BG_CAMPO = '#EBF0FA';
const BORDE    = '#D1D5DB';
const BLANCO   = '#FFFFFF';

// Espacio reservado para el footer al calcular saltos de página
const FOOTER_H = 35;

class PDFGenerator {
  constructor(options = {}) {
    this.landscape = options.landscape ?? false;
    this.margin    = 45;   // margen fijo, compacto pero cómodo

    this.doc = new PDFDocument({
      size:        'letter',
      layout:      this.landscape ? 'landscape' : 'portrait',
      margin:      this.margin,
      bufferPages: true,
      info: { Title: options.title || 'Reporte', Author: institutionInfo.nombre },
    });
  }

  get _W()  { return this.doc.page.width;       }
  get _H()  { return this.doc.page.height;      }
  get _iW() { return this._W - this.margin * 2; }
  get _m()  { return this.margin;               }
  // Límite inferior antes del footer
  get _maxY() { return this._H - this.margin - FOOTER_H; }

  // ════════════════════════════════════════════════════════
  // 🏛️  ENCABEZADO
  // ════════════════════════════════════════════════════════
  drawHeader(titulo, subtitulo = null, options = {}) {
    const doc = this.doc;
    const W   = this._W;
    const m   = this._m;

    // Barras decorativas fijas en la parte superior absoluta de la página
    doc.rect(0, 0, W, 7).fill(AZUL);
    doc.rect(0, 7, W, 4).fill(DORADO);

    // Logo
    const logoPath = institutionInfo.logoPath ?? '';
    const hasLogo  = logoPath && fs.existsSync(logoPath);
    const LOGO_SZ  = 50;
    const LOGO_X   = m;
    const LOGO_Y   = 16;

    if (hasLogo) {
      try { doc.image(logoPath, LOGO_X, LOGO_Y, { width: LOGO_SZ, height: LOGO_SZ }); }
      catch { /* ignorar */ }
    }

    // Nombre institución
    const textX = hasLogo ? LOGO_X + LOGO_SZ + 10 : m;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(AZUL)
       .text(institutionInfo.nombre, textX, 20, { lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
       .text(institutionInfo.ciudad ?? 'Bolivia', textX, 36, { lineBreak: false });

    // Número de documento (rojo, derecha)
    if (options.docId) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(ROJO)
         .text(options.docId, m, 20, { width: this._iW, align: 'right', lineBreak: false });
    }
    if (options.docEstado) {
      doc.font('Helvetica').fontSize(8.5).fillColor(NEGRO)
         .text(options.docEstado, m, 35, { width: this._iW, align: 'right', lineBreak: false });
    }

    // Separador
    doc.moveTo(m, 72).lineTo(W - m, 72)
       .lineWidth(0.5).strokeColor(BORDE).stroke();

    // Marca de agua (no mueve doc.y)
    this._drawWatermark();

    // Título centrado
    const tY = 80;
    doc.font('Helvetica-Bold').fontSize(17).fillColor(AZUL)
       .text(titulo, m, tY, { width: this._iW, align: 'center', lineBreak: false });

    // Línea dorada bajo el título
    const lineW = Math.min(this._iW * 0.5, 340);
    const lineX = (W - lineW) / 2;
    doc.rect(lineX, tY + 22, lineW, 3).fill(DORADO);

    // Subtítulo
    let afterHeader = tY + 34;
    if (subtitulo) {
      doc.font('Helvetica').fontSize(9).fillColor(GRIS)
         .text(subtitulo, m, afterHeader, { width: this._iW, align: 'center', lineBreak: false });
      afterHeader += 16;
    }

    // Posicionar cursor justo debajo del header, con pequeño espacio
    doc.y = afterHeader + 10;
  }

  // ════════════════════════════════════════════════════════
  // 💧  MARCA DE AGUA
  // ════════════════════════════════════════════════════════
  _drawWatermark() {
    const logoPath = institutionInfo.logoPath ?? '';
    if (!logoPath || !fs.existsSync(logoPath)) return;
    try {
      const cx = this._W / 2 - 75;
      const cy = this._H / 2 - 75;
      this.doc.save();
      this.doc.image(logoPath, cx, cy, { width: 150, height: 150 });
      this.doc.rect(cx, cy, 150, 150).fillOpacity(0.84).fill(BLANCO);
      this.doc.restore();
    } catch { /* ignorar */ }
  }

  // ════════════════════════════════════════════════════════
  // 📋  FILA DE METADATOS  (Período / Fecha)
  // ════════════════════════════════════════════════════════
  drawMetaRow(items) {
    const doc  = this.doc;
    const m    = this._m;
    const colW = this._iW / items.length;
    const y0   = doc.y;

    items.forEach((item, i) => {
      const x = m + i * colW;
      doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
         .text(`${item.label}: `, x, y0, { continued: true, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NEGRO)
         .text(item.value ?? '—', { lineBreak: false });
    });

    doc.y = y0 + 16;
  }

  // ════════════════════════════════════════════════════════
  // 🔷  TÍTULO DE SECCIÓN
  // ════════════════════════════════════════════════════════
  drawSection(titulo) {
    const doc = this.doc;
    this._checkPageBreak(24);

    const y0 = doc.y + 6;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(AZUL)
       .text(titulo, this._m, y0, { lineBreak: false });

    // Línea dorada fina debajo
    doc.moveTo(this._m, y0 + 14).lineTo(this._m + this._iW, y0 + 14)
       .lineWidth(1).strokeColor(DORADO).stroke();

    doc.y = y0 + 20;
  }

  // ════════════════════════════════════════════════════════
  // 📊  CUADRO DE INFORMACIÓN
  // ════════════════════════════════════════════════════════
  drawInfoBox(items, columns = 2) {
    const doc  = this.doc;
    const m    = this._m;
    const colW = this._iW / columns;
    const ROW  = 17;

    const rows = Math.ceil(items.length / columns);
    this._checkPageBreak(rows * ROW + 6);

    const startY = doc.y;
    let col = 0;
    let row = 0;

    items.forEach((item) => {
      const x = m + col * colW;
      const y = startY + row * ROW;

      doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
         .text(`${item.label}: `, x, y, { continued: true, width: colW * 0.36, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NEGRO)
         .text(item.value ?? '—', { width: colW * 0.60, lineBreak: false });

      col++;
      if (col >= columns) { col = 0; row++; }
    });

    doc.y = startY + rows * ROW + 6;
  }

  // ════════════════════════════════════════════════════════
  // 📊  ESTADÍSTICAS EN TARJETAS
  // ════════════════════════════════════════════════════════
  drawStatsGrid(stats, columns = 4) {
    const doc    = this.doc;
    const m      = this._m;
    const GAP    = 7;
    const CARD_H = 48;
    const cardW  = (this._iW - GAP * (columns - 1)) / columns;
    const rows   = Math.ceil(stats.length / columns);
    const totalH = rows * CARD_H + (rows - 1) * GAP;

    this._checkPageBreak(totalH + 8);

    const startY = doc.y;

    stats.forEach((stat, idx) => {
      const col = idx % columns;
      const row = Math.floor(idx / columns);
      const x   = m + col * (cardW + GAP);
      const y   = startY + row * (CARD_H + GAP);

      // Borde
      doc.roundedRect(x, y, cardW, CARD_H, 3)
         .lineWidth(0.7).strokeColor(BORDE).stroke();
      // Barra azul top
      doc.roundedRect(x, y, cardW, 4, 2).fill(AZUL);

      // Valor
      doc.font('Helvetica-Bold').fontSize(18).fillColor(AZUL)
         .text(String(stat.value ?? '—'), x, y + 7, { width: cardW, align: 'center', lineBreak: false });

      // Label
      doc.font('Helvetica').fontSize(7).fillColor(GRIS)
         .text(stat.label, x, y + 30, { width: cardW, align: 'center', lineBreak: false });
    });

    // Cursor justo debajo de todas las tarjetas
    doc.y = startY + totalH + 8;
  }

  // ════════════════════════════════════════════════════════
  // 📋  TABLA
  // ════════════════════════════════════════════════════════
  drawTable(headers, rows, options = {}) {
    const doc       = this.doc;
    const m         = this._m;
    const tableW    = options.width || this._iW;
    const colWidths = options.columnWidths || this._autoColW(headers.length, tableW);
    const ROW_H     = options.rowHeight || 20;
    const HDR_H     = 24;

    const _pintarHeader = (y) => {
      doc.rect(m, y, tableW, HDR_H).fill(AZUL);
      doc.rect(m, y + HDR_H - 3, tableW, 3).fill(DORADO);
      let x = m;
      headers.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLANCO)
           .text(h, x + 3, y + (HDR_H - 9) / 2, {
             width: colWidths[i] - 6, align: 'center', ellipsis: true, lineBreak: false,
           });
        x += colWidths[i];
      });
      return y + HDR_H;
    };

    this._checkPageBreak(HDR_H + ROW_H * 2);
    let y = _pintarHeader(doc.y);

    rows.forEach((row, ri) => {
      // Salto de página si no cabe la fila
      if (y + ROW_H > this._maxY) {
        doc.addPage();
        y = _pintarHeader(this._m);
      }

      // Fondo alternado
      if (ri % 2 !== 0) {
        doc.rect(m, y, tableW, ROW_H).fill(BG_CAMPO);
      }

      // Línea inferior
      doc.moveTo(m, y + ROW_H).lineTo(m + tableW, y + ROW_H)
         .lineWidth(0.3).strokeColor(BORDE).stroke();

      let cx = m;
      row.forEach((cell, ci) => {
        const txt = cell !== null && cell !== undefined ? String(cell) : '—';

        if (ci > 0) {
          doc.moveTo(cx, y).lineTo(cx, y + ROW_H)
             .lineWidth(0.3).strokeColor(BORDE).stroke();
        }

        let color = NEGRO;
        let font  = 'Helvetica';
        if (txt === 'Aprobado'  || txt === 'APROBADO')  { color = '#27AE60'; font = 'Helvetica-Bold'; }
        if (txt === 'Reprobado' || txt === 'REPROBADO') { color = ROJO;      font = 'Helvetica-Bold'; }
        if (txt === 'AUSENTE')                           { color = '#E67E22'; font = 'Helvetica-Bold'; }
        if (txt === 'Sin nota')                          { color = GRIS; }

        doc.font(font).fontSize(8).fillColor(color)
           .text(txt, cx + 4, y + (ROW_H - 9) / 2, {
             width: colWidths[ci] - 8,
             align: ci <= 2 ? 'left' : 'center',
             ellipsis: true,
             lineBreak: false,
           });

        cx += colWidths[ci];
      });

      y += ROW_H;
    });

    // Borde exterior
    doc.rect(m, doc.y, tableW, y - doc.y)
       .lineWidth(0.8).strokeColor('#CBD5E1').stroke();

    doc.y = y + 8;
  }

  // ════════════════════════════════════════════════════════
  // 📄  FOOTERS (al final, en todas las páginas)
  // ════════════════════════════════════════════════════════
  _drawFooters() {
    const doc   = this.doc;
    const pages = doc.bufferedPageRange();
    const W     = this._W;
    const H     = this._H;
    const m     = this._m;

    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      const textY = H - 30;
      doc.font('Helvetica').fontSize(7).fillColor(GRIS)
         .text(
           `Generado: ${formatearFecha(new Date(), 'largo')}  ·  ${institutionInfo.nombre}  ·  Pág. ${i + 1} / ${pages.count}`,
           m, textY, { width: this._iW, align: 'center', lineBreak: false }
         );

      doc.rect(0, H - 18, W, 4).fill(DORADO);
      doc.rect(0, H - 14, W, 14).fill(AZUL);
    }
  }

  // ════════════════════════════════════════════════════════
  // 🔧  HELPERS
  // ════════════════════════════════════════════════════════
  _autoColW(n, total) { return Array(n).fill(total / n); }

  _checkPageBreak(needed) {
    if (this.doc.y + needed > this._maxY) {
      this.doc.addPage();
      this.doc.y = this._m;
    }
  }

  pipe(stream) { return this.doc.pipe(stream); }

  end() {
    this._drawFooters();
    this.doc.end();
  }
}

export default PDFGenerator;