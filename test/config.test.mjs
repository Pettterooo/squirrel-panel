import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify, parse } from 'yaml';
import {
  applyEdits,
  readModel,
  undoLast,
  validateAppOptions,
  validatePageSize,
  validateValues,
  verifyPageSize,
  verifyValues,
} from '../lib/config.mjs';

const BASE_APP_OPTIONS = {
  'com.apple.Terminal': { ascii_mode: true, no_inline: true },
  'org.vim.MacVim': { ascii_mode: true, no_inline: true, vim_mode: true },
};

const CUSTOM = `# 测试注释：不要丢
patch:
  preset_color_schemes:
    wechat:
      name: "微信键盘 / WeChat-keyboard"
      back_color: 0xFFFFFF
      text_color: 0x424242
      hilited_candidate_back_color: 0xA94452
      hilited_candidate_text_color: 0xFFFFFF
      comment_text_color: 0x999999
      font_face: PingFangSC
      font_point: 14
      label_font_point: 10
      corner_radius: 5
      hilited_corner_radius: 5
      border_width: 8
      border_height: 0
      candidate_list_layout: linear
      inline_preedit: true
    wechat_dark:
      name: "微信键盘·暗黑 / WeChat-keyboard Dark"
      back_color: 0x1C1C1E
      text_color: 0xE8E8E8
      label_color: 0xAAAAAA
      hilited_candidate_back_color: 0xA94452
      hilited_candidate_text_color: 0xFFFFFF
      comment_text_color: 0x777777
      font_face: PingFangSC
      font_point: 14
      label_font_point: 10
      corner_radius: 5
  style:
    color_scheme: wechat
    color_scheme_dark: wechat_dark
    translucency: false
    candidate_list_layout: linear
    inline_preedit: true
    base_offset: -1.5
    spacing: 10
    line_spacing: 1
    shadow_size: 0
`;

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squirrel-panel-'));
  fs.writeFileSync(path.join(dir, 'squirrel.custom.yaml'), CUSTOM);
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  const parsed = parse(CUSTOM, { schema: 'failsafe' });
  const build = {
    __build_info: { rime_version: '1.16.0' },
    app_options: { ...BASE_APP_OPTIONS },
    ...parsed.patch,
  };
  fs.writeFileSync(path.join(dir, 'build', 'squirrel.yaml'), stringify(build));
  fs.writeFileSync(
    path.join(dir, 'build', 'default.yaml'),
    stringify({ menu: { page_size: 6 } }),
  );
  return dir;
}

function redeployDefault(dir, pageSize) {
  fs.writeFileSync(
    path.join(dir, 'build', 'default.yaml'),
    stringify({ menu: { page_size: pageSize } }),
  );
}

function lightValues(model) {
  const scheme = model.schemes.wechat;
  return {
    typography: { ...scheme.typography },
    layout: { ...scheme.layout },
    candidateFormat: scheme.candidateFormat,
    name: scheme.name,
    colors: Object.fromEntries(
      Object.entries(scheme.colors).map(([key, color]) => [
        key,
        color === null ? null : { hex: color.hex, alpha: color.a },
      ]),
    ),
  };
}

test('读取生效配置并解析两套配色', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  assert.equal(model.meta.roles.light, 'wechat');
  assert.equal(model.meta.roles.dark, 'wechat_dark');
  assert.equal(model.schemes.wechat.typography.font_point, 14);
  assert.equal(model.schemes.wechat.layout.spacing, 10);
  assert.equal(model.schemes.wechat.layout.base_offset, -1.5);
  assert.equal(model.schemes.wechat.colors.back_color.hex, '#FFFFFF');
  assert.equal(model.schemes.wechat_dark.colors.back_color.hex, '#1E1C1C');
  assert.equal(model.schemes.wechat.colors.hilited_candidate_back_color.hex, '#5244A9');
});

test('缺失颜色按鼠须管回退规则继承', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const light = model.schemes.wechat.colors;
  assert.equal(light.label_color.hex, '#424242');
  assert.equal(light.candidate_text_color.hex, '#424242');
  assert.equal(light.hilited_candidate_label_color.hex, '#FFFFFF');
});

