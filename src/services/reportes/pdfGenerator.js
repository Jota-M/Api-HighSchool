// services/reportes/pdfGenerator.js
import PDFDocument from 'pdfkit';
import { pdfStyles, institutionInfo, formatearFecha } from './reportStyles.js';

class PDFGenerator {
  constructor(options = {}) {
    this.doc = new PDFDocument({
      size: options.size || 'letter',
      margin: options.margin || pdfStyles.margins.page,
      bufferPages: true,
      ...options
    });
    
    this.currentY = this.doc.y;
  }

  /**
   * 🎨 ENCABEZADO INSTITUCIONAL
   */
  drawHeader(titulo, subtitulo = null) {
    const doc = this.doc;
    const startY = doc.y;

    // Línea superior decorativa
    doc.rect(50, startY, doc.page.width - 100, 3)
       .fillColor(`#${pdfStyles.colors.primary}`)
       .fill();

    doc.moveDown(0.5);

    // Título principal
    doc.fontSize(pdfStyles.fonts.title.size)
       .font(pdfStyles.fonts.title.name)
       .fillColor(`#${pdfStyles.colors.primary}`)
       .text(titulo, { align: 'center' });

    // Subtítulo (si existe)
    if (subtitulo) {
      doc.moveDown(0.3);
      doc.fontSize(pdfStyles.fonts.subheading.size)
         .font(pdfStyles.fonts.subheading.name)
         .fillColor(`#${pdfStyles.colors.textLight}`)
         .text(subtitulo, { align: 'center' });
    }

    // Información institucional
    doc.moveDown(0.5);
    doc.fontSize(pdfStyles.fonts.small.size)
       .font(pdfStyles.fonts.body.name)
       .fillColor(`#${pdfStyles.colors.textLight}`)
       .text(institutionInfo.nombre, { align: 'center' });
    
    doc.fontSize(pdfStyles.fonts.caption.size)
       .text(`${institutionInfo.direccion} | ${institutionInfo.telefono}`, { align: 'center' });

    // Línea inferior
    doc.moveDown(0.5);
    doc.rect(50, doc.y, doc.page.width - 100, 1)
       .fillColor(`#${pdfStyles.colors.border}`)
       .fill();

    doc.moveDown(1);
    this.currentY = doc.y;
  }

  /**
   * 📊 CUADRO DE INFORMACIÓN
   */
  drawInfoBox(items, columns = 2) {
    const doc = this.doc;
    const boxPadding = 10;
    const boxWidth = doc.page.width - 100;
    const columnWidth = boxWidth / columns;
    
    const startY = doc.y;
    const startX = 50;

    // Fondo del cuadro
    doc.rect(startX, startY, boxWidth, items.length * 20 / columns + boxPadding * 2)
       .fillColor(`#${pdfStyles.colors.background}`)
       .fill();

    // Borde del cuadro
    doc.rect(startX, startY, boxWidth, items.length * 20 / columns + boxPadding * 2)
       .strokeColor(`#${pdfStyles.colors.border}`)
       .lineWidth(1)
       .stroke();

    let currentX = startX + boxPadding;
    let currentY = startY + boxPadding;
    let column = 0;

    // Dibujar items
    items.forEach((item, index) => {
      doc.fontSize(pdfStyles.fonts.small.size)
         .font(pdfStyles.fonts.body.name)
         .fillColor(`#${pdfStyles.colors.textLight}`)
         .text(item.label + ':', currentX, currentY, { 
           width: columnWidth * 0.4,
           continued: true 
         })
         .font(pdfStyles.fonts.subheading.name)
         .fillColor(`#${pdfStyles.colors.text}`)
         .text(' ' + item.value, { width: columnWidth * 0.55 });

      column++;
      if (column >= columns) {
        column = 0;
        currentX = startX + boxPadding;
        currentY += 20;
      } else {
        currentX += columnWidth;
      }
    });

    doc.y = startY + items.length * 20 / columns + boxPadding * 2 + 10;
    this.currentY = doc.y;
  }

  /**
   * 📋 SECCIÓN CON TÍTULO
   */
  drawSection(titulo, icono = null) {
    const doc = this.doc;
    
    doc.moveDown(0.5);
    
    // Línea decorativa izquierda
    doc.rect(50, doc.y, 4, 20)
       .fillColor(`#${pdfStyles.colors.secondary}`)
       .fill();

    // Título de sección
    doc.fontSize(pdfStyles.fonts.heading.size)
       .font(pdfStyles.fonts.heading.name)
       .fillColor(`#${pdfStyles.colors.primary}`)
       .text(titulo, 60, doc.y + 4);

    doc.moveDown(0.8);
    this.currentY = doc.y;
  }

