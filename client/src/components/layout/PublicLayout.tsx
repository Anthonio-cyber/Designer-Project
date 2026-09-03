import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { usePageMeta } from '@/hooks/usePageMeta';
import { MobileBottomNav } from './MobileBottomNav';
import { useAuth } from '@/context/AuthContext';

export function PublicLayout() {
  const location = useLocation();
  const { user } = useAuth();
  usePageMeta();

  // Route changes should start at the top, but never fight an in-page anchor.
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname, location.hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      {user?.role === 'client' && <MobileBottomNav />}
    </div>
  );
}
