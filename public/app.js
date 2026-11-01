const SAMPLE = [
  { label: '1', text: '输入法', comment: 'shū rù fǎ' },
  { label: '2', text: '输入', comment: 'shū rù' },
  { label: '3', text: '书入', comment: '' },
  { label: '4', text: '熟入', comment: '' },
  { label: '5', text: '输出', comment: '' },
  { label: '6', text: '如', comment: '' },
  { label: '7', text: '侵入', comment: '' },
  { label: '8', text: '乳', comment: '' },
  { label: '9', text: '汝', comment: '' },
];

const COLOR_ORDER = [
  'back_color',
  'text_color',
  'candidate_text_color',
  'label_color',
  'comment_text_color',
  'hilited_candidate_back_color',
  'hilited_candidate_text_color',
  'hilited_candidate_label_color',
];

const FONT_CONTROLS = [
  { key: 'font_point', label: '正文字号', min: 8, max: 32, step: 1, unit: 'pt' },
  { key: 'label_font_point', label: '序号字号', min: 6, max: 24, step: 1, unit: 'pt' },
  { key: 'comment_font_point', label: '注释字号', min: 6, max: 24, step: 1, unit: 'pt' },
];

const PADDING_CONTROLS = [
  { key: 'border_height', label: '候选上下边距', min: 0, max: 40, step: 1, unit: 'pt' },
  { key: 'border_width', label: '候选左右边距', min: 0, max: 40, step: 1, unit: 'pt' },
];

const SHAPE_CONTROLS = [
  { key: 'corner_radius', label: '窗口圆角', min: 0, max: 20, step: 1, unit: 'pt' },
  { key: 'hilited_corner_radius', label: '选中圆角', min: 0, max: 20, step: 1, unit: 'pt' },
  { key: 'line_spacing', label: '行距', min: 0, max: 12, step: 0.5, unit: '' },
  { key: 'spacing', label: '编码间距', min: 0, max: 30, step: 1, unit: 'pt' },
];

const ADVANCED_CONTROLS = [
  { key: 'base_offset', label: '基线偏移', min: -10, max: 10, step: 0.5, unit: 'pt' },
  { key: 'shadow_size', label: '选中阴影', min: 0, max: 20, step: 1, unit: 'pt' },
];

const LAYOUT_EXTRA_CONTROLS = [
  { key: 'alpha', label: '窗口不透明度', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'surrounding_extra_expansion', label: '屏幕边缘扩张', min: 0, max: 20, step: 1, unit: 'pt' },
];

const STATUS_MESSAGE_OPTIONS = [
  ['mix', '默认 · mix（混合）'],
  ['long', 'long（长提示）'],
  ['short', 'short（短提示）'],
];

const ALL_SLIDER_CONTROLS = [
  ...FONT_CONTROLS,
  ...PADDING_CONTROLS,
  ...SHAPE_CONTROLS,
  ...ADVANCED_CONTROLS,
  ...LAYOUT_EXTRA_CONTROLS,
];

const SLIDER_BY_KEY = new Map(
  [...ALL_SLIDER_CONTROLS, { key: 'page_size', label: '每页候选数', min: 1, max: 9, step: 1, unit: '' }]
    .map((control) => [control.key, control]),
);

// 文本框：id → 配置键；字体都是 typography 键（candidateFormat 是顶层键，单独处理）
const TEXT_INPUT_KEYS = {
  fontFace: 'font_face',
  labelFontFace: 'label_font_face',
  commentFontFace: 'comment_font_face',
};

const PAGE_SIZE_CONTROL = { key: 'page_size', label: '每页候选数', min: 1, max: 9, step: 1, unit: '' };
const COUNTDOWN_MS = 60000;

const APP_SWITCHES = [
  { key: 'ascii_mode', label: '默认英文' },
  { key: 'no_inline', label: '关闭内嵌编码' },
];

const state = {
  data: null,
  schemeId: null,
  values: {},
  baseline: {},
  pageSize: 6,
  baselinePageSize: 6,
  appItems: [],
  baselineAppItems: [],
  activeIndex: 0,
  busy: false,
  dirty: false,
  statusKind: 'idle',
  fontInfo: {},
  deadlineId: 0,
  deployDeadline: 0,
};

