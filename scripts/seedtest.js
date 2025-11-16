// scripts/createSuperAdmin.mjs
import { createInterface } from 'readline';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db/pool.js';  // Asegúrate que tu export en database.js sea ESM

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createSuperAdmin() {
  const client = await pool.connect();
  
  try {
    console.log('🔐 Creación de Super Administrador\n');

    // Solicitar datos
    const username = await question('Username: ');
    const email = await question('Email: ');
    const password = await question('Password: ');

    // Validaciones
    if (!username || !email || !password) {
      console.error('❌ Todos los campos son requeridos');
      process.exit(1);
    }

    if (password.length < 8) {
      console.error('❌ La contraseña debe tener al menos 8 caracteres');
      process.exit(1);
    }

    // Hash de contraseña
    console.log('\n🔄 Generando hash de contraseña...');
    const hashedPassword = await bcrypt.hash(password, 12);

    await client.query('BEGIN');

    // Crear usuario
    console.log('🔄 Creando usuario...');
    const userResult = await client.query(
      `INSERT INTO usuarios (username, email, password, verificado, activo)
       VALUES ($1, $2, $3, true, true)
       RETURNING *`,
      [username, email, hashedPassword]
    );

    const usuario = userResult.rows[0];
    console.log(`  ✓ Usuario creado con ID: ${usuario.id}`);

    // Obtener rol super_admin
    const roleResult = await client.query(
      `SELECT id FROM roles WHERE nombre = 'super_admin'`
    );

    if (roleResult.rows.length === 0) {
      throw new Error('❌ Rol super_admin no encontrado. Ejecuta el seed primero.');
    }

    const superAdminRoleId = roleResult.rows[0].id;

    // Asignar rol
    console.log('🔄 Asignando rol super_admin...');
    await client.query(
      `INSERT INTO usuario_roles (usuario_id, rol_id)
       VALUES ($1, $2)`,
      [usuario.id, superAdminRoleId]
    );

    await client.query('COMMIT');

    console.log('\n✅ Super Admin creado exitosamente!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   ID: ${usuario.id}`);
    console.log(`   Username: ${usuario.username}`);
    console.log(`   Email: ${usuario.email}`);
    console.log(`   Rol: super_admin`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Verificar permisos
    const permisosResult = await client.query(
      `SELECT COUNT(*) as total
       FROM usuarios u
       JOIN usuario_roles ur ON u.id = ur.usuario_id
       JOIN roles r ON ur.rol_id = r.id
       JOIN rol_permisos rp ON r.id = rp.rol_id
       WHERE u.id = $1`,
      [usuario.id]
    );

    console.log(`📊 Permisos asignados: ${permisosResult.rows[0].total}`);

  } catch (error) {
    await client.query('ROLLBACK');
    
    if (error.constraint === 'usuarios_username_key') {
      console.error('❌ Error: El username ya existe');
    } else if (error.constraint === 'usuarios_email_key') {
      console.error('❌ Error: El email ya está registrado');
    } else {
      console.error('❌ Error:', error.message);
    }
  } finally {
    client.release();
    rl.close();
    process.exit(0);
  }
}

// Ejecutar
createSuperAdmin().catch(error => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});
