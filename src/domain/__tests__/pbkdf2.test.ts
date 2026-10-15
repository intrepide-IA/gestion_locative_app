import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';

import { hmacSha256, pbkdf2Sha256, sha256 } from '../pbkdf2';

const octets = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

test.each(['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'Onílé — Gérer aujourd’hui'.repeat(20)])('SHA-256 conforme (%#)', (s) => {
  expect(hex(sha256(octets(s)))).toBe(createHash('sha256').update(s).digest('hex'));
});

test('HMAC-SHA256 conforme, y compris clé longue', () => {
  expect(hex(hmacSha256(octets('clé'), octets('message')))).toBe(createHmac('sha256', 'clé').update('message').digest('hex'));
  const longue = 'k'.repeat(100);
  expect(hex(hmacSha256(octets(longue), octets('x')))).toBe(createHmac('sha256', longue).update('x').digest('hex'));
});

test('PBKDF2-SHA256 conforme à Node', () => {
  expect(hex(pbkdf2Sha256(octets('mot de passe'), octets('sel-unique'), 1000, 32))).toBe(
    pbkdf2Sync('mot de passe', 'sel-unique', 1000, 32, 'sha256').toString('hex')
  );
  expect(hex(pbkdf2Sha256(octets('p'), octets('s'), 2, 40))).toBe(pbkdf2Sync('p', 's', 2, 40, 'sha256').toString('hex'));
});
