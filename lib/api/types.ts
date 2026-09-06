/** Exact shapes mirrored from MyElin-Backend OpenAPI / Pydantic schemas. */

export type Move =
  | "open_next_quarter"
  | "submit_allocation"
  | "submit_crisis_allocation"
  | "submit_endgame_decision"
  | "lock_quarter"
  | "read_quarter_report"
  | "read_endgame_preview";

export type RunStatus = "active" | "distressed" | "failed" | "completed";
export type QuarterStatus = "in_progress" | "closed";
export type Tier = "thriving" | "stable" | "distressed";
export type CrisisChoice = "A" | "B" | "C" | "D";
export type EndgamePath = "A" | "B" | "C";
export type CriterionResult = "clearly_met" | "partially_met" | "not_met";

/** Backend money fields arrive as Decimal JSON strings. */
export type Money = string | number;

export type AuthResponse = {
  access_token: string;
  refresh_token: string | null;
  user_id: string;
  email: string;
  is_admin: boolean;
};

export type LoginRequest = { email: string; password: string };
export type RefreshRequest = { refresh_token: string };
export type RegisterRequest = { email: string; password: string };
export type ForgotPasswordRequest = { email: string };
export type ResetPasswordRequest = { access_token: string; new_password: string };
export type MessageResponse = { message: string };

/** Mirrors `lib/institutions.ts`'s own `InstitutionRef` exactly -- same shape on both sides
 * of the wire on purpose. */
export type ProfileInstitution = { id: string; name: string; verified: boolean };

export type ProfileResponse = {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
  first_name: string | null;
  institution: ProfileInstitution | null;
  degree: string | null;
  current_year: string | null;
  goals: string[];
};

/** Every field optional -- omit to leave unchanged, send `null` to clear. */
export type ProfileUpdate = {
  first_name?: string | null;
  institution?: ProfileInstitution | null;
  degree?: string | null;
  current_year?: string | null;
  goals?: string[] | null;
};

export type CompanyCreate = {
  name: string;
  scenario_id?: string | null;
  company_id?: string | null;
};

export type ScenarioResponse = {
  scenario_id: string;
  display_name: string;
  total_quarters: number;
  crisis_quarter: number | null;
};

export type QuarterSummary = {
  id: string;
  number: number;
  status: QuarterStatus;
  cash_balance: Money;
  revenue: Money;
};

export type CompanyDetailResponse = {
  id: string;
  /** This owner's run number -- their 1st, 2nd, 3rd run. Unique per owner and never
   *  reassigned, which is what makes it safe to put in a URL (`/run/2`) in place of `id`.
   *  `id` stays the only value any API path takes. */
  seq: number;
  created_at: string;
  name: string;
  scenario_id: string;
  seed_name: string;
  profile_name: string;
  owner_id: string | null;
  run_status: RunStatus;
  survival_condition: string | null;
  survival_detail: string | null;
  scenario: ScenarioResponse;
  quarters: QuarterSummary[];
};

/** One row of `GET /companies` -- everything needed to render a "resume a run" card. */
export type CompanyListItem = {
  id: string;
  /** This owner's run number -- their 1st, 2nd, 3rd run. Unique per owner and never
   *  reassigned, which is what makes it safe to put in a URL (`/run/2`) in place of `id`.
   *  `id` stays the only value any API path takes. */
  seq: number;
  name: string;
  created_at: string;
  run_status: RunStatus;
  scenario_id: string;
  total_quarters: number;
  crisis_quarter: number | null;
  current_quarter_number: number | null;
  current_quarter_status: QuarterStatus | null;
  quarters_locked: number;
  /** Most recently *locked* quarter's score, so an in-progress run still shows where you left off. */
  latest_ceo_score: Money | null;
  latest_band: string | null;
};

export type CompanyListResponse = {
  total: number;
  entries: CompanyListItem[];
};

/* ── crisis briefing (docs/11: narrative and choices only, never constants) ── */

export type CrisisChoiceBriefing = {
  /** The value to send as `crisis_choice`. A different letter axis than `scenario_code`. */
  code: CrisisChoice;
  label: string;
  effect: string;
};

