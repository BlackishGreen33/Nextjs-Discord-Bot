import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const loader = createRequire(import.meta.url).resolve('tsx');
const config = fileURLToPath(new URL('./prisma.config.ts', import.meta.url));
let fixture = '';

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'discord-prisma-env-'));
  for (const [file, url] of Object.entries({
    '.env.development.local': 'postgresql://dev.example/app',
    '.env.local': 'postgresql://local.example/app',
    '.env.production.local': 'postgresql://prod.example/app',
    '.env.test.local': 'postgresql://test.example/app',
  })) {
    writeFileSync(join(fixture, file), `DATABASE_URL=${url}\n`);
  }
});

afterEach(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

it.each([
  ['development', '', 'postgresql://dev.example/app'],
  ['production', '', 'postgresql://prod.example/app'],
  ['test', '', 'postgresql://test.example/app'],
  ['unset', '', 'postgresql://prod.example/app'],
  [
    'development',
    'postgresql://shell.example/app',
    'postgresql://shell.example/app',
  ],
  [
    'production',
    'postgresql://shell.example/app',
    'postgresql://shell.example/app',
  ],
  ['test', 'postgresql://shell.example/app', 'postgresql://shell.example/app'],
  ['unset', 'postgresql://shell.example/app', 'postgresql://shell.example/app'],
])('loads %s mode with shell URL %s', (mode, shellUrl, expected) => {
  const actual = execFileSync(
    process.execPath,
    [
      '--import',
      loader,
      '--eval',
      `const mode = ${JSON.stringify(mode)}; if (mode === 'unset') delete process.env.NODE_ENV; else process.env.NODE_ENV = mode; const config = require(${JSON.stringify(config)}).default; console.log(config.datasource.url);`,
    ],
    {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        NODE_ENV: 'test',
        ...(shellUrl ? { DATABASE_URL: shellUrl } : {}),
      },
      timeout: 15_000,
    }
  );

  expect(actual.trim()).toBe(expected);
});
