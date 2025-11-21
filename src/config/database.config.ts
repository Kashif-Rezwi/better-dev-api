import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => {
    // Production uses DATABASE_URL
    if (process.env.DATABASE_URL) {
      return {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        synchronize: false, // NEVER true in production! (can drop data)
        ssl: {
          rejectUnauthorized: true,
        },        
        logging: false,
      };
    }

    // Development uses individual variables
    return {
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT!, 10),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: true, // Auto-creates tables in dev
      logging: true,
    };
  },
);