export type CrisisResponseLine = {
  /** Field name on `CrisisAllocationSubmit`. */
  field: string;
  label: string;
};

export type CrisisBriefingResponse = {
  /** Which event fired: A Price Warrior / B Marketing Blitz / C Feature Leapfrog / D Supply Shock. */
  scenario_code: CrisisChoice;
  title: string;
  category: "competitive" | "operational" | string;
  narrative: string;
  choices: CrisisChoiceBriefing[];
  /** Only the spend lines this scenario's recovery formulas actually read. Funding anything
   *  else is inert -- drive the crisis form from this, not from the full five-field shape. */
  response_lines: CrisisResponseLine[];
  ignoring_is_legal: boolean;
};

export type MetricSchema = {
  value: Money;
  delta: Money | null;
};

export type BindingConstraintSchema = {
  gate: string;
  demand_lost: Money;
  demand_lost_unit: string;
  detail: string;
};

export type ScoreTrajectoryPoint = {
  quarter_number: number;
  ceo_score: Money;
  band: string;
};

export type EndgamePreviewResponse = {
  tier: Tier;
  tier_detail: string;
  momentum_score: Money;
  term_sheet_menu: {
    path_a_name: string;
    path_b_name: string;
    path_c_name: string;
  };
  covenant_units: Money;
  true_continuation_value_inr: Money;
  acquisition_trap_offer_inr: Money | null;
};

export type RunStateResponse = {
  company_id: string;
  run_status: RunStatus;
  total_quarters: number;
  crisis_quarter: number | null;
  current_quarter_id: string | null;
  current_quarter_number: number | null;
  current_quarter_status: QuarterStatus | null;
  legal_moves: Move[];
  binding_constraint_hint: BindingConstraintSchema[];
  score_trajectory: ScoreTrajectoryPoint[];
  endgame_preview: EndgamePreviewResponse | null;
};

export type QuarterDetailResponse = {
  id: string;
  company_id: string;
  number: number;
  status: QuarterStatus;
  cash_balance: Money;
  revenue: Money;
  created_at: string;
  closed_at: string | null;
  modifiers: Record<string, number>;
  allocations: Record<string, Money> | null;
  warranty_years: number | null;
  crisis: Record<string, Money | string | null> | null;
};

export type MarketingAllocationSubmit = {
  google_ads?: Money;
  meta_ads?: Money;
  social_influencer?: Money;
  content_seo?: Money;
  events_pr?: Money;
  email_marketing?: Money;
  referral?: Money;
  prelaunch_buzz?: Money;
};

export type SalesAllocationSubmit = {
  reps?: Money;
  crm_tools?: Money;
  onboarding?: Money;
};

export type RndAllocationSubmit = {
  quality_qa?: Money;
  innovation?: Money;
  warranty_years?: number;
};

export type OperationsAllocationSubmit = {
  manufacturing?: Money;
  supplier_qc?: Money;
  logistics?: Money;
};

export type HrAllocationSubmit = {
  culture_benefits?: Money;
  training_development?: Money;
  cx_team?: Money;
};

export type FinanceAdminAllocationSubmit = {
  compliance_legal?: Money;
  financial_planning?: Money;
  audit_prep?: Money;
};

export type CrisisAllocationSubmit = {
  crisis_choice?: CrisisChoice | null;
  price_match_fund?: Money;
  comparison_ads?: Money;
  retention_offers?: Money;
  emergency_supply_fund?: Money;
  crisis_choice_d_spend?: Money;
};

export type QuarterAllocationResponse = {
  id: string;
  created_at: string;
  quarter_id: string;
  google_ads: Money;
  meta_ads: Money;
  social_influencer: Money;
  content_seo: Money;
  events_pr: Money;
  email_marketing: Money;
  referral: Money;
  prelaunch_buzz: Money;
  reps: Money;
  crm_tools: Money;
  onboarding: Money;
  quality_qa: Money;
  innovation: Money;
  warranty_years: number;
  manufacturing: Money;
  supplier_qc: Money;
  logistics: Money;
  culture_benefits: Money;
  training_development: Money;
  cx_team: Money;
  compliance_legal: Money;
  financial_planning: Money;
  audit_prep: Money;
  crisis_choice: CrisisChoice | null;
  price_match_fund: Money;
  comparison_ads: Money;
  retention_offers: Money;
  emergency_supply_fund: Money;
  crisis_choice_d_spend: Money;
};

