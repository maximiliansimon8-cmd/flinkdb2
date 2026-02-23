-- Fix fehlgeschlagene Einladungen: Setze Status auf 'invite_failed'
-- für Bookings die 'pending' sind aber wo WhatsApp fehlgeschlagen ist.
--
-- Diese Bookings wurden VOR dem Fix erstellt (alter Code setzte whatsapp_sent_at
-- bevor WA gesendet wurde). Jetzt setzt der neue Code whatsapp_sent_at nur noch
-- nach erfolgreichem Senden.
--
-- Kriterium: pending + whatsapp_sent_at gesetzt + kein gebuchter Termin
-- Die 2 betroffenen Standorte: "Pizza Blitz City" und "Avaya, Pizzeria & Kebap"

-- Schritt 1: Prüfen welche Bookings betroffen sind
SELECT id, location_name, status, whatsapp_sent_at, created_at, contact_phone
FROM install_bookings
WHERE status = 'pending'
  AND location_name IN ('Pizza Blitz City', 'Avaya, Pizzeria & Kebap')
ORDER BY created_at DESC;

-- Schritt 2: Status auf invite_failed setzen (nach Prüfung der Ergebnisse oben)
UPDATE install_bookings
SET status = 'invite_failed',
    whatsapp_sent_at = NULL
WHERE status = 'pending'
  AND location_name IN ('Pizza Blitz City', 'Avaya, Pizzeria & Kebap');
