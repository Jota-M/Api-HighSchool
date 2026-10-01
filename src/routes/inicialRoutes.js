// server/src/routes/inicialRoutes.js
import express from 'express';
import { InicialController } from '../controllers/inicialController.js';
import { authenticate, authorize } from '../Middlewares/auth.js';

const router = express.Router();

// Todas las rutas de Inicial requieren autenticación
router.use(authenticate);

// ── 1. NIVELES DE LOGRO ───────────────────────────────────────────────────
router.get('/niveles-logro', InicialController.getNivelesLogro);

// ── 2. INDICADORES DE LOGRO ───────────────────────────────────────────────
router.get('/indicadores', InicialController.getIndicadores);
router.post('/indicadores', authorize('cotejo.gestionar_indicadores', 'cotejo.registrar', 'cotejo.ver', 'notas.crear', 'evaluacion.crear'), InicialController.createIndicador);
router.put('/indicadores/:id', authorize('cotejo.gestionar_indicadores', 'cotejo.registrar', 'cotejo.ver', 'notas.actualizar', 'evaluacion.actualizar'), InicialController.updateIndicador);
router.delete('/indicadores/:id', authorize('cotejo.gestionar_indicadores', 'cotejo.registrar', 'cotejo.ver', 'notas.eliminar', 'evaluacion.eliminar'), InicialController.deleteIndicador);

// ── 3. LISTAS DE COTEJO ───────────────────────────────────────────────────
router.get('/cotejo/paralelo/:paraleloId/periodo/:periodoId', authorize('cotejo.ver'), InicialController.getMatrizCotejo);
router.get('/cotejo/estudiante/:matriculaId/periodo/:periodoId', authorize('cotejo.ver', 'informe_cualitativo.ver', 'notas.leer'), InicialController.getCotejoEstudiante);
router.post('/cotejo/bulk', authorize('cotejo.registrar'), InicialController.guardarCotejoBulk);

// ── 4. INFORMES CUALITATIVOS ──────────────────────────────────────────────
router.get('/centralizador/paralelo/:paraleloId', authorize('informe_cualitativo.ver'), InicialController.getCentralizadorInformes);
router.get('/informe/paralelo/:paraleloId/periodo/:periodoId', authorize('informe_cualitativo.ver'), InicialController.getInformesParalelo);
router.get('/informe/:matriculaId/:periodoId', authorize('informe_cualitativo.ver', 'notas.leer', 'cotejo.ver'), InicialController.getInforme);
router.post('/informe/:matriculaId/:periodoId/generar-ia', authorize('informe_cualitativo.redactar'), InicialController.generarInformeIA);
router.put('/informe/:matriculaId/:periodoId', authorize('informe_cualitativo.redactar'), InicialController.guardarInforme);
router.post('/informe/:matriculaId/:periodoId/publicar', authorize('informe_cualitativo.publicar'), InicialController.publicarInforme);

// ── 5. ASIGNACIÓN TITULAR DE INICIAL ──────────────────────────────────────
router.post('/asignacion-titular', InicialController.asignarTitularInicial);

// ── 6. BOLETÍN / LIBRETA CUALITATIVA (PDF / EXCEL) ──────────────────────
router.get('/boletin/:matriculaId/:periodoId', authorize('informe_cualitativo.ver'), InicialController.descargarBoletinPDF);
router.get('/boletin/:matriculaId/:periodoId/pdf', authorize('informe_cualitativo.ver'), InicialController.descargarBoletinPDF);

// ── 7. REPORTES DE COTEJO E INFORMES CUALITATIVOS ────────────────────────
router.get('/cotejo/paralelo/:paraleloId/periodo/:periodoId/reporte', authorize('cotejo.ver'), InicialController.reporteMatrizCotejo);
router.get('/centralizador/paralelo/:paraleloId/periodo/:periodoId/reporte', authorize('informe_cualitativo.ver'), InicialController.reporteCentralizadorInformes);

// ── 8. ACTIVIDADES DEL TEMARIO INICIAL ───────────────────────────────────
router.get('/actividades', InicialController.getActividades);
router.post('/actividades', authorize('temario_inicial.gestionar'), InicialController.createActividad);
router.post('/actividades/generar-ia', authorize('temario_inicial.gestionar'), InicialController.generarActividadesIA);
router.put('/actividades/:id', authorize('temario_inicial.gestionar'), InicialController.updateActividad);
router.delete('/actividades/:id', authorize('temario_inicial.gestionar'), InicialController.deleteActividad);

export default router;

