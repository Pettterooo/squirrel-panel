import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRimeColor,
  toRimeColor,
  colorToCss,
  cssHexToRgb,
  colorModel,
} from '../lib/color.mjs';

test('解析 6 位 BGR 颜色为不透明', () => {
  const color = parseRimeColor('0xFFFFFF');
  assert.deepEqual(color, { r: 255, g: 255, b: 255, a: 255 });
});

test('按 BGR 顺序解析，0xA94452 是紫蓝色', () => {
  const color = parseRimeColor('0xA94452');
  assert.equal(color.r, 0x52);
  assert.equal(color.g, 0x44);
  assert.equal(color.b, 0xa9);
  assert.equal(color.a, 255);
});

test('解析 8 位颜色时第一位是 alpha', () => {
  const color = parseRimeColor('0xCC112233');
  assert.deepEqual(color, { r: 0x33, g: 0x22, b: 0x11, a: 0xcc });
});

test('写入 6 位颜色保持 BGR 顺序', () => {
  assert.equal(toRimeColor({ r: 0x52, g: 0x44, b: 0xa9 }), '0xA94452');
  assert.equal(toRimeColor({ r: 255, g: 255, b: 255 }), '0xFFFFFF');
});

test('写入带透明度时生成 8 位颜色', () => {
  assert.equal(toRimeColor({ r: 0, g: 0, b: 0, a: 0 }), '0x00000000');
  assert.equal(toRimeColor({ r: 0, g: 0, b: 0, a: 128 }), '0x80000000');
});

test('CSS 输出使用真实 RGB 通道', () => {
  assert.equal(colorToCss({ r: 0x52, g: 0x44, b: 0xa9, a: 255 }), '#5244A9');
  assert.equal(colorToCss({ r: 0, g: 0, b: 0, a: 128 }), 'rgba(0, 0, 0, 0.502)');
});

test('十六进制界面颜色转 RGB', () => {
  assert.deepEqual(cssHexToRgb('#5244A9'), { r: 0x52, g: 0x44, b: 0xa9 });
  assert.throws(() => cssHexToRgb('#12345'));
});

test('colorModel 同时提供界面与配置格式', () => {
  const model = colorModel('0xA94452');
  assert.equal(model.hex, '#5244A9');
  assert.equal(model.rime, '0xA94452');
});
