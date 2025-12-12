// middlewares/parseFormDataJSON.js

/**
 * Middleware para parsear campos JSON que vienen como string en FormData
 * Cuando se envía FormData con archivos, los objetos JSON llegan como strings
 * Este middleware los convierte de vuelta a objetos
 * 
 * @param {Object} fieldsConfig - Objeto con los campos a parsear {campo: isArray}
 * @returns {Function} Middleware de Express
 */
export const parseFormDataJSON = (fieldsConfig) => {
  return (req, res, next) => {
    try {
      // Parsear campos JSON según configuración
      for (const [field, isArray] of Object.entries(fieldsConfig)) {
        if (req.body[field] && typeof req.body[field] === 'string') {
          try {
            const parsed = JSON.parse(req.body[field]);
            
            // Validar que sea array si se especificó
            if (isArray && !Array.isArray(parsed)) {
              return res.status(400).json({
                success: false,
                message: `El campo "${field}" debe ser un array`
              });
            }
            
            req.body[field] = parsed;
          } catch (err) {
            console.error(`❌ Error parsing ${field}:`, err);
            return res.status(400).json({
              success: false,
              message: `Error al procesar el campo "${field}": debe ser JSON válido`
            });
          }
        }
      }
      
      // Parsear campos booleanos comunes
      const booleanFields = [
        'crear_usuario',
        'crear_usuario_estudiante', 
        'crear_usuarios_tutores',
        'activo',
        'es_titular',
        'es_tutor_principal',
        'vive_con_estudiante',
        'autorizado_recoger',
        'puede_autorizar_salidas',
        'recibe_notificaciones',
        'es_repitente',
        'es_becado',
        'tiene_discapacidad',
        'discapacidad',
        'repite_grado'
      ];
      
      booleanFields.forEach(field => {
        if (req.body[field] !== undefined) {
          req.body[field] = req.body[field] === 'true' || req.body[field] === true;
        }
      });
      
      next();
    } catch (error) {
      console.error('❌ Error en parseFormDataJSON:', error);
      res.status(400).json({
        success: false,
        message: 'Error al procesar los datos del formulario'
      });
    }
  };
};

/**
 * Configuraciones predefinidas para diferentes módulos
 */
export const formDataConfigs = {
  preInscripcionMultiple: (req, res, next) => {
    try {
      // Parsear datos generales
      if (req.body.modo) {
        req.body.modo = req.body.modo;
      }
      
      if (req.body.padre_id) {
        req.body.padre_id = parseInt(req.body.padre_id);
      }
      
      // Parsear representante (si viene como JSON)
      if (req.body.representante && typeof req.body.representante === 'string') {
        req.body.representante = JSON.parse(req.body.representante);
      }
      
      // Parsear array de estudiantes
      if (req.body.estudiantes && typeof req.body.estudiantes === 'string') {
        req.body.estudiantes = JSON.parse(req.body.estudiantes);
      }
      
      next();
    } catch (error) {
      console.error('Error al parsear FormData múltiple:', error);
      res.status(400).json({
        success: false,
        message: 'Datos del formulario inválidos: ' + error.message
      });
    }
  },
  // Para registro completo de estudiantes
  registroEstudiante: parseFormDataJSON({
    estudiante: false,
    tutores: true,
    matricula: false,
    documentos: false,
    credenciales_estudiante: false,
    credenciales_tutores: true
  }),
  
  // Para preinscripciones
  preInscripcion: parseFormDataJSON({
    estudiante: false,
    representante: false
  }),
  
  // Para registro completo de docentes
  registroDocente: parseFormDataJSON({
    docente: false,
    credenciales: false,
    asignaciones: true
  }),
  
  // Para actualización de docentes
  actualizarDocente: parseFormDataJSON({
    datos: false
  }),
  
  // Para actualización general con archivos
  actualizacionGeneral: parseFormDataJSON({})
};

export default parseFormDataJSON;