// Stesso progetto Supabase di Siderio Suite (vedi docs/architecture/ARCHITECTURE.md).
// Valori pubblici (anon key), sicuri da esporre lato client: l'accesso reale e'
// regolato da RLS e dalle funzioni sales_ai.* definite in supabase/migrations.
//
// Hardcoded senza fallback su process.env: la variabile d'ambiente su Vercel
// conteneva un valore mascherato (copiato dalla dashboard Supabase prima di
// premere "reveal", quindi pieno di caratteri "•") che restava sempre "truthy"
// e quindi vinceva sul fallback, causando l'errore ByteString nel client.
export const SUPABASE_URL = "https://kvsrnxsaajsdmkikipjl.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2c3JueHNhYWpzZG1raWtpcGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDU5NjYsImV4cCI6MjA5NDc4MTk2Nn0.koeqbhxar2pB-wy2CjpSu9V0hM8NH5YqV5u8Pfwa-0c";
