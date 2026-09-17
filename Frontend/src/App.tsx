import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppHeader } from './components/app/AppHeader';
import { IncomingCallToast } from './components/app/IncomingCallToast';
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

// Protected route wrapper for authenticated views like /browse
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <AppHeader />
      <IncomingCallToast />
      <div className="pt-[68px]">
        {children}
      </div>
    </>
  );
};

// Public-only route wrapper (redirects logged-in users to /browse)
const PublicRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/browse" replace />;
  }

  return children;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Root landing page (redirects logged-in users to /browse) */}
      <Route
        path="/"
        element={
          <PublicRoute>
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
      <Route path="/verify/:token" element={<VerifyEmailPage />} />
      <Route path="/verify" element={<VerifyEmailPage />} />
      <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

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
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
