import { NextResponse } from "next/server";
import { getSession, logActivity } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  const userId = session.user?.id;
  session.destroy();
  if (userId) await logActivity(userId, "logout");
  return NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:2729"));
}
