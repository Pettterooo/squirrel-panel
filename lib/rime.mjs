import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { rimePaths } from './config.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildMtime(buildPath) {
  try {
    return fs.statSync(buildPath).mtimeMs;
  } catch {
    return 0;
  }
}

function runReload(bin) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(bin)) {
        reject(
          new Error(
            `找不到鼠须管程序：${bin}。请先安装鼠须管（Squirrel）输入法；配置仍可编辑，但无法自动重载生效。`,
          ),
        );
        return;
      }
      const child = spawn(bin, ['--reload'], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`鼠须管重载命令退出码 ${code}`));
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 触发重载并等待 build/squirrel.yaml 更新。
 * verify 是可选的校验函数，返回不匹配项数组；为空表示校验通过。
 */
export async function deploy({
  rimeDir,
  verify = null,
  timeoutMs = 20000,
} = {}) {
  const paths = rimePaths(rimeDir);
  const before = buildMtime(paths.buildPath);
  const startedAt = Date.now();

  await runReload(paths.squirrelBin);

  let lastMismatches = null;
  let sawUpdate = false;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(250);
    const now = buildMtime(paths.buildPath);
    if (now > before) {
      sawUpdate = true;
      if (verify) {
        lastMismatches = verify();
        if (!lastMismatches || lastMismatches.length === 0) {
          return {
            deployed: true,
            verified: true,
            waitedMs: Date.now() - startedAt,
            buildMtime: now,
          };
        }
      } else {
        return {
          deployed: true,
          verified: false,
          waitedMs: Date.now() - startedAt,
          buildMtime: now,
        };
      }
    }
  }

  return {
    deployed: sawUpdate,
    verified: false,
    waitedMs: Date.now() - startedAt,
    mismatches: lastMismatches || [],
    timeout: true,
  };
}
