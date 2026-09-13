import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.CHEFMIND_DB_PATH ?? './data/chefmind.db' },
  strict: true,
  verbose: true,
});
