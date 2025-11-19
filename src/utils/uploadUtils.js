import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

class UploadUtils {
  // Subir imagen desde buffer (multer)
static async uploadImage(file, folder = 'estudiantes') {
    try {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: folder,
            resource_type: 'image',
            transformation: [
              { width: 500, height: 500, crop: 'limit' },
              { quality: 'auto' },
              { fetch_format: 'auto' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        const bufferStream = new Readable();
        bufferStream.push(file.buffer);
        bufferStream.push(null);
        bufferStream.pipe(uploadStream);
      });
    } catch (error) {
      throw new Error('Error al subir imagen: ' + error.message);
    }
  }

  // Subir PDF desde buffer
  static async uploadPDF(file, folder = 'documentos') {
    try {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: folder,
            resource_type: 'raw',
            format: 'pdf'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        const bufferStream = new Readable();
        bufferStream.push(file.buffer);
        bufferStream.push(null);
        bufferStream.pipe(uploadStream);
      });
    } catch (error) {
      throw new Error('Error al subir PDF: ' + error.message);
    }
  }

  // Eliminar archivo de Cloudinary
  static async deleteFile(publicId, resourceType = 'image') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType
      });
      return result;
    } catch (error) {
      throw new Error('Error al eliminar archivo: ' + error.message);
    }
  }

  // Obtener public_id de una URL de Cloudinary
  static getPublicIdFromUrl(url) {
    if (!url) return null;
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    const publicId = filename.split('.')[0];
    const folder = parts[parts.length - 2];
    return `${folder}/${publicId}`;
  }
}

export default UploadUtils;
