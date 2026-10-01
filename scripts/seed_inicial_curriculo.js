import { pool } from '../src/db/pool.js';

async function seedCurriculo() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Asignar Patricia Jiménez (docente 10) al Paralelo 17 (Kínder A 2026 con 7 alumnos)
    console.log('🔄 Actualizando asignación docente al paralelo 17 (Kínder A 2026)...');
    await client.query(`
      UPDATE asignacion_docente
      SET paralelo_id = 17
      WHERE docente_id = 10 AND paralelo_id = 20;
    `);

    // 2. Indicadores de Logro oficiales para Kínder y PreKínder
    console.log('🌱 Sembrando indicadores de logro SEP para Inicial...');
    const indicadores = [
      // Kínder - Comunicación (gm_id: 23)
      { gm_id: 23, desc: 'Comunica vivencias, emociones, necesidades y opiniones en su lengua materna con claridad y orden lógico.', orden: 1 },
      { gm_id: 23, desc: 'Interpreta y produce mensajes a través del dibujo, modelado y trazos pre-escriturales espontáneos.', orden: 2 },
      { gm_id: 23, desc: 'Participa activamente en narraciones de cuentos, rondas, poesías y expresiones teatrales.', orden: 3 },

      // Kínder - Conocimiento y Producción (gm_id: 24)
      { gm_id: 24, desc: 'Reconoce nociones de espacio, tiempo, formas geométricas y seriación en actividades de conteo.', orden: 1 },
      { gm_id: 24, desc: 'Explora y describe elementos de su entorno natural respetando y cuidando la Madre Tierra.', orden: 2 },
      { gm_id: 24, desc: 'Demuestra curiosidad y resolución de problemas cotidianos mediante la experimentación y observación.', orden: 3 },

      // Kínder - Bio Sicomotriz (gm_id: 25)
      { gm_id: 25, desc: 'Coordina movimientos corporales gruesos con equilibrio, agilidad y ritmo en juegos y rondas.', orden: 1 },
      { gm_id: 25, desc: 'Desarrolla motricidad fina con precisión en el agarre del lápiz, recorte con tijera y modelado.', orden: 2 },
      { gm_id: 25, desc: 'Practica hábitos de higiene personal, alimentación saludable y cuidado de su esquema corporal.', orden: 3 },

      // Kínder - Socio Cultural (gm_id: 26)
      { gm_id: 26, desc: 'Demuestra empatía, solidaridad y respeto en la convivencia armónica con sus compañeros.', orden: 1 },
      { gm_id: 26, desc: 'Reconoce y valora los símbolos, costumbres y tradiciones de su comunidad y familia.', orden: 2 },
      { gm_id: 26, desc: 'Acepta y practica normas de convivencia del aula, autorregulando sus emociones de forma progresiva.', orden: 3 },

      // PreKínder - Comunicación (gm_id: 19)
      { gm_id: 19, desc: 'Expresa sus ideas, emociones y vivencias en su lengua materna de forma espontánea.', orden: 1 },
      { gm_id: 19, desc: 'Explora diferentes texturas y materiales gráficos mediante el garabateo libre y modelado.', orden: 2 },

      // PreKínder - Conocimiento (gm_id: 20)
      { gm_id: 20, desc: 'Identifica colores primarios y diferencias de tamaño (grande/pequeño) en objetos de su entorno.', orden: 1 },
      { gm_id: 20, desc: 'Muestra interés por el cuidado de las plantas, animales y recursos naturales de su escuela.', orden: 2 },

      // PreKínder - Bio Sicomotriz (gm_id: 21)
      { gm_id: 21, desc: 'Realiza desplazamientos corporales (correr, saltar, reptar) con creciente seguridad y disfrute.', orden: 1 },
      { gm_id: 21, desc: 'Participa en hábitos básicos de aseo personal (lavado de manos) guiado por la educadora.', orden: 2 },

      // PreKínder - Socio Cultural (gm_id: 22)
      { gm_id: 22, desc: 'Se integra positivamente en juegos colectivos compartiendo materiales con sus pares.', orden: 1 },
      { gm_id: 22, desc: 'Reconoce su identidad personal (su nombre, su familia y su pertenencia al grupo escolar).', orden: 2 }
    ];

    for (const ind of indicadores) {
      // Evitar duplicados por descripción y gm_id
      const exists = await client.query(
        'SELECT id FROM indicador_logro WHERE grado_materia_id = $1 AND descripcion = $2',
        [ind.gm_id, ind.desc]
      );
      if (exists.rows.length === 0) {
        await client.query(
          'INSERT INTO indicador_logro (grado_materia_id, descripcion, orden) VALUES ($1, $2, $3)',
          [ind.gm_id, ind.desc, ind.orden]
        );
      }
    }

    await client.query('COMMIT');
    console.log('✅ Asignación e Indicadores de logro sembrados con éxito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en seed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedCurriculo();
