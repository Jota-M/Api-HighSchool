/**
 * cargarMensualidadesCurso.js
 *
 * Carga las mensualidades históricas (ya cobradas) de UN curso hacia
 * mensualidad / pago_mensualidad / pago_anual_completo, a partir de un
 * JSON de datos ya "limpio" (ver 1ra-seccion-b.json / primero-primaria-b.json
 * como referencia).
 *
 * Además, una vez cargados los pagos de los estudiantes que sí tienen
 * historial en el JSON, genera las mensualidades (todas en 'pendiente',
 * sin pagos) para el RESTO de estudiantes matriculados en el mismo
 * paralelo — esos alumnos no tienen historial que cargar, pero igual
 * necesitan sus 10 cuotas generadas para que el sistema los muestre
 * con deuda pendiente hacia adelante.
 *
 * INGRESOS TARDÍOS / TRASPASOS: si un estudiante trae "mes_ingreso" en
 * el JSON (ej. entró en marzo o mayo), NO se usa generar_mensualidades()
 * — esa función siempre arranca en Febrero y no acepta mes de inicio.
 * En su lugar se generan las cuotas a mano desde su mes de ingreso
 * hasta Noviembre (mismo cierre que todos los demás), con numero_cuota
 * 1..N relativo a su fecha de entrada.
 *
 * BECADOS: un estudiante puede traer un bloque "beca" en el JSON:
 *   "beca": {
 *     "es_becado": true,
 *     "tipo_beca": "texto libre",
 *     "porcentaje_beca": 100,
 *     "cuota_pagada": 2,
 *     "cuotas_exoneradas": [1,3,4,5,6,7,8,9,10]
 *   }
 * Esto NO inserta ningún pago falso: marca matricula.es_becado = true
 * (con su porcentaje_beca y tipo_beca), y para cada cuota en
 * "cuotas_exoneradas" actualiza la mensualidad correspondiente con
 * monto_beca = monto_original, monto_final = 0 y estado = 'cancelado'
 * (estado ya contemplado por el CHECK de la tabla mensualidad). No
 * asume ningún orden entre la cuota pagada y las exoneradas — el
 * becado puede pagar cualquier cuota del año, no necesariamente la
 * primera. Es idempotente: si una cuota ya está 'cancelado' se salta;
 * si ya tiene un pago registrado ('pagado'/'pagado_parcial') se lanza
 * error en vez de pisarlo silenciosamente.
 *
 * El paralelo se detecta AUTOMÁTICAMENTE: se toma el paralelo_id de
 * la matrícula del primer estudiante del JSON que se resuelva bien
 * (todos los estudiantes del curso pertenecen al mismo paralelo, así
 * que no hace falta escribirlo a mano en ningún lado).
 *
 * IDEMPOTENTE: si un pago ya fue insertado en una corrida anterior
 * (mismo codigo_pago, o mismo pago anual para la matrícula), se
 * detecta y se SALTA sin duplicar ni fallar. Lo mismo aplica a la
 * generación de mensualidades: si un estudiante ya tiene sus cuotas
 * generadas (por el paso de pagos o por una corrida anterior), no se
 * vuelven a generar.
 *
 * Uso:
 *   node scripts/cargarMensualidadesCurso.js data/1ra-seccion-b.json
 *
 * Requiere:
 *   - REGISTRADO_POR: id del usuario admin que figura como quien
 *     registró estos pagos históricos. ⚠️ CONFIRMAR el valor de abajo.
 */

import { readFile } from 'fs/promises';
import { pool } from '../src/db/pool.js';

const REGISTRADO_POR = 1; // ⚠️ CONFIRMAR: id del usuario admin

const MESES_CUOTA = [
    'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre'
];

function log(icon, msg) {
    console.log(`${icon} ${msg}`);
}

