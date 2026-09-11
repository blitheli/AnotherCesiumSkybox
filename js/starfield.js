/**
 * NASA Eyes 风格星空：用 Cesium.BillboardCollection 绘制恒星/星系，
 * 取代默认 SkyBox 立方体贴图。
 *
 * 亮度 / 尺寸 / 片元核与 NASA Eyes StarfieldComponent 一致：
 * brightness = 2·ln(1 + flux(absMag, d)·1e4)，绝大多数星是 5px 针尖。
 *
 * 星表：`assets/eyes-stars/stars.0.dat` … `stars.5.dat` + `galaxies.0.dat`
 * 二进制布局见 `assets/eyes-stars/README.md`。
 */

const DEFAULT_ASSETS = {
  stars: [
    "assets/eyes-stars/stars.0.dat",
    "assets/eyes-stars/stars.1.dat",
    "assets/eyes-stars/stars.2.dat",
    "assets/eyes-stars/stars.3.dat",
    "assets/eyes-stars/stars.4.dat",
    "assets/eyes-stars/stars.5.dat",
  ],
  galaxies: ["assets/eyes-stars/galaxies.0.dat"],
};

/** Eyes：黄道系 → J2000 四元数 (w, x, y, z) */
const ECLIPTIC_TO_J2000 = Object.freeze({
  w: 0.9791532214288992,
  x: 0.2031230389823101,
  y: 0,
  z: 0,
});

const RECORD_BYTES = 23;
/** 渲染球半径（米）：日心/拉远视角仍落在 far 内 */
const STAR_SPHERE_RADIUS = 5e14;

const EYES_LUMINOSITY_AT_ABS_MAG_0 = 3.0128e28;
const EYES_SPRITE_MIN_PX = 5;
const EYES_SPRITE_MAX_PX = 50;
const EYES_ALPHA_MIN = 0.05;
const EYES_ALPHA_MAX = 1;
const EYES_SPRITE_KERNEL_POWER = 5;
const STAR_SPRITE_TEXTURE_SIZE = 64;
const STAR_SPRITE_IMAGE_ID = "eyes-star-sprite";
const RESIZE_REBUILD_RATIO = 0.05;

export const DEFAULT_STAR_APPEARANCE = Object.freeze({
  sizeScale: 1,
  alphaScale: 1,
});

/**
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{
 *   count: number,
 *   items: Array<{
 *     mag: number,
 *     absMag: number,
 *     color: number[],
 *     position: number[],
 *     distance: number
 *   }>
 * }}
 */
export function parseEyesDat(buffer) {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (bytes.byteLength < 4) {
    throw new Error("星表过小或为空");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getInt32(0, true);
  if (count < 0) {
    throw new Error(`星表 count 无效: ${count}`);
  }
  const expected = 4 + count * RECORD_BYTES;
  if (bytes.byteLength !== expected) {
    throw new Error(
      `星表长度异常: ${bytes.byteLength} 字节（期望 ${expected} = 4 + ${count}*23）`
    );
  }

  const items = new Array(count);
  for (let i = 0; i < count; i++) {
    const o = 4 + i * RECORD_BYTES;
    const mag = view.getFloat32(o + 0, true);
    const absMag = view.getFloat32(o + 4, true);
    let r = bytes[o + 8] / 255;
    let g = bytes[o + 9] / 255;
    let b = bytes[o + 10] / 255;
    const maxC = Math.max(r, g, b, 1e-6);
    r /= maxC;
    g /= maxC;
    b /= maxC;

    const yRaw = view.getFloat32(o + 11, true);
    const z = view.getFloat32(o + 15, true);
    const x = view.getFloat32(o + 19, true);
    const y = -yRaw;

    const [jx, jy, jz] = rotateByQuaternion(x, y, z, ECLIPTIC_TO_J2000);
    const distance = Math.hypot(jx, jy, jz) || 1;

    items[i] = {
      mag,
      absMag,
      color: [r, g, b],
      position: [jx, jy, jz],
      distance,
    };
  }

  return { count, items };
}

/** q * v * q^{-1}，q = {w,x,y,z} */
function rotateByQuaternion(x, y, z, q) {
  const { w, x: qx, y: qy, z: qz } = q;
  const ix = w * x + qy * z - qz * y;
  const iy = w * y + qz * x - qx * z;
  const iz = w * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * w + iw * -qx + iy * -qz - iz * -qy,
    iy * w + iw * -qy + iz * -qx - ix * -qz,
    iz * w + iw * -qz + ix * -qy - iy * -qx,
  ];
}

