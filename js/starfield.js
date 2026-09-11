/**
 * NASA Eyes 风格星空：用 Cesium.BillboardCollection 绘制恒星/星系，
 * 取代默认 SkyBox 立方体贴图。
 *
 * 本演示刻意选用 BillboardCollection（而非 PointPrimitiveCollection / 默认 SkyBox）：
 * - SkyBox：六面立方体贴图，固定在 TEME，无法按星表逐星着色/缩放。
 * - PointPrimitive：性能好，但仅为 gl_Point，缺少纹理光晕与更柔和的“眼睛”观感。
 * - BillboardCollection：共享纹理图集的视口对齐精灵，易做出柔和星点与星系光斑。
 *
 * 星表格式（与 NASA World Wind Hipparcos .dat 兼容，供本仓库 assets/eyes-stars 使用）：
 *   float32 LE radius
 *   重复: float32 r,g,b, x,y,z  （颜色 0–1，位置为以原点为心的大球坐标，米）
 *
 * 若日后从 ASTROX.SolarViewer 拷入原始 eyes-stars 且格式不同，只需改 parseEyesDat。
 */

const DEFAULT_ASSETS = {
  stars: ["assets/eyes-stars/stars.0.dat"],
  galaxies: ["assets/eyes-stars/galaxies.0.dat"],
};

const STAR_RADIUS_FALLBACK = 63567520; // Earth radius × 10（与 WW 默认一致）

/**
 * @param {ArrayBuffer} buffer
 * @returns {{ radius: number, items: Array<{color: number[], position: number[]}> }}
 */
export function parseEyesDat(buffer) {
  if (!buffer || buffer.byteLength < 8) {
    throw new Error("星表过小或为空");
  }
  const view = new DataView(buffer);
  const radius = view.getFloat32(0, true);
  const stride = 24; // 6 × float32
  const remaining = buffer.byteLength - 4;
  if (remaining % stride !== 0) {
    throw new Error(
      `星表长度异常: ${buffer.byteLength} 字节（期望 4 + N*24）`
    );
  }
  const count = remaining / stride;
  const items = new Array(count);
  for (let i = 0; i < count; i++) {
    const o = 4 + i * stride;
    items[i] = {
      color: [
        view.getFloat32(o + 0, true),
        view.getFloat32(o + 4, true),
        view.getFloat32(o + 8, true),
      ],
      position: [
        view.getFloat32(o + 12, true),
        view.getFloat32(o + 16, true),
        view.getFloat32(o + 20, true),
      ],
    };
  }
  return {
    radius: Number.isFinite(radius) && radius > 0 ? radius : STAR_RADIUS_FALLBACK,
    items,
  };
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

function luminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function starScaleFromColor(rgb) {
  const L = luminance(rgb);
  // 亮星更大；暗星压到接近 1px
  return 0.35 + L * 1.65;
}

function galaxyScaleFromColor(rgb) {
  const L = luminance(rgb);
  return 2.5 + L * 6;
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
 * （相机若用惯性锁定，星空不会跟着地球转。）
 */
function bindInertialLock(viewer, collection) {
  const scratch = new Cesium.Matrix3();
  const scratch4 = new Cesium.Matrix4();
  return viewer.scene.preRender.addEventListener(() => {
    const time = viewer.clock.currentTime;
    const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time, scratch);
    if (!Cesium.defined(icrfToFixed)) {
      // IAU 数据尚未就绪时暂用 TEME→伪固定，避免一帧空白
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
 * @returns {Promise<{stars: Cesium.BillboardCollection, galaxies: Cesium.BillboardCollection, stats: object}>}
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
  let catalogRadius = STAR_RADIUS_FALLBACK;

  for (const url of starUrls) {
    const parsed = parseEyesDat(await fetchDat(url));
    catalogRadius = parsed.radius;
    const items =
      typeof maxStars === "number"
        ? parsed.items.slice(0, maxStars)
        : parsed.items;
    for (const item of items) {
      const [r, g, b] = item.color;
      const [x, y, z] = item.position;
      stars.add({
        position: new Cesium.Cartesian3(x, y, z),
        image: starImage,
        color: new Cesium.Color(r, g, b, 1),
        scale: starScaleFromColor(item.color),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      });
      starCount++;
    }
  }

  for (const url of galaxyUrls) {
    try {
      const parsed = parseEyesDat(await fetchDat(url));
      for (const item of parsed.items) {
        const [r, g, b] = item.color;
        const [x, y, z] = item.position;
        galaxies.add({
          position: new Cesium.Cartesian3(x, y, z),
          image: galaxyImage,
          color: new Cesium.Color(r, g, b, 0.85),
          scale: galaxyScaleFromColor(item.color),
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
    // 预加载惯性变换所需的 IAU 2006 数据
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
    stats: { starCount, galaxyCount, catalogRadius },
    destroy() {
      removeLock();
      viewer.scene.primitives.remove(stars);
      viewer.scene.primitives.remove(galaxies);
    },
  };
}

export default { parseEyesDat, createStarImage, createStarfield };
