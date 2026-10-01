// models/Examen.js
import { pool } from '../db/pool.js';
import { Calificacion } from './Notas.js';
import { parseToLocalTimestamp } from '../utils/dateUtils.js';

export class Examen {
  // =============================================
  // CONFIGURACIÓN DE MODALIDAD VIRTUAL
  // =============================================

  // Activa la modalidad virtual para una evaluación existente
  static async activarModalidadVirtual(evaluacion_id, data = {}) {
    const {
      duracion_minutos = 60,
      fecha_hora_inicio = null,
      fecha_hora_fin = null,
      intentos_permitidos = 1,
      orden_aleatorio = false,
    } = data;

    const result = await pool.query(`
      UPDATE evaluacion
      SET
        modalidad           = 'virtual',
        duracion_minutos    = $2,
        fecha_hora_inicio   = $3,
        fecha_hora_fin      = $4,
        intentos_permitidos = COALESCE($5, 1),
        orden_aleatorio     = COALESCE($6, false),
        updated_at          = CURRENT_TIMESTAMP
      WHERE id = $1 AND activo = true
      RETURNING *
    `, [
      evaluacion_id,
      duracion_minutos,
      parseToLocalTimestamp(fecha_hora_inicio),
      parseToLocalTimestamp(fecha_hora_fin),
      intentos_permitidos,
      orden_aleatorio,
    ]);

    if (!result.rows[0]) {
      throw new Error('Evaluación no encontrada o inactiva');
    }
    return result.rows[0];
  }

  // Desactiva la modalidad virtual (vuelve a presencial)
  static async desactivarModalidadVirtual(evaluacion_id) {
    const result = await pool.query(`
      UPDATE evaluacion
      SET
        modalidad  = 'presencial',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND activo = true
      RETURNING *
    `, [evaluacion_id]);

    if (!result.rows[0]) {
      throw new Error('Evaluación no encontrada o inactiva');
    }
    return result.rows[0];
  }

  // Obtiene los datos de la evaluación y su configuración de examen
  static async obtenerConfiguracion(evaluacion_id) {
    const result = await pool.query(`
      SELECT
        e.id,
        e.nombre,
        e.tipo,
        e.descripcion,
        e.fecha,
        CAST(e.puntaje_maximo AS FLOAT8) AS puntaje_maximo,
        e.modalidad,
        e.duracion_minutos,
        e.fecha_hora_inicio,
        e.fecha_hora_fin,
        e.intentos_permitidos,
        e.orden_aleatorio,
        e.activo,
        e.tema_id,
        e.asignacion_docente_id,
        de.nombre AS dimension_nombre,
        mat.nombre AS materia_nombre,
        g.nombre AS grado_nombre,
        p.nombre AS paralelo_nombre
      FROM evaluacion e
      INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
      INNER JOIN asignacion_docente ad   ON e.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm        ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat             ON gm.materia_id = mat.id
      INNER JOIN grado g                 ON gm.grado_id = g.id
      INNER JOIN paralelo p              ON ad.paralelo_id = p.id
      WHERE e.id = $1
    `, [evaluacion_id]);

    return result.rows[0] || null;
  }

  // =============================================
  // GESTIÓN DEL BANCO DE PREGUNTAS (DOCENTE)
  // =============================================

  // Lista preguntas con respuestas correctas (solo vista docente)
  static async listarPreguntas(evaluacion_id) {
    const result = await pool.query(`
      SELECT
        id,
        evaluacion_id,
        tipo,
        pregunta,
        opciones,
        respuesta_correcta,
        respuesta_esperada,
        CAST(puntos AS FLOAT8) AS puntos,
        requiere_archivo,
        orden,
        activo,
        generado_por_ia,
        created_at,
        updated_at
      FROM examen_pregunta
      WHERE evaluacion_id = $1 AND activo = true
      ORDER BY orden ASC, id ASC
    `, [evaluacion_id]);

    return result.rows;
  }

