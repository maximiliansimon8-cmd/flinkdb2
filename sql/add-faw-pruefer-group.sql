-- Migration: Add FAW Prüfer group + grant FAW access to vollzugriff
-- FAW Prüfer log in with username/password and can only see the FAW Check tab

-- 1. Create FAW Prüfer group
INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_faw_pruefer',
  'FAW Prüfer',
  'Externe Frequenzprüfer — sehen nur FAW Check Standorte',
  '#d97706',
  'Eye',
  ARRAY['faw'],
  ARRAY['view', 'faw_review']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  tabs = EXCLUDED.tabs,
  actions = EXCLUDED.actions;

-- 2. Add 'faw' tab to vollzugriff group (so they can also access FAW Check)
UPDATE groups
SET tabs = array_append(tabs, 'faw')
WHERE id = 'grp_vollzugriff'
  AND NOT ('faw' = ANY(tabs));
