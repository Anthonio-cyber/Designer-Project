import { DashboardLayout, type NavItem } from './DashboardLayout';

const ITEMS: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: 'home', end: true },
  { to: '/admin/portfolio', label: 'Portfolio', icon: 'grid' },
  { to: '/admin/projects', label: 'Projects', icon: 'briefcase' },
  { to: '/admin/clients', label: 'Clients', icon: 'users' },
  { to: '/admin/messages', label: 'Messages', icon: 'chat', badge: 'messages' },
  { to: '/admin/requests', label: 'Requests', icon: 'inbox' },
  { to: '/admin/invoices', label: 'Invoices', icon: 'card' },
  { to: '/admin/files', label: 'Files', icon: 'file' },
  { to: '/admin/services', label: 'Services', icon: 'tag' },
  { to: '/admin/categories', label: 'Categories', icon: 'layers' },
  { to: '/admin/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/admin/ai', label: "Designer's AI", icon: 'sparkles' },
  { to: '/admin/features', label: 'Feature Manager', icon: 'toggle' },
  { to: '/admin/connectors', label: 'Connectors', icon: 'plug' },
  { to: '/admin/activity', label: 'Activity log', icon: 'shield' },
  { to: '/admin/settings', label: 'Website Settings', icon: 'settings' },
];

export function AdminLayout() {
  return <DashboardLayout items={ITEMS} title="Studio admin" homeHref="/admin" variant="admin" />;
}
