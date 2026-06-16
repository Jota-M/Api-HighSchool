// services/reportes/excelGenerator.js
import ExcelJS from 'exceljs';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';
import { excelStyles, colors, institutionInfo, formatearFecha } from './reportStyles.js';

const XL = colors.xl;

// Colores exactos de la paleta del comprobante
const PRIMARY   = XL.primary;    // FF1B3A6B — azul oscuro
const SECONDARY = XL.secondary;  // FFD4A017 — dorado
const ROJO      = XL.rojo;       // FFC0392B
const GRIS      = XL.textLight;  // FF6B7280
const NEGRO     = XL.text;       // FF1A1A2E
const BG_CAMPO  = 'FFEBF0FA';    // azul muy claro (campos destacados)
const WHITE     = XL.white;

class ExcelGenerator {
  constructor() {
    this.wb = new ExcelJS.Workbook();
    this.wb.creator  = institutionInfo.nombre;
    this.wb.created  = new Date();
    this.wb.modified = new Date();
  }

  // ════════════════════════════════════════════════════════
  // 📄  CREAR HOJA
  // ════════════════════════════════════════════════════════
  createSheet(name, options = {}) {
    const ws = this.wb.addWorksheet(name, {
      pageSetup: {
        paperSize:   9,
        orientation: options.landscape ? 'landscape' : 'portrait',
        fitToPage:   true,
        fitToWidth:  1,
        margins: { left: 0.6, right: 0.6, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
      },
      headerFooter: {
        oddHeader: `&C&"Calibri,Bold"&11${institutionInfo.nombre}`,
        oddFooter: `&LGenerado: ${formatearFecha(new Date(), 'corto')}&C${institutionInfo.nombre}&R&P de &N`,
      },
      views: [{ state: 'normal', showGridLines: false }],
    });
    return ws;
  }

  // ════════════════════════════════════════════════════════
  // 🏛️  ENCABEZADO INSTITUCIONAL
  //     Replica: barra azul | logo + nombre | número en rojo
  // ════════════════════════════════════════════════════════
  addTitle(ws, title, subtitle = null, options = {}) {
    // ── Fila 1: barra azul institucional (simula la barra superior del PDF) ──
    const barRow = ws.addRow(['']);
    this._mergeRow(ws, barRow.number, 12);
    ws.getCell(barRow.number, 1).fill = _solid(PRIMARY);
    ws.getRow(barRow.number).height = 6;

    // ── Fila 2: barra dorada ──
    const goldRow = ws.addRow(['']);
    this._mergeRow(ws, goldRow.number, 12);
    ws.getCell(goldRow.number, 1).fill = _solid(SECONDARY);
    ws.getRow(goldRow.number).height = 3;

    // ── Fila 3: header con logo + nombre + doc ID ──
    const hdrRow = ws.addRow([institutionInfo.nombre]);
    ws.getRow(hdrRow.number).height = 40;

    // Logo (si existe)
    const logoPath = institutionInfo.logoPath;
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        const ext  = path.extname(logoPath).replace('.', '').toLowerCase();
        const imgId = this.wb.addImage({ filename: logoPath, extension: ext === 'jpg' ? 'jpeg' : ext });
        ws.addImage(imgId, {
          tl: { col: 0, row: hdrRow.number - 1 },
          ext: { width: 42, height: 42 },
          editAs: 'oneCell',
        });
      } catch { /* logo inaccesible */ }
    }

    // Nombre institución (col B)
    const nameCell = ws.getCell(hdrRow.number, 2);
    nameCell.value = institutionInfo.nombre;
    nameCell.style = {
      font:      { name: 'Calibri', size: 13, bold: true, color: { argb: PRIMARY } },
      alignment: { horizontal: 'left', vertical: 'middle' },
    };

    // Ciudad (col C-D, debajo del nombre — misma fila con wrap)
    const cityCell = ws.getCell(hdrRow.number, 3);
    cityCell.value = institutionInfo.ciudad ?? '';
    cityCell.style = {
      font:      { name: 'Calibri', size: 9, color: { argb: GRIS } },
      alignment: { horizontal: 'left', vertical: 'bottom' },
    };