const el = (id) => document.getElementById(id);

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function hexToRgb(hex) {
  const text = String(hex || '').replace(/^#/, '');
  return {
    r: parseInt(text.slice(0, 2), 16) || 0,
    g: parseInt(text.slice(2, 4), 16) || 0,
    b: parseInt(text.slice(4, 6), 16) || 0,
  };
}

function cssColor(color) {
  const { r, g, b } = hexToRgb(color.hex);
  const alpha = color.alpha === undefined ? 255 : color.alpha;
  if (alpha >= 255) return color.hex;
  return `rgba(${r}, ${g}, ${b}, ${(alpha / 255).toFixed(3)})`;
}

function toEditable(scheme) {
  const colors = {};
  for (const [key, color] of Object.entries(scheme.colors)) {
    colors[key] = color === null ? null : { hex: color.hex, alpha: color.a };
  }
  return {
    typography: { ...scheme.typography },
    layout: { ...scheme.layout },
    colors,
    candidateFormat: scheme.candidateFormat,
    name: scheme.name,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function currentValues() {
  return state.values[state.schemeId];
}

function currentScheme() {
  return state.data.schemes[state.schemeId];
}

function faceCss(face) {
  return `"${String(face || '').replace(/["\\]/g, '')}"`;
}

function cssFontStack(face, info) {
  if (info && !info.pending && !info.error && Array.isArray(info.fonts) && info.fonts.length) {
    const families = info.fonts
      .map((font) => `"${String(font.family || font.postscript).replace(/["\\]/g, '')}"`)
      .join(', ');
    return `${families}, "PingFang SC", Helvetica`;
  }
  return `${faceCss(face)}, "PingFang SC", Helvetica`;
}

const measureCtx = document.createElement('canvas').getContext('2d');
const sepCache = new Map();

function separatorWidth(stack, size) {
  const key = `${stack}|${size}`;
  if (sepCache.has(key)) return sepCache.get(key);
  measureCtx.font = `${size}px ${stack}`;
  const width = measureCtx.measureText('  ').width;
  sepCache.set(key, width);
  return width;
}

function fmt(value, step) {
  const n = Number(value);
  return step < 1 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n));
}

function chip(text) {
  return `<span class="chip">${esc(text)}</span>`;
}

// 源码：pagingOffset = (labelFontSize ?? fontSize) * 1.5，不取整
function pagingOffsetOf(typography) {
  return (typography.label_font_point || typography.font_point) * 1.5;
}

function sliderOutputText(control, value) {
  return `${fmt(value, control.step)}${control.unit ? ' ' + control.unit : ''}`;
}

function sliderPercent(control, value) {
  return ((value - control.min) / (control.max - control.min)) * 100;
}

function render() {
  if (!state.data) return;
  renderTabs();
  renderControls();
  renderPreview();
  renderReadout();
  updateFooter();
}

function renderTabs() {
  const { roles } = state.data.meta;
  const ids = [...new Set([roles.light, roles.dark])];
  el('schemeTabs').innerHTML = ids
    .map((id) => {
      const scheme = state.data.schemes[id];
      if (!scheme) return '';
      const roleLabel = id === roles.light ? '浅色' : '深色';
      const editable = state.values[id];
      const shortName = String((editable?.name || scheme.name) || '').split('/')[0].trim();
      const active = id === state.schemeId ? 'active' : '';
      return `<button type="button" data-scheme="${esc(id)}" class="${active}" ${state.busy ? 'disabled' : ''}>
        ${roleLabel}<span>${esc(shortName)}</span>
      </button>`;
    })
    .join('');
}

function sliderHtml(control, value) {
  const { key, label, min, max, step } = control;
  return `
    <div class="field">
      <div class="field-head">
        <label for="r-${key}">${label}</label>
        <output id="o-${key}">${sliderOutputText(control, value)}</output>
      </div>
      <input class="range" type="range" id="r-${key}" data-key="${key}"
        min="${min}" max="${max}" step="${step}" value="${value}"
        style="--p:${sliderPercent(control, value)}%">
    </div>`;
}

function appRowHtml(app) {
  return `
    <div class="app-row" data-app="${esc(app.id)}">
      <span class="app-name" title="${esc(app.id)}">${esc(app.id)}</span>
      <div class="app-switches">
        ${APP_SWITCHES.map(({ key, label }) => `
          <label class="chip-switch" title="${esc(label)}">
            <input type="checkbox" data-app-key="${key}" ${app[key] ? 'checked' : ''}>
            <span>${esc(label)}</span>
          </label>`).join('')}
        <button type="button" class="app-remove" data-app-remove title="移除">移除</button>
      </div>
    </div>`;
}

function renderControls() {
  const values = currentValues();
  const labels = state.data.labels;

  el('schemeCard').innerHTML = `
    <div class="card-title">方案</div>
    <div class="field first">
      <div class="field-head"><label for="schemeName">方案名称</label></div>
      <div class="font-line">
        <input type="text" id="schemeName" value="${esc(values.name)}" spellcheck="false">
      </div>
    </div>
    <div class="field">
      <div class="field-head"><label for="candidateFormat">候选格式</label></div>
      <div class="font-line">
        <input type="text" id="candidateFormat" value="${esc(values.candidateFormat)}" spellcheck="false">
      </div>
    </div>
  `;

  el('fontCard').innerHTML = `
    <div class="card-title">字体</div>
    <div class="field first">
      <div class="field-head"><label for="fontFace">字体名称</label></div>
      <div class="font-line">
        <input type="text" id="fontFace" list="fontFaces" value="${esc(values.typography.font_face)}" spellcheck="false">
      </div>
    </div>
    ${FONT_CONTROLS.map((c) => sliderHtml(c, values.typography[c.key])).join('')}
    <div class="field">
      <div class="field-head"><label for="labelFontFace">序号字体</label></div>
      <div class="font-line">
        <input type="text" id="labelFontFace" list="fontFaces" value="${esc(values.typography.label_font_face)}" spellcheck="false">
      </div>
    </div>
    <div class="field">
      <div class="field-head"><label for="commentFontFace">注释字体</label></div>
      <div class="font-line">
        <input type="text" id="commentFontFace" list="fontFaces" value="${esc(values.typography.comment_font_face)}" spellcheck="false">
      </div>
    </div>
  `;

  el('shapeCard').innerHTML = `
    <div class="card-title">间距与形状</div>
    ${PADDING_CONTROLS.map((c) => sliderHtml(c, values.layout[c.key])).join('')}
    ${SHAPE_CONTROLS.map((c) => sliderHtml(c, values.layout[c.key])).join('')}
    <details class="advanced">
      <summary>高级参数</summary>
      ${ADVANCED_CONTROLS.map((c) => sliderHtml(c, values.layout[c.key])).join('')}
      <label class="switch-row">
        <span>透明背景（translucency）</span>
        <input type="checkbox" data-toggle="translucency" ${values.layout.translucency ? 'checked' : ''}>
        <span class="switch"></span>
      </label>
    </details>
  `;

  el('colorGrid').innerHTML = COLOR_ORDER.map((key) => {
    const color = values.colors[key];
    return `
      <label class="color-field">
        <input type="color" data-color="${key}" value="${esc(color.hex)}">
        <span class="color-meta">
          <span class="color-name">${esc(labels.colors[key] || key)}</span>
          <span class="color-hex" id="hex-${key}">${esc(color.hex)}</span>
        </span>
      </label>`;
  }).join('');

  el('optionalColors').innerHTML = `
    <div class="opt-title">可选颜色</div>
    ${Object.entries(labels.optionalColors || {}).map(([key, label]) => {
      const color = values.colors[key];
      const set = color !== null;
      return `
        <div class="color-field opt">
          <label class="sync" title="勾选后设置该项颜色">
            <input type="checkbox" data-optcolor="${key}" ${set ? 'checked' : ''}>
            <span class="checkbox"></span>
          </label>
          <input type="color" data-color="${key}" value="${esc(set ? color.hex : '#999999')}" ${set ? '' : 'disabled'}>
          <span class="color-meta">
            <span class="color-name">${esc(label || key)}</span>
            <span class="color-hex ${set ? '' : 'unset'}" id="hex-${key}">${set ? esc(color.hex) : '未设置'}</span>
          </span>
        </div>`;
    }).join('')}
  `;

  el('layoutExtra').innerHTML = `
    ${LAYOUT_EXTRA_CONTROLS.filter((c) => c.key === 'alpha').map((c) => sliderHtml(c, values.layout[c.key])).join('')}
    <details class="advanced">
      <summary>高级选项</summary>
      <div class="field first">
        <div class="field-head"><label>文字方向</label></div>
        <div class="segmented" id="orientationSeg">
          <button type="button" data-orientation="horizontal">横排</button>
          <button type="button" data-orientation="vertical">竖排</button>
        </div>
      </div>
      <div class="field">
        <div class="field-head"><label for="statusMessageType">状态栏样式</label></div>
        <select id="statusMessageType" data-select="status_message_type">
          ${STATUS_MESSAGE_OPTIONS.map(([value, label]) =>
            `<option value="${value}" ${values.layout.status_message_type === value ? 'selected' : ''}>${esc(label)}</option>`,
          ).join('')}
        </select>
      </div>
      <label class="switch-row">
        <span>高亮融合（mutual_exclusive）</span>
        <input type="checkbox" data-toggle="mutual_exclusive" ${values.layout.mutual_exclusive ? 'checked' : ''}>
        <span class="switch"></span>
      </label>
      <label class="switch-row">
        <span>内嵌候选（inline_candidate）</span>
        <input type="checkbox" data-toggle="inline_candidate" ${values.layout.inline_candidate ? 'checked' : ''}>
        <span class="switch"></span>
      </label>
      ${LAYOUT_EXTRA_CONTROLS.filter((c) => c.key === 'surrounding_extra_expansion').map((c) => sliderHtml(c, values.layout[c.key])).join('')}
    </details>
  `;

  el('inlinePreedit').checked = Boolean(values.layout.inline_preedit);
  el('showPaging').checked = Boolean(values.layout.show_paging);

  el('menuExtra').innerHTML = sliderHtml(PAGE_SIZE_CONTROL, state.pageSize);

  el('appCard').innerHTML = `
    <div class="card-title">按应用</div>
    ${state.appItems.length ? state.appItems.map(appRowHtml).join('') : '<p class="empty">—</p>'}
    <form class="app-add" id="appAdd">
      <input type="text" name="bundle" placeholder="com.example.App" spellcheck="false"
        autocomplete="off" pattern="[A-Za-z0-9][A-Za-z0-9._-]*" required>
      <button type="submit" class="action" ${state.busy ? 'disabled' : ''}>添加</button>
    </form>
  `;

  document.querySelectorAll('#layoutSeg button').forEach((button) => {
    button.classList.toggle('active', button.dataset.layout === values.layout.candidate_list_layout);
    button.disabled = state.busy;
  });
  document.querySelectorAll('#orientationSeg button').forEach((button) => {
    button.classList.toggle('active', button.dataset.orientation === values.layout.text_orientation);
    button.disabled = state.busy;
  });

  document.querySelectorAll('.range').forEach((range) => {
    range.disabled = state.busy;
  });
  document.querySelectorAll('#controls input, #controls select').forEach((input) => {
    input.disabled = state.busy;
  });
}

const previewMetrics = { padX: 0, padY: 0, sep: 0, lineHeight: 0, hasPreedit: false };

function requestFont(face) {
  const key = String(face || '').trim();
  if (!key || state.fontInfo[key]) return;
  state.fontInfo[key] = { pending: true };
  api(`/api/font?name=${encodeURIComponent(key)}`)
    .then((info) => {
      state.fontInfo[key] = info;
    })
    .catch((error) => {
      state.fontInfo[key] = { error: error.message };
    })
    .then(() => {
      if (!state.data) return;
      const t = currentValues().typography;
      const active = [t.font_face, t.label_font_face, t.comment_font_face]
        .map((f) => String(f || '').trim());
      if (active.includes(key)) {
        renderPreview();
      }
    });
}

function buildSegments(template, label, text, comment) {
  // 与 SquirrelTheme 的 setter 一致：%@ → 候选＋注释、%c → 序号，再按占位符拆分
  const expanded = String(template)
    .replaceAll('%@', '[candidate] [comment]')
    .replaceAll('%c', '[label]');
  const parts = expanded.split(/(\[label\]|\[candidate\]|\[comment\])/g);
  const segments = [];
  for (const part of parts) {
    if (!part) continue;
    if (part === '[label]') segments.push({ cls: 'label', text: label });
    else if (part === '[candidate]') segments.push({ cls: 'text', text });
    else if (part === '[comment]') {
      if (comment) segments.push({ cls: 'comment', text: comment });
    } else {
      // Squirrel 给整段模板先套序号样式，再替换占位符；普通文字按序号样式渲染。
      segments.push({ cls: 'label', text: part });
    }
  }
  return segments;
}

function renderPreview() {
  const values = currentValues();
  const t = values.typography;
  const l = values.layout;
  const c = values.colors;
  const win = el('win');
  const stage = el('stage');
  const face = t.font_face.trim() || 'PingFangSC';
  const labelFace = (t.label_font_face || t.font_face).trim() || 'PingFangSC';
  const commentFace = (t.comment_font_face || t.font_face).trim() || 'PingFangSC';
  const info = state.fontInfo[face];

  requestFont(face);
  requestFont(labelFace);
  requestFont(commentFace);
  stage.classList.toggle('dark', currentScheme().role === 'dark');

  const stack = cssFontStack(face, info);
  const fs = Math.max(1, t.font_point);
  const ready = info && !info.pending && !info.error;
  const ratio = ready && info.lineHeightRatio ? info.lineHeightRatio : 1.1667;
  const lineHeight = Math.max(1, fs * ratio + Math.abs(l.base_offset));
  const padX = l.border_width + l.corner_radius;
  const padY = l.border_height + l.corner_radius;
  const sep = separatorWidth(stack, fs);

  // 窗口阴影来自系统，和 shadow_size（选中项阴影）无关。
  const vars = {
    '--face': stack,
    '--label-face': cssFontStack(labelFace, state.fontInfo[labelFace]),
    '--comment-face': cssFontStack(commentFace, state.fontInfo[commentFace]),
    '--fs': `${fs}px`,
    '--label-size': `${t.label_font_point}px`,
    '--comment-size': `${t.comment_font_point}px`,
    '--label-lift': `${(fs - t.label_font_point) / 2.5}px`,
    '--comment-lift': `${(fs - t.comment_font_point) / 2.5}px`,
    '--lh': `${lineHeight}px`,
    '--sep': `${sep}px`,
    '--row-gap': `${Math.max(0, l.line_spacing)}px`,
    '--pad-x': `${padX}px`,
    '--pad-y': `${padY}px`,
    '--radius': `${l.corner_radius}px`,
    '--h-radius': `${l.hilited_corner_radius}px`,
    '--preedit-gap': `${Math.max(0, l.spacing + l.hilited_corner_radius)}px`,
    '--win-bg': cssColor(c.back_color),
    '--text': cssColor(c.text_color),
    '--cand': cssColor(c.candidate_text_color),
    '--label': cssColor(c.label_color),
    '--comment': cssColor(c.comment_text_color),
    '--hi-bg': cssColor(c.hilited_candidate_back_color),
    '--hi-text': cssColor(c.hilited_candidate_text_color),
    '--hi-label': cssColor(c.hilited_candidate_label_color),
    '--shadow': '0 4px 14px rgba(0,0,0,0.16), 0 1px 4px rgba(0,0,0,0.08)',
  };
  for (const [prop, value] of Object.entries(vars)) win.style.setProperty(prop, value);

  // 鼠须管的 translucency 只是把系统毛玻璃垫在窗口后面；back_color 不透明时
  // 画面仍是实色，所以这里不再人为稀释底色，避免预览发灰。
  win.classList.toggle('translucent', Boolean(l.translucency) && vars['--win-bg'].startsWith('rgba'));

  // 边框颜色（border_color）：源码用 min(border_width, border_height) 宽的线描一圈窗口路径
  const ringWidth = Math.min(l.border_width, l.border_height);
  win.style.setProperty(
    '--ring',
    c.border_color && ringWidth > 0
      ? `inset 0 0 0 ${ringWidth}px ${cssColor(c.border_color)}`
      : 'none',
  );

  // 窗口不透明度（alpha）：源码直接设置窗口 alphaValue，整体一起变透
  win.style.opacity = String(Math.max(0, Math.min(1, l.alpha / 100)));

  // 翻页区（show_paging）：窗口左侧透明条宽 pagingOffset，▲▼ 用底色画在条内
  const pagingOn = Boolean(l.show_paging);
  win.classList.toggle('paging', pagingOn);
  win.style.setProperty('--paging', `${pagingOn ? pagingOffsetOf(t) : 0}px`);

  el('preedit').style.display = l.inline_preedit ? 'none' : 'block';
  el('cands').classList.toggle('stacked', l.candidate_list_layout === 'stacked');
  el('cands').classList.toggle('vertical', l.text_orientation === 'vertical');
  Object.assign(previewMetrics, { padX, padY, sep, lineHeight, hasPreedit: !l.inline_preedit });
  renderCandidates();
  renderPagingStrip();
}

function renderPagingStrip() {
  const strip = el('pagingStrip');
  if (!strip || !state.data) return;
  const l = currentValues().layout;
  if (!l.show_paging) {
    strip.innerHTML = '';
    return;
  }
  const t = currentValues().typography;
  const m = previewMetrics;
  const offset = pagingOffsetOf(t);
  // 源码：radius = min(0.5 * pagingOffset, 2 * 内容高 / 9)，这里用行高近似
  const radius = Math.min(0.5 * offset, (2 * m.lineHeight) / 9);
  const size = Math.max(6, Math.round(radius * 2));
  const color = cssColor(currentValues().colors.back_color);
  const triangle = (y) => `<svg width="${size}" height="${size}" aria-hidden="true" style="position:absolute; left:50%; top:${Math.round(y)}px; transform:translate(-50%,-50%);">
    <polygon points="50,4 94,80 6,80" fill="${color}" stroke="${color}" stroke-width="12" stroke-linejoin="round"/>
  </svg>`;
  // ▲ 在上 1/3、▼ 在下 2/3（源码按第一候选行高度排布）
  const topY = m.padY + m.lineHeight / 3;
  const bottomY = m.padY + (2 * m.lineHeight) / 3;
  strip.innerHTML = triangle(topY) + triangle(bottomY);
}

function renderCandidates() {
  const template = currentValues().candidateFormat || '[label]. [candidate] [comment]';
  const items = SAMPLE.slice(0, Math.max(1, state.pageSize));
  if (state.activeIndex >= items.length) state.activeIndex = 0;
  el('cands').innerHTML = items.map((item, index) => {
    const active = index === state.activeIndex ? 'active' : '';
    const segments = buildSegments(template, item.label, item.text, item.comment)
      .map((segment) => `<span class="seg ${segment.cls}">${esc(segment.text)}</span>`)
      .join('');
    return `<div class="cand ${active}" data-index="${index}"><span class="hl"></span>${segments}</div>`;
  }).join('');
  // innerHTML 写入后立即读 rect 会强制同步布局，避免隐藏标签页里 rAF 不触发导致高亮位置为空。
  applyHighlightGeometry();
}

function applyHighlightGeometry() {
  if (!state.data) return;
  const l = currentValues().layout;
  const nodes = [...document.querySelectorAll('#cands .cand')];
  if (!nodes.length) return;
  const m = previewMetrics;
  const stacked = l.candidate_list_layout === 'stacked';
  const clampInset = Math.max(0, l.hilited_corner_radius + Math.min(l.border_width, l.border_height)) / 2;
  const edgeX = Math.max(0, m.padX - clampInset);
  const edgeY = Math.max(0, m.padY - clampInset);
  const halfSep = m.sep / 2;
  const rowGap = Math.max(0, l.line_spacing);
  const shadowSize = l.shadow_size;
  const radius = Math.max(0, l.hilited_corner_radius);

  const rows = new Map();
  nodes.forEach((node, index) => {
    const key = Math.round(node.getBoundingClientRect().top * 2) / 2;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(index);
  });
  const rowKeys = [...rows.keys()].sort((a, b) => a - b);
  const rowOf = new Map();
  rowKeys.forEach((key, rowIndex) => {
    for (const index of rows.get(key)) rowOf.set(index, rowIndex);
  });

  nodes.forEach((node, index) => {
    const hl = node.querySelector('.hl');
    if (!hl) return;
    const rowIndex = rowOf.get(index);
    const row = rows.get(rowKeys[rowIndex]);
    const firstInRow = row[0] === index;
    const lastInRow = row[row.length - 1] === index;
    const firstRow = rowIndex === 0;
    const lastRow = rowIndex === rowKeys.length - 1;

    const left = stacked || firstInRow ? -edgeX : -halfSep;
    const right = stacked || lastInRow ? -edgeX : -halfSep;
    const top = firstRow ? (m.hasPreedit ? -clampInset : -edgeY) : -rowGap / 2;
    const bottom = lastRow ? -edgeY : -rowGap / 2;

    hl.style.left = `${left}px`;
    hl.style.right = `${right}px`;
    hl.style.top = `${top}px`;
    hl.style.bottom = `${bottom}px`;
    hl.style.borderRadius = `${radius}px`;
    hl.style.boxShadow = shadowSize > 0
      ? `0 0 0 0.5px rgba(0,0,0,0.15), 0 ${(shadowSize * 0.5).toFixed(1)}px ${shadowSize.toFixed(1)}px rgba(0,0,0,0.2)`
      : 'none';
  });
}

function renderReadout() {
  const t = currentValues().typography;
  const l = currentValues().layout;
  const chips = [
    chip(`正文 ${t.font_point}pt`),
    chip(`序号 ${t.label_font_point}pt`),
    chip(`上下留白 ${fmt(l.border_height + l.corner_radius, 1)}pt`),
    chip(`行距 ${l.line_spacing}`),
    chip(l.candidate_list_layout === 'stacked' ? '竖排' : '横排'),
    chip(`每页 ${state.pageSize}`),
  ];
  if (l.alpha < 100) chips.push(chip(`透明 ${l.alpha}%`));
  if (l.show_paging) chips.push(chip('翻页'));
  if (l.text_orientation === 'vertical') chips.push(chip('竖排窗口'));
  el('readout').innerHTML = chips.join('');
}

function setStatus(kind, text) {
  state.statusKind = kind;
  const dot = el('statusDot');
  dot.className = `dot ${kind === 'idle' ? '' : kind}`.trim();
  el('statusText').textContent = text;
}

function isDirty() {
  if (state.pageSize !== state.baselinePageSize) return true;
  if (JSON.stringify(state.appItems) !== JSON.stringify(state.baselineAppItems)) return true;
  return JSON.stringify(state.values[state.schemeId]) !== JSON.stringify(state.baseline[state.schemeId]);
}

function updateFooter() {
  state.dirty = isDirty();
  el('applyBtn').disabled = state.busy || !state.dirty;
  el('undoBtn').disabled = state.busy || !(state.data?.meta.backupCount > 0);
  el('resetBtn').disabled = state.busy || !state.dirty;
  document.body.classList.toggle('busy', state.busy);
  el('controls').classList.toggle('busy', state.busy);
}

function afterEdit() {
  renderPreview();
  renderReadout();
  updateFooter();
  if (state.dirty && !state.busy) {
    setStatus('dirty', '有未应用的修改');
  } else if (!state.busy && state.statusKind === 'dirty') {
    setStatus('idle', '就绪');
  }
}

function setValue(key, value) {
  const values = currentValues();
  if (key in values.typography) values.typography[key] = value;
  else if (key in values.layout) values.layout[key] = value;
}

function onControlInput(event) {
  const target = event.target;
  if (state.busy) return;

  if (target.matches('input[type="range"][data-key]')) {
    const key = target.dataset.key;
    const value = Number(target.value);
    if (key === 'page_size') state.pageSize = value;
    else setValue(key, value);
    const control = SLIDER_BY_KEY.get(key);
    if (control) {
      const field = target.closest('.field');
      if (field) field.querySelector('output').textContent = sliderOutputText(control, value);
      target.style.setProperty('--p', `${sliderPercent(control, value)}%`);
    }
    afterEdit();
  }

  if (target.matches('input[type="color"][data-color]')) {
    const key = target.dataset.color;
    currentValues().colors[key].hex = target.value.toUpperCase();
    const label = el(`hex-${key}`);
    if (label) label.textContent = target.value.toUpperCase();
    afterEdit();
  }

  // 文本框：id → 配置键；candidateFormat 是顶层键，字体是 typography 键
  if (TEXT_INPUT_KEYS[target.id]) {
    setValue(TEXT_INPUT_KEYS[target.id], target.value);
    afterEdit();
  }

  if (target.id === 'candidateFormat') {
    currentValues().candidateFormat = target.value;
    afterEdit();
  }

  if (target.id === 'schemeName') {
    currentValues().name = target.value;
    renderTabs();
    afterEdit();
  }
}

function optionalColorDefault(key) {
  const c = currentValues().colors;
  // 源码回退：编码高亮文字→编码文字、选中注释→选中文字
  if (key === 'hilited_text_color' && c.text_color) return c.text_color.hex;
  if (key === 'hilited_comment_text_color' && c.hilited_candidate_text_color) {
    return c.hilited_candidate_text_color.hex;
  }
  return '#999999';
}

function onControlChange(event) {
  const target = event.target;
  if (state.busy) return;
  if (target.matches('input[data-app-key]')) {
    const id = target.closest('.app-row').dataset.app;
    const item = state.appItems.find((app) => app.id === id);
    if (item) item[target.dataset.appKey] = target.checked;
    afterEdit();
    return;
  }
  if (target.matches('input[data-optcolor]')) {
    const key = target.dataset.optcolor;
    const colors = currentValues().colors;
    colors[key] = target.checked ? { hex: optionalColorDefault(key), alpha: 255 } : null;
    renderControls();
    afterEdit();
    return;
  }
  if (target.matches('select[data-select]')) {
    setValue(target.dataset.select, target.value);
    afterEdit();
    return;
  }
  if (target.matches('[data-toggle]')) {
    setValue(target.dataset.toggle, target.checked);
    afterEdit();
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  let body = {};
  try {
    body = await response.json();
  } catch {
    /* ignore */
  }
  if (!response.ok) {
    throw new Error(body.error || `请求失败（${response.status}）`);
  }
  return body;
}

// 页面内确认对话框：Enter＝确定、Esc/点遮罩＝取消
function confirmDialog({ title, message, confirmText = '确定', cancelText = '取消' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <p class="dialog-title">${esc(title)}</p>
        <p class="dialog-body">${esc(message)}</p>
        <div class="dialog-actions">
          <button type="button" class="action" data-result="cancel">${esc(cancelText)}</button>
          <button type="button" class="action primary" data-result="confirm">${esc(confirmText)}</button>
        </div>
      </div>`;
    const finish = (result) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      }
    };
    overlay.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-result]');
      if (button) finish(button.dataset.result === 'confirm');
      else if (event.target === overlay) finish(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector('button[data-result="confirm"]').focus();
  });
}

function logTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function logOutcome(entry) {
  if (entry.error) return `失败：${entry.error}`;
  if (!entry.changed) return '无改动';
  const parts = [entry.deployed ? '已部署' : '未部署'];
  if (entry.verified) parts.push('校验通过');
  else if (entry.mismatches?.length) parts.push(`校验不符 ${entry.mismatches.length} 项`);
  if (entry.waitedMs != null) parts.push(`${(entry.waitedMs / 1000).toFixed(1)} 秒`);
  return parts.join(' · ');
}

function deployLogDialog(entries) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true" aria-label="部署日志">
        <p class="dialog-title">部署日志</p>
        <ul class="log-list">
          ${entries.map((entry) => `
            <li class="log-item">
              <span class="log-time">${esc(logTime(entry.at))}</span>
              <span class="log-scheme">${esc(entry.scheme ?? '—')}</span>
              <span class="log-outcome ${entry.error ? 'bad' : entry.verified ? 'good' : 'warn'}">${esc(logOutcome(entry))}</span>
              ${entry.targets?.length ? `<span class="log-targets">${esc(entry.targets.join('、'))}</span>` : ''}
              ${entry.mismatches?.length ? `<span class="log-detail">${esc(entry.mismatches.join('；'))}</span>` : ''}
            </li>`).join('')}
        </ul>
        <div class="dialog-actions">
          <button type="button" class="action primary" data-result="close">关闭</button>
        </div>
      </div>`;
    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve();
    };
    const onKey = (event) => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        close();
      }
    };
    overlay.addEventListener('click', (event) => {
      if (event.target.closest('button[data-result]') || event.target === overlay) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector('button[data-result="close"]').focus();
  });
}

