-- Performance-Indexes für display_heartbeats
-- Beschleunigt die get_dashboard_kpis RPC und andere Queries

-- Index für DISTINCT ON (display_id) ORDER BY timestamp_parsed DESC
-- Beschleunigt: latest_hb CTE (neuester Heartbeat pro Display)
CREATE INDEX IF NOT EXISTS idx_heartbeats_display_ts_desc
  ON display_heartbeats (display_id, timestamp_parsed DESC);

-- Index für zeitbasierte Abfragen (Trend, Health Rate)
-- Beschleunigt: hourly_health, daily_trend CTEs
CREATE INDEX IF NOT EXISTS idx_heartbeats_ts_parsed
  ON display_heartbeats (timestamp_parsed);

-- Index für timestamp + days_offline Kombination (Health Rate Berechnung)
CREATE INDEX IF NOT EXISTS idx_heartbeats_ts_days_offline
  ON display_heartbeats (timestamp_parsed, days_offline);
