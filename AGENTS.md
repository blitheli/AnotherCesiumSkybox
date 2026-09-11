# AGENTS.md — AnotherCesiumSkybox

## 目标

最小可运行的 Cesium CDN 演示：用 `BillboardCollection` 画星表星空，关掉默认 SkyBox。

## 不要做的事

- 不要引入完整 SolarViewer / 本地 vendored Cesium 树（除非用户明确要求离线包）。
- 不要提交 Cesium Ion token 或其它密钥。
- 不要把默认渲染改回 `SkyBox` cubemap，除非用户改需求。

## 关键文件

- `js/starfield.js` — 解析 `.dat`、Billboard、ICRF→Fixed
- `assets/eyes-stars/` — NASA Eyes 星表（`stars.0–5.dat` + `galaxies.0.dat`）；格式见该目录 README；`starfield.js` 必须加载全部恒星分片
- `index.html` — CDN Cesium 钉扎版本号
- `skybox原理.md` — 中文原理（保持中文）

## 改星表格式时

只动 `parseEyesDat` + `assets/eyes-stars/README.md` + 解析测试；保持 Billboard 与惯性锁 API 稳定。

## 验证

```bash
node test/starfieldParseTest.js
./serve.sh   # 浏览器打开后应看到恒星环绕暗色地球
```
