// controllers/pagoMensualidadPDFPadreController.js
// Recibo digital para padres - sin campos de firma, con sello "Comprobante Digital"
import PDFDocument from 'pdfkit';
import { PagoMensualidad } from '../models/Payment.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PagoMensualidadPDFPadreController {
    /**
     * GET /api/pago-mensualidad/:id/pdf-padre
     * Solo accesible por el padre dueño del pago (verificar req.user)
     */
    static async generarReciboPadre(req, res) {
        try {
            const { id } = req.params;

            const pago = await PagoMensualidad.findById(id);

            if (!pago) {
                return res.status(404).json({ success: false, message: 'Pago no encontrado' });
            }

            // Verificar que el pago pertenece a un hijo del padre autenticado
            // req.user.id es el usuario del padre; comparar contra pago.padre_id o similar
            // Ajustá este check según tu modelo de datos
            if (req.user?.rol === 'padre' && pago.padre_usuario_id && pago.padre_usuario_id !== req.user.id) {
                return res.status(403).json({ success: false, message: 'Acceso denegado' });
            }

            const doc = new PDFDocument({
                size: 'LETTER',
                margins: { top: 30, bottom: 30, left: 40, right: 40 },
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `inline; filename=Comprobante_${pago.codigo_pago}.pdf`
            );

            doc.pipe(res);
            PagoMensualidadPDFPadreController.generarContenido(doc, pago);
            doc.end();

        } catch (error) {
            console.error('Error al generar recibo para padre:', error);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Error al generar recibo: ' + error.message });
            }
        }
    }

    static generarContenido(doc, pago) {
        // ─── Paleta (misma que el admin) ──────────────────────────────────────────
        const darkBlue = '#1e3a8a';
        const yellowBorder = '#fbbf24';
        const darkGray = '#1f2937';
        const lightGray = '#6b7280';
        const green = '#10b981';

        const monto = parseFloat(pago.monto_pagado);

        // ─── Marca de agua ────────────────────────────────────────────────────────
        const watermarkPath = path.join(__dirname, '../public/logo.png');
        if (fs.existsSync(watermarkPath)) {
            try {
                doc.save();
                doc.opacity(0.04).image(watermarkPath, 200, 80, { width: 180, height: 180 });
                doc.restore();
            } catch (_) { }
        }

        // ─── Header ───────────────────────────────────────────────────────────────
        doc.rect(40, 30, 532, 4).fill(darkBlue);
        doc.rect(40, 34, 532, 2).fill(yellowBorder);

        const logoPath = path.join(__dirname, '../public/logo.png');
        let logoX = 50;
        if (fs.existsSync(logoPath)) {
            try {
                doc.image(logoPath, 50, 42, { width: 28, height: 28 });
                logoX = 85;
            } catch (_) { }
        }

        doc.fontSize(8).font('Helvetica-Bold').fillColor(darkBlue)
            .text('U.E.P. La Voz de Cristo', logoX, 44);
        doc.fontSize(6).font('Helvetica').fillColor(lightGray)
            .text('Potosí - Bolivia | Sistema 10 Meses', logoX, 56);

        const codigoShort = pago.codigo_pago.split('-')[1];
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#ef4444')
            .text(`N° ${codigoShort}-${String(pago.id).padStart(4, '0')}`, 480, 44);

        // ─── Título ───────────────────────────────────────────────────────────────
        let y = 78;
        doc.fontSize(11).font('Helvetica-Bold').fillColor(darkBlue)
            .text('COMPROBANTE DE PAGO DIGITAL', 40, y, { align: 'center', width: 532 });

        y += 14;
        // Badge "Verificado" — reemplaza las firmas
        doc.fontSize(7).font('Helvetica-Bold').fillColor(green)
            .text('✓ PAGO REGISTRADO Y VERIFICADO', 40, y, { align: 'center', width: 532 });

        y += 16;
        doc.moveTo(180, y).lineTo(432, y).lineWidth(1).strokeColor(yellowBorder).stroke();
        y += 10;

        // Fecha y monto en la misma línea
        doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Fecha:', 50, y);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
            .text(
                new Date(pago.fecha_pago).toLocaleDateString('es-BO', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                }),
                80, y
            );
        doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Monto:', 430, y);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(darkBlue)
            .text(`Bs. ${monto.toFixed(2)}`, 460, y);

        y += 18;

        // ─── Datos del estudiante ─────────────────────────────────────────────────
        doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Estudiante:', 50, y);
        y += 10;
        const nombreCompleto = pago.apellidos
            ? `${pago.nombres} ${pago.apellidos}`
            : pago.nombres;
        doc.fontSize(9).font('Helvetica-Bold').fillColor(darkGray)
            .text(nombreCompleto, 50, y, { width: 532 });
        y += 12;
        doc.fontSize(7).font('Helvetica').fillColor(lightGray)
            .text(`Código: ${pago.estudiante_codigo}`, 50, y);
        y += 18;

        // ─── Concepto ─────────────────────────────────────────────────────────────
        doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Por concepto de:', 50, y);
        y += 10;

        const esPagoAnual = pago.mes_correspondiente === 'Pago Anual Completo (10 meses)' || !pago.numero_cuota;
        const concepto = esPagoAnual
            ? 'Pago Anual Completo - 10 Meses de Mensualidades Escolares (con 10% descuento)'
            : 'Pago de Mensualidades Escolares (Sistema 10 Meses)';
        doc.fontSize(8).font('Helvetica-Bold').fillColor(darkGray)
            .text(concepto, 50, y, { width: 432 });
        y += 18;

        // ─── Detalle del pago ─────────────────────────────────────────────────────
        doc.fontSize(7).font('Helvetica-Bold').fillColor(lightGray)
            .text('Mensualidad', 50, y)
            .text('Monto', 500, y);
        y += 12;
        doc.moveTo(50, y).lineTo(572, y).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
        y += 6;

        const mesTexto = esPagoAnual
            ? 'Año Completo - 10 Meses (Febrero a Noviembre)'
            : pago.numero_cuota
                ? `${pago.mes_correspondiente} - Cuota ${pago.numero_cuota}/10`
                : pago.mes_correspondiente;

        doc.fontSize(7).font('Helvetica').fillColor(darkGray).text(mesTexto, 50, y);
        doc.fontSize(7).font('Helvetica-Bold').fillColor(darkBlue)
            .text(`Bs. ${monto.toFixed(2)}`, 500, y);
        y += 14;

        if (esPagoAnual) {
            doc.fontSize(6).font('Helvetica-Oblique').fillColor(green)
                .text('✓ Incluye descuento del 10% por pago anual completo', 50, y);
            y += 12;
        }

        // ─── Método de pago ───────────────────────────────────────────────────────
        const metodoPagoTexto = {
            transferencia: 'Transferencia Bancaria',
            efectivo: 'Efectivo',
            qr: 'Pago QR',
            tarjeta: 'Tarjeta',
        };
        doc.fontSize(6).font('Helvetica').fillColor(lightGray)
            .text(`Método de pago: ${metodoPagoTexto[pago.metodo_pago] || pago.metodo_pago}`, 50, y);
        if (pago.numero_comprobante) {
            doc.text(` | Comprobante: ${pago.numero_comprobante}`, { continued: true });
        }
        y += 14;

        // ─── Cajas de totales ─────────────────────────────────────────────────────
        const boxY = y;
        const boxH = 25;

        doc.rect(50, boxY, 110, boxH).strokeColor(lightGray).lineWidth(0.5).stroke();
        doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Total pagado', 60, boxY + 5);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(darkBlue)
            .text(`Bs. ${monto.toFixed(2)}`, 60, boxY + 14);

        doc.rect(175, boxY, 110, boxH).strokeColor(lightGray).lineWidth(0.5).stroke();
        doc.fontSize(7).font('Helvetica').fillColor(lightGray).text('Saldo pendiente', 185, boxY + 5);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(green).text('Bs. 0.00', 185, boxY + 14);

        y = boxY + boxH + 18;

        // ─── Monto en texto ───────────────────────────────────────────────────────
        doc.fontSize(6).font('Helvetica').fillColor(lightGray).text('Monto en texto:', 50, y);
        y += 9;
        doc.fontSize(7).font('Helvetica-Bold').fillColor(darkGray)
            .text(PagoMensualidadPDFPadreController.numeroATexto(monto), 50, y, { width: 522 });
        y += 18;

        // ─── Sello digital (reemplaza las firmas) ─────────────────────────────────
        // Caja verde redondeada centrada — indica autenticidad sin necesitar firma física
        const selloW = 260;
        const selloH = 52;
        const selloX = (612 - selloW) / 2; // centrado en página LETTER
        const selloY = y;

        doc.roundedRect(selloX, selloY, selloW, selloH, 8)
            .strokeColor(green).lineWidth(1).stroke();

        doc.fontSize(8).font('Helvetica-Bold').fillColor(green)
            .text('COMPROBANTE DIGITAL VÁLIDO', selloX, selloY + 7, { width: selloW, align: 'center' });

        doc.fontSize(6).font('Helvetica').fillColor(lightGray)
            .text(
                `Generado: ${new Date().toLocaleDateString('es-BO')} ${new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`,
                selloX, selloY + 20, { width: selloW, align: 'center' }
            );

        doc.fontSize(6).font('Helvetica').fillColor(lightGray)
            .text(
                `Ref: ${pago.codigo_pago} | ID: ${String(pago.id).padStart(6, '0')}`,
                selloX, selloY + 32, { width: selloW, align: 'center' }
            );

        // Nota informativa debajo del sello
        y = selloY + selloH + 10;
        doc.fontSize(5.5).font('Helvetica-Oblique').fillColor(lightGray)
            .text(
                'Este comprobante es generado automáticamente por el sistema LVC. No requiere firma física.',
                40, y, { align: 'center', width: 532 }
            );

        // ─── Footer ───────────────────────────────────────────────────────────────
        doc.fontSize(5).font('Helvetica').fillColor(lightGray)
            .text(
                `Sistema 10 Meses | U.E.P. La Voz de Cristo | ${new Date().getFullYear()}`,
                40, 380, { align: 'center', width: 532 }
            );

        doc.rect(40, 393, 532, 2).fill(yellowBorder);
        doc.rect(40, 395, 532, 4).fill(darkBlue);
    }

    static numeroATexto(numero) {
        const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
        const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
        const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
        const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

        const entero = Math.floor(numero);
        const decimal = Math.round((numero - entero) * 100);
        let texto = '';

        if (entero === 0) texto = 'CERO';
        else if (entero === 100) texto = 'CIEN';
        else if (entero < 10) texto = unidades[entero];
        else if (entero < 20) texto = especiales[entero - 10];
        else if (entero < 100) {
            const dec = Math.floor(entero / 10), uni = entero % 10;
            texto = decenas[dec];
            if (uni > 0) texto += (entero < 30 && entero > 20) ? 'I' : ' Y ';
            if (uni > 0) texto += unidades[uni];
        } else if (entero < 1000) {
            const cen = Math.floor(entero / 100), resto = entero % 100;
            texto = centenas[cen];
            if (resto > 0) texto += ' ' + this.numeroATexto(resto).split(' ')[0];
        } else if (entero < 1000000) {
            const miles = Math.floor(entero / 1000), resto = entero % 1000;
            texto = miles === 1 ? 'MIL' : this.numeroATexto(miles).split(' ')[0] + ' MIL';
            if (resto > 0) texto += ' ' + this.numeroATexto(resto).split(' ')[0];
        }

        return `${texto} BOLIVIANOS ${decimal.toString().padStart(2, '0')}/100`;
    }
}

export default PagoMensualidadPDFPadreController;