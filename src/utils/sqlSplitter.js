// utils/sqlSplitter.js  ← archivo nuevo
/**
 * Divide un dump SQL en sentencias individuales respetando:
 * - Strings entre comillas simples (incluidos los que contienen ';')
 * - Comentarios de línea (--)
 * - Comentarios de bloque (/* ... *\/)
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Comentario de línea: saltar hasta el fin de línea
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // Comentario de bloque: saltar hasta */
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // String entre comillas simples: copiar íntegro (respeta '' como escape)
    if (ch === "'") {
      current += ch;
      i++;
      while (i < sql.length) {
        const sc = sql[i];
        current += sc;
        i++;
        if (sc === "'") {
          // Comilla doble '' es escape, no cierre
          if (sql[i] === "'") {
            current += sql[i];
            i++;
          } else {
            break; // fin del string
          }
        }
      }
      continue;
    }

    // String entre comillas dobles (identificadores)
    if (ch === '"') {
      current += ch;
      i++;
      while (i < sql.length) {
        const dc = sql[i];
        current += dc;
        i++;
        if (dc === '"') break;
      }
      continue;
    }

    // Dollar-quoting de PostgreSQL: $tag$...$tag$
    if (ch === '$') {
      const rest = sql.slice(i);
      const tagMatch = rest.match(/^\$([A-Za-z_]*)\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        const closeIdx = sql.indexOf(tag, i + tag.length);
        if (closeIdx !== -1) {
          current += sql.slice(i, closeIdx + tag.length);
          i = closeIdx + tag.length;
          continue;
        }
      }
    }

    // Fin de sentencia
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Última sentencia sin ';' final
  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);

  return statements;
}