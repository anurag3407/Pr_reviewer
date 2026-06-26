"use client";

/**
 * ProjectsManager — connect a repo (install the GitHub App), then per repo choose
 * watched base branches, toggle auto-review, pause, or disconnect. Talks to
 * /api/projects[/id] and /api/github/branches.
 */

import { useState } from "react";
import type { Project } from "@/lib/types";

export function ProjectsManager({
  initialProjects,
  installUrl,
  githubReady,
}: {
  initialProjects: Project[];
  installUrl: string | null;
  githubReady: boolean;
}) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  function patchLocal(id: string, patch: Partial<Project>) {
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  return (
    <>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel__head">
          <span className="eyebrow">Connect a repository</span>
          <span className="panel__hint">via the GitHub App</span>
        </div>
        {githubReady && installUrl ? (
          <div className="connectrow">
            <p className="connectrow__copy">
              Install the Autoheal GitHub App on the repos you want reviewed. They&apos;ll appear
              below — pick which base branches to watch and new PRs get reviewed automatically.
            </p>
            <a className="btn btn--go btn--lg" href={installUrl}>
              + Install GitHub App
            </a>
          </div>
        ) : (
          <div className="notice">
            GitHub App not configured yet. Set <code>GITHUB_APP_ID</code>,{" "}
            <code>GITHUB_APP_PRIVATE_KEY</code>, and <code>GITHUB_APP_SLUG</code> in{" "}
            <code>.env.local</code> (see the README) to enable repo connection.
          </div>
        )}
      </section>

      <section className="pipe">
        <div className="pipe__head">
          <span className="eyebrow">Connected repositories</span>
          <span className="panel__hint">{projects.length} connected</span>
        </div>

        {projects.length === 0 ? (
          <div className="empty">
            <div className="empty__big">No repositories yet.</div>
            <div>Install the GitHub App above to connect your first repo.</div>
          </div>
        ) : (
          <div className="projlist">
            {projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                onPatch={(patch) => patchLocal(p.id, patch)}
                onRemove={() => setProjects((ps) => ps.filter((x) => x.id !== p.id))}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ProjectRow({
  project,
  onPatch,
  onRemove,
}: {
  project: Project;
  onPatch: (patch: Partial<Project>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.watched_branches.join(", "));
  const [available, setAvailable] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const paused = project.status === "PAUSED";

  async function save() {
    setBusy("save");
    const watched = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ watched_branches: watched }),
      });
      if (res.ok) {
        onPatch({ watched_branches: watched });
        setEditing(false);
      }
    } finally {
      setBusy(null);
    }
  }

  async function togglePause() {
    setBusy("pause");
    const status = paused ? "ACTIVE" : "PAUSED";
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) onPatch({ status });
    } finally {
      setBusy(null);
    }
  }

  async function toggleAuto() {
    setBusy("auto");
    const auto_review = !project.auto_review;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auto_review }),
      });
      if (res.ok) onPatch({ auto_review });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Disconnect ${project.repo}? Autoheal will stop reviewing its PRs.`)) return;
    setBusy("remove");
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (res.ok) onRemove();
    } finally {
      setBusy(null);
    }
  }

  async function loadBranches() {
    setBusy("branches");
    try {
      const qs = new URLSearchParams({ repo: project.repo, installation_id: project.installation_id });
      const res = await fetch(`/api/github/branches?${qs.toString()}`);
      const data = await res.json();
      setAvailable(Array.isArray(data.branches) ? data.branches : []);
    } catch {
      setAvailable([]);
    } finally {
      setBusy(null);
    }
  }

  function addBranch(name: string) {
    const current = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (current.includes(name)) return;
    setDraft([...current, name].join(", "));
  }

  return (
    <article className="proj" data-tone={paused ? "idle" : "ready"}>
      <div className="proj__head">
        <div>
          <div className="proj__name">{project.repo}</div>
          <div className="proj__sub">
            {project.default_branch ? `default: ${project.default_branch}` : "repo"} · install{" "}
            {project.installation_id}
          </div>
        </div>
        <span className="pill" data-tone={paused ? "idle" : "ready"}>
          <span className="pill__dot" />
          {paused ? "Paused" : "Active"}
        </span>
      </div>

      <div className="proj__branches">
        <span className="proj__label">Watching</span>
        {project.watched_branches.length === 0 ? (
          <span className="chip chip--all">all base branches</span>
        ) : (
          project.watched_branches.map((b) => (
            <span className="chip" key={b}>
              {b}
            </span>
          ))
        )}
        <button className="linkbtn" onClick={() => setEditing((e) => !e)}>
          {editing ? "cancel" : "edit"}
        </button>
      </div>

      {editing && (
        <div className="editor">
          <input
            className="editor__input"
            value={draft}
            placeholder="comma-separated branches, or empty = all"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="editor__row">
            <button className="btn" onClick={loadBranches} disabled={busy === "branches"}>
              {busy === "branches" ? "loading…" : "browse branches"}
            </button>
            <button className="btn btn--go" onClick={save} disabled={busy === "save"}>
              {busy === "save" ? "saving…" : "save"}
            </button>
          </div>
          {available && (
            <div className="suggest">
              {available.length === 0 && <span className="proj__sub">no branches found</span>}
              {available.map((b) => (
                <button className="chip chip--add" key={b} onClick={() => addBranch(b)}>
                  + {b}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="proj__controls">
        <button className="toggle" data-on={project.auto_review} onClick={toggleAuto} disabled={busy === "auto"}>
          <span className="toggle__dot" />
          Auto-review {project.auto_review ? "on" : "off"}
        </button>
        <button className="btn" onClick={togglePause} disabled={busy === "pause"}>
          {paused ? "Resume" : "Pause"}
        </button>
        <button className="btn btn--no" onClick={remove} disabled={busy === "remove"}>
          {busy === "remove" ? "removing…" : "Disconnect"}
        </button>
      </div>
    </article>
  );
}
