import { randomUUID, randomBytes } from 'node:crypto';

export const uuid = (): string => randomUUID();

export const token = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Human-friendly project reference, e.g. PRJ-7K3QF9. */
export function projectCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (const byte of randomBytes(6)) out += alphabet[byte % alphabet.length];
  return `PRJ-${out}`;
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'item';
}
