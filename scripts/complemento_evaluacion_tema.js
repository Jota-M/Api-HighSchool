// scripts/complemento_evaluacion_tema.js
import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function complementarEvaluacionTema() {
  const client = await pool.connect();
  try {
    console.log('\n🔗 COMPLEMENTO: RELACIÓN EVALUACIÓN ↔ UNIDAD TEMÁTICA / TEMA');
    console.log('\n📋 CAMBIOS EN BASE DE DATOS:');
    console.log('  1️⃣  ALTER TABLE evaluacion   → columna tema_id (FK opcional)');
    console.log('  2️⃣  INDEX idx_evaluacion_tema → optimización de consultas');
    console.log('  3️⃣  VIEW vista_evaluaciones_con_tema → joins completos listos');
    console.log('  4️⃣  FUNCTION evaluaciones_por_tema()');
    console.log('  5️⃣  FUNCTION resumen_evaluaciones_unidad()');
    console.log('\n📋 CAMBIOS EN MODEL (Notas.js):');
    console.log('  ✅ Evaluacion.create()       → acepta tema_id');
    console.log('  ✅ Evaluacion.findAll()      → filtra por tema_id, join con tema/unidad');
    console.log('  ✅ Evaluacion.findById()     → incluye tema y unidad en la respuesta');
    console.log('  ✅ Evaluacion.update()       → permite cambiar tema_id');
    console.log('  ✅ Evaluacion.getTemario()   → NEW: temas con sus evaluaciones agrupadas');
    console.log('\n📋 CAMBIOS EN CONTROLLER (notasController.js):');
    console.log('  ✅ EvaluacionController.crear()     → valida y pasa tema_id');
    console.log('  ✅ EvaluacionController.listar()    → filtra por tema_id');
    console.log('  ✅ EvaluacionController.actualizar()→ permite reasignar tema');
    console.log('  ✅ TemarioController (NEW)          → GET /temario/:grado_materia_id');
    console.log('\n📋 CAMBIOS EN ROUTES (notasRoutes.js):');
    console.log('  ✅ GET /api/notas/temario/:grado_materia_id → nuevo endpoint');
    console.log('  ✅ GET /api/notas/evaluaciones/tema/:tema_id → nuevo endpoint\n');

    const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');
    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Aplicando cambios en base de datos...\n');

    // =============================================
    // 1️⃣ ALTER TABLE: agregar tema_id a evaluacion
    // =============================================
    console.log('🔧 Alterando tabla EVALUACION...');

    await client.query(`
      ALTER TABLE evaluacion
        ADD COLUMN IF NOT EXISTS tema_id INTEGER REFERENCES tema(id)
    `);

    await client.query(`
      COMMENT ON COLUMN evaluacion.tema_id IS
        'Tema de la unidad temática al que pertenece esta evaluación. NULL = evaluación transversal sin tema específico'
    `);

    console.log('  ✅ Columna tema_id agregada');

    // =============================================
    // 2️⃣ ÍNDICE
    // =============================================
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_evaluacion_tema
        ON evaluacion(tema_id)
        WHERE tema_id IS NOT NULL
    `);

    console.log('  ✅ Índice idx_evaluacion_tema creado');

    // =============================================
    // 3️⃣ VISTA: vista_evaluaciones_con_tema
    // =============================================
    console.log('📊 Creando vista VISTA_EVALUACIONES_CON_TEMA...');

    await client.query(`
      CREATE OR REPLACE VIEW vista_evaluaciones_con_tema AS
      SELECT
        e.id                          AS evaluacion_id,
        e.nombre                      AS evaluacion_nombre,
        e.tipo,
        e.fecha,
        e.puntaje_maximo,
        e.peso_en_dimension,
        e.visible_para_padres,
        e.activo,
        -- Dimensión
        de.id                         AS dimension_id,
        de.nombre                     AS dimension_nombre,
        de.codigo                     AS dimension_codigo,
        de.color                      AS dimension_color,
        -- Período de evaluación
        pe.id                         AS periodo_evaluacion_id,
        pe.nombre                     AS periodo_nombre,
        pe.orden                      AS periodo_orden,
        -- Tema (NULL si no tiene)
        t.id                          AS tema_id,
        t.titulo                      AS tema_titulo,
        t.numero_tema,
        t.nivel_dificultad,
        -- Unidad temática (NULL si el tema es NULL)
        u.id                          AS unidad_id,
        u.titulo                      AS unidad_titulo,
        u.numero_unidad,
        -- Asignación docente (para filtrar por materia)
        e.asignacion_docente_id
      FROM evaluacion e
      INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
      INNER JOIN periodo_evaluacion pe   ON e.periodo_evaluacion_id   = pe.id
      LEFT  JOIN tema t                  ON e.tema_id = t.id
      LEFT  JOIN unidad_tematica u       ON t.unidad_tematica_id = u.id
    `);

    console.log('  ✅ Vista vista_evaluaciones_con_tema creada');

    // =============================================
    // 4️⃣ FUNCIÓN: evaluaciones_por_tema
    // =============================================
    console.log('🔧 Creando función EVALUACIONES_POR_TEMA...');

    await client.query(`
      CREATE OR REPLACE FUNCTION evaluaciones_por_tema(
        p_tema_id               INTEGER,
        p_periodo_evaluacion_id INTEGER DEFAULT NULL
      )
      RETURNS TABLE(
        evaluacion_id       INTEGER,
        evaluacion_nombre   VARCHAR,
        tipo                VARCHAR,
        dimension_nombre    VARCHAR,
        dimension_codigo    VARCHAR,
        dimension_color     VARCHAR,
        puntaje_maximo      NUMERIC,
        peso_en_dimension   NUMERIC,
        fecha               DATE,
        visible_para_padres BOOLEAN,
        total_calificados   BIGINT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          e.id::INTEGER,
          e.nombre::VARCHAR,
          e.tipo::VARCHAR,
          de.nombre::VARCHAR,
          de.codigo::VARCHAR,
          de.color::VARCHAR,
          e.puntaje_maximo,
          e.peso_en_dimension,
          e.fecha,
          e.visible_para_padres,
          COUNT(c.id)
        FROM evaluacion e
        INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
        LEFT  JOIN calificacion c          ON e.id = c.evaluacion_id
        WHERE e.tema_id  = p_tema_id
          AND e.activo   = true
          AND (p_periodo_evaluacion_id IS NULL OR e.periodo_evaluacion_id = p_periodo_evaluacion_id)
        GROUP BY
          e.id, e.nombre, e.tipo, de.nombre, de.codigo, de.color,
          e.puntaje_maximo, e.peso_en_dimension, e.fecha, e.visible_para_padres, de.orden
        ORDER BY de.orden, e.fecha, e.nombre;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función evaluaciones_por_tema creada');

    // =============================================
    // 5️⃣ FUNCIÓN: resumen_evaluaciones_unidad
    // =============================================
    console.log('🔧 Creando función RESUMEN_EVALUACIONES_UNIDAD...');

    await client.query(`
      CREATE OR REPLACE FUNCTION resumen_evaluaciones_unidad(
        p_grado_materia_id      INTEGER,
        p_periodo_evaluacion_id INTEGER DEFAULT NULL
      )
      RETURNS TABLE(
        unidad_id          INTEGER,
        unidad_titulo      VARCHAR,
        numero_unidad      INTEGER,
        tema_id            INTEGER,
        tema_titulo        VARCHAR,
        numero_tema        INTEGER,
        dimension_codigo   VARCHAR,
        dimension_nombre   VARCHAR,
        total_evaluaciones BIGINT,
        puntaje_total      NUMERIC
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          u.id::INTEGER,
          u.titulo::VARCHAR,
          u.numero_unidad::INTEGER,
          t.id::INTEGER,
          t.titulo::VARCHAR,
          t.numero_tema::INTEGER,
          de.codigo::VARCHAR,
          de.nombre::VARCHAR,
          COUNT(e.id),
          COALESCE(SUM(e.puntaje_maximo), 0)
        FROM unidad_tematica u
        INNER JOIN tema t              ON t.unidad_tematica_id = u.id   AND t.activo = true
        LEFT  JOIN evaluacion e        ON e.tema_id            = t.id   AND e.activo = true
          AND (p_periodo_evaluacion_id IS NULL OR e.periodo_evaluacion_id = p_periodo_evaluacion_id)
        LEFT  JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
        WHERE u.grado_materia_id = p_grado_materia_id
          AND u.activo           = true
        GROUP BY
          u.id, u.titulo, u.numero_unidad,
          t.id, t.titulo, t.numero_tema,
          de.codigo, de.nombre, de.orden
        ORDER BY u.numero_unidad, t.numero_tema, de.orden;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('  ✅ Función resumen_evaluaciones_unidad creada');

    // =============================================
    // PERMISO ADICIONAL
    // =============================================
    await client.query(`
      INSERT INTO permisos (modulo, accion, nombre, descripcion)
      VALUES ('evaluacion', 'vincular_tema', 'evaluacion.vincular_tema', 'Vincular evaluación a un tema del temario')
      ON CONFLICT (nombre) DO NOTHING
    `);

    console.log('  ✅ Permiso evaluacion.vincular_tema registrado');

    await client.query('COMMIT');

    // =============================================
    // IMPRIMIR CAMBIOS EN CÓDIGO (Model + Controller + Routes)
    // =============================================
    console.log('\n✅ Base de datos actualizada exitosamente\n');
    console.log('━'.repeat(60));
    console.log('📝 CAMBIOS REQUERIDOS EN EL CÓDIGO');
    console.log('━'.repeat(60));

    // ── MODEL ────────────────────────────────────────────────────
    console.log(`
╔══════════════════════════════════════════════════════════╗
║  models/Notas.js  —  class Evaluacion                   ║
╚══════════════════════════════════════════════════════════╝

/* ── 1. create() ─────────────────────────────────────────
   Agregar tema_id a los parámetros y al INSERT           */

  static async create(data) {
    const {
      asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
      nombre, tipo, descripcion, fecha, puntaje_maximo, peso_en_dimension,
      visible_para_padres,
      tema_id          // ← NUEVO
    } = data;

    const result = await pool.query(\`
      INSERT INTO evaluacion (
        asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
        nombre, tipo, descripcion, fecha, puntaje_maximo, peso_en_dimension,
        visible_para_padres,
        tema_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    \`, [
      asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
      nombre, tipo || null, descripcion || null, fecha || null,
      puntaje_maximo || 100, peso_en_dimension || 1.00, visible_para_padres ?? false,
      tema_id || null     // ← NUEVO (posición $11)
    ]);
    return result.rows[0];
  }

/* ── 2. findAll() ────────────────────────────────────────
   a) Agregar tema_id al destructuring de filters
   b) Agregar filtro WHERE si viene tema_id
   c) Agregar LEFT JOIN con tema y unidad_tematica
   d) Agregar columnas al SELECT                          */

  static async findAll(filters = {}) {
    const {
      page = 1, limit = 20,
      asignacion_docente_id, dimension_evaluacion_id,
      periodo_evaluacion_id, activo,
      tema_id           // ← NUEVO
    } = filters;
    const offset = (page - 1) * limit;
    let where = []; let params = []; let p = 1;

    if (asignacion_docente_id)   { where.push(\`e.asignacion_docente_id = $\${p++}\`);   params.push(asignacion_docente_id); }
    if (dimension_evaluacion_id) { where.push(\`e.dimension_evaluacion_id = $\${p++}\`); params.push(dimension_evaluacion_id); }
    if (periodo_evaluacion_id)   { where.push(\`e.periodo_evaluacion_id = $\${p++}\`);   params.push(periodo_evaluacion_id); }
    if (activo !== undefined)    { where.push(\`e.activo = $\${p++}\`);                  params.push(activo); }
    if (tema_id)                 { where.push(\`e.tema_id = $\${p++}\`);                 params.push(tema_id); }  // ← NUEVO

    const whereClause = where.length ? \`WHERE \${where.join(' AND ')}\` : '';
    const countResult = await pool.query(\`SELECT COUNT(*) FROM evaluacion e \${whereClause}\`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(\`
      SELECT
        e.*,
        de.nombre AS dimension_nombre, de.codigo AS dimension_codigo, de.color AS dimension_color,
        pe.nombre AS periodo_nombre,
        mat.nombre AS materia_nombre,
        -- Tema y unidad (pueden ser NULL)              ← NUEVO bloque
        t.id     AS tema_id,
        t.titulo AS tema_titulo,
        t.numero_tema,
        u.id     AS unidad_id,
        u.titulo AS unidad_titulo,
        u.numero_unidad
      FROM evaluacion e
      INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
      INNER JOIN periodo_evaluacion pe   ON e.periodo_evaluacion_id = pe.id
      INNER JOIN asignacion_docente ad   ON e.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm        ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat             ON gm.materia_id = mat.id
      LEFT  JOIN tema t                  ON e.tema_id = t.id           -- ← NUEVO
      LEFT  JOIN unidad_tematica u       ON t.unidad_tematica_id = u.id -- ← NUEVO
      \${whereClause}
      ORDER BY e.fecha DESC, de.orden, e.nombre
      LIMIT $\${p} OFFSET $\${p + 1}
    \`, [...params, limit, offset]);

    return {
      evaluaciones: result.rows,
      paginacion: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) }
    };
  }

/* ── 3. findById() ───────────────────────────────────────
   Agregar LEFT JOIN con tema y unidad, y las columnas   */

  static async findById(id) {
    const result = await pool.query(\`
      SELECT
        e.*,
        de.nombre AS dimension_nombre, de.codigo AS dimension_codigo,
        de.porcentaje_ponderacion, pe.nombre AS periodo_nombre,
        mat.nombre AS materia_nombre, mat.codigo AS materia_codigo,
        -- Tema y unidad                                ← NUEVO bloque
        t.id              AS tema_id,
        t.titulo          AS tema_titulo,
        t.numero_tema,
        t.nivel_dificultad AS tema_nivel_dificultad,
        t.descripcion     AS tema_descripcion,
        u.id              AS unidad_id,
        u.titulo          AS unidad_titulo,
        u.numero_unidad
      FROM evaluacion e
      INNER JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
      INNER JOIN periodo_evaluacion pe   ON e.periodo_evaluacion_id = pe.id
      INNER JOIN asignacion_docente ad   ON e.asignacion_docente_id = ad.id
      INNER JOIN grado_materia gm        ON ad.grado_materia_id = gm.id
      INNER JOIN materia mat             ON gm.materia_id = mat.id
      LEFT  JOIN tema t                  ON e.tema_id = t.id           -- ← NUEVO
      LEFT  JOIN unidad_tematica u       ON t.unidad_tematica_id = u.id -- ← NUEVO
      WHERE e.id = $1
    \`, [id]);
    return result.rows[0];
  }

/* ── 4. update() ─────────────────────────────────────────
   Agregar tema_id al SET                                */

  static async update(id, data) {
    const {
      nombre, tipo, descripcion, fecha, puntaje_maximo,
      peso_en_dimension, visible_para_padres, activo,
      tema_id           // ← NUEVO
    } = data;
    const result = await pool.query(\`
      UPDATE evaluacion SET
        nombre=$1, tipo=$2, descripcion=$3, fecha=$4, puntaje_maximo=$5,
        peso_en_dimension=$6, visible_para_padres=$7, activo=$8,
        tema_id=$9,         -- ← NUEVO ($9)
        fecha_publicacion = CASE WHEN $7=true AND visible_para_padres=false THEN CURRENT_TIMESTAMP ELSE fecha_publicacion END,
        updated_at=CURRENT_TIMESTAMP
      WHERE id = $10        -- ← era $9, ahora $10
      RETURNING *
    \`, [nombre, tipo, descripcion || null, fecha, puntaje_maximo,
        peso_en_dimension, visible_para_padres, activo,
        tema_id || null,    // ← NUEVO
        id]);
    return result.rows[0];
  }

/* ── 5. getTemario() — MÉTODO NUEVO ──────────────────────
   Temas de una materia con sus evaluaciones agrupadas.
   Útil para la vista de "temario con actividades"      */

  static async getTemario({ grado_materia_id, periodo_evaluacion_id }) {
    const result = await pool.query(\`
      SELECT
        u.id                                AS unidad_id,
        u.numero_unidad,
        u.titulo                            AS unidad_titulo,
        u.descripcion                       AS unidad_descripcion,
        -- Tema
        t.id                               AS tema_id,
        t.numero_tema,
        t.titulo                           AS tema_titulo,
        t.nivel_dificultad,
        -- Evaluaciones del tema (agrupadas en JSON)
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id',                   e.id,
              'nombre',               e.nombre,
              'tipo',                 e.tipo,
              'fecha',                e.fecha,
              'puntaje_maximo',       e.puntaje_maximo,
              'peso_en_dimension',    e.peso_en_dimension,
              'dimension_nombre',     de.nombre,
              'dimension_codigo',     de.codigo,
              'dimension_color',      de.color,
              'visible_para_padres',  e.visible_para_padres
            ) ORDER BY de.orden, e.fecha
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        )                                   AS evaluaciones,
        COUNT(e.id)                         AS total_evaluaciones
      FROM unidad_tematica u
      INNER JOIN tema t ON t.unidad_tematica_id = u.id AND t.activo = true
      LEFT JOIN evaluacion e
        ON  e.tema_id = t.id
        AND e.activo  = true
        AND ($2::INTEGER IS NULL OR e.periodo_evaluacion_id = $2)
      LEFT JOIN dimension_evaluacion de ON e.dimension_evaluacion_id = de.id
      WHERE u.grado_materia_id = $1
        AND u.activo = true
      GROUP BY
        u.id, u.numero_unidad, u.titulo, u.descripcion,
        t.id, t.numero_tema, t.titulo, t.nivel_dificultad
      ORDER BY u.numero_unidad, t.numero_tema
    \`, [grado_materia_id, periodo_evaluacion_id || null]);

    return result.rows;
  }
`);

    // ── CONTROLLER ───────────────────────────────────────────────
    console.log(`
╔══════════════════════════════════════════════════════════╗
║  controllers/notasController.js                         ║
╚══════════════════════════════════════════════════════════╝

/* ── 1. EvaluacionController.crear() ────────────────────
   Agregar tema_id al destructuring y pasarlo al model   */

  static async crear(req, res) {
    try {
      const {
        asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
        nombre, tipo, descripcion, fecha, puntaje_maximo, peso_en_dimension,
        visible_para_padres,
        tema_id       // ← NUEVO
      } = req.body;

      if (!asignacion_docente_id || !dimension_evaluacion_id || !periodo_evaluacion_id || !nombre) {
        return res.status(400).json({
          success: false,
          message: 'asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id y nombre son requeridos'
        });
      }

      // Validar que el tema_id pertenece a la misma materia (opcional pero recomendado)
      if (tema_id) {
        const temaCheck = await pool.query(\`
          SELECT t.id
          FROM tema t
          INNER JOIN unidad_tematica u ON t.unidad_tematica_id = u.id
          INNER JOIN asignacion_docente ad ON u.grado_materia_id = ad.grado_materia_id
          WHERE t.id = $1 AND ad.id = $2 AND t.activo = true
        \`, [tema_id, asignacion_docente_id]);

        if (!temaCheck.rows[0]) {
          return res.status(400).json({
            success: false,
            message: 'El tema_id no pertenece a esta asignación docente'
          });
        }
      }

      const evaluacion = await Evaluacion.create({
        asignacion_docente_id, dimension_evaluacion_id, periodo_evaluacion_id,
        nombre, tipo, descripcion, fecha, puntaje_maximo, peso_en_dimension,
        visible_para_padres,
        tema_id       // ← NUEVO
      });

      // ...resto del método igual (ActividadLog, res.status(201)...)
    }
  }

/* ── 2. EvaluacionController.listar() ───────────────────
   Agregar tema_id al parseo de query params             */

  static async listar(req, res) {
    try {
      const {
        page, limit, asignacion_docente_id,
        dimension_evaluacion_id, periodo_evaluacion_id, activo,
        tema_id       // ← NUEVO
      } = req.query;

      const result = await Evaluacion.findAll({
        page:                    parseInt(page)  || 1,
        limit:                   parseInt(limit) || 20,
        asignacion_docente_id:   asignacion_docente_id   ? parseInt(asignacion_docente_id)   : undefined,
        dimension_evaluacion_id: dimension_evaluacion_id ? parseInt(dimension_evaluacion_id) : undefined,
        periodo_evaluacion_id:   periodo_evaluacion_id   ? parseInt(periodo_evaluacion_id)   : undefined,
        activo:                  activo !== undefined     ? activo === 'true'                : undefined,
        tema_id:                 tema_id                 ? parseInt(tema_id)                : undefined  // ← NUEVO
      });

      res.json({ success: true, data: result });
    } catch (error) { /* igual */ }
  }

/* ── 3. EvaluacionController.actualizar() ───────────────
   El body ya llega completo a Evaluacion.update(),
   que ahora acepta tema_id — no hay nada extra que
   cambiar en el controller salvo documentar el campo.
   El método update() en el model ya lo maneja.         */

/* ── 4. TemarioController — CLASE NUEVA ─────────────────
   Agregar al final de notasController.js, antes del
   bloque export {}                                      */

class TemarioController {

  /**
   * GET /api/notas/temario/:grado_materia_id
   * Query: ?periodo_evaluacion_id=X (opcional)
   *
   * Devuelve el temario completo de una materia con las
   * evaluaciones agrupadas por unidad → tema.
   * Útil para la vista del docente al crear evaluaciones.
   */
  static async getTemario(req, res) {
    try {
      const { grado_materia_id } = req.params;
      const { periodo_evaluacion_id } = req.query;

      const temario = await Evaluacion.getTemario({
        grado_materia_id:      parseInt(grado_materia_id),
        periodo_evaluacion_id: periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : null
      });

      res.json({
        success: true,
        data: { temario, total_unidades: [...new Set(temario.map(r => r.unidad_id))].length }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al obtener temario: ' + error.message
      });
    }
  }
}

// Agregar TemarioController al export:
// export { ..., TemarioController };
`);

    // ── ROUTES ───────────────────────────────────────────────────
    console.log(`
╔══════════════════════════════════════════════════════════╗
║  routes/notasRoutes.js  —  2 rutas nuevas               ║
╚══════════════════════════════════════════════════════════╝

// 1. Agregar TemarioController al import:
import {
  ...,
  TemarioController   // ← NUEVO
} from '../controllers/notasController.js';

// 2. Agregar las dos rutas nuevas dentro del bloque
//    de evaluaciones (después de GET /evaluaciones/:id):

/**
 * GET /api/notas/temario/:grado_materia_id
 * Temario completo con evaluaciones agrupadas por unidad/tema
 * Query: ?periodo_evaluacion_id=X (opcional)
 *
 * Flujo de uso:
 *   Docente abre la pantalla "crear evaluación"
 *   → llama este endpoint para poblar el selector de tema
 *   → elige Unidad 2 → Tema 3 → llena el formulario
 *   → POST /evaluaciones con tema_id incluido
 */
router.get(
  '/temario/:grado_materia_id',
  authorize('evaluacion.leer'),
  TemarioController.getTemario
);

/**
 * GET /api/notas/evaluaciones/tema/:tema_id
 * Evaluaciones de un tema específico (usa la función PG)
 * Query: ?periodo_evaluacion_id=X (opcional)
 *
 * Útil para mostrar en la vista del temario cuántas
 * evaluaciones tiene cada tema y cuáles son.
 */
router.get(
  '/evaluaciones/tema/:tema_id',
  authorize('evaluacion.leer'),
  async (req, res) => {
    try {
      const { tema_id } = req.params;
      const { periodo_evaluacion_id } = req.query;

      const result = await pool.query(
        \`SELECT * FROM evaluaciones_por_tema($1, $2)\`,
        [parseInt(tema_id), periodo_evaluacion_id ? parseInt(periodo_evaluacion_id) : null]
      );

      res.json({ success: true, data: { evaluaciones: result.rows } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// IMPORTANTE: esta ruta debe ir ANTES de GET /evaluaciones/:id
// para que Express no interprete "tema" como un :id numérico.
`);

    console.log('\n📊 RESUMEN FINAL:');
    console.log('┌──────────────────────────────────────────────────────┐');
    console.log('│ ✅ 1  columna   → evaluacion.tema_id (FK nullable)  │');
    console.log('│ ✅ 1  índice    → idx_evaluacion_tema               │');
    console.log('│ ✅ 1  vista     → vista_evaluaciones_con_tema        │');
    console.log('│ ✅ 2  funciones → evaluaciones_por_tema()            │');
    console.log('│                   resumen_evaluaciones_unidad()      │');
    console.log('│ ✅ 1  permiso   → evaluacion.vincular_tema           │');
    console.log('│ ✅ 5  cambios   → model Evaluacion (create/findAll/  │');
    console.log('│                   findById/update/getTemario)        │');
    console.log('│ ✅ 1  clase     → TemarioController (nuevo)          │');
    console.log('│ ✅ 2  rutas     → GET /temario/:id                   │');
    console.log('│                   GET /evaluaciones/tema/:id         │');
    console.log('└──────────────────────────────────────────────────────┘\n');
    console.log('💡 FLUJO DE USO:');
    console.log('   1. GET /api/notas/temario/:grado_materia_id');
    console.log('      → el frontend popula el selector Unidad → Tema');
    console.log('   2. POST /api/notas/evaluaciones  con { tema_id: X, ... }');
    console.log('      → la evaluación queda vinculada al tema');
    console.log('   3. GET /api/notas/evaluaciones/tema/:tema_id');
    console.log('      → ver qué evaluaciones tiene un tema puntual\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    rl.close();
    process.exit(0);
  }
}

complementarEvaluacionTema().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});