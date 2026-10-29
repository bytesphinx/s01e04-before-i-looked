import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;

  it('has 5 jobs and 1 bad line', () => {
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
  });

  it('counts runs and retries and keeps the last status', () => {
    const refresh = night.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toMatchObject({ runs: 4, retries: 3, fails: 0, lastStatus: 'ok', lastError: null });
    expect(refresh.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(refresh.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });

  it('keeps a failed job with its error', () => {
    const backup = night.rows.find((r) => r.job === 'notes/backup')!;
    expect(backup).toMatchObject({ runs: 1, fails: 1, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('keeps a row whose owner is null', () => {
    expect(night.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, runs: 1 });
  });

  it('counts lines per status', () => {
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight edges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(dir, '2026-01-01.jsonl'), '');
  writeFileSync(join(dir, '2026-01-02.jsonl'), 'not json\n{"at":"x","job":"a","status":"ok","owner":null}\n');

  it('returns null for a night with no file or a bad name', () => {
    expect(readNight(dir, '2026-01-03')).toBeNull();
    expect(readNight(dir, '../runs/2026-10-28')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts malformed lines instead of throwing', () => {
    expect(readNight(dir, '2026-01-02')).toMatchObject({ rows: [], badLines: 2 });
  });
});
