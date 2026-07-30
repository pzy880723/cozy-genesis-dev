import { describe, expect, it } from "vitest";
import { isCoverTerminal, normalizeCoverStatus } from "../src/api/surprise";

describe("cover queue status contract", () => {
  it("treats legacy jobs without cover_generation as none", () => {
    expect(normalizeCoverStatus(undefined)).toBe("none");
    expect(normalizeCoverStatus(null)).toBe("none");
    expect(normalizeCoverStatus("bogus")).toBe("none");
  });

  it("passes through known statuses", () => {
    for (const s of ["queued", "generating", "succeeded", "failed"]) {
      expect(normalizeCoverStatus(s)).toBe(s);
    }
  });

  it("stops polling only on terminal states", () => {
    expect(isCoverTerminal("queued")).toBe(false);
    expect(isCoverTerminal("generating")).toBe(false);
    expect(isCoverTerminal("succeeded")).toBe(true);
    expect(isCoverTerminal("failed")).toBe(true);
    expect(isCoverTerminal("none")).toBe(true);
  });
});
