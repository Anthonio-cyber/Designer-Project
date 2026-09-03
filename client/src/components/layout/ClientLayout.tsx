import { DashboardLayout, type NavItem } from './DashboardLayout';

const ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: 'home', end: true },
  { to: '/dashboard/messages', label: 'Messages', icon: 'chat', badge: 'messages' },
  { to: '/dashboard/projects', label: 'My Projects', icon: 'briefcase' },
  { to: '/dashboard/requests', label: 'Project Requests', icon: 'inbox' },
  { to: '/dashboard/files', label: 'Files', icon: 'file' },
  { to: '/dashboard/notifications', label: 'Notifications', icon: 'bell', badge: 'alerts' },
  { to: '/dashboard/profile', label: 'Profile', icon: 'user' },
  { to: '/dashboard/settings', label: 'Settings', icon: 'settings' },
];

export function ClientLayout() {
  return <DashboardLayout items={ITEMS} title="Client studio" homeHref="/dashboard" variant="client" />;
}
