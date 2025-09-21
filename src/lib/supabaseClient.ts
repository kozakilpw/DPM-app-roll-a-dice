import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Pojedynczy klient Supabase dla całej aplikacji (public schema).
 * Wymaga poprawnie ustawionych zmiennych w .env.local
 */
export const supabase = createClient(url, anon, {
  db: { schema: "public" },
  realtime: { params: { eventsPerSecond: 5 } },
});