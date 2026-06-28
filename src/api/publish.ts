import { mockPublishJobs } from "@/mocks/data";
import type { Platform, PublishJob } from "@/types";
import { mock } from "./client";

export type CreateJobInput = {
  title: string;
  scopeType: "hq" | "store" | "multi_store";
  shopIds: string[];
  platforms: Platform[];
  contentType: "video" | "image_text" | "copy";
  assetIds: string[];
  copy?: { title: string; body: string; tags: string[] };
  scheduledAt?: string;
};

export const publishApi = {
  list: (): Promise<PublishJob[]> => mock(mockPublishJobs),
  create: async (input: CreateJobInput) =>
    mock({ ok: true, jobId: `job_${Date.now()}`, ...input }, 350),
  retryTarget: async (targetId: string) => mock({ ok: true, targetId }, 200),
  cancel: async (jobId: string) => mock({ ok: true, jobId }, 200),
};