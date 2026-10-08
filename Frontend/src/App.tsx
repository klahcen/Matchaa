import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppHeader } from './components/app/AppHeader';
import { IncomingCallToast } from './components/app/IncomingCallToast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { PublicLayout } from './components/layout/PublicLayout';
import { SiteFooter } from './components/layout/SiteFooter';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { BrowsePage } from './pages/BrowsePage';
import { ChatPage } from './pages/ChatPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { ProfileLikersPage } from './pages/ProfileLikersPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProfileViewersPage } from './pages/ProfileViewersPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ProfileViewPage } from './pages/ProfileViewPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ResearchPage } from './pages/ResearchPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { MapPage } from './pages/MapPage';

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
};

const FullScreenSpinner: React.FC = () => (
  <div
    role="status"
    aria-label="Loading"
    className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-brand-start via-brand-mid to-brand-end"
  >
    <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
  </div>
);

// Protected route wrapper for authenticated views like /browse.
// Layout: fixed AppHeader + <main> (page content, flex-1 so short pages still
// push the footer to the bottom of the viewport) + shared footer.
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-brand-bg">
      <AppHeader />
      <IncomingCallToast />
      <main id="main-content" className="flex-1 w-full flex flex-col pt-[68px]">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
};

// Public-only route wrapper (redirects logged-in users to /browse). Auth pages
// get the shared public layout; the landing page brings its own navbar/footer.
const PublicRoute: React.FC<{ children: React.ReactElement; withLayout?: boolean }> = ({
  children,
  withLayout = true,
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenSpinner />;
  }

  if (user) {
    return <Navigate to="/browse" replace />;
  }

  return withLayout ? <PublicLayout>{children}</PublicLayout> : children;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Root landing page (redirects logged-in users to /browse) */}
      <Route
        path="/"
        element={
          <PublicRoute withLayout={false}>
            <LandingPage />
          </PublicRoute>
        }
      />

      {/* Auth routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      {/* Verification and reset links work whether or not someone is signed in
          (e.g. confirming an email change), so they skip PublicRoute. */}
      <Route path="/verify/:token" element={<PublicLayout><VerifyEmailPage /></PublicLayout>} />
      <Route path="/verify" element={<PublicLayout><VerifyEmailPage /></PublicLayout>} />
      <Route path="/verify-email/:token" element={<PublicLayout><VerifyEmailPage /></PublicLayout>} />
      <Route path="/verify-email" element={<PublicLayout><VerifyEmailPage /></PublicLayout>} />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />
      <Route path="/reset-password/:token" element={<PublicLayout><ResetPasswordPage /></PublicLayout>} />
      <Route path="/reset-password" element={<PublicLayout><ResetPasswordPage /></PublicLayout>} />

      {/* Authenticated browse route — suggestions grid with filters and sorting */}
      <Route
        path="/browse"
        element={
          <ProtectedRoute>
            <BrowsePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/research"
        element={
          <ProtectedRoute>
            <ResearchPage />
          </ProtectedRoute>
        }
      />
      <Route path="/search" element={<Navigate to="/research" replace />} />
      <Route
        path="/map"
        element={
          <ProtectedRoute>
            <MapPage />
          </ProtectedRoute>
        }
      />

      {/* Profile routes */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/viewers"
        element={
          <ProtectedRoute>
            <ProfileViewersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/likers"
        element={
          <ProtectedRoute>
            <ProfileLikersPage />
          </ProtectedRoute>
        }
      />
      {/* Public profile detail (Profile View feature: full profile + like/block/report,
          visit recorded in the views history log) — declared after the static
          /profile/* routes. React Router ranks static segments above dynamic
          ones, so /profile/viewers and /profile/likers still win over /profile/:userId. */}
      <Route
        path="/profile/:userId"
        element={
          <ProtectedRoute>
            <ProfileViewPage />
          </ProtectedRoute>
        }
      />
      <Route path="/dashboard" element={<Navigate to="/browse" replace />} />

      {/* Chat routes */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat/:userId"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />

      {/* Catch-all fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <SocketProvider>
            <AppRoutes />
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
