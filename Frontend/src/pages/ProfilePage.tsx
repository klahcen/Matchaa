import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { profileApi, resolveMediaUrl } from '../api/profile';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { FormInput } from '../components/common/FormInput';
import { FormTextarea } from '../components/common/FormTextarea';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { FameBadge } from '../components/profile/FameBadge';
import { LocationSection } from '../components/profile/LocationSection';
import { PhotoGrid } from '../components/profile/PhotoGrid';
import { PillSelector } from '../components/profile/PillSelector';
import { ProfileEventList } from '../components/profile/ProfileEventList';
import { ProfileSection } from '../components/profile/ProfileSection';
import { TagPicker } from '../components/profile/TagPicker';
import { useAuth } from '../context/AuthContext';
import {
  GENDER_OPTIONS,
  SEXUAL_PREFERENCE_OPTIONS,
  type Gender,
  type Photo,
  type Profile,
  type ProfileSummary,
  type SexualPreference,
  type Tag,
} from '../types/profile';

const MAX_BIOGRAPHY_LENGTH = 500;

type Tab = 'edit' | 'views' | 'likes';

/** Editable subset of the profile, held as a draft until "Save changes". */
interface ProfileDraft {
  first_name: string;
  last_name: string;
  email: string;
  gender: Gender | null;
  sexual_preferences: SexualPreference;
  biography: string;
}

const toDraft = (profile: Profile): ProfileDraft => ({
  first_name: profile.first_name ?? '',
  last_name: profile.last_name ?? '',
  email: profile.email ?? '',
  gender: profile.gender ?? null,
  sexual_preferences: profile.sexual_preferences ?? 'bisexual',
  biography: profile.biography ?? '',
});

