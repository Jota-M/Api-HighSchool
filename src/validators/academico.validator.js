// validators/academico.validator.js
import { z } from 'zod';

// ============================================
// PERIODO ACADÉMICO
// ============================================
export const periodoAcademicoSchema = z.object({
  nombre: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  
  codigo: z.string()
    .min(2, 'El código debe tener al menos 2 caracteres')
    .max(20, 'El código no puede exceder 20 caracteres')
    .regex(/^[A-Z0-9-]+$/, 'El código solo puede contener letras mayúsculas, números y guiones')
    .optional()
    .refine(val => val === undefined || val.trim() !== '', 'El código no puede estar vacío'),
  
  fecha_inicio: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .refine(date => {
      const d = new Date(date);
      const [y, m, day] = date.split('-').map(Number);
      return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
    }, 'Fecha de inicio inválida'),
  
  fecha_fin: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .refine(date => {
      const d = new Date(date);
      const [y, m, day] = date.split('-').map(Number);
      return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
    }, 'Fecha fin inválida'),
  
  activo: z.boolean().optional(),
  permite_inscripciones: z.boolean().optional(),
  permite_calificaciones: z.boolean().optional(),
  observaciones: z.string().max(500, 'Las observaciones no pueden exceder 500 caracteres').optional()
}).refine(
  data => new Date(data.fecha_fin) > new Date(data.fecha_inicio),
  {
    message: 'La fecha de fin debe ser posterior a la fecha de inicio',
    path: ['fecha_fin']
  }
);

export const periodoAcademicoUpdateSchema = periodoAcademicoSchema.partial();

