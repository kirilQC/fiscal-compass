import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const allowed = process.env.ALLOWED_EMAIL?.toLowerCase();
    if (!error && data.user && (!allowed || data.user.email?.toLowerCase() === allowed)) {
      return NextResponse.redirect(`${origin}/`);
    }
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(`${origin}/login?error=denied`);
}
