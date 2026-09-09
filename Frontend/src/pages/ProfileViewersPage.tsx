import React, { useCallback } from 'react';
import { profileApi } from '../api/profile';
import { SocialListLayout } from '../components/profile/SocialListLayout';

/**
 * GET /api/profile/me/views — members who opened my profile, most recent first.
 */
export const ProfileViewersPage: React.FC = () => {
  const load = useCallback(() => profileApi.getViews(), []);

  return (
    <SocialListLayout
      title="Who viewed you"
      subtitle="Members who opened your profile, most recent first."
      emptyMessage="No one has viewed your profile yet. Complete your profile and add photos to get noticed."
      eventLabel="Viewed"
      load={load}
    />
  );
};
