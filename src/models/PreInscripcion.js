// models/PreInscripcion.js
import { pool } from '../db/pool.js';
import { Estudiante, PadreFamilia, EstudianteTutor } from './Estudiantes.js';
import { Matricula } from './Matricula.js';
import EmailService from '../utils/emailService.js';
import Usuario from './Usuario.js';


class PreInscripcion {
  // =============================================
  // CREAR PREINSCRIPCIÓN COMPLETA
  // =============================================
  static async crear(datosEstudiante, datosTutor, documentosUrls, fotoUrl = null) {
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
      
      // 2. Crear pre_inscripcion
      const inscripcionResult = await client.query(`
        INSERT INTO pre_inscripcion (codigo_inscripcion, estado)
        VALUES ($1, 'datos_completos')
        RETURNING *
      `, [codigoInscripcion]);
      
      const preInscripcionId = inscripcionResult.rows[0].id;
      
      // 3. Crear pre_estudiante (✅ CORREGIDO)
      await client.query(`
        INSERT INTO pre_estudiante (
          pre_inscripcion_id, nombres, apellido_paterno, apellido_materno,
          ci, fecha_nacimiento, lugar_nacimiento, genero, 
          direccion, zona, ciudad, telefono, email, foto_url,
          contacto_emergencia, telefono_emergencia,
          tiene_discapacidad, tipo_discapacidad,
          institucion_procedencia, ultimo_grado_cursado, grado_solicitado,
          repite_grado, turno_solicitado
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      `, [
        preInscripcionId,
        datosEstudiante.nombres,
        datosEstudiante.apellido_paterno,
        datosEstudiante.apellido_materno || null,
        datosEstudiante.ci || null,
        datosEstudiante.fecha_nacimiento,
        datosEstudiante.lugar_nacimiento || null,
        datosEstudiante.genero || null,
        datosEstudiante.direccion || null,
        datosEstudiante.zona || null,
        datosEstudiante.ciudad || null,
        datosEstudiante.telefono || null,
        datosEstudiante.email || null,
        fotoUrl, // ✅ FOTO
        datosEstudiante.contacto_emergencia || null,
        datosEstudiante.telefono_emergencia || null,
        datosEstudiante.tiene_discapacidad || false,
        datosEstudiante.tipo_discapacidad || null,
        datosEstudiante.institucion_procedencia || null,
        datosEstudiante.ultimo_grado_cursado || null,
        datosEstudiante.grado_solicitado || null,
        datosEstudiante.repite_grado || false,
        datosEstudiante.turno_solicitado || null
      ]);
      
      // 4. Crear pre_tutor (✅ CORREGIDO)
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
        true, // es_tutor_principal
        datosTutor.vive_con_estudiante || false
      ]);
      
      // 5. Crear documentos (✅ CORREGIDO)
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
      
      return inscripcionResult.rows[0];
      
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
        pt.telefono as tutor_telefono
      FROM pre_inscripcion pi
      LEFT JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
      LEFT JOIN pre_tutor pt ON pi.id = pt.pre_inscripcion_id AND pt.es_tutor_principal = true
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
        json_agg(row_to_json(pd.*)) FILTER (WHERE pd.id IS NOT NULL) as documentos
      FROM pre_inscripcion pi
      LEFT JOIN pre_estudiante pe ON pi.id = pe.pre_inscripcion_id
      LEFT JOIN pre_tutor pt ON pi.id = pt.pre_inscripcion_id AND pt.es_tutor_principal = true
      LEFT JOIN pre_documento pd ON pi.id = pd.pre_inscripcion_id
      WHERE pi.id = $1 AND pi.deleted_at IS NULL
      GROUP BY pi.id, pe.*, pt.*
    `, [id]);
    
    return result.rows[0];
  }
  
  static async convertirAEstudiante(preInscripcionId, usuarioId, paraleloId, periodoAcademicoId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // ========================================
      // 1. OBTENER DATOS DE PREINSCRIPCIÓN
      // ========================================
      const preInscripcion = await this.obtenerPorId(preInscripcionId);
      
      if (!preInscripcion) {
        throw new Error('Preinscripción no encontrada');
      }
      
      if (preInscripcion.estado !== 'aprobada') {
        throw new Error('La preinscripción debe estar aprobada para convertirla');
      }
      
      const estudiante = preInscripcion.estudiante;
      const tutor = preInscripcion.tutor;
      
      // ========================================
      // 2. GENERAR CÓDIGO DE ESTUDIANTE
      // ========================================
      const codigoEstudiante = await Estudiante.generateCodeWithLock(client);
      
      // ========================================
      // 3. CREAR ESTUDIANTE OFICIAL (SIN usuario_id)
      // ========================================
      const nuevoEstudiante = await Estudiante.create({
        usuario_id: null,
        codigo: codigoEstudiante,
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
        telefono_emergencia: estudiante.telefono_emergencia,
        tiene_discapacidad: estudiante.tiene_discapacidad,
        tipo_discapacidad: estudiante.tipo_discapacidad,
        observaciones: `Convertido desde preinscripción ${preInscripcion.codigo_inscripcion}`,
        activo: true
      }, client);
      
      // ========================================
      // 4. 🆕 CREAR USUARIO PARA ESTUDIANTE
      // ========================================
      let estudianteUsuarioId = null;
      let estudianteUsername = null;
      let estudiantePassword = null;
      
      try {
        // Generar credenciales
        estudianteUsername = this.generarUsername(estudiante.nombres, estudiante.apellido_paterno);
        estudiantePassword = this.generarPassword(estudiante.ci);
        
        const emailEstudiante = estudiante.email || `${estudianteUsername}@estudiante.edu.bo`;
        
        // Verificar que el username no exista
        const usuarioExisteResult = await client.query(
          'SELECT id FROM usuarios WHERE username = $1',
          [estudianteUsername]
        );
        
        if (usuarioExisteResult.rows.length > 0) {
          estudianteUsername = `${estudianteUsername}${Math.floor(Math.random() * 999)}`;
        }
        
        // Crear usuario
        const usuarioEstudiante = await Usuario.create({
          username: estudianteUsername,
          email: emailEstudiante,
          password: estudiantePassword,
          activo: true,
          verificado: false,
          debe_cambiar_password: true
        }, client);
        
        estudianteUsuarioId = usuarioEstudiante.id;
        
        // Asignar rol 'estudiante'
        const rolEstudiante = await this.obtenerRolPorNombre('estudiante', client);
        if (rolEstudiante) {
          await client.query(
            'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
            [estudianteUsuarioId, rolEstudiante.id]
          );
        }
        
        // Actualizar estudiante con usuario_id
        await client.query(
          'UPDATE estudiante SET usuario_id = $1, updated_at = NOW() WHERE id = $2',
          [estudianteUsuarioId, nuevoEstudiante.id]
        );
        
        nuevoEstudiante.usuario_id = estudianteUsuarioId;
        
        console.log(`✅ Usuario creado para estudiante: ${estudianteUsername}`);
        
      } catch (errorUsuario) {
        console.error('⚠️ Error al crear usuario de estudiante:', errorUsuario.message);
        // No detener el proceso, solo loguear
      }
      
      // ========================================
      // 5. CREAR O BUSCAR PADRE_FAMILIA
      // ========================================
      let padreFamiliaId;
      let padreExistente = await PadreFamilia.findByCI(tutor.ci, client);
      
      if (padreExistente) {
        padreFamiliaId = padreExistente.id;
        console.log(`ℹ️ Padre ya existe con ID: ${padreFamiliaId}`);
      } else {
        const nuevoPadre = await PadreFamilia.create({
          usuario_id: null, // Se creará después
          nombres: tutor.nombres,
          apellido_paterno: tutor.apellido_paterno,
          apellido_materno: tutor.apellido_materno,
          ci: tutor.ci,
          fecha_nacimiento: tutor.fecha_nacimiento,
          genero: tutor.genero,
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
      
      // ========================================
      // 6. 🆕 CREAR USUARIO PARA PADRE (SI NO TIENE)
      // ========================================
      let tutorUsuarioId = null;
      let tutorUsername = null;
      let tutorPassword = null;
      
      // ✅ Consulta directa para obtener el padre
      const padreResult = await client.query(
        'SELECT * FROM padre_familia WHERE id = $1',
        [padreFamiliaId]
      );
      
      const padreActualizado = padreResult.rows[0];
      
      // ✅ Validación
      if (!padreActualizado) {
        console.error(`❌ Padre no encontrado con ID: ${padreFamiliaId}`);
        throw new Error(`Padre no encontrado con ID: ${padreFamiliaId}`);
      }
      
      console.log(`📋 Padre encontrado - usuario_id: ${padreActualizado.usuario_id || 'NULL'}`);
      
      if (!padreActualizado.usuario_id) {
        try {
          // Generar credenciales
          tutorUsername = this.generarUsername(tutor.nombres, tutor.apellido_paterno);
          tutorPassword = this.generarPassword(tutor.ci); 
          
          const emailTutor = tutor.email || `${tutorUsername}@padre.edu.bo`;
          
          // Verificar que el username no exista
          const usuarioTutorExisteResult = await client.query(
            'SELECT id FROM usuarios WHERE username = $1',
            [tutorUsername]
          );
          
          if (usuarioTutorExisteResult.rows.length > 0) {
            tutorUsername = `${tutorUsername}${Math.floor(Math.random() * 999)}`;
          }
          
          // Crear usuario
          const usuarioTutor = await Usuario.create({
            username: tutorUsername,
            email: emailTutor,
            password: tutorPassword,
            activo: true,
            verificado: false,
            debe_cambiar_password: true
          }, client);
          
          tutorUsuarioId = usuarioTutor.id;
          
          // Asignar rol 'padre'
          const rolPadre = await this.obtenerRolPorNombre('padre', client);
          if (rolPadre) {
            await client.query(
              'INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, $2)',
              [tutorUsuarioId, rolPadre.id]
            );
          }
          
          // Actualizar padre con usuario_id
          await client.query(
            'UPDATE padre_familia SET usuario_id = $1, updated_at = NOW() WHERE id = $2',
            [tutorUsuarioId, padreFamiliaId]
          );
          
          console.log(`✅ Usuario creado para padre: ${tutorUsername}`);
          
        } catch (errorUsuarioTutor) {
          console.error('⚠️ Error al crear usuario de tutor:', errorUsuarioTutor.message);
          // No detener el proceso, solo loguear
        }
      } else {
        console.log(`ℹ️ Padre ya tiene usuario asignado: ${padreActualizado.usuario_id}`);
      }
      
      // ========================================
      // 7. CREAR RELACIÓN ESTUDIANTE_TUTOR
      // ========================================
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
      
      // ========================================
      // 8. CREAR MATRÍCULA
      // ========================================
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
      
      // ========================================
      // 9. 🆕 MIGRAR DOCUMENTOS (pre_documento → matricula_documento)
      // ========================================
      const documentosMigrados = [];
      
      try {
        // Obtener documentos de la preinscripción
        const documentosResult = await client.query(`
          SELECT * FROM pre_documento 
          WHERE pre_inscripcion_id = $1 AND subido = true
        `, [preInscripcionId]);
        
        const documentos = documentosResult.rows;
        
        console.log(`📄 Migrando ${documentos.length} documento(s)...`);
        
        // Migrar cada documento
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
        
        console.log(`✅ ${documentosMigrados.length} documento(s) migrado(s) correctamente`);
        
      } catch (errorDocumentos) {
        console.error('⚠️ Error al migrar documentos:', errorDocumentos.message);
        // No detener el proceso, solo loguear
      }
      
      // ========================================
      // 10. ACTUALIZAR PRE_INSCRIPCION
      // ========================================
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
      
      // ========================================
      // COMMIT - TODO EXITOSO
      // ========================================
      await client.query('COMMIT');
      
      console.log(`🎉 Conversión exitosa:
        - Estudiante: ${codigoEstudiante}
        - Matrícula: ${numeroMatricula}
        - Usuario estudiante: ${estudianteUsername || 'NO CREADO'}
        - Usuario padre: ${tutorUsername || (tutorUsuarioId ? 'YA EXISTÍA' : 'NO CREADO')}
        - Documentos migrados: ${documentosMigrados.length}
      `);
      
      return {
        estudiante: nuevoEstudiante,
        matricula: matriculaResult.rows[0],
        padre_familia_id: padreFamiliaId,
        // 🆕 Credenciales generadas (si se crearon)
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
        // 🆕 Documentos migrados
        documentos_migrados: documentosMigrados.length
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error en conversión:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ========================================
  // 🆕 MÉTODOS AUXILIARES
  // ========================================
  
  static generarUsername(nombres, apellido) {
    // Tomar primer nombre y primer apellido, sin espacios ni caracteres especiales
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
    
    // Capitalizar primera letra de cada parte
    const nombreCapital = nombreLimpio.charAt(0).toUpperCase() + nombreLimpio.slice(1);
    const apellidoCapital = apellidoLimpio.charAt(0).toUpperCase() + apellidoLimpio.slice(1);
    
    return `${nombreCapital}${apellidoCapital}`;
  }

  static generarPassword(ci = null) {
    // Si viene CI, usarlo como contraseña
    if (ci) {
      return ci.toString();
    }
    
    // Si no hay CI, generar contraseña aleatoria de 8 dígitos
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
static async cambiarEstado(id, nuevoEstado, usuarioId, observaciones = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Obtener estado anterior
    const estadoAnteriorResult = await client.query(
      'SELECT estado FROM pre_inscripcion WHERE id = $1',
      [id]
    );
    const estadoAnterior = estadoAnteriorResult.rows[0]?.estado;
    
    // 2. Actualizar estado
    const result = await client.query(`
      UPDATE pre_inscripcion
      SET 
        estado = $1::varchar,
        observaciones = $2,
        aprobada_por = CASE WHEN $1 = 'aprobada' THEN $3::integer ELSE aprobada_por END,
        fecha_aprobacion = CASE WHEN $1 = 'aprobada' THEN NOW() ELSE fecha_aprobacion END,
        updated_at = NOW()
      WHERE id = $4 AND deleted_at IS NULL
      RETURNING *
    `, [nuevoEstado, observaciones, usuarioId, id]);

    if (result.rows.length === 0) {
      throw new Error('Preinscripción no encontrada');
    }

    await client.query('COMMIT');
    
    // 3. 🆕 ENVIAR EMAIL DE NOTIFICACIÓN (de forma asíncrona)
    const preinscripcionCompleta = await this.obtenerPorId(id);
    
    EmailService.notificarCambioEstado(preinscripcionCompleta, estadoAnterior)
      .then(resultado => {
        if (resultado.success) {
          console.log(`✅ Email enviado para preinscripción ${id}`);
        } else {
          console.error(`⚠️ No se pudo enviar email para preinscripción ${id}:`, resultado.error);
        }
      })
      .catch(error => {
        console.error(`❌ Error al enviar email para preinscripción ${id}:`, error);
      });

    return result.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
  
  // =============================================
  // ELIMINAR (SOFT DELETE)
  // =============================================
  static async eliminar(id) {
    const result = await pool.query(`
      UPDATE pre_inscripcion
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id]);
    
    return result.rows[0];
  }
}

export { PreInscripcion };