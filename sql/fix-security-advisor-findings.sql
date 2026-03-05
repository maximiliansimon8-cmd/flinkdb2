-- Fix Supabase Security Advisor Findings (Report 22 Feb 2026)
-- Project: JET Dashboard v.2 (hvgjdosdejnwkuyivnrq)
--
-- Finding 1+2: sync_metadata has RLS policies but RLS is not enabled
-- The table has a policy "Allow service role full access" but RLS was never turned on.
ALTER TABLE public.sync_metadata ENABLE ROW LEVEL SECURITY;

-- Finding 3: shipping_orders_overview view uses SECURITY DEFINER
-- This means the view runs with the privileges of the view owner, not the invoker.
-- Fix: Switch to SECURITY INVOKER so RLS policies on underlying tables are respected.
ALTER VIEW public.shipping_orders_overview SET (security_invoker = true);
