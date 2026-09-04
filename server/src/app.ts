import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { rateLimit } from './lib/rateLimit.js';
import { authRouter } from './routes/auth.routes.js';
import { categoriesRouter, portfolioRouter } from './routes/portfolio.routes.js';
import { servicesRouter } from './routes/services.routes.js';
import { requestsRouter } from './routes/requests.routes.js';
import { projectsRouter } from './routes/projects.routes.js';
import { messagesRouter } from './routes/messages.routes.js';
import { filesRouter } from './routes/files.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { featuresRouter } from './routes/features.routes.js';
import { aiRouter } from './routes/ai.routes.js';
import { profileRouter, settingsRouter } from './routes/settings.routes.js';
import { searchRouter } from './routes/search.routes.js';
import { seoRouter } from './routes/seo.routes.js';
import { invoicesRouter } from './routes/invoices.routes.js';
import { paymentsRouter } from './routes/payments.routes.js';
import { connectorsRouter } from './routes/connectors.routes.js';

export function createApp() {
  const app = express();

  // Behind a proxy/load balancer so req.ip reflects the real client for rate limits.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server calls arrive without an Origin header.
        if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Provider webhooks are mounted before the JSON parser: signature verification
  // needs the exact bytes that were signed, not a re-serialised object.
  app.use('/api/payments', paymentsRouter);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(attachUser);

  // A broad ceiling on top of the per-endpoint limiters.
  app.use('/api', rateLimit({ scope: 'global', windowMs: 60_000, max: 600 }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, env: env.nodeEnv, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/messaging', messagesRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/features', featuresRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/connectors', connectorsRouter);
  app.use('/api/search', searchRouter);
  app.use(seoRouter);

  // In production the API also serves the built single-page client, so the whole
  // platform runs from one process behind one origin.
  const clientDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../client/dist',
  );
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(
      express.static(clientDist, {
        // Hashed asset filenames can be cached hard; index.html never is.
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
          else if (/\.[0-9a-f]{8,}\./.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // Client-side routing: anything that is not an API call falls back to the app.
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
