import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { installAuth, type AuthOptions } from '../src/auth';

function setup(options: Partial<AuthOptions> = {}) {
  const app = new Hono();
  installAuth(app, {
    basicUser: 'team',
    basicPassword: '',
    timeZone: 'Europe/Berlin',
    ...options,
  });
  app.get('/', (context) => context.text('REIHUM'));
  app.get('/healthz', (context) => context.json({ status: 'ok' }));
  app.get('/api/state', (context) => context.json({ ok: true }));
  app.post('/api/tasks', async (context) => context.json(await context.req.json()));
  return app;
}

function authorization(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function post(app: Hono, extraHeaders: Record<string, string> = {}) {
  return app.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ name: 'Daily' }),
  });
}

describe('Einfacher interner Zugriff', () => {
  test('Default braucht weder Anmeldung noch Cookie oder CSRF-Token', async () => {
    const app = setup();
    expect((await app.request('/')).status).toBe(200);
    expect((await app.request('/api/state')).status).toBe(200);
    const response = await post(app);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toEqual({ name: 'Daily' });
  });

  test('Config enthält nur öffentliche Anwendungseinstellungen', async () => {
    const response = await setup({ basicPassword: 'intern' }).request('/api/config', {
      headers: { Authorization: authorization('team', 'intern') },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ timeZone: 'Europe/Berlin' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  test('Optionales Basic Auth schützt HTML und API mit dem Browserstandard', async () => {
    const app = setup({ basicPassword: 'intern' });
    for (const path of ['/', '/api/state', '/api/config']) {
      const response = await app.request(path);
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Basic realm="Rotator"');
    }
    const invalid = await app.request('/api/state', {
      headers: { Authorization: authorization('team', 'falsch') },
    });
    expect(invalid.status).toBe(401);
    const accepted = await app.request('/api/state', {
      headers: { Authorization: authorization('team', 'intern') },
    });
    expect(accepted.status).toBe(200);
  });

  test('Basic-Benutzer ist konfigurierbar und Healthcheck bleibt öffentlich', async () => {
    const app = setup({ basicUser: 'runde', basicPassword: 'intern' });
    expect((await app.request('/healthz')).status).toBe(200);
    expect(
      (
        await app.request('/api/state', {
          headers: { Authorization: authorization('runde', 'intern') },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request('/api/state', {
          headers: { Authorization: authorization('team', 'intern') },
        })
      ).status,
    ).toBe(401);
  });

  test('JSON ist für Schreibzugriffe erforderlich', async () => {
    const app = setup();
    expect((await post(app, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post(app, { 'Content-Type': 'application/json-malformed' })).status).toBe(415);
    expect((await post(app, { 'Content-Type': 'application/json; charset=utf-8' })).status).toBe(
      200,
    );
  });

  test('Origin und Fetch Metadata weisen schreibende Cross-Origin-Anfragen ab', async () => {
    const app = setup();
    expect(
      (await post(app, { Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin' })).status,
    ).toBe(200);
    expect((await post(app, { Origin: 'https://fremd.example' })).status).toBe(403);
    expect((await post(app, { Origin: 'null' })).status).toBe(403);
    expect((await post(app, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post(app, { 'Sec-Fetch-Site': 'same-site' })).status).toBe(403);
  });

  test('Hono-Middleware begrenzt Bodies und setzt Standard-Sicherheitsheader', async () => {
    const app = setup();
    const large = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'a'.repeat(20_000) }),
    });
    expect(large.status).toBe(413);
    expect(await large.json()).toMatchObject({ error: { code: 'BODY_TOO_LARGE' } });
    const response = await app.request('/');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