  // Lista preguntas seguras para el estudiante (sin respuesta_correcta ni respuesta_esperada)
  static async listarPreguntasParaEstudiante(evaluacion_id, orden_aleatorio = false) {
    const orderBy = orden_aleatorio ? 'RANDOM()' : 'orden ASC, id ASC';
    const result = await pool.query(`
      SELECT
        id,
        evaluacion_id,
        tipo,
        pregunta,
        opciones,
        CAST(puntos AS FLOAT8) AS puntos,
        requiere_archivo,
        orden
      FROM examen_pregunta
      WHERE evaluacion_id = $1 AND activo = true
      ORDER BY ${orderBy}
    `, [evaluacion_id]);

    return result.rows;
  }

  // Reemplaza todo el set de preguntas de la evaluación (por ejemplo al confirmar IA o guardar borrador)
  static async reemplazarPreguntas(evaluacion_id, preguntas) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Desactivar preguntas anteriores
      await client.query(`
        UPDATE examen_pregunta
        SET activo = false, updated_at = CURRENT_TIMESTAMP
        WHERE evaluacion_id = $1 AND activo = true
      `, [evaluacion_id]);

      // 2. Insertar nuevas preguntas
      const insertadas = [];
      for (let i = 0; i < preguntas.length; i++) {
        const p = preguntas[i];
        const res = await client.query(`
          INSERT INTO examen_pregunta (
            evaluacion_id,
            tipo,
            pregunta,
            opciones,
            respuesta_correcta,
            respuesta_esperada,
            puntos,
            requiere_archivo,
            orden,
            activo,
            generado_por_ia
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
          RETURNING
            id, evaluacion_id, tipo, pregunta, opciones,
            respuesta_correcta, respuesta_esperada,
            CAST(puntos AS FLOAT8) AS puntos,
            requiere_archivo, orden, activo, generado_por_ia
        `, [
          evaluacion_id,
          p.tipo,
          p.pregunta?.trim(),
          p.opciones ? JSON.stringify(p.opciones) : null,
          p.respuesta_correcta !== undefined && p.respuesta_correcta !== null ? parseInt(p.respuesta_correcta) : null,
          p.respuesta_esperada ? p.respuesta_esperada.trim() : null,
          p.puntos !== undefined ? parseFloat(p.puntos) : 1,
          Boolean(p.requiere_archivo),
          i + 1,
          Boolean(p.generado_por_ia),
        ]);
        insertadas.push(res.rows[0]);
      }

      await client.query('COMMIT');
      return insertadas;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =============================================
  // FLUJO DE INTENTOS Y RESPUESTAS (ESTUDIANTE)
  // =============================================

