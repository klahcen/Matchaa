import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { useAuth } from '../context/AuthContext';

export const BrowsePlaceholderPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
      <div className="w-full max-w-md bg-brand-surface rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end flex items-center justify-center shadow-lg shadow-brand-accent/25 mb-4">
          <svg className="w-9 h-9 text-white fill-current" viewBox="0 0 24 24">
            <path d="M12.784 1.442c-.224-.59-1.077-.59-1.301 0C10.024 5.3 4.28 10.457 4.28 15.228 4.28 19.52 7.74 23 12 23s7.72-3.48 7.72-7.772c0-4.77-5.744-9.928-6.936-13.786zm-1.03 18.067c-2.348 0-4.252-1.904-4.252-4.252 0-2.228 2.37-5.064 3.864-7.22.18-.26.596-.26.776 0 1.494 2.156 3.864 4.992 3.864 7.22 0 2.348-1.904 4.252-4.252 4.252z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-brand-text mb-1">
          Welcome, {user?.username || 'Matcha Member'}!
        </h1>
        <p className="text-xs text-brand-muted mb-6">
          Logged in as <span className="font-semibold text-brand-text">{user?.email}</span>
        </p>

        <div className="w-full bg-brand-bg border border-brand-border rounded-2xl p-4 mb-6 text-left text-xs text-brand-muted space-y-1.5">
          <div className="flex justify-between">
            <span className="text-brand-muted">User ID:</span>
            <span className="font-mono font-bold text-brand-text">{user?.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-muted">Account status:</span>
            <span className="text-emerald-600 font-semibold">Verified</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-muted">Authentication:</span>
            <span className="text-brand-text font-semibold">httpOnly Cookie Active</span>
          </div>
        </div>

        <p className="text-xs text-brand-muted mb-6">
          (Browse &amp; matching features will be implemented in the next milestone)
        </p>

        <div className="w-full space-y-3">
          <PrimaryButton onClick={() => navigate('/profile')}>
            Edit my profile
          </PrimaryButton>
          <PrimaryButton variant="outline" onClick={handleLogout}>
            Sign Out
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
};
