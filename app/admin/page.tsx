"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { AdminUserSummary } from "@/lib/api/types";

import { Search, ShieldAlert, ArrowRight, Activity } from "lucide-react";
import Link from "next/link";
import { ButtonSpinner } from "@/components/ui/Loading";
import { Eyebrow } from "@/components/ui/Kit";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await api.getAdminUsers();
        setUsers(res.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setIsLoading(false);
      }
    }
    loadUsers();
  }, []);

  const filteredUsers = users.filter((u) => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <Eyebrow accent="cyan">Database Overview</Eyebrow>
          <h1 className="mt-3 text-3xl font-light tracking-wide text-white">Users & Runs</h1>
        </div>
        
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
          <input
            type="text"
            placeholder="Search by email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-dim outline-none transition-colors focus:border-teal/50 focus:bg-white/10"
          />
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose/30 bg-rose/10 p-6 flex items-start gap-4 text-rose">
          <ShieldAlert className="h-6 w-6 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-lg">Error loading administration data</h3>
            <p className="mt-1 text-rose/80">{error}</p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-white/5 bg-[var(--panel-2)]">
          <ButtonSpinner />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--panel-2)] shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-ink whitespace-nowrap">
              <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-dim">
                <tr>
                  <th className="px-6 py-4 font-medium">Email</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">Registered</th>
                  <th className="px-6 py-4 font-medium text-right">Runs</th>
                  <th className="px-6 py-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-dim bg-white/[0.02]">
                      No matching users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.user_id} className="group transition-colors hover:bg-white-[0.02]">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{u.email}</div>
                        <div className="text-xs text-dim mt-0.5 font-mono">{u.user_id.split("-")[0]}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                          u.role === 'admin' 
                            ? 'bg-amber/10 text-amber border border-amber/20' 
                            : 'bg-white/10 text-dim border border-white/10'
                        }`}>
                          {u.role || 'user'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-dim">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/5 text-white text-xs">
                          <Activity className="h-3 w-3 text-teal" />
                          {u.run_count ?? 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link 
                          href={`/admin/users/${u.user_id}`}
                          className="inline-flex items-center gap-2 text-teal hover:text-white transition-colors text-xs font-semibold uppercase tracking-wider"
                        >
                          View 
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="border-t border-white/10 bg-void/50 px-6 py-4 text-xs tracking-widest text-dim uppercase flex justify-between items-center">
            <span>Server Response</span>
            <span className="text-white bg-white/10 px-2 py-1 rounded-md font-mono">{users.length} Records</span>
          </div>
        </div>
      )}
    </div>
  );
}