async function showDeployLog() {
  if (!state.data) return;
  let entries = state.data.meta.deployLog ?? [];
  if (!entries.length) {
    await loadConfig({ keepStatus: true });
    entries = state.data.meta.deployLog ?? [];
  }
  if (!entries.length) {
    setStatus('idle', '还没有应用记录');
    return;
  }
  await deployLogDialog(entries);
}

async function loadConfig({ keepStatus = false } = {}) {
  const data = await api('/api/config');
  state.data = data;
  state.fontInfo = {};
  if (!state.schemeId || !data.schemes[state.schemeId]) {
    state.schemeId = data.meta.roles.light;
  }
  state.values = {};
  state.baseline = {};
  for (const [id, scheme] of Object.entries(data.schemes)) {
    const editable = toEditable(scheme);
    state.values[id] = editable;
    state.baseline[id] = clone(editable);
  }
  state.pageSize = data.menu.pageSize;
  state.baselinePageSize = data.menu.pageSize;
  state.appItems = clone(data.appOptions.items);
  state.baselineAppItems = clone(data.appOptions.items);

  const home = data.meta.customPath.replace(/^\/Users\/[^/]+/, '~');
  el('filePath').textContent = home;
  el('filePath').title = data.meta.customPath;
  el('backupInfo').textContent = `${data.meta.backupCount} 个备份`;
  el('deployLogBtn').hidden = !(data.meta.deployLog?.length > 0);
  el('versionBadge').textContent = data.meta.rimeVersion
    ? `Squirrel · librime ${data.meta.rimeVersion}`
    : 'Squirrel';

  render();
  if (!keepStatus) setStatus('idle', '已读取配置文件');
  setBusy(state.busy);
}

