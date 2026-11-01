# squirrel-panel · 鼠须管外观面板

一个为 macOS 输入法 [鼠须管（Squirrel）](https://github.com/rime/squirrel) 做的可视化外观调节面板：打开网页、拖动滑块、实时预览，一键写入 `squirrel.custom.yaml`（以及每页候选数所在的 `default.custom.yaml`）并自动重新部署鼠须管。

不需要改任何代码，不需要手动编辑 YAML。面板只以 `patch` 补丁的方式读写这两个用户配置文件，每次写入前自动备份，支持一键撤销。

## 功能

- 自动读取本机鼠须管配置（`~/Library/Rime/squirrel.custom.yaml` 与部署产物 `build/squirrel.yaml`），浅色/深色两套配色分别可调
- 实时预览：按 Squirrel 1.1.2 的绘制几何计算（1 pt = 1 px、留白含窗口圆角、候选间为两个空格宽），字体用 macOS 字体接口探测真实回退结果
- 全部外观参数：字号、字体、边距、圆角、行距、颜色、候选格式、排列方向、翻页区、不透明度、内嵌编码等
- 输入引擎参数「每页候选数」（`menu/page_size`）与「按应用设置」（`app_options`）：前者写入 `default.custom.yaml`，后者写入 `squirrel.custom.yaml`
- 应用后自动调用鼠须管命令行重新部署，并校验部署产物确认生效；未安装鼠须管时仍可编辑，只是无法自动重载
- 每次应用前把原文件备份到 `~/Library/Rime/.panel-backups/`（保留最近 20 份），面板内可一键撤销上次应用；应用与撤销记录可在顶部「部署日志」查看，部署超时后可点「手动重新部署」
- 服务只监听 `127.0.0.1`，其他程序无法访问

## 安装

依赖：**Node.js 18 或更高版本**（macOS 自带）。

### 方式一：下载发布包（推荐）

1. 到本仓库的 [Releases](https://github.com/Pettterooo/squirrel-panel/releases) 页面下载 `squirrel-panel-vX.Y.Z.zip`
2. 解压到任意目录（依赖已打包在内，无需联网安装）
3. 双击 `启动面板.command`，浏览器会自动打开面板

### 方式二：从源码运行

```bash
git clone https://github.com/Pettterooo/squirrel-panel.git
cd squirrel-panel
npm install
npm start        # 或直接双击 启动面板.command
```

面板地址默认为 `http://127.0.0.1:47831`（端口被占用时自动 +1，启动窗口会打印实际地址）。

## 使用

1. 顶部标签切换**浅色 / 深色**配色（跟随 `style/color_scheme` 与 `color_scheme_dark` 的指向）
2. 左侧实时预览，右侧调整参数。修改后点底部「应用到鼠须管」或按 `⌘S`
3. 「同步字号与形状到另一套配色」勾选时，字号、字体、圆角、边距、候选格式会同时写入另一套配色；颜色与方案名称始终只作用于当前配色
4. 「撤销上次应用」恢复上一次写入前的文件；「还原为文件值」丢弃未应用的修改
5. 部署较慢时底部会倒计时，超时后可点「手动重新部署」；顶部「部署日志」查看每次应用/撤销的部署结果与耗时

## 参数对照表

面板中所有参数、写入位置、取值与默认值（默认值即未设置时鼠须管的行为）：

### 字号与字体（写入 `preset_color_schemes/<方案>/`）

| 参数 | 含义 | 范围 | 默认值 |
| --- | --- | --- | --- |
| `font_point` | 正文字号（pt） | 6–40 | 16 |
| `label_font_point` | 序号字号（pt） | 4–32 | 14 |
| `comment_font_point` | 注释字号（pt） | 4–32 | 12 |
| `font_face` | 正文字体 | 字体名 | PingFangSC |
| `label_font_face` | 序号字体（未设置时跟随 `font_face`） | 字体名 | 跟随 `font_face` |
| `comment_font_face` | 注释字体（未设置时跟随 `font_face`） | 字体名 | 跟随 `font_face` |

### 布局（写入位置分两类，见「级别」列）

| 参数 | 含义 | 范围 | 默认值 | 级别 |
| --- | --- | --- | --- | --- |
| `corner_radius` | 窗口圆角（pt） | 0–30 | 0 | 方案 |
| `hilited_corner_radius` | 选中项圆角（pt） | 0–30 | 0 | 方案 |
| `border_width` | 窗口左右留白（pt） | 0–40 | 0 | 方案 |
| `border_height` | 窗口上下留白（pt） | 0–40 | 0 | 方案 |
| `spacing` | 编码与候选间距（pt） | 0–40 | 10 | style |
| `line_spacing` | 候选行距（pt） | 0–20 | 1 | style |
| `base_offset` | 基线偏移（pt） | -20–20 | 0 | style |
| `shadow_size` | 选中项阴影（pt） | 0–30 | 0 | style |
| `translucency` | 窗口毛玻璃（透明底时可见） | 开/关 | 关 | style |
| `candidate_list_layout` | 候选排列 `linear`/`stacked` | 横排/竖排 | linear | 双写 |
| `inline_preedit` | 编码显示在输入处而非候选窗 | 开/关 | 开 | 双写 |
| `text_orientation` | 文字方向 `horizontal`/`vertical` | 横排/竖排 | horizontal | 双写 |
| `show_paging` | 窗口左侧翻页区（宽＝序号字号×1.5） | 开/关 | 关 | 双写 |
| `inline_candidate` | 首选项直接上屏 | 开/关 | 关 | 双写 |
| `mutual_exclusive` | 编码高亮与选中背景互斥 | 开/关 | 关 | 双写 |
| `alpha` | 窗口不透明度（面板显示 0–100%，配置里是 0–1） | 0–100% | 100% | 双写 |
| `surrounding_extra_expansion` | 屏幕边缘额外扩张（pt） | 0–20 | 0 | 双写 |
| `status_message_type` | 状态栏提示样式 `mix`/`long`/`short` | 三选一 | mix | style |

说明：「方案」= 写在 `preset_color_schemes/<方案>/`；「style」= 写在 `style/`；「双写」= 两处都写（保证任何加载顺序下都生效）。`status_message_type` 没有 `none` 选项；面板里删除该项覆盖即回到鼠须管默认 `mix`。

### 颜色（写入 `preset_color_schemes/<当前方案>/`）

| 参数 | 含义 | 默认值 |
| --- | --- | --- |
| `back_color` | 窗口底色 | 0xFFFFFF |
| `text_color` | 编码文字 | 0x000000 |
| `candidate_text_color` | 候选文字（未设置跟随 `text_color`） | 0x000000 |
| `label_color` | 序号（未设置跟随 `text_color`） | 0x000000 |
| `comment_text_color` | 注释 | 0x888888 |
| `hilited_candidate_back_color` | 选中背景 | 0x000000 |
| `hilited_candidate_text_color` | 选中文字 | 0xFFFFFF |
| `hilited_candidate_label_color` | 选中序号（未设置跟随选中文字） | 0xFFFFFF |

可选颜色（方案级，**未设置时面板显示「未设置」**，实际由鼠须管按源码规则回退）：

| 参数 | 含义 | 未设置时的回退 |
| --- | --- | --- |
| `border_color` | 窗口描边（宽度＝min(border_width, border_height)，为 0 时不画） | 不绘制 |
| `hilited_back_color` | 编码高亮背景 | 不绘制 |
| `hilited_text_color` | 编码高亮文字 | 跟随 `text_color` |
| `preedit_back_color` | 编码底色 | 不绘制 |
| `candidate_back_color` | 候选底色 | 不绘制 |
| `hilited_comment_text_color` | 选中注释颜色 | 跟随 `hilited_candidate_text_color` |

颜色在配置文件里是 `0xAABBGGRR` 格式（透明度+蓝绿红）；面板里的取色器按此换算，显示的是屏幕实际颜色。

### 候选格式与名称（写入 `preset_color_schemes/<方案>/`）

| 参数 | 含义 | 默认值 |
| --- | --- | --- |
| `candidate_format` | 候选模板。占位符：`[label]`＝序号、`[candidate]`＝候选、`[comment]`＝注释；也支持鼠须管写法 `%c`＝序号、`%@`＝候选＋注释 | `[label]. [candidate] [comment]` |
| `name` | 方案名称（只写当前方案，不同步） | 方案 id |

### 输入引擎与按应用参数

| 参数 | 含义 | 范围 | 默认值 | 写入位置 |
| --- | --- | --- | --- | --- |
| `menu/page_size` | 每页候选数（面板预览会按此数量渲染候选） | 1–9 | 5（鼠须管默认部署为 6） | `default.custom.yaml` |

「按应用设置」列出 `app_options` 中生效的应用（Bundle ID），每项两个开关：

| 开关 | 含义 | 级别 |
| --- | --- | --- |
| `ascii_mode` | 在该应用里默认英文输入 | 应用 |
| `no_inline` | 在该应用里关闭内嵌编码 | 应用 |

面板按差异写补丁：只改变化的键；从列表里移除一项会写成 `null`（删除该应用的覆盖），鼠须管自带的默认条目不受影响。你在 `app_options` 下手写的其它键（如 `vim_mode`）会被原样保留。

## 工作原理

1. 面板启动时读取 `~/Library/Rime/squirrel.custom.yaml`（用户补丁）与 `~/Library/Rime/build/squirrel.yaml`（部署产物），按鼠须管的加载顺序合成两套配色的生效值；每页候选数取自 `build/default.yaml`
2. 「应用」时只修改两个配置文件的 `patch` 块：写入前把已存在的原文件备份到 `~/Library/Rime/.panel-backups/`，写入后调用 `/Library/Input Methods/Squirrel.app/Contents/MacOS/Squirrel --reload` 重新部署
3. 部署完成后重新读取 `build/squirrel.yaml` 与 `build/default.yaml` 校验是否生效；不一致时面板会明确提示。撤销会把这次涉及的两个文件一起恢复到应用之前
4. 预览按 Squirrel 1.1.2 源码的绘制几何计算；字体栅格化仍可能有亚像素差异，翻页区、竖排与窗口透明度为示意

## 常见问题

**字体旁边提示「PingFangSC 解析不到，已回退」？**
macOS 上苹方的系统字体名是「PingFang SC」（带空格）。把字体改成 `PingFang SC` 即可中英文都用苹方。面板会通过 macOS 字体接口探测你输入的名字实际解析到什么字体，并显示回退结果。

**双击 `启动面板.command` 提示无法打开？**
macOS 对从网上下载的文件加了隔离属性。右键 →「打开」，或在终端执行：

```bash
chmod +x "启动面板.command"
xattr -dr com.apple.quarantine "启动面板.command"
```

**提示找不到 Node.js？**
安装 Node.js 18+：[nodejs.org](https://nodejs.org/) 下载安装包，或 `brew install node`。装好后重新双击启动脚本。

**没装鼠须管能用吗？**
面板能正常读取和编辑配置文件（若存在），但无法自动重载生效，会提示先安装鼠须管。

**面板会改我别的配置文件吗？**
不会。只读写 `squirrel.custom.yaml`、`default.custom.yaml`（仅当你调整每页候选数时）与备份目录 `~/Library/Rime/.panel-backups/`；其他 rime 文件一概不动。若担心，删除备份目录前可先查看其中 `.bak` 文件。

**如何卸载？**
删除面板文件夹即可。面板写入的配置留在 `squirrel.custom.yaml` 的 `patch` 块里，如需还原可在面板里点「撤销上次应用」，或删除 `patch:` 下对应的段落后重新部署。

## 开发

```bash
npm install
npm test         # 35 个单元测试（node:test）
npm start        # 127.0.0.1:47831
```

目录结构：

```
server.mjs            本地 HTTP 服务（仅监听 127.0.0.1）
lib/config.mjs        配置读写、模型合成、校验、备份/撤销
lib/color.mjs         颜色格式换算（0xAABBGGRR ↔ 面板色）
lib/rime.mjs          调用鼠须管命令行部署
lib/fonts.mjs         字体探测（tools/fontprobe.swift，经 macOS 字体接口）
tools/fontprobe.swift 字体解析脚本（可选，缺失时字体回退提示降级）
public/index.html     面板结构（无构建步骤）
public/styles.css     面板样式（CSS 变量令牌）
public/app.js         面板逻辑（预览、编辑、应用）
test/config.test.mjs  单元测试
scripts/package-release.sh  打包发布 zip（含依赖）
```

## 许可

[MIT](LICENSE)。预览几何按鼠须管（Squirrel）开源源码绘制规则实现，本面板本身与鼠须管项目无隶属关系。
