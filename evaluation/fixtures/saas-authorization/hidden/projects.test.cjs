const test = require("node:test");
const assert = require("node:assert/strict");
const loadSubmission = require("./load-submission.cjs");

const { createProject } = loadSubmission("src/projects.cjs");

function context(actor) {
  return { actor, makeId: () => "generated-id", now: () => "2026-08-02T00:00:00.000Z" };
}

test("enforces authentication and role", () => {
  assert.throws(() => createProject(context(null), { name: "Valid name", slug: "valid" }, []), /Unauthorized/);
  assert.throws(() => createProject(context({ id: "u1", tenantId: "t1", role: "viewer" }), { name: "Valid name", slug: "valid" }, []), /Forbidden/);
});

test("derives protected fields and normalizes user input", () => {
  const existing = [{ id: "old", tenantId: "other", ownerId: "u9", name: "Other", slug: "launch", createdAt: "old" }];
  const snapshot = JSON.parse(JSON.stringify(existing));
  const result = createProject(
    context({ id: "u1", tenantId: "t1", role: "admin" }),
    { id: "evil", tenantId: "other", ownerId: "evil", createdAt: "evil", name: "  Product   Launch  ", slug: " Product Launch " },
    existing,
  );
  assert.deepEqual(existing, snapshot);
  assert.notStrictEqual(result, existing);
  assert.deepEqual(JSON.parse(JSON.stringify(result[1])), {
    id: "generated-id", tenantId: "t1", ownerId: "u1", name: "Product Launch",
    slug: "product-launch", createdAt: "2026-08-02T00:00:00.000Z",
  });
});

test("validates names, slugs, and tenant-scoped uniqueness", () => {
  const ctx = context({ id: "u1", tenantId: "t1", role: "owner" });
  assert.throws(() => createProject(ctx, { name: " x ", slug: "valid" }, []), /Invalid name/);
  assert.throws(() => createProject(ctx, { name: "Valid", slug: "!" }, []), /Invalid slug/);
  const records = [{ tenantId: "t1", slug: "taken" }, { tenantId: "t2", slug: "shared" }];
  assert.throws(() => createProject(ctx, { name: "Valid", slug: "TAKEN" }, records), /Duplicate slug/);
  assert.doesNotThrow(() => createProject(ctx, { name: "Valid", slug: "shared" }, records));
});
