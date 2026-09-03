import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import type { NotificationItem } from '@/lib/types';

interface NotificationValue {
  notifications: NotificationItem[];
  unread: number;
  unreadMessages: number;
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  setUnreadMessages: (count: number) => void;
}

const NotificationContext = createContext<NotificationValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const reload = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnread(0);
      setUnreadMessages(0);
      return;
    }
    try {
      const data = await api.get<{
        notifications: NotificationItem[];
        unread: number;
        unreadMessages: number;
      }>('/notifications');
      setNotifications(data.notifications);
      setUnread(data.unread);
      setUnreadMessages(data.unreadMessages);
    } catch {
      /* a failed poll is not worth interrupting the user over */
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    const onNotification = (payload: NotificationItem) => {
      setNotifications((current) => [payload, ...current].slice(0, 100));
      setUnread((count) => count + 1);
      toast({ title: payload.title, description: payload.body ?? undefined });
    };
    const onMessage = () => setUnreadMessages((count) => count + 1);

    socket.on('notification:new', onNotification);
    socket.on('message:new', onMessage);
    return () => {
      socket.off('notification:new', onNotification);
      socket.off('message:new', onMessage);
    };
  }, [user, toast]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)),
    );
    setUnread((count) => Math.max(0, count - 1));
    await api.post(`/notifications/${id}/read`).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
    await api.post('/notifications/read-all').catch(() => undefined);
  }, []);

  const remove = useCallback(async (id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
    await api.delete(`/notifications/${id}`).catch(() => undefined);
  }, []);

  const value = useMemo<NotificationValue>(
    () => ({ notifications, unread, unreadMessages, reload, markRead, markAllRead, remove, setUnreadMessages }),
    [notifications, unread, unreadMessages, reload, markRead, markAllRead, remove],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationValue {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider');
  return context;
}
