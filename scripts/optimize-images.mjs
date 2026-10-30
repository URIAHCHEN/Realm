#!/usr/bin/env node
// 图片瘦身：原始高清 PNG → 多档 WebP（零 npm 依赖，用系统的 sips + cwebp）
//
// 用法：
//   node scripts/optimize-images.mjs <输入目录> <输出目录> [--sizes 128,256,512] [--q 82]
// 例：
//   node scripts/optimize-images.mjs ~/Desktop/pet-raw src/assets/pets
//
// 输出命名：{原文件名}-{尺寸}.webp，例如 moss-s0-256.webp
// 说明：保留透明通道（-alpha_q 100）；已存在且比源文件新的会跳过。

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));
const flag = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`)) || (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
  return hit ? String(hit).replace(`--${name}=`, '') : fallback;
};

const srcDir = positional[0];
const outDir = positional[1];
if (!srcDir || !outDir) {
  console.error('用法：node scripts/optimize-images.mjs <输入目录> <输出目录> [--sizes 128,256,512] [--q 82]');
  process.exit(1);
}

const sizes = String(flag('sizes', '128,256')).split(',').map(n => Number(n.trim())).filter(Boolean);
const quality = String(flag('q', '82'));
const EXTS = new Set(['.png', '.jpg', '.jpeg']);

mkdirSync(resolve(outDir), { recursive: true });

let rows = [];
const files = readdirSync(resolve(srcDir)).filter(f => EXTS.has(extname(f).toLowerCase()));

for (const file of files) {
  const src = resolve(join(srcDir, file));
  const base = basename(file, extname(file));
  const srcSize = statSync(src).size;

  for (const size of sizes) {
    const out = resolve(join(outDir, `${base}-${size}.webp`));
    try {
      if (statSync(out).mtimeMs >= statSync(src).mtimeMs && statSync(out).size > 0) {
        rows.push({ file: `${base}-${size}.webp`, before: srcSize, after: statSync(out).size, skipped: true });
        continue;
      }
    } catch { /* 输出不存在，继续 */ }

    const tmpPng = join(tmpdir(), `opt-${base}-${size}.png`);
    // sips 缩放（-Z 是按最长边等比缩放，保留 alpha）
    execFileSync('sips', ['-Z', String(size), src, '--out', tmpPng], { stdio: 'ignore' });
    // cwebp 转 WebP
    execFileSync('cwebp', ['-quiet', '-q', quality, '-alpha_q', '100', tmpPng, '-o', out], { stdio: 'ignore' });

    rows.push({ file: `${base}-${size}.webp`, before: srcSize, after: statSync(out).size, skipped: false });
  }
}

const kb = n => `${(n / 1024).toFixed(1)} KB`;
const mb = n => `${(n / 1048576).toFixed(2)} MB`;
console.log(`\n源目录：${resolve(srcDir)}  →  ${resolve(outDir)}`);
console.log(`尺寸：${sizes.join(' / ')} ｜ 质量：${quality}\n`);
for (const row of rows) {
  const ratio = row.before ? `${(100 - (row.after / row.before) * 100).toFixed(1)}% ↓` : '-';
  console.log(`  ${row.file.padEnd(28)} ${kb(row.after).padStart(9)}  (源 ${mb(row.before)}, ${ratio}${row.skipped ? ', 已跳过' : ''})`);
}

const totalIn = rows.reduce((s, r) => s + r.before, 0);
const totalOut = rows.reduce((s, r) => s + r.after, 0);
console.log(`\n合计 ${rows.length} 个文件：${mb(totalIn)} → ${mb(totalOut)}（省 ${(100 - (totalOut / totalIn) * 100).toFixed(1)}%）\n`);