test('candidate_format 按鼠须管占位符解析并带默认值', () => {
  const dir = makeFixture();
  const fallback = readModel(dir);
  assert.equal(
    fallback.schemes.wechat.candidateFormat,
    '[label]. [candidate] [comment]',
  );

  fs.appendFileSync(
    path.join(dir, 'squirrel.custom.yaml'),
    '\n    candidate_format: "[label] %c/apple %@"\n',
  );
  const parsed = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  fs.writeFileSync(
    path.join(dir, 'build', 'squirrel.yaml'),
    stringify({ __build_info: { rime_version: '1.16.0' }, ...parsed.patch }),
  );
  const model = readModel(dir);
  assert.equal(
    model.schemes.wechat.candidateFormat,
    '[label] [label]/apple [candidate] [comment]',
  );
});

test('应用参数写入 custom 并保留注释、双主题同步', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const values = lightValues(model);
  values.typography.font_point = 12;
  values.typography.label_font_point = 9;
  values.layout.spacing = 8;
  values.layout.candidate_list_layout = 'stacked';
  values.colors.back_color = { hex: '#000000', alpha: 255 };

  const result = applyEdits(dir, {
    schemeId: 'wechat',
    sync: true,
    values,
    expectedMtime: model.meta.customMtime,
  });
  assert.equal(result.changed, true);
  assert.ok(fs.existsSync(result.backupPath));

  const text = fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8');
  assert.match(text, /# 测试注释：不要丢/);
  assert.equal((text.match(/^\s*font_point: 12$/gm) || []).length, 2);
  assert.equal((text.match(/^\s*label_font_point: 9$/gm) || []).length, 2);
  assert.match(text, /^\s*spacing: 8$/m);
  assert.equal((text.match(/candidate_list_layout: stacked/g) || []).length, 3);

  const parsed = parse(text, { schema: 'failsafe' });
  assert.equal(parsed.patch.preset_color_schemes.wechat.back_color.toLowerCase(), '0x000000');
  assert.equal(parsed.patch.preset_color_schemes.wechat_dark.text_color.toLowerCase(), '0xe8e8e8');

  const backups = fs.readdirSync(path.join(dir, '.panel-backups'));
  assert.ok(backups.some((name) => name.endsWith('.bak')));
  assert.ok(backups.includes('last-apply.json'));
});

test('部署校验会指出尚未更新的 build', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const values = lightValues(model);
  values.typography.font_point = 12;
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values,
    expectedMtime: model.meta.customMtime,
  });

  const mismatches = verifyValues(dir, {
    schemeId: 'wechat',
    sync: false,
    values,
  });
  assert.ok(mismatches.some((line) => line.includes('font_point')));

  const parsed = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  fs.writeFileSync(
    path.join(dir, 'build', 'squirrel.yaml'),
    stringify({ __build_info: { rime_version: '1.16.0' }, ...parsed.patch }),
  );
  const clean = verifyValues(dir, { schemeId: 'wechat', sync: false, values });
  assert.deepEqual(clean, []);
});

test('撤销恢复应用前的内容并移除撤销标记', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const values = lightValues(model);
  values.typography.font_point = 12;
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values,
    expectedMtime: model.meta.customMtime,
  });

  const result = undoLast(dir);
  assert.ok(result.restoredFrom.endsWith('.bak'));
  const text = fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8');
  assert.equal(text, CUSTOM);
  assert.ok(!fs.existsSync(path.join(dir, '.panel-backups', 'last-apply.json')));
  assert.throws(() => undoLast(dir), /没有可撤销/);
});

test('外部修改后拒绝撤销', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const values = lightValues(model);
  values.typography.font_point = 12;
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values,
    expectedMtime: model.meta.customMtime,
  });
  fs.appendFileSync(path.join(dir, 'squirrel.custom.yaml'), '\n# 外部修改\n');
  assert.throws(() => undoLast(dir), /又被修改过/);
});

