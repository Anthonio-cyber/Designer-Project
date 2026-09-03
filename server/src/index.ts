import http from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { migrate } from './db/index.js';
import { initRealtime } from './realtime/index.js';
import { ensureBootstrapData } from './db/bootstrap.js';

migrate();
ensureBootstrapData();

const app = createApp();
const server = http.createServer(app);
initRealtime(server);

server.listen(env.port, () => {
  console.log(`\n  Designer platform API`);
  console.log(`  ---------------------`);
  console.log(`  env      ${env.nodeEnv}`);
  console.log(`  api      http://localhost:${env.port}/api`);
  console.log(`  origins  ${env.clientOrigins.join(', ')}`);
  console.log(`  ai       ${env.anthropicApiKey ? env.aiModel : 'offline (no ANTHROPIC_API_KEY)'}\n`);
});

const shutdown = (signal: string) => {
  console.log(`\n${signal} received, shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
