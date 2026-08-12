import { test } from 'node:test';
import assert from 'node:assert';
import { loadConfig } from '../src/index.js';

test('loadConfig maps environments with proper default values', () => {
  const result = loadConfig({});

  assert.strictEqual(result.PORT, 3000);
  assert.strictEqual(result.USE_MOCK_ADAPTER, false);
});

test('loadConfig maps custom environment override variables correctly', () => {
  const custom = {
    PORT: '8080',
    USE_MOCK_ADAPTER: 'true',
    SQLITE_DB_PATH: '/custom/path/db.sqlite'
  };

  const result = loadConfig(custom);

  assert.strictEqual(result.PORT, 8080);
  assert.strictEqual(result.USE_MOCK_ADAPTER, true);
  assert.strictEqual(result.SQLITE_DB_PATH, '/custom/path/db.sqlite');
});
