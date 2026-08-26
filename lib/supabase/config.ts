// Stesso progetto Supabase di Siderio Suite (vedi docs/architecture/ARCHITECTURE.md).
// Valori pubblici (anon key), sicuri da esporre lato client: l'accesso reale e'
// regolato da RLS e dalle funzioni sales_ai.* definite in supabase/migrations.
//
// Valori di riserva hardcoded qui sotto: le variabili d'ambiente su Vercel hanno
// ripetutamente prodotto un errore di codifica dei caratteri (ByteString) nel
// client Supabase, quindi non ci affidiamo piu' solo a
// NEXT_PUBLIC_SUPABASE_ANON_KEY/URL configurate da pannello.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kvsrnxsaajsdmkikipjl.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2c3JueHNhYWpzZG1raWtpcGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDU5NjYsImV4cCI6MjA5NDc4MTk2Nn0.koeqbhxar2pB-wy2CjpSu9V0hM8NH5YqV5u8Pfwa-0c";
