import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { PublicSettings } from '@/lib/types';

interface SettingsValue {
  settings: PublicSettings | null;
  features: Set<string>;
  loading: boolean;
  reload: () => Promise<void>;
  hasFeature: (key: string) => boolean;
  sectionEnabled: (key: string) => boolean;
}

const SettingsContext = createContext<SettingsValue | null>(null);

/** Turns "#6d5efc" into the "109 94 252" form Tailwind's colour tokens expect. */
function toRgbChannels(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [settingsResponse, featuresResponse] = await Promise.all([
        api.get<{ settings: PublicSettings }>('/settings/public'),
        api.get<{ features: { key: string }[] }>('/features/public'),
      ]);
      setSettings(settingsResponse.settings);
      setFeatures(new Set(featuresResponse.features.map((feature) => feature.key)));
    } catch {
      // The site still renders with built-in defaults if settings cannot load.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Brand colour and fonts are applied as CSS variables, so a settings change
  // restyles the whole site without a rebuild.
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const light = toRgbChannels(settings.accentColor);
    const dark = toRgbChannels(settings.accentColorDark);

    const apply = () => {
      const isDark = root.classList.contains('dark');
      const channels = isDark ? (dark ?? light) : light;
      if (channels) root.style.setProperty('--accent', channels);
    };

    apply();
    root.style.setProperty('--font-heading', `'${settings.fontHeading}'`);
    root.style.setProperty('--font-body', `'${settings.fontBody}'`);

    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [settings]);

  const value = useMemo<SettingsValue>(
    () => ({
      settings,
      features,
      loading,
      reload,
      hasFeature: (key: string) => features.has(key),
      sectionEnabled: (key: string) =>
        settings?.homepageSections.find((section) => section.key === key)?.enabled ?? true,
    }),
    [settings, features, loading, reload],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
