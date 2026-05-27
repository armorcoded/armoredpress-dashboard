export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/pool';
import { withAuth } from '@/lib/auth/middleware';
import { createTicket, findCompanyByName, findContactByEmail, AutotaskError } from '@/lib/autotask/client';
import {
  AUTOTASK_CONFIG,
  SUB_ISSUE_IDS,
  PRIORITY_MAP,
  type SubIssueKey,
  type PriorityKey,
} from '@/lib/autotask/config';
import type { AuthedRequest } from '@/lib/auth/middleware';

const CreateTicketSchema = z.object({
  subject:     z.string().min(5).max(200),
  description: z.string().min(10).max(4000),
  sub_issue:   z.enum(['wordpress', 'dns', 'ssl', 'performance', 'billing', 'other']),
  priority:    z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  site_id:     z.string().uuid().optional(),
});

export const POST = withAuth(async (req: AuthedRequest) => {
  let body: z.infer<typeof CreateTicketSchema>;
  try {
    body = CreateTicketSchema.parse(await req.json());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json({ ok: false, error: msg, code: 'VALIDATION' }, { status: 400 });
  }

  // ── Resolve site domain for ticket context ────────────────────────────────
  let siteDomain: string | null = null;
  if (body.site_id) {
    const { rows } = await query(
      'SELECT domain FROM sites WHERE id = $1 LIMIT 1',
      [body.site_id],
    );
    siteDomain = rows[0]?.domain ?? null;
  }

  // ── Build ticket description ──────────────────────────────────────────────
  const contextBlock = [
    siteDomain ? `Site: ${siteDomain}\n` : null,
    body.description,
  ].filter(Boolean).join('\n');

  // ── Verify config is set ──────────────────────────────────────────────────
  if (!AUTOTASK_CONFIG.queueId || !AUTOTASK_CONFIG.issueTypeId) {
    console.error('[Autotask] Configuration incomplete — check AUTOTASK_* env vars');
    return NextResponse.json(
      { ok: false, error: 'Support ticketing is not yet configured. Please contact us directly.', code: 'NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const subIssueId = SUB_ISSUE_IDS[body.sub_issue as SubIssueKey];
  if (!subIssueId) {
    console.error(`[Autotask] Sub-issue ID not configured for: ${body.sub_issue}`);
    return NextResponse.json(
      { ok: false, error: 'Support ticketing is not yet configured.', code: 'NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  // ── Look up Autotask company and contact ──────────────────────────────────
  // Run both lookups in parallel. Failures are non-fatal — ticket still
  // creates with the default company if either lookup misses.
  let resolvedCompanyId = AUTOTASK_CONFIG.defaultCompanyId;
  let resolvedContactId: number | undefined;

  if (req.session.org_id) {
    // Get org name from the dashboard database
    const { rows: orgRows } = await query(
      'SELECT name FROM orgs WHERE id = $1 LIMIT 1',
      [req.session.org_id],
    );
    const orgName = orgRows[0]?.name ?? null;

    const [atCompany, atContact] = await Promise.allSettled([
      orgName ? findCompanyByName(orgName) : Promise.resolve(null),
      findContactByEmail(req.session.email),
    ]);

    if (atCompany.status === 'fulfilled' && atCompany.value) {
      resolvedCompanyId = atCompany.value.id;
      console.log(`[Autotask] Matched company: ${atCompany.value.companyName} (${atCompany.value.id})`);
    } else {
      console.warn(`[Autotask] Company not found for org: ${orgName} — using default`);
    }

    if (atContact.status === 'fulfilled' && atContact.value) {
      resolvedContactId = atContact.value.id;
      console.log(`[Autotask] Matched contact: ${atContact.value.emailAddress} (${atContact.value.id})`);
    } else {
      console.warn(`[Autotask] Contact not found for email: ${req.session.email}`);
    }
  }

  // ── Create ticket ─────────────────────────────────────────────────────────
  try {
    const ticket = await createTicket({
      title:          body.subject,
      description:    contextBlock,
      companyId:      resolvedCompanyId,
      queueId:        AUTOTASK_CONFIG.queueId,
      issueTypeId:    AUTOTASK_CONFIG.issueTypeId,
      subIssueTypeId: subIssueId,
      priority:       PRIORITY_MAP[body.priority as PriorityKey],
      contactId:      resolvedContactId,
      source:         AUTOTASK_CONFIG.sourceId || undefined,
    });

    // ── Audit log ───────────────────────────────────────────────────────────
    await query(
      `INSERT INTO audit_log (user_id, org_id, site_id, action, meta)
       VALUES ($1, $2, $3, 'support_ticket_created', $4)`,
      [
        req.session.sub,
        req.session.org_id,
        body.site_id ?? null,
        JSON.stringify({
          autotask_ticket_id:     ticket.id,
          autotask_ticket_number: ticket.ticketNumber,
          autotask_company_id:    resolvedCompanyId,
          autotask_contact_id:    resolvedContactId ?? null,
          subject:                body.subject,
          sub_issue:              body.sub_issue,
          priority:               body.priority,
          site_domain:            siteDomain,
        }),
      ],
    );

    return NextResponse.json({
      ok:   true,
      data: {
        ticket_id:     ticket.id,
        ticket_number: ticket.ticketNumber,
      },
    }, { status: 201 });

  } catch (err) {
    if (err instanceof AutotaskError) {
      console.error('[Autotask] Ticket creation failed:', err.message, err.body);
      return NextResponse.json(
        { ok: false, error: 'Failed to create support ticket. Please try again or contact us directly.', code: 'AUTOTASK_ERROR' },
        { status: 502 },
      );
    }
    throw err;
  }
}, ['internal_admin', 'org_admin', 'org_user']);
