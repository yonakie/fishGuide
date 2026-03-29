// src/components/route-card/RouteCard.tsx
import type { RouteData } from "../../shared";
import { RouteMap } from "../route-map/RouteMap";

type RouteCardProps = {
  data: RouteData;
  onGenerateGuide: () => void; // 点击"生成导览"时的回调，由 app.tsx 传入
};

// 地标类型的中文翻译
const TYPE_LABELS: Record<string, string> = {
  tourist_attraction: "景点",
  museum:             "博物馆",
  church:             "教堂",
  park:               "公园",
  landmark:           "地标",
  art_gallery:        "美术馆",
  library:            "图书馆",
  university:         "大学",
  palace:             "宫殿",
};

export function RouteCard({ data, onGenerateGuide }: RouteCardProps) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">

      {/* ── 顶部：路线概览 ───────────────────────────────── */}
      <div className="p-3 bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-green-600 dark:text-green-400">
            🟢 {data.startName}
          </span>
          <span className="text-neutral-400">→</span>
          <span className="text-red-500 dark:text-red-400">
            🔴 {data.endName}
          </span>
        </div>
        <div className="flex gap-4 mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span>📍 {data.totalDistance}</span>
          <span>🚶 {data.totalDuration}</span>
          <span>🗺 {data.spots.length} 个途经点</span>
        </div>
      </div>

      {/* ── 地图 ─────────────────────────────────────────── */}
      <RouteMap data={data} />

      {/* ── 地标有序列表 ─────────────────────────────────── */}
      <div className="p-3 space-y-2">
        {data.spots.map((spot, index) => (
          <div
            key={spot.name_en}
            className="flex items-start gap-2 text-sm"
          >
            {/* 序号圆圈 */}
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {spot.name_zh}
                <span className="ml-1 text-xs text-neutral-400 font-normal">
                  {spot.name_en}
                </span>
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {spot.highlight_zh}
              </div>
              <div className="flex gap-2 mt-1 flex-wrap">
                {spot.primary_type && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400">
                    {TYPE_LABELS[spot.primary_type] ?? spot.primary_type}
                  </span>
                )}
                {spot.rating > 0 && (
                  <span className="text-xs text-amber-500">
                    ⭐ {spot.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 底部按钮 ─────────────────────────────────────── */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onGenerateGuide}
          className="w-full text-sm py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
        >
          为此路线生成讲解词
        </button>
      </div>
    </div>
  );
}
