// models/Backup.js
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pool } from '../db/pool.js';
import UploadFile from '../utils/uploadFile.js';
import { splitSqlStatements } from '../utils/sqlSplitter.js';

// ─── Helpers internos ────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function generateKey() {
  return `bkp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Escapar valores para SQL INSERT
function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;

  // ← NUEVO: arrays de PostgreSQL
  if (Array.isArray(val)) {
    const elements = val.map(item => {
      if (item === null || item === undefined) return 'NULL';
      if (typeof item === 'boolean') return item ? 'TRUE' : 'FALSE';
      if (typeof item === 'number') return String(item);
      // Strings: escapar comillas simples y envolver en comillas dobles (formato pg array)
      return `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    });
    return `'{${elements.join(',')}}'`;
  }

  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ─── Generador de dump SQL ────────────────────────────────────────────────────
// Obtiene todas las tablas del schema public y genera:
//   - SET / configuración inicial
//   - CREATE TABLE con columnas, tipos, defaults, constraints
//   - Sequences (para restaurar auto-increment)
//   - INSERT INTO con todos los datos
async function generarDumpSQL(client) {
  const lines = [];

  lines.push(`-- ============================================================`);
  lines.push(`-- BACKUP GENERADO AUTOMÁTICAMENTE`);
  lines.push(`-- Fecha: ${new Date().toISOString()}`);
  lines.push(`-- ============================================================`);
  lines.push(`SET client_encoding = 'UTF8';`);
  lines.push(`SET standard_conforming_strings = on;`);
  lines.push(`SET check_function_bodies = false;`);
  lines.push(`SET client_min_messages = warning;`);
  lines.push(`SET row_security = off;`);
  lines.push('');

  // 1. Obtener todas las tablas del schema public (excluir tablas internas)
  const tablesResult = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  const tablas = tablesResult.rows.map(r => r.tablename);

  // 2. Para cada tabla: schema + datos
  for (const tabla of tablas) {
    lines.push(`-- ────────────────────────────────────────────────`);
    lines.push(`-- Tabla: ${tabla}`);
    lines.push(`-- ────────────────────────────────────────────────`);

    // 2a. Obtener columnas con sus tipos y defaults
    const colsResult = await client.query(`
      SELECT
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.column_default,
        c.is_nullable,
        c.udt_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = $1
      ORDER BY c.ordinal_position
    `, [tabla]);

    // 2b. Obtener constraints (PK, UNIQUE, CHECK, FK)
    const constraintsResult = await client.query(`
      SELECT
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name  AS foreign_table,
        ccu.column_name AS foreign_column,
        cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema    = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
             ON tc.constraint_name = ccu.constraint_name
            AND tc.table_schema    = ccu.table_schema
      LEFT JOIN information_schema.check_constraints cc
             ON tc.constraint_name = cc.constraint_name
            AND tc.table_schema    = cc.constraint_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name   = $1
      ORDER BY tc.constraint_type
    `, [tabla]);

    // Construir CREATE TABLE
    const colDefs = colsResult.rows.map(col => {
      let tipo = col.udt_name === 'varchar' && col.character_maximum_length
        ? `character varying(${col.character_maximum_length})`
        : col.data_type === 'USER-DEFINED'
          ? col.udt_name
          : col.data_type;

      let def = `    "${col.column_name}" ${tipo}`;
      if (col.column_default) def += ` DEFAULT ${col.column_default}`;
      if (col.is_nullable === 'NO') def += ` NOT NULL`;
      return def;
    });

    // Agregar constraints como PRIMARY KEY y UNIQUE
    const constraintDefs = [];
    const pkCols = constraintsResult.rows
      .filter(c => c.constraint_type === 'PRIMARY KEY')
      .map(c => `"${c.column_name}"`);
    if (pkCols.length > 0) {
      constraintDefs.push(`    PRIMARY KEY (${pkCols.join(', ')})`);
    }

    const uniqueCols = constraintsResult.rows.filter(c => c.constraint_type === 'UNIQUE');
    for (const u of uniqueCols) {
      constraintDefs.push(`    UNIQUE ("${u.column_name}")`);
    }

    const allDefs = [...colDefs, ...constraintDefs];

    lines.push(`CREATE TABLE IF NOT EXISTS "${tabla}" (`);
    lines.push(allDefs.join(',\n'));
    lines.push(`);`);
    lines.push('');

    // 2c. Datos: INSERT INTO
    const dataResult = await client.query(`SELECT * FROM "${tabla}"`);

    // ← NUEVO: detectar columnas generadas para excluirlas del INSERT
    const generatedColsResult = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = $1
    AND is_generated = 'ALWAYS'
`, [tabla]);

    const generatedCols = new Set(
      generatedColsResult.rows.map(r => r.column_name)
    );

    // TRUNCATE igual que antes
    lines.push(`TRUNCATE TABLE "${tabla}" RESTART IDENTITY CASCADE;`);
    lines.push('');

    if (dataResult.rows.length > 0) {
      // Filtrar campos generados tanto en columnas como en valores
      const fields = dataResult.fields.filter(f => !generatedCols.has(f.name));
      const columnas = fields.map(f => `"${f.name}"`).join(', ');

      lines.push(`-- Datos de ${tabla} (${dataResult.rows.length} filas)`);

      const LOTE = 100;
      for (let i = 0; i < dataResult.rows.length; i += LOTE) {
        const lote = dataResult.rows.slice(i, i + LOTE);
        const valores = lote.map(row => {
          // Solo los valores de columnas no generadas
          const vals = fields.map(f => escapeSqlValue(row[f.name]));
          return `(${vals.join(', ')})`;
        }).join(',\n  ');

        lines.push(`INSERT INTO "${tabla}" (${columnas}) VALUES`);
        lines.push(`  ${valores}`);
        lines.push(`;`);
      }
      lines.push('');
    }

    // 2d. Resetear sequences (para que los SERIAL sigan desde el máximo)
    const seqResult = await client.query(`
      SELECT
        kcu.column_name,
        pg_get_serial_sequence($1, kcu.column_name) AS seq_name
      FROM information_schema.key_column_usage kcu
      INNER JOIN information_schema.table_constraints tc
             ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name   = $1
        AND tc.constraint_type = 'PRIMARY KEY'
    `, [tabla]);

    for (const seq of seqResult.rows) {
      if (seq.seq_name) {
        lines.push(
          `SELECT setval('${seq.seq_name}', COALESCE((SELECT MAX("${seq.column_name}") FROM "${tabla}"), 1));`
        );
      }
    }

    lines.push('');
  }

  lines.push(`-- FIN DEL BACKUP`);
  return lines.join('\n');
}

// ─── Modelo ──────────────────────────────────────────────────────────────────
class Backup {

  static async findAll() {
    const result = await pool.query(`
      SELECT
        br.*,
        u.username AS creado_por_username,
        r.username AS restaurado_por_username
      FROM backup_registro br
      LEFT JOIN usuarios u ON br.creado_por     = u.id
      LEFT JOIN usuarios r ON br.restaurado_por = r.id
      WHERE br.deleted_at IS NULL
      ORDER BY br.created_at DESC
    `);
    return result.rows;
  }

  static async findById(backup_key) {
    const result = await pool.query(`
      SELECT
        br.*,
        u.username AS creado_por_username,
        r.username AS restaurado_por_username
      FROM backup_registro br
      LEFT JOIN usuarios u ON br.creado_por     = u.id
      LEFT JOIN usuarios r ON br.restaurado_por = r.id
      WHERE br.backup_key = $1
        AND br.deleted_at IS NULL
    `, [backup_key]);
    return result.rows[0] || null;
  }

  // ── Generar backup (sin pg_dump) ─────────────────────────────────────────────
  // Usa el pool de pg para leer el schema y los datos → genera .sql → Cloudinary
  static async generate(usuario_id) {
    const backup_key = generateKey();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.sql`;

    const client = await pool.connect();
    try {
      // 1. Generar el SQL completo programáticamente
      const sqlContent = await generarDumpSQL(client);
      const buffer = Buffer.from(sqlContent, 'utf8');
      const sizeBytes = buffer.length;

      // 2. Subir a Cloudinary como raw (igual que permisos_adjuntos)
      const uploaded = await UploadFile.uploadFromBuffer(
        buffer,
        'backups_db',
        `${backup_key}.sql`,
        'raw'
      );

      // 3. Registrar en PostgreSQL
      const result = await pool.query(`
        INSERT INTO backup_registro (
          backup_key, filename, database_name,
          cloudinary_url, cloudinary_public_id,
          size_bytes, size_formatted, status, creado_por
        )
        VALUES ($1, $2, current_database(), $3, $4, $5, $6, 'completado', $7)
        RETURNING *
      `, [
        backup_key, filename,
        uploaded.url, uploaded.public_id,
        sizeBytes, formatSize(sizeBytes),
        usuario_id,
      ]);

      return result.rows[0];

    } finally {
      client.release();
    }
  }

  // ── Restaurar BD ─────────────────────────────────────────────────────────────
  // Descarga el .sql de Cloudinary y ejecuta cada sentencia con el pool
  // models/Backup.js — método restore()
  static async restore(backup_key, usuario_id) {
    const backup = await Backup.findById(backup_key);
    if (!backup) throw new Error('Backup no encontrado');

    const response = await fetch(backup.cloudinary_url);
    if (!response.ok) throw new Error('No se pudo descargar el archivo desde Cloudinary');
    const sqlContent = await response.text();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ← Deshabilitar triggers (incluye FK checks) durante la restauración
      await client.query('SET session_replication_role = replica;');

      const SQL_KEYWORDS = new Set([
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'CREATE', 'DROP', 'ALTER', 'TRUNCATE',
        'SET', 'DO', 'GRANT', 'REVOKE', 'COMMENT',
      ]);

      const sentencias = splitSqlStatements(sqlContent).filter(s => {
        const firstWord = s.split(/\s+/)[0].toUpperCase();
        return SQL_KEYWORDS.has(firstWord);
      });

      for (const sentencia of sentencias) {
        await client.query(sentencia);
      }

      // ← Volver a habilitar FK checks
      await client.query('SET session_replication_role = DEFAULT;');

      await client.query('COMMIT');

      const result = await pool.query(`
      UPDATE backup_registro
      SET ultima_restauracion_at = CURRENT_TIMESTAMP, restaurado_por = $1
      WHERE backup_key = $2 RETURNING *
    `, [usuario_id, backup_key]);

      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      // Asegurarse de restaurar el modo aunque falle
      await client.query('SET session_replication_role = DEFAULT;').catch(() => { });
      throw new Error('Error al ejecutar el backup: ' + error.message);
    } finally {
      client.release();
    }
  }

  // ── Eliminar backup ──────────────────────────────────────────────────────────
  static async delete(backup_key, usuario_id) {
    const backup = await Backup.findById(backup_key);
    if (!backup) throw new Error('Backup no encontrado');

    try {
      await UploadFile.deleteFile(backup.cloudinary_public_id, 'raw');
    } catch (err) {
      console.warn('⚠️  Cloudinary delete warning:', err.message);
    }

    const result = await pool.query(`
      UPDATE backup_registro
      SET deleted_at = CURRENT_TIMESTAMP, eliminado_por = $1
      WHERE backup_key = $2 RETURNING *
    `, [usuario_id, backup_key]);

    return result.rows[0];
  }

  // ── Limpiar backups antiguos si se supera el límite ──────────────────────────
  static async limpiarAntiguos(maxCount, usuario_id) {
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM backup_registro WHERE deleted_at IS NULL
    `);
    const total = parseInt(countResult.rows[0].count);
    if (total <= maxCount) return { eliminados: 0 };

    const sobran = total - maxCount;
    const viejosResult = await pool.query(`
      SELECT backup_key, cloudinary_public_id, filename
      FROM backup_registro
      WHERE deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `, [sobran]);

    const eliminados = [];
    for (const viejo of viejosResult.rows) {
      try {
        await UploadFile.deleteFile(viejo.cloudinary_public_id, 'raw');
      } catch (err) {
        console.warn(`⚠️  Cloudinary: ${viejo.filename}:`, err.message);
      }
      await pool.query(`
        UPDATE backup_registro
        SET deleted_at = CURRENT_TIMESTAMP, eliminado_por = $1
        WHERE backup_key = $2
      `, [usuario_id, viejo.backup_key]);
      eliminados.push(viejo.filename);
    }

    return { eliminados: eliminados.length, archivos: eliminados };
  }

  static async count() {
    const result = await pool.query(`
      SELECT COUNT(*) FROM backup_registro WHERE deleted_at IS NULL
    `);
    return parseInt(result.rows[0].count);
  }
}

export default Backup;