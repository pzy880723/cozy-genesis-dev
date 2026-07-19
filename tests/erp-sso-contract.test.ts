import assert from "node:assert/strict";
import test from "node:test";

import {
  hasErpAigcAccess,
  normalizeInternalRedirect,
  validateErpTicket,
} from "../src/lib/erp-sso-contract";

test("accepts headquarters and store roles while rejecting warehouse-only users", () => {
  assert.equal(hasErpAigcAccess(["super_admin"], []), true);
  assert.equal(hasErpAigcAccess(["store_staff"], []), true);
  assert.equal(hasErpAigcAccess(["warehouse_staff"], []), false);
});

test("accepts an explicit aigc_access permission", () => {
  assert.equal(hasErpAigcAccess(["warehouse_staff"], ["aigc_access"]), true);
});

test("validates the exact ERP ticket format", () => {
  assert.equal(validateErpTicket("A".repeat(43)), "A".repeat(43));
  assert.throws(() => validateErpTicket("short"), /ticket_invalid/);
  assert.throws(() => validateErpTicket("A".repeat(42) + "+"), /ticket_invalid/);
});

test("keeps redirects inside the AIGC application", () => {
  assert.equal(normalizeInternalRedirect("/publish?tab=running"), "/publish?tab=running");
  assert.equal(normalizeInternalRedirect("https://example.com"), "/");
  assert.equal(normalizeInternalRedirect("//example.com"), "/");
  assert.equal(normalizeInternalRedirect("javascript:alert(1)"), "/");
});
