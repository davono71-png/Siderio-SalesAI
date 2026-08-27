import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // api/ escluso: le route sotto app/api/ fanno la propria autorizzazione
  // (Bearer JWT o segreto cron), non la sessione via cookie che gestisce
  // questo middleware — altrimenti ogni chiamata senza cookie di sessione
  // (pg_cron, chiamate server-to-server) veniva rediretta a /login invece
  // di raggiungere l'endpoint.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
