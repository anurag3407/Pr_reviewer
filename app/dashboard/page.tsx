/**
 * Dashboard home (auth-gated by middleware). Header + the live reviews feed.
 */

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DashHeader } from "@/app/components/DashHeader";
import { ReviewsFeed } from "./ReviewsFeed";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="console">
      <DashHeader active="home" />
      <ReviewsFeed />
    </main>
  );
}
