"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Play,
  BarChart2,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  Info,
  GitBranch,
  Clock,
  ExternalLink,
  Bug
} from "lucide-react";
import { UserButton, useAuth } from "@clerk/nextjs";

const severityColors = {
  critical: "text-red-500 border-red-500/20 bg-red-500/10",
  high: "text-orange-500 border-orange-500/20 bg-orange-500/10",
  medium: "text-yellow-500 border-yellow-500/20 bg-yellow-500/10",
  low: "text-blue-500 border-blue-500/20 bg-blue-500/10",
  info: "text-gray-400 border-gray-500/20 bg-gray-500/10",
};

export default function AnalysisDashboard() {
  const { isSignedIn } = useAuth();
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

      {/* 1. Top Navigation & Repo Context */}
      <nav className="relative border-b border-white/5 bg-[#050505]/80 backdrop-blur-md px-6 py-4 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center font-mono font-bold text-[#050505]">
            ↻
          </div>
          <span className="font-bold tracking-widest uppercase text-sm">Autoheal</span>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-gray-400 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          {isSignedIn ? (
            <UserButton />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-800 border border-white/10" />
          )}
        </div>
      </nav>

      {/* Repo Context Sub-header */}
      <header className="relative border-b border-white/5 bg-[#09090b]/50 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-10">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-white">anurag3407/Pr_reviewer</h2>
          <span className="px-2.5 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-mono font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            stopped
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 rounded-md border border-purple-500/30 bg-purple-500/10 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-all flex items-center gap-2">
            <BarChart2 className="w-4 h-4" /> Analytics
          </button>
          <button className="px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center gap-2">
            <Play className="w-4 h-4 fill-current" /> Run Analysis
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* 2. The KPI Dashboard (Severity Cards) */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Critical", value: 1, color: severityColors.critical },
            { label: "High", value: 3, color: severityColors.high },
            { label: "Medium", value: 7, color: severityColors.medium },
            { label: "Low", value: 12, color: severityColors.low },
            { label: "Info", value: 45, color: severityColors.info },
          ].map((metric) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl border ${metric.color} backdrop-blur-sm flex flex-col justify-between`}
            >
              <span className="text-xs font-mono font-medium uppercase tracking-wider opacity-80">{metric.label}</span>
              <span className="text-3xl font-bold mt-2">{metric.value}</span>
            </motion.div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 3. Agentic Summary & Primary CTA */}
          <section className="lg:col-span-1 space-y-4">
            <div className="p-6 rounded-2xl border border-white/5 bg-[#050505]/60 backdrop-blur-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-white">Analysis History</h3>
                <span className="flex items-center gap-2 text-xs text-green-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
                </span>
              </div>
              
              <div className="flex flex-col gap-2 mb-6 p-4 rounded-lg bg-white/5 border border-white/5">
                <div className="flex items-center gap-2 text-sm font-mono text-gray-400">
                  <GitBranch className="w-4 h-4" /> main
                  <span className="text-gray-600">@</span>
                  <span className="text-white">a1b2c3d</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 font-mono mt-1">
                  <Clock className="w-3.5 h-3.5" /> 2 mins ago
                </div>
                <div className="flex gap-2 mt-3">
                  <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/20">1 critical</span>
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400 border border-orange-500/20">3 high</span>
                </div>
              </div>

              <div className="text-sm leading-relaxed text-gray-400 space-y-4 mb-8">
                <p>
                  Executive Summary: The recent commit introduces a critical vulnerability in the authentication flow where magic numbers are used instead of environment variables. 
                </p>
                <p>
                  Additionally, there are 3 high-severity issues related to unhandled promise rejections in the worker threads. Immediate remediation is required to unblock the release pipeline.
                </p>
              </div>

              <button className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-400 text-[#050505] font-bold text-lg shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] hover:scale-[1.02] transition-all flex justify-center items-center gap-2">
                ✨ Fix with PR
              </button>
            </div>
          </section>

          {/* 4. Granular Code Review Feed */}
          <section className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-end mb-2">
              <h3 className="font-semibold text-white">Detailed Issues</h3>
              <button className="text-xs flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> See TestSprite Report
              </button>
            </div>

            {/* Issue Card */}
            <div className="rounded-xl border border-white/5 bg-[#050505]/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <FileCode2 className="w-4 h-4 text-gray-500" />
                  <span className="font-mono text-sm text-gray-300">src/auth/token.ts</span>
                  <span className="text-gray-600 font-mono text-sm">:42</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-red-500/10 text-red-500 border border-red-500/20 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Critical
                </span>
              </div>
              
              <div className="p-5">
                <p className="font-medium text-white mb-4 flex items-start gap-2">
                  <Bug className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  Magic numbers used for JWT signing secret instead of secure environment variables.
                </p>
                
                <div className="rounded-lg overflow-hidden border border-white/10 font-mono text-sm">
                  <div className="flex">
                    <div className="w-10 bg-white/5 text-gray-600 text-right pr-2 py-3 select-none flex flex-col">
                      <span>41</span>
                      <span className="text-red-500 bg-red-500/10">42</span>
                      <span>43</span>
                    </div>
                    <div className="flex-1 py-3 overflow-x-auto bg-[#0a0a0c]">
                      <div className="px-4 text-gray-400">const payload = &#123; user_id: user.id &#125;;</div>
                      <div className="px-4 text-red-300 bg-red-500/10 w-full inline-block">
                        const token = jwt.sign(payload, <span className="bg-red-500/20 rounded px-1">"super-secret-123"</span>);
                      </div>
                      <div className="px-4 text-gray-400">return token;</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div className="flex items-center gap-2 text-green-400 text-xs font-mono uppercase tracking-wider font-bold mb-3">
                    <CheckCircle2 className="w-4 h-4" /> Suggested Fix
                  </div>
                  <div className="font-mono text-sm text-gray-300">
                    <div className="text-green-300 line-through opacity-60">- const token = jwt.sign(payload, "super-secret-123");</div>
                    <div className="text-green-400">+ const token = jwt.sign(payload, process.env.JWT_SECRET!);</div>
                  </div>
                </div>
              </div>
            </div>

          </section>
        </div>
      </main>
    </div>
  );
}
