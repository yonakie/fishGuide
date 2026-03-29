import { config } from "dotenv";
config({ path: "../.dev.vars" });
// 主要是为了本地Node.js环境能读取环境变量直接运行测试

// 从工具文件里引入想测试的函数
import { getQdrantClient, embedText, COLLECTION, searchChunksBySpotName, searchByBoundingBox } from "../src/qdrant";

// 测试一下能不能成功
async function main() {
  // 测试 1: Qdrant 连通性
  const qdrant = getQdrantClient();
  const info = await qdrant.getCollection(COLLECTION);
  console.log("✅ Qdrant 连接成功");
  console.log(`   Collection: ${COLLECTION}`);
  console.log(`   向量数量: ${info.points_count}`);
  console.log(`   向量维度: ${info.config.params.vectors}`);

  // 测试 2: Embedding 生成
  const vector = await embedText("Big Ben");
  console.log(`✅ Embedding 生成成功，维度: ${vector.length}`);
  console.log(`   前5个值: [${vector.slice(0, 5).map(v => v.toFixed(4)).join(", ")}]`);


  // ── 测试 3: 精确名称匹配 ──────────────────────────────
  console.log("\n── 测试精确匹配：Big Ben ──");
  const chunks1 = await searchChunksBySpotName("Big Ben");
  console.log(`返回 ${chunks1.length} 条`);
  console.log("第一条 name_en:", chunks1[0]?.name_en);
  console.log("第一条 name_zh:", chunks1[0]?.name_zh);
  console.log("第一条 text 前80字:", chunks1[0]?.text.slice(0, 80));

  // ── 测试 4: 中文名称触发 fallback ─────────────────────
  console.log("\n── 测试 fallback：大本钟 ──");
  const chunks2 = await searchChunksBySpotName("大ben钟");
  console.log(`返回 ${chunks2.length} 条`);
  // fallback 的结果应该也是 Big Ben 相关内容
  console.log("第一条 name_en:", chunks2[0]?.name_en);
  console.log("第一条 score:", chunks2[0]?.score); // fallback 结果有 score

  // ── 测试 5: 带 filter 的检索 ──────────────────────────
  console.log("\n── 测试带 filter：Westminster Abbey + architecture ──");
  const chunks3 = await searchChunksBySpotName(
    "Westminster Abbey",
    { themes: ["architecture"] }
  );
  console.log(`返回 ${chunks3.length} 条`);
  console.log("themes 字段:", chunks3[0]?.themes);

  const westminsterBox = {
    top_left:     { lat: 51.510, lon: -0.150 },
    bottom_right: { lat: 51.495, lon: -0.110 },
  };

  // ── 测试 6: 基础地理范围检索 ──────────────────────────
  console.log("\n── 测试 bounding box：威斯敏斯特区域 ──");
  const candidates = await searchByBoundingBox(westminsterBox);

  console.log(`返回 ${candidates.length} 个地标`);
  console.log("前 5 个：");
  candidates.slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name_en} (${c.name_zh})`);
    console.log(`     坐标: ${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`);
    console.log(`     rating: ${c.rating}  类型: ${c.primary_type}`);
  });

  // ── 测试 7: 带 themes filter ──────────────────────────
  console.log("\n── 测试 bounding box + themes filter：architecture ──");
  const archCandidates = await searchByBoundingBox(
    westminsterBox,
    { themes: ["architecture"] }
  );
  console.log(`architecture 主题地标：${archCandidates.length} 个`);

  // ── 测试 8: 坐标是否都在 box 范围内 ───────────────────
  console.log("\n── 验证坐标合法性 ──");
  const outOfBox = candidates.filter(
    (c) =>
      c.lat > westminsterBox.top_left.lat ||
      c.lat < westminsterBox.bottom_right.lat ||
      c.lon < westminsterBox.top_left.lon ||
      c.lon > westminsterBox.bottom_right.lon
  );
  if (outOfBox.length === 0) {
    console.log("✅ 所有坐标都在 bounding box 范围内");
  } else {
    console.log(`❌ 有 ${outOfBox.length} 个坐标越界：`, outOfBox.map(c => c.name_en));
  }

}

main().catch(console.error);

/* async function main() 然后 main().catch(console.error) 这种写法的主要目的是为了方便捕获 async/await 里的异常。
因为：顶层不能直接用 await（除非在 ES2022+ 支持的顶层 await 环境，但很多 Node 项目/老代码不支持）。
如果直接写 async 代码块，异常不会自动被捕获，未处理的 Promise 会导致 Node 报错。
用 main().catch(console.error) 可以把 main 里所有 await 抛出的异常都打印出来，方便调试。*/