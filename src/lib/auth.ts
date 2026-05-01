import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Role } from "./constants";

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
};

export type SessionData = {
  user?: SessionUser;
};

const SESSION_PASSWORD =
  process.env.SESSION_SECRET ??
  "fallback_dev_secret_only_for_dev_change_me_to_something_long";

export const sessionOptions: SessionOptions = {
  password: SESSION_PASSWORD,
  cookieName: "gstdesk_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session.user ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function logActivity(
  userId: string,
  action: string,
  entity?: string,
  entityId?: string,
  meta?: unknown
) {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        meta: meta ? JSON.stringify(meta) : undefined,
      },
    });
  } catch {
    // never crash the request because of audit logging
  }
}
