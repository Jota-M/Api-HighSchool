import { Router } from 'express';
import { login, register } from '../controllers/userController.js';
import { validate } from '../middlewares/validationMiddleware.js';
import { loginSchema, registerSchema } from '../schemas/auth.schema.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);

export default router;
