/**
 * NASA Eyes 风格星空：用 Cesium.BillboardCollection 绘制恒星/星系，
 * 取代默认 SkyBox 立方体贴图。
 *
 * 本演示刻意选用 BillboardCollection（而非 PointPrimitiveCollection / 默认 SkyBox）：
 * - SkyBox：六面立方体贴图，固定在 TEME，无法按星表逐星着色/缩放。
 * - PointPrimitive：性能好，但仅为 gl_Point，缺少纹理光晕与更柔和的“眼睛”观感。
 * - BillboardCollection：共享纹理图集的视口对齐精灵，易做出柔和星点与星系光斑。
 *
 * 星表：`assets/eyes-stars/stars.0.dat` … `stars.5.dat` + `galaxies.0.dat`
 * 二进制布局见 `assets/eyes-stars/README.md`（与 NASA Eyes / SolarViewer 一致）。
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
/** 渲染球半径（米）：保留星表方向，避免超大坐标精度问题 */
const RENDER_RADIUS_M = 1.0e11;
const PC_IN_METERS = 3.085677581491367e16;

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

/** 由 absMag 与真实距离推出近似视亮度，再映射到 Billboard scale */
export function scaleFromAbsMagAndDistance(absMag, distanceM, isGalaxy = false) {
  const distPc = Math.max(distanceM / PC_IN_METERS, 1e-6);
  // 视星等：m = M + 5 log10(d_pc) - 5
  const appMag = absMag + 5 * Math.log10(distPc) - 5;
  if (isGalaxy) {
    return Math.max(1.2, Math.min(8, 4.5 - 0.35 * appMag));
  }
  return Math.max(0.25, Math.min(3.2, 1.6 - 0.2 * appMag));
}

/** 生成柔和圆形星点纹理（canvas data URL） */
export function createStarImage(size = 32, soft = false) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  if (soft) {
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.25, "rgba(200,220,255,0.45)");
    g.addColorStop(0.6, "rgba(120,160,255,0.12)");
    g.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.85)");
    g.addColorStop(0.7, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas.toDataURL("image/png");
}

function toRenderPosition(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  const s = RENDER_RADIUS_M / len;
  return [x * s, y * s, z * s];
}

async function fetchDat(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`无法加载 ${url}: HTTP ${res.status}`);
  }
  return res.arrayBuffer();
}

/**
 * 每帧将 BillboardCollection.modelMatrix 设为 ICRF→Fixed，
 * 使星表坐标（惯性系）在地球自转时仍相对惯性空间固定。
 */
function bindInertialLock(viewer, collection) {
  const scratch = new Cesium.Matrix3();
  const scratch4 = new Cesium.Matrix4();
  return viewer.scene.preRender.addEventListener(() => {
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

/**
 * @param {Cesium.Viewer} viewer
 * @param {object} [options]
 * @param {string[]} [options.starUrls]
 * @param {string[]} [options.galaxyUrls]
 * @param {boolean} [options.inertialLock=true]
 * @param {number} [options.maxStars] 可选上限，便于弱设备调试
 */
export async function createStarfield(viewer, options = {}) {
  const starUrls = options.starUrls || DEFAULT_ASSETS.stars;
  const galaxyUrls = options.galaxyUrls || DEFAULT_ASSETS.galaxies;
  const inertialLock = options.inertialLock !== false;
  const maxStars = options.maxStars;

  const starImage = createStarImage(32, false);
  const galaxyImage = createStarImage(64, true);

  const stars = viewer.scene.primitives.add(
    new Cesium.BillboardCollection({ scene: viewer.scene })
  );
  const galaxies = viewer.scene.primitives.add(
    new Cesium.BillboardCollection({ scene: viewer.scene })
  );

  let starCount = 0;
  let galaxyCount = 0;
  const shardCounts = [];

  for (const url of starUrls) {
    const parsed = parseEyesDat(await fetchDat(url));
    shardCounts.push({ url, count: parsed.count });
    let items = parsed.items;
    if (typeof maxStars === "number") {
      const remain = Math.max(0, maxStars - starCount);
      items = items.slice(0, remain);
    }
    for (const item of items) {
      const [rx, ry, rz] = toRenderPosition(
        item.position[0],
        item.position[1],
        item.position[2]
      );
      const [r, g, b] = item.color;
      stars.add({
        position: new Cesium.Cartesian3(rx, ry, rz),
        image: starImage,
        color: new Cesium.Color(r, g, b, 1),
        scale: scaleFromAbsMagAndDistance(item.absMag, item.distance, false),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      });
      starCount++;
    }
    if (typeof maxStars === "number" && starCount >= maxStars) break;
  }

  for (const url of galaxyUrls) {
    try {
      const parsed = parseEyesDat(await fetchDat(url));
      for (const item of parsed.items) {
        const [rx, ry, rz] = toRenderPosition(
          item.position[0],
          item.position[1],
          item.position[2]
        );
        const [r, g, b] = item.color;
        galaxies.add({
          position: new Cesium.Cartesian3(rx, ry, rz),
          image: galaxyImage,
          color: new Cesium.Color(r, g, b, 0.85),
          scale: scaleFromAbsMagAndDistance(item.absMag, item.distance, true),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
        });
        galaxyCount++;
      }
    } catch (err) {
      console.warn("[starfield] 跳过星系表", url, err);
    }
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
    stats: { starCount, galaxyCount, shardCounts, renderRadius: RENDER_RADIUS_M },
    destroy() {
      removeLock();
      viewer.scene.primitives.remove(stars);
      viewer.scene.primitives.remove(galaxies);
    },
  };
}

export default { parseEyesDat, createStarImage, createStarfield, scaleFromAbsMagAndDistance };
