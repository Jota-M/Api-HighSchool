// services/reportes/reportStyles.js

/**
 * 🎨 PALETA DE COLORES PROFESIONAL PARA REPORTES
 * Diseño elegante y moderno para institución educativa
 */
export const colors = {
  // Colores principales
  primary: '#1e3a8a',      // Azul marino profundo
  secondary: '#3b82f6',    // Azul medio
  accent: '#60a5fa',       // Azul claro
  
  // Grises
  dark: '#1e293b',         // Texto principal
  medium: '#64748b',       // Texto secundario
  light: '#cbd5e1',        // Bordes
  lighter: '#f1f5f9',      // Fondos alternos
  background: '#f8fafc',   // Fondo general
  
  // Estados
  success: '#10b981',      // Verde
  warning: '#f59e0b',      // Ámbar
  danger: '#ef4444',       // Rojo
  info: '#3b82f6',         // Azul
  
  // Excel
  headerBg: 'FF1e3a8a',    // Azul marino (formato ARGB)
  headerText: 'FFFFFFFF',  // Blanco
  altRowBg: 'FFf8fafc',    // Gris muy claro
};

/**
 * 📐 ESTILOS PARA PDF
 */
export const pdfStyles = {
  // Fuentes
  fonts: {
    title: { name: 'Helvetica-Bold', size: 22 },
    subtitle: { name: 'Helvetica-Bold', size: 16 },
    heading: { name: 'Helvetica-Bold', size: 14 },
    subheading: { name: 'Helvetica-Bold', size: 12 },
    body: { name: 'Helvetica', size: 10 },
    small: { name: 'Helvetica', size: 9 },
    caption: { name: 'Helvetica', size: 8 },
  },
  
  // Espaciado
  spacing: {
    section: 1.2,
    paragraph: 0.6,
    line: 0.3,
  },
  
  // Márgenes
  margins: {
    page: 50,
    section: 15,
  },
  
  // Colores (deben ser strings hex sin #)
  colors: {
    primary: '1e3a8a',
    secondary: '3b82f6',
    text: '1e293b',
    textLight: '64748b',
    border: 'cbd5e1',
    background: 'f8fafc',
  }
};

/**
 * 📊 ESTILOS PARA EXCEL
 */
export const excelStyles = {
  // Estilo del título principal
  title: {
    font: { 
      name: 'Calibri', 
      size: 18, 
      bold: true, 
      color: { argb: colors.headerText } 
    },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.headerBg }
    },
    alignment: { 
      horizontal: 'center', 
      vertical: 'middle' 
    },
    border: {
      bottom: { style: 'thick', color: { argb: colors.headerBg } }
    }
  },
  
  // Estilo de encabezados de sección
  sectionHeader: {
    font: { 
      name: 'Calibri', 
      size: 14, 
      bold: true, 
      color: { argb: colors.headerBg } 
    },
    alignment: { 
      horizontal: 'left', 
      vertical: 'middle' 
    },
    border: {
      bottom: { style: 'thin', color: { argb: colors.light } }
    }
  },
  
  // Estilo de encabezados de tabla
  tableHeader: {
    font: { 
      name: 'Calibri', 
      size: 11, 
      bold: true, 
      color: { argb: colors.headerText } 
    },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.headerBg }
    },
    alignment: { 
      horizontal: 'center', 
      vertical: 'middle',
      wrapText: true
    },
    border: {
      top: { style: 'thin', color: { argb: colors.light } },
      bottom: { style: 'thin', color: { argb: colors.light } },
      left: { style: 'thin', color: { argb: colors.light } },
      right: { style: 'thin', color: { argb: colors.light } }
    }
  },
  
  // Estilo de celdas normales
  cell: {
    font: { 
      name: 'Calibri', 
      size: 10 
    },
    alignment: { 
      horizontal: 'left', 
      vertical: 'middle',
      wrapText: false
    },
    border: {
      top: { style: 'hair', color: { argb: colors.light } },
      bottom: { style: 'hair', color: { argb: colors.light } },
      left: { style: 'hair', color: { argb: colors.light } },
      right: { style: 'hair', color: { argb: colors.light } }
    }
  },
  
  // Estilo de filas alternas
  alternateRow: {
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.altRowBg }
    }
  },
  
  // Estilo de datos estadísticos
  statCell: {
    font: { 
      name: 'Calibri', 
      size: 11, 
      bold: true 
    },
    alignment: { 
      horizontal: 'right', 
      vertical: 'middle' 
    }
  },
  
  // Estilo de etiquetas
  label: {
    font: { 
      name: 'Calibri', 
      size: 10, 
      bold: true 
    },
    alignment: { 
      horizontal: 'left', 
      vertical: 'middle' 
    }
  }
};

/**
 * 🏛️ INFORMACIÓN INSTITUCIONAL
 * Personalizar según la institución
 */
export const institutionInfo = {
  nombre: 'Unidad Educativa Particular La Voz de Cristo',
  nombreCorto: 'LVC',
  direccion: 'Potosí, Bolivia',
  telefono: '+591 69624189 • 76162425 • 68420862',
  email: 'lavozdecristohighschool@gmail.com',
  web: 'www.lavozdecristohighschool.site',
  logo_url: '/logo.png'
};

/**
 * 📋 HELPER: Formatear fechas
 */
export function formatearFecha(fecha, formato = 'largo') {
  if (!fecha) return 'N/A';
  
  const date = new Date(fecha);
  
  if (formato === 'corto') {
    return date.toLocaleDateString('es-BO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }
  
  return date.toLocaleDateString('es-BO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * 📋 HELPER: Formatear teléfono
 */
export function formatearTelefono(telefono) {
  if (!telefono) return 'N/A';
  return telefono.toString().replace(/(\d{1,4})(\d{4})/, '$1-$2');
}

/**
 * 📋 HELPER: Capitalizar texto
 */
export function capitalizar(texto) {
  if (!texto) return '';
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

/**
 * 📋 HELPER: Obtener color por estado
 */
export function getColorEstado(estado) {
  const estadoColores = {
    'activo': colors.success,
    'aprobada': colors.success,
    'convertida': colors.success,
    'en_revision': colors.info,
    'pendiente': colors.warning,
    'documentos_pendientes': colors.warning,
    'rechazada': colors.danger,
    'cancelada': colors.danger,
    'inactivo': colors.medium,
  };
  
  return estadoColores[estado] || colors.medium;
}

export default {
  colors,
  pdfStyles,
  excelStyles,
  institutionInfo,
  formatearFecha,
  formatearTelefono,
  capitalizar,
  getColorEstado
};