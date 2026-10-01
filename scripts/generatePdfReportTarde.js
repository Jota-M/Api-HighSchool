import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = path.resolve(__dirname, '../data/mensualidades/tarde');
const mdPath = path.join(baseDir, 'README.md');
const htmlPath = path.join(baseDir, 'Reporte_Estudiantes_Pendientes_Turno_Tarde.html');
const pdfPath = path.join(baseDir, 'Reporte_Estudiantes_Pendientes_Turno_Tarde.pdf');

const mdContent = fs.readFileSync(mdPath, 'utf8');

function getBadgeClass(estado) {
  if (!estado) return 'badge-default';
  const e = estado.toLowerCase();
  if (e.includes('anticretico')) return 'badge-purple';
  if (e.includes('retirad') || e.includes('gestion_incorrecta')) return 'badge-danger';
  if (e.includes('no_esta') || e.includes('no_en_boletin') || e.includes('no_figura') || e.includes('sin_pago')) return 'badge-warning';
  if (e.includes('diferido') || e.includes('duplicado') || e.includes('reasignado')) return 'badge-info';
  if (e.includes('ambigua') || e.includes('aclarar') || e.includes('descuento')) return 'badge-amber';
  if (e.includes('beca')) return 'badge-teal';
  if (e.includes('incoherente') || e.includes('irregular') || e.includes('incompleta') || e.includes('faltante') || e.includes('indefinido')) return 'badge-rose';
  return 'badge-secondary';
}

