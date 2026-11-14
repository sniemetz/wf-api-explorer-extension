import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

test('manifest has unlimitedStorage for the multi-version cache', () => {
  assert.deepEqual([...m.permissions].sort(), ['alarms', 'storage', 'unlimitedStorage']);
});

test('host_permissions stay narrow (v1)', () => {
  assert.deepEqual(m.host_permissions, [
    'https://api-cl01.my.workfront.com/*',
    'https://developersupport.workfront.com/*',
  ]);
});
