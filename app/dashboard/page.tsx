"use client";

import React, { useEffect, useState } from "react";
import { useUser, useAuth, UserButton } from "@clerk/nextjs";
import { Plus, GitBranch, GitMerge, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { AuthorizedBranch } from "@/lib/types";

export default function Dashboard() {
  const { user } = useUser();
  const [branches, setBranches] = useState<AuthorizedBranch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");

  const loadBranches = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/branches");
      if (res.ok) {
        setBranches(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo || !branch) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, branch, user_id: user?.id }),
      });
      if (res.ok) {
        setRepo("");
        setBranch("main");
        await loadBranches();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-gray-200 font-sans selection:bg-purple-500/30">
      {/* Background Grid */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "linear-gradient(to right, #ffffff05 1px, transparent 1px), linear-gradient(to bottom, #ffffff05 1px, transparent 1px)",
          backgroundSize: "24px 24px"
        }}
      />

      <nav className="relative border-b border-white/5 bg-[#050505]/80 backdrop-blur-md px-6 py-4 flex justify-between items-center z-10">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center font-mono font-bold text-[#050505]">
            ↻
          </div>
          <span className="font-bold tracking-widest uppercase text-sm text-white">Autoheal</span>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <UserButton />
          ) : (
            <div className="text-sm text-gray-400">Not signed in</div>
          )}
        </div>
      </nav>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Authorized Repositories</h1>
          <p className="text-gray-400">Connect a repository and branch to begin autonomous code reviews.</p>
        </div>

        <form onSubmit={handleAdd} className="p-6 rounded-2xl border border-white/5 bg-[#050505]/60 backdrop-blur-xl flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full space-y-2">
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">Repository</label>
            <div className="relative">
              <GitMerge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="owner/repo" 
                value={repo}
                onChange={e => setRepo(e.target.value)}
                className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                required
              />
            </div>
          </div>
          <div className="w-full md:w-64 space-y-2">
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">Branch</label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="main" 
                value={branch}
                onChange={e => setBranch(e.target.value)}
                className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                required
              />
            </div>
          </div>
          <button 
            type="submit" 
            disabled={isAdding}
            className="w-full md:w-auto px-6 py-2.5 rounded-lg bg-white text-black font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Authorize
          </button>
        </form>

        <div className="space-y-4">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-gray-500 mb-4">Tracking Branches</h2>
          
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : branches.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-dashed border-white/10 text-gray-500 text-sm">
              No authorized branches found. Add one above.
            </div>
          ) : (
            <div className="grid gap-3">
              {branches.map(b => (
                <Link key={b.id} href={`/analysis?repo=${encodeURIComponent(b.repo)}&branch=${encodeURIComponent(b.branch)}`}>
                  <motion.div 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="p-5 rounded-xl border border-white/5 bg-[#050505]/60 hover:bg-white/5 hover:border-white/10 transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                        <GitMerge className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-lg">{b.repo}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                          <GitBranch className="w-3.5 h-3.5" /> {b.branch}
                        </div>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-purple-500/20 group-hover:text-purple-400 transition-colors">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
