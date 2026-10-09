import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("一键启动器会清理 PID 已被其他程序复用的陈旧开发锁", async (t) => {
  const launcherPath = resolve("..", "一键启动台球社管理系统.bat");
  try {
    await access(launcherPath);
  } catch {
    t.skip("公开源码仓库不包含外层的一键启动脚本");
    return;
  }
  const launcher = await readFile(launcherPath, "utf8");
  assert.match(launcher, /lock\.json/i);
  assert.match(launcher, /Win32_Process/i);
  assert.match(launcher, /Remove-Item -LiteralPath/i);
});
