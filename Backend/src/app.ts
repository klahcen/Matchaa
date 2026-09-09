import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application, Request, Response } from 'express';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/authRoutes';
import { browsingRoutes } from './routes/browsingRoutes';
import { profileRoutes, tagRoutes } from './routes/profileRoutes';
import { profileViewRoutes } from './routes/profileViewRoutes';
import { searchRoutes } from './routes/searchRoutes';
import { chatRoutes } from './routes/chatRoutes';
import { notificationRoutes } from './routes/notificationRoutes';

export const createApp = (): Application => {
  const app = express();

  // Trust proxy headers for accurate client IP resolution (needed for rate limiting)
  app.set('trust proxy', 1);

  // Cross-Origin Resource Sharing
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
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

  // Serve uploaded profile photos statically (public by design: they are
  // shown on other users' profiles). Path comes from env.UPLOAD_DIR so it
  // resolves identically under src/ (tsx) and dist/ (compiled build).
  app.use('/uploads', express.static(env.UPLOAD_DIR));

  // Mount authentication routes
  app.use('/api/auth', authRoutes);

  // Mount profile routes (/api/profile/me, photos, tags, location, views, likes)
  app.use('/api/profile', profileRoutes);

  // Mount shared tag routes so autocomplete resolves to GET /api/tags/search
  app.use('/api', tagRoutes);

  // Mount browsing routes (/api/browse/suggestions)
  app.use('/api/browse', browsingRoutes);

  // Mount profile view routes (/api/users/:userId + like/block/report actions)
  app.use('/api/users', profileViewRoutes);

  // Mount research routes (/api/search — advanced search, no relevance scoring)
  app.use('/api/search', searchRoutes);

  // Mount chat routes (/api/chat/conversations, /api/chat/:userId/messages)
  app.use('/api/chat', chatRoutes);

  // Mount notification routes (/api/notifications)
  app.use('/api/notifications', notificationRoutes);

  // Handle 404 for unmapped routes
  app.use(notFoundHandler);

  // Centralized error handling middleware
  app.use(errorHandler);

  return app;
};
