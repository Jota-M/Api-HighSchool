// scripts/seed_permisos_safe.js
// node scripts/seed_permisos_safe.js

import { pool } from '../src/db/pool.js';

// ============================================================
// Fuente de verdad del seed.
// El campo "id" aquí es solo referencia para mapear ROL_PERMISOS_SEED.
// NO se fuerza en la BD — la secuencia asigna el ID real.
// ============================================================
const PERMISOS_SEED = [
  // usuarios
  { id: 1,   modulo: 'usuarios',               accion: 'crear',         nombre: 'usuarios.crear',                    descripcion: 'Permiso para crear en usuarios' },
  { id: 2,   modulo: 'usuarios',               accion: 'leer',          nombre: 'usuarios.leer',                     descripcion: 'Permiso para leer en usuarios' },
  { id: 3,   modulo: 'usuarios',               accion: 'actualizar',    nombre: 'usuarios.actualizar',               descripcion: 'Permiso para actualizar en usuarios' },
  { id: 4,   modulo: 'usuarios',               accion: 'eliminar',      nombre: 'usuarios.eliminar',                 descripcion: 'Permiso para eliminar en usuarios' },
  // estudiantes
  { id: 5,   modulo: 'estudiantes',            accion: 'crear',         nombre: 'estudiantes.crear',                 descripcion: 'Permiso para crear en estudiantes' },
  { id: 6,   modulo: 'estudiantes',            accion: 'leer',          nombre: 'estudiantes.leer',                  descripcion: 'Permiso para leer en estudiantes' },
  { id: 7,   modulo: 'estudiantes',            accion: 'actualizar',    nombre: 'estudiantes.actualizar',            descripcion: 'Permiso para actualizar en estudiantes' },
  { id: 8,   modulo: 'estudiantes',            accion: 'eliminar',      nombre: 'estudiantes.eliminar',              descripcion: 'Permiso para eliminar en estudiantes' },
  // docentes
  { id: 9,   modulo: 'docentes',               accion: 'crear',         nombre: 'docentes.crear',                    descripcion: 'Permiso para crear en docentes' },
  { id: 10,  modulo: 'docentes',               accion: 'leer',          nombre: 'docentes.leer',                     descripcion: 'Permiso para leer en docentes' },
  { id: 11,  modulo: 'docentes',               accion: 'actualizar',    nombre: 'docentes.actualizar',               descripcion: 'Permiso para actualizar en docentes' },
  { id: 12,  modulo: 'docentes',               accion: 'eliminar',      nombre: 'docentes.eliminar',                 descripcion: 'Permiso para eliminar en docentes' },
  // padres
  { id: 13,  modulo: 'padres',                 accion: 'crear',         nombre: 'padres.crear',                      descripcion: 'Permiso para crear en padres' },
  { id: 14,  modulo: 'padres',                 accion: 'leer',          nombre: 'padres.leer',                       descripcion: 'Permiso para leer en padres' },
  { id: 15,  modulo: 'padres',                 accion: 'actualizar',    nombre: 'padres.actualizar',                 descripcion: 'Permiso para actualizar en padres' },
  { id: 16,  modulo: 'padres',                 accion: 'eliminar',      nombre: 'padres.eliminar',                   descripcion: 'Permiso para eliminar en padres' },
  // periodos
  { id: 17,  modulo: 'periodos',               accion: 'crear',         nombre: 'periodos.crear',                    descripcion: 'Permiso para crear en periodos' },
  { id: 18,  modulo: 'periodos',               accion: 'leer',          nombre: 'periodos.leer',                     descripcion: 'Permiso para leer en periodos' },
  { id: 19,  modulo: 'periodos',               accion: 'actualizar',    nombre: 'periodos.actualizar',               descripcion: 'Permiso para actualizar en periodos' },
  { id: 20,  modulo: 'periodos',               accion: 'eliminar',      nombre: 'periodos.eliminar',                 descripcion: 'Permiso para eliminar en periodos' },
  // niveles
  { id: 21,  modulo: 'niveles',                accion: 'crear',         nombre: 'niveles.crear',                     descripcion: 'Permiso para crear en niveles' },
  { id: 22,  modulo: 'niveles',                accion: 'leer',          nombre: 'niveles.leer',                      descripcion: 'Permiso para leer en niveles' },
  { id: 23,  modulo: 'niveles',                accion: 'actualizar',    nombre: 'niveles.actualizar',                descripcion: 'Permiso para actualizar en niveles' },
  { id: 24,  modulo: 'niveles',                accion: 'eliminar',      nombre: 'niveles.eliminar',                  descripcion: 'Permiso para eliminar en niveles' },
  // paralelos
  { id: 25,  modulo: 'paralelos',              accion: 'crear',         nombre: 'paralelos.crear',                   descripcion: 'Permiso para crear en paralelos' },
  { id: 26,  modulo: 'paralelos',              accion: 'leer',          nombre: 'paralelos.leer',                    descripcion: 'Permiso para leer en paralelos' },
  { id: 27,  modulo: 'paralelos',              accion: 'actualizar',    nombre: 'paralelos.actualizar',              descripcion: 'Permiso para actualizar en paralelos' },
  { id: 28,  modulo: 'paralelos',              accion: 'eliminar',      nombre: 'paralelos.eliminar',                descripcion: 'Permiso para eliminar en paralelos' },
  // materias
  { id: 29,  modulo: 'materias',               accion: 'crear',         nombre: 'materias.crear',                    descripcion: 'Permiso para crear en materias' },
  { id: 30,  modulo: 'materias',               accion: 'leer',          nombre: 'materias.leer',                     descripcion: 'Permiso para leer en materias' },
  { id: 31,  modulo: 'materias',               accion: 'actualizar',    nombre: 'materias.actualizar',               descripcion: 'Permiso para actualizar en materias' },
  { id: 32,  modulo: 'materias',               accion: 'eliminar',      nombre: 'materias.eliminar',                 descripcion: 'Permiso para eliminar en materias' },
  // asignaciones
  { id: 33,  modulo: 'asignaciones',           accion: 'crear',         nombre: 'asignaciones.crear',                descripcion: 'Permiso para crear en asignaciones' },
  { id: 34,  modulo: 'asignaciones',           accion: 'leer',          nombre: 'asignaciones.leer',                 descripcion: 'Permiso para leer en asignaciones' },
  { id: 35,  modulo: 'asignaciones',           accion: 'actualizar',    nombre: 'asignaciones.actualizar',           descripcion: 'Permiso para actualizar en asignaciones' },
  { id: 36,  modulo: 'asignaciones',           accion: 'eliminar',      nombre: 'asignaciones.eliminar',             descripcion: 'Permiso para eliminar en asignaciones' },
  // horarios
  { id: 37,  modulo: 'horarios',               accion: 'crear',         nombre: 'horarios.crear',                    descripcion: 'Permiso para crear en horarios' },
  { id: 38,  modulo: 'horarios',               accion: 'leer',          nombre: 'horarios.leer',                     descripcion: 'Permiso para leer en horarios' },
  { id: 39,  modulo: 'horarios',               accion: 'actualizar',    nombre: 'horarios.actualizar',               descripcion: 'Permiso para actualizar en horarios' },
  { id: 40,  modulo: 'horarios',               accion: 'eliminar',      nombre: 'horarios.eliminar',                 descripcion: 'Permiso para eliminar en horarios' },
  // calificaciones
  { id: 41,  modulo: 'calificaciones',         accion: 'crear',         nombre: 'calificaciones.crear',              descripcion: 'Permiso para crear en calificaciones' },
  { id: 42,  modulo: 'calificaciones',         accion: 'leer',          nombre: 'calificaciones.leer',               descripcion: 'Permiso para leer en calificaciones' },
  { id: 43,  modulo: 'calificaciones',         accion: 'actualizar',    nombre: 'calificaciones.actualizar',         descripcion: 'Permiso para actualizar en calificaciones' },
  { id: 44,  modulo: 'calificaciones',         accion: 'eliminar',      nombre: 'calificaciones.eliminar',           descripcion: 'Permiso para eliminar en calificaciones' },
  // reportes
  { id: 45,  modulo: 'reportes',               accion: 'crear',         nombre: 'reportes.crear',                    descripcion: 'Permiso para crear en reportes' },
  { id: 46,  modulo: 'reportes',               accion: 'leer',          nombre: 'reportes.leer',                     descripcion: 'Permiso para leer en reportes' },
  { id: 47,  modulo: 'reportes',               accion: 'actualizar',    nombre: 'reportes.actualizar',               descripcion: 'Permiso para actualizar en reportes' },
  { id: 48,  modulo: 'reportes',               accion: 'eliminar',      nombre: 'reportes.eliminar',                 descripcion: 'Permiso para eliminar en reportes' },
  // configuracion
  { id: 49,  modulo: 'configuracion',          accion: 'crear',         nombre: 'configuracion.crear',               descripcion: 'Permiso para crear en configuracion' },
  { id: 50,  modulo: 'configuracion',          accion: 'leer',          nombre: 'configuracion.leer',                descripcion: 'Permiso para leer en configuracion' },
  { id: 51,  modulo: 'configuracion',          accion: 'actualizar',    nombre: 'configuracion.actualizar',          descripcion: 'Permiso para actualizar en configuracion' },
  { id: 52,  modulo: 'configuracion',          accion: 'eliminar',      nombre: 'configuracion.eliminar',            descripcion: 'Permiso para eliminar en configuracion' },
  // alertas
  { id: 53,  modulo: 'alertas',                accion: 'crear',         nombre: 'alertas.crear',                     descripcion: 'Permiso para crear en alertas' },
  { id: 54,  modulo: 'alertas',                accion: 'leer',          nombre: 'alertas.leer',                      descripcion: 'Permiso para leer en alertas' },
  { id: 55,  modulo: 'alertas',                accion: 'actualizar',    nombre: 'alertas.actualizar',                descripcion: 'Permiso para actualizar en alertas' },
  { id: 56,  modulo: 'alertas',                accion: 'eliminar',      nombre: 'alertas.eliminar',                  descripcion: 'Permiso para eliminar en alertas' },
  // asistencia
  { id: 57,  modulo: 'asistencia',             accion: 'crear',         nombre: 'asistencia.crear',                  descripcion: 'Permiso para crear en asistencia' },
  { id: 58,  modulo: 'asistencia',             accion: 'leer',          nombre: 'asistencia.leer',                   descripcion: 'Permiso para leer en asistencia' },
  { id: 59,  modulo: 'asistencia',             accion: 'actualizar',    nombre: 'asistencia.actualizar',             descripcion: 'Permiso para actualizar en asistencia' },
  { id: 60,  modulo: 'asistencia',             accion: 'eliminar',      nombre: 'asistencia.eliminar',               descripcion: 'Permiso para eliminar en asistencia' },
  // roles
  { id: 61,  modulo: 'roles',                  accion: 'crear',         nombre: 'roles.crear',                       descripcion: 'Permiso para crear en roles' },
  { id: 62,  modulo: 'roles',                  accion: 'leer',          nombre: 'roles.leer',                        descripcion: 'Permiso para leer en roles' },
  { id: 63,  modulo: 'roles',                  accion: 'actualizar',    nombre: 'roles.actualizar',                  descripcion: 'Permiso para actualizar en roles' },
  { id: 64,  modulo: 'roles',                  accion: 'eliminar',      nombre: 'roles.eliminar',                    descripcion: 'Permiso para eliminar en roles' },
  // permisos
  { id: 65,  modulo: 'permisos',               accion: 'crear',         nombre: 'permisos.crear',                    descripcion: 'Permiso para crear en permisos' },
  { id: 66,  modulo: 'permisos',               accion: 'leer',          nombre: 'permisos.leer',                     descripcion: 'Permiso para leer en permisos' },
  { id: 67,  modulo: 'permisos',               accion: 'actualizar',    nombre: 'permisos.actualizar',               descripcion: 'Permiso para actualizar en permisos' },
  { id: 68,  modulo: 'permisos',               accion: 'eliminar',      nombre: 'permisos.eliminar',                 descripcion: 'Permiso para eliminar en permisos' },
  // sesiones
  { id: 69,  modulo: 'sesiones',               accion: 'crear',         nombre: 'sesiones.crear',                    descripcion: 'Permiso para crear en sesiones' },
  { id: 70,  modulo: 'sesiones',               accion: 'leer',          nombre: 'sesiones.leer',                     descripcion: 'Permiso para leer en sesiones' },
  { id: 71,  modulo: 'sesiones',               accion: 'actualizar',    nombre: 'sesiones.actualizar',               descripcion: 'Permiso para actualizar en sesiones' },
  { id: 72,  modulo: 'sesiones',               accion: 'eliminar',      nombre: 'sesiones.eliminar',                 descripcion: 'Permiso para eliminar en sesiones' },
  // actividad
  { id: 73,  modulo: 'actividad',              accion: 'crear',         nombre: 'actividad.crear',                   descripcion: 'Permiso para crear en actividad' },
  { id: 74,  modulo: 'actividad',              accion: 'leer',          nombre: 'actividad.leer',                    descripcion: 'Permiso para leer en actividad' },
  { id: 75,  modulo: 'actividad',              accion: 'actualizar',    nombre: 'actividad.actualizar',              descripcion: 'Permiso para actualizar en actividad' },
  { id: 76,  modulo: 'actividad',              accion: 'eliminar',      nombre: 'actividad.eliminar',                descripcion: 'Permiso para eliminar en actividad' },
  // periodo_academico
  { id: 153, modulo: 'periodo_academico',      accion: 'crear',         nombre: 'periodo_academico.crear',           descripcion: 'Permiso para crear en periodo academico' },
  { id: 154, modulo: 'periodo_academico',      accion: 'leer',          nombre: 'periodo_academico.leer',            descripcion: 'Permiso para leer en periodo academico' },
  { id: 155, modulo: 'periodo_academico',      accion: 'actualizar',    nombre: 'periodo_academico.actualizar',      descripcion: 'Permiso para actualizar en periodo academico' },
  { id: 156, modulo: 'periodo_academico',      accion: 'eliminar',      nombre: 'periodo_academico.eliminar',        descripcion: 'Permiso para eliminar en periodo academico' },
  // turno
  { id: 157, modulo: 'turno',                  accion: 'crear',         nombre: 'turno.crear',                       descripcion: 'Permiso para crear en turno' },
  { id: 158, modulo: 'turno',                  accion: 'leer',          nombre: 'turno.leer',                        descripcion: 'Permiso para leer en turno' },
  { id: 159, modulo: 'turno',                  accion: 'actualizar',    nombre: 'turno.actualizar',                  descripcion: 'Permiso para actualizar en turno' },
  { id: 160, modulo: 'turno',                  accion: 'eliminar',      nombre: 'turno.eliminar',                    descripcion: 'Permiso para eliminar en turno' },
  // nivel_academico
  { id: 161, modulo: 'nivel_academico',        accion: 'crear',         nombre: 'nivel_academico.crear',             descripcion: 'Permiso para crear en nivel academico' },
  { id: 162, modulo: 'nivel_academico',        accion: 'leer',          nombre: 'nivel_academico.leer',              descripcion: 'Permiso para leer en nivel academico' },
  { id: 163, modulo: 'nivel_academico',        accion: 'actualizar',    nombre: 'nivel_academico.actualizar',        descripcion: 'Permiso para actualizar en nivel academico' },
  { id: 164, modulo: 'nivel_academico',        accion: 'eliminar',      nombre: 'nivel_academico.eliminar',          descripcion: 'Permiso para eliminar en nivel academico' },
  // grado
  { id: 165, modulo: 'grado',                  accion: 'crear',         nombre: 'grado.crear',                       descripcion: 'Permiso para crear en grado' },
  { id: 166, modulo: 'grado',                  accion: 'leer',          nombre: 'grado.leer',                        descripcion: 'Permiso para leer en grado' },
  { id: 167, modulo: 'grado',                  accion: 'actualizar',    nombre: 'grado.actualizar',                  descripcion: 'Permiso para actualizar en grado' },
  { id: 168, modulo: 'grado',                  accion: 'eliminar',      nombre: 'grado.eliminar',                    descripcion: 'Permiso para eliminar en grado' },
  // paralelo
  { id: 169, modulo: 'paralelo',               accion: 'crear',         nombre: 'paralelo.crear',                    descripcion: 'Permiso para crear en paralelo' },
  { id: 170, modulo: 'paralelo',               accion: 'leer',          nombre: 'paralelo.leer',                     descripcion: 'Permiso para leer en paralelo' },
  { id: 171, modulo: 'paralelo',               accion: 'actualizar',    nombre: 'paralelo.actualizar',               descripcion: 'Permiso para actualizar en paralelo' },
  { id: 172, modulo: 'paralelo',               accion: 'eliminar',      nombre: 'paralelo.eliminar',                 descripcion: 'Permiso para eliminar en paralelo' },
  // area_conocimiento
  { id: 269, modulo: 'area_conocimiento',      accion: 'crear',         nombre: 'area_conocimiento.crear',           descripcion: 'Crear áreas de conocimiento' },
  { id: 270, modulo: 'area_conocimiento',      accion: 'leer',          nombre: 'area_conocimiento.leer',            descripcion: 'Ver áreas de conocimiento' },
  { id: 271, modulo: 'area_conocimiento',      accion: 'actualizar',    nombre: 'area_conocimiento.actualizar',      descripcion: 'Editar áreas de conocimiento' },
  { id: 272, modulo: 'area_conocimiento',      accion: 'eliminar',      nombre: 'area_conocimiento.eliminar',        descripcion: 'Eliminar áreas de conocimiento' },
  // materia
  { id: 273, modulo: 'materia',                accion: 'crear',         nombre: 'materia.crear',                     descripcion: 'Crear materias' },
  { id: 274, modulo: 'materia',                accion: 'leer',          nombre: 'materia.leer',                      descripcion: 'Ver materias' },
  { id: 275, modulo: 'materia',                accion: 'actualizar',    nombre: 'materia.actualizar',                descripcion: 'Editar materias y prerequisitos' },
  { id: 276, modulo: 'materia',                accion: 'eliminar',      nombre: 'materia.eliminar',                  descripcion: 'Eliminar materias' },
  // grado_materia
  { id: 277, modulo: 'grado_materia',          accion: 'crear',         nombre: 'grado_materia.crear',               descripcion: 'Asignar materias a grados' },
  { id: 278, modulo: 'grado_materia',          accion: 'leer',          nombre: 'grado_materia.leer',                descripcion: 'Ver materias asignadas a grados' },
  { id: 279, modulo: 'grado_materia',          accion: 'actualizar',    nombre: 'grado_materia.actualizar',          descripcion: 'Editar asignaciones de materias' },
  { id: 280, modulo: 'grado_materia',          accion: 'eliminar',      nombre: 'grado_materia.eliminar',            descripcion: 'Remover materias de grados' },
  // asistencia (nuevos)
  { id: 609, modulo: 'asistencia',             accion: 'reporte',       nombre: 'asistencia.reporte',                descripcion: 'Ver reportes de asistencia' },
  { id: 610, modulo: 'solicitud_permiso',      accion: 'leer',          nombre: 'solicitud_permiso.leer',            descripcion: 'Ver solicitudes de permiso' },
  { id: 611, modulo: 'solicitud_permiso',      accion: 'crear',         nombre: 'solicitud_permiso.crear',           descripcion: 'Crear solicitud de permiso' },
  { id: 612, modulo: 'solicitud_permiso',      accion: 'actualizar',    nombre: 'solicitud_permiso.actualizar',      descripcion: 'Editar solicitud de permiso' },
  { id: 613, modulo: 'solicitud_permiso',      accion: 'aprobar',       nombre: 'solicitud_permiso.aprobar',         descripcion: 'Aprobar o rechazar solicitudes' },
  // notas
  { id: 614, modulo: 'notas',                  accion: 'leer',          nombre: 'notas.leer',                        descripcion: 'Ver calificaciones' },
  { id: 615, modulo: 'notas',                  accion: 'crear',         nombre: 'notas.crear',                       descripcion: 'Registrar calificaciones' },
  { id: 616, modulo: 'notas',                  accion: 'actualizar',    nombre: 'notas.actualizar',                  descripcion: 'Editar calificaciones' },
  { id: 617, modulo: 'notas',                  accion: 'cerrar',        nombre: 'notas.cerrar',                      descripcion: 'Cerrar período de calificaciones' },
  { id: 618, modulo: 'notas',                  accion: 'boletin',       nombre: 'notas.boletin',                     descripcion: 'Ver boletín de notas' },
  // evaluacion
  { id: 619, modulo: 'evaluacion',             accion: 'leer',          nombre: 'evaluacion.leer',                   descripcion: 'Ver evaluaciones' },
  { id: 620, modulo: 'evaluacion',             accion: 'crear',         nombre: 'evaluacion.crear',                  descripcion: 'Crear evaluaciones' },
  { id: 621, modulo: 'evaluacion',             accion: 'actualizar',    nombre: 'evaluacion.actualizar',             descripcion: 'Editar evaluaciones' },
  { id: 622, modulo: 'evaluacion',             accion: 'eliminar',      nombre: 'evaluacion.eliminar',               descripcion: 'Eliminar evaluaciones' },
  { id: 623, modulo: 'periodo_evaluacion',     accion: 'leer',          nombre: 'periodo_evaluacion.leer',           descripcion: 'Ver períodos de evaluación' },
  { id: 624, modulo: 'periodo_evaluacion',     accion: 'crear',         nombre: 'periodo_evaluacion.crear',          descripcion: 'Crear períodos de evaluación' },
  { id: 625, modulo: 'periodo_evaluacion',     accion: 'actualizar',    nombre: 'periodo_evaluacion.actualizar',     descripcion: 'Editar períodos de evaluación' },
  { id: 626, modulo: 'evaluacion',             accion: 'subir_archivo', nombre: 'evaluacion.subir_archivo',          descripcion: 'Subir foto o PDF a una evaluación' },
  { id: 627, modulo: 'evaluacion',             accion: 'ver_publica',   nombre: 'evaluacion.ver_publica',            descripcion: 'Ver evaluación pública (padres y estudiantes)' },
  { id: 628, modulo: 'evaluacion',             accion: 'rubrica_crear', nombre: 'evaluacion.rubrica_crear',          descripcion: 'Crear criterios de rúbrica' },
  { id: 629, modulo: 'evaluacion',             accion: 'rubrica_editar',nombre: 'evaluacion.rubrica_editar',         descripcion: 'Editar criterios de rúbrica' },
  // unidad_tematica
  { id: 630, modulo: 'unidad_tematica',        accion: 'leer',          nombre: 'unidad_tematica.leer',              descripcion: 'Ver unidades temáticas' },
  { id: 631, modulo: 'unidad_tematica',        accion: 'crear',         nombre: 'unidad_tematica.crear',             descripcion: 'Crear unidades temáticas' },
  { id: 632, modulo: 'unidad_tematica',        accion: 'actualizar',    nombre: 'unidad_tematica.actualizar',        descripcion: 'Editar unidades temáticas' },
  { id: 633, modulo: 'unidad_tematica',        accion: 'eliminar',      nombre: 'unidad_tematica.eliminar',          descripcion: 'Eliminar unidades temáticas' },
  // tema
  { id: 634, modulo: 'tema',                   accion: 'leer',          nombre: 'tema.leer',                         descripcion: 'Ver temas' },
  { id: 635, modulo: 'tema',                   accion: 'crear',         nombre: 'tema.crear',                        descripcion: 'Crear temas' },
  { id: 636, modulo: 'tema',                   accion: 'actualizar',    nombre: 'tema.actualizar',                   descripcion: 'Editar temas' },
  { id: 637, modulo: 'tema',                   accion: 'eliminar',      nombre: 'tema.eliminar',                     descripcion: 'Eliminar temas' },
  // material
  { id: 638, modulo: 'material',               accion: 'leer',          nombre: 'material.leer',                     descripcion: 'Ver materiales' },
  { id: 639, modulo: 'material',               accion: 'crear',         nombre: 'material.crear',                    descripcion: 'Subir materiales' },
  { id: 640, modulo: 'material',               accion: 'actualizar',    nombre: 'material.actualizar',               descripcion: 'Editar materiales' },
  { id: 641, modulo: 'material',               accion: 'eliminar',      nombre: 'material.eliminar',                 descripcion: 'Eliminar materiales' },
  { id: 642, modulo: 'material',               accion: 'descargar',     nombre: 'material.descargar',                descripcion: 'Descargar materiales' },
  { id: 643, modulo: 'material',               accion: 'publicar',      nombre: 'material.publicar',                 descripcion: 'Publicar/despublicar materiales' },
  // comentario_material
  { id: 644, modulo: 'comentario_material',    accion: 'leer',          nombre: 'comentario_material.leer',          descripcion: 'Ver comentarios' },
  { id: 645, modulo: 'comentario_material',    accion: 'crear',         nombre: 'comentario_material.crear',         descripcion: 'Comentar en materiales' },
  { id: 646, modulo: 'comentario_material',    accion: 'actualizar',    nombre: 'comentario_material.actualizar',    descripcion: 'Editar comentarios propios' },
  { id: 647, modulo: 'comentario_material',    accion: 'eliminar',      nombre: 'comentario_material.eliminar',      descripcion: 'Eliminar comentarios' },
  { id: 648, modulo: 'comentario_material',    accion: 'moderar',       nombre: 'comentario_material.moderar',       descripcion: 'Moderar comentarios de otros' },
  // progreso
  { id: 649, modulo: 'progreso',               accion: 'leer',          nombre: 'progreso.leer',                     descripcion: 'Ver progreso de estudiantes' },
  { id: 650, modulo: 'progreso',               accion: 'actualizar',    nombre: 'progreso.actualizar',               descripcion: 'Actualizar progreso' },
  { id: 651, modulo: 'progreso',               accion: 'reporte',       nombre: 'progreso.reporte',                  descripcion: 'Ver reportes de progreso' },
  { id: 652, modulo: 'estadisticas_material',  accion: 'leer',          nombre: 'estadisticas_material.leer',        descripcion: 'Ver estadísticas de materiales' },
  // asistencia reporte_clase
  { id: 661, modulo: 'asistencia',             accion: 'reporte_clase', nombre: 'asistencia.reporte_clase',          descripcion: 'Ver reporte de asistencia de toda la clase' },
  // horario
  { id: 662, modulo: 'horario',                accion: 'leer',          nombre: 'horario.leer',                      descripcion: 'Ver horarios' },
  { id: 663, modulo: 'horario',                accion: 'crear',         nombre: 'horario.crear',                     descripcion: 'Crear horarios' },
  { id: 664, modulo: 'horario',                accion: 'actualizar',    nombre: 'horario.actualizar',                descripcion: 'Editar horarios' },
  { id: 665, modulo: 'horario',                accion: 'eliminar',      nombre: 'horario.eliminar',                  descripcion: 'Eliminar horarios' },
  { id: 666, modulo: 'horario',                accion: 'publicar',      nombre: 'horario.publicar',                  descripcion: 'Publicar o archivar horarios' },
  // bloque_horario
  { id: 667, modulo: 'bloque_horario',         accion: 'leer',          nombre: 'bloque_horario.leer',               descripcion: 'Ver bloques horarios' },
  { id: 668, modulo: 'bloque_horario',         accion: 'crear',         nombre: 'bloque_horario.crear',              descripcion: 'Crear bloques horarios' },
  { id: 669, modulo: 'bloque_horario',         accion: 'actualizar',    nombre: 'bloque_horario.actualizar',         descripcion: 'Editar bloques horarios' },
  { id: 670, modulo: 'bloque_horario',         accion: 'eliminar',      nombre: 'bloque_horario.eliminar',           descripcion: 'Eliminar bloques horarios' },
  // observacion_pedagogica
  { id: 680, modulo: 'observacion_pedagogica', accion: 'leer',          nombre: 'observacion_pedagogica.leer',       descripcion: 'Ver observaciones pedagógicas' },
  { id: 681, modulo: 'observacion_pedagogica', accion: 'crear',         nombre: 'observacion_pedagogica.crear',      descripcion: 'Crear observaciones pedagógicas' },
  { id: 682, modulo: 'observacion_pedagogica', accion: 'actualizar',    nombre: 'observacion_pedagogica.actualizar', descripcion: 'Editar observaciones pedagógicas' },
  { id: 683, modulo: 'observacion_pedagogica', accion: 'eliminar',      nombre: 'observacion_pedagogica.eliminar',   descripcion: 'Eliminar (soft) observaciones' },
  { id: 684, modulo: 'observacion_pedagogica', accion: 'publicar',      nombre: 'observacion_pedagogica.publicar',   descripcion: 'Publicar/ocultar observaciones al padre' },
  { id: 685, modulo: 'observacion_pedagogica', accion: 'reporte',       nombre: 'observacion_pedagogica.reporte',    descripcion: 'Ver reportes y línea de tiempo' },
  { id: 686, modulo: 'observacion_pedagogica', accion: 'ver_padre',     nombre: 'observacion_pedagogica.ver_padre',  descripcion: 'Ver observaciones propias como padre' },
  { id: 687, modulo: 'observacion_pedagogica', accion: 'acusar',        nombre: 'observacion_pedagogica.acusar',     descripcion: 'Acusar recibo de una observación' },
  // categoria_observacion
  { id: 688, modulo: 'categoria_observacion',  accion: 'leer',          nombre: 'categoria_observacion.leer',        descripcion: 'Ver categorías de observación' },
  { id: 689, modulo: 'categoria_observacion',  accion: 'gestionar',     nombre: 'categoria_observacion.gestionar',   descripcion: 'Crear/editar categorías y plantillas' },
  // notificaciones
  { id: 690, modulo: 'notificaciones',         accion: 'leer',          nombre: 'notificaciones.leer',               descripcion: 'Ver notificaciones institucionales' },
  { id: 691, modulo: 'notificaciones',         accion: 'crear',         nombre: 'notificaciones.crear',              descripcion: 'Crear notificaciones institucionales' },
  { id: 692, modulo: 'notificaciones',         accion: 'enviar',        nombre: 'notificaciones.enviar',             descripcion: 'Enviar/despachar notificaciones' },
  { id: 693, modulo: 'notificaciones',         accion: 'eliminar',      nombre: 'notificaciones.eliminar',           descripcion: 'Eliminar notificaciones' },
  { id: 694, modulo: 'notificaciones',         accion: 'gestionar',     nombre: 'notificaciones.gestionar',          descripcion: 'Gestión completa de notificaciones' },
  // evaluacion vincular_tema
  { id: 700, modulo: 'evaluacion',             accion: 'vincular_tema', nombre: 'evaluacion.vincular_tema',          descripcion: 'Vincular evaluación a un tema del temario' },
  // material_asignado
  { id: 701, modulo: 'material_asignado',      accion: 'crear',         nombre: 'material_asignado.crear',           descripcion: 'Asignar materiales a estudiantes' },
  { id: 702, modulo: 'material_asignado',      accion: 'leer',          nombre: 'material_asignado.leer',            descripcion: 'Ver materiales asignados' },
  { id: 703, modulo: 'material_asignado',      accion: 'eliminar',      nombre: 'material_asignado.eliminar',        descripcion: 'Eliminar asignaciones de materiales' },
  { id: 704, modulo: 'material_asignado',      accion: 'marcar',        nombre: 'material_asignado.marcar',          descripcion: 'Marcar material como visto' },
  // backup
  { id: 705, modulo: 'backup',                 accion: 'leer',          nombre: 'backup.leer',                       descripcion: 'Ver historial de backups' },
  { id: 706, modulo: 'backup',                 accion: 'crear',         nombre: 'backup.crear',                      descripcion: 'Generar un nuevo backup' },
  { id: 707, modulo: 'backup',                 accion: 'restaurar',     nombre: 'backup.restaurar',                  descripcion: 'Restaurar la base de datos desde un backup' },
  { id: 708, modulo: 'backup',                 accion: 'eliminar',      nombre: 'backup.eliminar',                   descripcion: 'Eliminar un backup de Cloudinary' },
];