export type CompanyOutcomeSchema = {
  units_sold: MetricSchema;
  revenue_inr: MetricSchema;
  cogs_inr: MetricSchema;
  gross_profit_inr: MetricSchema;
  net_cash_flow_inr: MetricSchema;
  closing_cash_inr: MetricSchema;
  cash_runway_quarters: MetricSchema | null;
  cash_runway_gap_reason: string | null;
  valuation_inr: MetricSchema | null;
  valuation_gap_reason: string | null;
};

/**
 * Vertical-format balance sheet as at the quarter close -- assets first, then equity and
 * liabilities, which is the vertical format the course teaches.
 *
 * Every line is nullable and the sheet carries a `gap_reason`, because the engine does not
 * report a full position for every scenario. That mirrors how `valuation_inr` /
 * `valuation_gap_reason` already behave: render what was reported, say "not reported" for the
 * rest, and never print a zero the engine did not actually produce.
 *
 * Section grouping, row labels and row order are deliberately NOT on the wire -- the
 * statement's layout is presentation, and lives in `QuarterBalanceSheet.tsx`.
 */
export type BalanceSheetSchema = {
  /** Close-of-quarter date, when the engine dates the position. */
  as_at: string | null;

  /* Non-current assets */
  property_plant_equipment_inr: Money | null;
  intangible_assets_inr: Money | null;
  non_current_investments_inr: Money | null;
  other_non_current_assets_inr: Money | null;

  /* Current assets */
  inventories_inr: Money | null;
  current_investments_inr: Money | null;
  trade_receivables_inr: Money | null;
  cash_and_equivalents_inr: Money | null;
  other_current_assets_inr: Money | null;

  total_assets_inr: Money | null;

  /* Equity */
  share_capital_inr: Money | null;
  retained_earnings_inr: Money | null;
  other_equity_inr: Money | null;

  /* Non-current liabilities */
  long_term_borrowings_inr: Money | null;
  long_term_provisions_inr: Money | null;
  deferred_tax_liabilities_inr: Money | null;
  other_non_current_liabilities_inr: Money | null;

  /* Current liabilities */
  short_term_borrowings_inr: Money | null;
  trade_payables_inr: Money | null;
  other_current_liabilities_inr: Money | null;
  short_term_provisions_inr: Money | null;

  total_equity_and_liabilities_inr: Money | null;

  /** Why the position is partial or absent, when it is. */
  gap_reason: string | null;
};

export type ModifierLineSchema = {
  id: string;
  points: Money;
  fired: boolean;
  applied_points: Money;
  detail: string;
};

export type ScoredCriterionSchema = {
  id: string;
  trait: string;
  result: CriterionResult;
  points: Money | null;
  detail: string;
};

export type UnscoredCriterionSchema = {
  id: string;
  trait: string;
  reason: string;
};

export type DecisionQualitySchema = {
  ceo_score: Money;
  band: string;
  mechanical_points_available: Money;
  unscored_points: Money;
  modifiers: ModifierLineSchema[];
  scored_criteria: ScoredCriterionSchema[];
  unscored_criteria: UnscoredCriterionSchema[];
};

export type EvidenceObservationSchema = {
  department: string | null;
  evidence_key: string;
  value: unknown;
  detail: string;
  weight: Money | null;
  weight_status: string;
};

export type RunSummarySchema = {
  score_trajectory: ScoreTrajectoryPoint[];
  final_valuation_inr: Money | null;
  terminal_status: RunStatus;
};

export type QuarterReportResponse = {
  company_id: string;
  quarter_id: string;
  quarter_number: number;
  outcome: CompanyOutcomeSchema;
  binding_constraints: BindingConstraintSchema[];
  decision_quality: DecisionQualitySchema;
  evidence: Record<string, EvidenceObservationSchema[]>;
  /** Optional: quarters locked before the engine reported a position simply omit it. */
  balance_sheet?: BalanceSheetSchema | null;
  run_status: RunStatus;
  survival_triggered_by: string | null;
  survival_detail: string | null;
  run_summary: RunSummarySchema | null;
};

