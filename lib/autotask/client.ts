/**
 * Autotask REST API v1 client
 *
 * Authentication: API Integration Code + Username + Secret
 * Zone discovery: first call ZoneInformation to get the correct base URL.
 *
 * Env vars required:
 *   AUTOTASK_API_INTEGRATION_CODE  — from Admin > API > Integrations
 *   AUTOTASK_API_USERNAME          — API user email
 *   AUTOTASK_API_SECRET            — API user password/secret
 */

const ZONE_URL = 'https://webservices.autotask.net/atservicesrest/v1.0/zoneInformation';

export class AutotaskError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = 'AutotaskError';
  }
}

// ── Lazy base URL via zone discovery ─────────────────────────────────────────

let _baseUrl: string | null = null;

async function getBaseUrl(): Promise<string> {
  if (_baseUrl) return _baseUrl;

  const username = process.env.AUTOTASK_API_USERNAME;
  if (!username) throw new Error('AUTOTASK_API_USERNAME must be set');

  const res  = await fetch(`${ZONE_URL}?user=${encodeURIComponent(username)}`);
  const data = await res.json() as { url?: string; webUrl?: string; zoneUrl?: string };

  const rawUrl = data.url ?? data.webUrl ?? data.zoneUrl;
  if (!rawUrl) throw new AutotaskError('Zone discovery failed — no URL returned', res.status, data);

  // rawUrl is e.g. "https://webservices22.autotask.net/ATServicesRest/"
  // We need to append v1.0 — the zone URL does NOT include the version.
  const base = rawUrl.replace(/\/+$/, '');
  _baseUrl = base.includes('v1.0') ? base : `${base}/v1.0`;

  console.log('[Autotask] Base URL:', _baseUrl);
  return _baseUrl;
}

// ── Core request helper ───────────────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const integrationCode = process.env.AUTOTASK_API_INTEGRATION_CODE;
  const username        = process.env.AUTOTASK_API_USERNAME;
  const secret          = process.env.AUTOTASK_API_SECRET;

  if (!integrationCode || !username || !secret) {
    throw new Error('AUTOTASK_API_INTEGRATION_CODE, AUTOTASK_API_USERNAME and AUTOTASK_API_SECRET must be set');
  }

  const base = await getBaseUrl();
  const url  = `${base}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      'ApiIntegrationCode': integrationCode,
      'UserName':           username,
      'Secret':             secret,
      'Content-Type':       'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new AutotaskError(
      `Autotask ${method} ${path} → ${res.status}`,
      res.status,
      data,
    );
  }

  return data as T;
}

// ── Ticket creation ───────────────────────────────────────────────────────────

export interface CreateTicketParams {
  title:        string;
  description:  string;
  companyId:    number;
  queueId:      number;
  issueTypeId:  number;   // numeric ID for "Hosting"
  subIssueTypeId: number; // numeric ID for sub-issue
  priority:     number;   // 1=Critical 2=High 3=Medium 4=Low
  contactId?:   number;
  source?:      number;   // picklist ID for "ArmoredPress Portal"
}

export interface AutotaskTicket {
  id:             number;
  ticketNumber:   string;
  title:          string;
  status:         number;
  companyID:      number;
}

export async function createTicket(params: CreateTicketParams): Promise<AutotaskTicket> {
  const result = await request<{ itemId: number; item?: AutotaskTicket }>(
    'POST',
    '/Tickets',
    {
      title:          params.title,
      description:    params.description,
      companyID:      params.companyId,
      queueID:        params.queueId,
      issueType:      params.issueTypeId,
      subIssueType:   params.subIssueTypeId,
      priority:       params.priority,
      status:         1,   // New
      ...(params.contactId && { contactID: params.contactId }),
      ...(params.source    && { source:    params.source }),
    },
  );

  return result.item ?? { id: result.itemId } as AutotaskTicket;
}

// ── Company lookup by name ────────────────────────────────────────────────────

export interface AutotaskCompany {
  id:           number;
  companyName:  string;
}

export async function findCompanyByName(name: string): Promise<AutotaskCompany | null> {
  const result = await request<{ items: AutotaskCompany[] }>(
    'POST',
    '/Companies/query',
    {
      filter: [
        { field: 'companyName', op: 'eq', value: name },
        { field: 'isActive',    op: 'eq', value: true  },
      ],
    },
  );
  return result.items?.[0] ?? null;
}

// ── Contact lookup by email ───────────────────────────────────────────────────

export interface AutotaskContact {
  id:         number;
  firstName:  string;
  lastName:   string;
  emailAddress: string;
  companyID:  number;
}

export async function findContactByEmail(email: string): Promise<AutotaskContact | null> {
  const result = await request<{ items: AutotaskContact[] }>(
    'POST',
    '/Contacts/query',
    {
      filter: [
        { field: 'emailAddress', op: 'eq', value: email },
        { field: 'isActive',     op: 'eq', value: true  },
      ],
    },
  );
  return result.items?.[0] ?? null;
}

// ── Picklist helpers ──────────────────────────────────────────────────────────
// Call these once to discover the numeric IDs for your Autotask instance.
// The IDs differ between instances — run GET /Tickets/entityInformation/fields
// and look for issueType and subIssueType picklist values.

export async function getTicketFieldInfo(): Promise<unknown> {
  return request('GET', '/Tickets/entityInformation/fields');
}