function setBusy(busy) {
  state.busy = busy;
  renderTabs();
  document.querySelectorAll('.controls input, .controls select, .controls button').forEach((node) => {
    node.disabled = busy;
  });
  updateFooter();
}

async function applyChanges() {
  if (state.busy || !state.dirty) return;
  const values = currentValues();
  const payload = {
    schemeId: state.schemeId,
    sync: el('syncSchemes').checked,
    values,
    expectedMtime: state.data.meta.customMtime,
  };
  if (state.pageSize !== state.baselinePageSize) {
    payload.pageSize = state.pageSize;
    payload.pageSizeMtime = state.data.meta.defaultCustomMtime;
  }
  if (JSON.stringify(state.appItems) !== JSON.stringify(state.baselineAppItems)) {
    payload.appOptions = state.appItems.map((app) => ({
      id: app.id,
      ascii_mode: Boolean(app.ascii_mode),
      no_inline: Boolean(app.no_inline),
    }));
  }

  state.busy = true;
  setBusy(true);
  startDeadline('写入');
  setStatus('busy', '正在写入配置并重载鼠须管…');
  try {
    const result = await api('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    clearDeadline();
    await loadConfig({ keepStatus: true });
    if (result.ok) {
      const seconds = result.deploy?.waitedMs ? (result.deploy.waitedMs / 1000).toFixed(1) : '—';
      setStatus('ok', `已应用并校验通过（部署 ${seconds} 秒）`);
    } else if (result.changed === false) {
      setStatus('idle', result.message || '无需修改');
    } else {
      setStatus('warn', result.warning || '配置已写入，但部署校验未通过');
    }
  } catch (error) {
    clearDeadline();
    setStatus('error', error.message);
  } finally {
    state.busy = false;
    setBusy(false);
  }
}

async function manualReload() {
  if (state.busy) return;
  state.busy = true;
  setBusy(true);
  startDeadline('重载');
  setStatus('busy', '正在重新部署鼠须管…');
  try {
    const result = await api('/api/reload', { method: 'POST' });
    clearDeadline();
    await loadConfig({ keepStatus: true });
    setStatus(result.ok ? 'ok' : 'warn', result.ok ? '已重新部署完成' : result.warning);
  } catch (error) {
    clearDeadline();
    setStatus('error', error.message);
  } finally {
    state.busy = false;
    setBusy(false);
  }
}

function startDeadline(action) {
  clearDeadline();
  state.deployDeadline = Date.now() + COUNTDOWN_MS;
  el('reloadBtn').hidden = false;
  let lastSeconds = -1;
  const tick = () => {
    const remaining = state.deployDeadline - Date.now();
    if (remaining <= 0) {
      state.deadlineId = 0;
      setStatus(
        'warn',
        `部署超过 ${COUNTDOWN_MS / 1000} 秒未完成；鼠须管可能仍在部署，可点“手动重新部署”`,
      );
      return;
    }
    const seconds = Math.ceil(remaining / 1000);
    if (seconds !== lastSeconds) {
      lastSeconds = seconds;
      setStatus('busy', `正在${action}并等待鼠须管部署生效（剩余 ${seconds} 秒）`);
    }
    state.deadlineId = setTimeout(tick, 200);
  };
  tick();
}

function clearDeadline() {
  if (state.deadlineId) clearTimeout(state.deadlineId);
  state.deadlineId = 0;
  state.deployDeadline = 0;
  el('reloadBtn').hidden = true;
}

async function undoChanges() {
  if (state.busy) return;
  const ok = await confirmDialog({
    title: '撤销上次应用',
    message: '撤销上一次通过面板应用的外观修改？\n配置会恢复到那次应用之前，并重新部署鼠须管。',
  });
  if (!ok) return;

  state.busy = true;
  setBusy(true);
  setStatus('busy', '正在恢复备份并重载鼠须管…');
  try {
    const result = await api('/api/undo', { method: 'POST' });
    await loadConfig({ keepStatus: true });
    if (result.ok) {
      setStatus('ok', '已撤销上次应用并完成部署');
    } else {
      setStatus('warn', result.warning || '配置已恢复，但部署未完成');
    }
  } catch (error) {
    setStatus('error', error.message);
  } finally {
    state.busy = false;
    setBusy(false);
  }
}

function resetToFile() {
  if (state.busy) return;
  state.values[state.schemeId] = clone(state.baseline[state.schemeId]);
  state.pageSize = state.baselinePageSize;
  state.appItems = clone(state.baselineAppItems);
  render();
  setStatus('idle', '已还原为配置文件中的值');
}

el('controls').addEventListener('input', onControlInput);
el('controls').addEventListener('change', onControlChange);

el('schemeTabs').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-scheme]');
  if (!button || state.busy) return;
  const nextId = button.dataset.scheme;
  if (nextId === state.schemeId) return;
  if (state.dirty) {
    const ok = await confirmDialog({
      title: '切换配色',
      message: '当前配色有未应用的修改，切换标签会丢弃这些修改。继续？',
    });
    if (!ok) return;
    state.values[state.schemeId] = clone(state.baseline[state.schemeId]);
  }
  state.schemeId = nextId;
  state.activeIndex = 0;
  render();
  setStatus('idle', '已切换配色');
});

