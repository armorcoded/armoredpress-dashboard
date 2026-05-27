export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';

export const GET = withAuth(async () => {
  const username        = process.env.AUTOTASK_API_USERNAME;
  const integrationCode = process.env.AUTOTASK_API_INTEGRATION_CODE;
  const secret          = process.env.AUTOTASK_API_SECRET;

  if (!username || !integrationCode || !secret) {
    return NextResponse.json({ ok: false, error: 'Autotask credentials not set' }, { status: 503 });
  }

  const zoneRes  = await fetch(
    `https://webservices.autotask.net/atservicesrest/v1.0/zoneInformation?user=${encodeURIComponent(username)}`
  );
  const zoneData = await zoneRes.json() as { url?: string };

  // Zone returns ATServicesRest/ without version — append v1.0
  const rawUrl  = zoneData.url ?? '';
  const baseUrl = rawUrl.replace(/\/+$/, '') + '/v1.0';

  const headers = {
    'ApiIntegrationCode': integrationCode,
    'UserName':           username,
    'Secret':             secret,
    'Content-Type':       'application/json',
  };

  const fieldsUrl = `${baseUrl}/Tickets/entityInformation/fields`;
  const fieldsRes = await fetch(fieldsUrl, { headers });
  const fieldsData = await fieldsRes.json().catch(() => null);

  if (!fieldsRes.ok) {
    return NextResponse.json({
      ok:    false,
      error: `Fields endpoint returned ${fieldsRes.status}`,
      debug: { baseUrl, fieldsUrl, fieldsData },
    }, { status: 502 });
  }

  // Extract just the picklist fields to make it easy to find IDs
  const fields = (fieldsData?.fields ?? []) as Array<{
    name: string;
    isPickList: boolean;
    picklistValues: Array<{ value: string; label: string; isActive: boolean }>;
  }>;

  const picklists = fields
    .filter((f) => f.isPickList && f.picklistValues?.length)
    .reduce((acc: Record<string, unknown>, f) => {
      acc[f.name] = f.picklistValues
        .filter(v => v.isActive)
        .map(v => ({ id: v.value, label: v.label }));
      return acc;
    }, {});

  return NextResponse.json({
    ok:   true,
    data: {
      base_url:  baseUrl,
      picklists,           // issueType, subIssueType, source, priority, status etc.
    },
  });
}, ['internal_admin']);
