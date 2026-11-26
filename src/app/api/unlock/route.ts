import { NextResponse } from "next/server";
import {
  makeSessionCookie,
  readJsonBody,
  withApi,
  SESSION_COOKIE,
  isAccessProtected,
  validSessionCookie,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/unlock — exchanges the access token for an HttpOnly session
 * cookie (the token itself never reaches the browser; only its hash does).
 */
export const POST = withApi(
  async (request) => {
    const body = await readJsonBody(request);
    const token = typeof body.token === "string" ? body.token : "";
    const expected = process.env.STOCKWELL_ACCESS_TOKEN ?? "";
    if (!expected || token !== expected) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "invalid_token", message: "Incorrect access token." },
        },
        { status: 401 },
      );
    }
    const cookie = makeSessionCookie();
    if (!cookie) {
      return NextResponse.json(
        { success: false, error: { code: "not_protected", message: "This instance is not access-protected." } },
        { status: 400 },
      );
    }
    const response = NextResponse.json({ success: true, data: { unlocked: true } });
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  },
  { allowWhenLocked: true },
);

/** GET /api/unlock — lock state for the client. */
export const GET = withApi(
  async (request) => {
    const cookies = request.headers.get("cookie") ?? "";
    const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([a-f0-9]+)`));
    return NextResponse.json({
      success: true,
      data: {
        protected: isAccessProtected(),
        unlocked: match ? validSessionCookie(match[1]) : false,
      },
    });
  },
  { allowWhenLocked: true },
);