test('并发修改检测', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const values = lightValues(model);
  values.typography.font_point = 12;
  assert.throws(
    () =>
      applyEdits(dir, {
        schemeId: 'wechat',
        sync: false,
        values,
        expectedMtime: model.meta.customMtime - 10000,
      }),
    /已被其他程序修改/,
  );
});

test('拒绝未知项与越界值', () => {
  assert.throws(() => validateValues({ colors: { nope: { hex: '#FFFFFF' } } }), /未知颜色项/);
  assert.throws(
    () => validateValues({ typography: { font_point: 99 } }),
    /font_point/,
  );
  assert.throws(
    () => validateValues({ typography: { font_face: 'bad\nname' } }),
    /字体名称/,
  );
  assert.throws(
    () => validateValues({ layout: { candidate_list_layout: 'grid' } }),
    /linear 或 stacked/,
  );
});

function insertIntoWechat(dir, lines) {
  const file = path.join(dir, 'squirrel.custom.yaml');
  const text = fs.readFileSync(file, 'utf8');
  const anchor = '      border_width: 8\n';
  fs.writeFileSync(file, text.replace(anchor, anchor + lines.join('\n') + '\n'));
  const parsed = parse(fs.readFileSync(file, 'utf8'), { schema: 'failsafe' });
  fs.writeFileSync(
    path.join(dir, 'build', 'squirrel.yaml'),
    stringify({ __build_info: { rime_version: '1.16.0' }, ...parsed.patch }),
  );
}

test('新增设置项默认值与字体名回退', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const light = model.schemes.wechat;
  assert.equal(light.typography.label_font_face, 'PingFangSC');
  assert.equal(light.typography.comment_font_face, 'PingFangSC');
  assert.equal(light.layout.text_orientation, 'horizontal');
  assert.equal(light.layout.show_paging, false);
  assert.equal(light.layout.inline_candidate, false);
  assert.equal(light.layout.mutual_exclusive, false);
  assert.equal(light.layout.alpha, 100);
  assert.equal(light.layout.surrounding_extra_expansion, 0);
  // 未设置时鼠须管源码默认 .mix（不是空字符串）
  assert.equal(light.layout.status_message_type, 'mix');
  for (const key of [
    'border_color',
    'hilited_back_color',
    'hilited_text_color',
    'preedit_back_color',
    'candidate_back_color',
    'hilited_comment_text_color',
  ]) {
    assert.equal(light.colors[key], null, `${key} 未设置时应为 null`);
  }
});

test('可选颜色在方案中设置后按 BGR 解析', () => {
  const dir = makeFixture();
  insertIntoWechat(dir, [
    '      border_color: 0x336699',
    '      preedit_back_color: 0xFFEEDDCC',
    '      hilited_comment_text_color: 0x102030',
  ]);
  const model = readModel(dir);
  const light = model.schemes.wechat.colors;
  assert.equal(light.border_color.hex, '#996633');
  // 0xFFEEDDCC = AABB GGRR → alpha 255, B=EE G=DD R=CC
  assert.equal(light.preedit_back_color.hex, '#CCDDEE');
  assert.equal(light.preedit_back_color.a, 255);
  assert.equal(light.hilited_comment_text_color.hex, '#302010');
  assert.equal(light.hilited_back_color, null);
});

