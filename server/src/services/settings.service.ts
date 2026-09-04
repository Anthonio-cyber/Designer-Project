import { db, json } from '../db/index.js';

export interface SiteSettings {
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
  email: EmailSettings;
  payments: PaymentSettings;
}

export interface EmailSettings {
  enabled: boolean;
  /** Which transport to try first. Falls back to the other if it is unconfigured. */
  provider: 'auto' | 'resend' | 'smtp';
  fromName: string;
  fromEmail: string;
  replyTo: string;
  /** Per-event switches. Password reset ignores these — it is always delivered. */
  notify: {
    welcome: boolean;
    newRequest: boolean;
    newMessage: boolean;
    projectStatus: boolean;
    delivery: boolean;
    revision: boolean;
    invoice: boolean;
  };
}

export interface BankDetails {
  accountName: string;
  accountNumber: string;
  bankName: string;
  /** Sort code / routing number / IFSC — labelled per region by the admin. */
  routingNumber: string;
  iban: string;
  swift: string;
  instructions: string;
}

export interface PaymentSettings {
  enabled: boolean;
  currency: string;
  /** Minor units per major unit: 100 for USD/NGN/GBP, 1 for JPY. */
  currencyMinorUnits: number;
  stripeEnabled: boolean;
  paystackEnabled: boolean;
  bankTransferEnabled: boolean;
  bank: BankDetails;
  depositPercent: number;
  paymentTerms: string;
  invoiceFooter: string;
  invoicePrefix: string;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  brandName: 'Amara Okoye',
  tagline: 'Graphic Designer & Brand Identity Specialist',
  logoText: 'AMARA',
  logoFileId: null,
  heroTitle: 'Creative design that makes your brand stand out.',
  heroSubtitle:
    'I design brand identities, campaign artwork and digital experiences that people remember — with a process that keeps you in the loop from first sketch to final file.',
  heroPrimaryCta: 'View My Work',
  heroSecondaryCta: 'Start a Project',
  accentColor: '#6d5efc',
  accentColorDark: '#a99bff',
  fontHeading: 'Sora',
  fontBody: 'Inter',
  contactEmail: 'hello@amara.studio',
  contactPhone: '+234 000 000 0000',
  location: 'Lagos, Nigeria — working worldwide',
  showLocation: true,
  socialLinks: [
    { label: 'Instagram', url: 'https://instagram.com/' },
    { label: 'Behance', url: 'https://behance.net/' },
    { label: 'Dribbble', url: 'https://dribbble.com/' },
    { label: 'LinkedIn', url: 'https://linkedin.com/' },
  ],
  about: {
    headline: 'I turn ideas into brands people trust.',
    bio: 'I am a multidisciplinary graphic designer with a decade of work across identity, print and digital. I care about clarity: the right mark, the right type, the right restraint. Every project starts with a conversation about what your audience needs to feel and ends with a file set you can actually use.',
    photoFileId: null,
    philosophy:
      'Design is not decoration. It is the shortest distance between what you do and why someone should care.',
    skills: [
      'Brand Identity',
      'Logo Design',
      'Typography',
      'Art Direction',
      'Print Production',
      'Packaging',
      'Social Campaigns',
      'UI/UX Design',
    ],
    tools: ['Illustrator', 'Photoshop', 'InDesign', 'Figma', 'After Effects', 'Blender'],
    experience: [
      { role: 'Independent Designer', org: 'Amara Studio', period: '2020 — Present', detail: 'Brand systems for founders and growing teams.' },
      { role: 'Senior Designer', org: 'Northlight Agency', period: '2017 — 2020', detail: 'Campaign art direction for retail and fintech.' },
      { role: 'Junior Designer', org: 'Studio Kobo', period: '2015 — 2017', detail: 'Print, packaging and editorial layout.' },
    ],
    achievements: [
      'Featured in Brand New — Reviewed identity work',
      'Two-time African Design Awards finalist',
      'Speaker, Creative Lagos 2023',
    ],
  },
  stats: [
    { label: 'Projects delivered', value: '120+' },
    { label: 'Happy clients', value: '60+' },
    { label: 'Years experience', value: '9+' },
    { label: 'Design categories', value: '20+' },
  ],
  homepageSections: [
    { key: 'hero', label: 'Hero', enabled: true },
    { key: 'stats', label: 'Statistics strip', enabled: true },
    { key: 'featured', label: 'Featured work', enabled: true },
    { key: 'services', label: 'Services preview', enabled: true },
    { key: 'process', label: 'How we work', enabled: true },
    { key: 'testimonials', label: 'Testimonials', enabled: false },
    { key: 'cta', label: 'Closing call to action', enabled: true },
  ],
  seo: {
    defaultTitle: 'Amara Okoye — Graphic Designer & Brand Identity',
    defaultDescription:
      'Portfolio and client studio of Amara Okoye. Logos, brand identity, posters, social campaigns and UI design.',
    ogImageFileId: null,
  },
  aiSettings: { enabled: true, requireApproval: true, tone: 'Warm, confident, plain-spoken' },
  fileSettings: {
    maxUploadMb: 25,
    allowedExtensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'ai', 'psd', 'zip'],
  },
  clientSettings: { allowRegistration: true, autoCreateConversation: true },
  notificationSettings: { emailDigest: false, inApp: true },
  email: {
    enabled: true,
    provider: 'auto',
    fromName: 'Amara Okoye',
    fromEmail: 'hello@amara.studio',
    replyTo: '',
    notify: {
      welcome: true,
      newRequest: true,
      newMessage: true,
      projectStatus: true,
      delivery: true,
      revision: true,
      invoice: true,
    },
  },
  payments: {
    enabled: true,
    currency: 'USD',
    currencyMinorUnits: 100,
    stripeEnabled: true,
    paystackEnabled: false,
    bankTransferEnabled: true,
    bank: {
      accountName: '',
      accountNumber: '',
      bankName: '',
      routingNumber: '',
      iban: '',
      swift: '',
      instructions: 'Please use the invoice number as the payment reference.',
    },
    depositPercent: 50,
    paymentTerms: '50% to start, 50% on delivery of final files.',
    invoiceFooter: 'Thank you for working with the studio.',
    invoicePrefix: 'INV',
  },
};

