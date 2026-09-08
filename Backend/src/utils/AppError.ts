/**
 * Custom application error class for handling operational errors.
 * Ensures consistent error structures and proper HTTP status codes.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: string[];

  constructor(message: string, statusCode: number = 400, errors?: string[]) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors?: string[]): AppError {
    return new AppError(message, 400, errors);
  }

  static unauthorized(message: string = 'Unauthorized: Access is denied'): AppError {
    return new AppError(message, 401);
  }

  static forbidden(message: string = 'Forbidden: Access is forbidden'): AppError {
    return new AppError(message, 403);
  }

  static notFound(message: string = 'Resource not found'): AppError {
    return new AppError(message, 404);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409);
  }

  static tooManyRequests(message: string = 'Too many requests, please try again later'): AppError {
    return new AppError(message, 429);
  }

  static internal(message: string = 'An unexpected internal server error occurred'): AppError {
    return new AppError(message, 500);
  }
}
