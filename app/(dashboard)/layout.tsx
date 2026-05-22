import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth/session';
import { DashboardShell } from '@/components/layout/shell';

export const dynamic = 'force-dynamic';
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('ap_access_token')?.value;

  if (!token) redirect('/login');

  const session = await verifySessionToken(token);
  if (!session) redirect('/login');

  const initials = session.email.slice(0, 2).toUpperCase();

  return (
    <DashboardShell
      user={{
        email:    session.email,
        role:     session.role,
        initials,
      }}
    >
      {children}
    </DashboardShell>
  );
}
