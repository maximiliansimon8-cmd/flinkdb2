import React, { useState, useEffect, useMemo } from 'react';

/* ── API base ─────────────────────────────────────────────── */
const API = window.location.hostname === 'localhost'
  ? ''
  : '';

/* ── Liefernado CI Colors ─────────────────────────────────── */
const BRAND = {
  orange: '#FF8000',
  orangeLight: '#FFF3E6',
  orangeMedium: '#FFE0B2',
  orangeDark: '#E67300',
  text: '#1A1A1A',
  textLight: '#666666',
  textMuted: '#999999',
  bg: '#FFFAF5',
  white: '#FFFFFF',
  green: '#22C55E',
  greenLight: '#ECFDF5',
  greenMedium: '#BBF7D0',
  red: '#EF4444',
  redLight: '#FEF2F2',
  yellow: '#F59E0B',
  yellowLight: '#FFFBEB',
};

/* ── Liefernado Logo (inline SVG) ─────────────────────────── */
function LieferandoLogo({ className = '' }) {
  return (
    <svg viewBox="0 0 520 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* House + Fork icon */}
      <g fill={BRAND.orange}>
        {/* House roof */}
        <path d="M35 8C34 8 33 8.5 32.3 9.3L5 36c-1.5 1.5-0.5 4 1.7 4H13v28c0 2.2 1.8 4 4 4h6V52c0-2.2 1.8-4 4-4h16c2.2 0 4 1.8 4 4v20h6c2.2 0 4-1.8 4-4V40h6.3c2.2 0 3.2-2.5 1.7-4L37.7 9.3C37 8.5 36 8 35 8z"/>
        {/* Fork */}
        <path d="M29 28V18h3v10h-3zm5 0V18h3v10h-3zm-10 0V18h3v10h-3zm2 2c0 3 2 5.5 5 6v12h3V36c3-0.5 5-3 5-6H26z"/>
      </g>
      {/* "Lieferando" text */}
      <g fill={BRAND.orange}>
        <text x="80" y="50" fontFamily="system-ui, -apple-system, sans-serif" fontSize="42" fontWeight="700" letterSpacing="-0.5">Lieferando</text>
        <text x="80" y="85" fontFamily="system-ui, -apple-system, sans-serif" fontSize="30" fontWeight="400" fill="#E67300">Display Netzwerk</text>
      </g>
    </svg>
  );
}

