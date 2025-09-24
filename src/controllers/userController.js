import { createUser, findUserByUsername } from '../models/userModel.js';
import bcrypt from 'bcrypt';
import { generateToken } from '../utils/jwt.js';

export async function register(req, res) {
    const { username, password, role } = req.body;

    try {
        const user = await createUser({ username, password, role });
        res.status(201).json({ message: 'Usuario creado', user });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

export async function login(req, res) {
    const { username, password } = req.body;

    try {
        const user = await findUserByUsername(username);
        if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

        const token = generateToken({ id: user.id, role: user.role });

        res.json({
            message: 'Login exitoso',
            token,
            role: user.role 
        });
    } catch (err) {
        res.status(500).json({ error: 'Error en el servidor' });
    }
}
