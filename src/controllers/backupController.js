// controllers/backupController.js
import Backup       from '../models/Backup.js';
import ActividadLog from '../models/actividadLog.js';
import RequestInfo  from '../utils/requestInfo.js';

class BackupController {

  // GET /backups
  static async listar(req, res) {
    try {
      const backups = await Backup.findAll();
      res.json({ success: true, data: { backups } });
    } catch (error) {
      console.error('Error al listar backups:', error);
      res.status(500).json({
        success: false,
        message: 'Error al listar backups: ' + error.message,
      });
    }
  }

  // GET /backups/:key
  static async obtenerPorId(req, res) {
    try {
      const backup = await Backup.findById(req.params.key);
      if (!backup) {
        return res.status(404).json({ success: false, message: 'Backup no encontrado' });
      }
      res.json({ success: true, data: { backup } });
    } catch (error) {
      console.error('Error al obtener backup:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener backup: ' + error.message,
      });
    }
  }

  // POST /backups/generar
  static async generar(req, res) {
    try {
      const backup = await Backup.generate(req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'crear',
        modulo:         'backup',
        tabla_afectada: 'backup_registro',
        registro_id:    backup.id,
        datos_nuevos:   { backup_key: backup.backup_key, filename: backup.filename, size_formatted: backup.size_formatted },
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Backup generado: ${backup.filename}`,
      });

      res.status(201).json({
        success: true,
        message: 'Backup generado exitosamente',
        data: { backup },
      });
    } catch (error) {
      console.error('Error al generar backup:', error);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'crear',
        modulo:         'backup',
        tabla_afectada: 'backup_registro',
        registro_id:    null,
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'fallido',
        mensaje:        'Error al generar backup: ' + error.message,
      }).catch(() => {});

      res.status(500).json({
        success: false,
        message: 'Error al generar backup: ' + error.message,
      });
    }
  }

  // GET /backups/:key/descargar
  // Ya no sirve el archivo desde el servidor — redirige a la URL de Cloudinary
  static async descargar(req, res) {
    try {
      const backup = await Backup.findById(req.params.key);
      if (!backup) {
        return res.status(404).json({ success: false, message: 'Backup no encontrado' });
      }

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:     req.user.id,
        accion:         'descargar',
        modulo:         'backup',
        tabla_afectada: 'backup_registro',
        registro_id:    backup.id,
        datos_nuevos:   { filename: backup.filename },
        ip_address:     reqInfo.ip,
        user_agent:     reqInfo.userAgent,
        resultado:      'exitoso',
        mensaje:        `Backup descargado: ${backup.filename}`,
      });

      // Redirigir directamente a Cloudinary — el navegador descarga el .sql
      res.redirect(backup.cloudinary_url);
    } catch (error) {
      console.error('Error al descargar backup:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // POST /backups/:key/restaurar
  // ⚠️ DESTRUCTIVO — requiere { confirmar: true } en el body
  static async restaurar(req, res) {
    try {
      const { confirmar } = req.body;

      if (confirmar !== true) {
        return res.status(400).json({
          success: false,
          message: 'Debés enviar { confirmar: true } para restaurar la base de datos',
        });
      }

      const backupAnterior = await Backup.findById(req.params.key);
      if (!backupAnterior) {
        return res.status(404).json({ success: false, message: 'Backup no encontrado' });
      }

      const backup = await Backup.restore(req.params.key, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:      req.user.id,
        accion:          'restaurar',
        modulo:          'backup',
        tabla_afectada:  'backup_registro',
        registro_id:     backup.id,
        datos_anteriores:{ filename: backupAnterior.filename },
        datos_nuevos:    { ultima_restauracion_at: backup.ultima_restauracion_at },
        ip_address:      reqInfo.ip,
        user_agent:      reqInfo.userAgent,
        resultado:       'exitoso',
        mensaje:         `Base de datos restaurada desde: ${backupAnterior.filename}`,
      });

      res.json({
        success: true,
        message: 'Base de datos restaurada exitosamente',
        data: { backup },
      });
    } catch (error) {
      console.error('Error al restaurar backup:', error);
      const status = error.message.includes('no encontrado') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  // DELETE /backups/:key
  static async eliminar(req, res) {
    try {
      const backup = await Backup.findById(req.params.key);
      if (!backup) {
        return res.status(404).json({ success: false, message: 'Backup no encontrado' });
      }

      await Backup.delete(req.params.key, req.user.id);

      const reqInfo = RequestInfo.extract(req);
      await ActividadLog.create({
        usuario_id:      req.user.id,
        accion:          'eliminar',
        modulo:          'backup',
        tabla_afectada:  'backup_registro',
        registro_id:     backup.id,
        datos_anteriores:{ filename: backup.filename, cloudinary_public_id: backup.cloudinary_public_id },
        ip_address:      reqInfo.ip,
        user_agent:      reqInfo.userAgent,
        resultado:       'exitoso',
        mensaje:         `Backup eliminado: ${backup.filename}`,
      });

      res.json({
        success: true,
        message: 'Backup eliminado correctamente',
      });
    } catch (error) {
      console.error('Error al eliminar backup:', error);
      const status = error.message.includes('no encontrado') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }
}

export default BackupController;