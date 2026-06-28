export type Shop = {
  id: string;
  name: string;
  type: "hq" | "store";
  active: boolean;
};

export type AssetKind =
  | "image"
  | "video"
  | "copy"
  | "storyboard"
  | "character"
  | "product";

export type AssetOrigin = "mobile" | "pc";

export type Asset = {
  id: string;
  shopId: string | null;
  shopName?: string;
  kind: AssetKind;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  outputUrl?: string;
  text?: string;
  tags: string[];
  category?: string;
  source?: "upload" | "ai";
  origin?: AssetOrigin;
  publishedAt?: string | null;
  createdAt: string;
};

export type Platform = "xhs" | "wechat_channels" | "douyin" | "kuaishou";

export type SocialAccount = {
  id: string;
  ownerType: "hq" | "store";
  ownerId: string | null;
  ownerName?: string;
  platform: Platform;
  displayName: string;
  status: "valid" | "expired" | "checking" | "disabled";
  lastCheckedAt?: string;
};

export type PublishTarget = {
  id: string;
  jobId: string;
  platform: Platform;
  accountId: string;
  accountName?: string;
  status: "queued" | "running" | "success" | "failed";
  errorMessage?: string;
  publishedUrl?: string;
};

export type PublishJob = {
  id: string;
  title: string;
  scopeType: "hq" | "store" | "multi_store";
  shopIds: string[];
  shopNames?: string[];
  contentType: "video" | "image_text" | "copy";
  status:
    | "queued"
    | "running"
    | "success"
    | "partial_failed"
    | "failed"
    | "cancelled";
  createdAt: string;
  scheduledAt?: string;
  targets: PublishTarget[];
};

export type AutomationTask = {
  id: string;
  name: string;
  scopeType: "hq" | "store" | "multi_store";
  shopIds: string[];
  shopNames?: string[];
  contentStrategy: string;
  platforms: Platform[];
  dailyLimit: number;
  runTimes: string[];
  status: "enabled" | "paused" | "error";
  lastRunAt?: string;
  nextRunAt?: string;
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  xhs: "小红书",
  wechat_channels: "视频号",
  douyin: "抖音",
  kuaishou: "快手",
};