import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(serverRoot, '..');

// Load .env from the server folder first, then fall back to the repository root.
for (const candidate of [path.join(serverRoot, '.env'), path.join(repoRoot, '.env')]) {
  if (fs.existsSync(candidate)) dotenv.config({ path: candidate });
}

const bool = (value: string | undefined, fallback = false) =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

function requiredSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length >= 16) return value;
  if (isProd) {
    throw new Error(
      `${name} must be set to a strong random value (>= 16 chars) when NODE_ENV=production.`,
    );
  }
  return devFallback;
}

export const env = {
  nodeEnv,
  isProd,
  isDev: !isProd,
  port: int(process.env.PORT, 4000),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  publicSiteUrl: (process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173').replace(/\/$/, ''),

  accessSecret: requiredSecret('JWT_ACCESS_SECRET', 'dev-only-access-secret-change-me'),
  refreshSecret: requiredSecret('JWT_REFRESH_SECRET', 'dev-only-refresh-secret-change-me'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshTokenTtlDays: int(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cookieSecure: bool(process.env.COOKIE_SECURE, isProd),

  dataDir: path.resolve(serverRoot, process.env.DATA_DIR ?? './data'),
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR ?? './uploads'),
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 25) * 1024 * 1024,

  adminName: process.env.ADMIN_NAME ?? 'Studio Admin',
  adminEmail: (process.env.ADMIN_EMAIL ?? 'admin@designer.studio').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD ?? 'ChangeMe!2024',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  aiModel: process.env.AI_MODEL ?? 'claude-sonnet-5',
  aiMaxTokens: int(process.env.AI_MAX_TOKENS, 2000),
};

fs.mkdirSync(env.dataDir, { recursive: true });
fs.mkdirSync(env.uploadDir, { recursive: true });