  /**
   * 📊 TABLA SIMPLE
   */
  drawTable(headers, rows, options = {}) {
    const doc = this.doc;
    const startX = options.startX || 50;
    const tableWidth = options.width || (doc.page.width - 100);
    const columnWidths = options.columnWidths || this._calculateColumnWidths(headers.length, tableWidth);
    const rowHeight = options.rowHeight || 25;
    
    let currentY = doc.y;

    // Encabezados
    let currentX = startX;
    
    // Fondo de encabezados
    doc.rect(startX, currentY, tableWidth, rowHeight)
       .fillColor(`#${pdfStyles.colors.primary}`)
       .fill();

    // Texto de encabezados
    headers.forEach((header, i) => {
      doc.fontSize(pdfStyles.fonts.small.size)
         .font(pdfStyles.fonts.subheading.name)
         .fillColor('#FFFFFF')
         .text(
           header, 
           currentX + 5, 
           currentY + (rowHeight - 10) / 2, 
           { width: columnWidths[i] - 10, align: 'center' }
         );
      currentX += columnWidths[i];
    });

    currentY += rowHeight;

    // Filas de datos
    rows.forEach((row, rowIndex) => {
      // Verificar si necesitamos nueva página
      if (currentY > doc.page.height - 100) {
        doc.addPage();
        currentY = 50;
      }

      // Fondo alternado
      if (rowIndex % 2 === 0) {
        doc.rect(startX, currentY, tableWidth, rowHeight)
           .fillColor(`#${pdfStyles.colors.background}`)
           .fill();
      }

      // Bordes de celda
      doc.rect(startX, currentY, tableWidth, rowHeight)
         .strokeColor(`#${pdfStyles.colors.border}`)
         .lineWidth(0.5)
         .stroke();

      // Contenido de la fila
      currentX = startX;
      row.forEach((cell, i) => {
        // Borde vertical
        if (i > 0) {
          doc.moveTo(currentX, currentY)
             .lineTo(currentX, currentY + rowHeight)
             .strokeColor(`#${pdfStyles.colors.border}`)
             .lineWidth(0.5)
             .stroke();
        }

        doc.fontSize(pdfStyles.fonts.body.size)
           .font(pdfStyles.fonts.body.name)
           .fillColor(`#${pdfStyles.colors.text}`)
           .text(
             cell?.toString() || 'N/A', 
             currentX + 5, 
             currentY + (rowHeight - 10) / 2, 
             { 
               width: columnWidths[i] - 10, 
               align: i === 0 ? 'left' : 'center',
               ellipsis: true
             }
           );
        currentX += columnWidths[i];
      });

      currentY += rowHeight;
    });

    doc.y = currentY + 10;
    this.currentY = doc.y;
  }

  /**
   * 📊 ESTADÍSTICAS EN GRID
   */
  drawStatsGrid(stats, columns = 4) {
    const doc = this.doc;
    const gridPadding = 15;
    const cardWidth = (doc.page.width - 100 - gridPadding * (columns - 1)) / columns;
    const cardHeight = 60;
    
    let currentX = 50;
    let currentY = doc.y;
    let column = 0;

    stats.forEach((stat) => {
      // Card background
      doc.roundedRect(currentX, currentY, cardWidth, cardHeight, 5)
         .fillColor(`#${pdfStyles.colors.background}`)
         .fill();

      // Card border
      doc.roundedRect(currentX, currentY, cardWidth, cardHeight, 5)
         .strokeColor(`#${pdfStyles.colors.border}`)
         .lineWidth(1)
         .stroke();

      // Valor (número grande)
      doc.fontSize(22)
         .font('Helvetica-Bold')
         .fillColor(`#${pdfStyles.colors.primary}`)
         .text(
           stat.value.toString(), 
           currentX, 
           currentY + 10, 
           { width: cardWidth, align: 'center' }
         );

      // Label (texto pequeño)
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(`#${pdfStyles.colors.textLight}`)
         .text(
           stat.label, 
           currentX, 
           currentY + 38, 
           { width: cardWidth, align: 'center' }
         );

      column++;
      if (column >= columns) {
        column = 0;
        currentX = 50;
        currentY += cardHeight + gridPadding;
      } else {
        currentX += cardWidth + gridPadding;
      }
    });

    doc.y = currentY + (column === 0 ? 0 : cardHeight + gridPadding);
    this.currentY = doc.y;
  }

  /**
   * 📄 PIE DE PÁGINA
   */
  addPageNumbers() {
    const doc = this.doc;
    const pages = doc.bufferedPageRange();

    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      // Línea superior
      doc.moveTo(50, doc.page.height - 60)
         .lineTo(doc.page.width - 50, doc.page.height - 60)
         .strokeColor(`#${pdfStyles.colors.border}`)
         .lineWidth(1)
         .stroke();

      // Fecha de generación
      doc.fontSize(pdfStyles.fonts.caption.size)
         .font(pdfStyles.fonts.body.name)
         .fillColor(`#${pdfStyles.colors.textLight}`)
         .text(
           `Generado: ${formatearFecha(new Date())}`,
           50,
           doc.page.height - 45,
           { align: 'left' }
         );

      // Número de página
      doc.text(
        `Página ${i + 1} de ${pages.count}`,
        50,
        doc.page.height - 45,
        { align: 'right' }
      );
    }
  }

  /**
   * 🔧 HELPERS PRIVADOS
   */
  _calculateColumnWidths(numColumns, totalWidth) {
    const width = totalWidth / numColumns;
    return Array(numColumns).fill(width);
  }

  /**
   * ✅ FINALIZAR Y DEVOLVER STREAM
   */
  pipe(stream) {
    return this.doc.pipe(stream);
  }

  end() {
    this.addPageNumbers();
    this.doc.end();
  }
}

export default PDFGenerator;