const hasChanges = (draft: ProfileDraft, profile: Profile): boolean => {
  const original = toDraft(profile);
  return (Object.keys(draft) as (keyof ProfileDraft)[]).some(
    (key) => (draft[key] ?? '') !== (original[key] ?? '')
  );
};

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('edit');
  const [viewers, setViewers] = useState<ProfileSummary[]>([]);
  const [likers, setLikers] = useState<ProfileSummary[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  };

  // Entering a social tab flips it into its loading state during render
  // (React's render-phase adjustment pattern), so the effect below only
  // performs the fetch and never calls setState synchronously.
  if (tab !== 'edit' && loadedTab !== tab) {
    setLoadedTab(tab);
    setSocialLoading(true);
  }

  const handleTabChange = (next: Tab) => {
    setError(null);
    setTab(next);
  };

  /**
   * Fetches the profile. On the initial mount `loading` is already true and
   * `error` already null, so `reset` is skipped there — that keeps the mount
   * effect free of synchronous setState calls. Explicit retries do reset.
   */
  const loadProfile = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await profileApi.getMe();
      setProfile(data);
      setDraft(toDraft(data));
    } catch (err: any) {
      setError(err?.message || 'Failed to load your profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile(false);
  }, [loadProfile]);

  // Lazy-load the social tabs, and refresh when switching between them.
  useEffect(() => {
    if (tab === 'edit') return;
    let active = true;

    const load = async () => {
      try {
        const data = tab === 'views' ? await profileApi.getViews() : await profileApi.getLikes();
        if (!active) return;
        if (tab === 'views') setViewers(data);
        else setLikers(data);
      } catch (err: any) {
        if (active) setError(err?.message || 'Failed to load this list');
      } finally {
        if (active) setSocialLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [tab]);

  const patchProfile = (patch: Partial<Profile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !profile) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await profileApi.updateMe({
        first_name: draft.first_name,
        last_name: draft.last_name,
        email: draft.email,
        gender: draft.gender ?? undefined,
        sexual_preferences: draft.sexual_preferences,
        biography: draft.biography,
      });
      setProfile(updated);
      setDraft(toDraft(updated));
      flash('Profile saved');
    } catch (err: any) {
      setError(err?.message || 'Failed to save your profile');
    } finally {
      setSaving(false);
    }
  };

  // --- tags ---------------------------------------------------------------
  const handleTagAdded = (tag: Tag) => {
    setProfile((prev) =>
      prev && !prev.tags.some((t) => t.id === tag.id)
        ? { ...prev, tags: [...prev.tags, tag] }
        : prev
    );
    flash(`Added #${tag.name}`);
  };

  const handleTagRemoved = (tagId: number) => {
    setProfile((prev) => (prev ? { ...prev, tags: prev.tags.filter((t) => t.id !== tagId) } : prev));
  };

  // --- photos -------------------------------------------------------------
  const handlePhotoUpload = async (file: File) => {
    setError(null);
    try {
      const photo = await profileApi.uploadPhoto(file);
      setProfile((prev) => {
        if (!prev) return prev;
        const photos = [...prev.photos, photo as Photo];
        return {
          ...prev,
          photos,
          photo_count: photos.length,
          // The backend auto-promotes the very first photo.
          has_profile_picture:
            photo.is_profile_picture || photos.some((p) => p.is_profile_picture),
          fame_rating: photo.fame_rating ?? prev.fame_rating,
        };
      });
      flash('Photo uploaded');
    } catch (err: any) {
      setError(err?.message || 'Failed to upload photo');
    }
  };

  const handlePhotoDelete = async (photoId: number) => {
    setError(null);
    try {
      const result = await profileApi.deletePhoto(photoId);
      setProfile((prev) => {
        if (!prev) return prev;
        const photos = prev.photos.filter((p) => p.id !== photoId);
        return {
          ...prev,
          photos,
          photo_count: result.photo_count ?? photos.length,
          has_profile_picture: photos.some((p) => p.is_profile_picture),
          fame_rating: result.fame_rating ?? prev.fame_rating,
        };
      });
      flash(
        result.was_profile_picture
          ? 'Photo deleted — choose a new profile picture'
          : 'Photo deleted'
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to delete photo');
    }
  };

  const handleSetProfilePicture = async (photoId: number) => {
    setError(null);
    try {
      await profileApi.setProfilePicture(photoId);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              photos: prev.photos.map((p) => ({ ...p, is_profile_picture: p.id === photoId })),
              has_profile_picture: true,
            }
          : prev
      );
      flash('Profile picture updated');
    } catch (err: any) {
      setError(err?.message || 'Failed to update your profile picture');
    }
  };

  // --- location -----------------------------------------------------------
  const handleSaveGps = async (lat: number, lng: number): Promise<string> => {
    setError(null);
    const result = await profileApi.updateLocation({ lat, lng });
    patchProfile({
      latitude: result.latitude,
      longitude: result.longitude,
      location_text: result.location_text,
      fame_rating: result.fame_rating,
    });
    flash(`Location set to ${result.location_text}`);
    return result.location_text;
  };

  const handleSaveManualLocation = async (text: string): Promise<string> => {
    setError(null);
    const result = await profileApi.updateLocation({ locationText: text });
    patchProfile({
      latitude: null,
      longitude: null,
      location_text: result.location_text,
      fame_rating: result.fame_rating,
    });
    flash(`Location set to ${result.location_text}`);
    return result.location_text;
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || !draft) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
        <div className="w-full max-w-md bg-brand-surface rounded-3xl shadow-2xl p-8 text-center">
          <h1 className="text-xl font-black text-brand-text mb-2">Could not load your profile</h1>
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <PrimaryButton onClick={() => void loadProfile()}>Try again</PrimaryButton>
        </div>
      </div>
    );
  }

  const avatarUrl = resolveMediaUrl(
    profile.photos.find((p) => p.is_profile_picture)?.url ?? null
  );
  const initials = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase();
  const dirty = hasChanges(draft, profile);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'edit', label: 'Edit profile' },
    { id: 'views', label: 'Who viewed me', count: viewers.length },
    { id: 'likes', label: 'Who liked me', count: likers.length },
  ];

  return (
    <div className="min-h-screen w-full bg-brand-bg">
      {/* Gradient header */}
      <header className="bg-gradient-to-br from-brand-start via-brand-mid to-brand-end px-4 pt-5 pb-24 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link
            to="/browse"
            className="inline-flex items-center gap-1.5 text-white/90 hover:text-white text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            Browse
          </Link>
          <span className="text-2xl font-black tracking-tight text-white">matcha</span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-white/90 hover:text-white text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 -mt-16 pb-12">
        {/* Identity card */}
        <div className="bg-brand-surface rounded-3xl shadow-xl p-5 sm:p-7 mb-5">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-brand-bg border-4 border-brand-surface shadow-lg flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Your profile picture" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-black text-brand-accent">{initials || '?'}</span>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1">
                <FameBadge rating={profile.fame_rating} showLabel={false} />
              </div>
            </div>

            <div className="text-center sm:text-left flex-1 min-w-0">
              <h1 className="text-2xl font-black text-brand-text truncate">
                {profile.first_name} {profile.last_name}
              </h1>
              <p className="text-sm text-brand-muted truncate">@{profile.username}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                <FameBadge rating={profile.fame_rating} />
                <span className="px-3 py-1.5 rounded-full bg-brand-bg border border-brand-border text-xs font-semibold text-brand-muted">
                  {profile.photo_count}/{profile.max_photos} photos
                </span>
                <span className="px-3 py-1.5 rounded-full bg-brand-bg border border-brand-border text-xs font-semibold text-brand-muted">
                  {profile.tags.length} {profile.tags.length === 1 ? 'interest' : 'interests'}
                </span>
              </div>
              {!profile.location_text && (
                <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">
                  Your location is not set yet. Matcha needs an approximate location to find matches
                  near you.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              aria-pressed={tab === t.id}
              className={`shrink-0 px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider transition-all duration-200 ${
                tab === t.id
                  ? 'bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white shadow-lg shadow-brand-accent/25'
                  : 'bg-brand-surface text-brand-muted border border-brand-border hover:text-brand-accent hover:border-brand-accent/40'
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span
                  className={`ml-2 text-[10px] font-black rounded-full px-2 py-0.5 ${
                    tab === t.id ? 'bg-white/25 text-white' : 'bg-brand-accent/10 text-brand-accent'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        {notice && (
          <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl p-3.5 mb-4 font-medium">
            {notice}
          </div>
        )}

        {tab === 'edit' && (
          <form onSubmit={handleSave} noValidate className="space-y-5">
            <ProfileSection
              title="Basic info"
              description="Your name and the email you sign in with."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <FormInput
                  label="First name"
                  id="first_name"
                  value={draft.first_name}
                  maxLength={50}
                  onChange={(e) => setDraft({ ...draft, first_name: e.target.value })}
                  required
                />
                <FormInput
                  label="Last name"
                  id="last_name"
                  value={draft.last_name}
                  maxLength={50}
                  onChange={(e) => setDraft({ ...draft, last_name: e.target.value })}
                  required
                />
              </div>
              <FormInput
                label="Email"
                id="email"
                type="email"
                value={draft.email}
                maxLength={255}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                hint="Changing this does not require re-verification"
                required
              />
            </ProfileSection>

            <ProfileSection
              title="About you"
              description="These details drive who Matcha suggests for you."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <PillSelector<Gender>
                  label="Gender"
                  name="gender"
                  options={GENDER_OPTIONS}
                  value={draft.gender}
                  onChange={(gender) => setDraft({ ...draft, gender })}
                />
                <PillSelector<SexualPreference>
                  label="Sexual preference"
                  name="sexual_preferences"
                  options={SEXUAL_PREFERENCE_OPTIONS}
                  value={draft.sexual_preferences}
                  onChange={(sexual_preferences) => setDraft({ ...draft, sexual_preferences })}
                  hint="Defaults to bisexual"
                />
              </div>
              <FormTextarea
                label="Biography"
                id="biography"
                value={draft.biography}
                maxLength={MAX_BIOGRAPHY_LENGTH}
                onChange={(e) => setDraft({ ...draft, biography: e.target.value })}
                placeholder="Tell other members what makes you, you..."
              />
            </ProfileSection>

            <ProfileSection
              title="Interests"
              description="Pick from existing tags or create your own. Tags are shared across Matcha."
            >
              <TagPicker
                tags={profile.tags}
                onAdded={handleTagAdded}
                onRemoved={handleTagRemoved}
                onError={setError}
              />
            </ProfileSection>

            <ProfileSection
              title="Photos"
              description="Up to 5 photos. Exactly one is your profile picture."
            >
              <PhotoGrid
                photos={profile.photos}
                maxPhotos={profile.max_photos}
                onUpload={handlePhotoUpload}
                onDelete={handlePhotoDelete}
                onSetProfilePicture={handleSetProfilePicture}
                onError={setError}
              />
            </ProfileSection>

            <ProfileSection
              title="Location"
              description="Neighborhood level only, and always with your explicit consent."
            >
              <LocationSection
                savedText={profile.location_text}
                hasGps={profile.latitude != null && profile.longitude != null}
                onSaveGps={handleSaveGps}
                onSaveManual={handleSaveManualLocation}
                onError={setError}
              />
            </ProfileSection>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between bg-brand-surface rounded-3xl shadow-lg p-5">
              <p className="text-xs text-brand-muted order-2 sm:order-1">
                {dirty
                  ? 'You have unsaved changes to your basic info and about sections.'
                  : 'Photos, interests and location save instantly. Basic info and about save here.'}
              </p>
              <PrimaryButton
                type="submit"
                loading={saving}
                disabled={!dirty}
                className="sm:w-auto sm:min-w-[200px] order-1 sm:order-2 mb-3 sm:mb-0"
              >
                Save changes
              </PrimaryButton>
            </div>
          </form>
        )}

        {tab === 'views' && (
          <div className="bg-brand-surface rounded-3xl shadow-lg p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base sm:text-lg font-black text-brand-text">Who viewed you</h2>
                <p className="text-xs text-brand-muted mt-1">Most recent first.</p>
              </div>
              <Link
                to="/profile/viewers"
                className="text-xs font-bold uppercase tracking-wider text-brand-accent hover:underline"
              >
                Open full page
              </Link>
            </div>
            <ProfileEventList
              people={viewers}
              loading={socialLoading}
              emptyMessage="No one has viewed your profile yet. Complete your profile and add photos to get noticed."
              eventLabel="Viewed"
            />
          </div>
        )}

        {tab === 'likes' && (
          <div className="bg-brand-surface rounded-3xl shadow-lg p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base sm:text-lg font-black text-brand-text">Who liked you</h2>
                <p className="text-xs text-brand-muted mt-1">Most recent first.</p>
              </div>
              <Link
                to="/profile/likers"
                className="text-xs font-bold uppercase tracking-wider text-brand-accent hover:underline"
              >
                Open full page
              </Link>
            </div>
            <ProfileEventList
              people={likers}
              loading={socialLoading}
              emptyMessage="No likes yet. A complete profile with photos earns more likes."
              eventLabel="Liked"
            />
          </div>
        )}
      </main>
    </div>
  );
};
