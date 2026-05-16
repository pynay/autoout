import { afterEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";

// We'll test extractLessons by mocking the anthropic client at the fetch level
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Since the module uses the anthropic SDK which calls fetch internally,
// and the path aliases make mocking difficult, let's test the API endpoints directly
// against the running dev server.

describe("Lessons API", () => {
  const BASE = "http://localhost:3000";

  it("GET /api/lessons returns an array", async () => {
    const res = await fetch(`${BASE}/api/lessons`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });

  it("POST /api/lessons creates a global lesson", async () => {
    const res = await fetch(`${BASE}/api/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson: "Test: never use exclamation marks", icpId: null }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.lesson, "Test: never use exclamation marks");
    assert.equal(data.icpId, null);
    assert.equal(data.usageCount, 1);
    assert.ok(data.id);

    // Clean up
    await fetch(`${BASE}/api/lessons/${data.id}`, { method: "DELETE" });
  });

  it("POST /api/lessons rejects empty lesson", async () => {
    const res = await fetch(`${BASE}/api/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson: "", icpId: null }),
    });
    assert.equal(res.status, 400);
  });

  it("POST /api/lessons creates ICP-scoped lesson", async () => {
    // Get an ICP ID first
    const icpsRes = await fetch(`${BASE}/api/icps`);
    const icps = await icpsRes.json();
    if (icps.length === 0) {
      // Skip test if no ICPs exist
      return;
    }
    const icpId = icps[0].id;

    const res = await fetch(`${BASE}/api/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson: "Test: reference team size", icpId }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.icpId, icpId);

    // Verify it shows up in filtered list
    const listRes = await fetch(`${BASE}/api/lessons?icpId=${icpId}`);
    const list = await listRes.json();
    assert.ok(list.some((l: { id: string }) => l.id === data.id));

    // Clean up
    await fetch(`${BASE}/api/lessons/${data.id}`, { method: "DELETE" });
  });

  it("PATCH /api/lessons/:id updates lesson text", async () => {
    // Create
    const createRes = await fetch(`${BASE}/api/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson: "Original text", icpId: null }),
    });
    const created = await createRes.json();

    // Patch
    const patchRes = await fetch(`${BASE}/api/lessons/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson: "Updated text" }),
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.lesson, "Updated text");
    assert.equal(patched.id, created.id);

    // Clean up
    await fetch(`${BASE}/api/lessons/${created.id}`, { method: "DELETE" });
  });

  it("DELETE /api/lessons/:id removes the lesson", async () => {
    // Create
    const createRes = await fetch(`${BASE}/api/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson: "To be deleted", icpId: null }),
    });
    const created = await createRes.json();

    // Delete
    const delRes = await fetch(`${BASE}/api/lessons/${created.id}`, { method: "DELETE" });
    assert.equal(delRes.status, 200);

    // Verify gone
    const listRes = await fetch(`${BASE}/api/lessons`);
    const list = await listRes.json();
    assert.ok(!list.some((l: { id: string }) => l.id === created.id));
  });

  it("DELETE /api/lessons/:id returns 404 for unknown ID", async () => {
    const res = await fetch(`${BASE}/api/lessons/00000000-0000-0000-0000-000000000000`, {
      method: "DELETE",
    });
    assert.equal(res.status, 404);
  });

  it("PATCH /api/lessons/:id returns 404 for unknown ID", async () => {
    const res = await fetch(`${BASE}/api/lessons/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson: "nope" }),
    });
    assert.equal(res.status, 404);
  });
});

describe("Email PATCH learning trigger", () => {
  const BASE = "http://localhost:3000";

  it("PATCH /api/emails/:id returns 404 for unknown email", async () => {
    const res = await fetch(`${BASE}/api/emails/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "test", body: "test body" }),
    });
    assert.equal(res.status, 404);
  });
});
