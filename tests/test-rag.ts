import { generateSpotIntro } from "../src/rag";

// ── 测试 A：基础调用 ──────────────────────────────────
console.log("\n── 测试 A：Big Ben 基础导览词 ──");
const intro1 = await generateSpotIntro({ spotName: "Big Ben" });
console.log(`生成字数：${intro1.length} 字`);
console.log("前 150 字：");
console.log(intro1.slice(0, 150));

// ── 测试 B：带风格和长度要求 ─────────────────────────
console.log("\n── 测试 B：Westminster Abbey，幽默风趣，300字 ──");
const intro2 = await generateSpotIntro({
  spotName: "Westminster Abbey",
  length: 300,
  style: "幽默风趣，适合讲给小孩听，用“贝贝”称呼孩子",
});
console.log(`生成字数：${intro2.length} 字`);
console.log("前 250 字：");
console.log(intro2.slice(0, 250));

// ── 测试 C：带 filter，验证 RAG 内容有没有被利用 ──────
console.log("\n── 测试 C：Tower of London，历史角度，medieval 时期 ──");
const intro3 = await generateSpotIntro({
  spotName: "Tower of London",
  historical_period: "medieval",
  themes: ["war", "royalty"],
  length: 400,
});
console.log(`生成字数：${intro3.length} 字`);
console.log("前 350 字：");
console.log(intro3.slice(0, 350));
