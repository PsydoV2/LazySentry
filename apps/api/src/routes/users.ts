// User management (docs/CONCEPT.md 2.6): admin-only. New accounts are always
// created here by an admin — there is no self-signup after the first account
// (setup wizard, routes/setup.ts).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordAuditLog } from '../audit/log.js';
import { requireAuth, requireRole, requireSameOrigin } from '../auth/session.js';
import {
  countAdmins,
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  passwordSchema,
  type PublicUser,
  roleSchema,
  updateUserRole,
  usernameSchema,
  usernameTaken,
} from '../auth/users.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

/** Wire format: epoch milliseconds, never a Date (docs/CONCEPT.md 3.4 header). */
function toWireUser(user: PublicUser) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.getTime(),
    lastLoginAt: user.lastLoginAt?.getTime() ?? null,
  };
}

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: roleSchema,
});

const updateRoleSchema = z.object({
  role: roleSchema,
});

const idParamSchema = z.object({ id: z.coerce.number().int() });

export function registerUserRoutes(app: FastifyInstance): void {
  app.get('/api/users', async (request) => {
    requireRole(request, 'admin');
    return { users: listUsers().map(toWireUser) };
  });

  app.post(
    '/api/users',
    { config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      requireRole(request, 'admin');
      requireSameOrigin(request);
      const input = createUserSchema.parse(request.body);

      if (usernameTaken(input.username)) {
        throw conflict('USERNAME_TAKEN', `${input.username} is already in use`);
      }

      const user = await createUser(input.username, input.password, input.role);
      recordAuditLog(request, {
        action: 'user.create',
        resourceType: 'user',
        resourceId: user.id,
        meta: { username: user.username, role: user.role },
      });
      return reply.status(201).send(toWireUser(user));
    },
  );

  app.patch('/api/users/:id', async (request, reply) => {
    requireRole(request, 'admin');
    requireSameOrigin(request);
    const currentUserId = requireAuth(request);
    const { id } = idParamSchema.parse(request.params);
    const { role } = updateRoleSchema.parse(request.body);

    const target = getUserById(id);
    if (!target) throw notFound('User not found');

    if (target.role === 'admin' && role === 'member' && countAdmins() <= 1) {
      throw conflict(
        'LAST_ADMIN',
        'Cannot demote the last remaining admin — promote another user first',
      );
    }
    if (id === currentUserId && role !== target.role) {
      throw badRequest('Cannot change your own role');
    }

    const updated = updateUserRole(id, role);
    if (!updated) throw notFound('User not found');
    recordAuditLog(request, {
      action: 'user.role_change',
      resourceType: 'user',
      resourceId: id,
      meta: { username: target.username, from: target.role, to: role },
    });
    return reply.send(toWireUser(updated));
  });

  app.delete('/api/users/:id', async (request, reply) => {
    requireRole(request, 'admin');
    requireSameOrigin(request);
    const currentUserId = requireAuth(request);
    const { id } = idParamSchema.parse(request.params);

    const target = getUserById(id);
    if (!target) throw notFound('User not found');

    if (id === currentUserId) {
      throw badRequest('Cannot delete your own account');
    }
    if (target.role === 'admin' && countAdmins() <= 1) {
      throw conflict('LAST_ADMIN', 'Cannot delete the last remaining admin');
    }

    deleteUser(id);
    recordAuditLog(request, {
      action: 'user.delete',
      resourceType: 'user',
      resourceId: id,
      meta: { username: target.username },
    });
    return reply.status(204).send();
  });
}
