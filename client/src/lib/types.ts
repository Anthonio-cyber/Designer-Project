export type Role = 'client' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  avatarUrl: string | null;
  createdAt: string;
  profile: {
    company: string | null;
    phone: string | null;
    website: string | null;
    location: string | null;
    bio: string | null;
    preferences: Record<string, unknown>;
  };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  projectCount?: number;
}

export interface PortfolioProject {
  id: string;
  title: string;
  slug: string;
  category: { id: string; name: string | null; slug: string | null } | null;
  summary: string | null;
  description: string | null;
  designerNotes: string | null;
  tools: string[];
  thumbnailUrl: string | null;
  mainImageUrl: string | null;
  gallery: string[];
  clientName: string | null;
  projectDate: string | null;
  featured: boolean;
  status: 'draft' | 'published';
  visibility: 'public' | 'private';
  views: number;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
  raw?: { thumbnail: string | null; mainImage: string | null; gallery: string[] };
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceFrom: number | null;
  priceLabel: string | null;
  deliveryTime: string | null;
  icon: string | null;
  position: number;
  active: boolean;
}

export interface AttachedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string | null;
  kind?: string;
  createdAt?: string;
  uploaderName?: string | null;
  projectTitle?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  body: string;
  deleted: boolean;
  projectId: string | null;
  readAt: string | null;
  createdAt: string;
  sender: { id: string; name: string; role: Role; avatarUrl: string | null; online: boolean };
  attachments: AttachedFile[];
}

export interface ConversationSummary {
  id: string;
  subject: string | null;
  lastMessageAt: string | null;
  unread: number;
  lastMessage: Message | null;
  participant: {
    id: string;
    name: string;
    email?: string;
    role: Role;
    status?: string;
    avatarUrl: string | null;
    online: boolean;
  };
}

export interface ProjectSummary {
  id: string;
  code: string;
  clientId: string;
  title: string;
  description: string | null;
  status: string;
  budget: string | null;
  deadline: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  clientName: string;
  clientEmail: string;
  clientAvatarUrl: string | null;
  serviceName: string | null;
}

export interface Delivery {
  id: string;
  version: number;
  title: string;
  note: string | null;
  status: 'pending' | 'approved' | 'revision_requested';
  createdAt: string;
  respondedAt: string | null;
  files: AttachedFile[];
}

export interface Revision {
  id: string;
  deliveryId: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
  clientName: string;
  files: AttachedFile[];
}

export interface ProjectDetail extends ProjectSummary {
  timeline: { id: string; status: string; note: string | null; createdAt: string }[];
  deliveries: Delivery[];
  revisions: Revision[];
  files: AttachedFile[];
}

export interface ProjectRequest {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  projectType: string | null;
  budgetRange: string | null;
  deadline: string | null;
  preferredStyle: string | null;
  brandName: string | null;
  colors: string | null;
  dimensions: string | null;
  targetAudience: string | null;
  description: string;
  styleExampleNote: string | null;
  referenceFiles: AttachedFile[];
  inspirationTitle: string | null;
  inspirationSlug: string | null;
  serviceName: string | null;
  status: 'new' | 'reviewing' | 'converted' | 'declined';
  adminNotes: string | null;
  convertedProjectId: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Feature {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  status: 'enabled' | 'disabled';
  config: Record<string, unknown>;
  version: number;
  isCore: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiPlanStep {
  tool: string;
  input: Record<string, unknown>;
  explanation: string;
}

export interface AiAction {
  id: string;
  prompt: string;
  summary: string;
  reasoning?: string;
  plan: AiPlanStep[];
  risk: 'read' | 'write' | 'dangerous';
  status: 'proposed' | 'approved' | 'applied' | 'rejected' | 'failed' | 'undone';
  result: { message: string }[] | null;
  undoPayload: unknown;
  createdAt: string;
  appliedAt: string | null;
  undoneAt: string | null;
  adminName?: string | null;
  live?: boolean;
  warnings?: string[];
}

export interface PublicSettings {
  brandName: string;
  tagline: string;
  logoText: string;
  logoUrl: string | null;
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
  location: string | null;
  socialLinks: { label: string; url: string }[];
  about: {
    headline: string;
    bio: string;
    photoUrl: string | null;
    philosophy: string;
    skills: string[];
    tools: string[];
    experience: { role: string; org: string; period: string; detail?: string }[];
    achievements: string[];
  };
  stats: { label: string; value: string }[];
  homepageSections: { key: string; label: string; enabled: boolean }[];
  seo: { defaultTitle: string; defaultDescription: string; ogImageUrl: string | null };
  allowRegistration: boolean;
  maxUploadMb: number;
  allowedExtensions: string[];
}

export interface ActivityEntry {
  id: string;
  action: string;
  actorType: string;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  meta: string;
  createdAt: string;
}

export interface SearchHit {
  type: 'portfolio' | 'service' | 'project' | 'client' | 'message' | 'request';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}
