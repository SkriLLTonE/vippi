import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { requestIdMiddleware } from './common/request-context.js';
import { APP_CONFIG, type AppConfig } from './config/env.js';

/** Shared by main.ts and integration tests so both run the same HTTP pipeline. */
export function configureApp(app: NestExpressApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(app.get(Logger));
  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'api/health', method: RequestMethod.GET },
      { path: 'api/health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  if (config.SWAGGER_ENABLED) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Vippi Leads API')
        .setVersion('0.1.0')
        .addCookieAuth('vippi_sid')
        .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'api-key')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }
  return config;
}
