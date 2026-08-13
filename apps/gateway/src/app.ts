import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { generateId, StructuredLogger, AppError } from '@automation-os/shared-utils';
import { config } from '@automation-os/config';
import jwt from 'jsonwebtoken';

const logger = new StructuredLogger('APIGateway');

// Extend Request type
export interface GatewayRequest extends Request {
  requestId?: string;
  clientIp?: string;
  userContext?: {
    userId: string;
    email: string;
    workspaces: string[];
  };
}

export function createGatewayApp(): express.Application {
  const app = express();
  app.use(express.json());

  // In-Memory Rate Limiter Map (IP -> timestamps)
  const rateLimitMap = new Map<string, number[]>();
  const LIMIT_WINDOW_MS = 60000; // 1 minute
  const MAX_REQUESTS = 100;

  // 1. Request ID and Logging Middleware
  app.use((req: GatewayRequest, res: Response, next: NextFunction) => {
    const rId = (req.headers['x-request-id'] as string) || generateId('req');
    req.requestId = rId;
    res.setHeader('x-request-id', rId);

    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    req.clientIp = ip;

    logger.info(`Gateway received: ${req.method} ${req.url} from ${ip}`, {
      requestId: rId,
      method: req.method || '',
      url: req.url || '',
    });

    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`Gateway responding: ${req.method} ${req.url} -> ${res.statusCode}`, {
        requestId: rId,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    next();
  });

  // 2. CORS Headers Middleware
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id');
    res.setHeader('Access-Control-Expose-Headers', 'x-request-id');
    next();
  });

  // 3. Security Headers Middleware
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    next();
  });

  // 4. Rate Limiting Middleware
  app.use((req: GatewayRequest, res: Response, next: NextFunction) => {
    const ip = req.clientIp || 'unknown';
    const now = Date.now();

    let timestamps = rateLimitMap.get(ip) || [];
    // Filter timestamps within the 1 minute window
    timestamps = timestamps.filter((t) => now - t < LIMIT_WINDOW_MS);

    if (timestamps.length >= MAX_REQUESTS) {
      logger.warn(`Rate limit exceeded for IP: ${ip}`, { requestId: req.requestId || 'unknown' });
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      });
      return;
    }

    timestamps.push(now);
    rateLimitMap.set(ip, timestamps);
    next();
  });

  // Handle CORS Pre-flight Options globally
  app.options('*', (_req: Request, res: Response) => {
    res.sendStatus(204);
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', service: 'api-gateway' });
  });

  // Downstream target resolution URLs
  const authServiceUrl = `http://localhost:${config.AUTH_SERVICE_PORT}`;
  const automationServiceUrl = `http://localhost:${config.AUTOMATION_SERVICE_PORT}`;

  // Helper function to proxy requests cleanly
  async function proxyRequest(req: GatewayRequest, res: Response, targetBaseUrl: string, destPath: string) {
    const destUrl = new URL(destPath, targetBaseUrl).toString();
    const requestId = req.requestId || '';

    try {
      const headersToSend: Record<string, string> = {
        'content-type': 'application/json',
        'x-request-id': requestId,
      };

      if (req.headers.authorization) {
        headersToSend['authorization'] = req.headers.authorization;
      }

      // Check if there is userContext from pre-validated gateway JWT check
      if (req.userContext) {
        headersToSend['x-user-context'] = JSON.stringify(req.userContext);
      }

      const resStream = await fetch(destUrl, {
        method: req.method,
        headers: headersToSend,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      });

      res.status(resStream.status);
      resStream.headers.forEach((val, key) => {
        if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
          res.setHeader(key, val);
        }
      });

      const bodyText = await resStream.text();
      res.send(bodyText);
    } catch (err: unknown) {
      logger.error(`Failed to proxy to target: ${destUrl}`, err as Error, { requestId });
      res.status(502).json({
        error: 'BAD_GATEWAY',
        message: 'Could not communicate with the downstream service.',
      });
    }
  }

  // Gateway JWT Validation and Ingress context parser
  const validateGatewayToken = (req: GatewayRequest, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Pass down so services can handle unauthenticated requests or we reject
    }

    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
      if (decoded.userId && decoded.email && Array.isArray(decoded.workspaces)) {
        req.userContext = {
          userId: decoded.userId,
          email: decoded.email,
          workspaces: decoded.workspaces,
        };
      }
    } catch (_err) {
      // Ignored: downstream services will reject if route requires strict auth
    }
    next();
  };

  // Route Registry and Proxy Routing Rules
  // /api/auth/* proxy rule -> Auth Service
  app.all('/api/auth/*', validateGatewayToken, (async (req: GatewayRequest, res: Response) => {
    await proxyRequest(req, res, authServiceUrl, req.url);
  }) as RequestHandler);

  // /api/workflows/* proxy rule -> Automation Service
  app.all('/api/workflows*', validateGatewayToken, (async (req: GatewayRequest, res: Response) => {
    await proxyRequest(req, res, automationServiceUrl, req.url);
  }) as RequestHandler);

  // /api/executions/* proxy rule -> Automation Service
  app.all('/api/executions*', validateGatewayToken, (async (req: GatewayRequest, res: Response) => {
    await proxyRequest(req, res, automationServiceUrl, req.url);
  }) as RequestHandler);

  // /api/schedules/* proxy rule -> Automation Service
  app.all('/api/schedules*', validateGatewayToken, (async (req: GatewayRequest, res: Response) => {
    await proxyRequest(req, res, automationServiceUrl, req.url);
  }) as RequestHandler);

  // /api/adapters/* proxy rule -> Automation Service
  app.all('/api/adapters*', validateGatewayToken, (async (req: GatewayRequest, res: Response) => {
    await proxyRequest(req, res, automationServiceUrl, req.url);
  }) as RequestHandler);

  // /api/policies/* proxy rule -> Automation Service
  app.all('/api/policies*', validateGatewayToken, (async (req: GatewayRequest, res: Response) => {
    await proxyRequest(req, res, automationServiceUrl, req.url);
  }) as RequestHandler);

  // Catch-all 404 for unmatched gateway requests
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'GATEWAY_ROUTE_NOT_FOUND',
      message: 'The requested route does not exist on the API Gateway.',
    });
  });

  // Global Gateway Error Normalization
  app.use((err: Error, req: GatewayRequest, res: Response, _next: NextFunction) => {
    logger.error(`Gateway Exception caught`, err, { requestId: req.requestId || 'unknown' });

    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message,
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_GATEWAY_ERROR',
      message: 'An unexpected error occurred inside the gateway router.',
    });
  });

  return app;
}
