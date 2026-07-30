// deno test -A supabase/functions/tests/cover-generation.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  asNotesObject,
  mergeCoverGeneration,
  readCoverGeneration,
  extractProducts,
  buildCoverPlan,
  variationKey,
  fingerprintCopy,
} from "../_shared/cover-generation.ts";

Deno.test("fallback_notes 为数组时不丢历史 notes", () => {
  const { notes } = mergeCoverGeneration(["seg1 降级"], { status: "queued", attempt: 0 } as any);
  assertEquals((notes as any).notes, ["seg1 降级"]);
  assertEquals((notes as any).cover_generation.status, "queued");
});

Deno.test("合并只动 cover_generation，其它键原样保留", () => {
  const prev = { audio: { ok: true }, cover_generation: { status: "queued", attempt: 1, keep: "x" } };
  const { notes, cover } = mergeCoverGeneration(prev, { status: "claimed", claimed_by: "w1" } as any);
  assertEquals((notes as any).audio, { ok: true });
  assertEquals(cover.attempt, 1);
  assertEquals((cover as any).keep, "x");
  assertEquals(cover.status, "claimed");
});

Deno.test("readCoverGeneration 对旧历史任务返回 null", () => {
  assertEquals(readCoverGeneration(null), null);
  assertEquals(readCoverGeneration(["note"]), null);
  assertEquals(asNotesObject(undefined), {});
});

Deno.test("商品只来自脚本/素材", () => {
  const products = extractProducts(
    { title: "秋日拿铁", scenes: [{ product: "手冲" }] },
    [{ summary: "桂花糕" }],
  );
  assert(products.includes("秋日拿铁"));
  assert(products.includes("手冲"));
  assert(products.includes("桂花糕"));
});

Deno.test("历史指纹存在时避开完全相同的组合", async () => {
  const history = [
    { meta: { cover_generation: { copy_fingerprint: "秋日拿铁|开场|拿铁", variation_key: "1|举杯对视|秋日拿铁|近景过肩" } } },
  ];
  const admin = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        gte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: history }); },
      } as any;
    },
  };
  const plan = await buildCoverPlan(admin, {
    shopId: "shop-1",
    script: { title: "秋日拿铁", hook: { subtitle: "开场" } },
  });
  assert(variationKey(plan.variation) !== "1|举杯对视|秋日拿铁|近景过肩");
  assert(typeof fingerprintCopy(plan.copy) === "string");
  assertEquals(plan.variation.product, "秋日拿铁"); // 不发明脚本外商品
});