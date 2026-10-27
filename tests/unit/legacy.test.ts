import { afterAll, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	attended,
	jsonValue,
	legacyTimestamp,
	normalizeTime
} from '../../scripts/legacy/normalize.ts';
import { makeFakeDb } from '../../scripts/legacy/make-fake-db.ts';
import { readLegacy, prepareImport } from '../../scripts/legacy/data.ts';
import { seedData } from '../../scripts/seed.ts';

const directory = mkdtempSync(join(tmpdir(), 'baywatchers-unit-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
it.each([1, '1', true])('recognizes attended %s', (value) => expect(attended(value)).toBe(true));
it.each([0, '0', false, null, undefined, 2, 'true', ' 1'])('rejects attended %s', (value) =>
	expect(attended(value)).toBe(false)
);
it('normalizes times, JSON and Rome timestamps without evaluating Python', () => {
	expect(normalizeTime('9:00')).toBe('09:00');
	expect(() => normalizeTime('25:00')).toThrow();
	expect(jsonValue("{'title': 'x'}")).toEqual({ legacy: "{'title': 'x'}" });
	expect(jsonValue('{"title":"x"}')).toEqual({ title: 'x' });
	expect(jsonValue(null)).toBeNull();
	expect(legacyTimestamp('2026-01-10 11:00:00.123456')).toBe('2026-01-10T10:00:00.123456Z');
	expect(legacyTimestamp('2026-07-10 11:00:00')).toBe('2026-07-10T09:00:00.000000Z');
	expect(legacyTimestamp('2026-10-25 02:30:00')).toBe('2026-10-25T00:30:00.000000Z');
	expect(legacyTimestamp('2026-03-29 02:30:00')).toBe('2026-03-29T01:30:00.000000Z');
	expect(() => legacyTimestamp('bad date')).toThrow();
});
it('generates deterministic faithful SQLite fixtures and refuses overwrites', () => {
	const first = join(directory, 'first.db'),
		second = join(directory, 'second.db');
	makeFakeDb(first);
	makeFakeDb(second);
	expect(readFileSync(first)).toEqual(readFileSync(second));
	expect(() => makeFakeDb(first)).toThrow('not empty');
	const db = new Database(first, { readonly: true });
	try {
		const rows = readLegacy(db),
			prepared = prepareImport(rows);
		expect(rows.users).toHaveLength(60);
		expect(rows.users.filter((r) => r.is_admin)).toHaveLength(3);
		expect(rows.action_logs).toHaveLength(500);
		expect(new Set(rows.action_logs.map((r) => r.action_type)).size).toBe(21);
		expect(rows.action_logs.some((row) => row.action_type === 'CLOSE_POOL')).toBe(false);
		expect(rows.baywatcher_whitelist).toHaveLength(40);
		for (let week = 1; week <= 4; week++) {
			const events = rows.events.filter((r) => r.week === week);
			expect(events.length).toBeGreaterThanOrEqual(12);
			expect(events.length).toBeLessThanOrEqual(18);
			expect(
				events.filter((r) => ['Sabato', 'Domenica'].includes(r.day)).length
			).toBeGreaterThanOrEqual(2);
		}
		expect(rows.events.filter((r) => r.event_date)).toHaveLength(12);
		expect(prepared.data.registrations).toHaveLength(360);
		expect(prepared.report.anomalies.filter((r) => r.table === 'registrations')).toHaveLength(2);
		expect(prepared.data.action_logs[0].actor_user_id).toBe(1);
		expect(
			db.prepare('SELECT typeof(attended) AS type FROM registrations WHERE id=2').get()
		).toEqual({ type: 'integer' });
	} finally {
		db.close();
	}
});
it('builds a direct seed with known roles and a pool containing today across Rome midnight', () => {
	const { data, settings } = seedData(42, new Date('2026-10-18T22:30:00Z'));
	expect(settings.pool_start).toBe('2026-10-19');
	expect(data.users.find((r) => r.login === 'dev_admin')?.role).toBe('admin');
	expect(data.users.find((r) => r.login === 'dev_user')?.role).toBe('user');
	expect(data.users.find((r) => r.login === 'dev_outsider')?.role).toBe('user');
	expect(data.whitelist.map((r) => r.login)).toEqual(
		expect.arrayContaining(['dev_admin', 'dev_user'])
	);
	expect(data.whitelist.some((r) => r.login === 'dev_outsider')).toBe(false);
});