el('layoutSeg').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-layout]');
  if (!button || state.busy) return;
  currentValues().layout.candidate_list_layout = button.dataset.layout;
  document.querySelectorAll('#layoutSeg button').forEach((node) => {
    node.classList.toggle('active', node === button);
  });
  afterEdit();
});

el('inlinePreedit').addEventListener('change', (event) => {
  if (state.busy) return;
  currentValues().layout.inline_preedit = event.target.checked;
  afterEdit();
});

el('showPaging').addEventListener('change', (event) => {
  if (state.busy) return;
  currentValues().layout.show_paging = event.target.checked;
  afterEdit();
});

el('controls').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-orientation]');
  if (!button || state.busy) return;
  currentValues().layout.text_orientation = button.dataset.orientation;
  document.querySelectorAll('#orientationSeg button').forEach((node) => {
    node.classList.toggle('active', node === button);
  });
  afterEdit();
});

function setActiveCand(index) {
  state.activeIndex = index;
  document.querySelectorAll('#cands .cand').forEach((candidate, i) => {
    candidate.classList.toggle('active', i === index);
  });
}

el('cands').addEventListener('mouseover', (event) => {
  const node = event.target.closest('.cand');
  if (!node) return;
  const index = Number(node.dataset.index);
  if (index === state.activeIndex) return;
  setActiveCand(index);
});

