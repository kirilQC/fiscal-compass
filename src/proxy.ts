import { NextResponse, type NextRequest } from "next/server";

// Sign-in is optional for now; requests run as the owner (see src/lib/session.ts).
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = { matcher: [] };
