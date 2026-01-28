import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS configuration - environment-aware
  const isDevelopment = process.env.NODE_ENV === 'development';
  const productionOrigins = [
    'https://www.betterdev.in',
    'https://betterdev.in',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ];
  
  app.enableCors({
    origin: isDevelopment ? true : productionOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // Cache preflight for 24 hours
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );


  // Increase payload limits for file uploads (base64 images)
  app.use(express.json({ limit: '60mb' }));
  app.use(express.urlencoded({ limit: '60mb', extended: true }));

  // Static file serving
  const uploadsPath = process.env.LOCAL_STORAGE_PATH || './uploads';
  app.useStaticAssets(join(process.cwd(), uploadsPath), { prefix: '/uploads/' });

  const port = process.env.PORT!;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Server running on port ${port} (${process.env.NODE_ENV || 'development'})`);
}
bootstrap();