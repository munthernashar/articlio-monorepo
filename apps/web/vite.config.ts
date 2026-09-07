import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Fix (07.09.2026): apps/web/src/lib/app-version.ts referenziert __APP_VERSION__ /
// __APP_GIT_SHA__ (verwendet in AdminSettingsPage.tsx), die hier bislang nicht per
// `define` gesetzt wurden -- Rollup konnte die Bezeichner beim Produktions-Build nicht
// auflösen ("__APP_VERSION__ is not defined"). Ebenso fehlte der vitest-`test`-Block,
// wodurch `pnpm test` in diesem Package gar nicht lauffähig war. Beides 1:1 aus der
// Ursprungs-App (Articlio-Repo, vite.config.ts) übernommen, von der apps/web laut
// MIGRATION.md kopiert wurde.
const testEnvDefaults = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  VITE_SUPABASE_SESSION_AUDIO_BUCKET: 'session-audio',
  VITE_APP_ENV: 'test',
  VITE_OPENAI_PROXY_PATH: '/functions/v1/openai-chat-proxy',
  VITE_ROLE_LOOKUP_TIMEOUT_MS: '12000',
} as const;

for (const [key, value] of Object.entries(testEnvDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

function resolveAppVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version?: string };
    return packageJson.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function resolveGitSha(): string {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA;
  }

  try {
    return execSync('git rev-parse HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(resolveAppVersion()),
    __APP_GIT_SHA__: JSON.stringify(resolveGitSha()),
  },
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@articlio/api': path.resolve(__dirname, '../../packages/api/src/index.ts'),
      '@articlio/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@articlio/utils': path.resolve(__dirname, '../../packages/utils/src/index.ts'),
      '@articlio/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
});
