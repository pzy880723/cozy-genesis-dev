import { PLATFORM_LABELS, type Platform } from "@/types";

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-white px-2 text-xs font-semibold text-graphite">
      {PLATFORM_LABELS[platform]}
    </span>
  );
}