/** Eyes：particleSize = sqrt(max(w,h) * dpr) / 60 */
export function eyesParticleSize(width, height, devicePixelRatio = 1) {
  const longest = Math.max(width || 0, height || 0);
  if (!(longest > 0)) return 1;
  return Math.sqrt(longest * (devicePixelRatio || 1)) / 60;
}

/** Eyes：brightness = 2 * ln(1 + flux(absMag, d) * 1e4) */
export function eyesStarBrightness(absMag, distanceMeters) {
  if (!(distanceMeters > 0) || !Number.isFinite(absMag)) return 0;
  const luminosity =
    EYES_LUMINOSITY_AT_ABS_MAG_0 * Math.pow(10, absMag / -2.5);
  const flux = luminosity / (4 * Math.PI * distanceMeters * distanceMeters);
  return 2 * Math.log(1 + flux * 1e4);
}

export function eyesStarAlpha(brightness, particleSize) {
  const a = brightness * particleSize;
  if (!Number.isFinite(a)) return EYES_ALPHA_MIN;
  return Math.min(EYES_ALPHA_MAX, Math.max(EYES_ALPHA_MIN, a));
}

export function eyesStarSpriteSize(brightness, particleSize) {
  const size = brightness * 4 * particleSize;
  if (!Number.isFinite(size)) return EYES_SPRITE_MIN_PX;
  return Math.min(EYES_SPRITE_MAX_PX, Math.max(EYES_SPRITE_MIN_PX, size));
}

/** Eyes 片元核：a = clamp(1 - 2r, 0, 1)^5 */
export function eyesSpriteKernel(r) {
  const edge = Math.min(1, Math.max(0, 1 - 2 * r));
  return Math.pow(edge, EYES_SPRITE_KERNEL_POWER);
}

export function billboardSizeFromEyes(
  brightness,
  particleSize,
  pixelRatio,
  appearance
) {
  const devicePx = eyesStarSpriteSize(brightness, particleSize);
  const scale = appearance?.sizeScale ?? 1;
  return (devicePx / (pixelRatio || 1)) * scale;
}

export function billboardAlphaFromEyes(brightness, particleSize, appearance) {
  const a =
    eyesStarAlpha(brightness, particleSize) * (appearance?.alphaScale ?? 1);
  return Math.min(1, Math.max(0, a));
}

/** 由 absMag 与真实距离推出 Billboard 像素尺度（Eyes 公式，dpr=1） */
export function scaleFromAbsMagAndDistance(absMag, distanceM, isGalaxy = false) {
  const brightness = eyesStarBrightness(absMag, distanceM);
  const size = eyesStarSpriteSize(brightness, eyesParticleSize(1400, 900, 1));
  return isGalaxy ? Math.max(size, EYES_SPRITE_MIN_PX) : size;
}

/** 生成 Eyes 同款星点精灵（白色 RGB，alpha 按核函数衰减） */
export function createEyesStarSprite(size = STAR_SPRITE_TEXTURE_SIZE) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - center, y - center) / size;
      const a = eyesSpriteKernel(r);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** @deprecated 保留旧名；实际返回 Eyes 核精灵的 data URL */
export function createStarImage(size = 32, _soft = false) {
  return createEyesStarSprite(size).toDataURL("image/png");
}

function toRenderPosition(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  const s = STAR_SPHERE_RADIUS / len;
  return [x * s, y * s, z * s];
}

async function fetchDat(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`无法加载 ${url}: HTTP ${res.status}`);
  }
  return res.arrayBuffer();
}

