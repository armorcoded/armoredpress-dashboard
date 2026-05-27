/**
 * Autotask configuration — numeric IDs for your instance.
 *
 * SETUP REQUIRED:
 * The numeric IDs for issueType, subIssueType, queueId, and companyId
 * are specific to your Autotask instance. Run the helper endpoint to
 * discover them:
 *
 *   GET /api/support/autotask-fields   (internal_admin only)
 *
 * Then update the values below.
 *
 * All values can also be overridden via environment variables so you
 * don't need to rebuild to change them.
 */

export const AUTOTASK_CONFIG = {
  // The queue where support tickets should land.
  // Find in Autotask: Admin > Service Desk > Queues
  queueId: parseInt(process.env.AUTOTASK_QUEUE_ID ?? '0', 10),

  // Your Autotask company ID (the MSP itself, not clients).
  // Find in Autotask: CRM > Accounts > your company > URL has the ID
  defaultCompanyId: parseInt(process.env.AUTOTASK_COMPANY_ID ?? '0', 10),

  // Issue type numeric ID for "Hosting"
  // Discover via GET /api/support/autotask-fields
  issueTypeId: parseInt(process.env.AUTOTASK_ISSUE_TYPE_ID ?? '0', 10),

  // Source picklist ID — add "ArmoredPress Portal" in
  // Autotask: Admin > Service Desk > Sources, then find its ID
  sourceId: parseInt(process.env.AUTOTASK_SOURCE_ID ?? '0', 10),
};

// Sub-issue type IDs — must match your Autotask instance exactly.
// Discover via GET /api/support/autotask-fields then look for subIssueType picklist.
export const SUB_ISSUE_IDS: Record<string, number> = {
  wordpress:   parseInt(process.env.AUTOTASK_SUB_WORDPRESS   ?? '0', 10),
  dns:         parseInt(process.env.AUTOTASK_SUB_DNS         ?? '0', 10),
  ssl:         parseInt(process.env.AUTOTASK_SUB_SSL         ?? '0', 10),
  performance: parseInt(process.env.AUTOTASK_SUB_PERFORMANCE ?? '0', 10),
  billing:     parseInt(process.env.AUTOTASK_SUB_BILLING     ?? '0', 10),
  other:       parseInt(process.env.AUTOTASK_SUB_OTHER       ?? '0', 10),
};

// Human-readable sub-issue labels — shown in the form dropdown.
export const SUB_ISSUES = [
  { value: 'wordpress',   label: 'WordPress'    },
  { value: 'dns',         label: 'DNS / Domain' },
  { value: 'ssl',         label: 'SSL / HTTPS'  },
  { value: 'performance', label: 'Performance'  },
  { value: 'billing',     label: 'Billing'      },
  { value: 'other',       label: 'Other'        },
] as const;

export type SubIssueKey = typeof SUB_ISSUES[number]['value'];

// Priority mapping
export const PRIORITY_MAP = {
  low:      3,
  medium:   2,
  high:     1,
  critical: 4,
} as const;

export type PriorityKey = keyof typeof PRIORITY_MAP;
