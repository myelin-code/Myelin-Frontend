"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { AdminUserDetail } from "@/lib/api/types";

import { ArrowLeft, Mail, ShieldAlert, Award, Grid, Activity, PlayCircle, BarChart2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ButtonSpinner } from "@/components/ui/Loading";
import { Eyebrow } from "@/components/ui/Kit";

export default function AdminUserDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      if (!id) return;
      try {
        const res = await api.getAdminUser(id);
        setUser(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load user details.");
      } finally {
        setIsLoading(false);
      }
    }
    loadUser();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <ButtonSpinner />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-6">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-dim hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </Link>
        <div className="rounded-xl border border-rose/30 bg-rose/10 p-6 flex flex-col gap-4 text-rose max-w-2xl">
          <div className="flex items-start gap-4">
            <ShieldAlert className="h-6 w-6 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-lg">Error loading user profile</h3>
              <p className="mt-1 text-rose/80">{error || "User not found."}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-12">
      <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-dim hover:text-white transition-colors uppercase tracking-widest text-xs font-semibold">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Users
      </Link>
      
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal/10 border border-teal/20 text-teal">
              <span className="text-xl font-bold uppercase">{user.first_name?.[0] || user.email[0]}</span>
            </div>
            <div>
              <Eyebrow accent="cyan">User Identity</Eyebrow>
              <h1 className="mt-1 text-3xl font-light tracking-wide text-white">{user.first_name || "Anonymous User"}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-dim">
            <span className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5"><Mail className="h-3.5 w-3.5" /> {user.email}</span>
            <span className={`px-3 py-1 rounded-full border font-bold uppercase tracking-widest text-[10px] ${
              user.role === 'admin' 
                ? 'bg-amber/10 text-amber border-amber/20' 
                : 'bg-teal/10 text-teal border-teal/20'
            }`}>
              {user.role || 'user'}
            </span>
            <span className="px-3 py-1 bg-white/5 rounded-full border border-white/5 text-xs">
              ID: <span className="font-mono text-white/70">{user.user_id}</span>
            </span>
          </div>
        </div>
        
        <div className="text-left md:text-right">
          <div className="text-xs uppercase tracking-widest text-dim mb-1">Registered</div>
          <div className="text-white bg-white/5 border border-white/10 px-4 py-2 rounded-lg font-mono text-sm">
            {user.created_at ? new Date(user.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Unknown"}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] p-6 shadow-xl flex flex-col h-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Award className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-medium tracking-wide">Professional Profile</h2>
          </div>
          
          <div className="space-y-4 flex-1">
            <div className="grid grid-cols-3 gap-2 py-3 border-b border-white/5 text-sm">
              <span className="text-dim">Institution</span>
              <span className="col-span-2 text-white font-medium">{user.institution_name || "—"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-3 border-b border-white/5 text-sm">
              <span className="text-dim">Degree</span>
              <span className="col-span-2 text-white font-medium">{user.degree || "—"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-3 border-b border-white/5 text-sm">
              <span className="text-dim">Year</span>
              <span className="col-span-2 text-white font-medium">{user.current_year || "—"}</span>
            </div>
            <div className="py-3 text-sm">
              <span className="block text-dim mb-3">Goals</span>
              {user.goals && user.goals.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {user.goals.map((g, i) => (
                    <span key={i} className="bg-white/5 border border-white/10 text-white/80 px-3 py-1.5 rounded-md text-xs font-medium">
                      {g}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-white/40 italic">No goals specified</span>
              )}
            </div>
          </div>
        </div>

        {/* Activity Summary */}
        <div className="rounded-2xl border border-white/10 bg-[var(--panel-2)] p-6 shadow-xl flex flex-col h-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center border border-teal/20">
              <Activity className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-medium tracking-wide">Simulation Activity</h2>
          </div>
          
          <div className="flex-1 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-void border border-white/5 rounded-xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><Grid className="h-16 w-16" /></div>
                <div className="text-4xl font-light text-white mb-2">{user.runs?.length || 0}</div>
                <div className="text-xs uppercase tracking-widest text-teal font-medium">Total Runs</div>
              </div>
              
              <div className="bg-void border border-white/5 rounded-xl p-5 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4 opacity-5"><BarChart2 className="h-16 w-16" /></div>
                 <div className="text-4xl font-light text-white mb-2">
                   {user.runs?.reduce((total, run) => total + (run.quarters?.length || 0), 0) || 0}
                 </div>
                 <div className="text-xs uppercase tracking-widest text-teal font-medium">Quarters Played</div>
              </div>
            </div>

            <div className="text-sm">
              <span className="text-dim block mb-2">Latest Login</span>
              <div className="font-mono text-white/90">
                {user.latest_login ? new Date(user.latest_login).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Record unavailable"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Runs Log */}
      <div>
        <div className="flex items-center gap-3 mb-6 mt-4">
          <div className="h-8 w-8 rounded-lg bg-rose/10 text-rose flex items-center justify-center border border-rose/20">
            <PlayCircle className="h-4 w-4" />
          </div>
          <h2 className="text-lg font-medium tracking-wide text-white">Simulation History</h2>
        </div>
        
        {user.runs && user.runs.length > 0 ? (
          <div className="grid gap-4">
            {user.runs.map((run, idx) => (
              <div key={run.run_id} className="rounded-xl border border-white/10 bg-[var(--panel-2)] overflow-hidden shadow-lg group">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b border-white/5 bg-white/[0.02]">
                  <div>
                     <div className="flex items-center gap-3 mb-1">
                        <span className="text-white font-medium">Run #{user.runs.length - idx}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider border ${
                          run.status === 'active' ? 'bg-teal/10 text-teal border-teal/20' :
                          run.status === 'completed' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                          run.status === 'distressed' ? 'bg-amber/10 text-amber border-amber/20' :
                          'bg-white/10 text-dim border-white/10'
                        }`}>
                          {run.status}
                        </span>
                     </div>
                     <div className="text-xs text-dim font-mono">
                       {run.scenario_id} • {new Date(run.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric" })}
                     </div>
                  </div>
                  <div className="mt-4 sm:mt-0 text-left sm:text-right">
                    <div className="text-[10px] uppercase tracking-widest text-dim mb-1">Total Quarters</div>
                    <div className="text-white font-mono">{run.quarters?.length || 0}</div>
                  </div>
                </div>
                
                {run.quarters && run.quarters.length > 0 && (
                  <div className="overflow-x-auto p-5">
                    <div className="flex gap-4">
                      {run.quarters.map(q => (
                        <div key={q.quarter} className="shrink-0 bg-void border border-white/5 rounded-lg p-3 w-32 border-l-4 border-l-teal/60">
                           <div className="text-xs font-bold text-white mb-2">Q{q.quarter}</div>
                           <div className="space-y-1">
                             <div className="text-[10px] text-dim flex justify-between">
                               <span>Rev:</span>
                               <span className="text-white/80">{q.revenue}</span>
                             </div>
                             <div className="text-[10px] text-dim flex justify-between">
                               <span>Prof:</span>
                               <span className="text-white/80">{q.profit}</span>
                             </div>
                           </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/20 p-12 text-center text-dim bg-[var(--panel-2)]/50">
            This user has not started any simulation runs yet.
          </div>
        )}
      </div>
    </div>
  );
}