test('写入新增键：字体名、格式、方案名、可选颜色、alpha、翻页与竖排', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const values = lightValues(model);
  values.typography.label_font_face = 'PingFang SC';
  values.typography.comment_font_face = 'Kaiti SC';
  values.candidateFormat = '[label]%c [candidate] %@';
  values.name = '微信键盘·测试';
  values.layout.alpha = 50;
  values.layout.show_paging = true;
  values.layout.text_orientation = 'vertical';
  values.layout.status_message_type = 'short';
  values.layout.surrounding_extra_expansion = 4;
  values.colors.border_color = { hex: '#336699', alpha: 255 };
  values.colors.hilited_text_color = null;

  const result = applyEdits(dir, {
    schemeId: 'wechat',
    sync: true,
    values,
    expectedMtime: model.meta.customMtime,
  });
  assert.equal(result.changed, true);

  const parsed = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  const light = parsed.patch.preset_color_schemes.wechat;
  const dark = parsed.patch.preset_color_schemes.wechat_dark;
  assert.equal(light.candidate_format, '[label]%c [candidate] %@');
  assert.equal(light.name, '微信键盘·测试');
  assert.equal(light.label_font_face, 'PingFang SC');
  assert.equal(dark.label_font_face, 'PingFang SC');
  assert.equal(dark.comment_font_face, 'Kaiti SC');
  assert.equal(light.border_color, '0x996633');
  assert.equal(light.text_orientation, 'vertical');
  assert.equal(dark.text_orientation, 'vertical');
  // failsafe 解析把标量当字符串，这里按字符串断言
  assert.equal(light.alpha, '0.5');
  assert.equal(dark.alpha, '0.5');
  assert.equal(light.show_paging, 'true');
  assert.equal(dark.show_paging, 'true');
  assert.equal(light.surrounding_extra_expansion, '4');
  assert.equal(parsed.patch.style.text_orientation, 'vertical');
  assert.equal(parsed.patch.style.alpha, '0.5');
  assert.equal(parsed.patch.style.show_paging, 'true');
  assert.equal(parsed.patch.style.status_message_type, 'short');

  // 可选颜色置空 = 删除方案内既有键
  insertIntoWechat(dir, ['      hilited_text_color: 0xAABBCC']);
  const m2 = readModel(dir);
  const values2 = lightValues(m2);
  values2.colors.hilited_text_color = null;
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values: values2,
    expectedMtime: m2.meta.customMtime,
  });
  const parsed2 = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  assert.equal(parsed2.patch.preset_color_schemes.wechat.hilited_text_color, undefined);
});

test('状态栏样式置空会删除 style 覆盖', () => {
  const dir = makeFixture();
  fs.appendFileSync(
    path.join(dir, 'squirrel.custom.yaml'),
    '    status_message_type: short\n',
  );
  const model = readModel(dir);
  const values = lightValues(model);
  values.layout.status_message_type = '';
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values,
    expectedMtime: model.meta.customMtime,
  });
  const parsed = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  assert.equal(parsed.patch.style.status_message_type, undefined);
});

test('新键校验与部署校验', () => {
  assert.throws(
    () => validateValues({ layout: { text_orientation: 'diagonal' } }),
    /horizontal 或 vertical/,
  );
  assert.throws(
    () => validateValues({ layout: { alpha: 101 } }),
    /alpha/,
  );
  assert.throws(
    () => validateValues({ layout: { status_message_type: 'banana' } }),
    /status_message_type/,
  );
  assert.throws(
    () => validateValues({ candidateFormat: 'bad\nformat' }),
    /候选格式/,
  );
  assert.throws(
    () => validateValues({ name: '' }),
    /方案名称/,
  );
  assert.throws(
    () => validateValues({ typography: { label_font_face: 'a\nb' } }),
    /字体名称/,
  );

  const dir = makeFixture();
  const model = readModel(dir);
  const values = lightValues(model);
  values.layout.alpha = 30;
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values,
    expectedMtime: model.meta.customMtime,
  });
  const mismatches = verifyValues(dir, {
    schemeId: 'wechat',
    sync: false,
    values,
  });
  assert.ok(mismatches.some((line) => line.includes('alpha')));
  assert.ok(mismatches.some((line) => line.includes('30')));

  const parsed = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  fs.writeFileSync(
    path.join(dir, 'build', 'squirrel.yaml'),
    stringify({ __build_info: { rime_version: '1.16.0' }, ...parsed.patch }),
  );
  const clean = verifyValues(dir, { schemeId: 'wechat', sync: false, values });
  assert.deepEqual(clean, []);
});

