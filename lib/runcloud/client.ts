/**
 * RunCloud API client — v3
 * Docs: https://runcloud.io/docs/api/v3
 *
 * Authentication: Bearer token (single API token from Workspace → Settings → API Management).
 * All methods throw RunCloudError on non-2xx responses.
 */

const BASE_URL = 'https://manage.runcloud.io/api/v3';

export class RunCloudError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = 'RunCloudError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = process.env.RUNCLOUD_API_TOKEN;

  if (!token) {
    throw new Error('RUNCLOUD_API_TOKEN must be set');
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new RunCloudError(
      `RunCloud ${method} ${path} → ${res.status}`,
      res.status,
      data,
    );
  }

  return data as T;
}

// ── Servers ──────────────────────────────────────────────────────────────────

export interface RCServer {
  id: number;
  name: string;
  ipAddress: string;
  os: string;
  connected: boolean;
}

export async function listServers(): Promise<RCServer[]> {
  const data = await request<{ data: RCServer[] }>('GET', '/servers');
  return data.data;
}

export async function getServer(serverId: number): Promise<RCServer> {
  return request<RCServer>('GET', `/servers/${serverId}`);
}

// ── Web Applications ──────────────────────────────────────────────────────────

export interface RCWebApp {
  id: number;
  name: string;
  domainName: string;
  user: string;
  phpVersion: string;
  publicPath: string;
}

export interface CreateWebAppParams {
  name: string;          // alphanumeric, no spaces
  domainName: string;
  user: string;          // linux system user
  userPassword: string;
  phpVersion: string;    // e.g. "8.2"
  stack: 'nginx';
  stackMode: 'production';
  clickjackingProtection: boolean;
  xssProtection: boolean;
  mimeSniffingProtection: boolean;
}

export async function createWebApp(
  serverId: number,
  params: CreateWebAppParams,
): Promise<RCWebApp> {
  return request<RCWebApp>('POST', `/servers/${serverId}/webapps`, params);
}

export async function deleteWebApp(serverId: number, appId: number): Promise<void> {
  await request('DELETE', `/servers/${serverId}/webapps/${appId}`);
}

// ── System Users ──────────────────────────────────────────────────────────────

export interface RCSystemUser {
  id: number;
  username: string;
}

export async function createSystemUser(
  serverId: number,
  username: string,
  password: string,
): Promise<RCSystemUser> {
  return request<RCSystemUser>('POST', `/servers/${serverId}/users`, {
    username,
    password,
    superUser: false,
  });
}

// ── Databases ─────────────────────────────────────────────────────────────────

export interface RCDatabase {
  id: number;
  name: string;
  collation: string;
}

export async function createDatabase(
  serverId: number,
  name: string,
  collation = 'utf8mb4_unicode_ci',
): Promise<RCDatabase> {
  return request<RCDatabase>('POST', `/servers/${serverId}/databases`, {
    name,
    collation,
  });
}

export async function createDatabaseUser(
  serverId: number,
  username: string,
  password: string,
): Promise<{ id: number; username: string }> {
  return request('POST', `/servers/${serverId}/databaseusers`, {
    username,
    password,
  });
}

export async function attachDatabaseUser(
  serverId: number,
  databaseId: number,
  databaseUserId: number,
  privilege: 'FULL',
): Promise<void> {
  await request(
    'POST',
    `/servers/${serverId}/databases/${databaseId}/attach`,
    { databaseUserId, privilege },
  );
}

// ── Deploy Scripts (post-provision hardening hooks) ───────────────────────────

export interface RCDeployScript {
  id: number;
  label: string;
}

export async function createDeployScript(
  serverId: number,
  appId: number,
  label: string,
  script: string,
): Promise<RCDeployScript> {
  return request<RCDeployScript>(
    'POST',
    `/servers/${serverId}/webapps/${appId}/deploymentscripts`,
    { label, script, autoDeploy: false },
  );
}

export async function runDeployScript(
  serverId: number,
  appId: number,
  scriptId: number,
): Promise<void> {
  await request(
    'POST',
    `/servers/${serverId}/webapps/${appId}/deploymentscripts/${scriptId}/deploy`,
  );
}

// ── SSL ───────────────────────────────────────────────────────────────────────

export async function installSSL(
  serverId: number,
  appId: number,
  provider: 'letsencrypt' | 'custom' = 'letsencrypt',
): Promise<void> {
  await request('POST', `/servers/${serverId}/webapps/${appId}/ssl`, {
    provider,
    enableHttp: false,
    enableHsts: true,
  });
}

export async function getSSLStatus(
  serverId: number,
  appId: number,
): Promise<{ active: boolean; expiresAt: string | null }> {
  return request('GET', `/servers/${serverId}/webapps/${appId}/ssl`);
}

// ── Nginx custom config block ──────────────────────────────────────────────────

/**
 * Set a custom Nginx config block for a web app.
 * RunCloud stores this in its own database and re-applies it on config
 * regeneration — so it survives PHP version changes, setting toggles, etc.
 */
export async function setNginxCustomConfig(
  serverId: number,
  appId: number,
  config: string,
): Promise<void> {
  await request('POST', `/servers/${serverId}/webapps/${appId}/nginxconfiguration`, { config });
}
