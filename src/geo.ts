// src/geo.ts

// ── 类型定义 ───────────────────────────────────────────
// 注意：内部统一用 lon（与 qdrant.ts 一致），只有调用 Google API 时才用 lng
export type LatLon = { lat: number; lon: number };

export type DirectionsResult = {
  waypointOrder: number[]; // Google 返回的优化顺序，如 [2,0,1] 代表第2个路过点优先
  polyline: string;        // Google encoded polyline，前端解码后画线
  totalDistance: string;   // 如 "3.2 km"
  totalDuration: string;   // 如 "42 mins"
};

// ── 常量 ──────────────────────────────────────────────
const EARTH_RADIUS_M = 6_371_000; // 地球半径（米）
const DEG_TO_RAD = Math.PI / 180;

// ── haversineDistance ──────────────────────────────────
// 计算地球表面两点之间的直线距离（米）
// Haversine 公式：对短距离（城市内）精度足够，误差 < 0.3%
export function haversineDistance(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(a.lat * DEG_TO_RAD) *
      Math.cos(b.lat * DEG_TO_RAD) *
      sinDLon *
      sinDLon;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// ── computeBoundingBox ─────────────────────────────────
// 给定起点 A 和终点 B，计算包裹两点的矩形，并向四周各扩展 paddingMeters 米
// 返回的 BoundingBox 可以直接传给 qdrant.ts 的 searchByBoundingBox
export function computeBoundingBox(
  a: LatLon,
  b: LatLon,
  paddingMeters: number
): { top_left: LatLon; bottom_right: LatLon } {
  const avgLat = ((a.lat + b.lat) / 2) * DEG_TO_RAD;

  // 纬度方向：1° ≈ 111111m，与经度无关
  const latPad = paddingMeters / 111_111;

  // 经度方向：1° 的距离随纬度变化，在纬度 φ 处 ≈ 111111 * cos(φ) 米
  // 伦敦纬度 ≈ 51.5°，cos(51.5°) ≈ 0.624，所以 1° 经度 ≈ 69km
  const lonPad = paddingMeters / (111_111 * Math.cos(avgLat));

  return {
    top_left: {
      lat: Math.max(a.lat, b.lat) + latPad,
      lon: Math.min(a.lon, b.lon) - lonPad,
    },
    bottom_right: {
      lat: Math.min(a.lat, b.lat) - latPad,
      lon: Math.max(a.lon, b.lon) + lonPad,
    },
  };
}

// ── perpendicularDistanceToSegment ────────────────────
// 计算点 P 到线段 AB 的最短距离（米）
// 策略：把经纬度近似投影成平面坐标（米），再做标准 2D 几何
// 在城市步行尺度（几 km 内）误差可忽略
export function perpendicularDistanceToSegment(
  point: LatLon,
  a: LatLon,
  b: LatLon
): number {
  // 以 A 为坐标原点，把三个点投影到米制平面
  // x 轴 = 东西方向，y 轴 = 南北方向
  const cosLat = Math.cos(a.lat * DEG_TO_RAD);
  const mPerDegLat = 111_111;
  const mPerDegLon = 111_111 * cosLat;

  const ax = 0;
  const ay = 0;
  const bx = (b.lon - a.lon) * mPerDegLon;
  const by = (b.lat - a.lat) * mPerDegLat;
  const px = (point.lon - a.lon) * mPerDegLon;
  const py = (point.lat - a.lat) * mPerDegLat;

  // AB 向量的平方长度
  const abLenSq = bx * bx + by * by;

  if (abLenSq === 0) {
    // A 和 B 是同一点，直接返回 P 到 A 的距离
    return Math.sqrt(px * px + py * py);
  }

  // 把向量 AP 投影到 AB 上，得到参数 t（t ∈ [0,1] 表示垂足在线段内）
  // t = dot(AP, AB) / |AB|²
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / abLenSq));

  // 垂足坐标
  const footX = ax + t * bx;
  const footY = ay + t * by;

  // P 到垂足的距离
  const dx = px - footX;
  const dy = py - footY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── 辅助：格式化距离和时长 ─────────────────────────────
function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} 米`;
  return `${(meters / 1000).toFixed(1)} 公里`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours} 小时 ${rem} 分钟` : `${hours} 小时`;
}

// ── geocode ────────────────────────────────────────────
// 将地名转换为经纬度坐标，调用 Google Geocoding API
export async function geocode(
  placeName: string,
  apiKey: string
): Promise<LatLon> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", placeName);
  url.searchParams.set("region", "GB");  // 优先返回英国结果
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Geocoding HTTP error: ${res.status} for "${placeName}"`);
  }

  const data = (await res.json()) as {
    status: string;
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
    }>;
  };

  if (data.status !== "OK" || data.results.length === 0) {
    throw new Error(
      `Geocoding failed for "${placeName}": status=${data.status}`
    );
  }

  const { lat, lng } = data.results[0].geometry.location;
  console.log(
    `[Geo] "${placeName}" → ${lat.toFixed(5)}, ${lng.toFixed(5)}` +
    ` (${data.results[0].formatted_address})`
  );

  // Google API 用 lng，我们内部统一用 lon
  return { lat, lon: lng };
}

// ── getOptimizedRoute ──────────────────────────────────
// 调用 Google Directions API，让 Google 自动优化途经点顺序
// waypoints 是起终点之间需要经过的地标坐标数组
export async function getOptimizedRoute(
  origin: LatLon,
  destination: LatLon,
  waypoints: LatLon[],
  apiKey: string
): Promise<DirectionsResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lon}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lon}`);
  url.searchParams.set("mode", "walking");
  url.searchParams.set("key", apiKey);

  // optimize:true 告诉 Google 自动重排途经点顺序以缩短总路程
  if (waypoints.length > 0) {
    const wpStr =
      "optimize:true|" +
      waypoints.map((w) => `${w.lat},${w.lon}`).join("|");
    url.searchParams.set("waypoints", wpStr);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Directions API HTTP error: ${res.status}`);
  }

  const data = (await res.json()) as {
    status: string;
    routes: Array<{
      overview_polyline: { points: string };
      waypoint_order: number[];
      legs: Array<{
        distance: { text: string; value: number };
        duration: { text: string; value: number };
      }>;
    }>;
  };

  if (data.status !== "OK" || data.routes.length === 0) {
    throw new Error(`Directions API failed: status=${data.status}`);
  }

  const route = data.routes[0];

  // 把所有 leg 的距离和时长加总
  const totalMeters = route.legs.reduce(
    (sum, leg) => sum + leg.distance.value,
    0
  );
  const totalSeconds = route.legs.reduce(
    (sum, leg) => sum + leg.duration.value,
    0
  );

  return {
    waypointOrder: route.waypoint_order,
    polyline:      route.overview_polyline.points,
    totalDistance: formatDistance(totalMeters),
    totalDuration: formatDuration(totalSeconds),
  };
}
