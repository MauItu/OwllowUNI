import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';
import { users, type User } from '../db/schema.js';
import { provisionUserDefaults } from '../db/defaults.js';
import { asyncHandler, ApiError, isUniqueViolation } from '../middleware/errorHandler.js';
import { authenticate, signToken, userId } from '../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiter.js';

export const authRouter = Router();

const SALT_ROUNDS = 12;

/** Datos públicos del usuario (nunca el hash de la contraseña). */
function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
  };
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido').max(255),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido').max(255),
  password: z.string().min(1, 'La contraseña es obligatoria').max(200),
});

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200).optional(),
    currentPassword: z.string().max(200).optional(),
  })
  .refine((d) => d.name !== undefined || d.password !== undefined, {
    message: 'No hay cambios para guardar',
  });

// POST /api/auth/register
authRouter.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);

    const [existing] = await db.select().from(users).where(eq(users.email, data.email));
    if (existing) throw new ApiError(409, 'Ya existe una cuenta con ese correo');

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    // El check previo es best-effort; la fuente de verdad es el UNIQUE de users.email.
    // Mapeamos la violación (SQLSTATE 23505) a 409 para cubrir el registro concurrente.
    let user: User;
    try {
      [user] = await db
        .insert(users)
        .values({ email: data.email, passwordHash, name: data.name, isAdmin: false })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new ApiError(409, 'Ya existe una cuenta con ese correo');
      throw err;
    }

    // Provisiona las categorías por defecto y la cuenta "Efectivo" del usuario.
    await provisionUserDefaults(user.id);

    const token = signToken({ id: user.id, email: user.email, isAdmin: user.isAdmin });
    res.status(201).json({ token, user: publicUser(user) });
  }),
);

// POST /api/auth/login
authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.email, data.email));
    // Mensaje genérico para no filtrar si el correo existe.
    if (!user) throw new ApiError(401, 'Credenciales inválidas');
    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) throw new ApiError(401, 'Credenciales inválidas');

    const token = signToken({ id: user.id, email: user.email, isAdmin: user.isAdmin });
    res.json({ token, user: publicUser(user) });
  }),
);

// GET /api/auth/me — datos del usuario autenticado
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, userId(req)));
    if (!user) throw new ApiError(404, 'Usuario no encontrado');
    res.json(publicUser(user));
  }),
);

// PUT /api/auth/profile — cambiar nombre y/o contraseña (verifica la actual)
authRouter.put(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = profileSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.id, userId(req)));
    if (!user) throw new ApiError(404, 'Usuario no encontrado');

    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

    if (data.name !== undefined) updates.name = data.name;

    if (data.password !== undefined) {
      // Cambiar contraseña exige la contraseña actual correcta.
      const ok = data.currentPassword
        ? await bcrypt.compare(data.currentPassword, user.passwordHash)
        : false;
      if (!ok) throw new ApiError(401, 'La contraseña actual es incorrecta');
      updates.passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning();
    res.json(publicUser(updated));
  }),
);
