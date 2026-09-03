import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/PageHeader';
import { Button, Spinner } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Card, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { AttachedFile, Category, PortfolioProject } from '@/lib/types';

interface Draft {
  title: string;
  categoryId: string;
  summary: string;
  description: string;
  designerNotes: string;
  tools: string;
  thumbnail: string | null;
  mainImage: string | null;
  gallery: string[];
  clientName: string;
  projectDate: string;
  featured: boolean;
  status: 'draft' | 'published';
  visibility: 'public' | 'private';
  seoTitle: string;
  seoDescription: string;
}

const EMPTY: Draft = {
  title: '',
  categoryId: '',
  summary: '',
  description: '',
  designerNotes: '',
  tools: '',
  thumbnail: null,
  mainImage: null,
  gallery: [],
  clientName: '',
  projectDate: new Date().toISOString().slice(0, 10),
  featured: false,
  status: 'draft',
  visibility: 'public',
  seoTitle: '',
  seoDescription: '',
};

export default function PortfolioEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void api
      .get<{ categories: Category[] }>('/categories')
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    void api
      .get<{ project: PortfolioProject }>(`/portfolio/${id}`)
      .then(({ project }) => {
        setDraft({
          title: project.title,
          categoryId: project.category?.id ?? '',
          summary: project.summary ?? '',
          description: project.description ?? '',
          designerNotes: project.designerNotes ?? '',
          tools: project.tools.join(', '),
          thumbnail: project.raw?.thumbnail ?? null,
          mainImage: project.raw?.mainImage ?? null,
          gallery: project.raw?.gallery ?? [],
          clientName: project.clientName ?? '',
          projectDate: project.projectDate ?? '',
          featured: project.featured,
          status: project.status,
          visibility: project.visibility,
          seoTitle: project.seoTitle ?? '',
          seoDescription: project.seoDescription ?? '',
        });
      })
      .catch(() => toastError('Could not load that design.'))
      .finally(() => setLoading(false));
  }, [id, toastError]);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const save = async (status: 'draft' | 'published') => {
    setSaving(true);
    setErrors({});

    const payload = {
      title: draft.title,
      categoryId: draft.categoryId || null,
      summary: draft.summary || null,
      description: draft.description || null,
      designerNotes: draft.designerNotes || null,
      tools: draft.tools
        .split(',')
        .map((tool) => tool.trim())
        .filter(Boolean),
      thumbnail: draft.thumbnail,
      mainImage: draft.mainImage,
      gallery: draft.gallery,
      clientName: draft.clientName || null,
      projectDate: draft.projectDate || null,
      featured: draft.featured,
      status,
      visibility: draft.visibility,
      seoTitle: draft.seoTitle || null,
      seoDescription: draft.seoDescription || null,
    };

    try {
      if (id) {
        await api.put(`/portfolio/${id}`, payload);
        success(status === 'published' ? 'Design published' : 'Draft saved');
        set('status', status);
      } else {
        const data = await api.post<{ project: PortfolioProject }>('/portfolio', payload);
        success(status === 'published' ? 'Design published' : 'Draft saved');
        navigate(`/admin/portfolio/${data.project.id}`, { replace: true });
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details);
        toastError(caught.message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={id ? 'Edit design' : 'Add design'}
        description="Everything here shapes the public project page and its SEO metadata."
        backTo="/admin/portfolio"
        backLabel="Portfolio"
        actions={
          <>
            <Button variant="outline" loading={saving} onClick={() => void save('draft')}>
              Save draft
            </Button>
            <Button loading={saving} onClick={() => void save('published')}>
              {draft.status === 'published' ? 'Update' : 'Publish'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Details</h2>
            <div className="space-y-4">
              <Field label="Title" required htmlFor="title" error={errors.title}>
                <Input
                  id="title"
                  value={draft.title}
                  onChange={(event) => set('title', event.target.value)}
                  maxLength={140}
                  placeholder="Kola Coffee Roasters"
                  invalid={!!errors.title}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" htmlFor="category">
                  <Select
                    id="category"
                    value={draft.categoryId}
                    onChange={(event) => set('categoryId', event.target.value)}
                  >
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Project date" htmlFor="projectDate">
                  <Input
                    id="projectDate"
                    type="date"
                    value={draft.projectDate}
                    onChange={(event) => set('projectDate', event.target.value)}
                  />
                </Field>
              </div>

              <Field label="Summary" htmlFor="summary" hint="One line shown on portfolio cards and in search results.">
                <Textarea
                  id="summary"
                  rows={2}
                  maxLength={300}
                  value={draft.summary}
                  onChange={(event) => set('summary', event.target.value)}
                />
              </Field>

              <Field label="Description" htmlFor="description" hint="Blank lines separate paragraphs.">
                <Textarea
                  id="description"
                  rows={9}
                  maxLength={8000}
                  value={draft.description}
                  onChange={(event) => set('description', event.target.value)}
                />
              </Field>

              <Field label="Designer notes" htmlFor="notes" hint="Process notes shown in a highlighted block.">
                <Textarea
                  id="notes"
                  rows={3}
                  maxLength={4000}
                  value={draft.designerNotes}
                  onChange={(event) => set('designerNotes', event.target.value)}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tools used" htmlFor="tools" hint="Comma separated.">
                  <Input
                    id="tools"
                    value={draft.tools}
                    onChange={(event) => set('tools', event.target.value)}
                    placeholder="Illustrator, InDesign, Figma"
                  />
                </Field>
                <Field label="Client name" htmlFor="clientName" hint="Optional — leave blank for NDA work.">
                  <Input
                    id="clientName"
                    value={draft.clientName}
                    onChange={(event) => set('clientName', event.target.value)}
                    maxLength={120}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 font-display text-base font-semibold text-ink">SEO</h2>
            <p className="mb-4 text-sm text-ink-muted">
              Leave blank to fall back to the title and summary.
            </p>
            <div className="space-y-4">
              <Field
                label="SEO title"
                htmlFor="seoTitle"
                hint={`${draft.seoTitle.length}/60 characters used`}
              >
                <Input
                  id="seoTitle"
                  value={draft.seoTitle}
                  onChange={(event) => set('seoTitle', event.target.value)}
                  maxLength={160}
                />
              </Field>
              <Field
                label="Meta description"
                htmlFor="seoDescription"
                hint={`${draft.seoDescription.length}/155 characters used`}
              >
                <Textarea
                  id="seoDescription"
                  rows={2}
                  maxLength={300}
                  value={draft.seoDescription}
                  onChange={(event) => set('seoDescription', event.target.value)}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Visibility</h2>
            <div className="space-y-4">
              <Field label="Status" htmlFor="status">
                <Select
                  id="status"
                  value={draft.status}
                  onChange={(event) => set('status', event.target.value as Draft['status'])}
                >
                  <option value="draft">Draft — only you can see it</option>
                  <option value="published">Published</option>
                </Select>
              </Field>
              <Field label="Visibility" htmlFor="visibility">
                <Select
                  id="visibility"
                  value={draft.visibility}
                  onChange={(event) => set('visibility', event.target.value as Draft['visibility'])}
                >
                  <option value="public">Public</option>
                  <option value="private">Private — hidden from the site</option>
                </Select>
              </Field>
              <Checkbox
                label="Featured project"
                description="Featured work is pinned to the top of the portfolio and shown on the homepage."
                checked={draft.featured}
                onChange={(event) => set('featured', event.target.checked)}
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Artwork</h2>
            <div className="space-y-5">
              <ImageSlot
                label="Thumbnail"
                hint="Shown on portfolio cards. 4:3 works best."
                value={draft.thumbnail}
                onChange={(value) => set('thumbnail', value)}
              />
              <ImageSlot
                label="Main image"
                hint="The large hero image on the project page."
                value={draft.mainImage}
                onChange={(value) => set('mainImage', value)}
              />
              <GallerySlot value={draft.gallery} onChange={(value) => set('gallery', value)} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Resolves a stored reference (file id or URL) into something an <img> can use. */
const resolve = (value: string | null): string | null => {
  if (!value) return null;
  return /^https?:\/\//i.test(value) || value.startsWith('/') ? value : `/api/files/${value}/raw`;
};

function useUploader() {
  const { error: toastError } = useToast();
  const [uploading, setUploading] = useState(false);

  const upload = async (files: File[]): Promise<string[]> => {
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of files) form.append('files', file);
      form.append('kind', 'portfolio');
      form.append('visibility', 'public');
      const data = await api.upload<{ files: AttachedFile[] }>('/files', form);
      return data.files.map((file) => file.id);
    } catch (caught) {
      toastError('Upload failed', caught instanceof ApiError ? caught.message : undefined);
      return [];
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}

function ImageSlot({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { upload, uploading } = useUploader();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = resolve(value);

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    const [id] = await upload([files[0]]);
    if (id) onChange(id);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-ink-faint transition hover:text-rose-500"
          >
            Remove
          </button>
        )}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handle(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition',
          dragging ? 'border-accent bg-accent/6' : 'border-line hover:border-accent/50',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            void handle(event.target.files);
            event.target.value = '';
          }}
        />
        {preview ? (
          <img src={preview} alt={label} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 text-ink-faint">
            {uploading ? <Spinner className="h-5 w-5" /> : <Icon.image className="h-6 w-6" />}
            <span className="px-4 text-center text-xs">{uploading ? 'Uploading…' : 'Drop an image or click to browse'}</span>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
    </div>
  );
}

function GallerySlot({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const { upload, uploading } = useUploader();
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    const ids = await upload(Array.from(files).slice(0, 10));
    if (ids.length) onChange([...value, ...ids]);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">Additional images & mockups</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs font-medium text-accent hover:underline"
        >
          {uploading ? 'Uploading…' : 'Add images'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          void handle(event.target.files);
          event.target.value = '';
        }}
      />

      {value.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-8 text-xs text-ink-faint transition hover:border-accent/50"
        >
          <Icon.plus className="h-4 w-4" />
          Add gallery images
        </button>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {value.map((entry, index) => (
            <li key={entry} className="group relative overflow-hidden rounded-lg border border-line">
              <img src={resolve(entry) ?? ''} alt="" className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, position) => position !== index))}
                aria-label="Remove image"
                className="absolute right-1 top-1 rounded-lg bg-neutral-950/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
              >
                <Icon.x className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