test('读取每页候选数与按应用生效列表', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  assert.equal(model.menu.pageSize, 6);
  const terminal = model.appOptions.items.find((a) => a.id === 'com.apple.Terminal');
  assert.deepEqual(terminal, { id: 'com.apple.Terminal', ascii_mode: true, no_inline: true });
  const macvim = model.appOptions.items.find((a) => a.id === 'org.vim.MacVim');
  assert.equal(macvim.ascii_mode, true);
  assert.equal(macvim.no_inline, true);
  assert.equal(model.meta.defaultCustomMtime, null);
});

test('page_size 生效值以部署后的 build 为准', () => {
  const dir = makeFixture();
  fs.writeFileSync(
    path.join(dir, 'default.custom.yaml'),
    'patch:\n  menu:\n    page_size: 7\n',
  );
  assert.equal(readModel(dir).menu.pageSize, 6);
  redeployDefault(dir, 7);
  assert.equal(readModel(dir).menu.pageSize, 7);
});

test('page_size 写入 default.custom.yaml、备份标记并整体撤销', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const result = applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values: lightValues(model),
    expectedMtime: model.meta.customMtime,
    pageSize: 8,
    pageSizeMtime: model.meta.defaultCustomMtime,
  });
  assert.equal(result.changed, true);
  const parsed = parse(
    fs.readFileSync(path.join(dir, 'default.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  assert.equal(parsed.patch.menu.page_size, '8');
  assert.equal(result.pageSize.backupPath, null);

  const marker = JSON.parse(
    fs.readFileSync(path.join(dir, '.panel-backups', 'last-apply.json'), 'utf8'),
  );
  const entry = marker.entries.find((e) => e.file === 'default.custom.yaml');
  assert.ok(entry);
  assert.equal(entry.backup, undefined);

  const undone = undoLast(dir);
  assert.ok(!fs.existsSync(path.join(dir, 'default.custom.yaml')));
  assert.ok(!fs.existsSync(path.join(dir, '.panel-backups', 'last-apply.json')));
});

test('page_size 与生效值一致时不写 default.custom.yaml', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const result = applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values: {},
    expectedMtime: model.meta.customMtime,
    pageSize: 6,
    pageSizeMtime: null,
  });
  assert.equal(result.pageSize.changed, false);
  assert.ok(!fs.existsSync(path.join(dir, 'default.custom.yaml')));
});

test('page_size 校验', () => {
  assert.throws(() => validatePageSize(0), /1 到 9/);
  assert.throws(() => validatePageSize(10), /1 到 9/);
  assert.throws(() => validatePageSize(4.5), /整数/);
  assert.throws(() => validatePageSize('x'), /整数/);
  assert.equal(validatePageSize('8'), 8);
});

test('page_size 部署校验', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values: {},
    expectedMtime: model.meta.customMtime,
    pageSize: 8,
    pageSizeMtime: null,
  });
  const mismatches = verifyPageSize(dir, 8);
  assert.equal(mismatches.length, 1);
  assert.match(mismatches[0], /menu\.page_size/);
  redeployDefault(dir, 8);
  assert.deepEqual(verifyPageSize(dir, 8), []);
});

test('default.custom.yaml 并发修改检测', () => {
  const dir = makeFixture();
  fs.writeFileSync(
    path.join(dir, 'default.custom.yaml'),
    'patch:\n  menu:\n    page_size: 7\n',
  );
  const model = readModel(dir);
  assert.throws(
    () =>
      applyEdits(dir, {
        schemeId: 'wechat',
        sync: false,
        values: {},
        expectedMtime: model.meta.customMtime,
        pageSize: 8,
        pageSizeMtime: model.meta.defaultCustomMtime - 10000,
      }),
    /default\.custom\.yaml/,
  );
});

test('外部改动 default.custom.yaml 后拒绝撤销', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values: {},
    expectedMtime: model.meta.customMtime,
    pageSize: 8,
    pageSizeMtime: null,
  });
  fs.appendFileSync(path.join(dir, 'default.custom.yaml'), '\n# 外部修改\n');
  assert.throws(() => undoLast(dir), /又被修改过/);
});

