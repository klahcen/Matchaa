import React, { useEffect, useRef, useState } from 'react';
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
const EDIT_CANVAS_SIZE = 1000;

type PhotoFilter = 'none' | 'grayscale' | 'warm' | 'cool' | 'contrast';

interface EditOptions {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  filter: PhotoFilter;
}

const DEFAULT_EDIT_OPTIONS: EditOptions = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  filter: 'none',
};

const FILTER_LABELS: Record<PhotoFilter, string> = {
  none: 'Natural',
  grayscale: 'Black & white',
  warm: 'Warm',
  cool: 'Cool',
  contrast: 'High contrast',
};

const filterToCanvasValue = (filter: PhotoFilter): string => {
  switch (filter) {
    case 'grayscale':
      return 'grayscale(1)';
    case 'warm':
      return 'sepia(0.22) saturate(1.18) contrast(1.05)';
    case 'cool':
      return 'saturate(1.08) hue-rotate(12deg) brightness(1.02)';
    case 'contrast':
      return 'contrast(1.18) saturate(1.08)';
    default:
      return 'none';
  }
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image for editing'));
    image.src = src;
  });

const renderEditedImage = async (
  sourceUrl: string,
  options: EditOptions,
  size = EDIT_CANVAS_SIZE
): Promise<HTMLCanvasElement> => {
  const image = await loadImage(sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot edit this image');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.save();

  const normalizedRotation = ((options.rotation % 360) + 360) % 360;
  const quarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const rotatedWidth = quarterTurn ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = quarterTurn ? image.naturalWidth : image.naturalHeight;
  const coverScale = Math.max(size / rotatedWidth, size / rotatedHeight) * options.zoom;
  const offsetX = (options.offsetX / 100) * (size / 2);
  const offsetY = (options.offsetY / 100) * (size / 2);

  ctx.translate(size / 2, size / 2);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.filter = filterToCanvasValue(options.filter);
  ctx.drawImage(
    image,
    -image.naturalWidth * coverScale / 2 + offsetX,
    -image.naturalHeight * coverScale / 2 + offsetY,
    image.naturalWidth * coverScale,
    image.naturalHeight * coverScale
  );
  ctx.restore();

  return canvas;
};

const canvasToJpegFile = (canvas: HTMLCanvasElement, originalName: string): Promise<File> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not export edited photo'));
          return;
        }
        const baseName = originalName.replace(/\.[^.]+$/, '') || 'matcha-photo';
        resolve(new File([blob], `${baseName}-edited.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.88
    );
  });

/**
 * Photo grid with up to `maxPhotos` slots.
 *
 * Uploads now support drag-and-drop and a small client-side editor. The editor
 * applies a square crop, 90-degree rotation and one filter before the existing
 * backend upload endpoint receives the final image blob.
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
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [editOptions, setEditOptions] = useState<EditOptions>(DEFAULT_EDIT_OPTIONS);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const hasProfilePicture = photos.some((p) => p.is_profile_picture);
  const slotsRemaining = Math.max(0, maxPhotos - photos.length);

  useEffect(() => {
    return () => {
      if (editingUrl) URL.revokeObjectURL(editingUrl);
    };
  }, [editingUrl]);

  useEffect(() => {
    let cancelled = false;
    const canvas = previewCanvasRef.current;
    if (!canvas || !editingUrl) return;

    const drawPreview = async () => {
      try {
        const rendered = await renderEditedImage(editingUrl, editOptions, 700);
        if (cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(rendered, 0, 0);
        setPreviewError(null);
      } catch (error: any) {
        if (!cancelled) setPreviewError(error?.message || 'Could not preview this photo');
      }
    };

    void drawPreview();
    return () => {
      cancelled = true;
    };
  }, [editingUrl, editOptions]);

  /**
   * Client-side pre-check mirroring the server rules, so obvious mistakes get
   * an instant message instead of a round-trip. The server still enforces all
   * of it (including real magic-byte inspection).
   */
  const validateFile = (file: File): string | null => {
    if (slotsRemaining <= 0) return `You already have the maximum of ${maxPhotos} photos.`;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Unsupported image type "${file.type || 'unknown'}". Allowed: JPEG, PNG, WebP.`;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return `Image is ${sizeMb} MB. Maximum allowed size is 5 MB.`;
    }
    return null;
  };

  const openEditor = (file: File) => {
    const problem = validateFile(file);
    if (problem) {
      onError(problem);
      return;
    }

    if (editingUrl) URL.revokeObjectURL(editingUrl);
    setEditingFile(file);
    setEditingUrl(URL.createObjectURL(file));
    setEditOptions(DEFAULT_EDIT_OPTIONS);
    setPreviewError(null);
  };

  const closeEditor = () => {
    if (editingUrl) URL.revokeObjectURL(editingUrl);
    setEditingFile(null);
    setEditingUrl(null);
    setEditOptions(DEFAULT_EDIT_OPTIONS);
    setPreviewError(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file after an error
    if (file) openEditor(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) openEditor(file);
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

  const handleUploadEditedPhoto = async () => {
    if (!editingFile || !editingUrl) return;

    setUploading(true);
    setPreviewError(null);
    try {
      const canvas = await renderEditedImage(editingUrl, editOptions, EDIT_CANVAS_SIZE);
      const editedFile = await canvasToJpegFile(canvas, editingFile.name);
      if (editedFile.size > MAX_FILE_SIZE_BYTES) {
        throw new Error('Edited image is larger than 5 MB. Try zooming/cropping less and upload again.');
      }
      await onUpload(editedFile);
      closeEditor();
    } catch (error: any) {
      const message = error?.message || 'Failed to edit and upload photo';
      setPreviewError(message);
      onError(message);
    } finally {
      setUploading(false);
    }
  };

  const patchEditOptions = (patch: Partial<EditOptions>) => {
    setEditOptions((current) => ({ ...current, ...patch }));
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
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={handleDrop}
            disabled={uploading}
            className={`aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 disabled:pointer-events-none ${
              dragActive
                ? 'border-brand-accent bg-brand-accent/10 text-brand-accent scale-[1.02]'
                : 'border-brand-border hover:border-brand-accent hover:bg-brand-accent/5 text-brand-muted hover:text-brand-accent'
            }`}
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
                <span className="text-[11px] font-medium normal-case px-3 text-center">
                  Click or drag photo here
                </span>
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

      {editingFile && editingUrl && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Edit photo before upload">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-brand-surface rounded-3xl shadow-2xl border border-brand-border">
            <div className="p-5 sm:p-6 border-b border-brand-border flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-brand-text">Edit photo</h3>
                <p className="text-sm text-brand-muted mt-1">
                  Crop to a square, rotate, and choose a simple filter before uploading.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                disabled={uploading}
                className="w-9 h-9 rounded-full bg-brand-bg text-brand-muted hover:text-brand-text flex items-center justify-center transition-colors disabled:opacity-50"
                aria-label="Close photo editor"
              >
                ×
              </button>
            </div>

            <div className="p-5 sm:p-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <div className="aspect-square rounded-2xl overflow-hidden bg-brand-bg border border-brand-border flex items-center justify-center">
                  {previewError ? (
                    <p className="text-sm text-brand-error-text p-4 text-center">{previewError}</p>
                  ) : (
                    <canvas ref={previewCanvasRef} className="w-full h-full object-contain" />
                  )}
                </div>
                <p className="text-xs text-brand-muted mt-2 truncate">Editing: {editingFile.name}</p>
              </div>

              <div className="space-y-5">
                <div>
                  <label htmlFor="photo-zoom" className="block text-xs font-black uppercase tracking-wider text-brand-text mb-2">
                    Crop zoom
                  </label>
                  <input
                    id="photo-zoom"
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={editOptions.zoom}
                    onChange={(event) => patchEditOptions({ zoom: Number(event.target.value) })}
                    className="w-full accent-brand-accent"
                  />
                </div>

                <div>
                  <label htmlFor="photo-offset-x" className="block text-xs font-black uppercase tracking-wider text-brand-text mb-2">
                    Move left / right
                  </label>
                  <input
                    id="photo-offset-x"
                    type="range"
                    min="-100"
                    max="100"
                    value={editOptions.offsetX}
                    onChange={(event) => patchEditOptions({ offsetX: Number(event.target.value) })}
                    className="w-full accent-brand-accent"
                  />
                </div>

                <div>
                  <label htmlFor="photo-offset-y" className="block text-xs font-black uppercase tracking-wider text-brand-text mb-2">
                    Move up / down
                  </label>
                  <input
                    id="photo-offset-y"
                    type="range"
                    min="-100"
                    max="100"
                    value={editOptions.offsetY}
                    onChange={(event) => patchEditOptions({ offsetY: Number(event.target.value) })}
                    className="w-full accent-brand-accent"
                  />
                </div>

                <div>
                  <p className="block text-xs font-black uppercase tracking-wider text-brand-text mb-2">Rotate</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => patchEditOptions({ rotation: editOptions.rotation - 90 })}
                      className="min-h-[42px] rounded-xl border border-brand-border text-sm font-bold text-brand-text hover:border-brand-accent hover:text-brand-accent transition-colors"
                    >
                      Left 90°
                    </button>
                    <button
                      type="button"
                      onClick={() => patchEditOptions({ rotation: editOptions.rotation + 90 })}
                      className="min-h-[42px] rounded-xl border border-brand-border text-sm font-bold text-brand-text hover:border-brand-accent hover:text-brand-accent transition-colors"
                    >
                      Right 90°
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="photo-filter" className="block text-xs font-black uppercase tracking-wider text-brand-text mb-2">
                    Filter
                  </label>
                  <select
                    id="photo-filter"
                    value={editOptions.filter}
                    onChange={(event) => patchEditOptions({ filter: event.target.value as PhotoFilter })}
                    className="w-full min-h-[42px] rounded-xl border border-brand-border bg-brand-bg px-3 text-sm font-semibold text-brand-text outline-none focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20"
                  >
                    {(Object.keys(FILTER_LABELS) as PhotoFilter[]).map((filter) => (
                      <option key={filter} value={filter}>{FILTER_LABELS[filter]}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeEditor}
                    disabled={uploading}
                    className="min-h-[44px] rounded-full border border-brand-border text-sm font-black uppercase tracking-wider text-brand-muted hover:text-brand-text transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadEditedPhoto}
                    disabled={uploading || !!previewError}
                    className="min-h-[44px] rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white text-sm font-black uppercase tracking-wider shadow-lg shadow-brand-accent/20 hover:brightness-105 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {uploading ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
