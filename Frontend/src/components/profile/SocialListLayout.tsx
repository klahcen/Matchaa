import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBanner } from '../common/ErrorBanner';
import { ProfileEventList } from './ProfileEventList';
import type { ProfileSummary } from '../../types/profile';

interface SocialListLayoutProps {
  title: string;
  subtitle: string;
  emptyMessage: string;
  eventLabel: string;
  load: () => Promise<ProfileSummary[]>;
}

/**
 * Shared shell for the standalone "Who viewed me" / "Who liked me" pages, so
 * both deep-linkable routes render identically to the profile tabs.
 */
export const SocialListLayout: React.FC<SocialListLayoutProps> = ({
  title,
  subtitle,
  emptyMessage,
  eventLabel,
  load,
}) => {
  const [people, setPeople] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await load();
        if (active) setPeople(data);
      } catch (err: any) {
        if (active) setError(err?.message || 'Failed to load this list');
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-5">
          <Link
            to="/profile"
            className="inline-flex items-center gap-1.5 text-white/90 hover:text-white text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            Profile
          </Link>
          <Link
            to="/browse"
            className="text-white/90 hover:text-white text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors"
          >
            Browse
          </Link>
        </div>

        <div className="bg-brand-surface rounded-3xl shadow-2xl p-5 sm:p-8">
          <h1 className="text-xl sm:text-2xl font-black text-brand-text">{title}</h1>
          <p className="text-xs sm:text-sm text-brand-muted mt-1 mb-5">{subtitle}</p>

          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          <ProfileEventList
            people={people}
            loading={loading}
            emptyMessage={emptyMessage}
            eventLabel={eventLabel}
          />
        </div>
      </div>
    </div>
  );
};
