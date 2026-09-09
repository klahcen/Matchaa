import { createApp } from './app';
import { pool, testDbConnection } from './config/db';
import { env } from './config/env';
import { loadCommonPasswords } from './services/authService';
import { initializeSocketServer } from './sockets/socketServer';

const startServer = async (): Promise<void> => {
  try {
    console.log('[Server] Initializing Matcha Backend...');

    // Preload common passwords dictionary into memory
    loadCommonPasswords();

    // Verify database connection on boot
    await testDbConnection();

    // Check Resend email configuration and warn if sandbox domain restriction is active
    if (!env.RESEND_API_KEY) {
      console.warn('\n⚠️  [Resend Warning] RESEND_API_KEY is not set in .env! Emails will fail to send.\n');
    } else if (env.MAIL_FROM.toLowerCase().includes('resend.dev')) {
      console.warn(
        '\n' +
        '┌─────────────────────────────────────────────────────────────────────────────┐\n' +
        '│ ⚠️  RESEND SANDBOX RESTRICTION ACTIVE                                       │\n' +
        '│                                                                             │\n' +
        `│ Sender: ${env.MAIL_FROM.padEnd(67)} │\n` +
        '│ Restriction: Emails can ONLY be delivered to your Resend account email      │\n' +
        '│              or "delivered@resend.dev".                                     │\n' +
        '│ Warning: Sending to other recipients will be rejected (403 Forbidden)      │\n' +
        '│          until a custom domain is configured at resend.com/domains.         │\n' +
        '└─────────────────────────────────────────────────────────────────────────────┘\n'
      );
    }

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      console.log(`[Server] Matcha API running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      console.log(`[Server] Base URL: ${env.APP_URL}`);
      console.log(`[Server] Auth endpoints available at ${env.APP_URL}/api/auth`);
    });

    // Initialize Socket.io server
    const io = initializeSocketServer(server);
    console.log('[Socket.io] Real-time server initialized');

    // Make io available globally for controllers to emit notifications
    (global as any).io = io;

    // Graceful shutdown handling
    const handleShutdown = async (signal: string) => {
      console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

      io.close(() => {
        console.log('[Socket.io] Server closed.');
      });

      server.close(async () => {
        console.log('[Server] HTTP server closed.');
        try {
          await pool.end();
          console.log('[PostgreSQL] Connection pool closed.');
          process.exit(0);
        } catch (err: any) {
          console.error('[Server] Error during pool termination:', err.message);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds if lingering connections exist
      setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (error: any) {
    console.error('[Server] Fatal error during startup:', error.message);
    process.exit(1);
  }
};

startServer();
