// services/reportes/excelGenerator.js
import ExcelJS from 'exceljs';
import { excelStyles, colors, institutionInfo, formatearFecha } from './reportStyles.js';

class ExcelGenerator {
  constructor() {
    this.workbook = new ExcelJS.Workbook();
    this.workbook.creator = institutionInfo.nombre;
    this.workbook.created = new Date();
  }

  /**
   * 📄 CREAR HOJA CON ESTILO
   */
  createSheet(name, options = {}) {
    const worksheet = this.workbook.addWorksheet(name, {
      pageSetup: { 
        paperSize: 9, // A4
        orientation: options.landscape ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        margins: {
          left: 0.7,
          right: 0.7,
          top: 0.75,
          bottom: 0.75,
          header: 0.3,
          footer: 0.3
        }
      },
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    return worksheet;
  }

  /**
   * 🎨 TÍTULO PRINCIPAL
   */
  addTitle(worksheet, title, subtitle = null) {
    const titleRow = worksheet.addRow([title]);
    worksheet.mergeCells(`A${titleRow.number}:${this._columnToLetter(8)}${titleRow.number}`);
    
    const titleCell = worksheet.getCell(`A${titleRow.number}`);
    titleCell.style = excelStyles.title;
    titleCell.value = title;
    
    worksheet.getRow(titleRow.number).height = 30;

    if (subtitle) {
      const subtitleRow = worksheet.addRow([subtitle]);
      worksheet.mergeCells(`A${subtitleRow.number}:${this._columnToLetter(8)}${subtitleRow.number}`);
      
      const subtitleCell = worksheet.getCell(`A${subtitleRow.number}`);
      subtitleCell.font = { name: 'Calibri', size: 12, color: { argb: colors.medium } };
      subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      
      worksheet.getRow(subtitleRow.number).height = 20;
    }

    // Fila vacía
    worksheet.addRow([]);
  }

  /**
   * 📊 CUADRO DE INFORMACIÓN
   */
  addInfoBox(worksheet, data) {
    data.forEach(item => {
      const row = worksheet.addRow([item.label, item.value]);
      
      row.getCell(1).style = excelStyles.label;
      row.getCell(2).font = { name: 'Calibri', size: 10 };
      row.getCell(2).alignment = { horizontal: 'left' };
      
      row.height = 18;
    });

    worksheet.addRow([]); // Fila vacía
  }

  /**
   * 📋 TABLA CON DATOS
   */
  addTable(worksheet, headers, rows, options = {}) {
    // Encabezado de sección (si existe)
    if (options.sectionTitle) {
      const sectionRow = worksheet.addRow([options.sectionTitle]);
      worksheet.mergeCells(`A${sectionRow.number}:${this._columnToLetter(headers.length)}${sectionRow.number}`);
      
      const sectionCell = worksheet.getCell(`A${sectionRow.number}`);
      sectionCell.style = excelStyles.sectionHeader;
      sectionRow.height = 25;
    }

    // Encabezados de tabla
    const headerRow = worksheet.addRow(headers);
    headerRow.height = 25;
    
    headerRow.eachCell((cell) => {
      cell.style = excelStyles.tableHeader;
    });

    // Datos
    rows.forEach((row, index) => {
      const dataRow = worksheet.addRow(row);
      dataRow.height = 20;
      
      dataRow.eachCell((cell) => {
        cell.style = excelStyles.cell;
        
        // Fila alterna
        if (index % 2 === 0) {
          cell.fill = excelStyles.alternateRow.fill;
        }
      });
    });

    // Ajustar anchos de columna
    if (options.columnWidths) {
      options.columnWidths.forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
      });
    } else {
      // Autoajustar
      worksheet.columns.forEach(column => {
        let maxLength = 10;
        column.eachCell({ includeEmpty: false }, cell => {
          const length = cell.value ? cell.value.toString().length : 0;
          if (length > maxLength) maxLength = length;
        });
        column.width = Math.min(maxLength + 2, 50);
      });
    }

    // Aplicar filtros
    if (options.autoFilter !== false) {
      worksheet.autoFilter = {
        from: { row: headerRow.number, column: 1 },
        to: { row: headerRow.number, column: headers.length }
      };
    }

    worksheet.addRow([]); // Fila vacía
  }

