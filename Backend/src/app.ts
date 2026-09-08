import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application, Request, Response } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/authRoutes';

export const createApp = (): Application => {
  const app = express();

  // Trust proxy headers for accurate client IP resolution (needed for rate limiting)
  app.set('trust proxy', 1);

  // Cross-Origin Resource Sharing
  app.use(
    cors({
      origin: true, // Allow requesting origin in development
      credentials: true, // Allow cookies to be sent
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Cookie parsing for httpOnly JWT token
  app.use(cookieParser());

  // Request body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Basic health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount authentication routes
  app.use('/api/auth', authRoutes);

  // Handle 404 for unmapped routes
  app.use(notFoundHandler);

  // Centralized error handling middleware
  app.use(errorHandler);

  return app;
};
