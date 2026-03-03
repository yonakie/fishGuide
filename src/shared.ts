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