export type EndgameDecisionSubmit = {
  path: EndgamePath;
  term_sheet_name: string;
  reasoning?: string | null;
};

export type EndgameDecisionResponse = {
  id: string;
  company_id: string;
  quarter_id: string;
  path: EndgamePath;
  term_sheet_name: string;
  reasoning: string | null;
};

/** One row in the cross-user simulation leaderboard. Mirrors LeaderboardEntrySchema. */
export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  /** first_name when set, otherwise the local-part of the email. */
  user_name: string | null;
  company_name: string;
  /** Best per-quarter CEO score (same value as composite_score in the current engine). */
  ceo_score: Money;
  /** SimulationScore.final — normalised 0–100, identical to ceo_score today. */
  composite_score: Money;
  band: string;
  /** Company valuation at quarter close (Rs). Null when the engine did not produce one. */
  valuation_inr: Money | null;
  /** Net profit/(loss) for that quarter (Rs). Null when absent. */
  net_profit_inr: Money | null;
  is_current_user: boolean;
};

export type LeaderboardResponse = {
  scenario_id: string;
  total_entries: number;
  /** Top-3 entries by composite_score, ties broken by valuation_inr desc. */
  top_entries: LeaderboardEntry[];
  /** Requesting user's own entry; null if they have no scored run in this scenario. */
  current_user_entry: LeaderboardEntry | null;
};

export type QuarterReportPdfResponse = {
  bucket: string;
  path: string;
  signed_url: string;
  expires_in: number;
};

export type SimulationReportPdfResponse = {
  bucket: string;
  path: string;
  signed_url: string;
  expires_in: number;
};

export type ApiErrorBody = {
  error?: string;
  reason?: string;
  attempted_move?: string;
  allowed_moves?: Move[];
  detail?: string | { msg: string }[];
};

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(
      body.error ??
      (typeof body.detail === "string" ? body.detail : `HTTP ${status}`),
    );
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/* ── Admin Types ────────────────────────────────────────────── */

export type AdminUserSummary = {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
  latest_login?: string;
  run_count?: number;
};

export type AdminUsersResponse = {
  total_count: number;
  users: AdminUserSummary[];
};

export type AdminUserDetail = AdminUserSummary & {
  first_name: string | null;
  institution_name: string | null;
  degree: string | null;
  current_year: string | null;
  goals: string[];
  runs: {
    run_id: string;
    scenario_id: string;
    status: string;
    created_at: string;
    quarters: {
      quarter: number;
      revenue: number | string;
      profit: number | string;
    }[];
  }[];
};

/* ── Demand Preview API Types ────────────────────────────────── */

export type DemandPreviewRequest = {
  company_id: string;
  quarter: number;

  // Marketing spend in lakhs
  google_ads?: number;
  meta_ads?: number;
  social_influencer?: number;
  content_seo?: number;
  events_pr?: number;
  email?: number;
  direct_marketing?: number;
  referral?: number;

  // Optional boosts for "what if" scenarios
  brand_boost?: number;
  innovation_boost?: number;
  quality_boost?: number;
};

export type DemandPreviewResponse = {
  addressable_demand_units: number;
  total_market_demand: number;
  our_market_share_potential: string;
  competitive_position_score: string;
  product_pull_score: string;
  rival_total_strength: string;
  marketing_voice_index: string;
  guidance_message: string;
};

export type DetailedDemandResponse = {
  addressable_demand_units: number;
  total_market_demand: number;
  attractive_share_pct: string;

  // Lead breakdown
  google_leads: number;
  meta_leads: number;
  social_leads: number;
  content_leads: number;
  events_leads: number;
  email_leads: number;
  direct_leads: number;
  total_raw_leads: number;
  effective_leads: number;

  // Product metrics
  product_pull_score: string;
  conversion_ceiling_pct: string;
  expected_conversion_pct: string;

  // Competitive position
  our_strength: string;
  rival_strength: string;
};
