import React from 'react';

interface ProfileSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * Rounded white card that groups one editable area of the profile.
 * Stacks cleanly on mobile; the title row wraps when an action is present.
 */
export const ProfileSection: React.FC<ProfileSectionProps> = ({
  title,
  description,
  children,
  action,
}) => {
  return (
    <section className="bg-brand-surface rounded-3xl shadow-lg p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-base sm:text-lg font-black text-brand-text">{title}</h2>
          {description && (
            <p className="text-xs text-brand-muted mt-1 max-w-prose">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
};