test('app_options 按差异写最小补丁、移除与新增', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  const values = lightValues(model);
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values,
    expectedMtime: model.meta.customMtime,
    appOptions: [
      { id: 'com.apple.Terminal', ascii_mode: false, no_inline: true },
      { id: 'org.vim.MacVim', ascii_mode: true, no_inline: true },
      { id: 'com.example.New', ascii_mode: true, no_inline: false },
    ],
  });
  const parsed = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  const apps = parsed.patch.app_options;
  assert.deepEqual(apps['com.apple.Terminal'], { ascii_mode: 'false' });
  assert.equal(apps['org.vim.MacVim'], undefined);
  assert.deepEqual(apps['com.example.New'], { ascii_mode: 'true' });

  // 从列表中移除：build 自带条目写 null 覆盖，纯自定义条目删除
  const m2 = readModel(dir);
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values: lightValues(m2),
    expectedMtime: m2.meta.customMtime,
    appOptions: m2.appOptions.items
      .filter((a) => a.id !== 'com.apple.Terminal' && a.id !== 'com.example.New')
      .map(({ id, ascii_mode, no_inline }) => ({ id, ascii_mode, no_inline })),
  });
  const parsed2 = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  // 移除标记：yaml 里 null 可写作空值或 null 字面量，Rime 都按删除处理
  const removed = parsed2.patch.app_options['com.apple.Terminal'];
  assert.ok(removed === null || removed === 'null' || removed === '');
  assert.equal(parsed2.patch.app_options['com.example.New'], undefined);
});

test('app_options 保留手写条目的未知键', () => {
  const dir = makeFixture();
  fs.appendFileSync(
    path.join(dir, 'squirrel.custom.yaml'),
    '  app_options:\n    org.vim.MacVim:\n      vim_mode: true\n      ascii_mode: true\n',
  );
  const model = readModel(dir);
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values: {},
    expectedMtime: model.meta.customMtime,
    appOptions: model.appOptions.items.map(({ id, ascii_mode, no_inline }) => ({
      id,
      ascii_mode,
      no_inline,
    })),
  });
  const parsed = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  assert.equal(parsed.patch.app_options['org.vim.MacVim'].vim_mode, 'true');
  assert.equal(parsed.patch.app_options['org.vim.MacVim'].ascii_mode, 'true');
});

test('app_options 省略 build 自带条目时写 null 移除', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values: {},
    expectedMtime: model.meta.customMtime,
    appOptions: [{ id: 'com.apple.Terminal', ascii_mode: true, no_inline: true }],
  });
  const parsed = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  const removed = parsed.patch.app_options['org.vim.MacVim'];
  assert.ok(removed === null || removed === 'null' || removed === '');
  assert.deepEqual(
    readModel(dir).appOptions.items.map((app) => app.id),
    ['com.apple.Terminal'],
  );
});

test('app_options 新增无覆盖的应用仍保留条目', () => {
  const dir = makeFixture();
  const model = readModel(dir);
  applyEdits(dir, {
    schemeId: 'wechat',
    sync: false,
    values: {},
    expectedMtime: model.meta.customMtime,
    appOptions: [
      ...model.appOptions.items.map(({ id, ascii_mode, no_inline }) => ({ id, ascii_mode, no_inline })),
      { id: 'com.example.Empty', ascii_mode: false, no_inline: false },
    ],
  });
  const parsed = parse(
    fs.readFileSync(path.join(dir, 'squirrel.custom.yaml'), 'utf8'),
    { schema: 'failsafe' },
  );
  assert.deepEqual(parsed.patch.app_options['com.example.Empty'], {});
  assert.ok(
    readModel(dir).appOptions.items.some((app) => app.id === 'com.example.Empty'),
  );
});

test('app_options 校验', () => {
  assert.throws(() => validateAppOptions('nope'), /格式不正确/);
  assert.throws(() => validateAppOptions([{ id: 'a b' }]), /Bundle ID/);
  assert.throws(() => validateAppOptions([{ id: 'ok.id', ascii_mode: 'yes' }]), /布尔/);
  assert.throws(() => validateAppOptions([{ id: 'x' }, { id: 'x' }]), /重复/);
});
