-- ============================================================
-- Partner / Logistik Gruppe
-- Zugriff auf Hardware + Installationen
-- Run this in the Supabase SQL Editor
-- ============================================================

INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_partner',
  'Partner / Logistik',
  'Installations- und Hardware-Logistik Partner',
  '#10b981',
  'Truck',
  ARRAY[
    'hardware',
    'hardware.inventory',
    'hardware.wareneingang',
    'hardware.qr-codes',
    'hardware.positionen',
    'installations',
    'installations.calendar',
    'installations.bookings'
  ],
  ARRAY[
    'view',
    'manage_hardware',
    'manage_warehouse',
    'manage_qr',
    'manage_bookings'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  tabs = EXCLUDED.tabs,
  actions = EXCLUDED.actions;

-- Also update existing groups to include hardware tabs
-- Admin already has full access (checked by isAdmin())
-- Operations should also see hardware
UPDATE groups
SET tabs = array_cat(tabs, ARRAY['hardware', 'hardware.inventory', 'hardware.wareneingang', 'hardware.qr-codes', 'hardware.positionen']),
    actions = array_cat(actions, ARRAY['manage_hardware', 'manage_warehouse', 'manage_qr'])
WHERE id = 'grp_operations'
  AND NOT ('hardware' = ANY(tabs));
