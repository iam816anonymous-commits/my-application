import { config } from '@automation-os/config';
import { createGatewayApp } from './app.js';
import { StructuredLogger } from '@automation-os/shared-utils';

const logger = new StructuredLogger('APIGatewayServer');

async function bootstrap(): Promise<void> {
  try {
    const app = createGatewayApp();
    const port = config.PORT;

    const server = app.listen(port, () => {
      logger.info(`API Gateway is running on port ${port}`, {
        env: config.NODE_ENV,
        port,
      });
    });

    const shutdown = (): void => {
      logger.info('Received shutdown signal. Stopping API Gateway gracefully...');
      server.close(() => {
        logger.info('API Gateway stopped cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (err: unknown) {
    logger.error('Failed to start API Gateway', err as Error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
