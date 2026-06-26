/**
 * Review detail page (auth-gated). Loads the review + findings server-side
 * (owner-checked) and hands off to the live client view.
 */

import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getReviewWithFindings } from "@/lib/lemma";
import { DashHeader } from "@/app/components/DashHeader";
import { ReviewDetail } from "./ReviewDetail";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const review = await getReviewWithFindings(id, userId);
  if (!review) notFound();

  return (
    <main className="console">
      <DashHeader />
      <ReviewDetail initial={review} />
    </main>
  );
}