  /**
   * 📊 ESTADÍSTICAS
   */
  addStats(worksheet, stats, columns = 2) {
    const chunkSize = Math.ceil(stats.length / columns);
    const maxRows = Math.max(...Array.from({ length: columns }, (_, i) => 
      stats.slice(i * chunkSize, (i + 1) * chunkSize).length
    ));

    for (let row = 0; row < maxRows; row++) {
      const rowData = [];
      
      for (let col = 0; col < columns; col++) {
        const stat = stats[col * chunkSize + row];
        if (stat) {
          rowData.push(stat.label, stat.value);
        } else {
          rowData.push('', '');
        }
      }

      const excelRow = worksheet.addRow(rowData);
      excelRow.height = 22;

      // Estilizar
      for (let col = 0; col < columns; col++) {
        const labelCell = excelRow.getCell(col * 2 + 1);
        const valueCell = excelRow.getCell(col * 2 + 2);

        labelCell.style = excelStyles.label;
        valueCell.style = excelStyles.statCell;
        valueCell.font = { ...excelStyles.statCell.font, color: { argb: colors.headerBg } };
      }
    }

    worksheet.addRow([]); // Fila vacía
  }

  /**
   * 📊 GRÁFICO DE BARRAS (SIMPLE)
   */
  addChart(worksheet, title, categories, values, position = 'A1') {
    // ExcelJS tiene soporte limitado para gráficos
    // Por ahora, creamos una tabla de datos que puede convertirse en gráfico manualmente
    
    const chartRow = worksheet.addRow([title]);
    worksheet.mergeCells(`A${chartRow.number}:B${chartRow.number}`);
    chartRow.getCell(1).style = excelStyles.sectionHeader;

    const headerRow = worksheet.addRow(['Categoría', 'Valor']);
    headerRow.eachCell(cell => {
      cell.style = excelStyles.tableHeader;
    });

    categories.forEach((cat, i) => {
      const row = worksheet.addRow([cat, values[i]]);
      row.eachCell((cell, index) => {
        cell.style = excelStyles.cell;
        if (index === 2) {
          cell.numFmt = '#,##0';
        }
      });
    });

    worksheet.addRow([]);
  }

  /**
   * 📄 PIE DE PÁGINA
   */
  addFooter(worksheet) {
    const lastRow = worksheet.rowCount + 2;
    const footerRow = worksheet.addRow([
      `Generado: ${formatearFecha(new Date())} | ${institutionInfo.nombre}`
    ]);
    
    worksheet.mergeCells(`A${footerRow.number}:${this._columnToLetter(8)}${footerRow.number}`);
    
    const footerCell = worksheet.getCell(`A${footerRow.number}`);
    footerCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: colors.medium } };
    footerCell.alignment = { horizontal: 'center' };
    
    footerRow.height = 18;
  }

  /**
   * 🔒 PROTEGER HOJA (opcional)
   */
  protectSheet(worksheet, options = {}) {
    worksheet.protect(options.password || '', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      deleteColumns: false,
      deleteRows: false,
      sort: true,
      autoFilter: true,
      ...options
    });
  }

  /**
   * 💾 ESCRIBIR A STREAM
   */
  async write(stream) {
    return this.workbook.xlsx.write(stream);
  }

  /**
   * 💾 ESCRIBIR A BUFFER
   */
  async writeBuffer() {
    return this.workbook.xlsx.writeBuffer();
  }

  /**
   * 🔧 HELPERS PRIVADOS
   */
  _columnToLetter(column) {
    let letter = '';
    while (column > 0) {
      const remainder = (column - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      column = Math.floor((column - 1) / 26);
    }
    return letter;
  }
}

export default ExcelGenerator;