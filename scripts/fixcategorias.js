import { createInterface } from 'readline';
import { pool } from '../src/db/pool.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve));
}

async function seedTiposIngreso() {
  const client = await pool.connect();
  try {
    console.log('\n🔧 CORRECCIÓN Y SEED: TIPOS DE INGRESO');
    console.log('Este script realizará las siguientes acciones:');
    console.log('\n📋 ACCIONES:');
    console.log('  1️⃣  Eliminar constraint problemático tipo_ingreso_categoria_check');
    console.log('  2️⃣  Recrear constraint con sintaxis correcta');
    console.log('  3️⃣  Insertar/actualizar 10 tipos de ingreso predefinidos');
    console.log('  4️⃣  Verificar que todo funcione correctamente');
    console.log('\n📦 TIPOS DE INGRESO A INSERTAR:');
    console.log('  ✅ Mensualidad (#3b82f6)');
    console.log('  ✅ Matrícula (#10b981)');
    console.log('  ✅ Transporte Escolar (#facc15)');
    console.log('  ✅ Uniforme (#a855f7)');
    console.log('  ✅ Material Didáctico (#f59e0b)');
    console.log('  ✅ Evento Especial (#ec4899)');
    console.log('  ✅ Servicio Adicional (#06b6d4)');
    console.log('  ✅ Otro Ingreso (#6b7280)');
    console.log('  ✅ Multa/Recargo (#ef4444)');
    console.log('  ✅ Derecho de Grado (#8b5cf6)');
    console.log('\n⚡ CARACTERÍSTICAS:');
    console.log('  🎯 Usa ON CONFLICT para evitar duplicados');
    console.log('  🎯 Actualiza registros existentes si el código ya existe');
    console.log('  🎯 No perderás datos existentes');
    console.log('  🎯 Puedes ejecutarlo múltiples veces sin problemas\n');

    const confirm = await ask('¿Deseas continuar? (SI para confirmar): ');

    if (confirm !== 'SI') {
      console.log('\n❌ Cancelado — no se realizaron cambios.');
      process.exit(0);
    }

    await client.query('BEGIN');
    console.log('\n⏳ Procesando...\n');

    // =============================================
    // PASO 1: DIAGNÓSTICO
    // =============================================
    console.log('🔍 Verificando constraint actual...');
    
    const currentConstraint = await client.query(`
      SELECT 
        conname as constraint_name,
        pg_get_constraintdef(oid) as constraint_definition
      FROM pg_constraint 
      WHERE conname = 'tipo_ingreso_categoria_check'
        AND conrelid = 'tipo_ingreso'::regclass
    `);

    if (currentConstraint.rows.length > 0) {
      console.log('  📌 Constraint actual encontrado:');
      console.log('  ' + currentConstraint.rows[0].constraint_definition);
    } else {
      console.log('  ⚠️  No se encontró el constraint (se creará)');
    }

    // =============================================
    // PASO 2: ELIMINAR CONSTRAINT PROBLEMÁTICO
    // =============================================
    console.log('\n🗑️  Eliminando constraint problemático...');
    
    await client.query(`
      ALTER TABLE tipo_ingreso 
      DROP CONSTRAINT IF EXISTS tipo_ingreso_categoria_check CASCADE
    `);
    
    console.log('  ✅ Constraint eliminado');

    // =============================================
    // PASO 3: RECREAR CONSTRAINT CORRECTO
    // =============================================
    console.log('\n🔧 Recreando constraint con sintaxis correcta...');
    
    await client.query(`
      ALTER TABLE tipo_ingreso 
      ADD CONSTRAINT tipo_ingreso_categoria_check 
      CHECK (categoria::text = ANY (ARRAY[
        'mensualidad'::text,
        'matricula'::text,
        'transporte'::text,
        'uniforme'::text,
        'material'::text,
        'evento'::text,
        'servicio'::text,
        'otro'::text
      ]))
    `);
    
    console.log('  ✅ Constraint recreado correctamente');

    // Verificar el nuevo constraint
    const newConstraint = await client.query(`
      SELECT pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conname = 'tipo_ingreso_categoria_check'
        AND conrelid = 'tipo_ingreso'::regclass
    `);

    console.log('  📌 Nuevo constraint:');
    console.log('  ' + newConstraint.rows[0].definition);

    // =============================================
    // PASO 4: INSERTAR/ACTUALIZAR TIPOS DE INGRESO
    // =============================================
    console.log('\n📦 Insertando tipos de ingreso...');

    const tiposIngreso = [
      {
        codigo: 'ING-MENS',
        nombre: 'Mensualidad',
        descripcion: 'Pago mensual de colegiatura',
        categoria: 'mensualidad',
        requiere_estudiante: true,
        color: '#3b82f6',
        orden: 1
      },
      {
        codigo: 'ING-MAT',
        nombre: 'Matrícula',
        descripcion: 'Inscripción anual al colegio',
        categoria: 'matricula',
        requiere_estudiante: true,
        color: '#10b981',
        orden: 2
      },
      {
        codigo: 'ING-TRANS',
        nombre: 'Transporte Escolar',
        descripcion: 'Servicio de transporte mensual',
        categoria: 'transporte',
        requiere_estudiante: true,
        color: '#facc15',
        orden: 3
      },
      {
        codigo: 'ING-UNI',
        nombre: 'Uniforme',
        descripcion: 'Compra de uniforme escolar',
        categoria: 'uniforme',
        requiere_estudiante: true,
        color: '#a855f7',
        orden: 4
      },
      {
        codigo: 'ING-MAT-DID',
        nombre: 'Material Didáctico',
        descripcion: 'Libros, cuadernos y materiales escolares',
        categoria: 'material',
        requiere_estudiante: true,
        color: '#f59e0b',
        orden: 5
      },
      {
        codigo: 'ING-EVE',
        nombre: 'Evento Especial',
        descripcion: 'Participación en eventos, excursiones y actividades',
        categoria: 'evento',
        requiere_estudiante: true,
        color: '#ec4899',
        orden: 6
      },
      {
        codigo: 'ING-SERV',
        nombre: 'Servicio Adicional',
        descripcion: 'Talleres, cursos y servicios complementarios',
        categoria: 'servicio',
        requiere_estudiante: true,
        color: '#06b6d4',
        orden: 7
      },
      {
        codigo: 'ING-OTRO',
        nombre: 'Otro Ingreso',
        descripcion: 'Otros ingresos no clasificados',
        categoria: 'otro',
        requiere_estudiante: false,
        color: '#6b7280',
        orden: 8
      },
      {
        codigo: 'ING-MULT',
        nombre: 'Multa/Recargo',
        descripcion: 'Multas por pago tardío o recargos',
        categoria: 'otro',
        requiere_estudiante: false,
        color: '#ef4444',
        orden: 9
      },
      {
        codigo: 'ING-GRAD',
        nombre: 'Derecho de Grado',
        descripcion: 'Pago por ceremonia de graduación',
        categoria: 'evento',
        requiere_estudiante: true,
        color: '#8b5cf6',
        orden: 10
      }
    ];

    let insertados = 0;
    let actualizados = 0;

    for (const tipo of tiposIngreso) {
      const result = await client.query(`
        INSERT INTO tipo_ingreso (
          codigo, nombre, descripcion, categoria, 
          requiere_estudiante, activo, color, orden
        ) VALUES (
          $1, $2, $3, $4, $5, true, $6, $7
        ) 
        ON CONFLICT (codigo) 
        DO UPDATE SET
          nombre = EXCLUDED.nombre,
          descripcion = EXCLUDED.descripcion,
          categoria = EXCLUDED.categoria,
          requiere_estudiante = EXCLUDED.requiere_estudiante,
          color = EXCLUDED.color,
          orden = EXCLUDED.orden,
          updated_at = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) as insertado
      `, [
        tipo.codigo,
        tipo.nombre,
        tipo.descripcion,
        tipo.categoria,
        tipo.requiere_estudiante,
        tipo.color,
        tipo.orden
      ]);

      if (result.rows[0].insertado) {
        insertados++;
        console.log(`  ✅ ${tipo.codigo} - ${tipo.nombre} (NUEVO)`);
      } else {
        actualizados++;
        console.log(`  🔄 ${tipo.codigo} - ${tipo.nombre} (ACTUALIZADO)`);
      }
    }

    // =============================================
    // PASO 5: VERIFICACIÓN
    // =============================================
    console.log('\n📊 Verificando datos insertados...');
    
    const verificacion = await client.query(`
      SELECT 
        id,
        codigo,
        nombre,
        categoria,
        requiere_estudiante,
        activo,
        color,
        orden
      FROM tipo_ingreso
      ORDER BY orden
    `);

    console.log(`\n  📋 Total de tipos en la base de datos: ${verificacion.rows.length}`);

    // Contar por categoría
    const porCategoria = await client.query(`
      SELECT 
        categoria,
        COUNT(*) as cantidad,
        STRING_AGG(nombre, ', ') as tipos
      FROM tipo_ingreso
      GROUP BY categoria
      ORDER BY categoria
    `);

    console.log('\n  📊 Tipos por categoría:');
    for (const cat of porCategoria.rows) {
      console.log(`     ${cat.categoria}: ${cat.cantidad} tipo(s)`);
    }

    // =============================================
    // PASO 6: PRUEBA DE ACTUALIZACIÓN
    // =============================================
    console.log('\n🧪 Probando actualización...');
    
    try {
      await client.query(`
        UPDATE tipo_ingreso 
        SET categoria = 'mensualidad',
            updated_at = CURRENT_TIMESTAMP
        WHERE codigo = 'ING-MENS'
      `);
      console.log('  ✅ Prueba de UPDATE exitosa');
    } catch (error) {
      console.log('  ❌ Error en prueba de UPDATE:', error.message);
      throw error;
    }

    await client.query('COMMIT');

    console.log('\n✅ ¡Seed completado exitosamente!\n');
    console.log('📊 RESUMEN:');
    console.log('┌────────────────────────────────────────────┐');
    console.log(`│ ✅ ${insertados} tipos NUEVOS insertados            │`);
    console.log(`│ 🔄 ${actualizados} tipos ACTUALIZADOS               │`);
    console.log(`│ 📋 ${verificacion.rows.length} tipos TOTALES en la base de datos │`);
    console.log('│ 🔧 Constraint corregido correctamente     │');
    console.log('│ ✅ Sistema listo para usar                │');
    console.log('└────────────────────────────────────────────┘\n');
    
    console.log('💡 Próximos pasos:');
    console.log('   1. Reinicia tu servidor Node.js');
    console.log('   2. Intenta actualizar un tipo de ingreso desde el frontend');
    console.log('   3. Deberías poder cambiar la categoría sin problemas\n');

    console.log('📋 Tipos de ingreso disponibles:');
    for (const tipo of verificacion.rows) {
      const emoji = tipo.requiere_estudiante ? '👨‍🎓' : '📦';
      console.log(`   ${emoji} ${tipo.codigo} - ${tipo.nombre} (${tipo.categoria})`);
    }
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n💥 Error en la operación:', error.message);
    console.error(error.stack);
    console.error('\n⚠️  La transacción fue revertida. No se realizaron cambios.');
  } finally {
    client.release();
    rl.close();
    process.exit(0);
  }
}

seedTiposIngreso().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});