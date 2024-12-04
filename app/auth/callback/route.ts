import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = createRouteHandlerClient({
      cookies,
    });

    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Auth callback error:", error);
        return NextResponse.redirect(
          `${requestUrl.origin}/auth/error?error=${error.message}`
        );
      }

      // Get the session to verify it worked
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error("Session verification error:", sessionError);
        return NextResponse.redirect(
          `${requestUrl.origin}/auth/error?error=session_verification_failed`
        );
      }

      console.log("Auth callback successful for user:", session.user.email);
      return NextResponse.redirect(`${requestUrl.origin}/dashboard`);
    } catch (err) {
      console.error("Unexpected auth callback error:", err);
      return NextResponse.redirect(
        `${requestUrl.origin}/auth/error?error=unexpected_error`
      );
    }
  }

  // Return to home page if no code or error
  return NextResponse.redirect(requestUrl.origin);
}
