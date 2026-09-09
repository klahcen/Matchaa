import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/**
 * Global 404 Route Not Found middleware.
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

/**
 * Centralized error handler middleware.
 * Ensures consistent JSON responses, appropriate HTTP status codes,
 * and completely hides stack traces and database internals from client responses.
 */
export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Handle known operational AppErrors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors && err.errors.length > 0 ? { errors: err.errors } : {}),
    });
    return;
  }

  // Handle express.json() syntax parsing error
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    res.status(400).json({
      success: false,
      message: 'Malformed JSON payload in request body',
    });
    return;
  }

  // Handle multer upload errors (size limit, unexpected field, no file) as 400s
  // so oversized/invalid uploads never surface as an opaque 500.
  if (err?.name === 'MulterError') {
    const multerMessages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'Image is too large. Maximum allowed size is 5 MB.',
      LIMIT_FILE_COUNT: 'Too many files uploaded. Only one photo per request is allowed.',
      LIMIT_FIELD_COUNT: 'Too many fields in the upload request.',
      LIMIT_FIELD_KEY: 'Upload field name is too long.',
      LIMIT_FIELD_VALUE: 'Upload field value is too large.',
      LIMIT_PART_COUNT: 'Too many parts in the upload request.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected upload field. The photo must be sent in a "photo" field.',
    };
    res.status(400).json({
      success: false,
      message: multerMessages[err.code] || 'File upload failed. Please try again.',
    });
    return;
  }

  // Log unhandled unexpected errors to server console only
  console.error('[Unhandled Error caught by errorHandler]:', {
    name: err?.name,
    message: err?.message,
    stack: env.NODE_ENV === 'development' ? err?.stack : undefined,
  });

  // Never leak internal exception details or stack traces to clients
  res.status(500).json({
    success: false,
    message: 'An unexpected internal server error occurred. Please try again later.',
  });
};