async function resolverMatricula(client, ci, periodoAcademicoId) {
    const est = await client.query(
        `SELECT id, nombres, apellidos FROM estudiante WHERE ci = $1 AND deleted_at IS NULL`,
        [ci]
    );
    if (est.rows.length === 0) {
        throw new Error(`No existe estudiante con CI ${ci}`);
    }
    if (est.rows.length > 1) {
        throw new Error(`CI ${ci} matchea más de un estudiante — revisar duplicado`);
    }
    const estudianteId = est.rows[0].id;

    const mat = await client.query(
        `SELECT id, estado, paralelo_id FROM matricula
     WHERE estudiante_id = $1 AND periodo_academico_id = $2 AND deleted_at IS NULL`,
        [estudianteId, periodoAcademicoId]
    );
    if (mat.rows.length === 0) {
        throw new Error(`CI ${ci}: no tiene matrícula para el período ${periodoAcademicoId}`);
    }
    return {
        estudianteId,
        matriculaId: mat.rows[0].id,
        estadoMatricula: mat.rows[0].estado,
        paraleloId: mat.rows[0].paralelo_id
    };
}

async function asegurarMensualidadesGeneradas(client, matriculaId, periodoAcademicoId, nivelAcademicoId) {
    const existentes = await client.query(
        `SELECT numero_cuota, id, mes_correspondiente FROM mensualidad WHERE matricula_id = $1`,
        [matriculaId]
    );
    if (existentes.rows.length > 0) {
        const map = {};
        for (const row of existentes.rows) {
            map[row.numero_cuota] = row.id;
            if (row.mes_correspondiente) {
                map[row.mes_correspondiente.toLowerCase().trim()] = row.id;
            }
        }
        return { map, generadasAhora: false };
    }
    const res = await client.query(
        `SELECT * FROM generar_mensualidades($1, $2, $3, 0)`,
        [matriculaId, periodoAcademicoId, nivelAcademicoId]
    );
    const map = {};
    for (const row of res.rows) {
        map[row.numero_cuota] = row.mensualidad_id;
        const mesNombre = MESES_CUOTA[row.numero_cuota - 1];
        if (mesNombre) map[mesNombre.toLowerCase()] = row.mensualidad_id;
    }
    return { map, generadasAhora: true };
}

async function asegurarMensualidadesConIngresoTardio(client, matriculaId, periodoAcademicoId, nivelAcademicoId, mesIngreso) {
    // Traspasos / ingresos a mitad de año: cuotas generadas a mano desde el
    // mes de ingreso hasta Noviembre (cierre escolar de 10 cuotas).
    // Como es traspaso, NO cuenta con cuota 1 (Febrero). Sus cuotas comienzan
    // en el mes de ingreso (ej. Marzo = cuota 2, Mayo = cuota 4) hasta Noviembre (cuota 10).
    const existentes = await client.query(
        `SELECT numero_cuota, id, mes_correspondiente FROM mensualidad WHERE matricula_id = $1`,
        [matriculaId]
    );
    if (existentes.rows.length > 0) {
        const map = {};
        for (const row of existentes.rows) {
            map[row.numero_cuota] = row.id;
            if (row.mes_correspondiente) {
                map[row.mes_correspondiente.toLowerCase().trim()] = row.id;
            }
        }
        return { map, generadasAhora: false };
    }

    const costo = await client.query(
        `SELECT monto_base FROM costo_mensualidad
     WHERE periodo_academico_id = $1 AND nivel_academico_id = $2 AND activo = true LIMIT 1`,
        [periodoAcademicoId, nivelAcademicoId]
    );
    if (costo.rows.length === 0) throw new Error('No existe costo_mensualidad para este período/nivel');
    const montoBase = costo.rows[0].monto_base;

    const periodo = await client.query(
        `SELECT fecha_inicio FROM periodo_academico WHERE id = $1`, [periodoAcademicoId]
    );
    const fechaInicioPeriodo = periodo.rows[0].fecha_inicio;
    const anio = fechaInicioPeriodo.getFullYear ? fechaInicioPeriodo.getFullYear() : new Date(fechaInicioPeriodo).getFullYear();

    const indiceInicio = MESES_CUOTA.indexOf(mesIngreso.toLowerCase().trim());
    if (indiceInicio === -1) throw new Error(`mes_ingreso inválido: '${mesIngreso}'`);

    const mesesAGenerar = MESES_CUOTA.slice(indiceInicio); // desde el mes de ingreso hasta noviembre
    const map = {};
    for (let i = 0; i < mesesAGenerar.length; i++) {
        const mes = mesesAGenerar[i];
        // En el calendario escolar: Febrero=1, Marzo=2, ..., Noviembre=10
        const numeroCuota = indiceInicio + i + 1;
        const mesCalendario = indiceInicio + i + 1; // +1 porque MESES_CUOTA[0]=febrero=mes 2
        const fechaVencimiento = new Date(anio, mesCalendario, 9);

        const res = await client.query(
            `INSERT INTO mensualidad
         (matricula_id, numero_cuota, mes_correspondiente, fecha_vencimiento,
          monto_original, monto_beca, monto_recargo, monto_final, estado)
       VALUES ($1, $2, $3, $4, $5, 0, 0, $5, 'pendiente')
       RETURNING id`,
            [matriculaId, numeroCuota, mes, fechaVencimiento, montoBase]
        );
        map[numeroCuota] = res.rows[0].id;
        map[mes.toLowerCase()] = res.rows[0].id;
    }
    return { map, generadasAhora: true };
}