function currentParticleSize(viewer) {
  const canvas = viewer?.scene?.canvas;
  const dpr =
    (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  return eyesParticleSize(canvas?.clientWidth, canvas?.clientHeight, dpr);
}

function currentPixelRatio(viewer) {
  const ratio = viewer?.scene?.pixelRatio;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function ensureFarCoversStarSphere(viewer) {
  const frustum = viewer.camera?.frustum;
  if (frustum && typeof frustum.far === "number") {
    frustum.far = Math.max(frustum.far, STAR_SPHERE_RADIUS * 2, 2e15);
  }
}

function applyParticleSize(collection, brightnessList, particleSize, pixelRatio, appearance) {
  const n = Math.min(collection.length, brightnessList.length);
  for (let i = 0; i < n; i++) {
    const billboard = collection.get(i);
    const size = billboardSizeFromEyes(
      brightnessList[i],
      particleSize,
      pixelRatio,
      appearance
    );
    billboard.width = size;
    billboard.height = size;
    billboard.color = Cesium.Color.fromAlpha(
      billboard.color,
      billboardAlphaFromEyes(brightnessList[i], particleSize, appearance)
    );
  }
}

/**
 * 每帧将 BillboardCollection.modelMatrix 设为 ICRF→Fixed，
 * 使星表坐标（惯性系）在地球自转时仍相对惯性空间固定。
 */
function bindInertialLock(viewer, collection) {
  const scratch = new Cesium.Matrix3();
  const scratch4 = new Cesium.Matrix4();
  return viewer.scene.preRender.addEventListener(() => {
    ensureFarCoversStarSphere(viewer);
    const time = viewer.clock.currentTime;
    const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time, scratch);
    if (!Cesium.defined(icrfToFixed)) {
      const teme = Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, scratch);
      if (Cesium.defined(teme)) {
        collection.modelMatrix = Cesium.Matrix4.fromRotationTranslation(
          teme,
          Cesium.Cartesian3.ZERO,
          scratch4
        );
      }
      return;
    }
    collection.modelMatrix = Cesium.Matrix4.fromRotationTranslation(
      icrfToFixed,
      Cesium.Cartesian3.ZERO,
      scratch4
    );
  });
}

function addCatalogItems(collection, items, spriteImage, particleSize, pixelRatio, appearance, brightnessList) {
  let count = 0;
  for (const item of items) {
    const [rx, ry, rz] = toRenderPosition(
      item.position[0],
      item.position[1],
      item.position[2]
    );
    const brightness = eyesStarBrightness(item.absMag, item.distance);
    const size = billboardSizeFromEyes(
      brightness,
      particleSize,
      pixelRatio,
      appearance
    );
    const alpha = billboardAlphaFromEyes(brightness, particleSize, appearance);
    const [r, g, b] = item.color;
    collection.add({
      position: new Cesium.Cartesian3(rx, ry, rz),
      image: spriteImage,
      imageId: STAR_SPRITE_IMAGE_ID,
      color: new Cesium.Color(r, g, b, alpha),
      width: size,
      height: size,
      sizeInMeters: false,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
    });
    brightnessList.push(brightness);
    count++;
  }
  return count;
}

/**
 * @param {Cesium.Viewer} viewer
 * @param {object} [options]
 * @param {string[]} [options.starUrls]
 * @param {string[]} [options.galaxyUrls]
 * @param {boolean} [options.inertialLock=true]
 * @param {number} [options.maxStars] 可选上限，便于弱设备调试
 * @param {{sizeScale?:number, alphaScale?:number}} [options.appearance]
 */