// ============================================
// TURNO
// ============================================
export const turnoSchema = z.object({
  nombre: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(50, 'El nombre no puede exceder 50 caracteres'),
  
  codigo: z.string()
    .min(2, 'El código debe tener al menos 2 caracteres')
    .max(10, 'El código no puede exceder 10 caracteres')
    .regex(/^[A-Z0-9]+$/, 'El código solo puede contener letras mayúsculas y números')
    .optional()
    .refine(val => val === undefined || val.trim() !== '', 'El código no puede estar vacío'),
  
  hora_inicio: z.string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato de hora inválido (HH:MM)'),
  
  hora_fin: z.string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato de hora inválido (HH:MM)'),
  
  activo: z.boolean().optional(),
  
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Formato de color hexadecimal inválido (#RRGGBB)')
    .optional()
}).refine(
  data => {
    const [horaI, minI] = data.hora_inicio.split(':').map(Number);
    const [horaF, minF] = data.hora_fin.split(':').map(Number);
    const inicio = horaI * 60 + minI;
    const fin = horaF * 60 + minF;
    return fin > inicio;
  },
  {
    message: 'La hora de fin debe ser posterior a la hora de inicio',
    path: ['hora_fin']
  }
);

export const turnoUpdateSchema = turnoSchema.partial();

// ============================================
// NIVEL ACADÉMICO
// ============================================
export const nivelAcademicoSchema = z.object({
  nombre: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  
  codigo: z.string()
    .min(2, 'El código debe tener al menos 2 caracteres')
    .max(20, 'El código no puede exceder 20 caracteres')
    .regex(/^[A-Z0-9-]+$/, 'El código solo puede contener letras mayúsculas, números y guiones')
    .optional()
    .refine(val => val === undefined || val.trim() !== '', 'El código no puede estar vacío'),
  
  descripcion: z.string()
    .max(500, 'La descripción no puede exceder 500 caracteres')
    .optional(),
  
  orden: z.number()
    .int('El orden debe ser un número entero')
    .positive('El orden debe ser un número positivo'),
  
  edad_minima: z.number()
    .int('La edad mínima debe ser un número entero')
    .min(0, 'La edad mínima no puede ser negativa')
    .max(100, 'La edad mínima no puede exceder 100')
    .optional(),
  
  edad_maxima: z.number()
    .int('La edad máxima debe ser un número entero')
    .min(0, 'La edad máxima no puede ser negativa')
    .max(100, 'La edad máxima no puede exceder 100')
    .optional(),
  
  activo: z.boolean().optional(),
  
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Formato de color hexadecimal inválido (#RRGGBB)')
    .optional(),
  
  icono: z.string()
    .max(50, 'El icono no puede exceder 50 caracteres')
    .optional()
}).refine(
  data => {
    if (data.edad_minima !== undefined && data.edad_maxima !== undefined) {
      return data.edad_maxima > data.edad_minima;
    }
    return true;
  },
  {
    message: 'La edad máxima debe ser mayor que la edad mínima',
    path: ['edad_maxima']
  }
);

export const nivelAcademicoUpdateSchema = nivelAcademicoSchema.partial();

// ============================================
// GRADO
// ============================================
export const gradoSchema = z.object({
  nivel_academico_id: z.number()
    .int('El ID del nivel académico debe ser un número entero')
    .positive('El ID del nivel académico debe ser positivo'),
  
  nombre: z.string()
    .min(1, 'El nombre es requerido')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  
  codigo: z.string()
    .min(2, 'El código debe tener al menos 2 caracteres')
    .max(20, 'El código no puede exceder 20 caracteres')
    .regex(/^[A-Z0-9-]+$/, 'El código solo puede contener letras mayúsculas, números y guiones')
    .optional()
    .refine(val => val === undefined || val.trim() !== '', 'El código no puede estar vacío'),
  
  descripcion: z.string()
    .max(500, 'La descripción no puede exceder 500 caracteres')
    .optional(),
  
  orden: z.number()
    .int('El orden debe ser un número entero')
    .positive('El orden debe ser un número positivo'),
  
  activo: z.boolean().optional()
});

export const gradoUpdateSchema = gradoSchema.partial();

// ============================================
// PARALELO
// ============================================
export const paraleloSchema = z.object({
  grado_id: z.number()
    .int('El ID del grado debe ser un número entero')
    .positive('El ID del grado debe ser positivo'),
  
  turno_id: z.number()
    .int('El ID del turno debe ser un número entero')
    .positive('El ID del turno debe ser positivo'),
  
  nombre: z.string()
    .min(1, 'El nombre es requerido')
    .max(10, 'El nombre no puede exceder 10 caracteres')
    .regex(/^[A-Z0-9]+$/, 'El nombre solo puede contener letras mayúsculas y números'),
  
  capacidad_maxima: z.number()
    .int('La capacidad máxima debe ser un número entero')
    .positive('La capacidad máxima debe ser positiva')
    .min(1, 'La capacidad máxima debe ser al menos 1')
    .max(100, 'La capacidad máxima no puede exceder 100')
    .default(30),
  
  capacidad_minima: z.number()
    .int('La capacidad mínima debe ser un número entero')
    .positive('La capacidad mínima debe ser positiva')
    .min(1, 'La capacidad mínima debe ser al menos 1')
    .max(50, 'La capacidad mínima no puede exceder 50')
    .default(15)
    .optional(),
  
  anio: z.number()
    .int('El año debe ser un número entero')
    .min(2000, 'El año debe ser mayor o igual a 2000')
    .max(2100, 'El año debe ser menor o igual a 2100'),
  
  aula: z.string()
    .max(50, 'El aula no puede exceder 50 caracteres')
    .optional(),
  
  activo: z.boolean().optional()
}).refine(
  data => {
    const min = data.capacidad_minima ?? 15;
    return data.capacidad_maxima > min;
  },
  {
    message: 'La capacidad máxima debe ser mayor que la capacidad mínima',
    path: ['capacidad_maxima']
  }
);

export const paraleloUpdateSchema = paraleloSchema.partial();

// ============================================
// MIDDLEWARE DE VALIDACIÓN
// ============================================
export const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return res.status(400).json({
        success: false,
        message: 'Error de validación',
        errors
      });
    }

    next();
  };
};

