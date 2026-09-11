# eyes-stars 星表资产

本目录存放 NASA Eyes 风格星空演示所用的二进制星表。

## 文件

| 文件 | 说明 |
|------|------|
| `stars.0.dat` | 恒星分片（当前为 World Wind Hipparcos Mag≤6 子集，5044 颗） |
| `galaxies.0.dat` | 星系/深空光斑分片（演示用稀疏采样） |
| `README.md` | 本说明 |

命名约定 `stars.*.dat` / `galaxies.*.dat` 便于按分片扩展（`stars.1.dat` …）。

## 二进制格式（little-endian）

与 NASA World Wind `Hipparcos_Stars_Mag*.dat` 兼容：

1. `float32` — 星球半径（米）
2. 重复 N 次，每次 6 × `float32`：
   - `r, g, b` — 颜色，范围约 0–1
   - `x, y, z` — 笛卡尔位置（米），以原点（地球质心）为球心

解析见仓库根目录 `js/starfield.js` 中的 `parseEyesDat`。

## 与 ASTROX.SolarViewer 的关系

目标是从私有/兄弟仓库 `blitheli/ASTROX.SolarViewer` 的 `assets/eyes-stars/` **原样拷贝**真实 Eyes 导出星表。  
当前 Cloud Agent 的 GitHub token **无法读取该私有仓**，因此先放入兼容格式的公开 Hipparcos 数据，保证 CDN 演示可跑。

当你能访问 SolarViewer 后：

1. 用其 `assets/eyes-stars/` 覆盖本目录；
2. 若二进制布局不同，只需调整 `parseEyesDat`（并更新本 README 与 `skybox原理.md`）；
3. 跑 `node test/starfieldParseTest.js` 做解析冒烟。

## 许可提示

`stars.0.dat` 内容源自 NASA World Wind 附带的 Hipparcos 子集（Apache-2.0 分发的工程资产）。  
若替换为 NASA Eyes 安装包内提取的数据，请自行确认分发许可后再公开托管。
