# NASA Eyes 星表二进制（vendored）

本目录存放 [NASA Eyes on the Solar System](https://eyes.nasa.gov/apps/solar-system/) 静态资源中的恒星/星系点源目录，格式与 Eyes 运行时一致。

## 文件

- `stars.0.dat` … `stars.5.dat`（Eyes 原始为 `.bin`，入库改为 `.dat`，避免 Windows 浏览器弹出下载）
- `galaxies.0.dat`

原始 URL（仅用于离线下载入库，应用运行时读本地路径）：

`https://eyes.nasa.gov/assets/static/stars/<filename>`

下载时需带 Referer `https://eyes.nasa.gov/apps/solar-system/`。

## 二进制布局（小端）

每文件：

1. `int32 count`
2. 重复 `count` 次，每条 23 字节：
   - `float32 mag`（视星等；尺寸主要用 absMag）
   - `float32 absMag`
   - `uint8 r, g, b`
   - `float32 y_raw` → 位置 `y = -y_raw`
   - `float32 z`
   - `float32 x`

加载后应用 ecliptic→J2000 四元数 `(w,x,y,z)=(0.9791532214288992, 0.2031230389823101, 0, 0)`，颜色按 `max(rgb)` 归一。

分片按视星等划分：`stars.0` 为 mag ≤ 6.0，之后依次到 mag ≈ 8.03；缺可靠视差的星距离钉在 3.09e20 m（10 kpc）。

场景侧由 `js/starfield.js` 解析并以 Cesium `BillboardCollection` 绘制，亮度/尺寸/片元核公式与 Eyes `StarfieldComponent` 着色器一致（亮度由 `absMag` 与星表真实距离推出，因此距离字段不可丢）；日心场景用中心天体 `Inertial2Fixed` 每帧锁定到惯性系。完整原理见仓库根目录 `skybox原理.md`。
