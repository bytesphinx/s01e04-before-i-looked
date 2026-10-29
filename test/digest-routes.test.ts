import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

const good = [
  line('2026-10-28T02:00:00+01:00', 'zeta/cleanup', 'ok', 'ana'),
  line('2026-10-28T02:05:00+01:00', 'alpha/sync', 'retry', null),
  line('2026-10-28T02:06:00+01:00', 'alpha/sync', 'retry', null),
  line('2026-10-28T02:07:00+01:00', 'alpha/sync', 'retry', null),
  line('2026-10-28T02:08:00+01:00', 'alpha/sync', 'ok', null),
  line('2026-10-28T02:10:00+01:00', 'mid/build', 'fail', 'bo', 'disk full'),
];

beforeAll(() => {
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), good.join('\n') + '\n');
  writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
  writeFileSync(join(runsDir, '2026-10-26.jsonl'), good.join('\n') + '\n{"at":"2026-10-26T03:00:00+01:0');
});

const app = () => createApp(config);

describe('GET /digest/:night', () => {
  it('404 for a night with no file', async () => {
    expect((await app().request('/digest/2026-01-01')).status).toBe(404);
  });

  it('200 with every job, warn rows and — for nulls', async () => {
    const res = await app().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['alpha/sync', 'mid/build', 'zeta/cleanup']) expect(html).toContain(job);
    expect(html.match(/<tr[^>]*class="warn"/g)).toHaveLength(2);
    expect(html).toContain('—');
    expect(html).toContain('disk full');
  });

  it('empty night says nothing ran', async () => {
    const res = await app().request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('bad line still renders good rows and reports it', async () => {
    const res = await app().request('/digest/2026-10-26');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/sync');
    expect(html).toContain("1 line(s) didn't parse");
  });
});

describe('GET /api/digest/:night', () => {
  it('404 JSON for a missing night', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: '2026-01-01' });
  });

  it('200 with the Night object, sorted, nulls as null', async () => {
    const res = await app().request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: '2026-10-28',
      rows: [
        { job: 'alpha/sync', owner: null, runs: 4, retries: 3, fails: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T02:05:00+01:00', lastAt: '2026-10-28T02:08:00+01:00' },
        { job: 'mid/build', owner: 'bo', runs: 1, retries: 0, fails: 1, lastStatus: 'fail', lastError: 'disk full',
          firstAt: '2026-10-28T02:10:00+01:00', lastAt: '2026-10-28T02:10:00+01:00' },
        { job: 'zeta/cleanup', owner: 'ana', runs: 1, retries: 0, fails: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T02:00:00+01:00', lastAt: '2026-10-28T02:00:00+01:00' },
      ],
      badLines: 0,
      counts: { ok: 2, retry: 3, fail: 1 },
    });
  });

  it('empty night has no rows and no bad lines', async () => {
    const body = (await (await app().request('/api/digest/2026-10-27')).json()) as Night;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('bad line counts 1 and keeps the good rows', async () => {
    const body = (await (await app().request('/api/digest/2026-10-26')).json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/sync', 'mid/build', 'zeta/cleanup']);
  });
});

describe('page and JSON agree', () => {
  it('job names appear in the same order', async () => {
    const html = await (await app().request('/digest/2026-10-28')).text();
    const json = (await (await app().request('/api/digest/2026-10-28')).json()) as Night;
    const jobs = json.rows.map((r) => r.job);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
