import { useCallback, useRef, useState, type DragEvent } from 'react';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { Icon } from '@/components/ui/Icons';
import { Spinner } from '@/components/ui/Button';
import type { AttachedFile } from '@/lib/types';

interface FileDropzoneProps {
  files: AttachedFile[];
  onAdd: (files: File[]) => Promise<void> | void;
  onRemove: (id: string) => void;
  label?: string;
  hint?: string;
  accept?: string;
  max?: number;
  uploading?: boolean;
  className?: string;
}

/** Drag-and-drop uploader used for references, deliverables and message attachments. */
export function FileDropzone({
  files,
  onAdd,
  onRemove,
  label = 'Upload files',
  hint = 'PNG, JPG, WEBP, SVG, PDF, AI, PSD or ZIP · drag and drop or browse',
  accept = 'image/*,.pdf,.ai,.psd,.zip',
  max = 10,
  uploading,
  className,
}: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      const room = Math.max(0, max - files.length);
      if (room > 0) void onAdd(Array.from(list).slice(0, room));
    },
    [files.length, max, onAdd],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    handle(event.dataTransfer.files);
  };

  return (
    <div className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-2xl border-2 border-dashed p-6 text-center transition',
          dragging ? 'border-accent bg-accent/6' : 'border-line bg-surface-sunken hover:border-accent/50',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            handle(event.target.files);
            event.target.value = '';
          }}
        />

        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
          {uploading ? <Spinner /> : <Icon.image className="h-5 w-5" />}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || files.length >= max}
          className="mt-3 text-sm font-medium text-accent hover:underline disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : label}
        </button>
        <p className="mt-1 text-xs text-ink-faint">{hint}</p>
        {files.length >= max && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Maximum of {max} files reached.
          </p>
        )}
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-3 py-2.5"
            >
              {file.mimeType?.startsWith('image/') && file.url ? (
                <img src={file.url} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink/6 text-ink-faint dark:bg-white/8">
                  <Icon.file className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                <p className="text-xs text-ink-faint">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                aria-label={`Remove ${file.name}`}
                className="rounded-lg p-1.5 text-ink-faint transition hover:bg-rose-500/10 hover:text-rose-500"
              >
                <Icon.trash className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
