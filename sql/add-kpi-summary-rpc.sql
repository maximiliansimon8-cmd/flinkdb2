-- RPC Function: get_kpi_summary (v3)
-- Aggregates heartbeat data + airtable_displays + dayn_screens server-side
-- Returns compact KPI summary covering the FULL display network (~466 displays)
--
-- v3 CHANGES:
-- - UNION with airtable_displays (Live) for JET displays without heartbeats
-- - UNION with dayn_screens for Dayn displays without heartbeats
-- - City mapping extended for DO-DY-* prefix (Dayn network, all Berlin)
-- - latestSnapshot + byCity + displays reflect FULL network
-- - Trend data remains heartbeat-only (historically accurate)
-- - New 'source' field: 'heartbeat', 'airtable', or 'dayn'

-- Drop old version first to ensure clean replacement
DROP FUNCTION IF EXISTS get_kpi_summary(INTEGER);

CREATE OR REPLACE FUNCTION get_kpi_summary(days_back INTEGER DEFAULT 180)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH
  -- Get the latest timestamp from heartbeats
  latest AS (
    SELECT MAX(timestamp_parsed) AS max_ts
    FROM display_heartbeats
  ),
  -- Compute cutoff date
  params AS (
    SELECT
      max_ts,
      max_ts - (days_back || ' days')::INTERVAL AS cutoff
    FROM latest
  ),
  -- ═══════════════════════════════════════════
  -- SOURCE 1: Heartbeat-monitored displays
  -- Per-display latest snapshot per day
  -- ═══════════════════════════════════════════
  daily_display_hb AS (
    SELECT DISTINCT ON (DATE(h.timestamp_parsed), h.display_id)
      DATE(h.timestamp_parsed) AS day,
      h.display_id,
      h.raw_display_id,
      h.location_name,
      h.heartbeat,
      h.days_offline,
      h.display_status,
      h.last_online_date,
      h.timestamp_parsed,
      'heartbeat'::TEXT AS source
    FROM display_heartbeats h, params p
    WHERE h.timestamp_parsed >= p.cutoff
    ORDER BY DATE(h.timestamp_parsed), h.display_id, h.timestamp_parsed DESC
  ),
  -- Collect all heartbeat display_ids
  hb_display_ids AS (
    SELECT DISTINCT display_id FROM daily_display_hb
  ),
  -- ═══════════════════════════════════════════
  -- Heartbeat daily_stats (for trend calculation)
  -- ═══════════════════════════════════════════
  daily_stats_hb AS (
    SELECT
      day,
      display_id,
      raw_display_id,
      location_name,
      heartbeat,
      days_offline,
      display_status,
      source,
      CASE
        WHEN days_offline IS NULL OR days_offline = '' THEN NULL
        ELSE CAST(days_offline AS NUMERIC)
      END AS days_offline_num,
      16.0 AS daily_operating_hours,
      CASE
        WHEN days_offline IS NULL OR days_offline = '' THEN 999.0
        ELSE CAST(days_offline AS NUMERIC) * 24.0
      END AS offline_hours,
      -- Online operating hours (heartbeat-based)
      CASE
        WHEN heartbeat IS NULL AND days_offline IS NULL THEN 0.0
        WHEN display_status = 'live' THEN
          CASE
            WHEN days_offline IS NULL OR days_offline = '' OR days_offline = '0' THEN 16.0
            WHEN CAST(days_offline AS NUMERIC) <= 1 THEN 15.0
            WHEN CAST(days_offline AS NUMERIC) <= 2 THEN 12.0
            WHEN CAST(days_offline AS NUMERIC) <= 3 THEN 8.0
            ELSE GREATEST(0.0, 16.0 - CAST(days_offline AS NUMERIC) * 4.0)
          END
        WHEN display_status = 'zu beobachten' THEN
          CASE
            WHEN days_offline IS NULL OR days_offline = '' THEN 4.0
            WHEN CAST(days_offline AS NUMERIC) <= 2 THEN 10.0
            WHEN CAST(days_offline AS NUMERIC) <= 5 THEN 6.0
            WHEN CAST(days_offline AS NUMERIC) <= 10 THEN 3.0
            ELSE 1.0
          END
        WHEN display_status = 'offline' THEN 0.0
        ELSE 0.0
      END AS online_hours,
      -- Status category
      CASE
        WHEN heartbeat IS NULL AND (days_offline IS NULL OR days_offline = '') THEN 'never_online'
        WHEN display_status = 'live' THEN 'online'
        WHEN display_status = 'zu beobachten' THEN 'warning'
        WHEN display_status = 'offline' THEN
          CASE
            WHEN days_offline IS NOT NULL AND days_offline != '' AND CAST(days_offline AS NUMERIC) > 30 THEN 'permanent_offline'
            ELSE 'critical'
          END
        ELSE 'critical'
      END AS status_category
    FROM daily_display_hb
  ),
  -- ═══════════════════════════════════════════
  -- Trend: aggregate per day (HEARTBEAT ONLY — historically accurate)
  -- ═══════════════════════════════════════════
  daily_aggregated AS (
    SELECT
      day,
      COUNT(*) AS total_displays,
      SUM(CASE WHEN status_category = 'online' THEN 1 ELSE 0 END) AS online_count,
      SUM(CASE WHEN status_category = 'warning' THEN 1 ELSE 0 END) AS warning_count,
      SUM(CASE WHEN status_category = 'critical' THEN 1 ELSE 0 END) AS critical_count,
      SUM(CASE WHEN status_category = 'permanent_offline' THEN 1 ELSE 0 END) AS permanent_offline_count,
      SUM(CASE WHEN status_category = 'never_online' THEN 1 ELSE 0 END) AS never_online_count,
      ROUND(SUM(online_hours)::NUMERIC, 1) AS total_online_hours,
      ROUND(SUM(daily_operating_hours)::NUMERIC, 1) AS total_expected_hours,
      CASE
        WHEN SUM(daily_operating_hours) > 0
        THEN ROUND((SUM(online_hours) / SUM(daily_operating_hours) * 100)::NUMERIC, 1)
        ELSE 0
      END AS health_rate
    FROM daily_stats_hb
    GROUP BY day
    ORDER BY day
  ),
  -- ═══════════════════════════════════════════
  -- FULL NETWORK: latest snapshot includes ALL sources
  -- ═══════════════════════════════════════════
  latest_hb_snapshot AS (
    SELECT display_id, raw_display_id, location_name, days_offline, display_status,
           status_category, offline_hours, source
    FROM daily_stats_hb
    WHERE day = (SELECT MAX(day) FROM daily_stats_hb)
  ),
  -- Airtable Live displays NOT in heartbeats
  airtable_extra AS (
    SELECT
      ad.display_id,
      ad.display_id AS raw_display_id,
      ad.location_name,
      NULL::TEXT AS days_offline,
      'live'::TEXT AS display_status,
      'online'::TEXT AS status_category,
      999.0 AS offline_hours,
      'airtable'::TEXT AS source
    FROM airtable_displays ad
    WHERE ad.online_status = 'Live'
      AND ad.display_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hb_display_ids hb WHERE hb.display_id = ad.display_id)
  ),
  -- Dayn screens NOT in heartbeats
  -- Only 'Installed & online' = truly live screens
  dayn_extra AS (
    SELECT
      ds.do_screen_id AS display_id,
      ds.do_screen_id AS raw_display_id,
      ds.location_name,
      NULL::TEXT AS days_offline,
      'live'::TEXT AS display_status,
      'online'::TEXT AS status_category,
      999.0 AS offline_hours,
      'dayn'::TEXT AS source
    FROM dayn_screens ds
    WHERE ds.do_screen_id IS NOT NULL
      AND ds.screen_status = 'Installed & online'
      AND NOT EXISTS (SELECT 1 FROM hb_display_ids hb WHERE hb.display_id = ds.do_screen_id)
  ),
  -- UNION of all three sources = full network snapshot
  full_snapshot AS (
    SELECT * FROM latest_hb_snapshot
    UNION ALL
    SELECT * FROM airtable_extra
    UNION ALL
    SELECT * FROM dayn_extra
  ),
  -- Compute full-network aggregates for latestSnapshot
  full_network_agg AS (
    SELECT
      COUNT(*) AS total_displays,
      SUM(CASE WHEN status_category = 'online' THEN 1 ELSE 0 END) AS online_count,
      SUM(CASE WHEN status_category = 'warning' THEN 1 ELSE 0 END) AS warning_count,
      SUM(CASE WHEN status_category = 'critical' THEN 1 ELSE 0 END) AS critical_count,
      SUM(CASE WHEN status_category = 'permanent_offline' THEN 1 ELSE 0 END) AS permanent_offline_count,
      SUM(CASE WHEN status_category = 'never_online' THEN 1 ELSE 0 END) AS never_online_count,
      CASE
        WHEN COUNT(*) > 0
        THEN ROUND((SUM(CASE WHEN status_category = 'online' THEN 16.0 WHEN status_category = 'warning' THEN 8.0 ELSE 0.0 END)
              / (COUNT(*) * 16.0) * 100)::NUMERIC, 1)
        ELSE 0
      END AS health_rate
    FROM full_snapshot
  ),
  -- Per-city breakdown from FULL snapshot
  city_breakdown AS (
    SELECT
      CASE
        WHEN raw_display_id LIKE 'DO-GER-BER-%' OR raw_display_id LIKE 'DO-DY-GER-BER-%' THEN 'Berlin'
        WHEN raw_display_id LIKE 'DO-GER-HAM-%' OR raw_display_id LIKE 'DO-GER-HH-%' THEN 'Hamburg'
        WHEN raw_display_id LIKE 'DO-GER-MUC-%' THEN 'München'
        WHEN raw_display_id LIKE 'DO-GER-CGN-%' THEN 'Köln'
        WHEN raw_display_id LIKE 'DO-GER-DUS-%' THEN 'Düsseldorf'
        WHEN raw_display_id LIKE 'DO-GER-FRA-%' THEN 'Frankfurt'
        WHEN raw_display_id LIKE 'DO-GER-STR-%' THEN 'Stuttgart'
        WHEN raw_display_id LIKE 'DO-GER-DTM-%' OR raw_display_id LIKE 'DO-GER-DO-%' THEN 'Dortmund'
        WHEN raw_display_id LIKE 'DO-GER-NUE-%' THEN 'Nürnberg'
        WHEN raw_display_id LIKE 'DO-GER-LEJ-%' THEN 'Leipzig'
        ELSE 'Andere'
      END AS city,
      COUNT(*) AS total,
      SUM(CASE WHEN status_category = 'online' THEN 1 ELSE 0 END) AS online,
      SUM(CASE WHEN status_category != 'online' THEN 1 ELSE 0 END) AS offline
    FROM full_snapshot
    GROUP BY city
    ORDER BY total DESC
  )
  SELECT JSON_BUILD_OBJECT(
    'generatedAt', NOW(),
    'daysBack', days_back,
    'latestSnapshot', (SELECT JSON_BUILD_OBJECT(
      'date', (SELECT MAX(day) FROM daily_stats_hb),
      'totalDisplays', fna.total_displays,
      'onlineCount', fna.online_count,
      'warningCount', fna.warning_count,
      'criticalCount', fna.critical_count,
      'permanentOfflineCount', fna.permanent_offline_count,
      'neverOnlineCount', fna.never_online_count,
      'healthRate', fna.health_rate
    ) FROM full_network_agg fna),
    'trend', (SELECT JSON_AGG(JSON_BUILD_OBJECT(
      'day', day,
      'total', total_displays,
      'online', online_count,
      'warning', warning_count,
      'critical', critical_count,
      'permanentOffline', permanent_offline_count,
      'neverOnline', never_online_count,
      'healthRate', health_rate,
      'totalOnlineHours', total_online_hours,
      'totalExpectedHours', total_expected_hours
    ) ORDER BY day) FROM daily_aggregated),
    'byCity', (SELECT JSON_AGG(JSON_BUILD_OBJECT(
      'city', city,
      'total', total,
      'online', online,
      'offline', offline
    )) FROM city_breakdown),
    'displays', (SELECT JSON_AGG(JSON_BUILD_OBJECT(
      'displayId', display_id,
      'rawDisplayId', raw_display_id,
      'locationName', location_name,
      'daysOffline', days_offline,
      'displayStatus', display_status,
      'status', status_category,
      'offlineHours', offline_hours,
      'source', source
    )) FROM full_snapshot)
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute to anon role so the frontend can call it
GRANT EXECUTE ON FUNCTION get_kpi_summary TO anon;
GRANT EXECUTE ON FUNCTION get_kpi_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_kpi_summary TO service_role;