const SETTINGS_KEY = 'site';

const readStmt = db.prepare(`SELECT value FROM settings WHERE key = ?`);
const writeStmt = db.prepare(
  `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
);

/** Deep-merges stored overrides onto the defaults so new keys appear automatically. */
function merge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (Array.isArray(base)) return (Array.isArray(override) ? override : base) as T;
  if (typeof base === 'object' && typeof override === 'object') {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      out[key] = key in out ? merge((base as Record<string, unknown>)[key], value) : value;
    }
    return out as T;
  }
  return override as T;
}

export function getSettings(): SiteSettings {
  const row = readStmt.get(SETTINGS_KEY) as { value: string } | undefined;
  return merge(DEFAULT_SETTINGS, json<Partial<SiteSettings>>(row?.value, {}));
}

export function saveSettings(patch: Partial<SiteSettings>): SiteSettings {
  const next = merge(getSettings(), patch);
  writeStmt.run(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/** Only the fields a visitor is allowed to see. */
export function getPublicSettings() {
  const s = getSettings();
  return {
    brandName: s.brandName,
    tagline: s.tagline,
    logoText: s.logoText,
    logoFileId: s.logoFileId,
    heroTitle: s.heroTitle,
    heroSubtitle: s.heroSubtitle,
    heroPrimaryCta: s.heroPrimaryCta,
    heroSecondaryCta: s.heroSecondaryCta,
    accentColor: s.accentColor,
    accentColorDark: s.accentColorDark,
    fontHeading: s.fontHeading,
    fontBody: s.fontBody,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    location: s.showLocation ? s.location : null,
    socialLinks: s.socialLinks,
    about: s.about,
    stats: s.stats,
    homepageSections: s.homepageSections,
    seo: s.seo,
    allowRegistration: s.clientSettings.allowRegistration,
    maxUploadMb: s.fileSettings.maxUploadMb,
    allowedExtensions: s.fileSettings.allowedExtensions,
    // Public visitors see the currency and terms so prices read correctly, but
    // never the studio's bank account — those reach signed-in clients only, on
    // an invoice addressed to them.
    currency: s.payments.currency,
    currencyMinorUnits: s.payments.currencyMinorUnits,
    paymentTerms: s.payments.paymentTerms,
  };
}
