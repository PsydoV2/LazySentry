import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectDirectDependencyNames } from './direct-deps.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'direct-deps-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeJson(relPath: string, content: unknown): Promise<void> {
  const full = path.join(dir, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(content));
}

describe('collectDirectDependencyNames', () => {
  it('collects dependencies and devDependencies from package.json', async () => {
    await writeJson('package.json', {
      dependencies: { fastify: '^4.0.0' },
      devDependencies: { vitest: '^1.0.0' },
    });
    const result = await collectDirectDependencyNames(dir);
    expect(result.get('npm')).toEqual(new Set(['fastify', 'vitest']));
  });

  it('unions manifests across a workspace instead of only reading the root one', async () => {
    await writeJson('package.json', { devDependencies: { typescript: '^5.0.0' } });
    await writeJson('apps/api/package.json', { dependencies: { fastify: '^4.0.0' } });
    await writeJson('apps/web/package.json', { dependencies: { react: '^18.0.0' } });
    const result = await collectDirectDependencyNames(dir);
    expect(result.get('npm')).toEqual(new Set(['typescript', 'fastify', 'react']));
  });

  it('collects require and require-dev from composer.json', async () => {
    await writeJson('composer.json', {
      require: { 'symfony/console': '^6.0' },
      'require-dev': { 'phpunit/phpunit': '^10.0' },
    });
    const result = await collectDirectDependencyNames(dir);
    expect(result.get('Packagist')).toEqual(new Set(['symfony/console', 'phpunit/phpunit']));
  });

  it('ignores node_modules and vendor so committed/vendored packages are not counted', async () => {
    await writeJson('package.json', { dependencies: { fastify: '^4.0.0' } });
    await writeJson('node_modules/left-pad/package.json', { dependencies: { irrelevant: '1.0.0' } });
    await writeJson('vendor/foo/composer.json', { require: { irrelevant: '1.0.0' } });
    const result = await collectDirectDependencyNames(dir);
    expect(result.get('npm')).toEqual(new Set(['fastify']));
    expect(result.has('Packagist')).toBe(false);
  });

  it('leaves an ecosystem out entirely when no manifest of that kind exists', async () => {
    await writeJson('go.mod', {}); // irrelevant file, no package.json/composer.json anywhere
    const result = await collectDirectDependencyNames(dir);
    expect(result.size).toBe(0);
  });

  it('skips a malformed manifest instead of throwing', async () => {
    const full = path.join(dir, 'package.json');
    await writeFile(full, '{ not valid json');
    const result = await collectDirectDependencyNames(dir);
    expect(result.has('npm')).toBe(false);
  });
});
