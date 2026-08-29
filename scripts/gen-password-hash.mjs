#!/usr/bin/env node
// 生成 seed.sql 用的密码哈希（PBKDF2-SHA256，与 src/util/password.ts 格式一致）
// 用法：node scripts/gen-password-hash.mjs <密码>
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('用法：node scripts/gen-password-hash.mjs <密码>');
  process.exit(1);
}
const iterations = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
console.log(`pbkdf2$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`);
