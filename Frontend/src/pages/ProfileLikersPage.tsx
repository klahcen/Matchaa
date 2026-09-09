import React, { useCallback } from 'react';
import { profileApi } from '../api/profile';
import { SocialListLayout } from '../components/profile/SocialListLayout';

/**
 * GET /api/profile/me/likes — members who liked me, most recent first.
 *
 * Read-side only: performing like/unlike actions is a separate upcoming
 * feature, as is recording profile views.
 */
export const ProfileLikersPage: React.FC = () => {
  const load = useCallback(() => profileApi.getLikes(), []);

  return (
    <SocialListLayout
      title="Who liked you"
      subtitle="Members who liked your profile, most recent first."
      emptyMessage="No likes yet. A complete profile with photos earns more likes."
      eventLabel="Liked"
      load={load}
    />
  );
};
