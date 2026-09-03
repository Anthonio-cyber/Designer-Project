import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { Button, Spinner } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Card, Skeleton, Tabs } from '@/components/ui/Primitives';
import { ThemeSelector } from '@/components/ui/ThemeToggle';
import { Icon } from '@/components/ui/Icons';

type Tab = 'branding' | 'homepage' | 'about' | 'contact' | 'seo' | 'ai' | 'security';

/** The full settings object as stored on the server. */
interface AdminSettings {
  brandName: string;
  tagline: string;
  logoText: string;
  logoFileId: string | null;
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  accentColor: string;
  accentColorDark: string;
  fontHeading: string;
  fontBody: string;
  contactEmail: string;
  contactPhone: string;
  location: string;
  showLocation: boolean;
  socialLinks: { label: string; url: string }[];
  about: {
    headline: string;
    bio: string;
    photoFileId: string | null;
    philosophy: string;
    skills: string[];
    tools: string[];
    experience: { role: string; org: string; period: string; detail?: string }[];
    achievements: string[];
  };
  stats: { label: string; value: string }[];
  homepageSections: { key: string; label: string; enabled: boolean }[];
  seo: { defaultTitle: string; defaultDescription: string; ogImageFileId: string | null };
  aiSettings: { enabled: boolean; requireApproval: boolean; tone: string };
  fileSettings: { maxUploadMb: number; allowedExtensions: string[] };
  clientSettings: { allowRegistration: boolean; autoCreateConversation: boolean };
  notificationSettings: { emailDigest: boolean; inApp: boolean };
}

