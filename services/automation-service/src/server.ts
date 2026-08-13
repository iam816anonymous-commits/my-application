import { config } from '@automation-os/config';
import { DatabaseService } from './database.js';
import { createApp } from './app.js';
import { StructuredLogger } from '@automation-os/shared-utils';

const logger = new StructuredLogger('AutomationServiceServer');

async function bootstrap(): Promise<void> {
  const db = new DatabaseService();

  try {
    // Initialize SQLite database connection
    db.initialize();

    // Create express app and boot
    const app = createApp(db);
    const port = config.AUTOMATION_SERVICE_PORT;

    const server = app.listen(port, () => {
      logger.info(`Automation Service is running on port ${port}`, {
        env: config.NODE_ENV,
        port,
      });
    });

    const shutdown = (): void => {
      logger.info('Received shutdown signal. Stopping Automation Service gracefully...');
      server.close(() => {
        db.close();
        logger.info('Automation Service stopped cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err: unknown) {
    logger.error('Failed to start Automation Service', err as Error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
