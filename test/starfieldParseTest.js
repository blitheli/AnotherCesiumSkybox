/**
 * 星表解析 + Eyes 亮度/尺寸映射（纯 Node，不依赖 Cesium）。
 * 用法: node test/starfieldParseTest.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const {
  parseEyesDat,
  eyesParticleSize,
  eyesStarBrightness,
  eyesStarAlpha,
  eyesStarSpriteSize,
  eyesSpriteKernel,
  billboardSizeFromEyes,
  billboardAlphaFromEyes,
} = await import(pathToFileURL(path.join(root, "js/starfield.js")).href);

const STAR_SHARDS = [
  "assets/eyes-stars/stars.0.dat",
  "assets/eyes-stars/stars.1.dat",
  "assets/eyes-stars/stars.2.dat",
  "assets/eyes-stars/stars.3.dat",
  "assets/eyes-stars/stars.4.dat",
  "assets/eyes-stars/stars.5.dat",
];

function check(rel) {
  const file = path.join(root, rel);
  const buf = fs.readFileSync(file);
  const parsed = parseEyesDat(buf);
  const sample = parsed.items[0];
  console.log(
    `OK ${rel}: count=${parsed.count} sampleMag=${sample.mag.toFixed(2)} dist=${sample.distance.toExponential(2)}`
  );
  if (parsed.count <= 0) throw new Error(`${rel} 无记录`);
  if (!Number.isFinite(sample.distance) || sample.distance <= 0) {
    throw new Error(`${rel} 距离无效`);
  }
  return parsed;
}

let totalStars = 0;
for (const shard of STAR_SHARDS) {
  totalStars += check(shard).count;
}
const galaxies = check("assets/eyes-stars/galaxies.0.dat");

if (STAR_SHARDS.length !== 6) {
  throw new Error("应加载 stars.0–5 共 6 个分片");
}
if (totalStars < 30000) {
  throw new Error(`恒星总数过少: ${totalStars}`);
}
if (galaxies.count < 500) {
  throw new Error(`星系数量过少: ${galaxies.count}`);
}

console.log(
  `starfieldParseTest: 解析通过（恒星分片 6 个合计 ${totalStars}，星系 ${galaxies.count}）`
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const particleSize = eyesParticleSize(1400, 900, 1);
assert(
  Math.abs(particleSize - Math.sqrt(1400) / 60) < 1e-12,
  `particleSize 应为 sqrt(1400)/60，实际 ${particleSize}`
);

assert(
  eyesStarBrightness(0, 5e15) > eyesStarBrightness(0, 5e18),
  "同一 absMag，距离越远应越暗"
);
assert(
  eyesStarBrightness(-5, 1e16) > eyesStarBrightness(5, 1e16),
  "同一距离，absMag 越小应越亮"
);

assert(eyesStarAlpha(0, particleSize) === 0.05, "极暗星 alpha 应钳到 0.05");
assert(eyesStarAlpha(1e6, particleSize) === 1, "极亮星 alpha 应钳到 1");
assert(eyesStarSpriteSize(0, particleSize) === 5, "极暗星精灵应钳到 5px");
assert(eyesStarSpriteSize(1e6, particleSize) === 50, "极亮星精灵应钳到 50px");

const defaultLook = { sizeScale: 1, alphaScale: 1 };
assert(
  Math.abs(billboardSizeFromEyes(0, particleSize, 1.5, defaultLook) - 5 / 1.5) <
    1e-12,
  "dpr 1.5 时 5px 精灵应为 3.33 billboard 宽度"
);
assert(billboardSizeFromEyes(0, particleSize, 1, defaultLook) === 5, "dpr 1 时保持 5px");
assert(
  Math.abs(billboardSizeFromEyes(0, particleSize, 1, { sizeScale: 0.8 }) - 4) <
    1e-12,
  "sizeScale 应按比例缩放"
);
assert(billboardAlphaFromEyes(1e6, particleSize, defaultLook) === 1, "alpha 仍钳到 1");
assert(
  Math.abs(billboardAlphaFromEyes(1e6, particleSize, { alphaScale: 0.5 }) - 0.5) <
    1e-12,
  "alphaScale 应按比例缩放"
);

assert(eyesSpriteKernel(0) === 1, "核中心应为 1");
assert(
  Math.abs(eyesSpriteKernel(0.2) - Math.pow(0.6, 5)) < 1e-12,
  "r=0.2 应为 0.6^5"
);
assert(
  eyesSpriteKernel(0.5) === 0 && eyesSpriteKernel(0.9) === 0,
  "边缘及以外应为 0"
);

const all = [];
for (const rel of [...STAR_SHARDS, "assets/eyes-stars/galaxies.0.dat"]) {
  const parsed = parseEyesDat(fs.readFileSync(path.join(root, rel)));
  for (const item of parsed.items) {
    const brightness = eyesStarBrightness(item.absMag, item.distance);
    all.push({
      alpha: eyesStarAlpha(brightness, particleSize),
      size: eyesStarSpriteSize(brightness, particleSize),
    });
  }
}
assert(all.length === 43878, `总点数期望 43878，实际 ${all.length}`);

const minSizeRatio = all.filter((s) => s.size <= 5.001).length / all.length;
assert(minSizeRatio > 0.9, `应有 >90% 的星是 5px 精灵，实际 ${minSizeRatio}`);

const alphas = all.map((s) => s.alpha).sort((a, b) => a - b);
const medianAlpha = alphas[Math.floor(alphas.length / 2)];
assert(
  medianAlpha > 0.1 && medianAlpha < 0.6,
  `alpha 中位数应在 0.1–0.6（暗弱为主），实际 ${medianAlpha}`
);
assert(alphas[alphas.length - 1] === 1, "应存在 alpha 达到 1 的亮星");

console.log("starfieldParseTest: Eyes 亮度/尺度映射通过", {
  total: all.length,
  particleSize: +particleSize.toFixed(4),
  minSizeRatio: +minSizeRatio.toFixed(3),
  medianAlpha: +medianAlpha.toFixed(3),
});
