import type { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';

export interface AuthOptions {
  basicUser: string;
  basicPassword: string;
  timeZone: string;
}

function readOptions(overrides: Partial<AuthOptions>): AuthOptions {
  const options = {
    basicUser: process.env.BASIC_AUTH_USER || 'team',
    basicPassword: process.env.BASIC_AUTH_PASSWORD || '',
    timeZone: process.env.APP_TIMEZONE || 'Europe/Berlin',
    ...overrides,
  };

  // Fail on a configuration typo instead of rendering dates in an unintended zone.
  new Intl.DateTimeFormat('de-DE', { timeZone: options.timeZone }).format();
  return options;
}

/** Internal access by default; optional browser-native HTTP Basic authentication. */
export function installAuth(app: Hono, overrides: Partial<AuthOptions> = {}): void {
  const options = readOptions(overrides);

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    }),
  );

  if (options.basicPassword) {
    const authenticate = basicAuth({
      username: options.basicUser,
      password: options.basicPassword,
      realm: 'Rotator',
      invalidUserMessage: {
        error: { code: 'UNAUTHORIZED', message: 'Bitte mit dem Teamzugang anmelden.' },
      },
    });

    app.use('*', (context, next) => {
      if (context.req.path === '/healthz') return next();
      return authenticate(context, next);
    });
  }

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (context) =>
        context.json(
          {
            error: { code: 'BODY_TOO_LARGE', message: 'Die Anfrage ist zu groß.' },
          },
          413,
        ),
    }),
  );

  app.use('/api/*', async (context, next) => {
    context.header('Cache-Control', 'no-store');

    if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
      const fetchSite = context.req.header('Sec-Fetch-Site');
      const origin = context.req.header('Origin');
      let foreignOrigin = fetchSite === 'cross-site' || fetchSite === 'same-site';

      if (origin) {
        try {
          // Comparing hosts also supports HTTPS termination at an existing reverse proxy.
          foreignOrigin ||= new URL(origin).host !== new URL(context.req.url).host;
        } catch {
          foreignOrigin = true;
        }
      }

      if (foreignOrigin) {
        return context.json(
          {
            error: {
              code: 'CROSS_ORIGIN',
              message: 'Schreibende Anfragen von anderen Websites sind nicht erlaubt.',
            },
          },
          403,
        );
      }

      const contentType = context.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase();
      if (contentType !== 'application/json') {
        return context.json(
          {
            error: { code: 'CONTENT_TYPE', message: 'Es werden JSON-Anfragen erwartet.' },
          },
          415,
        );
      }
    }

    await next();
  });

  app.get('/api/config', (context) => context.json({ timeZone: options.timeZone }));
}
