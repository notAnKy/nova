import { ProjectList } from "@/features/projects/project-list";
import { listProjects } from "@/features/projects/data";
import { projectPageContext, projectPageShell } from "@/features/projects/page-shell";
import { parsePage } from "@/features/projects/pagination";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ params, searchParams }: { params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ page?: string | string[] }> }) {
  const { workspaceSlug } = await params;
  const page = parsePage((await searchParams).page);
  const context = await projectPageContext(workspaceSlug);
  const { projects, hasMore } = await listProjects(context.db, context.workspace.id, page);
  return projectPageShell(context, <ProjectList workspace={context.workspace} role={context.role}
    projects={projects} page={page} hasMore={hasMore} />, `/w/${context.workspace.slug}/projects`);
}
