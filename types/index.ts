// ── Domain types — match the database schema exactly ───────────────────────

export type Role = 'internal_admin' | 'org_admin' | 'org_user';
export type PlanTier = 'core' | 'secure' | 'compliance';
export type SiteStatus = 'pending' | 'provisioning' | 'active' | 'failed' | 'suspended';
export type JobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'rolled_back';

export interface Org {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  org_id: string | null;
  email: string;
  password_hash: string;
  role: Role;
  totp_secret: string | null;
  totp_enabled: boolean;
  totp_verified: boolean;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Site {
  id: string;
  org_id: string;
  domain: string;
  plan_tier: PlanTier;
  status: SiteStatus;
  runcloud_app_id: string | null;
  runcloud_server_id: string | null;
  cloudflare_zone_id: string | null;
  origin_ip: string | null;
  is_migration: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProvisioningJob {
  id: string;
  site_id: string;
  triggered_by: string | null;
  status: JobStatus;
  current_step: string | null;
  steps_log: StepLogEntry[];
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export interface StepLogEntry {
  step: string;
  status: 'started' | 'complete' | 'failed';
  ts: string;
  detail?: string;
}

// ── JWT session payload ─────────────────────────────────────────────────────

export interface SessionPayload {
  sub: string;          // user.id
  email: string;
  role: Role;
  org_id: string | null;
  iat: number;
  exp: number;
}

// ── API response helpers ────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
