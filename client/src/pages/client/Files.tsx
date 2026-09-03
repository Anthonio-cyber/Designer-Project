import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/Field';
import { EmptyState, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { AttachedFile } from '@/lib/types';

export default function Files() {
  const [files, setFiles] = useState<AttachedFile[] | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void api
      .get<{ files: AttachedFile[] }>('/files')
      .then((data) => setFiles(data.files))
      .catch(() => setFiles([]));
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return files ?? [];
    return (files ?? []).filter((file) => file.name.toLowerCase().includes(term));
  }, [files, search]);

  return (
    <div>
      <PageHeader
        title="Files"
        description="Every file you have shared with the studio, and every deliverable sent to you."
      />

      <div className="mb-5 max-w-sm">
        <div className="relative">
          <Icon.search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search files…"
            aria-label="Search files"
            className="pl-10"
          />
        </div>
      </div>

      {files === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Icon.file className="h-5 w-5" />}
          title={search ? 'No files matched' : 'No files yet.'}
          description={
            search
              ? 'Try a different search term.'
              : 'Files you upload to a project, or receive from the studio, collect here.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((file) => (
            <a
              key={file.id}
              href={file.url ?? '#'}
              target="_blank"
              rel="noreferrer noopener"
              className="card group overflow-hidden p-0 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift"
            >
              {file.mimeType?.startsWith('image/') && file.url ? (
                <img src={file.url} alt={file.name} loading="lazy" className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-surface-sunken">
                  <Icon.file className="h-8 w-8 text-ink-faint" />
                </div>
              )}
              <div className="p-4">
                <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {formatBytes(file.size)} · {formatDate(file.createdAt)}
                </p>
                {file.projectTitle && (
                  <p className="mt-1 truncate text-xs text-accent">{file.projectTitle}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
