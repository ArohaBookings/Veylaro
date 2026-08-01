function createProject(context, input, projects) {
  const project = {
    id: input.id || context.makeId(),
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    name: input.name,
    slug: input.slug,
    createdAt: input.createdAt || context.now(),
  };
  projects.push(project);
  return projects;
}

module.exports = { createProject };
