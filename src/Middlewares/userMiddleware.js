import { verifyToken } from '../utils/jwt.js';

export function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requerido' });

    const token = authHeader.split(' ')[1];
    try {
        const user = verifyToken(token);
        req.user = user;
        next();
    } catch (err) {
        res.status(403).json({ error: 'Token inválido' });
    }
}

export function authorize(roles = []) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }
        next();
    };
}
