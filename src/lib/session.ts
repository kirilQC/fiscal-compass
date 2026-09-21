import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { OWNER_EMAIL } from "./owner";

export interface Session {
  supabase: SupabaseClient;
  userId: string;
}

let ownerIdCache: string | null = null;

// Auth is optional while the app is being built: a signed-in session is used when present,
// otherwise every request runs as the owner through the service-role client.
export async function getSession(): Promise<Session | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) return { supabase, userId: data.user.id };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createAdminClient();
  return { supabase: admin, userId: await ownerId(admin) };
}

async function ownerId(admin: SupabaseClient): Promise<string> {
  if (ownerIdCache) return ownerIdCache;
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const found = data?.users.find((u) => u.email?.toLowerCase() === OWNER_EMAIL);
  if (found) return (ownerIdCache = found.id);
  const { data: created, error } = await admin.auth.admin.createUser({ email: OWNER_EMAIL, email_confirm: true });
  if (error || !created.user) throw new Error(`Could not create owner user: ${error?.message ?? "unknown"}`);
  return (ownerIdCache = created.user.id);
}
