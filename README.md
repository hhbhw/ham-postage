# HAM 寄卡资费比价器

业余无线电 QSL 卡寄送的中国邮政资费小工具。输入「目的地（国家名 / 对方呼号）+ 卡片数量 + 是否要追踪」→
按实际资费给出最省方式 + 全量备选（按价格排序），手机友好，可装为 PWA 离线用。

**🌐 在线访问：<https://hhbhw.github.io/ham-postage/>**（PWA：手机浏览器「添加到主屏」后离线可用）

## 它解决的问题

中国邮政官方 [tariffQuery](https://dey.11185.cn/wx/#/tariffQuery) 查询页对 HAM
不友好：要逐项查、自己对照重量算累进、不能横向比较。这个工具一屏给完答案。

**核心立场：客观比价。** 不预设任何寄法便宜（邮政调价后印刷品续重不便宜了，
没有「标准类别」之说），由数据决定。

## 形态

纯静态 PWA：

- 无后端、无数据库 —— 所有资费/分组/呼号前缀数据是构建期固化的 JSON
- Vite + Preact + TypeScript（gzip 后整个 bundle ~26 KB）
- vite-plugin-pwa：service worker 全量预缓存，首次访问后离线可用
- 部署 = 把 `dist/` 扔到任何静态主机（GitHub Pages / Cloudflare Pages / 自建 Nginx）

## 开发

```bash
npm install                # 首装；esbuild 需要 npm approve-scripts esbuild
npm run dev                # http://localhost:2469
npm test                   # vitest（23 用例，覆盖引擎公式 + DXCC + 端到端样例）
npm run build              # 输出到 dist/
npm run preview            # 本地预览构建产物
```

`predev` / `prebuild` 钩子会先跑 `scripts/csv-to-json.mjs`，把
`src/data-raw/postage_parcel_rates.csv` 转成 `src/data/parcel_rates.json`（已 gitignore）。

## 部署

```bash
npm run build
# 把 dist/ 拷到任意静态主机
```

注意：

- `start_url` / `scope` 用了 `./`，所以可以放在任意子路径下（如
  `https://example.com/qsl/`）而不破坏 PWA 安装
- 全部资源是静态的 → CDN 缓存友好；service worker 用 `autoUpdate`，新版本部署后
  用户下次打开会自动激活

## 数据来源

数据复制自姊妹项目 [qsl-manager](https://github.com/hhbhw/qsl-manager) 已校对过的资费表：

| 文件 | 内容 | 来源 |
|---|---|---|
| `src/data/postage_seed.json` | 信函/印刷品/M-bag 资费 + 国家分组 + 附加费 | 中国邮政国际函件资费表（照片校对） |
| `src/data-raw/postage_parcel_rates.csv` | 包裹资费 485 行（航空/水陆/SAL/港澳台） | 中国邮政国际包裹资费表 |
| `src/data/callsign_prefixes.json` | 呼号前缀 → DXCC 实体 → 中文目的地 | IARU QSL Bureau 列表 |

**费率可能随邮政调整变动 → 直接改 JSON/CSV 即可生效，不改代码。**
若上游资费更新，重新从 qsl-manager 同步对应文件即可。

> 已知坑：`postage_seed.json` 里 `_dest_groups_note`（说明性字段，不参与计算）
> 在上游某次 commit 里曾因未转义双引号导致 JSON 无效。本仓库已修；如重新同步要留意。

## 官方页面

UI 右下角放了一个「向邮政官方核验当前资费 ↗」链接指向 11185.cn 查询页。
**这是参考入口，不是数据源** —— 不抓取、不解析、不依赖它在线。

## 工作机制（要点）

引擎在 `src/engine/postage.ts`（port 自 qsl-manager 的 Python 引擎，
4 个公式 1:1 对照）：

- **平信/印刷品** — 累进计费 + 单件上限拆件（每件重付首重）
- **印刷品专袋 M-bag** — 5kg 起步封底，续重每 1kg
- **包裹** — 1kg 起重封底（不足 1kg 按 1kg），续重每 1kg
- **追踪溢价** — 平信/印刷品默认无追踪，开启「需要追踪」时按件加挂号（16/件），
  M-bag 加 80/袋；包裹自带追踪不变价

**数据缺口处理：** 分组未知的方式不强行估算，附 `notes` 说明；不预设便宜。

呼号解析在 `src/engine/dxcc.ts`：IARU 前缀区间展开 + 最长前缀匹配，
显式单前缀覆盖区间（如 OY 显式覆盖 OU-OZ 区间）。
后缀 `/P /M /QRP` 等会被剥离；前缀型 `W2/JA1ABC` 取运行地前缀 `W2`。

## 局限

- 包裹尺寸校验：目前只校验重量上限，未校验包裹尺寸三类（多数 QSL 用包裹场景
  不会触发尺寸限制）
- 部分目的地的「信函航空」分组未在官方表里明确归类（俄罗斯联邦、塞浦路斯、加那利
  群岛等 5 个）—— 这些目的地不出信函航空估算，由 `notes` 标注
- 不计算保价费、回执费等小众附加业务

## 协议

代码 MIT。资费数据为公开信息整理，准确性以邮政实际收寄为准。
