import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const fallbackUrl = "http://localhost:54321";
const fallbackAnonKey = "public-anon-key";

if (!url || !anon) {
  console.warn(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Using a placeholder Supabase client; set real values in your environment."
  );
}

/**
 * Pojedynczy klient Supabase dla całej aplikacji (public schema).
 * Wymaga poprawnie ustawionych zmiennych w .env.local
 */
export const supabase = createClient(url ?? fallbackUrl, anon ?? fallbackAnonKey, {
  db: { schema: "public" },
  realtime: { params: { eventsPerSecond: 5 } },
});