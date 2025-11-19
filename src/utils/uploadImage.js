import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

class UploadImage {
  /**
   * Subir imagen a Cloudinary desde buffer
   * @param {Buffer} buffer - Buffer de la imagen
   * @param {string} folder - Carpeta en Cloudinary (ej: 'estudiantes', 'docentes')
   * @param {string} fileName - Nombre del archivo (opcional)
   * @returns {Promise<Object>} - Resultado con url, public_id, etc.
   */
  static async uploadFromBuffer(buffer, folder = 'plataforma_educativa', fileName = null) {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: folder,
        resource_type: 'image',
        transformation: [
          { width: 800, height: 800, crop: 'limit' },
          { quality: 'auto:good' }
        ]
      };

      if (fileName) {
        uploadOptions.public_id = fileName;
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              url: result.secure_url,
              public_id: result.public_id,
              width: result.width,
              height: result.height,
              format: result.format
            });
          }
        }
      );

      // Convertir buffer a stream y hacer pipe
      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  }

  /**
   * Eliminar imagen de Cloudinary
   * @param {string} publicId - Public ID de la imagen en Cloudinary
   * @returns {Promise<Object>}
   */
  static async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (error) {
      console.error('Error al eliminar imagen:', error);
      throw error;
    }
  }

  /**
   * Obtener public_id desde URL de Cloudinary
   * @param {string} url - URL completa de Cloudinary
   * @returns {string|null} - Public ID o null
   */
  static extractPublicIdFromUrl(url) {
    if (!url || !url.includes('cloudinary.com')) return null;
    
    try {
      // Extraer de URL tipo: https://res.cloudinary.com/cloud/image/upload/v1234567890/folder/image.jpg
      const parts = url.split('/');
      const uploadIndex = parts.indexOf('upload');
      
      if (uploadIndex === -1) return null;
      
      // Tomar todo después de /upload/ hasta antes de la extensión
      const pathParts = parts.slice(uploadIndex + 2); // Saltar 'upload' y version
      const pathWithoutExtension = pathParts.join('/').split('.')[0];
      
      return pathWithoutExtension;
    } catch (error) {
      console.error('Error al extraer public_id:', error);
      return null;
    }
  }

  /**
   * Validar que el archivo sea una imagen
   * @param {Object} file - Archivo desde req.file
   * @returns {boolean}
   */
  static isValidImage(file) {
    if (!file) return false;
    
    const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    return validMimeTypes.includes(file.mimetype);
  }

  /**
   * Validar tamaño de archivo (máximo 5MB por defecto)
   * @param {Object} file - Archivo desde req.file
   * @param {number} maxSizeMB - Tamaño máximo en MB
   * @returns {boolean}
   */
  static isValidSize(file, maxSizeMB = 5) {
    if (!file) return false;
    
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
  }
}

export default UploadImage;
