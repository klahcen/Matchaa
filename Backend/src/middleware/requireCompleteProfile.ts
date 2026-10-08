import { NextFunction, Response } from 'express';
import {
  getProfileCompletion,
  PROFILE_REQUIREMENT_LABELS,
} from '../services/fameRatingService';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';

/**
 * Profile-completion gate for the matching features (browse suggestions,
 * search + map, like). Must be mounted AFTER requireAuth.
 *
 * "Complete" is the single definition from fameRatingService
 * (evaluateProfileCompletion): biography, at least one tag, a profile picture
 * and a location. When something is missing the request is rejected with:
 *
 *   403 { success: false, code: 'PROFILE_INCOMPLETE', message, missing: string[] }
 *
 * where `missing` ⊆ ['biography', 'tags', 'profile_picture', 'location'].
 * The response is written directly instead of throwing an AppError because the
 * global error handler does not forward the extra `code` / `missing` fields.
 */
export const requireCompleteProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw AppError.unauthorized('Authentication required. Please log in.');
    }

    const { complete, missing } = await getProfileCompletion(req.user.id);
    if (complete) {
      next();
      return;
    }

    const labels = missing.map((item) => PROFILE_REQUIREMENT_LABELS[item]);
    res.status(403).json({
      success: false,
      code: 'PROFILE_INCOMPLETE',
      message: `Complete your profile to use matching features. Still missing: ${labels.join(', ')}.`,
      missing,
    });
  } catch (error) {
    next(error);
  }
};
