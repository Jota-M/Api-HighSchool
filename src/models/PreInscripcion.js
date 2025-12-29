// models/PreInscripcion.js
import { pool } from '../db/pool.js';
import { Estudiante, PadreFamilia, EstudianteTutor } from './Estudiantes.js';
import { Matricula } from './Matricula.js';
import EmailService from '../utils/emailService.js';
import Usuario from './Usuario.js';

class PreInscripcion {
  // =============================================
  // 🆕 VERIFICAR Y ASIGNAR CUPO
  // =============================================
  static async verificarYAsignarCupo(gradoId, turnoId, periodoAcademicoId, client) {
    // Buscar cupo disponible
    const cupoResult = await client.query(`
      SELECT * FROM cupo_preinscripcion
      WHERE grado_id = $1 
        AND turno_id = $2 
        AND periodo_academico_id = $3
        AND activo = true
        AND cupos_disponibles > 0
      LIMIT 1
    `, [gradoId, turnoId, periodoAcademicoId]);

    if (cupoResult.rows.length === 0) {
      return { 
        tiene_cupo: false, 
        cupo_id: null,
        mensaje: 'No hay cupos disponibles para este grado y turno' 
      };
    }

    const cupo = cupoResult.rows[0];

    // Incrementar cupos ocupados
    await client.query(`
      UPDATE cupo_preinscripcion
      SET cupos_ocupados = cupos_ocupados + 1,
          updated_at = NOW()
      WHERE id = $1
    `, [cupo.id]);

    return {
      tiene_cupo: true,
      cupo_id: cupo.id,
      mensaje: 'Cupo asignado exitosamente'
    };
  }

  // =============================================
  // 🆕 LIBERAR CUPO (si se cancela o elimina)
  // =============================================
  static async liberarCupo(cupoId, client) {
    if (!cupoId) return;

    await client.query(`
      UPDATE cupo_preinscripcion
      SET cupos_ocupados = GREATEST(cupos_ocupados - 1, 0),
          updated_at = NOW()
      WHERE id = $1
    `, [cupoId]);
  }

  // =============================================
  // CREAR PREINSCRIPCIÓN COMPLETA (ACTUALIZADO)
  // =============================================
  static async crear(datosEstudiante, datosTutor, documentosUrls, fotoUrl = null, options = {}) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Generar código único
      const codigoResult = await client.query(`
        SELECT 'PRE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
        LPAD(CAST(COALESCE(MAX(CAST(SUBSTRING(codigo_inscripcion FROM 10) AS INTEGER)), 0) + 1 AS VARCHAR), 4, '0') 
        AS codigo
        FROM pre_inscripcion 
        WHERE codigo_inscripcion LIKE 'PRE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'
      `);
      const codigoInscripcion = codigoResult.rows[0].codigo;
      
      // 🆕 2. Asignar cupo (si se proporcionan los datos)
      let cupoAsignado = { tiene_cupo: false, cupo_id: null };
      
      if (options.grado_id && options.turno_id && options.periodo_academico_id) {
        cupoAsignado = await this.verificarYAsignarCupo(
          options.grado_id,
          options.turno_id,
          options.periodo_academico_id,
          client
        );
      }
      