/* ── helpers ──────────────────────────────────────────────── */
function formatDateDE(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function endTime(start) {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + 90;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/* ── steps ────────────────────────────────────────────────── */
const STEP = { LOADING: 0, DATE: 1, TIME: 2, INFO: 2.5, CONFIRM: 3, DONE: 4, ERROR: -1 };

/* ── Info Section Component ───────────────────────────────── */
function InstallInfoSection({ onContinue, onBack }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm mb-3 hover:underline"
          style={{ color: BRAND.orange }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Andere Uhrzeit wählen
        </button>
        <h2 className="text-lg font-bold" style={{ color: BRAND.text }}>
          So funktioniert die Installation
        </h2>
        <p className="text-sm mt-1" style={{ color: BRAND.textLight }}>
          Bitte lesen Sie diese Informationen, damit am Installationstag alles reibungslos abläuft.
        </p>
      </div>

      {/* Display Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: BRAND.orangeLight }}>
            <svg className="w-5 h-5" style={{ color: BRAND.orange }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: BRAND.text }}>Das Display</p>
            <p className="text-sm mt-0.5" style={{ color: BRAND.textLight }}>
              Wir installieren ein <strong>55-Zoll Digital-Display im Hochformat</strong> (ca. 125 × 75 cm) mit Standfuß in Ihrem Schaufenster. Das Display verfügt über ein <strong>eigenes 5G-Modul</strong> — Sie benötigen kein WLAN oder Internet.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: BRAND.orangeLight }}>
            <svg className="w-5 h-5" style={{ color: BRAND.orange }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: BRAND.text }}>Platzierung im Schaufenster</p>
            <p className="text-sm mt-0.5" style={{ color: BRAND.textLight }}>
              Das Display wird mittig im Schaufenster auf <strong>Augenhöhe (ca. 1,60 m)</strong> positioniert, mit <strong>3–5 cm Abstand zur Scheibe</strong>. Bitte stellen Sie sicher, dass der Bereich frei ist — keine Aufkleber, Poster oder Hindernisse vor dem Display.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: BRAND.orangeLight }}>
            <svg className="w-5 h-5" style={{ color: BRAND.orange }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: BRAND.text }}>Strom: 6–24 Uhr durchgehend</p>
            <p className="text-sm mt-0.5" style={{ color: BRAND.textLight }}>
              Das Display muss <strong>täglich von 6:00 bis 24:00 Uhr mit Strom versorgt</strong> sein. Es wird eine <strong>freie Steckdose innerhalb von 2 Metern</strong> benötigt. <strong>Wichtig:</strong> Kein Mehrfachstecker, und die Steckdose darf <strong>nicht an einem Lichtschalter</strong> hängen.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: BRAND.orangeLight }}>
            <svg className="w-5 h-5" style={{ color: BRAND.orange }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: BRAND.text }}>Ablauf vor Ort</p>
            <p className="text-sm mt-0.5" style={{ color: BRAND.textLight }}>
              Unser Installationsteam kommt zum vereinbarten Zeitpunkt. Die Installation dauert ca. <strong>30–60 Minuten</strong>. Das Team bringt alles mit — Display, Standfuß und SIM-Karte. Bitte stellen Sie sicher, dass jemand vor Ort ist.
            </p>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-2xl p-4 border" style={{ backgroundColor: BRAND.orangeLight, borderColor: BRAND.orangeMedium }}>
        <p className="text-sm font-semibold mb-2" style={{ color: BRAND.orangeDark }}>Checkliste für den Installationstag:</p>
        <ul className="space-y-1.5">
          {[
            'Schaufenster frei (mind. 125 × 75 cm, keine Aufkleber/Poster)',
            'Freie Steckdose innerhalb von 2m (6–24 Uhr Strom, nicht am Lichtschalter)',
            'Ebener Boden für den Standfuß',
            'Ansprechpartner vor Ort',
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-sm" style={{ color: BRAND.orangeDark }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Continue Button */}
      <button
        onClick={onContinue}
        className="w-full py-4 rounded-xl font-semibold text-white text-base transition-all active:scale-[0.98] shadow-lg"
        style={{ backgroundColor: BRAND.orange, boxShadow: '0 4px 14px rgba(255, 128, 0, 0.3)' }}
      >
        Verstanden — weiter zur Bestätigung
      </button>
    </div>
  );
}

/* ── main component ──────────────────────────────────────── */
export default function BookingPage() {
  const [step, setStep] = useState(STEP.LOADING);
  const [error, setError] = useState(null);

  // data from API
  const [locationName, setLocationName] = useState('');
  const [city, setCity] = useState('');
  const [contactName, setContactName] = useState('');
  const [availableDates, setAvailableDates] = useState([]);

  // user selections
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // booking result
  const [bookingResult, setBookingResult] = useState(null);

  // extract token from URL
  const token = useMemo(() => {
    const path = window.location.pathname;
    const match = path.match(/\/book\/(.+)/);
    return match ? match[1] : null;
  }, []);

  /* ── load slots ─────────────────────────────────────────── */
  useEffect(() => {
    if (!token) {
      setError({ type: 'invalid_token', message: 'Kein gültiger Buchungslink.' });
      setStep(STEP.ERROR);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API}/api/install-booker/slots?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (data.error === 'already_booked') {
          setBookingResult({ date: data.bookedDate, time: data.bookedTime });
          setLocationName(data.locationName || '');
          setCity(data.city || '');
          setContactName(data.contactName || '');
          setStep(STEP.DONE);
          return;
        }

        if (data.error === 'expired') {
          setError({ type: 'expired', message: data.message });
          setStep(STEP.ERROR);
          return;
        }

        if (data.error === 'invalid_token') {
          setError({ type: 'invalid_token', message: data.message });
          setStep(STEP.ERROR);
          return;
        }

        if (data.error === 'no_slots') {
          setLocationName(data.locationName || '');
          setCity(data.city || '');
          setError({ type: 'no_slots', message: data.message });
          setStep(STEP.ERROR);
          return;
        }

        setLocationName(data.locationName || '');
        setCity(data.city || '');
        setContactName(data.contactName || '');
        setAvailableDates(data.availableDates || []);
        setStep(STEP.DATE);
      } catch (e) {
        setError({ type: 'network', message: 'Verbindungsfehler. Bitte versuchen Sie es erneut.' });
        setStep(STEP.ERROR);
      }
    })();
  }, [token]);

  /* ── book ────────────────────────────────────────────────── */
  async function handleBook() {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);

    try {
      const res = await fetch(`${API}/api/install-booker/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          date: selectedDate,
          time: selectedTime,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setBookingResult(data.booking);
        setStep(STEP.DONE);
      } else if (data.error === 'slot_taken' || data.error === 'day_full') {
        setError({ type: 'slot_gone', message: data.message });
        setSelectedTime(null);
        setStep(STEP.TIME);
        const refreshRes = await fetch(`${API}/api/install-booker/slots?token=${encodeURIComponent(token)}`);
        const refreshData = await refreshRes.json();
        if (refreshData.availableDates) setAvailableDates(refreshData.availableDates);
      } else {
        setError({ type: 'book_failed', message: data.message || 'Buchung fehlgeschlagen.' });
      }
    } catch (e) {
      setError({ type: 'network', message: 'Verbindungsfehler. Bitte versuchen Sie es erneut.' });
    } finally {
      setSubmitting(false);
    }
  }

  /* ── selected date data ─────────────────────────────────── */
  const selectedDateData = availableDates.find(d => d.date === selectedDate);

  /* ── step labels for progress indicator ─────────────────── */
  const stepLabels = [
    { label: 'Datum', s: STEP.DATE },
    { label: 'Uhrzeit', s: STEP.TIME },
    { label: 'Info', s: STEP.INFO },
    { label: 'Buchen', s: STEP.CONFIRM },
  ];

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.bg }}>
      {/* Header */}
      <header className="border-b px-4 py-3" style={{ backgroundColor: BRAND.white, borderColor: BRAND.orangeMedium }}>
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <LieferandoLogo className="h-12 w-auto" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Step indicator */}
        {step > 0 && step < STEP.DONE && (
          <div className="flex items-center gap-2 mb-6">
            {stepLabels.map(({ label, s }, i) => (
              <React.Fragment key={s}>
                {i > 0 && (
                  <div className="flex-1 h-0.5 rounded-full"
                    style={{ backgroundColor: step >= s ? BRAND.orange : '#E5E7EB' }} />
                )}
                <div className="flex items-center gap-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                    style={{
                      backgroundColor: step >= s ? BRAND.orange : '#E5E7EB',
                      color: step >= s ? BRAND.white : BRAND.textMuted,
                    }}>
                    {step > s ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline`}
                    style={{ color: step >= s ? BRAND.orange : BRAND.textMuted }}>
                    {label}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* ── LOADING ──────────────────────────────── */}
        {step === STEP.LOADING && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 rounded-full animate-spin"
              style={{ borderColor: BRAND.orangeMedium, borderTopColor: BRAND.orange }} />
            <p className="mt-4 text-sm" style={{ color: BRAND.textLight }}>Verfügbare Termine werden geladen...</p>
          </div>
        )}

        {/* ── ERROR ────────────────────────────────── */}
        {step === STEP.ERROR && error && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 text-center" style={{ borderColor: '#FEE2E2' }}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: BRAND.redLight }}>
              <svg className="w-8 h-8" style={{ color: BRAND.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            {error.type === 'no_slots' && (
              <>
                <h2 className="text-lg font-semibold mb-2" style={{ color: BRAND.text }}>Keine Termine verfügbar</h2>
                {locationName && <p className="text-sm mb-1" style={{ color: BRAND.textLight }}>Standort: {locationName}</p>}
              </>
            )}
            {error.type === 'expired' && (
              <h2 className="text-lg font-semibold mb-2" style={{ color: BRAND.text }}>Link abgelaufen</h2>
            )}
            {error.type === 'invalid_token' && (
              <h2 className="text-lg font-semibold mb-2" style={{ color: BRAND.text }}>Ungültiger Link</h2>
            )}
            {error.type === 'network' && (
              <h2 className="text-lg font-semibold mb-2" style={{ color: BRAND.text }}>Verbindungsfehler</h2>
            )}
            <p className="text-sm" style={{ color: BRAND.textLight }}>{error.message}</p>
          </div>
        )}

        {/* ── STEP 1: DATE ─────────────────────────── */}
        {step === STEP.DATE && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: '#FED7AA' }}>
              <h2 className="text-xl font-bold mb-1" style={{ color: BRAND.text }}>
                {contactName ? `Hallo ${contactName},` : 'Termin auswählen'}
              </h2>
              <p className="text-sm mb-1" style={{ color: BRAND.textLight }}>
                Wählen Sie einen Installationstermin für Ihr Liefernado Display.
              </p>
              {locationName && (
                <p className="text-sm font-medium" style={{ color: BRAND.orange }}>{locationName} — {city}</p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold px-1" style={{ color: BRAND.textLight }}>Verfügbare Tage</h3>
              {availableDates.map(d => (
                <button
                  key={d.date}
                  onClick={() => { setSelectedDate(d.date); setSelectedTime(null); setStep(STEP.TIME); }}
                  className="w-full bg-white rounded-xl border-2 p-4 flex items-center justify-between
                    transition-all hover:shadow-md active:scale-[0.98]"
                  style={{
                    borderColor: selectedDate === d.date ? BRAND.orange : '#F3F4F6',
                    backgroundColor: selectedDate === d.date ? BRAND.orangeLight : BRAND.white,
                  }}
                >
                  <div className="text-left">
                    <p className="font-semibold" style={{ color: BRAND.text }}>{formatDateShort(d.date)}</p>
                    <p className="text-xs mt-0.5" style={{ color: BRAND.textLight }}>
                      {d.slots.filter(s => s.available !== false).length} Zeitfenster verfügbar
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{ color: BRAND.orange, backgroundColor: BRAND.orangeLight }}>
                      {d.slots.filter(s => s.available !== false).length} frei
                    </span>
                    <svg className="w-5 h-5" style={{ color: BRAND.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            {availableDates.length === 0 && (
              <div className="rounded-xl p-4 text-center border"
                style={{ backgroundColor: BRAND.yellowLight, borderColor: '#FDE68A' }}>
                <p className="text-sm" style={{ color: '#92400E' }}>Momentan sind keine Termine verfügbar.</p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: TIME ─────────────────────────── */}
        {step === STEP.TIME && selectedDateData && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: '#FED7AA' }}>
              <button
                onClick={() => { setStep(STEP.DATE); setSelectedTime(null); setError(null); }}
                className="flex items-center gap-1 text-sm mb-3 hover:underline"
                style={{ color: BRAND.orange }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Anderes Datum wählen
              </button>
              <h2 className="text-lg font-bold" style={{ color: BRAND.text }}>{formatDateDE(selectedDate)}</h2>
              <p className="text-sm" style={{ color: BRAND.textLight }}>Wählen Sie eine Uhrzeit für die Installation.</p>
            </div>

            {error?.type === 'slot_gone' && (
              <div className="rounded-xl p-3 text-sm border"
                style={{ backgroundColor: BRAND.yellowLight, borderColor: '#FDE68A', color: '#92400E' }}>
                {error.message}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {selectedDateData.slots.filter(s => s.available !== false).map(slot => (
                <button
                  key={slot.time}
                  onClick={() => { setSelectedTime(slot.time); setError(null); setStep(STEP.INFO); }}
                  className="bg-white rounded-xl border-2 p-4 text-center transition-all
                    hover:shadow-md active:scale-[0.97]"
                  style={{
                    borderColor: selectedTime === slot.time ? BRAND.orange : '#F3F4F6',
                    backgroundColor: selectedTime === slot.time ? BRAND.orangeLight : BRAND.white,
                  }}
                >
                  <p className="text-lg font-bold" style={{ color: BRAND.text }}>{slot.time}</p>
                  <p className="text-xs mt-0.5" style={{ color: BRAND.textLight }}>{slot.time} – {endTime(slot.time)} Uhr</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 2.5: INFO ─────────────────────────── */}
        {step === STEP.INFO && selectedDate && selectedTime && (
          <InstallInfoSection
            onContinue={() => setStep(STEP.CONFIRM)}
            onBack={() => { setStep(STEP.TIME); setSelectedTime(null); }}
          />
        )}

        {/* ── STEP 3: CONFIRM ─────────────────────── */}
        {step === STEP.CONFIRM && selectedDate && selectedTime && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: '#FED7AA' }}>
              <button
                onClick={() => { setStep(STEP.INFO); setError(null); }}
                className="flex items-center gap-1 text-sm mb-3 hover:underline"
                style={{ color: BRAND.orange }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Zurück
              </button>
              <h2 className="text-lg font-bold" style={{ color: BRAND.text }}>Termin bestätigen</h2>
              <p className="text-sm mb-4" style={{ color: BRAND.textLight }}>Bitte prüfen Sie die Details und bestätigen Sie den Termin.</p>

              <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: BRAND.orangeLight }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: BRAND.orangeMedium }}>
                    <svg className="w-5 h-5" style={{ color: BRAND.orange }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: BRAND.text }}>{formatDateDE(selectedDate)}</p>
                    <p className="text-sm" style={{ color: BRAND.textLight }}>{selectedTime} – {endTime(selectedTime)} Uhr</p>
                  </div>
                </div>
                {locationName && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: BRAND.orangeMedium }}>
                      <svg className="w-5 h-5" style={{ color: BRAND.orange }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: BRAND.text }}>{locationName}</p>
                      <p className="text-sm" style={{ color: BRAND.textLight }}>{city}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: '#FED7AA' }}>
              <label className="block text-sm font-medium mb-2" style={{ color: BRAND.textLight }}>
                Anmerkungen <span style={{ color: BRAND.textMuted }}>(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="z.B. Zugang über Hintereingang, Parkplatz vorhanden..."
                rows={3}
                className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none"
                style={{ borderColor: '#E5E7EB', focusRingColor: BRAND.orange }}
              />
            </div>

            {/* CTA Button */}
            <button
              onClick={handleBook}
              disabled={submitting}
              className="w-full py-4 rounded-xl font-semibold text-white text-base transition-all active:scale-[0.98]"
              style={{
                backgroundColor: submitting ? '#9CA3AF' : BRAND.orange,
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: submitting ? 'none' : '0 4px 14px rgba(255, 128, 0, 0.3)',
              }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Wird gebucht...
                </span>
              ) : (
                'Termin verbindlich buchen'
              )}
            </button>

            {error?.type === 'book_failed' && (
              <div className="rounded-xl p-3 text-sm text-center border"
                style={{ backgroundColor: BRAND.redLight, borderColor: '#FECACA', color: '#B91C1C' }}>
                {error.message}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: DONE ─────────────────────────── */}
        {step === STEP.DONE && bookingResult && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-6 text-center" style={{ borderColor: BRAND.greenMedium }}>
              <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{ backgroundColor: BRAND.greenLight }}>
                <svg className="w-10 h-10" style={{ color: BRAND.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: BRAND.text }}>Termin gebucht!</h2>
              <p className="text-sm mb-4" style={{ color: BRAND.textLight }}>
                {contactName ? `Vielen Dank, ${contactName}!` : 'Vielen Dank!'} Ihr Installationstermin wurde erfolgreich gebucht.
              </p>

              <div className="rounded-xl p-4 space-y-2 text-left" style={{ backgroundColor: BRAND.greenLight }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: BRAND.greenMedium }}>
                    <svg className="w-5 h-5" style={{ color: BRAND.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: BRAND.text }}>{formatDateDE(bookingResult.date)}</p>
                    <p className="text-sm" style={{ color: BRAND.textLight }}>
                      {bookingResult.time} – {bookingResult.endTime || endTime(bookingResult.time)} Uhr
                    </p>
                  </div>
                </div>
                {(bookingResult.locationName || locationName) && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: BRAND.greenMedium }}>
                      <svg className="w-5 h-5" style={{ color: BRAND.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: BRAND.text }}>
                        {bookingResult.locationName || locationName}
                      </p>
                      <p className="text-sm" style={{ color: BRAND.textLight }}>{bookingResult.city || city}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 p-4 rounded-xl text-sm" style={{ backgroundColor: BRAND.orangeLight, color: BRAND.orangeDark }}>
                <p className="font-medium">Sie erhalten in Kürze eine Bestätigung per WhatsApp.</p>
                <p className="mt-1">Unser Team meldet sich am Installationstag bei Ihnen.</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 pb-8">
          <p className="text-xs" style={{ color: BRAND.textMuted }}>
            Liefernado Display Netzwerk — powered by JET Germany
          </p>
        </div>
      </main>
    </div>
  );
}