/**
 * Resuelve la mensualidad_id y el numero_cuota del calendario escolar
 * correspondiente a un pago, soportando tanto estudiantes regulares como
 * estudiantes con traspaso / ingreso tardío.
 */
function resolverMensualidadParaPago(cuotaIdMap, { numeroCuota, mesCorrespondiente, mesIngreso }) {
    // 1. Si viene mes_correspondiente (ej. 'Marzo', 'Mayo'), buscarlo directamente por mes
    if (mesCorrespondiente) {
        const mesKey = String(mesCorrespondiente).toLowerCase().trim();
        if (cuotaIdMap[mesKey]) {
            const calCuota = MESES_CUOTA.indexOf(mesKey) + 1;
            return {
                mensualidadId: cuotaIdMap[mesKey],
                numeroCuota: calCuota > 0 ? calCuota : numeroCuota
            };
        }
    }

    // 2. Si el estudiante tiene traspaso (mes_ingreso):
    if (mesIngreso && numeroCuota) {
        const indiceInicio = MESES_CUOTA.indexOf(String(mesIngreso).toLowerCase().trim());
        if (indiceInicio !== -1) {
            const num = Number(numeroCuota);
            const totalCuotasEstudiante = 10 - indiceInicio;

            // Si el número está en el rango relativo del estudiante (1..totalCuotasEstudiante),
            // es relativo a su fecha de ingreso (ej: Mayo tiene 7 cuotas -> 1=Mayo, 2=Junio... 7=Noviembre)
            if (num >= 1 && num <= totalCuotasEstudiante) {
                const calCuota = num + indiceInicio;
                if (cuotaIdMap[calCuota]) {
                    return {
                        mensualidadId: cuotaIdMap[calCuota],
                        numeroCuota: calCuota
                    };
                }
                const mesNombre = MESES_CUOTA[calCuota - 1];
                if (mesNombre && cuotaIdMap[mesNombre.toLowerCase()]) {
                    return {
                        mensualidadId: cuotaIdMap[mesNombre.toLowerCase()],
                        numeroCuota: calCuota
                    };
                }
            }

            // Si el número ya viene como absoluto del calendario escolar (ej. 4..10 para Mayo)
            if (cuotaIdMap[num]) {
                return {
                    mensualidadId: cuotaIdMap[num],
                    numeroCuota: num
                };
            }
        }
    }

    // 3. Estudiante regular (sin mes_ingreso) o cuota directa
    if (numeroCuota && cuotaIdMap[numeroCuota]) {
        return {
            mensualidadId: cuotaIdMap[numeroCuota],
            numeroCuota: Number(numeroCuota)
        };
    }

    return { mensualidadId: null, numeroCuota: Number(numeroCuota) || null };
}

