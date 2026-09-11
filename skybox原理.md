# Cesium 星空（SkyBox）原理 — AnotherCesiumSkybox

> 本文从 ASTROX.SolarViewer 的 `skybox原理.md` 思路移植，并改写为**本独立仓库**的路径与实现选择。

## 1. 默认 SkyBox 在做什么？

Cesium 默认 `Scene.skyBox` 是一张**立方体贴图**（六张图：±X ±Y ±Z），在着色器里用视线方向采样，画出“远方星空”。

特点：

- 坐标轴约定为 **TEME**（真赤道平春分点），随地球姿态相关变换绘制；
- 星点是贴图像素，**不是**星表里的逐颗天体；
- 难以按星等缩放、按光谱着色，也难与真实赤经赤纬星表对齐。

本演示在 `index.html` 里关闭默认天空：

```js
skyBox: false,
skyAtmosphere: false,
// …
viewer.scene.backgroundColor = Cesium.Color.BLACK;
```

## 2. 为什么改用 BillboardCollection？

| 方案 | 优点 | 缺点 |
|------|------|------|
| 默认 `SkyBox` | 内置、开销低 | 贴图星空，难对齐星表 |
| `PointPrimitiveCollection` | 单点绘制、吞吐高 | 无纹理光晕，观感偏“硬点” |
| **`BillboardCollection`（本仓库）** | 共享纹理、柔和光斑、易调缩放/颜色 | 比 Point 稍重，但仍适合数千～万级亮星 |

SolarViewer 一侧可能使用 `PointPrimitive`；**本仓库按产品要求改为 `BillboardCollection`**，以更接近 NASA Eyes 的柔和星点/星系光斑。实现见 `js/starfield.js`。

核心流程：

1. `fetch('assets/eyes-stars/stars.0.dat')` 等分片；
2. `parseEyesDat` 读出颜色与笛卡尔位置；
3. `billboards.add({ position, image, color, scale, disableDepthTestDistance: Infinity })`；
4. 每帧更新 `collection.modelMatrix`。

## 3. 惯性锁定：Inertial → Fixed

星表位置按**惯性系**（近似 ICRF / 恒星自行忽略）存放。Cesium 场景默认在**地固系**（ITRF/Fixed）里渲染地球。

若不对集合做变换，相机会看到星空和地球一起“粘”在 ECEF 里，**无法**表现“地球在转、星空相对惯性固定”。

正确的简单做法（本演示已实现）：

```js
const m = Cesium.Transforms.computeIcrfToFixedMatrix(clock.currentTime);
collection.modelMatrix = Cesium.Matrix4.fromRotationTranslation(m, Cesium.Cartesian3.ZERO);
```

在 `scene.preRender` 里每帧更新。这样：

- 地球仍在 Fixed 下自转；
- 星空 Billboard 从惯性坐标变到当前 Fixed，**相对惯性空间保持不动**；
- 若上层再开“惯性相机”模式，观感与 SolarViewer 笔记一致：星空钉在惯性天球上。

IAU 数据未就绪时，代码会短暂回退到 `computeTemeToPseudoFixedMatrix`。

## 4. 资产路径（本仓库）

```
assets/eyes-stars/
  stars.0.dat
  galaxies.0.dat
  README.md          ← 二进制布局说明
js/starfield.js      ← 解析 + BillboardCollection + 惯性锁
index.html           ← CDN Cesium 入口
```

`.dat` **必须**通过 HTTP(S) 加载（`fetch`）；用浏览器直接打开 `file://` 会失败。请用根目录的 `serve.bat` / `serve.sh` 或任意静态服务器。

## 5. 与默认 SkyBox 的直观对比

- **SkyBox**：一张包住相机的盒子贴图；改时间/坐标系主要靠 TEME 相关矩阵。
- **Billboard 星表**：每颗星一个精灵；位置来自目录，颜色/大小可编程；用 **ICRF→Fixed** 显式锁定惯性天球。

## 6. 后续若接入 SolarViewer 原始 Eyes 星表

覆盖 `assets/eyes-stars/` 后，若头/记录布局不同，只改 `parseEyesDat`，渲染与惯性锁逻辑可保持不变。
