import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'prisma/config';

loadEnvConfig(process.cwd());

export default defineConfig({
  datasource: {
    // Client generation during installation does not require a database.
    url: process.env.DATABASE_URL ?? '',
  },
  schema: 'prisma/schema.prisma',
});