// ============================================================
// ROL_PERMISOS usa los IDs del seed como referencia.
// Se traducen al ID real de BD vía módulo+acción en tiempo de ejecución.
// ============================================================
const ROL_PERMISOS_SEED = {
  // super_admin: todos
  1: [
    1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,
    21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
    41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,
    61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,
    153,154,155,156,157,158,159,160,161,162,163,164,
    165,166,167,168,169,170,171,172,
    269,270,271,272,273,274,275,276,277,278,279,280,
    609,610,611,612,613,614,615,616,617,618,
    619,620,621,622,623,624,625,626,627,628,629,
    630,631,632,633,634,635,636,637,
    638,639,640,641,642,643,
    644,645,646,647,648,649,650,651,652,
    661,662,663,664,665,666,667,668,669,670,
    680,681,682,683,684,685,686,687,688,689,
    690,691,692,693,694,
    700,701,702,703,704,705,706,707,708,
  ],
  // secretaria
  2: [
    5,6,7,9,10,11,13,14,15,17,18,19,
    21,22,23,25,26,27,29,30,31,33,34,35,37,38,39,
    690,691,692,693,
  ],
  // docente
  3: [
    5,6,7,29,30,31,37,38,39,41,42,43,57,58,59,
    609,610,613,614,615,616,617,618,
    619,620,621,622,623,626,627,628,629,
    630,631,632,633,634,635,636,637,
    638,639,640,641,642,643,
    644,645,646,647,648,649,651,652,
    662,680,681,682,683,684,685,688,
    701,702,703,704,
  ],
  // estudiante
  4: [
    30,38,42,58,609,618,630,634,638,642,644,645,646,649,650,662,
  ],
  // padre
  5: [
    38,42,54,58,609,610,611,614,618,619,623,627,662,686,687,688,
  ],
};

