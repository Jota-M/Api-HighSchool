export default class RequestInfo {
  static extract(req) {
    return {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent') || 'Unknown',
      dispositivo: this.detectDevice(req),
      ubicacion: req.get('cf-ipcountry') || null // Si usas Cloudflare
    };
  }

  static detectDevice(req) {
    const ua = req.get('user-agent') || '';
    if (/mobile/i.test(ua)) return 'Mobile';
    if (/tablet/i.test(ua)) return 'Tablet';
    return 'Desktop';
}
}