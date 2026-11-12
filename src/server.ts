import type { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { HTTPException } from 'hono/http-exception';
import { installAuth, type AuthOptions } from './auth';
import {
  addMemberRequest,
  correctionRequest,
  createTaskRequest,
  drawRequest,
  memberStatusRequest,
  participantRemovalRequest,
  participantRequest,
  undoRequest,
  updateTaskRequest,
} from './backend/request-schemas';
import { openDatabase } from './db';
import { ChooserService, createService, DomainError } from './service';

interface AppOptions {
  db?: Database;
  service?: ChooserService;
  auth?: Partial<AuthOptions>;
}

function id(value: string): number {
  const number = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(number)) {
    throw new DomainError(400, 'INVALID_ID', 'Die ID ist ungültig.');
  }
  return number;
}

/** Supplied database connections remain owned by the caller, including in tests. */
export function createApp(options: AppOptions = {}) {
  const db = options.db ?? openDatabase();
  const service = options.service ?? createService(db);
  const app = new Hono();

  app.onError((error, context) => {
    if (error instanceof DomainError) {
      return context.json({ error: { code: error.code, message: error.message } }, error.status);
    }

    if (error instanceof HTTPException) {
      if (error.status === 400) {
        return context.json(
          {
            error: { code: 'INVALID_JSON', message: 'Bitte sende gültige JSON-Objektdaten.' },
          },
          400,
        );
      }
      // Preserve standard responses, especially Basic Auth's WWW-Authenticate header.
      return error.getResponse();
    }

    if (String(error).includes('SQLITE_BUSY') || String(error).includes('database is locked')) {
      return context.json(
        {
          error: {
            code: 'DATABASE_BUSY',
            message: 'Die Datenbank ist kurz beschäftigt. Bitte versuche die Anfrage erneut.',
          },
        },
        503,
      );
    }

    console.error('Anfrage fehlgeschlagen:', error);
    return context.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Die Anfrage konnte nicht verarbeitet werden. Bitte versuche es erneut.',
        },
      },
      500,
    );
  });

  installAuth(app, options.auth);

  app.get('/healthz', (context) => {
    try {
      db.query('SELECT 1').get();
      return context.json({ status: 'ok' });
    } catch {
      return context.json({ status: 'unavailable' }, 503);
    }
  });

  app.get('/api/state', (context) => context.json(service.state()));
  app.get('/api/tasks/:id', (context) => {
    return context.json(service.getTask(id(context.req.param('id'))));
  });
  app.get('/api/tasks/:id/history', (context) => {
    return context.json(service.history(id(context.req.param('id'))));
  });

  app.post('/api/tasks', createTaskRequest, (context) => {
    return context.json(service.createTask(context.req.valid('json')), 201);
  });
  app.patch('/api/tasks/:id', updateTaskRequest, (context) => {
    return context.json(service.updateTask(id(context.req.param('id')), context.req.valid('json')));
  });

  app.post('/api/participants', participantRequest, (context) => {
    return context.json(service.createParticipant(context.req.valid('json')), 201);
  });
  app.patch('/api/participants/:id', participantRequest, (context) => {
    return context.json(
      service.renameParticipant(id(context.req.param('id')), context.req.valid('json')),
    );
  });
  app.delete('/api/participants/:id', participantRemovalRequest, (context) => {
    return context.json(service.removeParticipant(id(context.req.param('id'))));
  });

  app.post('/api/tasks/:id/members', addMemberRequest, (context) => {
    return context.json(
      service.addMember(id(context.req.param('id')), context.req.valid('json')),
      201,
    );
  });
  app.patch('/api/tasks/:id/members/:memberId', memberStatusRequest, (context) => {
    return context.json(
      service.setMemberActive(
        id(context.req.param('id')),
        id(context.req.param('memberId')),
        context.req.valid('json'),
      ),
    );
  });
  app.post('/api/tasks/:id/members/:memberId/corrections', correctionRequest, (context) => {
    return context.json(
      service.correctCount(
        id(context.req.param('id')),
        id(context.req.param('memberId')),
        context.req.valid('json'),
      ),
    );
  });

  app.post('/api/tasks/:id/draws', drawRequest, (context) => {
    return context.json(service.draw(id(context.req.param('id')), context.req.valid('json')), 201);
  });
  app.post('/api/tasks/:id/draws/:drawId/undo', undoRequest, (context) => {
    return context.json(
      service.undo(
        id(context.req.param('id')),
        context.req.param('drawId'),
        context.req.valid('json'),
      ),
    );
  });

  app.all('/api/*', (context) =>
    context.json(
      {
        error: { code: 'NOT_FOUND', message: 'Dieser Endpunkt wurde nicht gefunden.' },
      },
      404,
    ),
  );

  const index = () => Bun.file('./dist/index.html').text();
  app.get('/', async (context) => context.html(await index()));
  app.get('/tasks/:id', async (context) => context.html(await index()));
  app.get('/team', async (context) => context.html(await index()));
  app.get('/participants', async (context) => context.html(await index()));
  app.get('/assets/*', serveStatic({ root: './dist' }));
  app.get('/favicon.svg', serveStatic({ root: './dist' }));
  app.notFound((context) => context.text('Seite nicht gefunden.', 404));
  return app;
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT muss zwischen 1 und 65535 liegen.');
  }

  const db = openDatabase();
  const app = createApp({ db });
  const server = Bun.serve({
    port,
    hostname: process.env.HOST ?? '0.0.0.0',
    fetch: app.fetch,
  });
  console.log(`Rotator läuft auf http://${server.hostname}:${server.port}`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await server.stop();
    db.close();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
