import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { db, json } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { uuid } from '../lib/ids.js';
import { getSettings } from './settings.service.js';

/**
 * Extension + MIME allow-list. Both must match: a `.png` carrying an executable
 * MIME type, or an `.exe` renamed to `.png`, is rejected.
 */
const MIME_BY_EXTENSION: Record<string, string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  svg: ['image/svg+xml'],
  pdf: ['application/pdf'],
  ai: ['application/pdf', 'application/postscript', 'application/illustrator', 'application/octet-stream'],
  psd: ['image/vnd.adobe.photoshop', 'application/x-photoshop', 'application/octet-stream'],
  zip: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
};

export const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const bucket = path.join(env.uploadDir, new Date().toISOString().slice(0, 7));
    fs.mkdirSync(bucket, { recursive: true });
    cb(null, bucket);
  },
  filename(_req, file, cb) {
    // The client-supplied name is never used on disk.
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${uuid()}${ext}`);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  const allowed = new Set(getSettings().fileSettings.allowedExtensions.map((e) => e.toLowerCase()));
  const ext = path.extname(file.originalname).toLowerCase().slice(1);

  if (!ext || !allowed.has(ext)) {
    cb(badRequest(`".${ext || 'unknown'}" files are not allowed.`));
    return;
  }
  const expected = MIME_BY_EXTENSION[ext];
  if (expected && !expected.includes(file.mimetype)) {
    cb(badRequest(`The contents of ${file.originalname} do not match its extension.`));
    return;
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxUploadBytes, files: 10 },
});

export interface StoredFile {
  id: string;
  uploader_id: string | null;
  original_name: string;
  stored_path: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  visibility: 'public' | 'private';
  project_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

const insertFile = db.prepare(
  `INSERT INTO files (id, uploader_id, original_name, stored_path, mime_type, size_bytes, kind, visibility, project_id, conversation_id)
   VALUES (@id, @uploaderId, @originalName, @storedPath, @mimeType, @sizeBytes, @kind, @visibility, @projectId, @conversationId)`,
);
const selectFile = db.prepare(`SELECT * FROM files WHERE id = ?`);

export interface RecordFileInput {
  file: Express.Multer.File;
  uploaderId?: string | null;
  kind?: StoredFile['kind'];
  visibility?: StoredFile['visibility'];
  projectId?: string | null;
  conversationId?: string | null;
}

export function recordFile(input: RecordFileInput): StoredFile {
  const record = {
    id: uuid(),
    uploaderId: input.uploaderId ?? null,
    originalName: input.file.originalname.slice(0, 200),
    // Store a path relative to the upload root so the folder can be moved.
    storedPath: path.relative(env.uploadDir, input.file.path),
    mimeType: input.file.mimetype,
    sizeBytes: input.file.size,
    kind: input.kind ?? 'attachment',
    visibility: input.visibility ?? 'private',
    projectId: input.projectId ?? null,
    conversationId: input.conversationId ?? null,
  };
  insertFile.run(record);
  return selectFile.get(record.id) as StoredFile;
}

export function getFile(id: string): StoredFile | undefined {
  return selectFile.get(id) as StoredFile | undefined;
}

export function absolutePath(file: StoredFile): string {
  const resolved = path.resolve(env.uploadDir, file.stored_path);
  // Defence in depth: never serve anything outside the upload root.
  if (!resolved.startsWith(path.resolve(env.uploadDir))) throw forbidden('Invalid file path.');
  return resolved;
}

export function deleteFile(id: string): void {
  const file = getFile(id);
  if (!file) return;
  try {
    fs.unlinkSync(absolutePath(file));
  } catch {
    /* the row is removed even when the blob is already gone */
  }
  db.prepare(`DELETE FROM files WHERE id = ?`).run(id);
}

/**
 * Access rules for a stored file:
 *  - public files (portfolio artwork, branding) are readable by anyone;
 *  - admins read everything;
 *  - a client reads files they uploaded, files on their own projects, and files
 *    attached to messages in their own conversation.
 */
export function canReadFile(
  file: StoredFile,
  viewer?: { id: string; role: 'client' | 'admin' },
): boolean {
  if (file.visibility === 'public') return true;
  if (!viewer) return false;
  if (viewer.role === 'admin') return true;
  if (file.uploader_id === viewer.id) return true;

  if (file.project_id) {
    const row = db
      .prepare(`SELECT client_id FROM client_projects WHERE id = ?`)
      .get(file.project_id) as { client_id: string } | undefined;
    if (row?.client_id === viewer.id) return true;
  }

  if (file.conversation_id) {
    const row = db
      .prepare(`SELECT client_id FROM conversations WHERE id = ?`)
      .get(file.conversation_id) as { client_id: string } | undefined;
    if (row?.client_id === viewer.id) return true;
  }

  const attached = db
    .prepare(
      `SELECT c.client_id AS clientId
         FROM message_attachments ma
         JOIN messages m ON m.id = ma.message_id
         JOIN conversations c ON c.id = m.conversation_id
        WHERE ma.file_id = ?`,
    )
    .all(file.id) as { clientId: string }[];
  if (attached.some((row) => row.clientId === viewer.id)) return true;

  const inRequest = db
    .prepare(`SELECT reference_file_ids AS ids, user_id AS userId FROM project_requests WHERE user_id = ?`)
    .all(viewer.id) as { ids: string; userId: string }[];
  if (inRequest.some((row) => json<string[]>(row.ids, []).includes(file.id))) return true;

  return false;
}

export function requireReadableFile(
  id: string,
  viewer?: { id: string; role: 'client' | 'admin' },
): StoredFile {
  const file = getFile(id);
  if (!file) throw notFound('That file no longer exists.');
  if (!canReadFile(file, viewer)) throw forbidden('You do not have access to this file.');
  return file;
}

export function publicUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/api/files/${fileId}/raw` : null;
}
