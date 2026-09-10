import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the half-mast status product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Why is the flag at half-mast\?/);
  assert.match(html, /flags should be at full mast/);
  assert.match(html, /U\.S\. flag/);
  assert.match(html, /State flag/);
  assert.match(html, /No current official order found/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});