function formatBadgeText(estado) {
  if (!estado) return 'Observado';
  return estado
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let inTable = false;
  let tableHeaderParsed = false;
  let tableRows = [];

  function flushTable() {
    if (!inTable) return;
    html += '<div class=\"table-responsive\"><table class=\"data-table\">';
    if (tableRows.length > 0) {
      html += '<thead>' + tableRows[0] + '</thead>';
      if (tableRows.length > 1) {
        html += '<tbody>' + tableRows.slice(1).join('') + '</tbody>';
      }
    }
    html += '</table></div>\n';
    inTable = false;
    tableHeaderParsed = false;
    tableRows = [];
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (line.startsWith('|') && line.endsWith('|')) {
      inTable = true;
      const rawCols = line.slice(1, -1).split('|').map(c => c.trim());
      
      if (rawCols.every(c => /^:?-+:?$/.test(c))) {
        tableHeaderParsed = true;
        continue;
      }

      if (!tableHeaderParsed) {
        tableRows.push('<tr>' + rawCols.map(c => `<th>${c}</th>`).join('') + '</tr>');
      } else {
        const parsedCols = rawCols.map((c, colIdx) => {
          let content = c
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
          
          if (colIdx === 3 && c.startsWith('`') && c.endsWith('`')) {
            const rawEstado = c.replace(/`/g, '');
            return `<td><span class=\"badge ${getBadgeClass(rawEstado)}\">${formatBadgeText(rawEstado)}</span></td>`;
          }
          return `<td>${content}</td>`;
        });
        tableRows.push('<tr>' + parsedCols.join('') + '</tr>');
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (!line) continue;

    if (line.startsWith('# ')) {
      html += `<h1 class=\"doc-title\">${line.slice(2)}</h1>\n`;
    } else if (line.startsWith('## ')) {
      html += `<h2 class=\"section-title\">${line.slice(3)}</h2>\n`;
    } else if (line.startsWith('### ')) {
      const courseTitle = line.slice(4).replace(/\*\*/g, '');
      html += `<div class=\"course-header\"><h3 class=\"course-title\">${courseTitle}</h3></div>\n`;
    } else if (line.startsWith('> ')) {
      const noteContent = line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<div class=\"callout-note\">${noteContent}</div>\n`;
    } else if (line.startsWith('---')) {
      html += `<hr class=\"divider\" />\n`;
    } else if (/^\d+\.\s/.test(line)) {
      const itemContent = line.replace(/^\d+\.\s/, '')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<div class=\"numbered-item\"><span class=\"item-num\">•</span><span class=\"item-text\">${itemContent}</span></div>\n`;
    } else if (line.startsWith('- ')) {
      const itemContent = line.slice(2)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<p class=\"bullet-item\"><strong>•</strong> ${itemContent}</p>\n`;
    } else {
      const pContent = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<p class=\"body-text\">${pContent}</p>\n`;
    }
  }

  flushTable();
  return html;
}

const bodyContent = mdToHtml(mdContent);

const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte de Estudiantes Observados y Pendientes - Turno Tarde</title>
  <style>
    @page {
      size: letter portrait;
      margin: 14mm 15mm 16mm 15mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.45;
      font-size: 11.5px;
      margin: 0;
      padding: 0;
    }

    .header-banner {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .header-left h1 {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
      letter-spacing: -0.02em;
    }

    .header-left .subtitle {
      font-size: 13px;
      color: #475569;
      font-weight: 600;
      margin: 0;
    }

    .header-right {
      text-align: right;
      font-size: 10px;
      color: #64748b;
    }

    .doc-title { display: none; }

    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 5px;
      margin-top: 22px;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .course-header {
      background: #f8fafc;
      border-left: 4px solid #0284c7;
      padding: 6px 12px;
      margin-top: 20px;
      margin-bottom: 8px;
      border-radius: 0 4px 4px 0;
      page-break-after: avoid;
    }

    .course-title {
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
      margin: 0;
    }

    .body-text {
      margin: 6px 0;
      color: #334155;
    }

    .bullet-item {
      margin: 4px 0;
      color: #334155;
    }

    .numbered-item {
      display: flex;
      margin: 6px 0;
      color: #334155;
    }
    .item-num {
      margin-right: 8px;
      font-weight: bold;
      color: #0284c7;
    }
    .item-text {
      flex: 1;
    }

    .callout-note {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
      padding: 8px 12px;
      border-radius: 6px;
      margin: 10px 0;
      font-size: 10.5px;
    }

    .divider {
      border: 0;
      border-top: 1px solid #f1f5f9;
      margin: 16px 0;
    }

    .table-responsive {
      margin: 8px 0 16px 0;
      page-break-inside: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      page-break-inside: auto;
    }

    .data-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .data-table td {
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      color: #1e293b;
    }

    .data-table tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }

    .data-table tbody tr:nth-child(even) {
      background: #fafafa;
    }

    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 9.5px;
      font-weight: 600;
      white-space: nowrap;
    }

    .badge-purple   { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }
    .badge-danger   { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-warning  { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }
    .badge-info     { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .badge-amber    { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .badge-teal     { background: #ccfbf1; color: #0f766e; border: 1px solid #99f6e4; }
    .badge-rose     { background: #ffe4e6; color: #be123c; border: 1px solid #fecdd3; }
    .badge-secondary{ background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10.5px;
      color: #0f172a;
    }

    .footer {
      margin-top: 30px;
      border-top: 1px solid #cbd5e1;
      padding-top: 10px;
      text-align: center;
      font-size: 9.5px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <div class="header-left">
      <h1>Auditoría de Mensualidades — Estudiantes Observados</h1>
      <div class="subtitle">Colegio LVC • Gestión Escolar 2026 • Turno Tarde (Paralelos A)</div>
    </div>
    <div class="header-right">
      <strong>Fecha de emisión:</strong> 16/09/2026<br>
      <strong>Estado:</strong> Casos Pendientes de Centralización
    </div>
  </div>

  ${bodyContent}

  <div class="footer">
    Informe interno confidencial de control de ingresos y mensualidades — Unidad Educativa LVC • Turno Tarde • Generado para Administración
  </div>
</body>
</html>`;

fs.writeFileSync(htmlPath, fullHtml, 'utf8');
console.log('HTML generado exitosamente:', htmlPath);

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browserExe = fs.existsSync(edgePath) ? edgePath : chromePath;

console.log('Generando PDF mediante:', browserExe);

const proc = spawnSync(browserExe, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  '--print-to-pdf=' + pdfPath,
  htmlPath
]);

if (proc.error) {
  console.error('Error al ejecutar el navegador:', proc.error);
  process.exit(1);
}

setTimeout(() => {
  if (fs.existsSync(pdfPath)) {
    const size = fs.statSync(pdfPath).size;
    console.log(`✅ PDF generado exitosamente: ${pdfPath} (${(size / 1024).toFixed(1)} KB)`);
  } else {
    console.error('❌ El archivo PDF no se encontró después de la ejecución.');
  }
}, 1500);
