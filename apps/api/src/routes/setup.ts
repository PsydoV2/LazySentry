// Setup wizard (docs/CONCEPT.md 7): create the admin account, then connect
// GitHub. Account creation is permanently locked once an account exists —
// there is no default password and no second way in.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listGitAccounts } from '../accounts/git-accounts.js';
import { recordAuditLog } from '../audit/log.js';
import { requireSameOrigin } from '../auth/session.js';
import {
  adminAccountExists,
  createAdminAccount,
  passwordSchema,
  usernameSchema,
} from '../auth/users.js';
import { conflict } from '../lib/errors.js';

const createAdminSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Passwords do not match',
  });

export function registerSetupRoutes(app: FastifyInstance): void {
  // Unauthenticated on purpose: the client needs to know whether to show the
  // wizard or the login form before anyone can log in. It leaks only whether
  // setup has happened, which is visible from the UI anyway.
  app.get('/api/setup/status', async () => {
    const hasAccount = listGitAccounts().length > 0;
    return {
      adminAccountExists: adminAccountExists(),
      gitAccountConnected: hasAccount,
      complete: adminAccountExists() && hasAccount,
    };
  });

  app.post('/api/setup/admin', async (request, reply) => {
    requireSameOrigin(request);
    if (adminAccountExists()) {
      throw conflict(
        'SETUP_ALREADY_COMPLETE',
        'An admin account already exists. Sign in instead.',
      );
    }
    const input = createAdminSchema.parse(request.body);
    const user = await createAdminAccount(input.username, input.password);

    // Log the new admin straight in — they just proved they own the instance.
    request.session.userId = user.id;
    request.session.username = user.username;
    recordAuditLog(request, {
      action: 'user.create',
      resourceType: 'user',
      resourceId: user.id,
      meta: { role: 'admin', via: 'setup_wizard' },
    });

    return reply.status(201).send({ id: user.id, username: user.username });
  });
}