function generarCodigoPago(matriculaId, numeroCuota, sufijo = '') {
    return `SEED-${matriculaId}-${numeroCuota}${sufijo ? '-' + sufijo : ''}`;
}

async function yaExistePagoCuota(client, codigoPago) {
    const res = await client.query(
        `SELECT id FROM pago_mensualidad WHERE codigo_pago = $1`,
        [codigoPago]
    );
    return res.rows.length > 0;
}

async function yaExistePagoAnual(client, matriculaId) {
    const res = await client.query(
        `SELECT id FROM pago_anual_completo WHERE matricula_id = $1`,
        [matriculaId]
    );
    return res.rows.length > 0;
}

async function insertarPagoCuota(client, { mensualidadId, matriculaId, numeroCuota, monto, metodoPago, numeroComprobante, entregoFactura, numeroFactura, fechaPago, sufijoCodigo, nota }) {
    // IMPORTANTE: en el Excel original, el prefijo indica el TIPO de documento, no forma
    // parte del número — 'E - 266' = se dio FACTURA n° 266 (entrego_factura=true,
    // numero_factura='266'); 'C - 2321' = solo COMPROBANTE n° 2321 (numero_comprobante='2321').
    // Cuando el Excel trae AMBOS documentos para el mismo pago, se cargan los dos juntos.
    // Cuando trae un comprobante doble/ambiguo ('C-1707 - C-1749'), se registran ambos
    // números juntos separados por guion en numero_comprobante, con nota de observación.
    const codigoPago = generarCodigoPago(matriculaId, numeroCuota, sufijoCodigo);

    if (await yaExistePagoCuota(client, codigoPago)) {
        // Si ya existe pero trae nota, actualizar la observación si estaba vacía o con texto por defecto
        if (nota) {
            await client.query(
                `UPDATE pago_mensualidad
                 SET observaciones = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE codigo_pago = $2 AND (observaciones IS NULL OR observaciones = 'Comprobante/factura pendiente de confirmar (carga histórica)')`,
                [nota, codigoPago]
            );
            await client.query(
                `UPDATE mensualidad
                 SET observaciones = CASE
                     WHEN observaciones IS NULL OR observaciones = '' THEN $2
                     WHEN observaciones LIKE '%' || $2 || '%' THEN observaciones
                     ELSE observaciones || ' | ' || $2
                 END, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [mensualidadId, nota]
            );
        }
        return { saltado: true, codigoPago };
    }

    const sinDocumento = !numeroComprobante && !numeroFactura;
    const obsFinal = nota || (sinDocumento ? 'Comprobante/factura pendiente de confirmar (carga histórica)' : null);

    await client.query(
        `INSERT INTO pago_mensualidad
       (codigo_pago, mensualidad_id, monto_pagado, metodo_pago, numero_comprobante,
        entrego_factura, numero_factura, fecha_pago, registrado_por, observaciones)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
            codigoPago,
            mensualidadId,
            monto,
            metodoPago,
            numeroComprobante || null,
            !!entregoFactura,
            numeroFactura || null,
            fechaPago,
            REGISTRADO_POR,
            obsFinal
        ]
    );

    if (nota) {
        await client.query(
            `UPDATE mensualidad
             SET observaciones = CASE
                 WHEN observaciones IS NULL OR observaciones = '' THEN $2
                 WHEN observaciones LIKE '%' || $2 || '%' THEN observaciones
                 ELSE observaciones || ' | ' || $2
             END, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [mensualidadId, nota]
        );
    }

    return { saltado: false, codigoPago };
}

async function registrarPagoAnual(client, { matriculaId, montoTotal, metodoPago, numeroComprobante, entregoFactura, numeroFactura, fechaPago, nota }) {
    if (await yaExistePagoAnual(client, matriculaId)) {
        if (nota) {
            await client.query(
                `UPDATE pago_anual_completo
                 SET observaciones = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE matricula_id = $2`,
                [nota, matriculaId]
            );
        }
        return { saltado: true, pagoId: null };
    }

    const obsFinal = nota || 'Pago anual completo - carga histórica';

    const res = await client.query(
        `SELECT registrar_pago_anual_completo($1, $2, $3, $4, $5, $6, $7, $8) AS pago_id`,
        [
            matriculaId,
            montoTotal,
            metodoPago,
            REGISTRADO_POR,
            numeroComprobante || null,
            !!entregoFactura,
            numeroFactura || null,
            obsFinal
        ]
    );
    // fecha_pago no es parámetro de la función (usa CURRENT_TIMESTAMP) — si necesitás
    // la fecha real histórica, actualizala después con un UPDATE puntual:
    await client.query(
        `UPDATE pago_anual_completo SET fecha_pago = $2 WHERE id = $1`,
        [res.rows[0].pago_id, fechaPago]
    );
    return { saltado: false, pagoId: res.rows[0].pago_id };
}

/**
 * Marca la matrícula como becada. Idempotente (siempre escribe los
 * mismos valores si se vuelve a correr).
 */
async function marcarMatriculaBecada(client, matriculaId, beca) {
    await client.query(
        `UPDATE matricula
            SET es_becado = true,
                porcentaje_beca = $2,
                tipo_beca = $3
          WHERE id = $1`,
        [
            matriculaId,
            beca.porcentaje_beca ?? 100,
            beca.tipo_beca || 'becado (carga histórica)'
        ]
    );
}

/**
 * Exonera (cancela) las cuotas indicadas de una matrícula becada:
 * monto_beca = monto_original, monto_final = 0, estado = 'cancelado'.
 * No toca cuotas que ya estén 'cancelado' (idempotente). Si una cuota
 * ya tiene un pago real registrado ('pagado' / 'pagado_parcial'),
 * lanza error en vez de sobreescribirla — eso hay que revisarlo a mano.
 */
async function exonerarCuotasBeca(client, matriculaId, cuotaIdPorNumero, cuotasExoneradas, mesIngreso = null) {
    let exoneradas = 0;
    let yaExoneradas = 0;

    for (const numeroCuota of cuotasExoneradas) {
        const { mensualidadId } = resolverMensualidadParaPago(cuotaIdPorNumero, { numeroCuota, mesIngreso });
        if (!mensualidadId) {
            throw new Error(`Matrícula ${matriculaId}: no se encontró mensualidad cuota ${numeroCuota} para exonerar por beca`);
        }

        const res = await client.query(
            `SELECT monto_original, estado FROM mensualidad WHERE id = $1`,
            [mensualidadId]
        );
        const { monto_original: montoOriginal, estado } = res.rows[0];

        if (estado === 'cancelado') {
            yaExoneradas++;
            continue;
        }
        if (estado === 'pagado' || estado === 'pagado_parcial') {
            throw new Error(`Matrícula ${matriculaId}, cuota ${numeroCuota}: ya tiene un pago registrado (estado '${estado}'), no se exonera automáticamente — revisar a mano`);
        }

        await client.query(
            `UPDATE mensualidad
                SET monto_beca = $2,
                    monto_final = 0,
                    estado = 'cancelado',
                    observaciones = CASE
                        WHEN observaciones IS NULL OR observaciones = '' THEN 'Exonerado por beca (carga histórica)'
                        ELSE observaciones || ' | Exonerado por beca (carga histórica)'
                    END
              WHERE id = $1`,
            [mensualidadId, montoOriginal]
        );
        exoneradas++;
    }

    return { exoneradas, yaExoneradas };
}

async function cargarEstudiante(client, estudianteData, curso) {
    const { nombre, ci } = estudianteData;
    const { estudianteId, matriculaId, estadoMatricula, paraleloId } = await resolverMatricula(
        client, ci, curso.periodo_academico_id
    );

    if (estadoMatricula !== 'activo') {
        log('⚠️ ', `${nombre} (CI ${ci}): matrícula en estado '${estadoMatricula}', se carga igual pero revisar`);
    }

    const { map: cuotaIdPorNumero } = estudianteData.mes_ingreso
        ? await asegurarMensualidadesConIngresoTardio(
            client, matriculaId, curso.periodo_academico_id, curso.nivel_academico_id, estudianteData.mes_ingreso
        )
        : await asegurarMensualidadesGeneradas(
            client, matriculaId, curso.periodo_academico_id, curso.nivel_academico_id
        );

    let insertados = 0;
    let saltados = 0;

    for (const pago of estudianteData.pagos) {
        const nota = pago.nota || pago.observaciones || null;

        if (pago.tipo === 'cuota_simple') {
            const { mensualidadId, numeroCuota: calCuota } = resolverMensualidadParaPago(
                cuotaIdPorNumero,
                {
                    numeroCuota: pago.numero_cuota,
                    mesCorrespondiente: pago.mes_correspondiente,
                    mesIngreso: estudianteData.mes_ingreso
                }
            );

            if (!mensualidadId) {
                throw new Error(`${nombre}: no se encontró mensualidad cuota ${pago.numero_cuota} (${pago.mes_correspondiente || 'mes no especificado'})`);
            }

            const { saltado } = await insertarPagoCuota(client, {
                mensualidadId,
                matriculaId,
                numeroCuota: calCuota,
                monto: pago.monto,
                metodoPago: pago.metodo_pago || 'efectivo',
                numeroComprobante: pago.numero_comprobante,
                entregoFactura: pago.entrego_factura,
                numeroFactura: pago.numero_factura,
                fechaPago: pago.fecha_pago,
                // opcional: permite registrar 2+ pagos PARCIALES sobre la MISMA cuota
                // (ej. un alumno que pagó la misma mensualidad en 2 fechas distintas)
                // sin chocar el codigo_pago único. Cada pago parcial trae su propio sufijo.
                sufijoCodigo: pago.sufijo_codigo,
                nota
            });
            saltado ? saltados++ : insertados++;

        } else if (pago.tipo === 'pago_multiple_meses') {
            const itemsCuotas = (pago.meses_cubiertos && pago.meses_cubiertos.length > 0)
                ? pago.meses_cubiertos.map((mes, idx) => ({
                    mesCorrespondiente: mes,
                    numeroCuota: pago.cuotas_cubiertas?.[idx]
                }))
                : (pago.cuotas_cubiertas || []).map(num => ({
                    mesCorrespondiente: null,
                    numeroCuota: num
                }));

            for (const item of itemsCuotas) {
                const { mensualidadId, numeroCuota: calCuota } = resolverMensualidadParaPago(
                    cuotaIdPorNumero,
                    {
                        numeroCuota: item.numeroCuota,
                        mesCorrespondiente: item.mesCorrespondiente,
                        mesIngreso: estudianteData.mes_ingreso
                    }
                );

                if (!mensualidadId) {
                    throw new Error(`${nombre}: no se encontró mensualidad cuota ${item.numeroCuota || item.mesCorrespondiente}`);
                }

                const { saltado } = await insertarPagoCuota(client, {
                    mensualidadId,
                    matriculaId,
                    numeroCuota: calCuota,
                    monto: pago.monto_por_cuota,
                    metodoPago: pago.metodo_pago || 'efectivo',
                    numeroComprobante: pago.numero_comprobante,
                    entregoFactura: pago.entrego_factura,
                    numeroFactura: pago.numero_factura,
                    fechaPago: pago.fecha_pago,
                    sufijoCodigo: 'M', // marca que es parte de un pago múltiple
                    nota: nota ? `(Pago múltiple cuotas ${pago.cuotas_cubiertas?.join(', ') || ''}) ${nota}` : null
                });
                saltado ? saltados++ : insertados++;
            }

        } else if (pago.tipo === 'pago_anual') {
            const { saltado } = await registrarPagoAnual(client, {
                matriculaId, montoTotal: pago.monto_total,
                metodoPago: pago.metodo_pago || 'efectivo', numeroComprobante: pago.numero_comprobante,
                entregoFactura: pago.entrego_factura, numeroFactura: pago.numero_factura,
                fechaPago: pago.fecha_pago,
                nota
            });
            saltado ? saltados++ : insertados++;

        } else {
            throw new Error(`${nombre}: tipo de pago desconocido '${pago.tipo}'`);
        }
    }

    let becaInfo = null;
    if (estudianteData.beca?.es_becado) {
        await marcarMatriculaBecada(client, matriculaId, estudianteData.beca);
        becaInfo = await exonerarCuotasBeca(
            client,
            matriculaId,
            cuotaIdPorNumero,
            estudianteData.beca.cuotas_exoneradas || [],
            estudianteData.mes_ingreso
        );
    }

    return { nombre, ci, insertados, saltados, paraleloId, becaInfo };
}

/**
 * Genera las mensualidades (todas 'pendiente', sin pagos) para los
 * estudiantes del paralelo que NO están en curso.estudiantes ni en
 * curso.pendientes. Son alumnos sin historial de pago en el Excel,
 * pero que igual necesitan sus cuotas para aparecer con deuda
 * pendiente en el sistema. Usa generación estándar (Feb-Nov) porque
 * no hay dato de ingreso tardío para ellos.
 */
async function generarMensualidadesRestoParalelo(curso, paraleloId, ciYaProcesadas) {
    const client = await pool.connect();
    let matriculas;
    try {
        const res = await client.query(
            `SELECT m.id AS matricula_id, e.ci, e.nombres, e.apellidos
         FROM matricula m
         JOIN estudiante e ON e.id = m.estudiante_id
        WHERE m.paralelo_id = $1
          AND m.periodo_academico_id = $2
          AND m.deleted_at IS NULL
          AND m.estado = 'activo'`,
            [paraleloId, curso.periodo_academico_id]
        );
        matriculas = res.rows;
    } finally {
        client.release();
    }

    const generados = [];
    const errores = [];

    for (const mat of matriculas) {
        if (ciYaProcesadas.has(mat.ci)) continue; // ya se cargó con pagos arriba

        const c = await pool.connect();
        try {
            await c.query('BEGIN');
            const { generadasAhora } = await asegurarMensualidadesGeneradas(
                c, mat.matricula_id, curso.periodo_academico_id, curso.nivel_academico_id
            );
            await c.query('COMMIT');
            if (generadasAhora) {
                generados.push(`${mat.nombres} ${mat.apellidos} (CI ${mat.ci})`);
            }
        } catch (err) {
            await c.query('ROLLBACK');
            errores.push({ nombre: `${mat.nombres} ${mat.apellidos}`, ci: mat.ci, error: err.message });
        } finally {
            c.release();
        }
    }

    return { generados, errores };
}

async function main() {
    const jsonPath = process.argv[2];
    if (!jsonPath) {
        console.error('Uso: node cargarMensualidadesCurso.js <ruta-al-json-del-curso>');
        process.exit(1);
    }
    if (!REGISTRADO_POR) {
        console.error('❌ Falta REGISTRADO_POR (usuario admin).');
        process.exit(1);
    }

    const curso = JSON.parse(await readFile(jsonPath, 'utf-8'));
    log('📚', `Curso: ${curso.curso} (periodo ${curso.periodo_academico_id}, nivel ${curso.nivel_academico_id})`);
    log('👥', `${curso.estudiantes.length} estudiantes a cargar, ${curso.pendientes?.length || 0} en pendientes (se omiten)`);

    const resultados = [];
    const errores = [];
    let paraleloIdDetectado = null;

    for (const estudianteData of curso.estudiantes) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const resultado = await cargarEstudiante(client, estudianteData, curso);
            await client.query('COMMIT');
            resultados.push(resultado);
            if (!paraleloIdDetectado && resultado.paraleloId) {
                paraleloIdDetectado = resultado.paraleloId;
            }
            if (resultado.saltados > 0 && resultado.insertados === 0) {
                log('⏭️ ', `${resultado.nombre} (CI ${resultado.ci}) — ya estaba cargado, ${resultado.saltados} pago(s) saltado(s)`);
            } else if (resultado.saltados > 0) {
                log('✅', `${resultado.nombre} (CI ${resultado.ci}) — ${resultado.insertados} nuevo(s), ${resultado.saltados} ya existían`);
            } else {
                log('✅', `${resultado.nombre} (CI ${resultado.ci}) — ${resultado.insertados} pago(s) registrado(s)`);
            }
            if (resultado.becaInfo) {
                const { exoneradas, yaExoneradas } = resultado.becaInfo;
                log('🎓', `${resultado.nombre} (CI ${resultado.ci}) — becado: ${exoneradas} cuota(s) exonerada(s) ahora, ${yaExoneradas} ya lo estaban`);
            }
        } catch (err) {
            await client.query('ROLLBACK');
            errores.push({ nombre: estudianteData.nombre, ci: estudianteData.ci, error: err.message });
            log('❌', `${estudianteData.nombre} (CI ${estudianteData.ci}): ${err.message}`);
        } finally {
            client.release();
        }
    }

    // Paso 2: generar mensualidades pendientes para el resto del paralelo.
    let mensualidadesGeneradas = [];
    let erroresResto = [];
    if (!paraleloIdDetectado) {
        log('⚠️ ', 'No se pudo detectar el paralelo (ningún estudiante del JSON cargó bien) — se omite la generación para el resto del curso');
    } else {
        const ciYaProcesadas = new Set([
            ...curso.estudiantes.map(e => e.ci),
            ...(curso.pendientes || []).map(p => p.ci)
        ]);
        log('📋', `Generando mensualidades pendientes para el resto del paralelo (id ${paraleloIdDetectado})...`);
        const resto = await generarMensualidadesRestoParalelo(curso, paraleloIdDetectado, ciYaProcesadas);
        mensualidadesGeneradas = resto.generados;
        erroresResto = resto.errores;
        for (const g of mensualidadesGeneradas) log('🆕', `${g} — mensualidades generadas (todas pendiente, sin historial de pago)`);
        for (const e of erroresResto) log('❌', `${e.nombre} (CI ${e.ci}): ${e.error}`);
    }

    const totalInsertados = resultados.reduce((acc, r) => acc + r.insertados, 0);
    const totalSaltados = resultados.reduce((acc, r) => acc + r.saltados, 0);
    const totalExoneradas = resultados.reduce((acc, r) => acc + (r.becaInfo?.exoneradas || 0), 0);
    const totalYaExoneradas = resultados.reduce((acc, r) => acc + (r.becaInfo?.yaExoneradas || 0), 0);

    console.log('\n📊 RESUMEN');
    console.log(`   ✅ Estudiantes procesados sin error: ${resultados.length}`);
    console.log(`   🆕 Pagos nuevos insertados: ${totalInsertados}`);
    console.log(`   ⏭️  Pagos ya existentes (saltados): ${totalSaltados}`);
    console.log(`   🎓 Cuotas exoneradas por beca ahora: ${totalExoneradas} (${totalYaExoneradas} ya lo estaban)`);
    console.log(`   ❌ Con error: ${errores.length}`);
    console.log(`   ⏸️  Pendientes (sin tocar): ${curso.pendientes?.length || 0}`);
    console.log(`   🆕 Mensualidades generadas para el resto del paralelo: ${mensualidadesGeneradas.length}`);
    console.log(`   ❌ Errores generando mensualidades del resto: ${erroresResto.length}`);
    if (curso.pendientes?.length) {
        console.log('\n   Pendientes:');
        for (const p of curso.pendientes) console.log(`     - ${p.nombre} (CI ${p.ci}): ${p.estado}`);
    }
    if (errores.length) {
        console.log('\n   Errores de pagos:');
        for (const e of errores) console.log(`     - ${e.nombre} (CI ${e.ci}): ${e.error}`);
    }
    if (erroresResto.length) {
        console.log('\n   Errores generando mensualidades del resto:');
        for (const e of erroresResto) console.log(`     - ${e.nombre} (CI ${e.ci}): ${e.error}`);
    }

    await pool.end();
    process.exit(errores.length + erroresResto.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
});