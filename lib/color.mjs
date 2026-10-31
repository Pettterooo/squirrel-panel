// 鼠须管颜色工具
// Squirrel 颜色格式：0xBBGGRR 或 0xAABBGGRR（BGR 顺序，alpha 省略时视为不透明）

const HEX_RE = /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

function clampByte(n, label) {
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw new Error(`${label} 必须是 0-255 的整数`);
  }
  return n;
}

function hex2(n) {
  return clampByte(n, '颜色通道').toString(16).padStart(2, '0').toUpperCase();
}

export function parseRimeColor(input) {
  let text;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0 || input > 0xffffffff) {
      throw new Error(`无法识别的颜色值: ${input}`);
    }
    text = input.toString(16).padStart(6, '0');
  } else {
    text = String(input ?? '').trim();
    if (/^#/.test(text)) text = text.slice(1);
    if (/^0x/i.test(text)) text = text.slice(2);
  }
  if (!HEX_RE.test(text)) {
    throw new Error(`无法识别的颜色值: ${input}（应为 0xBBGGRR 或 0xAABBGGRR）`);
  }
  let alpha = 255;
  let body = text;
  if (text.length === 8) {
    alpha = parseInt(text.slice(0, 2), 16);
    body = text.slice(2);
  }
  const b = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const r = parseInt(body.slice(4, 6), 16);
  return { r, g, b, a: alpha };
}

export function toRimeColor({ r, g, b, a = 255 }) {
  const body = `${hex2(b)}${hex2(g)}${hex2(r)}`;
  return a === 255 ? `0x${body}` : `0x${hex2(a)}${body}`;
}

export function colorToCss({ r, g, b, a = 255 }) {
  if (a === 255) {
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }
  const alpha = Math.round((a / 255) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function cssHexToRgb(hex) {
  const text = String(hex ?? '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(text)) {
    throw new Error(`无法识别的十六进制颜色: ${hex}`);
  }
  return {
    r: parseInt(text.slice(0, 2), 16),
    g: parseInt(text.slice(2, 4), 16),
    b: parseInt(text.slice(4, 6), 16),
  };
}

export function colorModel(input) {
  const rgba = typeof input === 'object' && input !== null && 'r' in input
    ? input
    : parseRimeColor(input);
  const { r, g, b, a = 255 } = rgba;
  return {
    r,
    g,
    b,
    a,
    hex: colorToCss({ r, g, b, a: 255 }),
    css: colorToCss({ r, g, b, a }),
    rime: toRimeColor({ r, g, b, a }),
  };
}

export function colorsEqual(a, b) {
  if (!a || !b) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
