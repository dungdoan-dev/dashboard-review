import { serviceDb } from "@/lib/bluejay";
import { bluejayViewer } from "@/lib/bluejay-auth";
import { createClient } from "@/lib/supabase/server";
import { roleChangeError } from "@/lib/user-roles";

const fail = (message: string, status: number) => Response.json({ message }, { status });

// Cài đặt → Phân quyền: the accounts and their role (app_metadata.role). Admin only (src/proxy.ts and bluejayViewer); the roles are set with the service role.
export async function GET() {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  try {
    const [{ data: me }, { data, error }] = await Promise.all([(await createClient()).auth.getUser(), serviceDb().auth.admin.listUsers({ perPage: 200 })]);
    if (error) throw new Error(error.message);
    const users = data.users
      .map((u) => ({ id: u.id, email: u.email ?? "", role: (u.app_metadata?.role as string | undefined) ?? null, lastSignIn: u.last_sign_in_at ?? null }))
      .sort((a, b) => a.email.localeCompare(b.email));
    return Response.json({ me: me.user?.id ?? null, users });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 502);
  }
}

// { id, role }: role "" removes the access. A new role is read by the app after the account's token refreshes (within an hour) or at the next sign-in.
export async function PUT(request: Request) {
  const denied = await bluejayViewer();
  if (denied) return fail(denied.message, denied.status);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("Yêu cầu không hợp lệ.", 415);
  const input = (await request.json().catch(() => null)) as { id?: unknown; role?: unknown } | null;
  const { data: me } = await (await createClient()).auth.getUser();
  const problem = roleChangeError(me.user?.id ?? "", String(input?.id ?? ""), input?.role);
  if (problem) return fail(problem, 400);
  try {
    const { error } = await serviceDb().auth.admin.updateUserById(String(input!.id), { app_metadata: { role: input!.role === "" ? null : input!.role } }); // null removes the key
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 502);
  }
}
