/**
 * Projects page — connect GitHub repos and choose which base branches to watch.
 * Server component: resolves the user, loads their projects, and hands off to the
 * interactive manager. The install URL embeds the user id as `state` so the App's
 * Setup URL can attribute the installation back to this account.
 */

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { appInstallUrl, githubConfigured } from "@/lib/github";
import { listProjects } from "@/lib/lemma";
import { DashHeader } from "@/app/components/DashHeader";
import { ProjectsManager } from "./ProjectsManager";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const projects = await listProjects(userId);

  return (
    <main className="console">
      <DashHeader active="projects" />
      <ProjectsManager
        initialProjects={projects}
        installUrl={appInstallUrl(userId)}
        githubReady={githubConfigured()}
      />
    </main>
  );
}
