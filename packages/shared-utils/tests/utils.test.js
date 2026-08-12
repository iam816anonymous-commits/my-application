import { test } from 'node:test';
import assert from 'node:assert';
import { redactSecrets, redactKeys, generateId, AppError } from '../src/index.js';
test('AppError sets message, code, and status code correctly', () => {
    const error = new AppError('Database error occurred', 'DB_ERROR', 500);
    assert.strictEqual(error.message, 'Database error occurred');
    assert.strictEqual(error.code, 'DB_ERROR');
    assert.strictEqual(error.statusCode, 500);
});
test('redactSecrets replaces specified words in text with [REDACTED]', () => {
    const secrets = ['secretPass123', 'TokenABC_987'];
    const rawText = 'My credentials are password=secretPass123 and token=TokenABC_987.';
    const expectedText = 'My credentials are password=[REDACTED] and token=[REDACTED].';
    const result = redactSecrets(rawText, secrets);
    assert.strictEqual(result, expectedText);
});
test('redactKeys matches common json key-value secrets', () => {
    const rawText = '{"password":"mySuperPassword", "token": "sensitiveValue"}';
    const expectedText = '{"password":"[REDACTED]", "token": "[REDACTED]"}';
    const result = redactKeys(rawText);
    assert.strictEqual(result, expectedText);
});
test('generateId generates random unique prefix keys', () => {
    const key1 = generateId('test_usr');
    const key2 = generateId('test_usr');
    assert.match(key1, /^test_usr_[a-z0-9]{12}$/);
    assert.notStrictEqual(key1, key2);
});
//# sourceMappingURL=utils.test.js.map