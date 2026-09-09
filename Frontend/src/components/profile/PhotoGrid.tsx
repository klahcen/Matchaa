import React, { useRef, useState } from 'react';
import { resolveMediaUrl } from '../../api/profile';
import type { Photo } from '../../types/profile';

interface PhotoGridProps {
  photos: Photo[];
  maxPhotos: number;
  onUpload: (file: File) => Promise<void>;
  onDelete: (photoId: number) => Promise<void>;
  onSetProfilePicture: (photoId: number) => Promise<void>;
  onError: (message: string) => void;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Photo grid with up to `maxPhotos` slots.
 *
 * Reflows from 3 columns on desktop to 2 on small screens. Exactly one photo
 * may be the profile picture; if none is set (e.g. the user deleted it), the
 * grid says so explicitly rather than silently promoting another photo.
 */
export const PhotoGrid: React.FC<PhotoGridProps> = ({
  photos,
  maxPhotos,
  onUpload,
  onDelete,
  onSetProfilePicture,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const hasProfilePicture = photos.some((p) => p.is_profile_picture);
  const slotsRemaining = Math.max(0, maxPhotos - photos.length);

  /**
   * Client-side pre-check mirroring the server rules, so obvious mistakes get
   * an instant message instead of a round-trip. The server still enforces all
   * of it (including real magic-byte inspection).
   */
  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Unsupported image type "${file.type || 'unknown'}". Allowed: JPEG, PNG, WebP.`;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return `Image is ${sizeMb} MB. Maximum allowed size is 5 MB.`;
    }
    return null;
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file after an error

    if (!file) return;

    const problem = validateFile(file);
    if (problem) {
      onError(problem);
      return;
    }

    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: Photo) => {
    setPendingId(photo.id);
    try {
      await onDelete(photo.id);
    } finally {
      setPendingId(null);
    }
  };

  const handlePromote = async (photo: Photo) => {
    setPendingId(photo.id);
    try {
      await onSetProfilePicture(photo.id);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div>
      {!hasProfilePicture && photos.length > 0 && (
        <div className="w-full bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm rounded-2xl p-3.5 mb-4">
          You have no profile picture right now. Choose one below — it is what other members see
          first.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {photos.map((photo) => {
          const busy = pendingId === photo.id;
          return (
            <figure
              key={photo.id}
              className={`relative aspect-square rounded-2xl overflow-hidden border-2 bg-brand-bg group ${
                photo.is_profile_picture ? 'border-brand-accent shadow-lg shadow-brand-accent/20' : 'border-brand-border'
              }`}
            >
              <img
                src={resolveMediaUrl(photo.url) ?? ''}
                alt={photo.is_profile_picture ? 'Your profile picture' : 'Your photo'}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {photo.is_profile_picture && (
                <figcaption className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white text-[10px] font-black uppercase tracking-wider shadow-md">
                  Profile
                </figcaption>
              )}

              <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1.5 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity duration-200">
                {!photo.is_profile_picture && (
                  <button
                    type="button"
                    onClick={() => handlePromote(photo)}
                    disabled={busy}
                    className="flex-1 px-2 py-1.5 rounded-full bg-white/95 hover:bg-white text-brand-text text-[11px] font-bold transition-colors disabled:opacity-60"
                  >
                    {busy ? '...' : 'Set as profile'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  disabled={busy}
                  aria-label="Delete photo"
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/95 hover:bg-brand-error-bg text-brand-error-text transition-colors disabled:opacity-60"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </figure>
          );
        })}

        {/* Empty upload slot — only while there is room left */}
        {slotsRemaining > 0 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-2xl border-2 border-dashed border-brand-border hover:border-brand-accent hover:bg-brand-accent/5 flex flex-col items-center justify-center gap-2 text-brand-muted hover:text-brand-accent transition-all duration-200 disabled:opacity-60 disabled:pointer-events-none"
          >
            {uploading ? (
              <div className="w-6 h-6 border-3 border-brand-border border-t-brand-accent rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-xs font-bold uppercase tracking-wider">Upload</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <p className="text-xs text-brand-muted mt-3">
        {photos.length}/{maxPhotos} photos · JPEG, PNG or WebP · max 5 MB each
        {photos.length >= maxPhotos && ' · delete a photo to upload a new one'}
      </p>
    </div>
  );
};
