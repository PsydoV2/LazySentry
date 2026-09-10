import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSameOrigin } from '../auth/session.js';
import { verifyCredentials } from '../auth/users.js';
import { unauthorized } from '../lib/errors.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post(
    '/api/auth/login',
    {
      // Rate limit is tighter than the global one: this is the endpoint an
      // attacker would brute-force (docs/CONCEPT.md 6.2).
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      requireSameOrigin(request);
      const input = loginSchema.parse(request.body);
      const user = await verifyCredentials(input.username, input.password);
      // One message for both wrong username and wrong password, so the
      // response does not reveal which usernames exist.
      if (!user) throw unauthorized('Invalid username or password');

      await request.session.regenerate();
      request.session.userId = user.id;
      request.session.username = user.username;
      return reply.send({ id: user.id, username: user.username });
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    requireSameOrigin(request);
    await request.session.destroy();
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (request) => {
    if (request.session.userId === undefined) throw unauthorized();
    return {
      id: request.session.userId,
      username: request.session.username,
    };
  });
}
