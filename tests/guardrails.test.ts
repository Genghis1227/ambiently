import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { runNegativeSelfTests, validateGuardrails } from './validate-guardrails.js';

describe('Repository Contributor Guardrails (tests/validate-guardrails.js)', () => {
  it('passes all clean-repo secret, zero-cost API, version sync, PWA asset, branding, and SEO checks', () => {
    const result = validateGuardrails();
    assert.deepEqual(result.violations, []);
    assert.equal(result.ok, true);
  });

  it('catches all simulated in-memory violations via negative self-tests without touching disk', () => {
    const { passed } = runNegativeSelfTests();
    assert.ok(passed >= 15, `Expected at least 15 negative self-tests, ran ${passed}`);
  });
});

describe('Self-hosted X-Robots-Tag indexing hygiene (public/_headers parity)', () => {
  let tmpDist = '';
  let baseUrl = '';
  let closeServer: () => Promise<void>;

  before(async () => {
    tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), 'ambiently-robots-test-'));
    fs.mkdirSync(path.join(tmpDist, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(tmpDist, 'index.html'), '<!doctype html><html><body>Ambiently</body></html>');
    fs.writeFileSync(path.join(tmpDist, 'tests', 'sample.txt'), 'test artifact');
    fs.writeFileSync(path.join(tmpDist, 'README.md'), '# Internal Docs');

    process.env.AMBIENTLY_DIST_DIR = tmpDist;
    const { createAmbientlyServer } = await import('../server/index');
    const server = createAmbientlyServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
  });

  after(async () => {
    delete process.env.AMBIENTLY_DIST_DIR;
    if (closeServer) await closeServer();
    fs.rmSync(tmpDist, { recursive: true, force: true });
  });

  it('keeps the main app indexable while sending X-Robots-Tag: noindex, nofollow on /tests/* and internal docs', async () => {
    const appRes = await fetch(`${baseUrl}/`);
    assert.equal(appRes.status, 200);
    assert.equal(appRes.headers.get('x-robots-tag'), null);

    const testAssetRes = await fetch(`${baseUrl}/tests/sample.txt`);
    assert.equal(testAssetRes.status, 200);
    assert.equal(testAssetRes.headers.get('x-robots-tag'), 'noindex, nofollow');

    const readmeRes = await fetch(`${baseUrl}/README.md`);
    assert.equal(readmeRes.status, 200);
    assert.equal(readmeRes.headers.get('x-robots-tag'), 'noindex, nofollow');
  });
});
