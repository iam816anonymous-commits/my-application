import { config } from '@automation-os/config';
import { DatabaseService } from './database.js';
import { createApp } from './app.js';
import { StructuredLogger } from '@automation-os/shared-utils';

const logger = new StructuredLogger('AuthServiceServer');

async function bootstrap(): Promise<void> {
  const db = new DatabaseService();

  try {
    // Initialize SQLite database
    db.initialize();

    // Create and configure express app
    const app = createApp(db);
    const port = config.AUTH_SERVICE_PORT;

    const server = app.listen(port, () => {
      logger.info(`Auth Service is running on port ${port}`, {
        env: config.NODE_ENV,
        port,
      });
    });

    // Graceful Shutdown Handler
    const shutdown = (): void => {
      logger.info('Received shutdown signal. Stopping Auth Service gracefully...');
      server.close(() => {
        db.close();
        logger.info('Auth Service stopped cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err: unknown) {
    logger.error('Failed to start Auth Service server', err as Error);
    process.exit(1);
  }
}

// Execute server start
if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
