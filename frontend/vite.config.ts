import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(currentDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };

function resolveGitVersion(): string {
  try {
    return execSync('git describe --tags --always --dirty', {
      cwd: resolve(currentDir, '..'),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const appVersion = process.env.VITE_APP_VERSION || packageJson.version || resolveGitVersion() || '0.0.0-dev';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 32000,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
