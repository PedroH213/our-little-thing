import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://wwiwtpumlpsnipkpcmtw.supabase.co";

const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  "sb_publishable_ErnVPnxUVFjOpPGT-s-FcQ_Rt5AKiJZ";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