export default function AdminSettings() {
  const { success, error: toastError } = useToast();
  const { reload } = useSettings();
  const [tab, setTab] = useState<Tab>('branding');
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .get<{ settings: AdminSettings }>('/settings')
      .then((data) => setSettings(data.settings))
      .catch(() => setSettings(null));
  }, []);

  const patch = useCallback(<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.put('/settings', settings);
      await reload();
      success('Settings saved', 'The public site updates immediately.');
    } catch (caught) {
      toastError('Could not save', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Website settings"
        description="Change the site without touching code. Everything here is live the moment you save."
        actions={
          <Button loading={saving} onClick={() => void save()}>
            Save changes
          </Button>
        }
      />

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'branding', label: 'Branding' },
          { value: 'homepage', label: 'Homepage' },
          { value: 'about', label: 'About' },
          { value: 'contact', label: 'Contact' },
          { value: 'seo', label: 'SEO' },
          { value: 'ai', label: 'AI' },
          { value: 'security', label: 'Clients & files' },
        ]}
      />

      {tab === 'branding' && (
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Identity</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand name" htmlFor="brandName">
                <Input
                  id="brandName"
                  value={settings.brandName}
                  onChange={(event) => patch('brandName', event.target.value)}
                  maxLength={80}
                />
              </Field>
              <Field label="Logo initials" htmlFor="logoText" hint="Used when no logo image is uploaded.">
                <Input
                  id="logoText"
                  value={settings.logoText}
                  onChange={(event) => patch('logoText', event.target.value)}
                  maxLength={8}
                />
              </Field>
              <Field label="Tagline" htmlFor="tagline" className="sm:col-span-2">
                <Input
                  id="tagline"
                  value={settings.tagline}
                  onChange={(event) => patch('tagline', event.target.value)}
                  maxLength={140}
                />
              </Field>
            </div>

            <div className="mt-5 max-w-xs">
              <BrandingUpload
                label="Logo image"
                fileId={settings.logoFileId}
                onChange={(fileId) => patch('logoFileId', fileId)}
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Colours & type</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                label="Accent — light mode"
                value={settings.accentColor}
                onChange={(value) => patch('accentColor', value)}
              />
              <ColorField
                label="Accent — dark mode"
                value={settings.accentColorDark}
                onChange={(value) => patch('accentColorDark', value)}
              />
              <Field label="Heading font" htmlFor="fontHeading" hint="Any Google font loaded in index.html.">
                <Select
                  id="fontHeading"
                  value={settings.fontHeading}
                  onChange={(event) => patch('fontHeading', event.target.value)}
                >
                  {['Sora', 'Inter'].map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Body font" htmlFor="fontBody">
                <Select id="fontBody" value={settings.fontBody} onChange={(event) => patch('fontBody', event.target.value)}>
                  {['Inter', 'Sora'].map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Your theme</h2>
            <p className="mt-1 text-sm text-ink-muted">
              This only affects how the admin looks for you — visitors keep their own preference.
            </p>
            <div className="mt-4">
              <ThemeSelector />
            </div>
          </Card>
        </div>
      )}

      {tab === 'homepage' && (
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Hero</h2>
            <div className="space-y-4">
              <Field label="Headline" htmlFor="heroTitle">
                <Textarea
                  id="heroTitle"
                  rows={2}
                  maxLength={200}
                  value={settings.heroTitle}
                  onChange={(event) => patch('heroTitle', event.target.value)}
                />
              </Field>
              <Field label="Subtitle" htmlFor="heroSubtitle">
                <Textarea
                  id="heroSubtitle"
                  rows={3}
                  maxLength={500}
                  value={settings.heroSubtitle}
                  onChange={(event) => patch('heroSubtitle', event.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Primary button" htmlFor="heroPrimaryCta">
                  <Input
                    id="heroPrimaryCta"
                    value={settings.heroPrimaryCta}
                    onChange={(event) => patch('heroPrimaryCta', event.target.value)}
                    maxLength={40}
                  />
                </Field>
                <Field label="Secondary button" htmlFor="heroSecondaryCta">
                  <Input
                    id="heroSecondaryCta"
                    value={settings.heroSecondaryCta}
                    onChange={(event) => patch('heroSecondaryCta', event.target.value)}
                    maxLength={40}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 font-display text-base font-semibold text-ink">Sections</h2>
            <p className="mb-4 text-sm text-ink-muted">Choose what appears on the homepage and in what order.</p>
            <ul className="space-y-2">
              {settings.homepageSections.map((section) => (
                <li
                  key={section.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                >
                  <span className="text-sm text-ink">{section.label}</span>
                  <Checkbox
                    label=""
                    checked={section.enabled}
                    onChange={(event) =>
                      patch(
                        'homepageSections',
                        settings.homepageSections.map((entry) =>
                          entry.key === section.key ? { ...entry, enabled: event.target.checked } : entry,
                        ),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Statistics strip</h2>
            <ListEditor
              items={settings.stats}
              onChange={(items) => patch('stats', items)}
              fields={[
                { key: 'value', label: 'Value', placeholder: '120+' },
                { key: 'label', label: 'Label', placeholder: 'Projects delivered' },
              ]}
              blank={{ value: '', label: '' }}
              addLabel="Add statistic"
            />
          </Card>
        </div>
      )}

      {tab === 'about' && (
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">About page</h2>
            <div className="space-y-4">
              <Field label="Headline" htmlFor="aboutHeadline">
                <Input
                  id="aboutHeadline"
                  value={settings.about.headline}
                  onChange={(event) => patch('about', { ...settings.about, headline: event.target.value })}
                  maxLength={160}
                />
              </Field>
              <Field label="Biography" htmlFor="aboutBio" hint="Blank lines separate paragraphs.">
                <Textarea
                  id="aboutBio"
                  rows={7}
                  value={settings.about.bio}
                  onChange={(event) => patch('about', { ...settings.about, bio: event.target.value })}
                />
              </Field>
              <Field label="Design philosophy" htmlFor="aboutPhilosophy">
                <Textarea
                  id="aboutPhilosophy"
                  rows={3}
                  value={settings.about.philosophy}
                  onChange={(event) => patch('about', { ...settings.about, philosophy: event.target.value })}
                />
              </Field>
            </div>

            <div className="mt-5 max-w-xs">
              <BrandingUpload
                label="Designer photo"
                fileId={settings.about.photoFileId}
                onChange={(fileId) => patch('about', { ...settings.about, photoFileId: fileId })}
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Skills & tools</h2>
            <div className="space-y-4">
              <Field label="Skills" htmlFor="skills" hint="Comma separated.">
                <Textarea
                  id="skills"
                  rows={2}
                  value={settings.about.skills.join(', ')}
                  onChange={(event) =>
                    patch('about', {
                      ...settings.about,
                      skills: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean),
                    })
                  }
                />
              </Field>
              <Field label="Tools & software" htmlFor="tools" hint="Comma separated.">
                <Textarea
                  id="tools"
                  rows={2}
                  value={settings.about.tools.join(', ')}
                  onChange={(event) =>
                    patch('about', {
                      ...settings.about,
                      tools: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean),
                    })
                  }
                />
              </Field>
              <Field label="Achievements" htmlFor="achievements" hint="One per line.">
                <Textarea
                  id="achievements"
                  rows={4}
                  value={settings.about.achievements.join('\n')}
                  onChange={(event) =>
                    patch('about', {
                      ...settings.about,
                      achievements: event.target.value.split('\n').map((entry) => entry.trim()).filter(Boolean),
                    })
                  }
                />
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Experience</h2>
            <ListEditor
              items={settings.about.experience}
              onChange={(items) => patch('about', { ...settings.about, experience: items })}
              fields={[
                { key: 'role', label: 'Role', placeholder: 'Senior Designer' },
                { key: 'org', label: 'Organisation', placeholder: 'Studio name' },
                { key: 'period', label: 'Period', placeholder: '2020 — Present' },
                { key: 'detail', label: 'Detail', placeholder: 'What you did there' },
              ]}
              blank={{ role: '', org: '', period: '', detail: '' }}
              addLabel="Add role"
            />
          </Card>
        </div>
      )}

      {tab === 'contact' && (
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Contact details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="contactEmail">
                <Input
                  id="contactEmail"
                  type="email"
                  value={settings.contactEmail}
                  onChange={(event) => patch('contactEmail', event.target.value)}
                />
              </Field>
              <Field label="Phone" htmlFor="contactPhone">
                <Input
                  id="contactPhone"
                  value={settings.contactPhone}
                  onChange={(event) => patch('contactPhone', event.target.value)}
                />
              </Field>
              <Field label="Location" htmlFor="location" className="sm:col-span-2">
                <Input
                  id="location"
                  value={settings.location}
                  onChange={(event) => patch('location', event.target.value)}
                />
              </Field>
            </div>
            <Checkbox
              className="mt-4"
              label="Show my location publicly"
              description="Turn off to keep your location off the site entirely."
              checked={settings.showLocation}
              onChange={(event) => patch('showLocation', event.target.checked)}
            />
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Social links</h2>
            <ListEditor
              items={settings.socialLinks}
              onChange={(items) => patch('socialLinks', items)}
              fields={[
                { key: 'label', label: 'Label', placeholder: 'Instagram' },
                { key: 'url', label: 'URL', placeholder: 'https://instagram.com/…' },
              ]}
              blank={{ label: '', url: '' }}
              addLabel="Add link"
            />
          </Card>
        </div>
      )}

      {tab === 'seo' && (
        <Card>
          <h2 className="mb-1 font-display text-base font-semibold text-ink">Search & sharing</h2>
          <p className="mb-4 text-sm text-ink-muted">
            Defaults for pages without their own metadata. Portfolio projects override these individually.
          </p>
          <div className="space-y-4">
            <Field label="Default page title" htmlFor="seoTitle" hint={`${settings.seo.defaultTitle.length}/60 characters`}>
              <Input
                id="seoTitle"
                value={settings.seo.defaultTitle}
                onChange={(event) => patch('seo', { ...settings.seo, defaultTitle: event.target.value })}
                maxLength={160}
              />
            </Field>
            <Field
              label="Default meta description"
              htmlFor="seoDescription"
              hint={`${settings.seo.defaultDescription.length}/155 characters`}
            >
              <Textarea
                id="seoDescription"
                rows={3}
                maxLength={300}
                value={settings.seo.defaultDescription}
                onChange={(event) => patch('seo', { ...settings.seo, defaultDescription: event.target.value })}
              />
            </Field>
            <div className="max-w-xs">
              <BrandingUpload
                label="Open Graph image"
                hint="Shown when a link to your site is shared. 1200×630 works best."
                fileId={settings.seo.ogImageFileId}
                onChange={(fileId) => patch('seo', { ...settings.seo, ogImageFileId: fileId })}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5 text-sm">
            <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              View sitemap.xml
            </a>
            <a href="/robots.txt" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              View robots.txt
            </a>
          </div>
        </Card>
      )}

      {tab === 'ai' && (
        <Card>
          <h2 className="mb-4 font-display text-base font-semibold text-ink">AI assistant</h2>
          <div className="space-y-5">
            <Checkbox
              label="Enable Designer’s AI"
              description="When off, every AI endpoint is blocked for everyone, including you."
              checked={settings.aiSettings.enabled}
              onChange={(event) => patch('aiSettings', { ...settings.aiSettings, enabled: event.target.checked })}
            />
            <Checkbox
              label="Require approval before applying changes"
              description="Strongly recommended. Leave this on so nothing changes without your review."
              checked={settings.aiSettings.requireApproval}
              onChange={(event) =>
                patch('aiSettings', { ...settings.aiSettings, requireApproval: event.target.checked })
              }
            />
            <Field label="Writing tone" htmlFor="aiTone" hint="How the assistant writes on your behalf.">
              <Input
                id="aiTone"
                value={settings.aiSettings.tone}
                onChange={(event) => patch('aiSettings', { ...settings.aiSettings, tone: event.target.value })}
                maxLength={120}
              />
            </Field>
          </div>

          <div className="mt-6 rounded-xl bg-surface-sunken p-4 text-sm text-ink-muted">
            <p className="flex items-center gap-2 font-medium text-ink">
              <Icon.shield className="h-4 w-4 text-accent" />
              Where the API key lives
            </p>
            <p className="mt-2">
              The AI provider key is read from the server environment only. It is never sent to the browser, never
              stored in these settings, and the browser never calls the provider directly.
            </p>
          </div>
        </Card>
      )}

      {tab === 'security' && (
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Client accounts</h2>
            <div className="space-y-4">
              <Checkbox
                label="Allow new client registrations"
                description="Turn off to close sign-ups. Existing clients can still sign in."
                checked={settings.clientSettings.allowRegistration}
                onChange={(event) =>
                  patch('clientSettings', { ...settings.clientSettings, allowRegistration: event.target.checked })
                }
              />
              <Checkbox
                label="Open a private conversation automatically"
                description="Every new client gets a thread with you as soon as they register."
                checked={settings.clientSettings.autoCreateConversation}
                onChange={(event) =>
                  patch('clientSettings', {
                    ...settings.clientSettings,
                    autoCreateConversation: event.target.checked,
                  })
                }
              />
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">File uploads</h2>
            <div className="space-y-4">
              <Field label="Maximum file size (MB)" htmlFor="maxUpload">
                <Input
                  id="maxUpload"
                  type="number"
                  min={1}
                  max={200}
                  value={settings.fileSettings.maxUploadMb}
                  onChange={(event) =>
                    patch('fileSettings', {
                      ...settings.fileSettings,
                      maxUploadMb: Number(event.target.value) || 25,
                    })
                  }
                />
              </Field>
              <Field
                label="Allowed file types"
                htmlFor="extensions"
                hint="Comma separated extensions. Uploads are also checked against their real content type."
              >
                <Textarea
                  id="extensions"
                  rows={2}
                  value={settings.fileSettings.allowedExtensions.join(', ')}
                  onChange={(event) =>
                    patch('fileSettings', {
                      ...settings.fileSettings,
                      allowedExtensions: event.target.value
                        .split(',')
                        .map((entry) => entry.trim().replace(/^\./, '').toLowerCase())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Notifications</h2>
            <div className="space-y-4">
              <Checkbox
                label="In-app notifications"
                description="Bell menu and toasts across the dashboards."
                checked={settings.notificationSettings.inApp}
                onChange={(event) =>
                  patch('notificationSettings', {
                    ...settings.notificationSettings,
                    inApp: event.target.checked,
                  })
                }
              />
              <Checkbox
                label="Email digest"
                description="Requires a mail transport to be configured on the server."
                checked={settings.notificationSettings.emailDigest}
                onChange={(event) =>
                  patch('notificationSettings', {
                    ...settings.notificationSettings,
                    emailDigest: event.target.checked,
                  })
                }
              />
            </div>
          </Card>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <Button loading={saving} onClick={() => void save()} size="lg">
          Save all changes
        </Button>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint="Hex value, e.g. #6d5efc">
      <div className="flex gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#6d5efc'}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-line bg-surface-raised p-1"
        />
        <Input value={value} onChange={(event) => onChange(event.target.value)} maxLength={9} />
      </div>
    </Field>
  );
}

function BrandingUpload({
  label,
  hint,
  fileId,
  onChange,
}: {
  label: string;
  hint?: string;
  fileId: string | null;
  onChange: (fileId: string | null) => void;
}) {
  const { error: toastError } = useToast();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const data = await api.upload<{ file: { id: string } }>('/settings/branding', form);
      onChange(data.file.id);
    } catch (caught) {
      toastError('Upload failed', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {fileId && (
          <button type="button" onClick={() => onChange(null)} className="text-xs text-ink-faint hover:text-rose-500">
            Remove
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-line transition hover:border-accent/50"
      >
        {fileId ? (
          <img src={`/api/files/${fileId}/raw`} alt={label} className="h-full w-full object-contain" />
        ) : uploading ? (
          <Spinner className="h-5 w-5 text-accent" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-ink-faint">
            <Icon.image className="h-6 w-6" />
            <span className="text-xs">Upload an image</span>
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

/** Repeatable row editor used for stats, social links and experience entries. */
function ListEditor<T extends Record<string, string | undefined>>({
  items,
  onChange,
  fields,
  blank,
  addLabel,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  fields: { key: keyof T & string; label: string; placeholder?: string }[];
  blank: T;
  addLabel: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="flex items-end gap-2 rounded-xl border border-line p-3">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <Field key={field.key} label={field.label}>
                <Input
                  value={item[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    onChange(
                      items.map((entry, position) =>
                        position === index ? { ...entry, [field.key]: event.target.value } : entry,
                      ),
                    )
                  }
                />
              </Field>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-1 text-rose-500 hover:bg-rose-500/10"
            onClick={() => onChange(items.filter((_, position) => position !== index))}
            aria-label="Remove row"
          >
            <Icon.trash className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={() => onChange([...items, { ...blank }])} icon={<Icon.plus className="h-4 w-4" />}>
        {addLabel}
      </Button>
    </div>
  );
}
