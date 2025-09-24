import { z } from 'zod';

export const loginSchema = z.object({
    username: z.string().min(3).max(100),
    password: z.string().min(6),
});

export const registerSchema = loginSchema.extend({
    role: z.enum(['admin', 'user']),
});
