import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { rimePaths } from './config.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 前端倒计时上限；服务端按排队中的请求数扣减各自的轮询窗口，不超时返回 504
export const MAX_DEPLOY_WAIT_MS = 40000;
const activeWaits = new Set();

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
 * 触发重载并等待 build/squirrel.yaml 或 build/default.yaml 更新
 * （每页候选数写在 default.custom.yaml，部署产物是 build/default.yaml）。
 * verify 是可选的校验函数，返回不匹配项数组；为空表示校验通过。
 * deadline 给前端倒计时用；多个请求并发时按排队数扣减轮询窗口，避免总时长超过上限。
 */
export async function deploy({
  rimeDir,
  verify = null,
  timeoutMs = 30000,
  totalBudgetMs = null,
  deadlineLabel = '',
} = {}) {
  const paths = rimePaths(rimeDir);
  const ticket = {};
  activeWaits.add(ticket);
  const budget =
    totalBudgetMs ??
    Math.max(1000, MAX_DEPLOY_WAIT_MS - (activeWaits.size - 1) * timeoutMs);
  try {
    return await waitForDeploy(paths, budget, timeoutMs, deadlineLabel, verify);
  } finally {
    activeWaits.delete(ticket);
  }
}

async function waitForDeploy(
  paths,
  totalBudgetMs,
  timeoutMs,
  deadlineLabel,
  verify,
) {
  const startedAt = Date.now();
  const deadlineMs = startedAt + totalBudgetMs;
  const reportedDeadline = deadlineMs + (deadlineLabel ? timeoutMs : 0);
  const watch = [paths.buildPath, paths.defaultBuildPath];
  const before = watch.map(buildMtime);

  await runReload(paths.squirrelBin);

  let lastMismatches = null;
  let sawUpdate = false;

  while (Date.now() < deadlineMs) {
    await sleep(250);
    const now = watch.map(buildMtime);
    if (now.some((mtime, index) => mtime > before[index])) {
      sawUpdate = true;
      if (verify) {
        lastMismatches = verify();
        if (!lastMismatches || lastMismatches.length === 0) {
          return {
            deployed: true,
            verified: true,
            waitedMs: Date.now() - startedAt,
            buildMtime: now,
            deadline: reportedDeadline,
          };
        }
      } else {
        return {
          deployed: true,
          verified: false,
          waitedMs: Date.now() - startedAt,
          buildMtime: now,
          deadline: reportedDeadline,
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
    deadline: reportedDeadline,
  };
}