const ROL_NOMBRES = {
  1: 'super_admin',
  2: 'secretaria',
  3: 'docente',
  4: 'estudiante',
  5: 'padre',
};

async function seedPermisosSafe() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ─────────────────────────────────────────────────────────────
    // PASO 1: Cargar permisos existentes en BD indexados por módulo+acción
    // ─────────────────────────────────────────────────────────────
    const { rows: bdPermisos } = await client.query(
      'SELECT id, modulo, accion FROM permisos'
    );

    // "modulo:accion" → id real en BD
    const bdMap = new Map(bdPermisos.map(p => [`${p.modulo}:${p.accion}`, p.id]));

    // ─────────────────────────────────────────────────────────────
    // PASO 2: Insertar solo permisos que NO existen (por módulo+acción)
    // No se fuerza ningún ID — la secuencia de BD asigna el siguiente libre.
    // ─────────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════');
    console.log('🔑  PASO 1: Insertando permisos faltantes...');
    console.log('══════════════════════════════════════════════\n');

    let insertados = 0;
    let omitidos   = 0;

    for (const p of PERMISOS_SEED) {
      const key = `${p.modulo}:${p.accion}`;

      if (bdMap.has(key)) {
        omitidos++;
        continue; // ya existe con cualquier ID → no tocar
      }

      // Sin columna id → la secuencia asigna el siguiente disponible
      const result = await client.query(
        `INSERT INTO permisos (modulo, accion, nombre, descripcion)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [p.modulo, p.accion, p.nombre, p.descripcion]
      );

      const nuevoId = result.rows[0].id;
      bdMap.set(key, nuevoId); // registrar ID real para el paso de roles
      insertados++;
      console.log(`  ➕ [${nuevoId}] ${p.modulo}.${p.accion}`);
    }

    console.log(`\n  ✅ Insertados : ${insertados}`);
    console.log(`  ⏭️  Omitidos   : ${omitidos} (ya existían)`);

    // ─────────────────────────────────────────────────────────────
    // PASO 3: Construir mapa seedId → idRealBD usando módulo+acción como puente
    // ─────────────────────────────────────────────────────────────
    const seedIdToRealId = new Map();
    for (const p of PERMISOS_SEED) {
      const realId = bdMap.get(`${p.modulo}:${p.accion}`);
      if (realId !== undefined) {
        seedIdToRealId.set(p.id, realId);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PASO 4: Asignar permisos a roles (solo los que no están asignados)
    // ─────────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════');
    console.log('🔗  PASO 2: Asignando permisos a roles...');
    console.log('══════════════════════════════════════════════\n');

    const { rows: bdRolPermisos } = await client.query(
      'SELECT rol_id, permiso_id FROM rol_permisos'
    );
    // Set de asignaciones existentes para lookup O(1)
    const asignadosSet = new Set(bdRolPermisos.map(r => `${r.rol_id}:${r.permiso_id}`));

    const resumen = [];

    for (const [rolIdStr, seedIds] of Object.entries(ROL_PERMISOS_SEED)) {
      const rolId = parseInt(rolIdStr);
      let asignados  = 0;
      let yaExistian = 0;
      let sinMapeo   = 0;

      for (const seedId of seedIds) {
        const realId = seedIdToRealId.get(seedId);

        if (realId === undefined) {
          sinMapeo++;
          console.warn(`  ⚠️  rol ${rolId}: seedId ${seedId} sin mapeo a ID real, se omite.`);
          continue;
        }

        const key = `${rolId}:${realId}`;

        if (asignadosSet.has(key)) {
          yaExistian++;
          continue;
        }

        await client.query(
          `INSERT INTO rol_permisos (rol_id, permiso_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [rolId, realId]
        );

        asignadosSet.add(key);
        asignados++;
      }

      resumen.push({
        rol:               ROL_NOMBRES[rolId] ?? `rol_${rolId}`,
        '➕ asignados':   asignados,
        '✅ ya_tenían':   yaExistian,
        '⚠️  sin_mapeo':  sinMapeo,
        total_seed:        seedIds.length,
      });
    }

    console.log('\n');
    console.table(resumen);

    await client.query('COMMIT');
    console.log('\n✅ Seed completado exitosamente.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error — se hizo rollback:', err.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedPermisosSafe();