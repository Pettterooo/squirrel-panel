import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { parse, parseDocument } from 'yaml';
import {
  colorModel,
  colorsEqual,
  cssHexToRgb,
  parseRimeColor,
  toRimeColor,
} from './color.mjs';

export const SQUIRREL_BIN =
  process.env.SQUIRREL_BIN ||
  '/Library/Input Methods/Squirrel.app/Contents/MacOS/Squirrel';

const TYPOGRAPHY_DEFAULTS = {
  font_face: 'PingFangSC',
  font_point: 16,
  label_font_point: 14,
  comment_font_point: 12,
};

// 这三项都是字体名，校验规则一致；label/comment 未设置时跟随 font_face
export const FONT_FACE_KEYS = ['font_face', 'label_font_face', 'comment_font_face'];

const LAYOUT_DEFAULTS = {
  spacing: 10,
  line_spacing: 1,
  base_offset: 0,
  corner_radius: 0,
  hilited_corner_radius: 0,
  border_width: 0,
  border_height: 0,
  shadow_size: 0,
  translucency: false,
  inline_preedit: true,
  candidate_list_layout: 'linear',
  text_orientation: 'horizontal',
  show_paging: false,
  inline_candidate: false,
  mutual_exclusive: false,
  alpha: 100,
  surrounding_extra_expansion: 0,
  // 鼠须管源码默认 .mix；空字符串仅作为“删除 style 覆盖”的写入值，不会出现在模型里
  status_message_type: 'mix',
};

const COLOR_DEFAULTS = {
  back_color: '0xFFFFFF',
  text_color: '0x000000',
  candidate_text_color: '0x000000',
  label_color: '0x000000',
  comment_text_color: '0x888888',
  hilited_candidate_back_color: '0x000000',
  hilited_candidate_text_color: '0xFFFFFF',
  hilited_candidate_label_color: '0xFFFFFF',
};

const COLOR_FALLBACKS = {
  candidate_text_color: ['text_color'],
  label_color: ['text_color'],
  hilited_candidate_label_color: ['hilited_candidate_text_color', 'text_color'],
};

export const COLOR_LABELS = {
  back_color: '底色',
  text_color: '编码文字',
  candidate_text_color: '候选文字',
  label_color: '序号',
  comment_text_color: '注释',
  hilited_candidate_back_color: '选中背景',
  hilited_candidate_text_color: '选中文字',
  hilited_candidate_label_color: '选中序号',
};

// 可选颜色：只存在方案级（源码只从 preset_color_schemes/<id>/ 读取），
// 未设置时模型值为 null（面板显示“未设置”，实际由鼠须管按源码回退）
export const OPTIONAL_COLOR_KEYS = [
  'border_color',
  'hilited_back_color',
  'hilited_text_color',
  'preedit_back_color',
  'candidate_back_color',
  'hilited_comment_text_color',
];

export const OPTIONAL_COLOR_LABELS = {
  border_color: '边框颜色',
  hilited_back_color: '编码高亮背景',
  hilited_text_color: '编码高亮文字',
  preedit_back_color: '编码底色',
  candidate_back_color: '候选底色',
  hilited_comment_text_color: '选中注释颜色',
};

export const NUMERIC_RANGES = {
  font_point: [6, 40],
  label_font_point: [4, 32],
  comment_font_point: [4, 32],
  spacing: [0, 40],
  line_spacing: [0, 20],
  base_offset: [-20, 20],
  corner_radius: [0, 30],
  hilited_corner_radius: [0, 30],
  border_width: [0, 40],
  border_height: [0, 40],
  shadow_size: [0, 30],
  alpha: [0, 100],
  surrounding_extra_expansion: [0, 20],
};

const GLOBAL_STYLE_KEYS = [
  'spacing',
  'line_spacing',
  'base_offset',
  'shadow_size',
  'translucency',
];

const CANDIDATE_FORMAT_DEFAULT = '[label]. [candidate] [comment]';

function normalizeCandidateFormat(raw) {
  const text = String(raw ?? '').trim() || CANDIDATE_FORMAT_DEFAULT;
  return text.replaceAll('%@', '[candidate] [comment]').replaceAll('%c', '[label]');
}
const GLOBAL_BOTH_KEYS = [
  'candidate_list_layout',
  'inline_preedit',
  'text_orientation',
  'show_paging',
  'inline_candidate',
  'mutual_exclusive',
  'alpha',
  'surrounding_extra_expansion',
];
const SCHEME_LAYOUT_KEYS = [
  'corner_radius',
  'hilited_corner_radius',
  'border_width',
  'border_height',
];

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function parseSafe(text) {
  if (!text) return {};
  try {
    return parse(text, { schema: 'failsafe' }) || {};
  } catch (error) {
    throw new Error(`配置文件不是合法 YAML: ${error.message}`);
  }
}

function statSafe(file) {
  try {
    const stat = fs.statSync(file);
    return { mtimeMs: stat.mtimeMs, size: stat.size, mode: stat.mode };
  } catch {
    return null;
  }
}

export function resolveRimeDir(rimeDir = process.env.RIME_DIR) {
  return rimeDir || path.join(os.homedir(), 'Library', 'Rime');
}

export function rimePaths(rimeDir) {
  const dir = resolveRimeDir(rimeDir);
  return {
    rimeDir: dir,
    customPath: path.join(dir, 'squirrel.custom.yaml'),
    buildPath: path.join(dir, 'build', 'squirrel.yaml'),
    backupDir: path.join(dir, '.panel-backups'),
    squirrelBin: SQUIRREL_BIN,
  };
}

function loadSources(rimeDir) {
  const paths = rimePaths(rimeDir);
  const customText = readText(paths.customPath);
  const buildText = readText(paths.buildPath);
  const custom = parseSafe(customText || 'patch:\n');
  const build = parseSafe(buildText || '');
  const style = { ...(build.style || {}), ...(custom.patch?.style || {}) };
  const buildSchemes = build.preset_color_schemes || {};
  const customSchemes = custom.patch?.preset_color_schemes || {};
  const schemeIds = new Set([
    ...Object.keys(buildSchemes),
    ...Object.keys(customSchemes),
  ]);

  const lightId = firstDefined(style.color_scheme, [...schemeIds][0], 'default');
  const darkId = firstDefined(style.color_scheme_dark, lightId);
  if (schemeIds.size === 0) schemeIds.add(lightId);

  return {
    paths,
    customText: customText || '',
    custom,
    build,
    style,
    buildSchemes,
    customSchemes,
    schemeIds,
    lightId,
    darkId,
    customStat: statSafe(paths.customPath),
    buildStat: statSafe(paths.buildPath),
  };
}

function schemeSource(src, schemeId) {
  return src.buildSchemes[schemeId] || src.customSchemes[schemeId] || {};
}

function resolveColor(scheme, style, key) {
  const candidates = [key, ...(COLOR_FALLBACKS[key] || [])];
  const raw = firstDefined(
    ...candidates.flatMap((name) => [scheme[name], style[name]]),
    COLOR_DEFAULTS[key],
  );
  return colorModel(raw);
}

function resolveScheme(src, schemeId, role) {
  const scheme = schemeSource(src, schemeId);
  const style = src.style;

  const typography = {
    font_face: String(
      firstDefined(scheme.font_face, style.font_face, TYPOGRAPHY_DEFAULTS.font_face),
    ),
    // 源码里 label/comment 字体未设置时沿用 font_face（combineFonts 失败回退 self.font）
    label_font_face: String(
      firstDefined(
        scheme.label_font_face,
        style.label_font_face,
        firstDefined(scheme.font_face, style.font_face, TYPOGRAPHY_DEFAULTS.font_face),
      ),
    ),
    comment_font_face: String(
      firstDefined(
        scheme.comment_font_face,
        style.comment_font_face,
        firstDefined(scheme.font_face, style.font_face, TYPOGRAPHY_DEFAULTS.font_face),
      ),
    ),
    font_point: toNumber(
      firstDefined(scheme.font_point, style.font_point),
      TYPOGRAPHY_DEFAULTS.font_point,
    ),
    label_font_point: toNumber(
      firstDefined(scheme.label_font_point, style.label_font_point),
      TYPOGRAPHY_DEFAULTS.label_font_point,
    ),
    comment_font_point: toNumber(
      firstDefined(scheme.comment_font_point, style.comment_font_point),
      TYPOGRAPHY_DEFAULTS.comment_font_point,
    ),
  };

  const layout = {
    spacing: toNumber(firstDefined(scheme.spacing, style.spacing), LAYOUT_DEFAULTS.spacing),
    line_spacing: toNumber(
      firstDefined(scheme.line_spacing, style.line_spacing),
      LAYOUT_DEFAULTS.line_spacing,
    ),
    base_offset: toNumber(
      firstDefined(scheme.base_offset, style.base_offset),
      LAYOUT_DEFAULTS.base_offset,
    ),
    corner_radius: toNumber(
      firstDefined(scheme.corner_radius, style.corner_radius),
      LAYOUT_DEFAULTS.corner_radius,
    ),
    hilited_corner_radius: toNumber(
      firstDefined(scheme.hilited_corner_radius, style.hilited_corner_radius),
      LAYOUT_DEFAULTS.hilited_corner_radius,
    ),
    border_width: toNumber(
      firstDefined(scheme.border_width, style.border_width),
      LAYOUT_DEFAULTS.border_width,
    ),
    border_height: toNumber(
      firstDefined(scheme.border_height, style.border_height),
      LAYOUT_DEFAULTS.border_height,
    ),
    shadow_size: toNumber(
      firstDefined(scheme.shadow_size, style.shadow_size),
      LAYOUT_DEFAULTS.shadow_size,
    ),
    translucency: toBool(
      firstDefined(scheme.translucency, style.translucency),
      LAYOUT_DEFAULTS.translucency,
    ),
    inline_preedit: toBool(
      firstDefined(scheme.inline_preedit, style.inline_preedit),
      LAYOUT_DEFAULTS.inline_preedit,
    ),
    candidate_list_layout: String(
      firstDefined(
        scheme.candidate_list_layout,
        style.candidate_list_layout,
        LAYOUT_DEFAULTS.candidate_list_layout,
      ),
    ),
    text_orientation: String(
      firstDefined(
        scheme.text_orientation,
        style.text_orientation,
        LAYOUT_DEFAULTS.text_orientation,
      ),
    ),
    show_paging: toBool(
      firstDefined(scheme.show_paging, style.show_paging),
      LAYOUT_DEFAULTS.show_paging,
    ),
    inline_candidate: toBool(
      firstDefined(scheme.inline_candidate, style.inline_candidate),
      LAYOUT_DEFAULTS.inline_candidate,
    ),
    mutual_exclusive: toBool(
      firstDefined(scheme.mutual_exclusive, style.mutual_exclusive),
      LAYOUT_DEFAULTS.mutual_exclusive,
    ),
    // 配置里是 0..1 小数（源码会 clamp 到 0..1），面板模型统一用百分比 0..100
    alpha: Math.round(
      toNumber(firstDefined(scheme.alpha, style.alpha), 1) * 100,
    ),
    surrounding_extra_expansion: toNumber(
      firstDefined(
        scheme.surrounding_extra_expansion,
        style.surrounding_extra_expansion,
      ),
      LAYOUT_DEFAULTS.surrounding_extra_expansion,
    ),
    // 源码只从 style/ 读取，不读方案级
    status_message_type: String(
      firstDefined(style.status_message_type, LAYOUT_DEFAULTS.status_message_type),
    ),
  };

  const colors = {};
  for (const key of Object.keys(COLOR_LABELS)) {
    colors[key] = resolveColor(scheme, style, key);
  }
  for (const key of OPTIONAL_COLOR_KEYS) {
    colors[key] = firstDefined(scheme[key]) === undefined
      ? null
      : colorModel(scheme[key]);
  }

  return {
    id: schemeId,
    name: String(firstDefined(scheme.name, schemeId)),
    role,
    typography,
    layout,
    candidateFormat: normalizeCandidateFormat(
      firstDefined(scheme.candidate_format, style.candidate_format),
    ),
    colors,
  };
}

