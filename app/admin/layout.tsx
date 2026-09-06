"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import { LogOut, Users } from "lucide-react";
import { ButtonSpinner } from "@/components/ui/Loading";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready) {
      if (!user) {
        router.replace("/login");
      } else if (!user.is_admin) {
        router.replace("/simulations");
      }
    }
  }, [user, ready, router]);

  if (!ready || !user || !user.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void text-white">
        <ButtonSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void text-ink font-sans selection:bg-teal/30 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/10 bg-[var(--panel-2)] p-4 md:p-6 flex flex-col justify-between shrink-0">
        <div>
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-void">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path
                  d="M3 18V6l4.5 6 4.5-6 4.5 6 4.5-6v12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <span className="block text-sm font-semibold tracking-wide text-white">Myelin Admin</span>
              <span className="block text-[10px] uppercase tracking-widest text-teal">Control Panel</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors bg-white/5 text-white hover:bg-white/10"
            >
              <Users className="h-4 w-4" />
              Users & Runs
            </Link>
          </nav>
        </div>

        <div className="mt-auto pt-6 border-t border-white/10">
          <div className="mb-4 text-xs text-dim truncate px-1" title={user.email}>
            {user.email}
          </div>
          <button
            onClick={() => {
              logout();
              router.replace("/");
            }}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-dim transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-void p-4 md:p-8 lg:p-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
