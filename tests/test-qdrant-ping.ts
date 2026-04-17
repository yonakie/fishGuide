import { getQdrantClient, COLLECTION } from "../src/qdrant";

async function main() {
  const qdrant = getQdrantClient();
  const r = await qdrant.scroll(COLLECTION, { limit: 1, with_payload: true });
  console.log("scroll ok, points:", r.points.length);
  console.log("first point:", r.points[0]);
}

main().catch((e) => {
  console.error("scroll failed:", e);
  process.exit(1);
});