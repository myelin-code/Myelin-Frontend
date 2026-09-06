import type {
  ApiErrorBody,
  AuthResponse,
  CompanyCreate,
  CompanyDetailResponse,
  CompanyListResponse,
  CrisisAllocationSubmit,
  CrisisBriefingResponse,
  DemandPreviewRequest,
  DemandPreviewResponse,
  DetailedDemandResponse,
  EndgameDecisionResponse,
  EndgameDecisionSubmit,
  EndgamePreviewResponse,
  FinanceAdminAllocationSubmit,
  ForgotPasswordRequest,
  HrAllocationSubmit,
  LeaderboardResponse,
  LoginRequest,
  MarketingAllocationSubmit,
  MessageResponse,
  OperationsAllocationSubmit,
  ProfileResponse,
  ProfileUpdate,
  QuarterAllocationResponse,
  QuarterDetailResponse,
  QuarterReportPdfResponse,
  QuarterReportResponse,
  SimulationReportPdfResponse,
  RefreshRequest,
  RegisterRequest,
  ResetPasswordRequest,
  RndAllocationSubmit,
  RunStateResponse,
  SalesAllocationSubmit,
} from "@/lib/api/types";
import { ApiError } from "@/lib/api/types";

const TOKEN_KEY = "myelin_access_token";
const REFRESH_KEY = "myelin_refresh_token";
const USER_KEY = "myelin_user";
const COMPANY_KEY = "myelin_active_company";

export function getApiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

  // Ensure the URL is absolute (starts with http:// or https://)
  // This prevents it from being treated as a relative path
  if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }

  return url;
}

export type StoredUser = { user_id: string; email: string; is_admin?: boolean };

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function getActiveCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(COMPANY_KEY);
}

export function setActiveCompanyId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(COMPANY_KEY, id);
  else window.localStorage.removeItem(COMPANY_KEY);
}

export function persistSession(auth: AuthResponse) {
  window.localStorage.setItem(TOKEN_KEY, auth.access_token);
  if (auth.refresh_token) {
    window.localStorage.setItem(REFRESH_KEY, auth.refresh_token);
  }
  window.localStorage.setItem(
    USER_KEY,
    JSON.stringify({ user_id: auth.user_id, email: auth.email, is_admin: auth.is_admin }),
  );
  notifySession();
}

/** Subscribers to "the stored session changed underneath you" -- i.e. a silent refresh. Login
 *  and logout already flow through `AuthProvider`'s own callbacks; a refresh does not, because
 *  it happens inside whichever request happened to hit an expiring token. */
const sessionListeners = new Set<() => void>();

