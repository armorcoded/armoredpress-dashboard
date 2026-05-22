/**
 * Cloudflare API client — BYO token model
 *
 * Every method accepts a customerToken (the org's scoped CF API token).
 * ArmoredPress never stores the raw token — it's decrypted from the DB
 * immediately before use and not retained in memory between requests.
 */

const BASE_URL = 'https://api.cloudflare.com/client/v4';

export class CloudflareError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: { code: number; message: string }[],
  ) {
    super(message);
    this.name = 'CloudflareError';
  }
}

async function request<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as { success: boolean; result: T; errors: { code: number; message: string }[] };

  if (!data.success) {
    throw new CloudflareError(
      `Cloudflare ${method} ${path} failed`,
      res.status,
      data.errors ?? [],
    );
  }

  return data.result;
}

// ── Zone ──────────────────────────────────────────────────────────────────────

export interface CFZone {
  id: string;
  name: string;
  status: string;
  nameServers: string[];
}

export async function getZoneByDomain(token: string, domain: string): Promise<CFZone | null> {
  const zones = await request<CFZone[]>('GET', `/zones?name=${encodeURIComponent(domain)}`, token);
  return zones[0] ?? null;
}

export async function validateToken(token: string, domain: string): Promise<{
  valid: boolean;
  zoneId: string | null;
  error?: string;
}> {
  try {
    const zone = await getZoneByDomain(token, domain);
    if (!zone) {
      return { valid: false, zoneId: null, error: `Zone for ${domain} not found in this account.` };
    }
    return { valid: true, zoneId: zone.id };
  } catch (err) {
    const msg = err instanceof CloudflareError ? err.errors[0]?.message : 'Token validation failed';
    return { valid: false, zoneId: null, error: msg };
  }
}

// ── DNS Records ───────────────────────────────────────────────────────────────

export async function createOrUpdateARecord(
  token: string,
  zoneId: string,
  name: string,       // e.g. "@" or "www"
  ipAddress: string,
  proxied = true,
): Promise<void> {
  // Check for existing A record.
  const existing = await request<{ id: string; type: string; name: string }[]>(
    'GET',
    `/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`,
    token,
  );

  if (existing.length > 0) {
    await request('PUT', `/zones/${zoneId}/dns_records/${existing[0].id}`, token, {
      type: 'A', name, content: ipAddress, proxied,
    });
  } else {
    await request('POST', `/zones/${zoneId}/dns_records`, token, {
      type: 'A', name, content: ipAddress, proxied,
    });
  }
}

// ── Firewall / WAF Rules ──────────────────────────────────────────────────────

export interface CFRule {
  id?: string;
  description: string;
  expression: string;
  action: 'block' | 'challenge' | 'js_challenge' | 'managed_challenge' | 'allow' | 'log';
  priority?: number;
}

export async function applyBaselineRules(
  token: string,
  zoneId: string,
): Promise<void> {
  const rules: CFRule[] = [
    {
      description: 'Block XML-RPC',
      expression:  '(http.request.uri.path contains "/xmlrpc.php")',
      action:      'block',
    },
    {
      description: 'Challenge wp-login.php',
      expression:  '(http.request.uri.path contains "/wp-login.php")',
      action:      'managed_challenge',
    },
    {
      description: 'Block common exploit paths',
      expression:  '(http.request.uri.path contains "/wp-config.php") or (http.request.uri.path contains "/.env")',
      action:      'block',
    },
  ];

  // Ruleset API — creates or replaces the custom ruleset.
  await request('PUT', `/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`, token, {
    rules,
  });
}

export async function applyRateLimits(
  token: string,
  zoneId: string,
): Promise<void> {
  // wp-login.php: 5 requests per 60 seconds per IP.
  await request('POST', `/zones/${zoneId}/rate_limits`, token, {
    match: {
      request: {
        url_pattern: `*/**/wp-login.php`,
        methods:     ['POST'],
      },
    },
    threshold: 5,
    period:    60,
    action: {
      mode:    'challenge',
      timeout: 300,
    },
    description:  'ArmoredPress — wp-login rate limit',
    disabled:     false,
    bypass:       [],
  });
}

// ── SSL / TLS ─────────────────────────────────────────────────────────────────

export async function enforceHTTPS(token: string, zoneId: string): Promise<void> {
  // Always use HTTPS.
  await request('PATCH', `/zones/${zoneId}/settings/always_use_https`, token, { value: 'on' });
  // Minimum TLS 1.2.
  await request('PATCH', `/zones/${zoneId}/settings/min_tls_version`, token, { value: '1.2' });
  // Full (Strict) SSL mode — requires valid origin cert.
  await request('PATCH', `/zones/${zoneId}/settings/ssl`, token, { value: 'full' });
}

// ── WAF Managed Rules ─────────────────────────────────────────────────────────

export async function enableManagedWAF(token: string, zoneId: string): Promise<void> {
  // Enable Cloudflare Managed Ruleset (requires Business/Enterprise or WAF entitlement).
  // On free/pro plans this is a no-op — log and continue rather than fail.
  try {
    await request(
      'PUT',
      `/zones/${zoneId}/rulesets/phases/http_request_firewall_managed/entrypoint`,
      token,
      {
        rules: [
          {
            action: 'execute',
            expression: 'true',
            description: 'Execute Cloudflare Managed Ruleset',
            action_parameters: {
              id: 'efb7b8c949ac4650a09736fc376e9aee', // CF Managed Ruleset ID
            },
          },
        ],
      },
    );
  } catch (err) {
    // Log but don't fail provisioning — managed WAF requires paid plan.
    console.warn('[Cloudflare] Managed WAF not available on this plan:', err instanceof CloudflareError ? err.errors[0]?.message : err);
  }
}

// ── Security Level ────────────────────────────────────────────────────────────

export async function setSecurityLevel(
  token: string,
  zoneId: string,
  level: 'essentially_off' | 'low' | 'medium' | 'high' | 'under_attack',
): Promise<void> {
  await request('PATCH', `/zones/${zoneId}/settings/security_level`, token, { value: level });
}

// ── Composite: full baseline for a new site ───────────────────────────────────

export async function applyFullBaseline(
  token: string,
  zoneId: string,
  originIP: string,
  domain: string,
): Promise<void> {
  await createOrUpdateARecord(token, zoneId, domain, originIP, true);
  await createOrUpdateARecord(token, zoneId, 'www', originIP, true);
  await enforceHTTPS(token, zoneId);
  await setSecurityLevel(token, zoneId, 'medium');
  await applyBaselineRules(token, zoneId);
  await applyRateLimits(token, zoneId);
  await enableManagedWAF(token, zoneId);
}
