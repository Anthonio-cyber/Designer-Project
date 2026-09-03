import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './components/layout/PublicLayout';
import { ClientLayout } from './components/layout/ClientLayout';
import { AdminLayout } from './components/layout/AdminLayout';
import { RedirectIfAuthed, RequireAdmin, RequireClient } from './components/RouteGuards';
import { Spinner } from './components/ui/Button';

// Public pages load eagerly (they are the first paint); everything behind a
// login is split out so a visitor never downloads the dashboards.
import Home from './pages/public/Home';
import Portfolio from './pages/public/Portfolio';
import ProjectDetail from './pages/public/ProjectDetail';
import Services from './pages/public/Services';
import About from './pages/public/About';
import Contact from './pages/public/Contact';
import RequestProject from './pages/public/RequestProject';
import NotFound from './pages/public/NotFound';

const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));

const ClientOverview = lazy(() => import('./pages/client/Overview'));
const ClientMessages = lazy(() => import('./pages/client/Messages'));
const ClientProjects = lazy(() => import('./pages/client/Projects'));
const ClientProjectDetail = lazy(() => import('./pages/client/ProjectDetail'));
const ClientRequests = lazy(() => import('./pages/client/Requests'));
const ClientFiles = lazy(() => import('./pages/client/Files'));
const ClientNotifications = lazy(() => import('./pages/client/Notifications'));
const ClientProfile = lazy(() => import('./pages/client/Profile'));
const ClientSettings = lazy(() => import('./pages/client/Settings'));

const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminPortfolio = lazy(() => import('./pages/admin/Portfolio'));
const AdminPortfolioEditor = lazy(() => import('./pages/admin/PortfolioEditor'));
const AdminProjects = lazy(() => import('./pages/admin/Projects'));
const AdminProjectDetail = lazy(() => import('./pages/admin/ProjectDetail'));
const AdminClients = lazy(() => import('./pages/admin/Clients'));
const AdminClientDetail = lazy(() => import('./pages/admin/ClientDetail'));
const AdminMessages = lazy(() => import('./pages/admin/Messages'));
const AdminRequests = lazy(() => import('./pages/admin/Requests'));
const AdminRequestDetail = lazy(() => import('./pages/admin/RequestDetail'));
const AdminFiles = lazy(() => import('./pages/admin/Files'));
const AdminServices = lazy(() => import('./pages/admin/Services'));
const AdminCategories = lazy(() => import('./pages/admin/Categories'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));
const AdminAi = lazy(() => import('./pages/admin/AiAssistant'));
const AdminFeatures = lazy(() => import('./pages/admin/FeatureManager'));
const AdminActivity = lazy(() => import('./pages/admin/ActivityLog'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-6 w-6 text-accent" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="portfolio/:slug" element={<ProjectDetail />} />
          <Route path="services" element={<Services />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="request" element={<RequestProject />} />

          <Route path="login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
          <Route path="register" element={<RedirectIfAuthed><Register /></RedirectIfAuthed>} />
          <Route path="forgot-password" element={<RedirectIfAuthed><ForgotPassword /></RedirectIfAuthed>} />
          <Route path="reset-password" element={<RedirectIfAuthed><ResetPassword /></RedirectIfAuthed>} />

          <Route path="*" element={<NotFound />} />
        </Route>

        <Route
          path="/dashboard"
          element={
            <RequireClient>
              <ClientLayout />
            </RequireClient>
          }
        >
          <Route index element={<ClientOverview />} />
          <Route path="messages" element={<ClientMessages />} />
          <Route path="projects" element={<ClientProjects />} />
          <Route path="projects/:id" element={<ClientProjectDetail />} />
          <Route path="requests" element={<ClientRequests />} />
          <Route path="files" element={<ClientFiles />} />
          <Route path="notifications" element={<ClientNotifications />} />
          <Route path="profile" element={<ClientProfile />} />
          <Route path="settings" element={<ClientSettings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="portfolio" element={<AdminPortfolio />} />
          <Route path="portfolio/new" element={<AdminPortfolioEditor />} />
          <Route path="portfolio/:id" element={<AdminPortfolioEditor />} />
          <Route path="projects" element={<AdminProjects />} />
          <Route path="projects/:id" element={<AdminProjectDetail />} />
          <Route path="clients" element={<AdminClients />} />
          <Route path="clients/:id" element={<AdminClientDetail />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="requests" element={<AdminRequests />} />
          <Route path="requests/:id" element={<AdminRequestDetail />} />
          <Route path="files" element={<AdminFiles />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="ai" element={<AdminAi />} />
          <Route path="features" element={<AdminFeatures />} />
          <Route path="activity" element={<AdminActivity />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
