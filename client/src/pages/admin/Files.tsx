import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatBytes, formatDate } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Modal, Skeleton, Tabs } from '@/components/ui/Primitives';
import { StatTile } from '@/components/ui/Charts';
import { Icon } from '@/components/ui/Icons';
import type { AttachedFile } from '@/lib/types';

interface Summary {
  total: { count: number; bytes: number };
  byKind: { kind: string; count: number; bytes: number }[];
}

export default function AdminFiles() {
  const { success, error: toastError } = useToast();
  const [files, setFiles] = useState<AttachedFile[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<AttachedFile | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFiles(null);
    try {
      const data = await api.get<{ files: AttachedFile[] }>('/files', { kind, q: search });
      setFiles(data.files);
    } catch {
      setFiles([]);
    }
  }, [kind, search]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, search]);

  useEffect(() => {
    void api
      .get<Summary>('/files/stats/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/files/${removing.id}`);
      success('File deleted');
      setRemoving(null);
      await load();
    } catch (caught) {
      toastError('Could not delete', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Files" description="Everything uploaded across the platform, by you and by clients." />

      {summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Files stored" value={summary.total.count} icon={<Icon.file className="h-4 w-4" />} />
          <StatTile label="Storage used" value={formatBytes(summary.total.bytes)} icon={<Icon.layers className="h-4 w-4" />} />
          {summary.byKind.slice(0, 2).map((entry) => (
            <StatTile
              key={entry.kind}
              label={entry.kind}
              value={entry.count}
              hint={formatBytes(entry.bytes)}
              icon={<Icon.image className="h-4 w-4" />}
            />
          ))}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={kind}
          onChange={setKind}
          tabs={[
            { value: '', label: 'All' },
            { value: 'portfolio', label: 'Portfolio' },
            { value: 'deliverable', label: 'Deliverables' },
            { value: 'reference', label: 'References' },
            { value: 'attachment', label: 'Attachments' },
          ]}
        />
        <div className="relative flex-1 lg:max-w-sm">
          <Icon.search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by file name…"
            className="pl-10"
          />
        </div>
      </div>

      {files === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<Icon.file className="h-5 w-5" />}
          title={search || kind ? 'No files matched' : 'No files yet.'}
          description={
            search || kind
              ? 'Try clearing the filters.'
              : 'Files uploaded to portfolio projects, client projects and messages collect here.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {files.map((file) => (
            <Card key={file.id} className="group overflow-hidden p-0">
              <a href={file.url ?? '#'} target="_blank" rel="noreferrer noopener" className="block bg-surface-sunken">
                {file.mimeType?.startsWith('image/') && file.url ? (
                  <img src={file.url} alt={file.name} loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center">
                    <Icon.file className="h-8 w-8 text-ink-faint" />
                  </div>
                )}
              </a>
              <div className="p-3.5">
                <p className="truncate text-xs font-medium text-ink">{file.name}</p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  {formatBytes(file.size)} · {formatDate(file.createdAt)}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Badge tone="neutral">{file.kind}</Badge>
                  <button
                    type="button"
                    onClick={() => setRemoving(file)}
                    aria-label={`Delete ${file.name}`}
                    className="rounded-lg p-1 text-ink-faint opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Icon.trash className="h-3.5 w-3.5" />
                  </button>
                </div>
                {file.uploaderName && (
                  <p className="mt-1.5 truncate text-[11px] text-ink-faint">by {file.uploaderName}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Delete this file?"
        description={removing?.name}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          The file is removed from storage. Anything referencing it — a portfolio image, a delivered design — will
          show a broken preview.
        </p>
      </Modal>
    </div>
  );
}
