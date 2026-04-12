// ===========================================
// Database types — keep in sync with your schema
// ===========================================
// Tip: You can auto-generate these with the Supabase CLI:
//   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Simulator = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  slug: string;
  status: "draft" | "live" | "archived";
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SimulationRun = {
  id: string;
  simulator_id: string;
  user_id: string | null;
  guest_id: string | null;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  created_at: string;
};
