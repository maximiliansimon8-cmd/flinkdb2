-- Migration: Create get_dashboard_kpis RPC function
-- OPTIMIERT: hourly_health CTE entfernt (verursachte Timeout bei 150K+ Rows)
-- Health Rate wird jetzt aus daily_trend berechnet (online/total Ratio)
--
-- WICHTIG: days_offline ist TEXT in display_heartbeats! Muss immer gecastet werden.
-- Pattern: COALESCE(NULLIF(days_offline, '')::INT, 0)
--
-- Usage: SELECT get_dashboard_kpis(30);

CREATE OR REPLACE FUNCTION get_dashboard_kpis(days_back INT DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  WITH
  -- 1. Installierte Displays = Status 'Live' oder 'Installed & online'
  installed AS (
    SELECT display_id
    FROM airtable_displays
    WHERE online_status IN ('Live', 'Installed & online')
  ),
  installed_count AS (
    SELECT COUNT(*) AS total FROM installed
  ),

  -- 2. Letzte Heartbeats pro Display (nur neuester pro display_id)
  latest_hb AS (
    SELECT DISTINCT ON (display_id)
      display_id,
      COALESCE(NULLIF(days_offline, '')::INT, 0) AS days_off,
      is_alive, display_status,
      location_name, timestamp_parsed, raw_display_id
    FROM display_heartbeats
    ORDER BY display_id, timestamp_parsed DESC
  ),

  -- 3. Status-Kategorien
  status_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE days_off < 1) AS online_count,
      COUNT(*) FILTER (WHERE days_off >= 1 AND days_off < 3) AS warning_count,
      COUNT(*) FILTER (WHERE days_off >= 3 AND days_off < 7) AS critical_count,
      COUNT(*) FILTER (WHERE days_off >= 7) AS permanent_offline_count,
      COUNT(*) AS heartbeat_total
    FROM latest_hb
  ),

  -- 4. Dayn Screens
  dayn AS (
    SELECT COUNT(*) AS total, ROUND(COUNT(*) * 0.9)::INT AS assumed_online
    FROM dayn_screens WHERE do_screen_id IS NOT NULL
  ),

  -- 5. Täglicher Trend + Health Rate Basis
  -- Health Rate = SUM(online display-days) / SUM(total display-days) * 100
  daily_trend AS (
    SELECT DATE(timestamp_parsed) AS day,
      COUNT(DISTINCT display_id) AS total,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) < 1) AS online,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 1 AND 2) AS warning,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 3 AND 6) AS critical,
      COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) >= 7) AS permanent_offline
    FROM display_heartbeats
    WHERE timestamp_parsed >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY DATE(timestamp_parsed)
    ORDER BY day
  ),

  -- Health Rate aus daily_trend (ersetzt die teure hourly_health CTE)
  health_from_trend AS (
    SELECT
      COALESCE(SUM(online), 0) AS total_online,
      COALESCE(SUM(total), 0) AS total_expected
    FROM daily_trend
  ),

  -- 6. Display-Liste
  display_list AS (
    SELECT
      h.display_id, h.raw_display_id, h.location_name, h.days_off,
      h.display_status, h.timestamp_parsed,
      CASE
        WHEN h.days_off < 1 THEN 'online'
        WHEN h.days_off >= 1 AND h.days_off < 3 THEN 'warning'
        WHEN h.days_off >= 3 AND h.days_off < 7 THEN 'critical'
        WHEN h.days_off >= 7 THEN 'permanent_offline'
        ELSE 'unknown'
      END AS status
    FROM latest_hb h
  )

  SELECT json_build_object(
    'installed', (SELECT total FROM installed_count),
    'online', (SELECT online_count FROM status_counts) + (SELECT assumed_online FROM dayn),
    'warning', (SELECT warning_count FROM status_counts),
    'critical', (SELECT critical_count FROM status_counts),
    'permanentOffline', (SELECT permanent_offline_count FROM status_counts),
    'heartbeatTotal', (SELECT heartbeat_total FROM status_counts),
    'daynTotal', (SELECT total FROM dayn),
    'daynOnline', (SELECT assumed_online FROM dayn),
    'healthRate', CASE
      WHEN (SELECT total_expected FROM health_from_trend) > 0
      THEN ROUND(((SELECT total_online FROM health_from_trend)::NUMERIC /
                   (SELECT total_expected FROM health_from_trend) * 100), 1)
      ELSE 0
    END,
    'totalOnlineHours', (SELECT total_online FROM health_from_trend),
    'totalExpectedHours', (SELECT total_expected FROM health_from_trend),
    'trend', (
      SELECT COALESCE(json_agg(json_build_object(
        'day', day, 'total', total, 'online', online,
        'warning', warning, 'critical', critical,
        'permanentOffline', permanent_offline,
        'healthRate', CASE WHEN total > 0
          THEN ROUND((online::NUMERIC / total * 100)::NUMERIC, 1) ELSE 0 END
      ) ORDER BY day), '[]'::JSON)
      FROM daily_trend
    ),
    'snapshotTimestamp', (SELECT MAX(timestamp_parsed) FROM latest_hb),
    'displays', (
      SELECT COALESCE(json_agg(json_build_object(
        'displayId', display_id, 'rawDisplayId', raw_display_id,
        'locationName', location_name, 'daysOffline', days_off,
        'displayStatus', display_status, 'status', status
      )), '[]'::JSON)
      FROM display_list
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_dashboard_kpis(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_dashboard_kpis(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_kpis(INT) TO service_role;

-- Simpler Fallback: Nur Trend-Daten
CREATE OR REPLACE FUNCTION get_daily_trend(days_back INT DEFAULT 30)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(json_build_object(
      'day', day, 'total', total, 'online', online,
      'warning', warning, 'critical', critical,
      'permanentOffline', permanent_offline,
      'healthRate', CASE WHEN total > 0
        THEN ROUND((online::NUMERIC / total * 100)::NUMERIC, 1) ELSE 0 END
    ) ORDER BY day), '[]'::JSON)
    FROM (
      SELECT DATE(timestamp_parsed) AS day,
        COUNT(DISTINCT display_id) AS total,
        COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) < 1) AS online,
        COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 1 AND 2) AS warning,
        COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) BETWEEN 3 AND 6) AS critical,
        COUNT(DISTINCT display_id) FILTER (WHERE COALESCE(NULLIF(days_offline, '')::INT, 0) >= 7) AS permanent_offline
      FROM display_heartbeats
      WHERE timestamp_parsed >= NOW() - (days_back || ' days')::INTERVAL
      GROUP BY DATE(timestamp_parsed)
      ORDER BY day
    ) t
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_daily_trend(INT) TO anon;
GRANT EXECUTE ON FUNCTION get_daily_trend(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_trend(INT) TO service_role;
