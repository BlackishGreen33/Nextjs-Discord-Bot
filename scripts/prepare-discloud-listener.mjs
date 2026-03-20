import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const outputRoot = resolve(repoRoot, 'build', 'discloud-gateway-listener');
const zipPath = resolve(repoRoot, 'build', 'discloud-gateway-listener.zip');

const ensureDir = (path) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
};

const writeText = (path, content) => {
  ensureDir(dirname(path));
  writeFileSync(path, content, 'utf8');
};

const main = () => {
  rmSync(outputRoot, { force: true, recursive: true });
  rmSync(zipPath, { force: true });
  ensureDir(outputRoot);

  const listenerSource = readFileSync(
    resolve(repoRoot, 'worker', 'gateway-listener', 'index.mjs'),
    'utf8'
  );
  const attachmentSource = readFileSync(
    resolve(repoRoot, 'worker', 'gateway-listener', 'preview-attachments.mjs'),
    'utf8'
  );
  const uiTextSource = readFileSync(
    resolve(repoRoot, 'worker', 'gateway-listener', 'ui-text.mjs'),
    'utf8'
  ).replace("../../src/common/utils/ui-copy.json", './ui-copy.json');

  writeText(join(outputRoot, 'index.mjs'), listenerSource);
  writeText(join(outputRoot, 'preview-attachments.mjs'), attachmentSource);
  writeText(join(outputRoot, 'ui-text.mjs'), uiTextSource);
  cpSync(
    resolve(repoRoot, 'src', 'common', 'utils', 'ui-copy.json'),
    join(outputRoot, 'ui-copy.json')
  );

  writeText(
    join(outputRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'discord-gateway-listener-discloud',
        private: true,
        type: 'module',
        version: '1.0.0',
        description: 'Standalone Discloud deployment package for the Discord gateway listener',
        main: 'bootstrap.mjs',
        scripts: {
          start: 'node bootstrap.mjs',
        },
        dependencies: {
          'discord.js': '^14.25.1',
          dotenv: '^17.2.3',
        },
      },
      null,
      2
    )}\n`
  );

  writeText(
    join(outputRoot, 'bootstrap.mjs'),
    [
      "import 'dotenv/config';",
      "import './index.mjs';",
      '',
    ].join('\n')
  );

  writeText(
    join(outputRoot, 'discloud.config'),
    [
      'NAME=Life_is_BG Listener',
      'TYPE=bot',
      'MAIN=bootstrap.mjs',
      'RAM=200',
      'AUTORESTART=true',
      'VERSION=latest',
      'START=npm start',
      '',
    ].join('\n')
  );

  writeText(
    join(outputRoot, '.discloudignore'),
    [
      'node_modules',
      '.git',
      '.DS_Store',
      '.env.local',
      '',
    ].join('\n')
  );

  writeText(
    join(outputRoot, '.env.example'),
    [
      'BOT_TOKEN=',
      'DISCORD_GATEWAY_TOKEN=',
      'UPSTASH_REDIS_REST_URL=',
      'UPSTASH_REDIS_REST_TOKEN=',
      'REDIS_NAMESPACE=discord-bot',
      'MEDIA_WORKER_BASE_URL=',
      'MEDIA_WORKER_TOKEN=',
      'MEDIA_ALLOWED_DOMAINS=x.com,twitter.com,pixiv.net,www.pixiv.net,bsky.app',
      'GATEWAY_ATTACHMENT_MAX_BYTES=8388608',
      'GATEWAY_ATTACHMENT_MAX_ITEMS=4',
      'GATEWAY_ATTACHMENT_TIMEOUT_MS=10000',
      '',
    ].join('\n')
  );

  writeText(
    join(outputRoot, 'README.md'),
    [
      '# Discloud Gateway Listener Package',
      '',
      'This package is generated from the main repository listener source.',
      '',
      '## Deploy',
      '',
      '1. Copy `.env.example` to `.env` and fill in the required values.',
      '2. Upload this folder or the generated `discloud-gateway-listener.zip` via Discloud Dashboard, CLI, VS Code extension, or `.upconfig`.',
      '',
      '## Notes',
      '',
      '- `MAIN=bootstrap.mjs` is used so `.env` is loaded before the listener starts.',
      '- This package only includes the gateway listener and the UI copy JSON it needs.',
      '',
    ].join('\n')
  );

  execFileSync('zip', ['-qrX', zipPath, '.'], {
    cwd: outputRoot,
    stdio: 'inherit',
  });

  console.log(`Prepared ${outputRoot}`);
  console.log(`Created ${zipPath}`);
};

main();
