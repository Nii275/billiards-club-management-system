import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("系统品牌统一为厦门理工台球社", () => {
  assert.match(page, /厦门理工台球社/);
  assert.match(layout, /厦门理工台球社管理系统/);
  assert.doesNotMatch(`${page}\n${layout}`, /青杆台球社/);
});

test("业务数据由服务端加载且不包含演示记录", () => {
  assert.match(page, /\/api\/club/);
  assert.doesNotMatch(page, /林清远|周书宁|陈奕衡|许知夏|赵明轩|2026 秋季社团杯/);
});
