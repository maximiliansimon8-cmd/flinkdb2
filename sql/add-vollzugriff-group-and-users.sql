-- ============================================================
-- Vollzugriff-Gruppe (alles außer Admin)
-- + 3 neue User: Uestuen, Hasenberg, Demir
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Create "Vollzugriff" group with all tabs/actions EXCEPT admin
INSERT INTO groups (id, name, description, color, icon, tabs, actions)
VALUES (
  'grp_vollzugriff',
  'Vollzugriff',
  'Voller Zugriff auf alle Bereiche außer Admin-Verwaltung',
  '#6366f1',
  'Shield',
  ARRAY[
    'displays', 'displays.overview', 'displays.list', 'displays.cities',
    'hardware', 'hardware.inventory', 'hardware.wareneingang', 'hardware.qr-codes',
    'hardware.positionen', 'hardware.bestellwesen', 'hardware.lager-versand', 'hardware.tracking',
    'tasks', 'communication',
    'installations', 'installations.calendar', 'installations.bookings'
  ],
  ARRAY[
    'view', 'export', 'view_contacts', 'view_revenue',
    'create_task', 'edit_task', 'delete_task',
    'send_message', 'view_messages',
    'manage_schedule', 'manage_bookings', 'send_booking_invite',
    'manage_hardware', 'manage_warehouse', 'manage_qr'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  tabs = EXCLUDED.tabs,
  actions = EXCLUDED.actions;

-- 2. Create Supabase Auth users + app_users entries
-- NOTE: User creation via Supabase Auth API must be done via the Dashboard API.
-- After running this SQL, create users via Admin Panel or API:
--   POST /api/users/add { name, email, groupId: 'grp_vollzugriff', password: '***REMOVED_DEFAULT_PW***' }
--
-- Users to create:
--   1. Uestuen  → Uestuen@e-systems.org
--   2. Hasenberg → Hasenberg@e-systems.org
--   3. Demir → demir@e-systems.org
