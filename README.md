# AnotherCesiumSkybox

用 **Cesium `BillboardCollection`** 绘制 NASA Eyes 风格星空，**替换默认 SkyBox 立方体贴图**。默认从 **CDN** 加载 Cesium.js，无需 npm 即可运行。

中文原理说明见 [`skybox原理.md`](./skybox原理.md)。

## 快速运行 / Quick start

星表 `.dat` 需通过 HTTP 拉取，请勿用 `file://` 直接打开。

**Windows（推荐）：** 双击 `serve.bat`，浏览器打开提示的地址（默认 <http://localhost:8080>）。

**macOS / Linux：**

```bash
./serve.sh
# 或: python3 -m http.server 8080
```

然后打开 <http://localhost:8080/>。

### English

1. Serve the repo root over HTTP (`.bat` / `serve.sh` / any static server).
2. Open `index.html` via that server.
3. Cesium is loaded from a pinned CDN build (`1.145`); no Ion token is required for this starfield demo.

## 仓库结构

```
index.html              # CDN Cesium 入口，关闭默认 SkyBox
js/starfield.js         # BillboardCollection 星空 + ICRF→Fixed 锁定
assets/eyes-stars/      # stars.*.dat / galaxies.*.dat
skybox原理.md           # 中文原理
serve.bat / serve.sh    # 本地静态服务
test/starfieldParseTest.js
AGENTS.md
```

## 实现要点

- **渲染：** `Cesium.BillboardCollection`（非默认 `SkyBox`，亦非 `PointPrimitive`）。
- **数据：** `assets/eyes-stars/*.dat`（当前为 World Wind Hipparcos 兼容二进制；见该目录 README）。
- **惯性锁：** 每帧 `computeIcrfToFixedMatrix` 写入 collection 的 `modelMatrix`。
- **无 Ion：** `baseLayer: false`，仅显示着色地球椭球 + 星空。

### 可选：本地 Cesium 拷贝

若需离线调试，可将 Cesium 构建放到例如 `vendor/cesium/`，并改 `index.html` 中的 script/css 路径；日常演示仍以 CDN 为准。

## 来源说明

目标从 [`ASTROX.SolarViewer`](https://github.com/blitheli/ASTROX.SolarViewer) 移植 `skybox原理.md`、`js/starfield.js`、`assets/eyes-stars/` 等。若构建环境无法读取该私有仓，本仓库会先用兼容公开星表保证可运行；拿到原资产后覆盖 `assets/eyes-stars/` 并按需调整 `parseEyesDat` 即可。

## 许可

演示代码以本仓库许可为准。`stars.0.dat` 当前来自 NASA World Wind 附带 Hipparcos 子集（见 `assets/eyes-stars/README.md`）。