  // Inicia o reanuda un intento para un estudiante
  static async iniciarIntento(evaluacion_id, matricula_id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Validar evaluación y verificar tiempos en zona horaria America/La_Paz
      const evalRes = await client.query(`
        SELECT
          e.*,
          CAST(e.puntaje_maximo AS FLOAT8) AS puntaje_maximo,
          ad.paralelo_id,
          ad.periodo_academico_id,
          CASE
            WHEN e.fecha_hora_fin IS NOT NULL THEN
              EXTRACT(EPOCH FROM (e.fecha_hora_fin::timestamp - (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')))::INTEGER
            ELSE NULL
          END AS segundos_hasta_cierre,
          CASE
            WHEN e.fecha_hora_inicio IS NOT NULL THEN
              EXTRACT(EPOCH FROM (e.fecha_hora_inicio::timestamp - (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')))::INTEGER
            ELSE NULL
          END AS segundos_para_inicio
        FROM evaluacion e
        INNER JOIN asignacion_docente ad ON e.asignacion_docente_id = ad.id
        WHERE e.id = $1 AND e.activo = true
      `, [evaluacion_id]);

      const evaluacion = evalRes.rows[0];
      if (!evaluacion) {
        throw new Error('La evaluación solicitada no existe o no está activa');
      }

      if (evaluacion.modalidad !== 'virtual') {
        throw new Error('Esta evaluación no está configurada en modalidad virtual');
      }

      // Validar matrícula del estudiante en el paralelo y periodo académico correspondiente
      const matRes = await client.query(`
        SELECT id, estado FROM matricula
        WHERE id = $1 AND paralelo_id = $2 AND periodo_academico_id = $3
          AND estado = 'activo' AND deleted_at IS NULL
      `, [matricula_id, evaluacion.paralelo_id, evaluacion.periodo_academico_id]);

      if (!matRes.rows[0]) {
        throw new Error('El estudiante no está matriculado activamente en el curso de esta evaluación');
      }

      // Validar ventana de fechas
      if (evaluacion.segundos_para_inicio !== null && evaluacion.segundos_para_inicio > 0) {
        throw new Error(`El examen aún no está habilitado.`);
      }
      if (evaluacion.segundos_hasta_cierre !== null && evaluacion.segundos_hasta_cierre <= 0) {
        throw new Error(`El plazo para rendir este examen ha finalizado.`);
      }

      // 2. Verificar si ya existe un intento para esta (evaluacion_id, matricula_id)
      const intentoExistenteRes = await client.query(`
        SELECT
          ei.*,
          EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ei.iniciado_en))::INTEGER AS segundos_transcurridos
        FROM examen_intento ei
        WHERE evaluacion_id = $1 AND matricula_id = $2
      `, [evaluacion_id, matricula_id]);

      let intento = intentoExistenteRes.rows[0];

      if (intento) {
        // Si ya fue entregado o expirado
        if (intento.estado === 'entregado' || intento.estado === 'expirado') {
          await client.query('COMMIT');
          return {
            intento,
            ya_finalizado: true,
            mensaje: 'Ya has completado tu intento para esta evaluación',
          };
        }

        // Si está en progreso, validar si ya expiró el tiempo límite
        if (intento.estado === 'en_progreso' && evaluacion.duracion_minutos) {
          const transcurridos = intento.segundos_transcurridos || 0;
          const limiteSegundos = (evaluacion.duracion_minutos * 60) + 120; // 2 min margen de gracia

          if (transcurridos > limiteSegundos) {
            // Auto-cerrar como expirado
            const expiradoRes = await client.query(`
              UPDATE examen_intento
              SET
                estado = 'expirado',
                entregado_en = CURRENT_TIMESTAMP
              WHERE id = $1
              RETURNING *
            `, [intento.id]);

            intento = expiradoRes.rows[0];
            await client.query('COMMIT');
            return {
              intento,
              ya_finalizado: true,
              mensaje: 'El tiempo límite para completar el examen ha expirado',
            };
          }
        }
      } else {
        // 3. Crear nuevo intento
        const nuevoIntentoRes = await client.query(`
          INSERT INTO examen_intento (
            evaluacion_id,
            matricula_id,
            estado,
            iniciado_en
          )
          VALUES ($1, $2, 'en_progreso', CURRENT_TIMESTAMP)
          RETURNING *
        `, [evaluacion_id, matricula_id]);

        intento = nuevoIntentoRes.rows[0];
      }

      // 4. Asegurar SIEMPRE que todas las preguntas activas tengan su fila en examen_respuesta para este intento
      await client.query(`
        INSERT INTO examen_respuesta (intento_id, pregunta_id)
        SELECT $1, ep.id
        FROM examen_pregunta ep
        WHERE ep.evaluacion_id = $2 AND ep.activo = true
        ON CONFLICT (intento_id, pregunta_id) DO NOTHING
      `, [intento.id, evaluacion_id]);

      await client.query('COMMIT');

      // 5. Cargar respuestas y preguntas seguras para el estudiante
      const preguntas = await this.listarPreguntasParaEstudiante(
        evaluacion_id,
        evaluacion.orden_aleatorio
      );

      const respuestasRes = await pool.query(`
        SELECT
          id,
          pregunta_id,
          respuesta_opcion,
          respuesta_texto,
          archivo_url,
          archivo_public_id
        FROM examen_respuesta
        WHERE intento_id = $1
      `, [intento.id]);

      // 6. Calcular segundos restantes exactos usando el reloj de PostgreSQL (sin desfasajes de zona horaria)
      let segundos_restantes = null;
      if (evaluacion.duracion_minutos) {
        const secRes = await pool.query(`
          SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - iniciado_en))::INTEGER AS transcurridos
          FROM examen_intento WHERE id = $1
        `, [intento.id]);
        const transcurridos = Math.max(0, secRes.rows[0]?.transcurridos || 0);
        segundos_restantes = Math.max(0, (evaluacion.duracion_minutos * 60) - transcurridos);
      }

      if (evaluacion.segundos_hasta_cierre !== null && evaluacion.segundos_hasta_cierre !== undefined) {
        const hastaCierre = Math.max(0, evaluacion.segundos_hasta_cierre);
        if (segundos_restantes !== null) {
          segundos_restantes = Math.min(segundos_restantes, hastaCierre);
        } else {
          segundos_restantes = hastaCierre;
        }
      }

      return {
        intento,
        evaluacion: {
          id: evaluacion.id,
          nombre: evaluacion.nombre,
          descripcion: evaluacion.descripcion,
          duracion_minutos: evaluacion.duracion_minutos,
          puntaje_maximo: evaluacion.puntaje_maximo,
        },
        segundos_restantes,
        preguntas,
        respuestas: respuestasRes.rows,
        ya_finalizado: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Guarda o actualiza una respuesta (autosave para estudiante)
  static async guardarRespuesta(intento_id, pregunta_id, data = {}) {
    const {
      respuesta_opcion = null,
      respuesta_texto = null,
      archivo_url = null,
      archivo_public_id = null,
    } = data;

    // 1. Obtener intento y evaluación con segundos transcurridos
    const intentoRes = await pool.query(`
      SELECT
        ei.*,
        e.duracion_minutos,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ei.iniciado_en))::INTEGER AS segundos_transcurridos
      FROM examen_intento ei
      INNER JOIN evaluacion e ON ei.evaluacion_id = e.id
      WHERE ei.id = $1
    `, [intento_id]);

    const intento = intentoRes.rows[0];
    if (!intento) throw new Error('Intento no encontrado');
    if (intento.estado !== 'en_progreso') {
      throw new Error(`No se pueden guardar respuestas en un examen con estado "${intento.estado}"`);
    }

    // Validar expiración de tiempo
    if (intento.duracion_minutos) {
      const limiteSegundos = (intento.duracion_minutos * 60) + 120; // 2 min de gracia
      if (intento.segundos_transcurridos > limiteSegundos) {
        await pool.query(`
          UPDATE examen_intento
          SET estado = 'expirado', entregado_en = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [intento_id]);
        throw new Error('El tiempo límite para completar el examen ha finalizado');
      }
    }

    // 2. Obtener datos de la pregunta para cálculo automático si es objetiva
    const pregRes = await pool.query(`
      SELECT id, tipo, respuesta_correcta, CAST(puntos AS FLOAT8) AS puntos
      FROM examen_pregunta
      WHERE id = $1 AND activo = true
    `, [pregunta_id]);

    const pregunta = pregRes.rows[0];
    if (!pregunta) throw new Error('Pregunta no encontrada o inactiva');

    let es_correcta = null;
    let puntaje_obtenido = null;

    if (pregunta.tipo === 'opcion_multiple' || pregunta.tipo === 'verdadero_falso') {
      if (respuesta_opcion !== null && respuesta_opcion !== undefined) {
        es_correcta = parseInt(respuesta_opcion) === pregunta.respuesta_correcta;
        puntaje_obtenido = es_correcta ? pregunta.puntos : 0;
      }
    }

    // 3. Upsert en examen_respuesta
    const result = await pool.query(`
      INSERT INTO examen_respuesta (
        intento_id,
        pregunta_id,
        respuesta_opcion,
        respuesta_texto,
        archivo_url,
        archivo_public_id,
        es_correcta,
        puntaje_obtenido
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (intento_id, pregunta_id) DO UPDATE SET
        respuesta_opcion  = COALESCE(EXCLUDED.respuesta_opcion, examen_respuesta.respuesta_opcion),
        respuesta_texto   = COALESCE(EXCLUDED.respuesta_texto, examen_respuesta.respuesta_texto),
        archivo_url       = COALESCE(EXCLUDED.archivo_url, examen_respuesta.archivo_url),
        archivo_public_id = COALESCE(EXCLUDED.archivo_public_id, examen_respuesta.archivo_public_id),
        es_correcta       = EXCLUDED.es_correcta,
        puntaje_obtenido  = EXCLUDED.puntaje_obtenido
      RETURNING
        id,
        intento_id,
        pregunta_id,
        respuesta_opcion,
        respuesta_texto,
        archivo_url,
        archivo_public_id,
        es_correcta,
        CAST(puntaje_obtenido AS FLOAT8) AS puntaje_obtenido
    `, [
      intento_id,
      pregunta_id,
      respuesta_opcion !== null && respuesta_opcion !== undefined ? parseInt(respuesta_opcion) : null,
      respuesta_texto,
      archivo_url,
      archivo_public_id,
      es_correcta,
      puntaje_obtenido,
    ]);

    return result.rows[0];
  }

  // Entrega formal del examen por el estudiante
  static async entregarIntento(intento_id, { docente_id = null } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const intentoRes = await client.query(`
        SELECT ei.*, e.id AS evaluacion_id, CAST(e.puntaje_maximo AS FLOAT8) AS puntaje_maximo
        FROM examen_intento ei
        INNER JOIN evaluacion e ON ei.evaluacion_id = e.id
        WHERE ei.id = $1
      `, [intento_id]);

      const intento = intentoRes.rows[0];
      if (!intento) throw new Error('Intento no encontrado');
      if (intento.estado === 'entregado') {
        await client.query('COMMIT');
        return intento;
      }

      // Verificar si hay preguntas subjetivas (desarrollo o respuesta corta) sin calificar
      const pendientesRes = await client.query(`
        SELECT COUNT(*) AS total_pendientes
        FROM examen_pregunta ep
        LEFT JOIN examen_respuesta er
          ON er.pregunta_id = ep.id AND er.intento_id = $1
        WHERE ep.evaluacion_id = $2
          AND ep.activo = true
          AND ep.tipo IN ('desarrollo', 'respuesta_corta')
          AND (er.puntaje_obtenido IS NULL)
      `, [intento_id, intento.evaluacion_id]);

      const totalPendientes = parseInt(pendientesRes.rows[0].total_pendientes || 0);
      const calificado_completo = totalPendientes === 0;

      // Sumar puntaje obtenido hasta ahora
      const sumaRes = await client.query(`
        SELECT COALESCE(SUM(er.puntaje_obtenido), 0) AS puntaje_acumulado
        FROM examen_respuesta er
        INNER JOIN examen_pregunta ep ON er.pregunta_id = ep.id
        WHERE er.intento_id = $1 AND ep.activo = true
      `, [intento_id]);

      const puntaje_obtenido = parseFloat(sumaRes.rows[0].puntaje_acumulado || 0);

      // Actualizar estado del intento
      const updateRes = await client.query(`
        UPDATE examen_intento
        SET
          estado              = 'entregado',
          entregado_en        = CURRENT_TIMESTAMP,
          puntaje_obtenido    = $2,
          calificado_completo = $3
        WHERE id = $1
        RETURNING *
      `, [intento_id, puntaje_obtenido, calificado_completo]);

      const intentoActualizado = updateRes.rows[0];

      // Si no quedan preguntas subjetivas pendientes, sincronizar directamente con la tabla calificacion
      if (calificado_completo) {
        await this._sincronizarConCalificacion({
          client,
          evaluacion_id: intento.evaluacion_id,
          matricula_id: intento.matricula_id,
          puntaje_obtenido,
          docente_id,
        });
      }

      await client.query('COMMIT');
      return intentoActualizado;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =============================================
  // CALIFICACIÓN MANUAL (DOCENTE)
  // =============================================

  // Califica una respuesta subjetiva (desarrollo / respuesta corta)
  static async calificarRespuestaManual(respuesta_id, data = {}) {
    const {
      puntaje_obtenido,
      retroalimentacion = null,
      docente_id = null,
    } = data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Obtener respuesta, pregunta e intento
      const resData = await client.query(`
        SELECT
          er.id,
          er.intento_id,
          er.pregunta_id,
          CAST(ep.puntos AS FLOAT8) AS max_puntos,
          ei.evaluacion_id,
          ei.matricula_id
        FROM examen_respuesta er
        INNER JOIN examen_pregunta ep ON er.pregunta_id = ep.id
        INNER JOIN examen_intento ei  ON er.intento_id = ei.id
        WHERE er.id = $1
      `, [respuesta_id]);

      const r = resData.rows[0];
      if (!r) throw new Error('Respuesta no encontrada');

      const puntos = parseFloat(puntaje_obtenido);
      if (isNaN(puntos) || puntos < 0 || puntos > r.max_puntos) {
        throw new Error(`El puntaje debe estar entre 0 y el valor máximo de la pregunta (${r.max_puntos})`);
      }

      // 2. Actualizar respuesta
      const esCorrecta = puntos > 0;
      await client.query(`
        UPDATE examen_respuesta
        SET
          puntaje_obtenido  = $1,
          retroalimentacion = $2,
          es_correcta       = $3
        WHERE id = $4
      `, [puntos, retroalimentacion, esCorrecta, respuesta_id]);

      // 3. Chequear si faltan otras respuestas subjetivas por calificar en este intento
      const pendientesRes = await client.query(`
        SELECT COUNT(*) AS total_pendientes
        FROM examen_pregunta ep
        LEFT JOIN examen_respuesta er
          ON er.pregunta_id = ep.id AND er.intento_id = $1
        WHERE ep.evaluacion_id = $2
          AND ep.activo = true
          AND ep.tipo IN ('desarrollo', 'respuesta_corta')
          AND (er.puntaje_obtenido IS NULL)
      `, [r.intento_id, r.evaluacion_id]);

      const totalPendientes = parseInt(pendientesRes.rows[0].total_pendientes || 0);
      const calificado_completo = totalPendientes === 0;

      // 4. Recalcular suma total del intento
      const sumaRes = await client.query(`
        SELECT COALESCE(SUM(er.puntaje_obtenido), 0) AS puntaje_acumulado
        FROM examen_respuesta er
        INNER JOIN examen_pregunta ep ON er.pregunta_id = ep.id
        WHERE er.intento_id = $1 AND ep.activo = true
      `, [r.intento_id]);

      const totalIntento = parseFloat(sumaRes.rows[0].puntaje_acumulado || 0);

      // 5. Actualizar intento
      const intentoRes = await client.query(`
        UPDATE examen_intento
        SET
          puntaje_obtenido    = $1,
          calificado_completo = $2
        WHERE id = $3
        RETURNING *
      `, [totalIntento, calificado_completo, r.intento_id]);

      // 6. Si ya no quedan preguntas pendientes, sincronizar calificación en libreta
      if (calificado_completo) {
        await this._sincronizarConCalificacion({
          client,
          evaluacion_id: r.evaluacion_id,
          matricula_id: r.matricula_id,
          puntaje_obtenido: totalIntento,
          docente_id,
        });
      }

      await client.query('COMMIT');
      return intentoRes.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Sincroniza la nota del intento con la tabla oficial calificacion
  static async _sincronizarConCalificacion({ client, evaluacion_id, matricula_id, puntaje_obtenido, docente_id }) {
    // Si no se pasó docente_id, buscar el docente asignado a la evaluación
    let regPor = docente_id;
    if (!regPor) {
      const docRes = await client.query(`
        SELECT d.usuario_id
        FROM evaluacion e
        INNER JOIN asignacion_docente ad ON e.asignacion_docente_id = ad.id
        INNER JOIN docente d ON ad.docente_id = d.id
        WHERE e.id = $1
      `, [evaluacion_id]);
      regPor = docRes.rows[0]?.usuario_id || 1;
    }

    // Obtener puntaje máximo de la evaluación para asegurar que no se exceda
    const evalRes = await client.query(`
      SELECT puntaje_maximo FROM evaluacion WHERE id = $1
    `, [evaluacion_id]);

    const puntajeMax = parseFloat(evalRes.rows[0]?.puntaje_maximo || 100);
    const notaAjustada = Math.min(puntaje_obtenido, puntajeMax);

    await client.query(`
      INSERT INTO calificacion (
        evaluacion_id,
        matricula_id,
        puntaje_obtenido,
        esta_ausente,
        observacion,
        registrado_por
      )
      VALUES ($1, $2, $3, false, 'Calificado desde Examen Virtual', $4)
      ON CONFLICT (evaluacion_id, matricula_id) DO UPDATE SET
        puntaje_obtenido  = EXCLUDED.puntaje_obtenido,
        esta_ausente      = false,
        observacion       = EXCLUDED.observacion,
        registrado_por    = EXCLUDED.registrado_por,
        fecha_registro    = CURRENT_TIMESTAMP,
        updated_at        = CURRENT_TIMESTAMP
    `, [evaluacion_id, matricula_id, notaAjustada, regPor]);
  }

  // =============================================
  // VISTAS DE MONITOREO Y RESULTADOS
  // =============================================

  // Lista todos los intentos y estudiantes para la vista de notas del docente
  static async listarIntentos(evaluacion_id) {
    const result = await pool.query(`
      SELECT
        m.id AS matricula_id,
        e.id AS estudiante_id,
        e.codigo AS estudiante_codigo,
        e.nombres AS estudiante_nombres,
        e.apellidos AS estudiante_apellidos,
        e.foto_url AS estudiante_foto,
        ei.id AS intento_id,
        COALESCE(ei.estado, 'sin_iniciar') AS estado_intento,
        ei.iniciado_en,
        ei.entregado_en,
        CAST(ei.puntaje_obtenido AS FLOAT8) AS puntaje_obtenido,
        COALESCE(ei.calificado_completo, false) AS calificado_completo,
        CAST(c.puntaje_obtenido AS FLOAT8) AS calificacion_oficial,
        COUNT(er.id) FILTER (
          WHERE ep.tipo IN ('desarrollo', 'respuesta_corta')
            AND er.puntaje_obtenido IS NULL
        ) AS respuestas_pendientes_calificar
      FROM evaluacion ev
      INNER JOIN asignacion_docente ad ON ev.asignacion_docente_id = ad.id
      INNER JOIN matricula m
        ON  COALESCE(m.paralelo_cursado_id, m.paralelo_id) = ad.paralelo_id
        AND m.periodo_academico_id = ad.periodo_academico_id
        AND m.estado               = 'activo'
        AND m.deleted_at           IS NULL
      INNER JOIN estudiante e ON e.id = m.estudiante_id
      LEFT JOIN examen_intento ei ON ei.matricula_id = m.id AND ei.evaluacion_id = ev.id
      LEFT JOIN calificacion c    ON c.matricula_id  = m.id AND c.evaluacion_id  = ev.id
      LEFT JOIN examen_respuesta er ON er.intento_id = ei.id
      LEFT JOIN examen_pregunta ep  ON er.pregunta_id = ep.id AND ep.activo = true
      WHERE ev.id = $1
      GROUP BY
        m.id, e.id, e.codigo, e.nombres, e.apellidos, e.foto_url,
        ei.id, ei.estado, ei.iniciado_en, ei.entregado_en,
        ei.puntaje_obtenido, ei.calificado_completo, c.puntaje_obtenido
      ORDER BY e.apellidos ASC, e.nombres ASC
    `, [evaluacion_id]);

    return result.rows;
  }

  // Detalle completo de un intento para calificar o revisar
  static async obtenerDetalleIntento(intento_id) {
    const intentoRes = await pool.query(`
      SELECT
        ei.*,
        CAST(ei.puntaje_obtenido AS FLOAT8) AS puntaje_obtenido,
        e.id AS evaluacion_id,
        e.nombre AS evaluacion_nombre,
        CAST(e.puntaje_maximo AS FLOAT8) AS evaluacion_puntaje_maximo,
        est.nombres AS estudiante_nombres,
        est.apellidos AS estudiante_apellidos,
        est.codigo AS estudiante_codigo
      FROM examen_intento ei
      INNER JOIN evaluacion e    ON ei.evaluacion_id = e.id
      INNER JOIN matricula m     ON ei.matricula_id = m.id
      INNER JOIN estudiante est  ON m.estudiante_id = est.id
      WHERE ei.id = $1
    `, [intento_id]);

    const intento = intentoRes.rows[0];
    if (!intento) return null;

    const preguntasRes = await pool.query(`
      SELECT
        ep.id AS pregunta_id,
        ep.tipo,
        ep.pregunta,
        ep.opciones,
        ep.respuesta_correcta,
        ep.respuesta_esperada,
        CAST(ep.puntos AS FLOAT8) AS puntos_maximos,
        ep.requiere_archivo,
        ep.orden,
        er.id AS respuesta_id,
        er.respuesta_opcion,
        er.respuesta_texto,
        er.archivo_url,
        er.archivo_public_id,
        er.es_correcta,
        CAST(er.puntaje_obtenido AS FLOAT8) AS puntaje_obtenido,
        er.retroalimentacion
      FROM examen_pregunta ep
      LEFT JOIN examen_respuesta er
        ON er.pregunta_id = ep.id AND er.intento_id = $1
      WHERE ep.evaluacion_id = $2 AND ep.activo = true
      ORDER BY ep.orden ASC, ep.id ASC
    `, [intento_id, intento.evaluacion_id]);

    return {
      ...intento,
      preguntas: preguntasRes.rows,
    };
  }

  // =============================================
  // REINICIO Y LIMPIEZA DE INTENTOS / ENVÍOS
  // =============================================

  // Reinicia (elimina) el intento de un estudiante para que pueda volver a dar la evaluación
  static async reiniciarIntentoEstudiante(intento_id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const intentoRes = await client.query(`
        SELECT id, evaluacion_id, matricula_id FROM examen_intento WHERE id = $1
      `, [intento_id]);

      const intento = intentoRes.rows[0];
      if (!intento) {
        throw new Error('El intento no existe o ya fue eliminado');
      }

      // 1. Eliminar respuestas asociadas
      await client.query(`
        DELETE FROM examen_respuesta WHERE intento_id = $1
      `, [intento_id]);

      // 2. Eliminar el intento
      await client.query(`
        DELETE FROM examen_intento WHERE id = $1
      `, [intento_id]);

      // 3. Limpiar calificación oficial en libreta si existía
      await client.query(`
        DELETE FROM calificacion
        WHERE evaluacion_id = $1 AND matricula_id = $2
      `, [intento.evaluacion_id, intento.matricula_id]);

      await client.query('COMMIT');
      return intento;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Limpia todos los intentos y envíos de una evaluación completa
  static async limpiarTodosLosIntentos(evaluacion_id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Contar intentos existentes
      const countRes = await client.query(`
        SELECT COUNT(*) AS total FROM examen_intento WHERE evaluacion_id = $1
      `, [evaluacion_id]);
      const totalIntentos = parseInt(countRes.rows[0]?.total || 0);

      // 2. Eliminar respuestas de todos los intentos de esta evaluación
      await client.query(`
        DELETE FROM examen_respuesta
        WHERE intento_id IN (SELECT id FROM examen_intento WHERE evaluacion_id = $1)
      `, [evaluacion_id]);

      // 3. Eliminar todos los intentos
      await client.query(`
        DELETE FROM examen_intento WHERE evaluacion_id = $1
      `, [evaluacion_id]);

      // 4. Limpiar calificaciones en la planilla generadas por este examen
      await client.query(`
        DELETE FROM calificacion WHERE evaluacion_id = $1
      `, [evaluacion_id]);

      await client.query('COMMIT');
      return { total_eliminados: totalIntentos };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default Examen;
