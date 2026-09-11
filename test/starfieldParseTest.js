/**
 * 星表解析冒烟测试（纯 Node，不依赖 Cesium）。
 * 用法: node test/starfieldParseTest.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseEyesDat(buffer) {
  if (!buffer || buffer.byteLength < 8) {
    throw new Error("星表过小或为空");
  }
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  const radius = view.getFloat32(0, true);
  const stride = 24;
  const remaining = buffer.byteLength - 4;
  if (remaining % stride !== 0) {
    throw new Error(`长度异常: ${buffer.byteLength}`);
  }
  const count = remaining / stride;
  let minL = Infinity;
  let maxL = -Infinity;
  for (let i = 0; i < count; i++) {
    const o = 4 + i * stride;
    const r = view.getFloat32(o, true);
    const g = view.getFloat32(o + 4, true);
    const b = view.getFloat32(o + 8, true);
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    minL = Math.min(minL, L);
    maxL = Math.max(maxL, L);
  }
  return { radius, count, minL, maxL };
}

function check(rel) {
  const file = path.join(root, rel);
  const buf = fs.readFileSync(file);
  const stats = parseEyesDat(buf);
  console.log(
    `OK ${rel}: count=${stats.count} radius=${stats.radius.toFixed(1)} L=[${stats.minL.toFixed(3)}, ${stats.maxL.toFixed(3)}]`
  );
  if (stats.count <= 0) throw new Error(`${rel} 无记录`);
  if (!(stats.radius > 0)) throw new Error(`${rel} radius 无效`);
  return stats;
}

const stars = check("assets/eyes-stars/stars.0.dat");
const galaxies = check("assets/eyes-stars/galaxies.0.dat");

if (stars.count < 1000) {
  throw new Error("恒星数量过少，可能不是完整 Hipparcos 子集");
}
if (galaxies.count < 10) {
  throw new Error("星系数量过少");
}

console.log("starfieldParseTest: 全部通过");
