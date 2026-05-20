// utils/uploadFile.js
import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

class UploadFile {
  /**
   * Subir cualquier archivo a Cloudinary (PDF, doc, xlsx, etc.)
   * @param {Buffer} buffer
   * @param {string} folder
   * @param {string} fileName - nombre original del archivo CON extensión (ej: "apuntes.pdf")
   * @param {string} resourceType - 'auto' | 'image' | 'video' | 'raw'
   * @returns {Promise<Object>} - { url, public_id, resource_type, bytes, format }
   */
  static async uploadFromBuffer(buffer, folder = 'materiales', fileName = null, resourceType = 'auto') {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        // Para RAW: forzar descarga en vez de preview inline
        flags: resourceType === 'raw' ? 'attachment' : undefined,
      };

      if (fileName) {
        if (resourceType === 'raw') {
          // Para raw (PDF, docx, xlsx, zip, etc.) Cloudinary NO agrega
          // extensión automáticamente → hay que incluirla en el public_id
          uploadOptions.public_id = fileName;             // ej: "apuntes-algebra.pdf"
        } else {
          // Para image y video Cloudinary maneja la extensión solo →
          // si la dejamos en el public_id terminamos con "foto.jpg.jpg"
          uploadOptions.public_id = fileName.replace(/\.[^/.]+$/, '');
        }
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              url:           result.secure_url,
              public_id:     result.public_id,
              resource_type: result.resource_type,
              bytes:         result.bytes,
              format:        result.format,
              pages:         result.pages || null,   // PDFs tienen páginas
            });
          }
        }
      );

      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  }

  /**
   * Eliminar archivo de Cloudinary
   * @param {string} publicId
   * @param {string} resourceType - 'image' | 'video' | 'raw'
   */
  static async deleteFile(publicId, resourceType = 'raw') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      return result;
    } catch (error) {
      console.error('Error al eliminar archivo de Cloudinary:', error);
      throw error;
    }
  }

  /**
   * Detectar el resource_type correcto según el mimetype
   * @param {string} mimetype
   * @returns {string}
   */
  static getResourceType(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'video'; // Cloudinary maneja audio bajo 'video'
    return 'raw'; // PDF, docx, xlsx, zip, etc.
  }

  /**
   * Extraer public_id desde URL de Cloudinary (soporta image, video, raw)
   * @param {string} url
   * @returns {string|null}
   */
  static extractPublicIdFromUrl(url) {
    if (!url || !url.includes('cloudinary.com')) return null;
    try {
      const parts = url.split('/');
      const uploadIndex = parts.indexOf('upload');
      if (uploadIndex === -1) return null;

      // Saltar 'upload' y la versión (v1234567890)
      const afterUpload = parts.slice(uploadIndex + 1);
      const startIndex =
        afterUpload[0].startsWith('v') && /^\d+$/.test(afterUpload[0].slice(1))
          ? 1
          : 0;

      const pathParts = afterUpload.slice(startIndex).join('/');

      // Para raw: NO quitar la extensión porque es parte del public_id
      // Para image/video: quitar extensión
      const isRaw = url.includes('/raw/upload/');
      return isRaw ? pathParts : pathParts.replace(/\.[^/.]+$/, '');
    } catch (error) {
      console.error('Error al extraer public_id:', error);
      return null;
    }
  }

  /**
   * Validar tipo de archivo según el mimetype
   * @param {Object} file
   * @param {string[]} allowedMimes
   * @returns {boolean}
   */
  static isValidType(file, allowedMimes) {
    if (!file) return false;
    return allowedMimes.includes(file.mimetype);
  }

  /**
   * Validar tamaño de archivo
   * @param {Object} file
   * @param {number} maxSizeMB
   * @returns {boolean}
   */
  static isValidSize(file, maxSizeMB = 10) {
    if (!file) return false;
    return file.size <= maxSizeMB * 1024 * 1024;
  }

  /**
   * MIME types permitidos para materiales académicos
   */
  static ALLOWED_MIMES = [
    // Documentos
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Imágenes
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
    // Video
    'video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv', 'video/webm',
    // Comprimidos
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    // Código
    'text/plain', 'text/html', 'text/css', 'application/javascript',
  ];
}

export default UploadFile;