export function onSessionChange(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function notifySession() {
  sessionListeners.forEach((l) => l());
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(COMPANY_KEY);
  notifySession();
}

let unauthorizedHandler: (() => void) | null = null;

/**
 * The single app-wide reaction to a 401. Supabase access tokens expire (~1h), and without this
 * an expired session left the UI *looking* signed in -- the nav still rendered the stored email
 * -- while every request failed with a raw `not_authenticated` string. Registered once by
 * `AuthProvider`; see the integration guide's error table ("send the user to login").
 */
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

/* ── keeping the session alive ────────────────────────────────────
 *
 * Supabase issues an access token that expires in about an hour and a refresh token to trade
 * for the next one. The refresh token was being stored and never used, so a run that took
 * longer than an hour -- which a four-quarter simulation reliably does, usually somewhere
 * around Q3 -- simply ran out of session: every call started coming back 401, the 401 handler
 * cleared the session, and `RunShell` bounced the CEO to the login page mid-quarter.
 *
 * `authorizedFetch` closes that hole from both ends: it renews a token that is *about* to
 * expire before spending it, and treats a 401 that slips through anyway (clock skew, a token
 * revoked server-side) as one retryable event rather than the end of the session.
 */

/** Renew this far ahead of expiry, so a request never races the clock it just checked. */
const REFRESH_SKEW_MS = 60_000;

/** Seconds-since-epoch `exp` out of a JWT payload, or null if it isn't readable as one. */
function tokenExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

function isExpiringSoon(token: string): boolean {
  const exp = tokenExpiry(token);
  // An unreadable token is left alone: a 401 will still trigger the reactive path below, and
  // guessing "expired" here would refresh on every single request.
  if (exp === null) return false;
  return exp * 1000 - Date.now() < REFRESH_SKEW_MS;
}

/** In-flight refresh, shared. The simulation fires several calls at once (run + endgame, a
 *  debounced preview alongside them); without this they would each spend the refresh token,
 *  and Supabase only honours the first -- the rest would come back 401 and sign the user out
 *  for the exact reason this is meant to prevent. */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      // `api.refresh` sends this unauthenticated -- it authenticates with the refresh token in
      // its body, and must never recurse back into the refresh path it is implementing.
      const auth = await api.refresh({ refresh_token: refreshToken });
      persistSession(auth);
      return auth.access_token;
    } catch {
      // Refused (spent, revoked, expired) or unreachable. Either way there is no new token;
      // the caller decides what a failed renewal means for the request it was making.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * `fetch` against the API with a Bearer token that is kept current, and one -- exactly one --
 * retry after a renewal. Shared with `lib/simulation/remote.ts` so the simulation's own calls
 * sit on the same session handling as everything else rather than a parallel copy of it.
 */
export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else headers.delete("Authorization");
    return fetch(`${getApiBase()}${path}`, { ...init, headers });
  };

  let token = getToken();
  if (token && isExpiringSoon(token)) token = (await refreshSession()) ?? token;

  let res = await send(token);

  if (res.status === 401 && getRefreshToken()) {
    const renewed = await refreshSession();
    if (renewed) res = await send(renewed);
  }

  // Still 401 with a fresh token (or nothing left to refresh with): the session really is
  // over. This is the only path that signs the user out.
  if (res.status === 401) unauthorizedHandler?.();

  return res;
}

/**
 * Similar to authorizedFetch but for optional-auth endpoints. Sends token if available,
 * but doesn't trigger logout on 401. Used for public endpoints that enhance content when
 * authenticated (e.g., leaderboards showing "your position").
 */
export async function optionalAuthFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else headers.delete("Authorization");
    return fetch(`${getApiBase()}${path}`, { ...init, headers });
  };

  let token = getToken();
  // Only try to refresh if we have a token and it's expiring - but don't fail if no token
  if (token && isExpiringSoon(token)) {
    const refreshed = await refreshSession();
    if (refreshed) token = refreshed;
  }

  let res = await send(token);

  // One retry with refresh if we got 401 and have a refresh token
  if (res.status === 401 && token && getRefreshToken()) {
    const renewed = await refreshSession();
    if (renewed) res = await send(renewed);
  }

  // Don't trigger unauthorizedHandler - this endpoint works for both auth states
  return res;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth: boolean | "optional" = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  // FormData sets its own Content-Type (multipart/form-data with a generated boundary) --
  // setting it here would strip that boundary and break the upload.
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // auth modes:
  // - true: requires auth, triggers logout on 401 (default for most endpoints)
  // - false: no auth sent, used for register/login/forgot/reset
  // - "optional": sends auth if available, but doesn't trigger logout on 401 (public endpoints)
  const res =
    auth === true
      ? await authorizedFetch(path, { ...init, headers })
      : auth === "optional"
        ? await optionalAuthFetch(path, { ...init, headers })
        : await fetch(`${getApiBase()}${path}`, { ...init, headers });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { detail: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, (body ?? {}) as ApiErrorBody);
  }
  return body as T;
}

function moneyPayload<T extends Record<string, unknown>>(data: T): T {
  // Backend Decimals accept number or string; send numbers for simplicity.
  return data;
}

/* ── Auth ─────────────────────────────────────────────────────── */

