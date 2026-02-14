-- =============================================
-- Mobile KPIs RPC Function
-- Returns all dashboard KPIs in a single call (~2KB JSON)
-- Run this in Supabase SQL Editor
-- =============================================

-- City code mapping (same as frontend CITY_MAP)
CREATE OR REPLACE FUNCTION get_mobile_kpis()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH
  -- 1. Get the LATEST heartbeat snapshot per display_id
  latest_per_display AS (
    SELECT DISTINCT ON (display_id)
      display_id,
      raw_display_id,
      location_name,
      timestamp_parsed,
      heartbeat,
      is_alive,
      display_status,
      days_offline,
      -- Calculate offline hours from timestamp and heartbeat
      CASE
        WHEN heartbeat IS NOT NULL AND timestamp_parsed IS NOT NULL
        THEN EXTRACT(EPOCH FROM (timestamp_parsed - heartbeat::timestamptz)) / 3600.0
        ELSE NULL
      END AS offline_hours,
      -- Extract city code (3rd segment of display_id split by '-')
      CASE
        WHEN display_id LIKE '%-%-%'
        THEN split_part(display_id, '-', 3)
        ELSE 'UNK'
      END AS city_code
    FROM display_heartbeats
    WHERE timestamp_parsed > NOW() - INTERVAL '30 days'
    ORDER BY display_id, timestamp_parsed DESC
  ),

  -- 2. Check which displays EVER had a heartbeat (across all time)
  ever_online AS (
    SELECT display_id, TRUE AS had_heartbeat
    FROM display_heartbeats
    WHERE heartbeat IS NOT NULL
    GROUP BY display_id
  ),

  -- 3. Classify each display into status categories
  classified AS (
    SELECT
      l.*,
      COALESCE(e.had_heartbeat, FALSE) AS ever_had_heartbeat,
      CASE
        WHEN COALESCE(e.had_heartbeat, FALSE) = FALSE THEN 'never_online'
        WHEN l.offline_hours IS NULL OR l.offline_hours < 0 THEN 'online'
        WHEN l.offline_hours < 24 THEN 'online'
        WHEN l.offline_hours < 72 THEN 'warning'
        WHEN l.offline_hours >= 168 THEN 'permanent_offline'
        ELSE 'critical'
      END AS status
    FROM latest_per_display l
    LEFT JOIN ever_online e ON e.display_id = l.display_id
  ),

  -- 4. City name mapping
  city_mapped AS (
    SELECT
      c.*,
      CASE c.city_code
        WHEN 'CGN' THEN 'Köln'
        WHEN 'BER' THEN 'Berlin'
        WHEN 'MUC' THEN 'München'
        WHEN 'HAM' THEN 'Hamburg'
        WHEN 'HH'  THEN 'Hamburg'
        WHEN 'DUS' THEN 'Düsseldorf'
        WHEN 'FRA' THEN 'Frankfurt'
        WHEN 'STR' THEN 'Stuttgart'
        WHEN 'DTM' THEN 'Dortmund'
        WHEN 'DO'  THEN 'Dortmund'
        WHEN 'LEJ' THEN 'Leipzig'
        WHEN 'DRS' THEN 'Dresden'
        WHEN 'NUE' THEN 'Nürnberg'
        WHEN 'HAN' THEN 'Hannover'
        WHEN 'BRE' THEN 'Bremen'
        WHEN 'ESS' THEN 'Essen'
        WHEN 'KA'  THEN 'Karlsruhe'
        WHEN 'MS'  THEN 'Münster'
        WHEN 'BI'  THEN 'Bielefeld'
        WHEN 'WI'  THEN 'Wiesbaden'
        WHEN 'MA'  THEN 'Mannheim'
        WHEN 'AC'  THEN 'Aachen'
        WHEN 'KI'  THEN 'Kiel'
        WHEN 'ROS' THEN 'Rostock'
        ELSE city_code
      END AS city_name
    FROM classified c
  ),

  -- 5. Aggregate KPIs
  kpi_agg AS (
    SELECT
      COUNT(*) AS total_active,
      COUNT(*) FILTER (WHERE status = 'online') AS online_count,
      COUNT(*) FILTER (WHERE status = 'warning') AS warning_count,
      COUNT(*) FILTER (WHERE status = 'critical') AS critical_count,
      COUNT(*) FILTER (WHERE status = 'permanent_offline') AS permanent_offline_count,
      COUNT(*) FILTER (WHERE status = 'never_online') AS never_online_count,
      ROUND(
        (COUNT(*) FILTER (WHERE status = 'online'))::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE status != 'never_online'), 0) * 100,
        1
      ) AS health_rate
    FROM city_mapped
  ),

  -- 6. Top offline displays (for attention cards)
  top_offline AS (
    SELECT json_agg(t) AS displays
    FROM (
      SELECT
        display_id AS "displayId",
        location_name AS "locationName",
        city_name AS "city",
        status,
        ROUND(COALESCE(offline_hours, 0)::NUMERIC, 1) AS "offlineHours",
        days_offline AS "daysOffline"
      FROM city_mapped
      WHERE status IN ('critical', 'permanent_offline')
      ORDER BY COALESCE(offline_hours, 0) DESC
      LIMIT 10
    ) t
  ),

  -- 7. City breakdown
  city_breakdown AS (
    SELECT json_object_agg(
      city_name,
      json_build_object(
        'total', total,
        'online', online,
        'warning', warn,
        'critical', crit,
        'offline', perm_off
      )
    ) AS by_city
    FROM (
      SELECT
        city_name,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'online') AS online,
        COUNT(*) FILTER (WHERE status = 'warning') AS warn,
        COUNT(*) FILTER (WHERE status = 'critical') AS crit,
        COUNT(*) FILTER (WHERE status = 'permanent_offline') AS perm_off
      FROM city_mapped
      GROUP BY city_name
      ORDER BY total DESC
    ) cities
  ),

  -- 8. First-seen counts for "newly installed" (last 7 days)
  new_installs AS (
    SELECT COUNT(*) AS cnt
    FROM display_first_seen
    WHERE first_seen > NOW() - INTERVAL '7 days'
  )

  SELECT json_build_object(
    'healthRate', COALESCE(k.health_rate, 0),
    'totalActive', k.total_active,
    'onlineCount', k.online_count,
    'warningCount', k.warning_count,
    'criticalCount', k.critical_count,
    'permanentOfflineCount', k.permanent_offline_count,
    'neverOnlineCount', k.never_online_count,
    'newlyInstalled', COALESCE(n.cnt, 0),
    'deinstalled', 0,
    'topOffline', COALESCE(o.displays, '[]'::json),
    'byCity', COALESCE(cb.by_city, '{}'::json),
    'computedAt', NOW()
  ) INTO result
  FROM kpi_agg k
  CROSS JOIN top_offline o
  CROSS JOIN city_breakdown cb
  CROSS JOIN new_installs n;

  RETURN result;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION get_mobile_kpis() TO anon;
GRANT EXECUTE ON FUNCTION get_mobile_kpis() TO authenticated;
