import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable CORS for all origins
  app.enableCors({
    origin: true, // Allow all origins
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: false, // Throws error on unknown properties if true
      transform: true, // Auto-transform payloads to DTO types
    }),
  );

  // Serve static files for local storage
  const uploadsPath = process.env.LOCAL_STORAGE_PATH || './uploads';
  app.useStaticAssets(join(process.cwd(), uploadsPath), {
    prefix: '/uploads/',
  });

  // Increase payload limits for file uploads (base64 images)
  app.use(express.json({ limit: '60mb' }));
  app.use(express.urlencoded({ limit: '60mb', extended: true }));

  const port = process.env.PORT!;
  await app.listen(port, '0.0.0.0'); // Listen on all interfaces

  console.log(`🚀 Server running on port ${port}`);
  console.log(`📁 Serving uploads from: ${uploadsPath}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
}
bootstrap();