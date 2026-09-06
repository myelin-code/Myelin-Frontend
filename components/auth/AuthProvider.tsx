"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  api,
  clearSession,
  getStoredUser,
  getToken,
  onSessionChange,
  onUnauthorized,
  persistSession,
  type StoredUser,
} from "@/lib/api/client";
import type { AuthResponse, LoginRequest, RegisterRequest } from "@/lib/api/types";
import { ApiError } from "@/lib/api/types";
import { clearIdentity } from "@/lib/identity";

type AuthState = {
  user: StoredUser | null;
  token: string | null;
  ready: boolean;
};

type AuthContextValue = AuthState & {
  login: (body: LoginRequest) => Promise<AuthResponse>;
  register: (body: RegisterRequest) => Promise<AuthResponse>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SERVER_SNAPSHOT: AuthState = { user: null, token: null, ready: false };
let snapshot: AuthState = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function emit(next: AuthState) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function hydrate() {
  emit({
    user: getStoredUser(),
    token: getToken(),
    ready: true,
  });
}

if (typeof window !== "undefined") {
  hydrate();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot(): AuthState {
  return SERVER_SNAPSHOT;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // An expired token otherwise leaves the UI signed-in-looking while every request 401s.
  // Registered at module scope inside an effect so it runs once, not per render.
  //
  // This now only fires once a renewal has already been tried and refused (see
  // `authorizedFetch`), so reaching here really does mean the session is over -- an access
  // token merely aging out mid-run is renewed silently and never gets this far.
  useEffect(() => {
    onUnauthorized(() => {
      clearSession();
      emit({ user: null, token: null, ready: true });
    });
  }, []);

  // A silent refresh replaces the stored token without going through `login`, so re-read it
  // when that happens -- otherwise anything rendering off `token` keeps the dead one.
  useEffect(() => onSessionChange(hydrate), []);

  const login = useCallback(async (body: LoginRequest) => {
    const auth = await api.login(body);
    persistSession(auth);
    clearIdentity();
    emit({ user: { user_id: auth.user_id, email: auth.email, is_admin: auth.is_admin }, token: auth.access_token, ready: true });
    return auth;
  }, []);

  const register = useCallback(async (body: RegisterRequest) => {
    try {
      const auth = await api.register(body);
      persistSession(auth);
      clearIdentity();
      emit({
        user: { user_id: auth.user_id, email: auth.email, is_admin: auth.is_admin },
        token: auth.access_token,
        ready: true,
      });
      return auth;
    } catch (err) {
      // Supabase rejects a signup for an address that already has an account, which the
      // backend surfaces as a 422 (see backend `routes/auth.py`). Someone re-submitting the
      // signup form for an account they already own almost certainly meant "log me in", so
      // try that before surfacing the error. Any *other* 422 (invalid address, weak password)
      // fails login too, and the original -- more accurate -- reason is what gets rethrown.
      //
      // Previously this matched 400/500: before the backend normalized Supabase's rejections,
      // every one of them arrived as an unhandled 500. Those codes no longer reach here.
      if (err instanceof ApiError && err.status === 422) {
        try {
          return await login(body);
        } catch {
          throw err;
        }
      }
      throw err;
    }
  }, [login]);

  const logout = useCallback(() => {
    clearSession();
    // The cached profile belongs to the session that just ended. A stale name over the next
    // person's account is worse than no name at all.
    clearIdentity();
    emit({ user: null, token: null, ready: true });
  }, []);

  const value = useMemo(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
