import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法: node scripts/create-release.mjs <语义化版本号，例如 1.0.0>');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const licensePath = resolve(root, 'LICENSE.md');
const license = readFileSync(licensePath, 'utf8');
const releaseDir = resolve(root, 'releases');
const archivePath = resolve(releaseDir, `training-management-system-v${version}.zip`);

if (/【待确认|【待填写/.test(license)) {
  console.error('LICENSE.md 尚有待确认项。请先定稿著作权人、联系方式、售后与交付条款，再创建发货包。');
  process.exit(1);
}

const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
if (status.trim()) {
  console.error('工作区存在未提交修改。请确认、测试并提交后再创建发货包，避免交付版本无法追溯。');
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
if (existsSync(archivePath)) rmSync(archivePath);

execFileSync(
  'git',
  ['archive', '--format=zip', `--prefix=training-management-system-v${version}/`, 'HEAD', '-o', archivePath],
  { cwd: root, stdio: 'inherit' },
);

console.log(`发货包已创建：${archivePath}`);
