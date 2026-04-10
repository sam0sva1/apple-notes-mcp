import { describe, it, expect } from 'vitest';
import { redactSecrets, shouldIndex } from './contentFilter.js';

describe('redactSecrets', () => {
  it('returns normal text unchanged', () => {
    expect(redactSecrets('Hello world, this is a note.')).toBe('Hello world, this is a note.');
  });

  it('redacts sk- API keys', () => {
    expect(redactSecrets('my key is sk-abcdefghij1234567890xx')).toBe('my key is [REDACTED]');
  });

  it('redacts key- prefixed secrets', () => {
    expect(redactSecrets('key-ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe('[REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    expect(
      redactSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload'),
    ).toBe('Authorization: Bearer [REDACTED]');
  });

  it('redacts private keys', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpA...\n-----END RSA PRIVATE KEY-----';
    expect(redactSecrets(`Before ${pem} After`)).toBe('Before [REDACTED PRIVATE KEY] After');
  });

  it('redacts context-aware secrets', () => {
    expect(redactSecrets('api_key=abc123def456ghi789jkl')).toBe('[REDACTED]');
    expect(redactSecrets('password: mysuperpassword123')).toBe('[REDACTED]');
    expect(redactSecrets('token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9')).toBe('[REDACTED]');
  });

  it('does not redact short strings or normal text', () => {
    expect(redactSecrets('my password is ok')).toBe('my password is ok');
    expect(redactSecrets('The secret to success')).toBe('The secret to success');
  });

  it('handles multiple secrets in one text', () => {
    const text = 'Use sk-abcdefghijklmnopqrstuvw and Bearer tokenvalue123';
    const result = redactSecrets(text);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('sk-abc');
    expect(result).not.toContain('tokenvalue');
  });
});

describe('shouldIndex', () => {
  it('returns true for normal text', () => {
    expect(shouldIndex('This is a normal note with enough content to be indexed for search.')).toBe(
      true,
    );
  });

  it('returns false for text shorter than 50 chars', () => {
    expect(shouldIndex('Too short')).toBe(false);
    expect(shouldIndex('')).toBe(false);
  });

  it('returns false for text with null bytes', () => {
    expect(
      shouldIndex('Normal text \0 with null bytes in it and more text to pass length check'),
    ).toBe(false);
  });

  it('returns false for long base64-like runs without whitespace', () => {
    const base64 = 'a'.repeat(250);
    expect(shouldIndex(`Some text ${base64} more text padding to be long enough`)).toBe(false);
  });

  it('returns true for text with normal-length words', () => {
    expect(
      shouldIndex(
        'Normal sentences have spaces between words and never have extremely long unbroken runs of characters.',
      ),
    ).toBe(true);
  });

  it('returns true for 50 chars with spaces', () => {
    expect(shouldIndex('Normal words ' + 'word '.repeat(8))).toBe(true);
  });

  it('returns false for long unbroken run over 200 chars', () => {
    const longRun = 'x'.repeat(201);
    expect(shouldIndex(`text ${longRun} text`)).toBe(false);
  });
});