function listBackups(rimeDir) {
  const { backupDir } = rimePaths(rimeDir);
  try {
    return fs
      .readdirSync(backupDir)
      .filter((name) => name.endsWith('.bak'))
      .map((name) => {
        const file = path.join(backupDir, name);
        const stat = fs.statSync(file);
        return { name, file, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}

export function readModel(rimeDir) {
  const src = loadSources(rimeDir);
  const schemeIds = [...src.schemeIds];
  if (schemeIds.length === 0) {
    schemeIds.push(src.lightId);
  }

  const schemes = {};
  for (const id of schemeIds) {
    const role = id === src.lightId ? 'light' : id === src.darkId ? 'dark' : 'other';
    schemes[id] = resolveScheme(src, id, role);
  }

  const backups = listBackups(rimeDir);
  const buildInfo = src.build.__build_info || {};

  return {
    meta: {
      ...src.paths,
      customExists: src.customText.length > 0,
      buildExists: Boolean(src.buildStat),
      customMtime: src.customStat?.mtimeMs ?? null,
      buildMtime: src.buildStat?.mtimeMs ?? null,
      rimeVersion: buildInfo.rime_version || null,
      roles: { light: src.lightId, dark: src.darkId },
      backupCount: backups.length,
      latestBackup: backups[0]?.name ?? null,
    },
    schemes,
    labels: { colors: COLOR_LABELS, optionalColors: OPTIONAL_COLOR_LABELS },
  };
}

function requireNumber(name, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} 必须是数字`);
  const range = NUMERIC_RANGES[name];
  if (range && (n < range[0] || n > range[1])) {
    throw new Error(`${name} 需要在 ${range[0]} 到 ${range[1]} 之间`);
  }
  return n;
}

function normalizeColorInput(key, value) {
  if (!value || typeof value !== 'object') {
    throw new Error(`颜色 ${key} 格式不正确`);
  }
  const hex = String(value.hex || '');
  const rgb = cssHexToRgb(hex);
  const alpha = value.alpha === undefined ? 255 : Number(value.alpha);
  if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255) {
    throw new Error(`颜色 ${key} 的透明度不正确`);
  }
  return toRimeColor({ ...rgb, a: alpha });
}

const BOOLEAN_LAYOUT_KEYS = [
  'translucency',
  'inline_preedit',
  'show_paging',
  'inline_candidate',
  'mutual_exclusive',
];

export function validateValues(values) {
  if (!values || typeof values !== 'object') throw new Error('缺少要应用的参数');
  const typographyIn = values.typography || {};
  const layoutIn = values.layout || {};
  const colorsIn = values.colors || {};

  const typography = {};
  for (const key of [
    ...Object.keys(TYPOGRAPHY_DEFAULTS),
    'label_font_face',
    'comment_font_face',
  ]) {
    if (!(key in typographyIn)) continue;
    if (FONT_FACE_KEYS.includes(key)) {
      const face = String(typographyIn[key]).trim();
      if (!face || face.length > 80 || /[\r\n]/.test(face)) {
        throw new Error('字体名称不合法');
      }
      typography[key] = face;
    } else {
      typography[key] = requireNumber(key, typographyIn[key]);
    }
  }

  const layout = {};
  for (const key of Object.keys(LAYOUT_DEFAULTS)) {
    if (!(key in layoutIn)) continue;
    if (BOOLEAN_LAYOUT_KEYS.includes(key)) {
      layout[key] = Boolean(layoutIn[key]);
    } else if (key === 'candidate_list_layout') {
      const val = String(layoutIn[key]);
      if (!['linear', 'stacked'].includes(val)) {
        throw new Error('候选排列只能是 linear 或 stacked');
      }
      layout[key] = val;
    } else if (key === 'text_orientation') {
      const val = String(layoutIn[key]);
      if (!['horizontal', 'vertical'].includes(val)) {
        throw new Error('文字方向只能是 horizontal 或 vertical');
      }
      layout[key] = val;
    } else if (key === 'status_message_type') {
      const val = String(layoutIn[key]);
      if (!['', 'mix', 'long', 'short'].includes(val)) {
        throw new Error('status_message_type 只能是 mix、long、short 或空');
      }
      layout[key] = val;
    } else {
      layout[key] = requireNumber(key, layoutIn[key]);
    }
  }

  const colors = {};
  for (const key of Object.keys(colorsIn)) {
    if (!(key in COLOR_LABELS) && !(key in OPTIONAL_COLOR_LABELS)) {
      throw new Error(`未知颜色项: ${key}`);
    }
    if (colorsIn[key] === null) {
      if (!(key in OPTIONAL_COLOR_LABELS)) {
        throw new Error(`颜色 ${key} 不能为空`);
      }
      colors[key] = null; // 可选颜色置空 = 删除方案内的覆盖
    } else {
      colors[key] = normalizeColorInput(key, colorsIn[key]);
    }
  }

  // 候选格式按原文写入配置，占位符由鼠须管在加载时展开；校验只保证格式合法
  let candidateFormat;
  if ('candidateFormat' in values) {
    const text = String(values.candidateFormat ?? '').trim() || CANDIDATE_FORMAT_DEFAULT;
    if (text.length > 200 || /[\r\n]/.test(text)) {
      throw new Error('候选格式不合法');
    }
    candidateFormat = text;
  }

  let name;
  if ('name' in values) {
    const text = String(values.name ?? '').trim();
    if (!text || text.length > 80 || /[\r\n]/.test(text)) {
      throw new Error('方案名称不合法');
    }
    name = text;
  }

  return { typography, layout, colors, candidateFormat, name };
}

function ensurePatch(doc) {
  const patch = doc.get('patch');
  if (!patch || typeof patch.setIn !== 'function') {
    doc.set('patch', doc.createNode({}));
  }
}

function pruneBackups(rimeDir, keep = 20) {
  const backups = listBackups(rimeDir);
  for (const old of backups.slice(keep)) {
    try {
      fs.unlinkSync(old.file);
    } catch {
      /* ignore */
    }
  }
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function applyEdits(rimeDir, payload) {
  const { schemeId, sync = false, values, expectedMtime = null } = payload || {};
  const src = loadSources(rimeDir);
  const { paths } = src;

  if (!src.customText) {
    throw new Error(`找不到配置文件：${paths.customPath}`);
  }
  if (!schemeId || !src.schemeIds.has(schemeId)) {
    throw new Error(`未知配色方案：${schemeId}`);
  }
  if (
    expectedMtime !== null &&
    src.customStat &&
    Math.abs(src.customStat.mtimeMs - Number(expectedMtime)) > 1.5
  ) {
    const error = new Error('配置文件已被其他程序修改，请先刷新面板再应用');
    error.status = 409;
    throw error;
  }

  const normalized = validateValues(values);
  const doc = parseDocument(src.customText, { keepSourceTokens: true });
  ensurePatch(doc);

  const roles = { light: src.lightId, dark: src.darkId };
  const otherId = schemeId === roles.light ? roles.dark : roles.light;
  const targetSchemes = sync && otherId && otherId !== schemeId
    ? [schemeId, otherId]
    : [schemeId];

  const applied = { schemes: new Set(targetSchemes), styleKeys: [] };

  for (const [key, value] of Object.entries(normalized.typography)) {
    for (const id of targetSchemes) {
      doc.setIn(['patch', 'preset_color_schemes', id, key], value);
    }
  }
  // 配色属于各主题自身，不随“同步”写到另一套，避免浅色覆盖深色。
  for (const [key, value] of Object.entries(normalized.colors)) {
    const colorPath = ['patch', 'preset_color_schemes', schemeId, key];
    if (value === null) {
      if (doc.getIn(colorPath) !== undefined) doc.deleteIn(colorPath);
    } else {
      doc.setIn(colorPath, value);
    }
  }
  for (const key of SCHEME_LAYOUT_KEYS) {
    if (!(key in normalized.layout)) continue;
    for (const id of targetSchemes) {
      doc.setIn(['patch', 'preset_color_schemes', id, key], normalized.layout[key]);
    }
  }
  if (normalized.candidateFormat !== undefined) {
    for (const id of targetSchemes) {
      doc.setIn(
        ['patch', 'preset_color_schemes', id, 'candidate_format'],
        normalized.candidateFormat,
      );
    }
  }
  if (normalized.name !== undefined) {
    // 方案名只属于当前方案，不同步到另一套
    doc.setIn(['patch', 'preset_color_schemes', schemeId, 'name'], normalized.name);
  }
  for (const key of GLOBAL_STYLE_KEYS) {
    if (!(key in normalized.layout)) continue;
    doc.setIn(['patch', 'style', key], normalized.layout[key]);
    applied.styleKeys.push(key);
  }
  for (const key of GLOBAL_BOTH_KEYS) {
    if (!(key in normalized.layout)) continue;
    // alpha 面板模型是 0..100 百分比，配置里是 0..1 小数
    const value = key === 'alpha'
      ? Number((normalized.layout[key] / 100).toFixed(2))
      : normalized.layout[key];
    doc.setIn(['patch', 'style', key], value);
    for (const id of [...src.schemeIds]) {
      doc.setIn(['patch', 'preset_color_schemes', id, key], value);
      applied.schemes.add(id);
    }
    applied.styleKeys.push(key);
  }
  // status_message_type 只写在 style；置空表示删除覆盖、回到鼠须管默认 mix
  if ('status_message_type' in normalized.layout) {
    const messageTypePath = ['patch', 'style', 'status_message_type'];
    if (normalized.layout.status_message_type === '') {
      if (doc.getIn(messageTypePath) !== undefined) doc.deleteIn(messageTypePath);
    } else {
      doc.setIn(messageTypePath, normalized.layout.status_message_type);
    }
    applied.styleKeys.push('status_message_type');
  }

  const output = doc.toString({ lineWidth: 0 });
  const changed = output !== src.customText;
  if (!changed) {
    return {
      changed: false,
      backupPath: null,
      newMtime: src.customStat?.mtimeMs ?? null,
      schemeIds: targetSchemes,
      styleKeys: applied.styleKeys,
    };
  }

  fs.mkdirSync(paths.backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    paths.backupDir,
    `squirrel.custom.yaml.${stamp}.bak`,
  );
  fs.writeFileSync(backupPath, src.customText, {
    encoding: 'utf8',
    mode: src.customStat?.mode || 0o644,
  });

  const tmpPath = `${paths.customPath}.panel-tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, output, { encoding: 'utf8' });
  if (src.customStat?.mode) fs.chmodSync(tmpPath, src.customStat.mode);
  fs.renameSync(tmpPath, paths.customPath);

  fs.writeFileSync(
    path.join(paths.backupDir, 'last-apply.json'),
    JSON.stringify(
      {
        appliedAt: new Date().toISOString(),
        schemeId,
        backup: path.basename(backupPath),
        fileHash: sha256(output),
      },
      null,
      2,
    ),
  );

  pruneBackups(rimeDir);
  const newStat = statSafe(paths.customPath);
  return {
    changed: true,
    backupPath,
    newMtime: newStat?.mtimeMs ?? null,
    schemeIds: targetSchemes,
    styleKeys: applied.styleKeys,
  };
}

export function verifyValues(rimeDir, { schemeId, sync, values }) {
  // 校验针对 build/squirrel.yaml —— 那才是鼠须管实际加载的生效配置。
  // 不能复用 readModel：它会把 custom patch 合并进 style，导致刚写入、
  // 尚未部署的 style 级键（如 alpha）看起来“已生效”。
  const src = loadSources(rimeDir);
  const buildStyle = src.build.style || {};
  const buildSchemes = src.build.preset_color_schemes || {};
  const buildSrc = { buildSchemes, customSchemes: {}, style: buildStyle };
  const lightId = firstDefined(buildStyle.color_scheme, schemeId);
  const darkId = firstDefined(buildStyle.color_scheme_dark, lightId);
  const otherId = schemeId === lightId ? darkId : lightId;
  const targetSchemes = sync && otherId && otherId !== schemeId
    ? [schemeId, otherId]
    : [schemeId];
  const schemeOf = (id) => resolveScheme(
    buildSrc,
    id,
    id === lightId ? 'light' : id === darkId ? 'dark' : 'other',
  );
  const normalized = validateValues(values);
  const mismatches = [];

  const close = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

  for (const id of targetSchemes) {
    const scheme = schemeOf(id);
    for (const [key, value] of Object.entries(normalized.typography)) {
      const actual = scheme.typography[key];
      const ok = FONT_FACE_KEYS.includes(key)
        ? String(actual) === value
        : close(actual, value);
      if (!ok) mismatches.push(`${id}.${key}: 期望 ${value}，实际 ${actual}`);
    }
    for (const key of SCHEME_LAYOUT_KEYS) {
      if (!(key in normalized.layout)) continue;
      if (!close(scheme.layout[key], normalized.layout[key])) {
        mismatches.push(`${id}.${key}: 期望 ${normalized.layout[key]}，实际 ${scheme.layout[key]}`);
      }
    }
    if (normalized.candidateFormat !== undefined) {
      const expected = normalizeCandidateFormat(normalized.candidateFormat);
      if (scheme.candidateFormat !== expected) {
        mismatches.push(
          `${id}.candidate_format: 期望 ${normalized.candidateFormat}，实际 ${scheme.candidateFormat}`,
        );
      }
    }
  }

  const primary = schemeOf(schemeId);
  for (const [key, value] of Object.entries(normalized.colors)) {
    const actual = primary?.colors[key];
    if (value === null) {
      if (actual !== null && actual !== undefined) {
        mismatches.push(`${schemeId}.${key}: 期望未设置，实际 ${actual?.rime}`);
      }
    } else {
      const expected = parseRimeColor(value);
      if (!colorsEqual(actual, expected)) {
        mismatches.push(`${schemeId}.${key}: 期望 ${value}，实际 ${actual?.rime}`);
      }
    }
  }
  if (normalized.name !== undefined && String(primary?.name) !== normalized.name) {
    mismatches.push(`${schemeId}.name: 期望 ${normalized.name}，实际 ${primary?.name}`);
  }
  for (const key of [...GLOBAL_STYLE_KEYS, ...GLOBAL_BOTH_KEYS]) {
    if (!(key in normalized.layout)) continue;
    const expected = normalized.layout[key];
    const actual = primary.layout[key];
    const ok = typeof expected === 'boolean'
      ? Boolean(actual) === expected
      : typeof expected === 'string'
        ? String(actual) === expected
        : close(actual, expected);
    if (!ok) mismatches.push(`${schemeId}.${key}: 期望 ${expected}，实际 ${actual}`);
  }
  if ('status_message_type' in normalized.layout) {
    const expected = normalized.layout.status_message_type;
    const actual = String(primary.layout.status_message_type);
    // 置空 = 删除覆盖，生效值回到鼠须管默认 mix
    const ok = expected === '' ? actual === 'mix' : actual === expected;
    if (!ok) {
      mismatches.push(
        `${schemeId}.status_message_type: 期望 ${expected || 'mix'}，实际 ${actual}`,
      );
    }
  }

  return mismatches;
}

export function undoLast(rimeDir) {
  const paths = rimePaths(rimeDir);
  const markerPath = path.join(paths.backupDir, 'last-apply.json');
  const markerText = readText(markerPath);
  if (!markerText) {
    const error = new Error('没有可撤销的应用记录');
    error.status = 400;
    throw error;
  }
  const marker = JSON.parse(markerText);
  const backupPath = path.join(paths.backupDir, marker.backup);
  const backupText = readText(backupPath);
  if (backupText === null) {
    throw new Error(`备份文件不存在：${backupPath}`);
  }
  const current = readText(paths.customPath);
  if (current === null) {
    throw new Error(`找不到配置文件：${paths.customPath}`);
  }
  if (sha256(current) !== marker.fileHash) {
    const error = new Error('配置文件在上次应用后又被修改过，已停止撤销；请用备份手动恢复');
    error.status = 409;
    throw error;
  }

  const stat = statSafe(paths.customPath);
  const tmpPath = `${paths.customPath}.panel-tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, backupText, { encoding: 'utf8' });
  if (stat?.mode) fs.chmodSync(tmpPath, stat.mode);
  fs.renameSync(tmpPath, paths.customPath);
  fs.renameSync(backupPath, `${backupPath}.used`);
  fs.unlinkSync(markerPath);

  const newStat = statSafe(paths.customPath);
  return {
    restoredFrom: marker.backup,
    appliedAt: marker.appliedAt,
    newMtime: newStat?.mtimeMs ?? null,
  };
}
