import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const probePath = path.join(here, '..', 'tools', 'fontprobe.swift');
const cache = new Map();
const pending = new Map();
const CACHE_LIMIT = 64;

let availability = null;

// 别的机器上可能没有 Swift 工具链或缺少探测脚本：
// 面板不能因此报错，而是返回 unavailable，由前端退回内置行高近似表。
function checkAvailability() {
  if (availability !== null) return availability;
  if (!fs.existsSync(probePath)) {
    availability = { ok: false, reason: '缺少字体探测脚本 tools/fontprobe.swift' };
    return availability;
  }
  try {
    // execFileSync 抛错即视为不可用
    execFile('swift', ['--version'], { timeout: 15000, maxBuffer: 64 * 1024 });
    availability = { ok: true };
  } catch {
    availability = {
      ok: false,
      reason: '本机没有 Swift 工具链（需安装 Xcode 命令行工具，或使用内置近似预览）',
    };
  }
  return availability;
}

function runProbe(face) {
  return new Promise((resolve, reject) => {
    execFile(
      'swift',
      [probePath, face],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || '').trim() || error.message));
          return;
        }
        try {
          resolve(JSON.parse(String(stdout).trim()));
        } catch {
          reject(new Error('字体探测输出无法解析'));
        }
      },
    );
  });
}

export async function resolveFontFace(input) {
  const face = String(input ?? '').trim();
  if (!face) throw new Error('缺少字体名称');
  if (face.length > 120 || /[\r\n]/.test(face)) throw new Error('字体名称不合法');
  if (cache.has(face)) return cache.get(face);
  if (pending.has(face)) return pending.get(face);

  const avail = checkAvailability();
  if (!avail.ok) {
    const result = { unavailable: true, reason: avail.reason };
    cache.set(face, result);
    return result;
  }

  const job = runProbe(face)
    .then((result) => {
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(face, result);
      return result;
    })
    .finally(() => pending.delete(face));

  pending.set(face, job);
  return job;
}