      // 3. Crear pre_inscripcion
      const inscripcionResult = await client.query(`
        INSERT INTO pre_inscripcion (
          codigo_inscripcion, 
          estado,
          periodo_academico_id,
          nivel_academico_id,
          grado_id,
          turno_preferido_id,
          cupo_preinscripcion_id,
          tiene_cupo_asignado
        )
        VALUES ($1, 'datos_completos', $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        codigoInscripcion,
        options.periodo_academico_id || null,
        options.nivel_academico_id || null,
        options.grado_id || null,
        options.turno_id || null,
        cupoAsignado.cupo_id,
        cupoAsignado.tiene_cupo
      ]);
      
      const preInscripcionId = inscripcionResult.rows[0].id;
      
      // 4. Crear pre_estudiante (✅ CON RUDE)
      await client.query(`
        INSERT INTO pre_estudiante (
          pre_inscripcion_id, nombres, apellido_paterno, apellido_materno,
          ci, rude, fecha_nacimiento, lugar_nacimiento, genero, 
          direccion, zona, ciudad, telefono, email, foto_url,
          contacto_emergencia, tiene_discapacidad, tipo_discapacidad,
          institucion_procedencia, ultimo_grado_cursado, grado_solicitado,
          repite_grado, turno_solicitado
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      `, [
        preInscripcionId,
        datosEstudiante.nombres,
        datosEstudiante.apellido_paterno,
        datosEstudiante.apellido_materno || null,
        datosEstudiante.ci || null,
        datosEstudiante.rude || null, // ✅ RUDE
        datosEstudiante.fecha_nacimiento,
        datosEstudiante.lugar_nacimiento || null,
        datosEstudiante.genero || null,
        datosEstudiante.direccion || null,
        datosEstudiante.zona || null,
        datosEstudiante.ciudad || null,
        datosEstudiante.telefono || null,
        datosEstudiante.email || null,
        fotoUrl,
        datosEstudiante.contacto_emergencia || null,
        datosEstudiante.tiene_discapacidad || false,
        datosEstudiante.tipo_discapacidad || null,
        datosEstudiante.institucion_procedencia || null,
        datosEstudiante.ultimo_grado_cursado || null,
        datosEstudiante.grado_solicitado || null,
        datosEstudiante.repite_grado || false,
        datosEstudiante.turno_solicitado || null
      ]);
      
      // 5. Crear pre_tutor
      await client.query(`
        INSERT INTO pre_tutor (
          pre_inscripcion_id, tipo_representante, nombres, apellido_paterno, 
          apellido_materno, ci, fecha_nacimiento, genero, parentesco,
          telefono, celular, email, direccion, 
          ocupacion, lugar_trabajo, telefono_trabajo,
          estado_civil, nivel_educacion,
          es_tutor_principal, vive_con_estudiante
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      `, [
        preInscripcionId,
        datosTutor.tipo_representante || null,
        datosTutor.nombres,
        datosTutor.apellido_paterno,
        datosTutor.apellido_materno || null,
        datosTutor.ci,
        datosTutor.fecha_nacimiento || null,
        datosTutor.genero || null,
        datosTutor.parentesco || 'padre',
        datosTutor.telefono,
        datosTutor.celular || datosTutor.telefono,
        datosTutor.email || null,
        datosTutor.direccion || null,
        datosTutor.ocupacion || null,
        datosTutor.lugar_trabajo || null,
        datosTutor.telefono_trabajo || null,
        datosTutor.estado_civil || null,
        datosTutor.nivel_educacion || null,
        true,
        datosTutor.vive_con_estudiante || false
      ]);
      
      // 6. Crear documentos
      const tiposDocumento = [
        { tipo: 'cedula_estudiante', url: documentosUrls.cedula_estudiante, nombre: 'Cédula Estudiante' },
        { tipo: 'certificado_nacimiento', url: documentosUrls.certificado_nacimiento, nombre: 'Certificado de Nacimiento' },
        { tipo: 'libreta_notas', url: documentosUrls.libreta_notas, nombre: 'Libreta de Notas' },
        { tipo: 'cedula_tutor', url: documentosUrls.cedula_representante, nombre: 'Cédula Representante' }
      ];
      
      for (const doc of tiposDocumento) {
        if (doc.url) {
          await client.query(`
            INSERT INTO pre_documento (
              pre_inscripcion_id, tipo_documento, nombre_archivo,
              url_archivo, subido, fecha_subida
            ) VALUES ($1, $2, $3, $4, true, NOW())
          `, [preInscripcionId, doc.tipo, doc.nombre, doc.url]);
        }
      }
      
      await client.query('COMMIT');
      
      return {
        ...inscripcionResult.rows[0],
        cupo_asignado: cupoAsignado.tiene_cupo,
        mensaje_cupo: cupoAsignado.mensaje
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // =============================================
  // OBTENER TODAS LAS PREINSCRIPCIONES
  // =============================================
  static async obtenerTodas(filters = {}) {
    const { estado, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;
    
    let whereConditions = ['pi.deleted_at IS NULL'];
    let params = [];
    let paramCount = 1;
    
    if (estado) {
      whereConditions.push(`pi.estado = $${paramCount}`);
      params.push(estado);
      paramCount++;
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    const countQuery = `
      SELECT COUNT(*) FROM pre_inscripcion pi WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    const dataQuery = `
      SELECT 
        pi.*,
        pe.nombres || ' ' || pe.apellido_paterno || ' ' || COALESCE(pe.apellido_materno, '') as estudiante_nombre,
        pe.ci as estudiante_ci,
        pe.foto_url as estudiante_foto,
        pe.grado_solicitado,
        pt.nombres || ' ' || pt.apellido_paterno as tutor_nombre,
        pt.telefono as tutor_telefono,
        g.nombre as grado_nombre,
        t.nombre as turno_nombre,
        cp.cupos_disponibles
      FROM pre_inscripcion pi
      LEFT JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
      LEFT JOIN pre_tutor pt ON pi.id = pt.pre_inscripcion_id AND pt.es_tutor_principal = true
      LEFT JOIN grado g ON pi.grado_id = g.id
      LEFT JOIN turno t ON pi.turno_preferido_id = t.id
      LEFT JOIN cupo_preinscripcion cp ON pi.cupo_preinscripcion_id = cp.id
      WHERE ${whereClause}
      ORDER BY pi.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    
    const result = await pool.query(dataQuery, [...params, limit, offset]);
    
    return {
      preinscripciones: result.rows,
      paginacion: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  }
  
  // =============================================
  // OBTENER POR ID CON DETALLES COMPLETOS
  // =============================================
  static async obtenerPorId(id) {
    const result = await pool.query(`
      SELECT 
        pi.*,
        row_to_json(pe.*) as estudiante,
        row_to_json(pt.*) as tutor,
        json_agg(row_to_json(pd.*)) FILTER (WHERE pd.id IS NOT NULL) as documentos,
        g.nombre as grado_nombre,
        t.nombre as turno_nombre,
        pa.nombre as periodo_nombre,
        cp.cupos_totales,
        cp.cupos_disponibles
      FROM pre_inscripcion pi
      LEFT JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
      LEFT JOIN pre_tutor pt ON pi.id = pt.pre_inscripcion_id AND pt.es_tutor_principal = true
      LEFT JOIN pre_documento pd ON pi.id = pd.pre_inscripcion_id
      LEFT JOIN grado g ON pi.grado_id = g.id
      LEFT JOIN turno t ON pi.turno_preferido_id = t.id
      LEFT JOIN periodo_academico pa ON pi.periodo_academico_id = pa.id
      LEFT JOIN cupo_preinscripcion cp ON pi.cupo_preinscripcion_id = cp.id
      WHERE pi.id = $1 AND pi.deleted_at IS NULL
      GROUP BY pi.id, pe.*, pt.*, g.nombre, t.nombre, pa.nombre, cp.cupos_totales, cp.cupos_disponibles
    `, [id]);
    
    return result.rows[0];
  }
  
  // =============================================
  // CONVERTIR A ESTUDIANTE (ACTUALIZADO)
  // =============================================
  static async convertirAEstudiante(preInscripcionId, usuarioId, paraleloId, periodoAcademicoId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Obtener datos de preinscripción
      const preInscripcion = await this.obtenerPorId(preInscripcionId);
      
      if (!preInscripcion) {
        throw new Error('Preinscripción no encontrada');
      }
      
      if (preInscripcion.estado !== 'aprobada') {
        throw new Error('La preinscripción debe estar aprobada para convertirla');
      }
      
      const estudiante = preInscripcion.estudiante;
      const tutor = preInscripcion.tutor;
      
      // 2. Generar código de estudiante
      const codigoEstudiante = await Estudiante.generateCodeWithLock(client);
      
      // 3. ✅ Crear estudiante oficial (CON rude y contacto_emergencia)
      const nuevoEstudiante = await Estudiante.create({
        usuario_id: null,
        codigo: codigoEstudiante,
        rude: estudiante.rude || null, // ✅ RUDE se mantiene
        nombres: estudiante.nombres,
        apellido_paterno: estudiante.apellido_paterno,
        apellido_materno: estudiante.apellido_materno,
        fecha_nacimiento: estudiante.fecha_nacimiento,
        ci: estudiante.ci,
        lugar_nacimiento: estudiante.lugar_nacimiento,
        genero: estudiante.genero,
        direccion: estudiante.direccion,
        zona: estudiante.zona,
        ciudad: estudiante.ciudad,
        telefono: estudiante.telefono,
        email: estudiante.email,
        foto_url: estudiante.foto_url,
        contacto_emergencia: estudiante.contacto_emergencia,
        tiene_discapacidad: estudiante.tiene_discapacidad,
        tipo_discapacidad: estudiante.tipo_discapacidad,
        observaciones: `Convertido desde preinscripción ${preInscripcion.codigo_inscripcion}`,
        activo: true
      }, client);
      
      // 4. Crear usuario para estudiante
      let estudianteUsuarioId = null;
      let estudianteUsername = null;
      let estudiantePassword = null;
      
      try {
        estudianteUsername = this.generarUsername(estudiante.nombres, estudiante.apellido_paterno);
        estudiantePassword = this.generarPassword(estudiante.ci);
        
        const emailEstudiante = estudiante.email || `${estudianteUsername}@estudiante.edu.bo`;
        
        const usuarioExisteResult = await client.query(
          'SELECT id FROM usuarios WHERE username = $1',
          [estudianteUsername]
        );
        
        if (usuarioExisteResult.rows.length > 0) {
          estudianteUsername = `${estudianteUsername}${Math.floor(Math.random() * 999)}`;
        }
        
        const usuarioEstudiante = await Usuario.create({
          username: estudianteUsername,
          email: emailEstudiante,
          password: estudiantePassword,
          activo: true,
          verificado: false,
          debe_cambiar_password: true
        }, client);
        
        estudianteUsuarioId = usuarioEstudiante.id;
        
        const rolEstudiante = await this.obtenerRolPorNombre('estudiante', client);
        if (rolEstudiante) {
          await client.query(
            'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
            [estudianteUsuarioId, rolEstudiante.id]
          );
        }
        
        await client.query(
          'UPDATE estudiante SET usuario_id = $1, updated_at = NOW() WHERE id = $2',
          [estudianteUsuarioId, nuevoEstudiante.id]
        );
        
        nuevoEstudiante.usuario_id = estudianteUsuarioId;
        
      } catch (errorUsuario) {
        console.error('⚠️ Error al crear usuario de estudiante:', errorUsuario.message);
      }
      
      // 5. Crear o buscar padre_familia
      let padreFamiliaId;
      let padreExistente = await PadreFamilia.findByCI(tutor.ci, client);
      
      if (padreExistente) {
        padreFamiliaId = padreExistente.id;
      } else {
        const nuevoPadre = await PadreFamilia.create({
          usuario_id: null,
          nombres: tutor.nombres,
          apellido_paterno: tutor.apellido_paterno,
          apellido_materno: tutor.apellido_materno,
          ci: tutor.ci,
          fecha_nacimiento: tutor.fecha_nacimiento,
          telefono: tutor.telefono,
          celular: tutor.celular,
          email: tutor.email,
          direccion: tutor.direccion,
          ocupacion: tutor.ocupacion,
          lugar_trabajo: tutor.lugar_trabajo,
          telefono_trabajo: tutor.telefono_trabajo,
          parentesco: tutor.parentesco || 'padre',
          estado_civil: tutor.estado_civil,
          nivel_educacion: tutor.nivel_educacion
        }, client);
        padreFamiliaId = nuevoPadre.id;
      }
      
      // 6. Crear usuario para padre (si no tiene)
      let tutorUsuarioId = null;
      let tutorUsername = null;
      let tutorPassword = null;
      
      const padreResult = await client.query(
        'SELECT * FROM padre_familia WHERE id = $1',
        [padreFamiliaId]
      );
      
      const padreActualizado = padreResult.rows[0];
      
      if (!padreActualizado.usuario_id) {
        try {
          tutorUsername = this.generarUsername(tutor.nombres, tutor.apellido_paterno);
          tutorPassword = this.generarPassword(tutor.ci);
          
          const emailTutor = tutor.email || `${tutorUsername}@padre.edu.bo`;
          
          const usuarioTutorExisteResult = await client.query(
            'SELECT id FROM usuarios WHERE username = $1',
            [tutorUsername]
          );
          
          if (usuarioTutorExisteResult.rows.length > 0) {
            tutorUsername = `${tutorUsername}${Math.floor(Math.random() * 999)}`;
          }
          
          const usuarioTutor = await Usuario.create({
            username: tutorUsername,
            email: emailTutor,
            password: tutorPassword,
            activo: true,
            verificado: false,
            debe_cambiar_password: true
          }, client);
          
          tutorUsuarioId = usuarioTutor.id;
          
          const rolPadre = await this.obtenerRolPorNombre('padre', client);
          if (rolPadre) {
            await client.query(
              'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
              [tutorUsuarioId, rolPadre.id]
            );
          }
          
          await client.query(
            'UPDATE padre_familia SET usuario_id = $1, updated_at = NOW() WHERE id = $2',
            [tutorUsuarioId, padreFamiliaId]
          );
          
        } catch (errorUsuarioTutor) {
          console.error('⚠️ Error al crear usuario de tutor:', errorUsuarioTutor.message);
        }
      }
      
      // 7. Crear relación estudiante_tutor
      await EstudianteTutor.assign({
        estudiante_id: nuevoEstudiante.id,
        padre_familia_id: padreFamiliaId,
        es_tutor_principal: true,
        vive_con_estudiante: tutor.vive_con_estudiante ?? true,
        autorizado_recoger: true,
        puede_autorizar_salidas: true,
        recibe_notificaciones: true,
        prioridad_contacto: 1,
        observaciones: null
      }, client);
      
      // 8. Crear matrícula
      const numeroMatricula = await Matricula.generateNumeroMatricula(periodoAcademicoId, client);
      
      const matriculaResult = await client.query(`
        INSERT INTO matricula (
          estudiante_id, paralelo_id, periodo_academico_id,
          numero_matricula, estado, es_repitente
        ) VALUES ($1, $2, $3, $4, 'activo', $5)
        RETURNING *
      `, [
        nuevoEstudiante.id,
        paraleloId,
        periodoAcademicoId,
        numeroMatricula,
        estudiante.repite_grado || false
      ]);
      
      const matriculaId = matriculaResult.rows[0].id;
      
      // 9. Migrar documentos
      const documentosMigrados = [];
      
      try {
        const documentosResult = await client.query(`
          SELECT * FROM pre_documento 
          WHERE pre_inscripcion_id = $1 AND subido = true
        `, [preInscripcionId]);
        
        const documentos = documentosResult.rows;
        
        for (const doc of documentos) {
          const docMigradoResult = await client.query(`
            INSERT INTO matricula_documento (
              matricula_id,
              tipo_documento,
              nombre_archivo,
              url_archivo,
              verificado,
              verificado_por,
              fecha_verificacion,
              observaciones
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `, [
            matriculaId,
            doc.tipo_documento,
            doc.nombre_archivo,
            doc.url_archivo,
            doc.verificado || false,
            doc.verificado_por,
            doc.fecha_verificacion,
            doc.observaciones
          ]);
          
          documentosMigrados.push(docMigradoResult.rows[0]);
        }
        
      } catch (errorDocumentos) {
        console.error('⚠️ Error al migrar documentos:', errorDocumentos.message);
      }
      
      // 10. Actualizar pre_inscripcion
      await client.query(`
        UPDATE pre_inscripcion
        SET 
          estado = 'convertida',
          estudiante_id = $1,
          matricula_id = $2,
          fecha_conversion = NOW(),
          convertida_por = $3
        WHERE id = $4
      `, [nuevoEstudiante.id, matriculaId, usuarioId, preInscripcionId]);
      
      // 🆕 11. Liberar cupo si estaba asignado
      if (preInscripcion.cupo_preinscripcion_id) {
        await this.liberarCupo(preInscripcion.cupo_preinscripcion_id, client);
      }
      
      await client.query('COMMIT');
      
      return {
        estudiante: nuevoEstudiante,
        matricula: matriculaResult.rows[0],
        padre_familia_id: padreFamiliaId,
        credenciales: {
          estudiante: estudianteUsuarioId ? {
            username: estudianteUsername,
            password: estudiantePassword,
            email: nuevoEstudiante.email || `${estudianteUsername}@estudiante.edu.bo`
          } : null,
          padre: tutorUsuarioId ? {
            username: tutorUsername,
            password: tutorPassword,
            email: tutor.email || `${tutorUsername}@padre.edu.bo`
          } : null
        },
        documentos_migrados: documentosMigrados.length
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // =============================================
  // MÉTODOS AUXILIARES
  // =============================================
  
  static generarUsername(nombres, apellido) {
    const nombreLimpio = nombres.split(' ')[0]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
    
    const apellidoLimpio = apellido
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
    
    const nombreCapital = nombreLimpio.charAt(0).toUpperCase() + nombreLimpio.slice(1);
    const apellidoCapital = apellidoLimpio.charAt(0).toUpperCase() + apellidoLimpio.slice(1);
    
    return `${nombreCapital}${apellidoCapital}`;
  }

  static generarPassword(ci = null) {
    if (ci) {
      return ci.toString();
    }
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  static async obtenerRolPorNombre(nombre, client) {
    const query = 'SELECT * FROM roles WHERE nombre = $1 LIMIT 1';
    const result = await client.query(query, [nombre]);
    return result.rows[0];
  }
  
  // =============================================
  // CAMBIAR ESTADO
  // =============================================
  static async cambiarEstado(id, nuevoEstado, usuarioId, observaciones = null, externalClient = null) {
  // Si hay un cliente externo, usarlo (ya tiene transacción abierta)
  // Si no, crear uno nuevo con su propia transacción
  const client = externalClient || await pool.connect();
  const shouldManageTransaction = !externalClient;
  
  try {
    console.log('🔍 [MODEL] Paso 1: Iniciando cambiarEstado en modelo');
    
    if (shouldManageTransaction) {
      await client.query('BEGIN');
      console.log('🔍 [MODEL] Paso 1.1: BEGIN ejecutado (transacción propia)');
    } else {
      console.log('🔍 [MODEL] Paso 1.1: Usando transacción existente del controller');
    }
    
    // Obtener estado anterior
    console.log('🔍 [MODEL] Paso 2: Obteniendo estado anterior...');
    const estadoAnteriorResult = await client.query(
      'SELECT estado FROM pre_inscripcion WHERE id = $1',
      [id]
    );
    const estadoAnterior = estadoAnteriorResult.rows[0]?.estado;
    console.log('🔍 [MODEL] Paso 2.1: Estado anterior:', estadoAnterior);
    
    // Hacer la lógica en JavaScript
    const esAprobada = nuevoEstado === 'aprobada';
    console.log('🔍 [MODEL] Paso 3: Es aprobada?', esAprobada);
    
    let result;
    if (esAprobada) {
      console.log('🔍 [MODEL] Paso 4: Ejecutando UPDATE con aprobación...');
      result = await client.query(`
        UPDATE pre_inscripcion
        SET 
          estado = $1,
          observaciones = $2,
          aprobada_por = $3,
          fecha_aprobacion = NOW(),
          updated_at = NOW()
        WHERE id = $4 AND deleted_at IS NULL
        RETURNING *
      `, [nuevoEstado, observaciones, usuarioId, id]);
    } else {
      console.log('🔍 [MODEL] Paso 4: Ejecutando UPDATE sin aprobación...');
      result = await client.query(`
        UPDATE pre_inscripcion
        SET 
          estado = $1,
          observaciones = $2,
          updated_at = NOW()
        WHERE id = $3 AND deleted_at IS NULL
        RETURNING *
      `, [nuevoEstado, observaciones, id]);
    }

    console.log('🔍 [MODEL] Paso 4.1: UPDATE ejecutado. Rows:', result.rows.length);

    if (result.rows.length === 0) {
      throw new Error('Preinscripción no encontrada');
    }

    if (shouldManageTransaction) {
      console.log('🔍 [MODEL] Paso 5: Ejecutando COMMIT...');
      await client.query('COMMIT');
      console.log('✅ [MODEL] Paso 5.1: COMMIT exitoso');
    } else {
      console.log('🔍 [MODEL] Paso 5: Transacción será manejada por el controller');
    }
    
    console.log('🔍 [MODEL] Paso 8: Retornando resultado...');
    const resultadoFinal = result.rows[0];
    console.log('✅ [MODEL] Paso 8.1: Resultado preparado:', {
      id: resultadoFinal.id,
      estado: resultadoFinal.estado
    });

    // Enviar email de forma asíncrona (solo si no es transacción externa)
    if (shouldManageTransaction) {
      setImmediate(async () => {
        try {
          const preinscripcionCompleta = await this.obtenerPorId(id);
          await EmailService.notificarCambioEstado(preinscripcionCompleta, estadoAnterior);
          console.log('✅ [MODEL] Email enviado correctamente');
        } catch (error) {
          console.error(`❌ [MODEL] Error al enviar email:`, error);
        }
      });
    }

    return resultadoFinal;
    
  } catch (error) {
    console.error('❌ [MODEL] Error capturado:', error.message);
    if (shouldManageTransaction) {
      await client.query('ROLLBACK');
      console.log('🔍 [MODEL] ROLLBACK ejecutado');
    }
    throw error;
  } finally {
    if (shouldManageTransaction) {
      console.log('🔍 [MODEL] Liberando cliente...');
      client.release();
    }
  }
}
  // =============================================
  // ELIMINAR (SOFT DELETE + LIBERAR CUPO)
  // =============================================
  static async eliminar(id) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Obtener cupo antes de eliminar
      const cupoResult = await client.query(
        'SELECT cupo_preinscripcion_id FROM pre_inscripcion WHERE id = $1',
        [id]
      );
      
      const cupoId = cupoResult.rows[0]?.cupo_preinscripcion_id;
      
      // Eliminar (soft delete)
      const result = await client.query(`
        UPDATE pre_inscripcion
        SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *
      `, [id]);
      
      // Liberar cupo si existía
      if (cupoId) {
        await this.liberarCupo(cupoId, client);
      }
      
      await client.query('COMMIT');
      
      return result.rows[0];
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export { PreInscripcion };