    // Número de documento (derecha, en rojo) — col J-L
    if (options.docId) {
      const idCell = ws.getCell(hdrRow.number, 10);
      this._merge(ws, hdrRow.number, 10, hdrRow.number, 12);
      idCell.value = options.docId;
      idCell.style = {
        font:      { name: 'Calibri', size: 11, bold: true, color: { argb: ROJO } },
        alignment: { horizontal: 'right', vertical: 'middle' },
      };
    }

    // ── Fila 4: separador fino ──
    const sepRow = ws.addRow(['']);
    this._mergeRow(ws, sepRow.number, 12);
    ws.getCell(sepRow.number, 1).border = {
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };
    ws.getRow(sepRow.number).height = 4;

    // ── Fila 5: título principal centrado en azul ──
    const titleRow = ws.addRow([title]);
    this._mergeRow(ws, titleRow.number, 12);
    ws.getCell(titleRow.number, 1).value = title;
    ws.getCell(titleRow.number, 1).style = {
      font:      { name: 'Calibri', size: 16, bold: true, color: { argb: PRIMARY } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    };
    ws.getRow(titleRow.number).height = 32;

    // ── Fila 6: línea dorada corta bajo el título (toda la fila en dorado, altura mínima) ──
    const underRow = ws.addRow(['']);
    this._mergeRow(ws, underRow.number, 12);
    ws.getCell(underRow.number, 1).fill = _solid(SECONDARY);
    ws.getRow(underRow.number).height = 3;

    // ── Fila 7: subtítulo ──
    if (subtitle) {
      const subRow = ws.addRow([subtitle]);
      this._mergeRow(ws, subRow.number, 12);
      ws.getCell(subRow.number, 1).style = {
        font:      { name: 'Calibri', size: 10, italic: true, color: { argb: GRIS } },
        alignment: { horizontal: 'center', vertical: 'middle' },
      };
      ws.getRow(subRow.number).height = 18;
    }

    // ── Fecha de generación ──
    const dateRow = ws.addRow([`Generado: ${formatearFecha(new Date(), 'corto')}`]);
    this._mergeRow(ws, dateRow.number, 12);
    ws.getCell(dateRow.number, 1).style = {
      font:      { name: 'Calibri', size: 8, italic: true, color: { argb: GRIS } },
      alignment: { horizontal: 'right', vertical: 'middle' },
    };
    ws.getRow(dateRow.number).height = 14;

    ws.addRow([]); // espacio
  }

