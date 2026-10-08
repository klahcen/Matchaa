import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, CircleCheck, MailCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import {
  GENDER_OPTIONS,
  SEXUAL_PREFERENCE_OPTIONS,
  type Gender,
  type Photo,
  type Profile,
  type ProfileSummary,
  type SexualPreference,
  type ProfileRequirement,
  type Tag,
} from '../types/profile';
import { computeProfileMissing, describeRequirement } from '../utils/profileCompletion';
import {
  BIOGRAPHY_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  validateBinaryChoice,
  validateBiography,
  validateEmail,
  validateName,
} from '../utils/validation';

const PROFILE_REQUIREMENTS: ProfileRequirement[] = ['biography', 'tags', 'profile_picture', 'location'];

type Tab = 'edit' | 'views' | 'likes';

/** Editable subset of the profile, held as a draft until "Save changes". */
interface ProfileDraft {
  first_name: string;
  last_name: string;
  email: string;
  birthdate: string;
  gender: Gender | null;
  sexual_preferences: SexualPreference;
  biography: string;
}

const toDateInputValue = (value: string | null): string => {
  if (!value) return '';
  return value.slice(0, 10);
};

const toDraft = (profile: Profile): ProfileDraft => ({
  first_name: profile.first_name ?? '',
  last_name: profile.last_name ?? '',
  email: profile.email ?? '',
  birthdate: toDateInputValue(profile.birthdate),
  gender: profile.gender ?? null,
  sexual_preferences: profile.sexual_preferences ?? 'female',
  biography: profile.biography ?? '',
});

const hasChanges = (draft: ProfileDraft, profile: Profile): boolean => {
  const original = toDraft(profile);
  return (Object.keys(draft) as (keyof ProfileDraft)[]).some(
    (key) => (draft[key] ?? '') !== (original[key] ?? '')
  );
};

const shiftYears = (years: number): string => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
};

const MAX_BIRTHDATE = shiftYears(-18);
const MIN_BIRTHDATE = shiftYears(-120);

