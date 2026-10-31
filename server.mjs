import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  applyEdits,
  readModel,
  resolveRimeDir,
  rimePaths,
  undoLast,
  verifyValues,
} from './lib/config.mjs';
import { deploy } from './lib/rime.mjs';
import { resolveFontFace } from './lib/fonts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');
const rimeDir = resolveRimeDir();
const basePort = Number(process.env.PORT) || 47831;
const host = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function checkOrigin(req, port) {
  const hostHeader = String(req.headers.host || '');
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(hostHeader)) {
    throw Object.assign(new Error('仅允许本机访问'), { status: 403 });
  }
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);
  if (!allowed.has(origin)) {
    throw Object.assign(new Error('来源不被允许'), { status: 403 });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (rel.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const file = path.join(publicDir, rel);
  if (!file.startsWith(publicDir + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

function makeHandler(port) {
  return async (req, res) => {
    try {
      checkOrigin(req, port);
      const url = new URL(req.url || '/', `http://${host}:${port}`);

      if (url.pathname === '/api/config' && req.method === 'GET') {
        sendJson(res, 200, readModel(rimeDir));
        return;
      }

      if (url.pathname === '/api/font' && req.method === 'GET') {
        const name = url.searchParams.get('name') || '';
        try {
          const font = await resolveFontFace(name);
          sendJson(res, 200, font);
        } catch (error) {
          sendJson(res, 400, { error: error.message || '字体解析失败' });
        }
        return;
      }

      if (url.pathname === '/api/apply' && req.method === 'POST') {
        const body = await readBody(req);
        const result = applyEdits(rimeDir, body);
        if (!result.changed) {
          sendJson(res, 200, {
            ok: true,
            changed: false,
            message: '参数与当前配置一致，无需写入',
            deploy: null,
          });
          return;
        }
        const deployResult = await deploy({
          rimeDir,
          verify: () =>
            verifyValues(rimeDir, {
              schemeId: body.schemeId,
              sync: body.sync,
              values: body.values,
            }),
        });
        sendJson(res, 200, {
          ok: deployResult.verified,
          changed: true,
          backupPath: result.backupPath,
          deploy: deployResult,
          warning: deployResult.verified
            ? null
            : deployResult.deployed
              ? '配置已写入并重载，但部署校验未通过，请检查配置或查看鼠须管日志'
              : '配置已写入，但鼠须管未在超时时间内完成部署；可尝试手动重新部署',
        });
        return;
      }

      if (url.pathname === '/api/undo' && req.method === 'POST') {
        const result = undoLast(rimeDir);
        const deployResult = await deploy({ rimeDir });
        sendJson(res, 200, {
          ok: deployResult.deployed,
          ...result,
          deploy: deployResult,
          warning: deployResult.deployed
            ? null
            : '配置已恢复，但鼠须管未在超时时间内完成部署',
        });
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: '接口不存在' });
        return;
      }

      serveStatic(req, res);
    } catch (error) {
      const status = error.status || 500;
      sendJson(res, status, { error: error.message || '未知错误' });
    }
  };
}

function listenWithFallback(port, attemptsLeft = 10) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(makeHandler(port));
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' && attemptsLeft > 1) {
        listenWithFallback(port + 1, attemptsLeft - 1).then(resolve, reject);
      } else {
        reject(error);
      }
    });
    server.listen(port, host, () => resolve({ server, port }));
  });
}

const { server, port } = await listenWithFallback(basePort);
const url = `http://${host}:${port}`;
const paths = rimePaths(rimeDir);

console.log(`鼠须管外观面板已启动：${url}`);
console.log(`配置文件：${paths.customPath}`);
console.log('按 Ctrl+C 退出。');

if (!process.env.NO_OPEN) {
  const opener = spawn('open', [url], { stdio: 'ignore', detached: true });
  opener.unref();
}

function shutdown() {
  console.log('\n正在退出…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