  // ════════════════════════════════════════════════════════
  // 📊  CUADRO DE INFORMACIÓN
  //     Estilo: label gris + valor negro bold (igual al comprobante)
  // ════════════════════════════════════════════════════════
  addInfoBox(ws, items) {
    // Título de sección
    this._addSectionTitle(ws, 'INFORMACIÓN DEL REPORTE');

    items.forEach(item => {
      const r = ws.addRow([item.label, item.value ?? '—']);
      r.height = 18;

      // Label
      r.getCell(1).style = {
        font:      { name: 'Calibri', size: 9, color: { argb: GRIS } },
        alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
      };
      // Valor
      r.getCell(2).style = {
        font:      { name: 'Calibri', size: 9, bold: true, color: { argb: NEGRO } },
        alignment: { horizontal: 'left', vertical: 'middle' },
      };
      // Separador inferior fino
      for (let c = 1; c <= 4; c++) {
        const cell = r.getCell(c);
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } };
      }
    });

    ws.addRow([]);
  }

  // ════════════════════════════════════════════════════════
  // 📊  ESTADÍSTICAS EN TARJETAS
  //     Valor grande azul + label gris + borde dorado abajo
  // ════════════════════════════════════════════════════════
  addStats(ws, stats, columns = 3) {
    this._addSectionTitle(ws, 'ESTADÍSTICAS');

    const chunkSize = Math.ceil(stats.length / columns);

    for (let row = 0; row < chunkSize; row++) {
      // Fila de labels
      const labelData = [];
      for (let col = 0; col < columns; col++) {
        const s = stats[row + col * chunkSize];
        labelData.push(s?.label ?? '', '');
      }
      const lRow = ws.addRow(labelData);
      lRow.height = 15;
      for (let col = 0; col < columns; col++) {
        const ci = col * 2 + 1;
        try { ws.mergeCells(lRow.number, ci, lRow.number, ci + 1); } catch {}
        lRow.getCell(ci).style = {
          font:      { name: 'Calibri', size: 8, color: { argb: GRIS } },
          fill:      _solid(BG_CAMPO),
          alignment: { horizontal: 'center', vertical: 'middle' },
          border: {
            top:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left:  { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          },
        };
      }

      // Fila de valores
      const valueData = [];
      for (let col = 0; col < columns; col++) {
        const s = stats[row + col * chunkSize];
        valueData.push(s?.value ?? '', '');
      }
      const vRow = ws.addRow(valueData);
      vRow.height = 28;
      for (let col = 0; col < columns; col++) {
        const ci = col * 2 + 1;
        try { ws.mergeCells(vRow.number, ci, vRow.number, ci + 1); } catch {}
        vRow.getCell(ci).style = {
          font:      { name: 'Calibri', size: 17, bold: true, color: { argb: PRIMARY } },
          fill:      _solid(WHITE),
          alignment: { horizontal: 'center', vertical: 'middle' },
          border: {
            bottom: { style: 'medium', color: { argb: SECONDARY } }, // dorado abajo
            left:   { style: 'thin',   color: { argb: 'FFD1D5DB' } },
            right:  { style: 'thin',   color: { argb: 'FFD1D5DB' } },
          },
        };
      }
    }

    ws.addRow([]);
  }

  // ════════════════════════════════════════════════════════
  // 📋  TABLA
  //     Header azul + línea dorada + filas alternadas
  // ════════════════════════════════════════════════════════
  addTable(ws, headers, rows, options = {}) {
    // Título de sección opcional
    if (options.sectionTitle) {
      this._addSectionTitle(ws, options.sectionTitle);
    }

    // ── Encabezado de tabla ──
    const hRow = ws.addRow(headers);
    hRow.height = 26;
    hRow.eachCell({ includeEmpty: true }, (cell, colN) => {
      if (colN > headers.length) return;
      cell.style = {
        font:      { name: 'Calibri', size: 9, bold: true, color: { argb: WHITE } },
        fill:      _solid(PRIMARY),
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border: {
          top:    { style: 'thin',   color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'medium', color: { argb: SECONDARY } },
          left:   { style: 'hair',   color: { argb: 'FFD1D5DB' } },
          right:  { style: 'hair',   color: { argb: 'FFD1D5DB' } },
        },
      };
    });

    // ── Filas de datos ──
    rows.forEach((row, idx) => {
      const dRow = ws.addRow(row);
      dRow.height = 19;

      dRow.eachCell({ includeEmpty: true }, (cell, colN) => {
        if (colN > headers.length) return;

        const isEven  = idx % 2 === 0;
        const val     = cell.value?.toString() ?? '';
        const isLeft  = colN <= 3;

        let fontColor = NEGRO;
        let bgColor   = isEven ? WHITE : BG_CAMPO;
        let bold      = false;

        // Estados con color
        if (val === 'Aprobado' || val === 'APROBADO') {
          fontColor = 'FF27AE60'; bold = true;
          bgColor   = isEven ? 'FFE8F5E9' : 'FFD4EDDA';
        } else if (val === 'Reprobado' || val === 'REPROBADO') {
          fontColor = ROJO; bold = true;
          bgColor   = isEven ? 'FFFDECEA' : 'FFFAD7D3';
        } else if (val === 'AUSENTE') {
          fontColor = 'FFE67E22'; bold = true;
          bgColor   = isEven ? 'FFFFF8E1' : 'FFFFF0CC';
        } else if (val === 'Sin nota') {
          fontColor = GRIS;
        }

        cell.style = {
          font:      { name: 'Calibri', size: 9, bold, color: { argb: fontColor } },
          fill:      _solid(bgColor),
          alignment: { horizontal: isLeft ? 'left' : 'center', vertical: 'middle', indent: isLeft ? 1 : 0 },
          border: {
            bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } },
            left:   { style: 'hair', color: { argb: 'FFD1D5DB' } },
            right:  { style: 'hair', color: { argb: 'FFD1D5DB' } },
          },
        };
      });
    });

    // ── Anchos de columna ──
    if (options.columnWidths) {
      options.columnWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    } else {
      ws.columns.forEach(col => {
        let max = 10;
        col.eachCell({ includeEmpty: false }, c => {
          const l = c.value ? c.value.toString().length : 0;
          if (l > max) max = l;
        });
        col.width = Math.min(max + 3, 45);
      });
    }

    // Filtro automático
    if (options.autoFilter !== false) {
      ws.autoFilter = {
        from: { row: hRow.number, column: 1 },
        to:   { row: hRow.number, column: headers.length },
      };
    }

    ws.addRow([]);
  }

  // ════════════════════════════════════════════════════════
  // 📄  PIE DE PÁGINA
  //     Texto centrado + barra dorada + barra azul
  // ════════════════════════════════════════════════════════
  addFooter(ws) {
    ws.addRow([]);

    // Texto pie
    const ftRow = ws.addRow([
      `${institutionInfo.nombre}  ·  ${institutionInfo.ciudad ?? ''}  ·  Generado: ${formatearFecha(new Date(), 'largo')}`,
    ]);
    this._mergeRow(ws, ftRow.number, 12);
    ftRow.getCell(1).style = {
      font:      { name: 'Calibri', size: 8, italic: true, color: { argb: GRIS } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: { top: { style: 'thin', color: { argb: 'FFD1D5DB' } } },
    };
    ws.getRow(ftRow.number).height = 16;

    // Barra dorada
    const goldRow = ws.addRow(['']);
    this._mergeRow(ws, goldRow.number, 12);
    goldRow.getCell(1).fill = _solid(SECONDARY);
    ws.getRow(goldRow.number).height = 4;

    // Barra azul
    const blueRow = ws.addRow(['']);
    this._mergeRow(ws, blueRow.number, 12);
    blueRow.getCell(1).fill = _solid(PRIMARY);
    ws.getRow(blueRow.number).height = 8;
  }

  // ════════════════════════════════════════════════════════
  // 🔷  TÍTULO DE SECCIÓN  (texto azul bold, igual al comprobante)
  // ════════════════════════════════════════════════════════
  _addSectionTitle(ws, title) {
    ws.addRow([]); // espacio previo
    const r = ws.addRow([title]);
    r.height = 20;
    r.getCell(1).style = {
      font:      { name: 'Calibri', size: 10, bold: true, color: { argb: PRIMARY } },
      alignment: { horizontal: 'left', vertical: 'middle' },
    };
    // Separador fino debajo
    this._mergeRow(ws, r.number, 12);
    r.getCell(1).border = {
      bottom: { style: 'thin', color: { argb: SECONDARY } },
    };
  }

  // ════════════════════════════════════════════════════════
  // 💾  ESCRIBIR
  // ════════════════════════════════════════════════════════
  async write(stream)  { return this.wb.xlsx.write(stream);  }
  async writeBuffer()  { return this.wb.xlsx.writeBuffer();  }

  // ════════════════════════════════════════════════════════
  // 🔧  HELPERS
  // ════════════════════════════════════════════════════════
  _merge(ws, r1, c1, r2, c2) {
    try { ws.mergeCells(r1, c1, r2, c2); } catch {}
  }
  _mergeRow(ws, rowNum, cols) {
    try { ws.mergeCells(rowNum, 1, rowNum, cols); } catch {}
  }
  _columnToLetter(col) {
    let l = '';
    while (col > 0) {
      const r = (col - 1) % 26;
      l = String.fromCharCode(65 + r) + l;
      col = Math.floor((col - 1) / 26);
    }
    return l;
  }
}

// Helper fill sólido
function _solid(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export default ExcelGenerator;