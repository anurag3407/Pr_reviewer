import { NextResponse } from "next/server";
import { addAuthorizedBranch, listAuthorizedBranches } from "@/lib/lemma";

export async function GET() {
  try {
    const branches = await listAuthorizedBranches();
    return NextResponse.json(branches);
  } catch (error) {
    console.error("Failed to fetch branches", error);
    return NextResponse.json({ error: "Failed to fetch branches" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { repo, branch, user_id } = await req.json();
    if (!repo || !branch) {
      return NextResponse.json({ error: "Missing repo or branch" }, { status: 400 });
    }
    const newBranch = await addAuthorizedBranch({ repo, branch, user_id });
    return NextResponse.json(newBranch);
  } catch (error) {
    console.error("Failed to add branch", error);
    return NextResponse.json({ error: "Failed to add branch" }, { status: 500 });
  }
}
