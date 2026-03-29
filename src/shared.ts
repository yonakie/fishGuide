// Approval string to be shared across frontend and backend
export const APPROVAL = {
  YES: "Yes, confirmed.",
  NO: "No, denied."
} as const;

export const GUIDE_DATA_PART = "guide_event" as const;

export type GuideSpotStatus = "pending" | "processing" | "done" | "error";

export type GuideEvent =
  | {
      kind: "init";
      requestId: string;
      spots: string[];
    }
  | {
      kind: "processing";
      requestId: string;
      spotName: string;
    }
  | {
      kind: "done";
      requestId: string;
      spotName: string;
      intro: string;
      audioUrl?: string;
    }
  | {
      kind: "error";
      requestId: string;
      spotName: string;
      message: string;
    };


    // ── 路线规划相关类型 ───────────────────────────────────
export const ROUTE_DATA_PART = "route_event" as const;

export type RouteSpot = {
  name_en: string;
  name_zh: string;
  lat: number;
  lon: number;
  rating: number;
  themes: string[];
  highlight_zh: string;
  primary_type: string;
};

export type RouteData = {
  startName: string;
  startLat:  number;
  startLon:  number;
  endName:   string;
  endLat:    number;
  endLon:    number;
  spots:         RouteSpot[];
  totalDistance: string;
  totalDuration: string;
  polyline:      string;
};


export type RouteEvent =
  | { kind: "route_planning"; routeId: string; start: string; end: string }
  | { kind: "route_searching"; routeId: string; message: string }
  | { kind: "route_done"; routeId: string; route: RouteData }
  | { kind: "route_error"; routeId: string; message: string };
