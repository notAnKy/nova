import { notFound } from "next/navigation";
import { ProjectDetail } from "@/features/projects/project-detail";
import { getProject, getProjectItems } from "@/features/projects/data";
import { projectPageContext, projectPageShell } from "@/features/projects/page-shell";
import { getWorkspaceMembers } from "@/features/workspaces/data";
import { parsePage } from "@/features/projects/pagination";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params, searchParams }: {
  params: Promise<{ workspaceSlug: string; projectSlug: string }>;
  searchParams: Promise<{ tasks?: string | string[]; decisions?: string | string[]; activity?: string | string[] }>;
}) {
  const { workspaceSlug, projectSlug } = await params;
  const query = await searchParams;
  const pages = { tasks: parsePage(query.tasks), decisions: parsePage(query.decisions),
    activity: parsePage(query.activity) };
  const context = await projectPageContext(workspaceSlug);
  const project = await getProject(context.db, context.workspace.id, projectSlug);
  if (!project) notFound();
  const [items, members] = await Promise.all([
    getProjectItems(context.db, project.id, context.workspace.slug, pages),
    getWorkspaceMembers(context.db, context.workspace.id),
  ]);
  return projectPageShell(context, <ProjectDetail workspace={context.workspace} project={project}
    role={context.role} currentUserId={context.user.id} members={members} pages={pages} {...items} />);
}