el('cands').addEventListener('mouseleave', () => {
  setActiveCand(0);
});

el('applyBtn').addEventListener('click', applyChanges);
el('undoBtn').addEventListener('click', undoChanges);
el('resetBtn').addEventListener('click', resetToFile);
el('reloadBtn').addEventListener('click', manualReload);
el('deployLogBtn').addEventListener('click', showDeployLog);

el('appCard').addEventListener('click', (event) => {
  const button = event.target.closest('[data-app-remove]');
  if (!button || state.busy) return;
  const id = button.closest('.app-row').dataset.app;
  state.appItems = state.appItems.filter((app) => app.id !== id);
  renderControls();
  afterEdit();
});

el('appCard').addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.busy) return;
  const input = event.target.elements.bundle;
  const id = String(input.value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.length > 200) {
    setStatus('error', 'Bundle ID 格式不正确');
    return;
  }
  if (state.appItems.some((app) => app.id === id)) {
    setStatus('warn', '该应用已在列表中');
    return;
  }
  state.appItems.push({ id, ascii_mode: false, no_inline: false });
  state.appItems.sort((a, b) => a.id.localeCompare(b.id));
  renderControls();
  afterEdit();
  el('appCard').querySelector('input[name="bundle"]')?.focus();
});
el('syncSchemes').addEventListener('change', () => {
  if (state.dirty) setStatus('dirty', '有未应用的修改');
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    applyChanges();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});

let resizeFrame = 0;
window.addEventListener('resize', () => {
  if (!state.data) return;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => applyHighlightGeometry());
});

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    if (!state.data) return;
    sepCache.clear();
    renderPreview();
  });
}

loadConfig().catch((error) => {
  setStatus('error', `读取配置失败：${error.message}`);
});