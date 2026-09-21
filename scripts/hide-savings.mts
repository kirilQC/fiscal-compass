import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await admin.from("accounts").update({ is_active: false }).eq("kind", "savings").ilike("name", "%Premier Savings%").select("id,name");
console.log(error ?? data);
