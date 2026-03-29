// test-geo.ts
import { haversineDistance, computeBoundingBox, perpendicularDistanceToSegment, geocode, getOptimizedRoute } from "../src/geo";

import { config } from "dotenv";
config({ path: "../.dev.vars" });
// 主要是为了本地Node.js环境能读取环境变量直接运行测试

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";
if (!MAPS_KEY) throw new Error("请先设置 GOOGLE_MAPS_API_KEY 环境变量");

// 已知真实坐标
const bigBen    = { lat: 51.5007, lon: -0.1246 };
const londonEye1 = { lat: 51.5033, lon: -0.1195 };
const westminsterAbbey = { lat: 51.4994, lon: -0.1273 };

// ── 测试 1：两点距离 ──────────────────────────────────
const dist = haversineDistance(bigBen, londonEye1);
console.log(`大本钟 → 伦敦眼: ${dist.toFixed(0)}m`);
// 期望：约 400m（步行不到5分钟的距离）

// ── 测试 2：bounding box ──────────────────────────────
const bbox = computeBoundingBox(bigBen, londonEye1, 500);
console.log("Bounding box:");
console.log("  top_left:    ", bbox.top_left);
console.log("  bottom_right:", bbox.bottom_right);
// 验证：bigBen 和 londonEye 的坐标都应该在 box 内
const inBox = (p: typeof bigBen) =>
  p.lat <= bbox.top_left.lat &&
  p.lat >= bbox.bottom_right.lat &&
  p.lon >= bbox.top_left.lon &&
  p.lon <= bbox.bottom_right.lon;
console.log("bigBen 在 box 内:", inBox(bigBen));       // 期望 true
console.log("londonEye 在 box 内:", inBox(londonEye1)); // 期望 true

// ── 测试 3：走廊距离 ──────────────────────────────────
// 威斯敏斯特教堂到 bigBen-londonEye 这条线的距离
const d = perpendicularDistanceToSegment(westminsterAbbey, bigBen, londonEye1);
console.log(`威斯敏斯特教堂到路线走廊的距离: ${d.toFixed(0)}m`);
// 期望：约 150-250m（它就在大本钟旁边，应该在走廊内）


// ── 测试 4：地理编码 ───────────────────────────────────
console.log("\n── 测试 geocode ──");
const bakerSt  = await geocode("Baker Street Station, London", MAPS_KEY);
const londonEye = await geocode("London Eye, London", MAPS_KEY);
console.log("Baker Street:", bakerSt);
console.log("London Eye:  ", londonEye);
// 期望：
//   Baker Street 约 { lat: 51.5226, lon: -0.1571 }
//   London Eye   约 { lat: 51.5033, lon: -0.1195 }

// ── 测试 5：路线优化 ───────────────────────────────────
console.log("\n── 测试 getOptimizedRoute ──");
// 途经 Big Ben 和 Westminster Abbey
// const bigBen           = { lat: 51.5007, lon: -0.1246 };
// const westminsterAbbey = { lat: 51.4994, lon: -0.1273 };

const route = await getOptimizedRoute(
  bakerSt,
  londonEye,
  [bigBen, westminsterAbbey],
  MAPS_KEY
);
console.log("优化后途经点顺序:", route.waypointOrder);
console.log("总距离:", route.totalDistance);
console.log("步行时长:", route.totalDuration);
console.log("polyline 前30字符:", route.polyline.slice(0, 30) + "...");
// 期望：
//   waypointOrder 是 [0,1] 或 [1,0]（Google 决定哪个先走更合理）
//   totalDistance 约 "4–6 公里"
//   totalDuration 约 "50–80 分钟"
//   polyline 是一段看起来像乱码的编码字符串