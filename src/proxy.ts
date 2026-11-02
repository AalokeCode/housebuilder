import { NextResponse, type NextRequest } from "next/server";

/**
 * Authoring routes (/preview) are private in production.
 * Set PREVIEW_TOKEN; open /preview/<slug>?token=… once — a cookie keeps the session.
 * Without PREVIEW_TOKEN, previews are disabled in production (404) and open in development.
 */
export function proxy(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const token = process.env.PREVIEW_TOKEN;
  if (!token) return new NextResponse("Not found", { status: 404 });
  const q = req.nextUrl.searchParams.get("token");
  if (q === token) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("token");
    const res = NextResponse.redirect(url);
    res.cookies.set("preview", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/preview", maxAge: 60 * 60 * 8 });
    return res;
  }
  if (req.cookies.get("preview")?.value === token) return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}

export const config = { matcher: ["/preview/:path*"] };