const computeAge = (birthdate: string | null): number | null => {
  if (!birthdate) return null;
  const date = new Date(`${toDateInputValue(birthdate)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age--;
  return age >= 0 ? age : null;
};

const validateBirthdate = (birthdate: string): string | null => {
  if (!birthdate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return 'Please enter a complete date of birth.';
  if (birthdate > MAX_BIRTHDATE) return 'You must be at least 18 years old to use Matcha.';
  if (birthdate < MIN_BIRTHDATE) return 'Please enter a realistic date of birth.';
  return null;
};

type DraftErrors = Partial<Record<keyof ProfileDraft, string>>;

/** Client-side mirror of the PUT /api/profile/me validators (profileController + authService). */
const validateDraft = (draft: ProfileDraft): DraftErrors => {
  const errors: DraftErrors = {};
  const set = (key: keyof ProfileDraft, message: string | null) => {
    if (message) errors[key] = message;
  };
  set('first_name', validateName(draft.first_name, 'First name'));
  set('last_name', validateName(draft.last_name, 'Last name'));
  set('email', validateEmail(draft.email));
  set('birthdate', validateBirthdate(draft.birthdate));
  set('gender', validateBinaryChoice(draft.gender, 'Please choose your gender'));
  set(
    'sexual_preferences',
    validateBinaryChoice(draft.sexual_preferences, 'Please choose who you want to see')
  );
  set('biography', validateBiography(draft.biography));
  return errors;
};

export const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<DraftErrors>({});
  // Fallback for backends that do not return pending_email yet: the address
  // the user just asked to switch to, so the "verification sent" note still shows.
  const [localPendingEmail, setLocalPendingEmail] = useState<string | null>(null);
  // Lets the page congratulate the user once the checklist is done.
  const [startedIncomplete, setStartedIncomplete] = useState(false);
  const noticeTimerRef = useRef<number | null>(null);
  // How the stored location was captured. Typed places are geocoded to
  // coordinates too, so lat/lng alone no longer means "from GPS"; this is only
  // known after a save in this session (GET /profile/me does not report it).
  const [locationSource, setLocationSource] = useState<'gps' | 'manual' | null>(null);

  const [tab, setTab] = useState<Tab>('edit');
  const [viewers, setViewers] = useState<ProfileSummary[]>([]);
  const [likers, setLikers] = useState<ProfileSummary[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null);

  const flash = (message: string, durationMs = 3500) => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice(null);
    }, durationMs);
  };

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    },
    []
  );

  /** Updates draft fields and clears their validation errors as the user fixes them. */
  const updateDraft = (patch: Partial<ProfileDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setFieldErrors((prev) => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof ProfileDraft)[]).forEach((key) => delete next[key]);
      return next;
    });
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
      if (!data) throw new Error('Your profile could not be loaded. Please try again.');
      setProfile(data);
      setDraft(toDraft(data));
      setStartedIncomplete(computeProfileMissing(data).length > 0);
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

    setError(null);
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError('Please fix the highlighted fields before saving.');
      return;
    }

    const requestedEmail = draft.email.trim().toLowerCase();
    const emailChanged = requestedEmail !== (profile.email ?? '').toLowerCase();

    setSaving(true);
    try {
      const { profile: updated, message } = await profileApi.updateMe({
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        email: requestedEmail,
        birthdate: draft.birthdate || null,
        gender: draft.gender ?? undefined,
        sexual_preferences: draft.sexual_preferences,
        biography: draft.biography.trim(),
      });
      if (updated) {
        setProfile(updated);
        // The email field goes back to the active address: a new one only
        // takes over once its verification link is clicked.
        setDraft(toDraft(updated));
      }
      if (emailChanged && updated?.pending_email === undefined) {
        setLocalPendingEmail(requestedEmail);
      } else if (updated?.pending_email !== undefined) {
        setLocalPendingEmail(null);
      }
      // Show the server's own wording: it says when an email change still
      // needs confirming, or when the verification email could not be sent.
      flash(message || 'Profile saved', emailChanged ? 9000 : 3500);
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
  // Errors propagate to PhotoGrid, which keeps its editor open and reports
  // them through onError, instead of closing as if the upload had worked.
  const handlePhotoUpload = async (file: File) => {
    setError(null);
    const photo = await profileApi.uploadPhoto(file);
    if (!photo) throw new Error('Upload finished but the server did not return the photo.');
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
  };

  const handlePhotoDelete = async (photoId: number) => {
    setError(null);
    try {
      const result = await profileApi.deletePhoto(photoId);
      if (!result) throw new Error('The photo could not be deleted. Please try again.');
      // Deleting the profile picture makes the backend promote the oldest
      // remaining photo; mirror that so the "Profile" badge and avatar move.
      const promotedId = result.promoted_photo_id ?? null;
      setProfile((prev) => {
        if (!prev) return prev;
        const photos = prev.photos
          .filter((p) => p.id !== photoId)
          .map((p) => (promotedId !== null ? { ...p, is_profile_picture: p.id === promotedId } : p));
        return {
          ...prev,
          photos,
          photo_count: result.photo_count ?? photos.length,
          has_profile_picture: photos.some((p) => p.is_profile_picture),
          fame_rating: result.fame_rating ?? prev.fame_rating,
        };
      });
      flash(
        result.message ||
          (promotedId !== null
            ? 'Photo deleted. Your oldest remaining photo is now your profile picture.'
            : result.was_profile_picture
              ? 'Photo deleted — choose a new profile picture'
              : 'Photo deleted'),
        promotedId !== null ? 6000 : 3500
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
    if (!result) throw new Error('Your location could not be saved. Please try again.');
    patchProfile({
      latitude: result.latitude,
      longitude: result.longitude,
      location_text: result.location_text,
      fame_rating: result.fame_rating,
    });
    setLocationSource(result.location_source ?? 'gps');
    flash(result.message || `Location set to ${result.location_text}`);
    return result.location_text;
  };

  const handleSaveManualLocation = async (text: string): Promise<string> => {
    setError(null);
    const result = await profileApi.updateLocation({ locationText: text });
    if (!result) throw new Error('Your location could not be saved. Please try again.');
    patchProfile({
      // Typed places are geocoded server-side, so keep the coordinates it returns.
      latitude: result.latitude ?? null,
      longitude: result.longitude ?? null,
      location_text: result.location_text,
      fame_rating: result.fame_rating,
    });
    setLocationSource(result.location_source ?? 'manual');
    flash(result.message || `Location set to ${result.location_text}`);
    return result.location_text;
  };

  if (loading) {
    return (
      <div role="status" aria-label="Loading your profile" className="flex-1 w-full flex items-center justify-center py-24 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || !draft) {
    return (
      <div className="flex-1 w-full flex items-center justify-center p-4 py-16 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end">
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
  const age = computeAge(profile.birthdate);
  const missing = computeProfileMissing(profile);
  const pendingEmail =
    profile.pending_email !== undefined ? profile.pending_email : localPendingEmail;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'edit', label: 'Edit profile' },
    { id: 'views', label: 'Who viewed me', count: viewers.length },
    { id: 'likes', label: 'Who liked me', count: likers.length },
  ];

  return (
    // The page sits inside the app layout's <main>, so it uses plain containers.
    <div className="flex-1 w-full bg-brand-bg">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-12">
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
                {age !== null && (
                  <span className="px-3 py-1.5 rounded-full bg-brand-bg border border-brand-border text-xs font-semibold text-brand-muted">
                    {age} years old
                  </span>
                )}
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

        {/* Completion checklist: browsing, research, the map and likes stay
            locked server-side until all four items are done. */}
        {missing.length > 0 ? (
          <section
            aria-labelledby="profile-checklist-title"
            className="bg-brand-surface rounded-3xl shadow-lg border-2 border-brand-accent/20 p-5 sm:p-6 mb-5"
          >
            <h2 id="profile-checklist-title" className="text-base font-black text-brand-text">
              Finish your profile to start browsing
            </h2>
            <p className="text-xs sm:text-sm text-brand-muted mt-1">
              Browsing, research, the map and likes unlock once {missing.length === 1 ? 'this last step is' : 'these steps are'} done.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {PROFILE_REQUIREMENTS.map((key) => {
                const done = !missing.includes(key);
                return (
                  <li
                    key={key}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold ${
                      done
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-brand-bg border-brand-border text-brand-text'
                    }`}
                  >
                    {done ? (
                      <CircleCheck className="w-5 h-5 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Circle className="w-5 h-5 shrink-0 text-brand-accent" aria-hidden="true" />
                    )}
                    <span>
                      {describeRequirement(key)}
                      <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          startedIncomplete && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-3xl p-4 sm:p-5 mb-5">
              <p className="text-sm font-semibold flex items-center gap-2">
                <CircleCheck className="w-5 h-5 shrink-0 text-emerald-600" aria-hidden="true" />
                Your profile is complete. Browsing is unlocked!
              </p>
              <Link
                to="/browse"
                className="shrink-0 inline-flex items-center justify-center min-h-[40px] px-5 rounded-full bg-emerald-600 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-700 transition-colors"
              >
                Start browsing
              </Link>
            </div>
          )
        )}

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
          <div role="status" className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl p-3.5 mb-4 font-medium">
            {notice}
          </div>
        )}

        {tab === 'edit' && (
          <div className="space-y-5">
            {/* Only the fields saved by "Save changes" live in this form. Tags,
                photos and location save on their own (and LocationSection has
                its own form, which must not be nested inside this one). The
                save button below is linked back to it via form="profile-form". */}
            <form id="profile-form" onSubmit={handleSave} noValidate className="space-y-5">
              <ProfileSection
                title="Basic info"
                description="Your name and the email you sign in with."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <FormInput
                    label="First name"
                    id="first_name"
                    value={draft.first_name}
                    maxLength={NAME_MAX_LENGTH}
                    onChange={(e) => updateDraft({ first_name: e.target.value })}
                    error={fieldErrors.first_name}
                    autoComplete="given-name"
                    required
                  />
                  <FormInput
                    label="Last name"
                    id="last_name"
                    value={draft.last_name}
                    maxLength={NAME_MAX_LENGTH}
                    onChange={(e) => updateDraft({ last_name: e.target.value })}
                    error={fieldErrors.last_name}
                    autoComplete="family-name"
                    required
                  />
                </div>
                <FormInput
                  label="Email"
                  id="email"
                  type="email"
                  value={draft.email}
                  maxLength={EMAIL_MAX_LENGTH}
                  onChange={(e) => updateDraft({ email: e.target.value })}
                  error={fieldErrors.email}
                  autoComplete="email"
                  hint="A new address must be confirmed"
                  required
                />
                {pendingEmail && (
                  <div
                    role="status"
                    className="-mt-2 mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900"
                  >
                    <MailCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
                    <p className="leading-relaxed min-w-0">
                      Verification sent to{' '}
                      <span className="font-bold break-all">{pendingEmail}</span>. Your current
                      email (<span className="font-semibold break-all">{profile.email}</span>) stays
                      active until you confirm the change from that inbox.
                    </p>
                  </div>
                )}
                <FormInput
                  label="Date of Birth"
                  id="birthdate"
                  type="date"
                  value={draft.birthdate}
                  min={MIN_BIRTHDATE}
                  max={MAX_BIRTHDATE}
                  onChange={(e) => updateDraft({ birthdate: e.target.value })}
                  error={fieldErrors.birthdate ?? validateBirthdate(draft.birthdate)}
                  hint="Shown publicly as age only"
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
                    onChange={(gender) => updateDraft({ gender })}
                    error={fieldErrors.gender}
                  />
                  <PillSelector<SexualPreference>
                    label="Sexual preference"
                    name="sexual_preferences"
                    options={SEXUAL_PREFERENCE_OPTIONS}
                    value={draft.sexual_preferences}
                    onChange={(sexual_preferences) => updateDraft({ sexual_preferences })}
                    error={fieldErrors.sexual_preferences}
                    hint="Choose the gender you want to see"
                  />
                </div>
                <FormTextarea
                  label="Biography"
                  id="biography"
                  value={draft.biography}
                  maxLength={BIOGRAPHY_MAX_LENGTH}
                  onChange={(e) => updateDraft({ biography: e.target.value })}
                  error={fieldErrors.biography}
                  placeholder="Tell other members what makes you, you..."
                />
              </ProfileSection>
            </form>

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
                hasGps={locationSource === 'gps'}
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
                form="profile-form"
                loading={saving}
                disabled={!dirty}
                className="sm:w-auto sm:min-w-[200px] order-1 sm:order-2 mb-3 sm:mb-0"
              >
                Save changes
              </PrimaryButton>
            </div>
          </div>
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
      </div>
    </div>
  );
};
