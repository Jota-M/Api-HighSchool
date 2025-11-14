import { pool } from '../src/db/pool.js';
import TokenUtils from '../src/utils/tokenUtils.js'; // si usas bcrypt o hash

// Lista de usuarios a crear con su rol
const usuarios = [
  { username: 'admin', email: 'admin@lvc.edu.bo', password: '12345678', rol: 'admin' },
  { username: 'secretaria', email: 'secretaria@lvc.edu.bo', password: '12345678', rol: 'secretaria' },
  { username: 'docente', email: 'docente@lvc.edu.bo', password: '12345678', rol: 'docente' },
  { username: 'profesor', email: 'profesor@lvc.edu.bo', password: '12345678', rol: 'profesor' },
  { username: 'estudiante', email: 'estudiante@lvc.edu.bo', password: '12345678', rol: 'estudiante' },
  { username: 'padre', email: 'padre@lvc.edu.bo', password: '12345678', rol: 'padre' },
];

async function createUsersAndAssignRoles() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const u of usuarios) {
      // 1️⃣ Hashear la contraseña
      const hashedPassword = await TokenUtils.hashPassword(u.password);

      // 2️⃣ Crear usuario (si no existe)
      const resultUser = await client.query(
        `
        INSERT INTO usuarios (username, email, password, activo, verificado)
        VALUES ($1, $2, $3, true, true)
        ON CONFLICT (username) DO UPDATE SET email = $2, password = $3
        RETURNING id;
        `,
        [u.username, u.email, hashedPassword]
      );

      const userId = resultUser.rows[0].id;

      // 3️⃣ Asignar rol
      await client.query(
        `
        INSERT INTO usuario_roles (usuario_id, rol_id)
        VALUES (
          $1,
          (SELECT id FROM roles WHERE nombre = $2)
        )
        ON CONFLICT (usuario_id, rol_id) DO NOTHING;
        `,
        [userId, u.rol]
      );

      console.log(`✅ Usuario '${u.username}' creado y rol '${u.rol}' asignado.`);
    }

    await client.query('COMMIT');
    console.log("\n🎉 Todos los usuarios y roles creados correctamente.");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error al crear usuarios o asignar roles:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

createUsersAndAssignRoles();