export async function createStarfield(viewer, options = {}) {
  const starUrls = options.starUrls || DEFAULT_ASSETS.stars;
  const galaxyUrls = options.galaxyUrls || DEFAULT_ASSETS.galaxies;
  const inertialLock = options.inertialLock !== false;
  const maxStars = options.maxStars;
  const appearance = { ...DEFAULT_STAR_APPEARANCE, ...(options.appearance || {}) };

  const spriteImage = createEyesStarSprite();
  const particleSize = currentParticleSize(viewer);
  const pixelRatio = currentPixelRatio(viewer);

  const stars = viewer.scene.primitives.add(
    new Cesium.BillboardCollection({
      scene: viewer.scene,
      blendOption: Cesium.BlendOption.TRANSLUCENT,
    })
  );
  const galaxies = viewer.scene.primitives.add(
    new Cesium.BillboardCollection({
      scene: viewer.scene,
      blendOption: Cesium.BlendOption.TRANSLUCENT,
    })
  );

  let starCount = 0;
  let galaxyCount = 0;
  const shardCounts = [];
  const starBrightness = [];
  const galaxyBrightness = [];

  for (const url of starUrls) {
    const parsed = parseEyesDat(await fetchDat(url));
    shardCounts.push({ url, count: parsed.count });
    let items = parsed.items;
    if (typeof maxStars === "number") {
      items = items.slice(0, Math.max(0, maxStars - starCount));
    }
    starCount += addCatalogItems(
      stars,
      items,
      spriteImage,
      particleSize,
      pixelRatio,
      appearance,
      starBrightness
    );
    if (typeof maxStars === "number" && starCount >= maxStars) break;
  }

  for (const url of galaxyUrls) {
    try {
      const parsed = parseEyesDat(await fetchDat(url));
      galaxyCount += addCatalogItems(
        galaxies,
        parsed.items,
        spriteImage,
        particleSize,
        pixelRatio,
        appearance,
        galaxyBrightness
      );
    } catch (err) {
      console.warn("[starfield] 跳过星系表", url, err);
    }
  }

  try {
    viewer.scene.logarithmicDepthBuffer = true;
  } catch (_) {
    /* ignore */
  }
  ensureFarCoversStarSphere(viewer);

  let appliedParticleSize = particleSize;
  let resizeTimer = null;
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const next = currentParticleSize(viewer);
      if (!(appliedParticleSize > 0)) return;
      const ratio = Math.abs(next - appliedParticleSize) / appliedParticleSize;
      if (ratio < RESIZE_REBUILD_RATIO) return;
      const pr = currentPixelRatio(viewer);
      applyParticleSize(stars, starBrightness, next, pr, appearance);
      applyParticleSize(galaxies, galaxyBrightness, next, pr, appearance);
      appliedParticleSize = next;
      viewer.scene?.requestRender?.();
    }, 200);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("resize", onResize);
  }

  let removeLock = () => {};
  if (inertialLock) {
    try {
      await Cesium.Transforms.preloadIcrfFixed(
        new Cesium.TimeInterval({
          start: Cesium.JulianDate.addDays(
            viewer.clock.currentTime,
            -1,
            new Cesium.JulianDate()
          ),
          stop: Cesium.JulianDate.addDays(
            viewer.clock.currentTime,
            1,
            new Cesium.JulianDate()
          ),
        })
      );
    } catch (e) {
      console.warn("[starfield] preloadIcrfFixed 失败，将回退 TEME", e);
    }
    const removeStars = bindInertialLock(viewer, stars);
    const removeGalaxies = bindInertialLock(viewer, galaxies);
    removeLock = () => {
      removeStars();
      removeGalaxies();
    };
  }

  return {
    stars,
    galaxies,
    stats: {
      starCount,
      galaxyCount,
      shardCounts,
      renderRadius: STAR_SPHERE_RADIUS,
    },
    destroy() {
      removeLock();
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onResize);
      }
      if (resizeTimer) clearTimeout(resizeTimer);
      viewer.scene.primitives.remove(stars);
      viewer.scene.primitives.remove(galaxies);
    },
  };
}

export default {
  parseEyesDat,
  createStarImage,
  createEyesStarSprite,
  createStarfield,
  scaleFromAbsMagAndDistance,
  eyesParticleSize,
  eyesStarBrightness,
  eyesStarAlpha,
  eyesStarSpriteSize,
  eyesSpriteKernel,
  billboardSizeFromEyes,
  billboardAlphaFromEyes,
};
