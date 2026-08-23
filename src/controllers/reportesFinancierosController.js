// controllers/reportesFinancierosController.js
import { pool } from '../db/pool.js';
import PDFGenerator from '../services/reportes/pdfGenerator.js';
import ExcelGenerator from '../services/reportes/excelGenerator.js';
import { formatearFecha } from '../services/reportes/reportStyles.js';

class ReportesFinancierosController {

    // ══════════════════════════════════════════════
    // HELPER: rango de fechas por defecto (mes actual)
    // ══════════════════════════════════════════════
    static _rango(fecha_desde, fecha_hasta) {
        const hoy = new Date();
        const desde = fecha_desde || new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
        const hasta = fecha_hasta || new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0];
        return { desde, hasta };
    }

    // ══════════════════════════════════════════════
    // 1️⃣  REPORTE DE EGRESOS
    //     GET /api/egreso/exportar/egresos
    //     ?fecha_desde=X&fecha_hasta=Y&formato=pdf|excel&tipo_egreso_id=Z
    // ══════════════════════════════════════════════
    static async exportarEgresos(req, res) {
        try {
            const { formato = 'pdf', tipo_egreso_id } = req.query;
            const { desde, hasta } = ReportesFinancierosController._rango(req.query.fecha_desde, req.query.fecha_hasta);

            let whereConditions = ["e.estado != 'anulado'", 'e.fecha_egreso >= $1', 'e.fecha_egreso <= $2'];
            let queryParams = [desde, hasta];
            let paramCounter = 3;

            if (tipo_egreso_id) {
                whereConditions.push(`e.tipo_egreso_id = $${paramCounter}`);
                queryParams.push(parseInt(tipo_egreso_id));
                paramCounter++;
            }

            const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

            // Resumen por categoría
            const porCategoria = await pool.query(`
        SELECT te.categoria, te.nombre as tipo_egreso, COUNT(e.id) as cantidad, SUM(e.monto_neto) as total
        FROM egreso e
        INNER JOIN tipo_egreso te ON e.tipo_egreso_id = te.id
        ${whereClause}
        GROUP BY te.categoria, te.nombre, te.orden
        ORDER BY te.orden, total DESC
      `, queryParams);

            // Resumen por método de pago
            const porMetodo = await pool.query(`
        SELECT e.metodo_pago, COUNT(e.id) as cantidad, SUM(e.monto_neto) as total
        FROM egreso e
        ${whereClause}
        GROUP BY e.metodo_pago
        ORDER BY total DESC
      `, queryParams);

            // Detalle
            const detalle = await pool.query(`
        SELECT
          e.codigo_egreso, e.fecha_egreso, e.concepto, e.beneficiario,
          e.monto_neto, e.metodo_pago, e.estado,
          te.nombre as tipo_egreso_nombre,
          d.nombres as docente_nombres, d.apellido_paterno as docente_apellido_paterno
        FROM egreso e
        INNER JOIN tipo_egreso te ON e.tipo_egreso_id = te.id
        LEFT JOIN docente d ON e.docente_id = d.id
        ${whereClause}
        ORDER BY e.fecha_egreso DESC
      `, queryParams);

            const totalEgresos = porCategoria.rows.reduce((s, r) => s + parseFloat(r.total), 0);
            const totalTransacciones = porCategoria.rows.reduce((s, r) => s + parseInt(r.cantidad), 0);

            const data = {
                rango: { desde, hasta },
                porCategoria: porCategoria.rows,
                porMetodo: porMetodo.rows,
                detalle: detalle.rows,
                stats: { totalEgresos, totalTransacciones },
            };

            return formato === 'excel'
                ? ReportesFinancierosController._excelEgresos(res, data)
                : ReportesFinancierosController._pdfEgresos(res, data);

        } catch (error) {
            console.error('Error exportar egresos:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // ══════════════════════════════════════════════
    // 2️⃣  BALANCE GENERAL (Ingresos vs. Egresos)
    //     GET /api/financiero/exportar/balance
    //     ?fecha_desde=X&fecha_hasta=Y&formato=pdf|excel
    // ══════════════════════════════════════════════
    static async exportarBalance(req, res) {
        try {
            const { formato = 'pdf' } = req.query;
            const { desde, hasta } = ReportesFinancierosController._rango(req.query.fecha_desde, req.query.fecha_hasta);

            const ingresosTotal = await pool.query(`
        SELECT COUNT(*) as cantidad, COALESCE(SUM(monto_neto), 0) as total
        FROM ingreso
        WHERE NOT anulado AND fecha_ingreso >= $1 AND fecha_ingreso <= $2
      `, [desde, hasta]);

            const egresosTotal = await pool.query(`
        SELECT COUNT(*) as cantidad, COALESCE(SUM(monto_neto), 0) as total
        FROM egreso
        WHERE estado != 'anulado' AND fecha_egreso >= $1 AND fecha_egreso <= $2
      `, [desde, hasta]);

            const ingresosDiarios = await pool.query(`
        SELECT DATE(fecha_ingreso) as fecha, SUM(monto_neto) as total
        FROM ingreso
        WHERE NOT anulado AND fecha_ingreso >= $1 AND fecha_ingreso <= $2
        GROUP BY DATE(fecha_ingreso)
      `, [desde, hasta]);

            const egresosDiarios = await pool.query(`
        SELECT DATE(fecha_egreso) as fecha, SUM(monto_neto) as total
        FROM egreso
        WHERE estado != 'anulado' AND fecha_egreso >= $1 AND fecha_egreso <= $2
        GROUP BY DATE(fecha_egreso)
      `, [desde, hasta]);

            // Combinar por fecha
            const mapa = new Map();
            ingresosDiarios.rows.forEach(r => {
                const key = r.fecha.toISOString().split('T')[0];
                mapa.set(key, { fecha: key, ingresos: parseFloat(r.total), egresos: 0 });
            });
            egresosDiarios.rows.forEach(r => {
                const key = r.fecha.toISOString().split('T')[0];
                const prev = mapa.get(key) || { fecha: key, ingresos: 0, egresos: 0 };
                prev.egresos = parseFloat(r.total);
                mapa.set(key, prev);
            });
            const diario = Array.from(mapa.values())
                .map(d => ({ ...d, neto: d.ingresos - d.egresos }))
                .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

            const totalIngresos = parseFloat(ingresosTotal.rows[0].total);
            const totalEgresos = parseFloat(egresosTotal.rows[0].total);

            const data = {
                rango: { desde, hasta },
                totalIngresos,
                totalEgresos,
                utilidadNeta: totalIngresos - totalEgresos,
                cantidadIngresos: parseInt(ingresosTotal.rows[0].cantidad),
                cantidadEgresos: parseInt(egresosTotal.rows[0].cantidad),
                diario,
            };

            return formato === 'excel'
                ? ReportesFinancierosController._excelBalance(res, data)
                : ReportesFinancierosController._pdfBalance(res, data);

        } catch (error) {
            console.error('Error exportar balance:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // ══════════════════════════════════════════════
    // 🔴 PDF — EGRESOS
    // ══════════════════════════════════════════════
    static _pdfEgresos(res, { rango, porCategoria, porMetodo, detalle, stats }) {
        const pdf = new PDFGenerator({ margin: 40, landscape: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=reporte-egresos-${rango.desde}_${rango.hasta}.pdf`);
        pdf.pipe(res);

        pdf.drawHeader(
            'REPORTE DE EGRESOS',
            `Período: ${formatearFecha(rango.desde, 'corto')} — ${formatearFecha(rango.hasta, 'corto')}`
        );

        pdf.drawInfoBox([
            { label: 'Desde', value: formatearFecha(rango.desde, 'corto') },
            { label: 'Hasta', value: formatearFecha(rango.hasta, 'corto') },
            { label: 'Generado', value: formatearFecha(new Date(), 'largo') },
        ], 3);

        pdf.drawSection('RESUMEN DE EGRESOS');
        pdf.drawStatsGrid([
            { label: 'Total Egresado', value: `Bs ${stats.totalEgresos.toFixed(2)}` },
            { label: 'Total Transacciones', value: stats.totalTransacciones.toString() },
            ...porMetodo.map(m => ({
                label: m.metodo_pago.charAt(0).toUpperCase() + m.metodo_pago.slice(1),
                value: `Bs ${parseFloat(m.total).toFixed(2)}`,
            })),
        ], 3);

        pdf.drawSection('EGRESOS POR CATEGORÍA');
        pdf.drawTable(
            ['Categoría', 'Tipo de Egreso', 'Cantidad', 'Total'],
            porCategoria.map(r => [
                r.categoria,
                r.tipo_egreso,
                r.cantidad.toString(),
                `Bs ${parseFloat(r.total).toFixed(2)}`,
            ]),
            { columnWidths: [140, 220, 100, 130] }
        );

        pdf.drawSection('DETALLE DE EGRESOS');
        const headers = ['#', 'Código', 'Fecha', 'Concepto', 'Beneficiario', 'Tipo', 'Método', 'Monto'];
        const colWidths = [25, 85, 70, 150, 130, 110, 80, 85];

        const rows = detalle.map((e, i) => [
            (i + 1).toString(),
            e.codigo_egreso,
            formatearFecha(e.fecha_egreso, 'corto'),
            e.concepto,
            e.beneficiario ?? (e.docente_nombres ? `${e.docente_apellido_paterno}, ${e.docente_nombres}` : '—'),
            e.tipo_egreso_nombre,
            e.metodo_pago,
            `Bs ${parseFloat(e.monto_neto).toFixed(2)}`,
        ]);

        pdf.drawTable(headers, rows, { columnWidths: colWidths });
        pdf.end();
    }

    // ══════════════════════════════════════════════
    // 🟢 EXCEL — EGRESOS
    // ══════════════════════════════════════════════
    static async _excelEgresos(res, { rango, porCategoria, porMetodo, detalle, stats }) {
        const excel = new ExcelGenerator();
        const ws = excel.createSheet('Egresos');

        excel.addTitle(ws, 'REPORTE DE EGRESOS', `Período: ${formatearFecha(rango.desde, 'corto')} — ${formatearFecha(rango.hasta, 'corto')}`);
        excel.addInfoBox(ws, [
            { label: 'Desde', value: formatearFecha(rango.desde, 'corto') },
            { label: 'Hasta', value: formatearFecha(rango.hasta, 'corto') },
            { label: 'Generado', value: formatearFecha(new Date(), 'largo') },
        ]);
        excel.addStats(ws, [
            { label: 'Total Egresado', value: `Bs ${stats.totalEgresos.toFixed(2)}` },
            { label: 'Total Transacciones', value: stats.totalTransacciones.toString() },
            ...porMetodo.map(m => ({
                label: m.metodo_pago.charAt(0).toUpperCase() + m.metodo_pago.slice(1),
                value: `Bs ${parseFloat(m.total).toFixed(2)}`,
            })),
        ], 3);

        excel.addTable(ws,
            ['Categoría', 'Tipo de Egreso', 'Cantidad', 'Total (Bs)'],
            porCategoria.map(r => [r.categoria, r.tipo_egreso, parseInt(r.cantidad), parseFloat(parseFloat(r.total).toFixed(2))]),
            { sectionTitle: 'EGRESOS POR CATEGORÍA', columnWidths: [16, 26, 12, 16] }
        );

        const headers = ['#', 'Código', 'Fecha', 'Concepto', 'Beneficiario', 'Tipo de Egreso', 'Método', 'Monto (Bs)'];
        const rows = detalle.map((e, i) => [
            i + 1,
            e.codigo_egreso,
            formatearFecha(e.fecha_egreso, 'corto'),
            e.concepto,
            e.beneficiario ?? (e.docente_nombres ? `${e.docente_apellido_paterno}, ${e.docente_nombres}` : '—'),
            e.tipo_egreso_nombre,
            e.metodo_pago,
            parseFloat(parseFloat(e.monto_neto).toFixed(2)),
        ]);

        excel.addTable(ws, headers, rows, {
            sectionTitle: 'DETALLE DE EGRESOS',
            columnWidths: [5, 14, 12, 30, 24, 20, 14, 14],
        });
        excel.addFooter(ws);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=reporte-egresos-${rango.desde}_${rango.hasta}.xlsx`);
        await excel.write(res);
        res.end();
    }

    // ══════════════════════════════════════════════
    // 🔴 PDF — BALANCE GENERAL
    // ══════════════════════════════════════════════
    static _pdfBalance(res, { rango, totalIngresos, totalEgresos, utilidadNeta, cantidadIngresos, cantidadEgresos, diario }) {
        const pdf = new PDFGenerator({ margin: 40, landscape: false });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=balance-general-${rango.desde}_${rango.hasta}.pdf`);
        pdf.pipe(res);

        pdf.drawHeader(
            'BALANCE GENERAL',
            `Período: ${formatearFecha(rango.desde, 'corto')} — ${formatearFecha(rango.hasta, 'corto')}`
        );

        pdf.drawInfoBox([
            { label: 'Desde', value: formatearFecha(rango.desde, 'corto') },
            { label: 'Hasta', value: formatearFecha(rango.hasta, 'corto') },
            { label: 'Generado', value: formatearFecha(new Date(), 'largo') },
        ], 3);

        pdf.drawSection('RESUMEN FINANCIERO');
        pdf.drawStatsGrid([
            { label: 'Total Ingresos', value: `Bs ${totalIngresos.toFixed(2)}` },
            { label: 'Total Egresos', value: `Bs ${totalEgresos.toFixed(2)}` },
            { label: 'Utilidad Neta', value: `Bs ${utilidadNeta.toFixed(2)}` },
            { label: 'Transacciones Ingreso', value: cantidadIngresos.toString() },
            { label: 'Transacciones Egreso', value: cantidadEgresos.toString() },
            {
                label: 'Margen',
                value: totalIngresos > 0 ? `${((utilidadNeta / totalIngresos) * 100).toFixed(1)}%` : '—',
            },
        ], 3);

        pdf.drawSection('COMPARATIVA DIARIA');
        pdf.drawTable(
            ['Fecha', 'Ingresos', 'Egresos', 'Neto'],
            diario.map(d => [
                formatearFecha(d.fecha, 'corto'),
                `Bs ${d.ingresos.toFixed(2)}`,
                `Bs ${d.egresos.toFixed(2)}`,
                `Bs ${d.neto.toFixed(2)}`,
            ]),
            { columnWidths: [130, 130, 130, 130] }
        );

        pdf.end();
    }

    // ══════════════════════════════════════════════
    // 🟢 EXCEL — BALANCE GENERAL
    // ══════════════════════════════════════════════
    static async _excelBalance(res, { rango, totalIngresos, totalEgresos, utilidadNeta, cantidadIngresos, cantidadEgresos, diario }) {
        const excel = new ExcelGenerator();
        const ws = excel.createSheet('Balance General');

        excel.addTitle(ws, 'BALANCE GENERAL', `Período: ${formatearFecha(rango.desde, 'corto')} — ${formatearFecha(rango.hasta, 'corto')}`);
        excel.addInfoBox(ws, [
            { label: 'Desde', value: formatearFecha(rango.desde, 'corto') },
            { label: 'Hasta', value: formatearFecha(rango.hasta, 'corto') },
            { label: 'Generado', value: formatearFecha(new Date(), 'largo') },
        ]);
        excel.addStats(ws, [
            { label: 'Total Ingresos', value: `Bs ${totalIngresos.toFixed(2)}` },
            { label: 'Total Egresos', value: `Bs ${totalEgresos.toFixed(2)}` },
            { label: 'Utilidad Neta', value: `Bs ${utilidadNeta.toFixed(2)}` },
            { label: 'Transacciones Ingreso', value: cantidadIngresos.toString() },
            { label: 'Transacciones Egreso', value: cantidadEgresos.toString() },
            {
                label: 'Margen',
                value: totalIngresos > 0 ? `${((utilidadNeta / totalIngresos) * 100).toFixed(1)}%` : '—',
            },
        ], 3);

        excel.addTable(ws,
            ['Fecha', 'Ingresos (Bs)', 'Egresos (Bs)', 'Neto (Bs)'],
            diario.map(d => [
                formatearFecha(d.fecha, 'corto'),
                parseFloat(d.ingresos.toFixed(2)),
                parseFloat(d.egresos.toFixed(2)),
                parseFloat(d.neto.toFixed(2)),
            ]),
            { sectionTitle: 'COMPARATIVA DIARIA', columnWidths: [16, 16, 16, 16] }
        );
        excel.addFooter(ws);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=balance-general-${rango.desde}_${rango.hasta}.xlsx`);
        await excel.write(res);
        res.end();
    }
}

export default ReportesFinancierosController;