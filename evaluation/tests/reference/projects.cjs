function createProject(context, input, projects) {
  if (!context || !context.actor) throw new Error("Unauthorized");
  if (!["owner", "admin"].includes(context.actor.role)) throw new Error("Forbidden");
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 3 || name.length > 80) throw new Error("Invalid name");
  const slug = typeof input.slug === "string"
    ? input.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "";
  if (slug.length < 3 || slug.length > 48) throw new Error("Invalid slug");
  if (!Array.isArray(projects)) throw new Error("Invalid projects");
  if (projects.some((project) => project.tenantId === context.actor.tenantId && project.slug === slug)) throw new Error("Duplicate slug");
  const project = {
    id: context.makeId(), tenantId: context.actor.tenantId, ownerId: context.actor.id,
    name, slug, createdAt: context.now(),
  };
  return [...projects.map((item) => ({ ...item })), project];
}

module.exports = { createProject };
