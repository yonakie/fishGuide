import { Card } from "@/components/card/Card";

export type AirbnbListing = {
  title?: string;
  listingUrl?: string;
  location?: string;
  address?: string;
  residentType?: string;
  superHost?: boolean;
  samplePhotoUrl?: string;
  rating?: string;
  personReviewed?: string;
  amenities?: string[];
  accommodation?: {
    guests?: string;
    bedrooms?: string;
    beds?: string;
    baths?: string;
  };
  costs?: {
    priceCurrency?: string;
    pricePerNight?: string;
  };
};

interface AirbnbCardProps {
  listing: AirbnbListing;
}

export default function AirbnbCard({ listing }: AirbnbCardProps) {
  const priceText =
    listing.costs?.pricePerNight && listing.costs?.priceCurrency
      ? `${listing.costs.priceCurrency}${listing.costs.pricePerNight}/晚`
      : listing.costs?.pricePerNight
        ? `${listing.costs.pricePerNight}/晚`
        : "价格待确认";

  const metaLine = [
    listing.location,
    listing.address && listing.address !== listing.location
      ? listing.address
      : undefined,
    listing.residentType,
    listing.superHost ? "Superhost" : undefined
  ]
    .filter(Boolean)
    .join(" · ");

  const roomInfo = [
    listing.accommodation?.guests
      ? `${listing.accommodation.guests}人入住`
      : undefined,
    listing.accommodation?.bedrooms
      ? `${listing.accommodation.bedrooms}卧`
      : undefined,
    listing.accommodation?.beds ? `${listing.accommodation.beds}床` : undefined,
    listing.accommodation?.baths
      ? `${listing.accommodation.baths}卫`
      : undefined
  ]
    .filter(Boolean)
    .join(" · ");

  const amenities = (listing.amenities ?? []).filter(Boolean).slice(0, 6);

  return (
    <Card className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 p-0 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {listing.samplePhotoUrl ? (
        <img
          src={listing.samplePhotoUrl}
          alt={listing.title ?? "Airbnb listing"}
          className="h-44 w-full object-cover"
        />
      ) : (
        <div className="flex h-44 w-full items-center justify-center bg-[linear-gradient(135deg,#f7d8b6,#f5f5f4)] text-sm text-neutral-500 dark:bg-[linear-gradient(135deg,#3f2a18,#1f1f1f)] dark:text-neutral-400">
          暂无房源图片
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="line-clamp-2 text-sm font-semibold leading-5 text-neutral-900 dark:text-neutral-100">
              {listing.title ?? "未命名房源"}
            </h4>
            {metaLine && (
              <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">
                {metaLine}
              </p>
            )}
          </div>

          <div className="shrink-0 rounded-full bg-[#F48120]/10 px-3 py-1 text-xs font-semibold text-[#F48120]">
            {priceText}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          <div className="rounded-xl bg-white px-3 py-2 dark:bg-neutral-950">
            <div className="text-[11px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              评分
            </div>
            <div className="mt-1 font-medium text-neutral-800 dark:text-neutral-200">
              {listing.rating ? `${listing.rating} / 5` : "待确认"}
            </div>
          </div>
          <div className="rounded-xl bg-white px-3 py-2 dark:bg-neutral-950">
            <div className="text-[11px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              评价数
            </div>
            <div className="mt-1 font-medium text-neutral-800 dark:text-neutral-200">
              {listing.personReviewed
                ? `${listing.personReviewed} 条`
                : "待确认"}
            </div>
          </div>
        </div>

        {roomInfo && (
          <p className="text-xs text-neutral-700 dark:text-neutral-300">
            {roomInfo}
          </p>
        )}

        {amenities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {amenities.map((amenity) => (
              <span
                key={amenity}
                className="rounded-full border border-[#F48120]/20 bg-[#F48120]/5 px-2.5 py-1 text-[11px] text-neutral-700 dark:text-neutral-300"
              >
                {amenity}
              </span>
            ))}
          </div>
        )}

        {listing.listingUrl ? (
          <a
            href={listing.listingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full bg-[#F48120] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            查看 Airbnb 原页
          </a>
        ) : (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            当前接口没有返回可跳转的房源链接。
          </p>
        )}
      </div>
    </Card>
  );
}
