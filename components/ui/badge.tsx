import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

// ── Badge ─────────────────────────────────────────────────────────────────────

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        blue:    'bg-brand-50  text-brand-700',
        green:   'bg-green-50  text-green-700',
        amber:   'bg-yellow-50 text-yellow-700',
        red:     'bg-red-50    text-red-700',
        gray:    'bg-slate-100 text-slate-600',
        purple:  'bg-purple-50 text-purple-700',
      },
    },
    defaultVariants: { variant: 'gray' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ── Tier badge helper ─────────────────────────────────────────────────────────

const TIER_VARIANT = {
  core:       'blue',
  secure:     'green',
  compliance: 'purple',
} as const;

export function TierBadge({ tier }: { tier: 'core' | 'secure' | 'compliance' }) {
  return (
    <Badge variant={TIER_VARIANT[tier]}>
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </Badge>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_VARIANT = {
  active:       'green',
  pending:      'gray',
  provisioning: 'blue',
  failed:       'red',
  suspended:    'amber',
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_VARIANT }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'gray'}>
      {status}
    </Badge>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────────

const alertVariants = cva(
  'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
  {
    variants: {
      variant: {
        info:    'bg-brand-50  border-brand-200  text-brand-800',
        success: 'bg-green-50  border-green-200  text-green-800',
        warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        error:   'bg-red-50    border-red-200    text-red-800',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
}

export function Alert({ className, variant, icon, children, ...props }: AlertProps) {
  return (
    <div className={cn(alertVariants({ variant }), className)} {...props}>
      {icon && <span className="mt-0.5 flex-shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg
      className={cn('animate-spin text-brand-500', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ap-card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between px-5 py-4 border-b border-slate-100', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-sm font-medium text-slate-800', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}
