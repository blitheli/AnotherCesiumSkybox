/**
 * 星表解析冒烟测试（纯 Node，不依赖 Cesium）。
 * 用法: node test/starfieldParseTest.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const { parseEyesDat } = await import(
  pathToFileURL(path.join(root, "js/starfield.js")).href
);

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
  `starfieldParseTest: 全部通过（恒星分片 6 个合计 ${totalStars}，星系 ${galaxies.count}）`
);
