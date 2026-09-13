// eslint-config-next 16 ships native flat configs. Going through FlatCompat
// instead throws "Converting circular structure to JSON" on its plugin graph.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // The domain layer is pure and isomorphic: it runs in the browser (instant
    // portion scaling with no round-trip), on the server, and inside MCP tool
    // handlers. Any I/O import here would break at least one of those.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['next/*', 'next', 'server-only', 'node:*', 'fs', 'path', '@/db/*', '@/services/*'],
            message: 'src/domain must stay pure and isomorphic — no I/O, no framework, no database.' },
        ],
      }],
    },
  },
  {
    // Services own all database access, but must not know they are inside Next —
    // that is what keeps the MCP server mountable anywhere.
    files: ['src/services/**/*.ts', 'src/mcp/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['next/*', 'next'],
            message: 'Services and MCP tools must not import next/* — cache invalidation belongs in the adapter (app/).' },
        ],
      }],
    },
  },
  {
    // Client components must never reach the database or the service layer
    // directly — they go through server actions in src/app/actions.ts. This
    // replaces the `server-only` package, which throws under plain Node and
    // would break the CLI scripts that share the same services.
    files: ['src/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/db', '@/db/*', '@/services/*', 'better-sqlite3', 'drizzle-orm/*'],
            message: 'Client components must not touch the database — use a server action from @/app/actions.' },
        ],
      }],
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'data/**'] },
];

export default config;