export const api = {
  health: () => request<{ status: string }>("/health", {}, false),

  register: (body: RegisterRequest) =>
    request<AuthResponse>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(body) },
      false,
    ),

  login: (body: LoginRequest) =>
    request<AuthResponse>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(body) },
      false,
    ),

  /** Trade the stored refresh token for a fresh session. Normally driven by `authorizedFetch`
   *  rather than called directly. */
  refresh: (body: RefreshRequest) =>
    request<AuthResponse>(
      "/auth/refresh",
      { method: "POST", body: JSON.stringify(body) },
      false,
    ),

  forgotPassword: (body: ForgotPasswordRequest) =>
    request<MessageResponse>(
      "/auth/forgot-password",
      { method: "POST", body: JSON.stringify(body) },
      false,
    ),

  resetPassword: (body: ResetPasswordRequest) =>
    request<MessageResponse>(
      "/auth/reset-password",
      { method: "POST", body: JSON.stringify(body) },
      false,
    ),

  /* ── Profile ──────────────────────────────────────────────── */

  getProfile: () => request<ProfileResponse>("/profile"),

  updateProfile: (body: ProfileUpdate) =>
    request<ProfileResponse>("/profile", { method: "PATCH", body: JSON.stringify(body) }),

  /* ── Company / run ─────────────────────────────────────────── */

  createCompany: (body: CompanyCreate) =>
    request<CompanyDetailResponse>("/companies", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Runs this user owns. Server-side truth -- replaces trusting a localStorage company id. */
  listCompanies: (opts?: { limit?: number; offset?: number }): Promise<CompanyListResponse> => {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.append("limit", String(opts.limit));
    if (opts?.offset !== undefined) params.append("offset", String(opts.offset));

    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<CompanyListResponse>(`/companies${qs}`);
  },

  getCompany: (companyId: string) =>
    request<CompanyDetailResponse>(`/companies/${companyId}`),

  updateCompany: (companyId: string, body: { name: string }) =>
    request<CompanyDetailResponse>(`/companies/${companyId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getRun: (companyId: string) =>
    request<RunStateResponse>(`/companies/${companyId}/run`),

  openQuarter: (companyId: string) =>
    request<QuarterDetailResponse>(`/companies/${companyId}/quarters`, {
      method: "POST",
    }),

  getQuarter: (companyId: string, quarterId: string) =>
    request<QuarterDetailResponse>(
      `/companies/${companyId}/quarters/${quarterId}`,
    ),

  /* ── Allocations (22-line model) ───────────────────────────── */

  submitMarketing: (
    companyId: string,
    quarterId: string,
    body: MarketingAllocationSubmit,
  ) =>
    request<QuarterAllocationResponse>(
      `/companies/${companyId}/quarters/${quarterId}/allocations/marketing`,
      { method: "POST", body: JSON.stringify(moneyPayload(body)) },
    ),

  submitSales: (
    companyId: string,
    quarterId: string,
    body: SalesAllocationSubmit,
  ) =>
    request<QuarterAllocationResponse>(
      `/companies/${companyId}/quarters/${quarterId}/allocations/sales`,
      { method: "POST", body: JSON.stringify(moneyPayload(body)) },
    ),

  submitRnd: (
    companyId: string,
    quarterId: string,
    body: RndAllocationSubmit,
  ) =>
    request<QuarterAllocationResponse>(
      `/companies/${companyId}/quarters/${quarterId}/allocations/rnd`,
      { method: "POST", body: JSON.stringify(moneyPayload(body)) },
    ),

  submitOperations: (
    companyId: string,
    quarterId: string,
    body: OperationsAllocationSubmit,
  ) =>
    request<QuarterAllocationResponse>(
      `/companies/${companyId}/quarters/${quarterId}/allocations/operations`,
      { method: "POST", body: JSON.stringify(moneyPayload(body)) },
    ),

  submitHr: (companyId: string, quarterId: string, body: HrAllocationSubmit) =>
    request<QuarterAllocationResponse>(
      `/companies/${companyId}/quarters/${quarterId}/allocations/hr`,
      { method: "POST", body: JSON.stringify(moneyPayload(body)) },
    ),

  submitFinanceAdmin: (
    companyId: string,
    quarterId: string,
    body: FinanceAdminAllocationSubmit,
  ) =>
    request<QuarterAllocationResponse>(
      `/companies/${companyId}/quarters/${quarterId}/allocations/finance_admin`,
      { method: "POST", body: JSON.stringify(moneyPayload(body)) },
    ),

  submitCrisis: (
    companyId: string,
    quarterId: string,
    body: CrisisAllocationSubmit,
  ) =>
    request<QuarterAllocationResponse>(
      `/companies/${companyId}/quarters/${quarterId}/allocations/crisis`,
      { method: "POST", body: JSON.stringify(moneyPayload(body)) },
    ),

  /* ── Lock / report / leaderboard / endgame ─────────────────── */

  lockQuarter: (companyId: string, quarterId: string) =>
    request<QuarterReportResponse>(
      `/companies/${companyId}/quarters/${quarterId}/lock`,
      { method: "POST" },
    ),

  getReport: (companyId: string, quarterId: string) =>
    request<QuarterReportResponse>(
      `/companies/${companyId}/quarters/${quarterId}/report`,
    ),

  /** Uploads a client-rendered report PDF for storage in Supabase Storage's private bucket. */
  storeReportPdf: (companyId: string, quarterId: string, pdf: Blob) => {
    const form = new FormData();
    form.append("file", pdf, "report.pdf");
    return request<QuarterReportPdfResponse>(
      `/companies/${companyId}/quarters/${quarterId}/report/pdf`,
      { method: "POST", body: form },
    );
  },

  /** 404s if no PDF has been generated for this quarter yet -- a normal answer, not an error
   *  worth surfacing (mirrors getCrisisBriefing's reasoning below). */
  getReportPdf: (companyId: string, quarterId: string) =>
    request<QuarterReportPdfResponse>(
      `/companies/${companyId}/quarters/${quarterId}/report/pdf`,
    ),

  /** The crisis briefing. 404s on any quarter that isn't the scenario's crisis quarter, which
   *  is a normal answer ("no crisis here"), not an error worth surfacing to the student. */
  getCrisisBriefing: (companyId: string, quarterId: string) =>
    request<CrisisBriefingResponse>(
      `/companies/${companyId}/quarters/${quarterId}/crisis`,
    ),

  getLeaderboard: (scenarioId = "nadi_wear_standard") =>
    request<LeaderboardResponse>(`/leaderboard?scenario_id=${encodeURIComponent(scenarioId)}`, {}, "optional"),

  getEndgame: (companyId: string, quarterId: string) =>
    request<EndgamePreviewResponse>(
      `/companies/${companyId}/quarters/${quarterId}/endgame`,
    ),

  submitEndgame: (
    companyId: string,
    quarterId: string,
    body: EndgameDecisionSubmit,
  ) =>
    request<EndgameDecisionResponse>(
      `/companies/${companyId}/quarters/${quarterId}/endgame`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  /** Store the simulation final report PDF. */
  storeSimulationReportPdf: (companyId: string, pdf: Blob) => {
    const form = new FormData();
    form.append("file", pdf, "report.pdf");
    return request<SimulationReportPdfResponse>(
      `/companies/${companyId}/simulation/report/pdf`,
      { method: "POST", body: form },
    );
  },

  /** Re-sign a previously stored simulation report PDF. 404 if never generated. */
  getSimulationReportPdf: (companyId: string) =>
    request<SimulationReportPdfResponse>(
      `/companies/${companyId}/simulation/report/pdf`,
    ),

  /* ── Demand Preview ─────────────────────────────────────────── */

  previewDemand: (body: DemandPreviewRequest) =>
    request<DemandPreviewResponse>(
      "/api/demand/preview",
      { method: "POST", body: JSON.stringify(body) },
    ),

  getDetailedDemand: (body: DemandPreviewRequest) =>
    request<DetailedDemandResponse>(
      "/api/demand/detailed",
      { method: "POST", body: JSON.stringify(body) },
    ),

  /* ── PDF Reports ───────────────────────────────────────────── */

  generateDecisionIntelligencePdf: async (body: import("@/lib/api/report-types").DecisionIntelligenceReport): Promise<Blob> => {
    const res = await authorizedFetch("/reports/decision-intelligence/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      let errorBody: unknown = null;
      try {
        errorBody = JSON.parse(text);
      } catch {
        errorBody = { detail: text };
      }
      throw new ApiError(res.status, (errorBody ?? {}) as ApiErrorBody);
    }

    return await res.blob();
  },

  /* ── Admin Area ────────────────────────────────────────────── */

  getAdminUsers: () => request<import("@/lib/api/types").AdminUsersResponse>("/admin/users"),

  getAdminUser: (userId: string) => request<import("@/lib/api/types").AdminUserDetail>(`/admin/users/${userId}`),
};
