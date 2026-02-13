import React, { useState, useEffect, useMemo } from 'react';

/* ── API base ─────────────────────────────────────────────── */
const API = window.location.hostname === 'localhost'
  ? ''
  : '';

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
const STEP = { LOADING: 0, DATE: 1, TIME: 2, CONFIRM: 3, DONE: 4, ERROR: -1 };

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
        // Refresh slots and let user pick again
        setError({ type: 'slot_gone', message: data.message });
        setSelectedTime(null);
        setStep(STEP.TIME);
        // Refresh available dates
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

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
            J
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">JET Germany</h1>
            <p className="text-xs text-gray-500">Installationstermin buchen</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Step indicator */}
        {step > 0 && step < STEP.DONE && (
          <div className="flex items-center gap-2 mb-6">
            {[
              { label: 'Datum', s: STEP.DATE },
              { label: 'Uhrzeit', s: STEP.TIME },
              { label: 'Bestätigen', s: STEP.CONFIRM },
            ].map(({ label, s }, i) => (
              <React.Fragment key={s}>
                {i > 0 && <div className={`flex-1 h-0.5 ${step >= s ? 'bg-blue-500' : 'bg-gray-200'}`} />}
                <div className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
                    ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {step > s ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${step >= s ? 'text-blue-700' : 'text-gray-400'}`}>
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
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="mt-4 text-sm text-gray-500">Verfügbare Termine werden geladen...</p>
          </div>
        )}

        {/* ── ERROR ────────────────────────────────── */}
        {step === STEP.ERROR && error && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-50 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            {error.type === 'no_slots' && (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Keine Termine verfügbar</h2>
                {locationName && <p className="text-sm text-gray-500 mb-1">Standort: {locationName}</p>}
              </>
            )}
            {error.type === 'expired' && (
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Link abgelaufen</h2>
            )}
            {error.type === 'invalid_token' && (
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Ungültiger Link</h2>
            )}
            {error.type === 'network' && (
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Verbindungsfehler</h2>
            )}
            <p className="text-gray-600 text-sm">{error.message}</p>
          </div>
        )}

        {/* ── STEP 1: DATE ─────────────────────────── */}
        {step === STEP.DATE && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                {contactName ? `Hallo ${contactName},` : 'Termin auswählen'}
              </h2>
              <p className="text-sm text-gray-500 mb-1">
                Wählen Sie einen Installationstermin für Ihren Standort.
              </p>
              {locationName && (
                <p className="text-sm font-medium text-blue-600">{locationName} — {city}</p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 px-1">Verfügbare Tage</h3>
              {availableDates.map(d => (
                <button
                  key={d.date}
                  onClick={() => { setSelectedDate(d.date); setSelectedTime(null); setStep(STEP.TIME); }}
                  className={`w-full bg-white rounded-xl border-2 p-4 flex items-center justify-between
                    transition-all hover:shadow-md active:scale-[0.98]
                    ${selectedDate === d.date ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-200'}`}
                >
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">{formatDateShort(d.date)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {d.slots.length} {d.slots.length === 1 ? 'Zeitfenster' : 'Zeitfenster'} verfügbar
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                      {d.slots.length} frei
                    </span>
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            {availableDates.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-center">
                <p className="text-sm text-yellow-800">Momentan sind keine Termine verfügbar.</p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: TIME ─────────────────────────── */}
        {step === STEP.TIME && selectedDateData && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <button
                onClick={() => { setStep(STEP.DATE); setSelectedTime(null); setError(null); }}
                className="flex items-center gap-1 text-sm text-blue-600 mb-3 hover:underline"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Anderes Datum wählen
              </button>
              <h2 className="text-lg font-bold text-gray-900">{formatDateDE(selectedDate)}</h2>
              <p className="text-sm text-gray-500">Wählen Sie eine Uhrzeit für die Installation.</p>
            </div>

            {error?.type === 'slot_gone' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
                {error.message}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {selectedDateData.slots.map(slot => (
                <button
                  key={slot.time}
                  onClick={() => { setSelectedTime(slot.time); setError(null); setStep(STEP.CONFIRM); }}
                  className={`bg-white rounded-xl border-2 p-4 text-center transition-all
                    hover:shadow-md active:scale-[0.97]
                    ${selectedTime === slot.time ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-200'}`}
                >
                  <p className="text-lg font-bold text-gray-900">{slot.time}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{slot.time} – {endTime(slot.time)} Uhr</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 3: CONFIRM ─────────────────────── */}
        {step === STEP.CONFIRM && selectedDate && selectedTime && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <button
                onClick={() => { setStep(STEP.TIME); setError(null); }}
                className="flex items-center gap-1 text-sm text-blue-600 mb-3 hover:underline"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Andere Uhrzeit wählen
              </button>
              <h2 className="text-lg font-bold text-gray-900">Termin bestätigen</h2>
              <p className="text-sm text-gray-500 mb-4">Bitte prüfen Sie die Details und bestätigen Sie den Termin.</p>

              <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{formatDateDE(selectedDate)}</p>
                    <p className="text-sm text-gray-600">{selectedTime} – {endTime(selectedTime)} Uhr</p>
                  </div>
                </div>
                {locationName && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{locationName}</p>
                      <p className="text-sm text-gray-600">{city}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Anmerkungen <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="z.B. Zugang über Hintereingang, Parkplatz vorhanden..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* CTA Button */}
            <button
              onClick={handleBook}
              disabled={submitting}
              className={`w-full py-4 rounded-xl font-semibold text-white text-base
                transition-all active:scale-[0.98]
                ${submitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200'}`}
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
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 text-center">
                {error.message}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: DONE ─────────────────────────── */}
        {step === STEP.DONE && bookingResult && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-green-50 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Termin gebucht!</h2>
              <p className="text-sm text-gray-500 mb-4">
                {contactName ? `Vielen Dank, ${contactName}!` : 'Vielen Dank!'} Ihr Installationstermin wurde erfolgreich gebucht.
              </p>

              <div className="bg-green-50 rounded-xl p-4 space-y-2 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{formatDateDE(bookingResult.date)}</p>
                    <p className="text-sm text-gray-600">
                      {bookingResult.time} – {bookingResult.endTime || endTime(bookingResult.time)} Uhr
                    </p>
                  </div>
                </div>
                {(bookingResult.locationName || locationName) && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {bookingResult.locationName || locationName}
                      </p>
                      <p className="text-sm text-gray-600">{bookingResult.city || city}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 p-4 bg-gray-50 rounded-xl text-sm text-gray-600">
                <p>Sie erhalten in Kürze eine Bestätigung per WhatsApp.</p>
                <p className="mt-1">Unser Team meldet sich am Installationstag bei Ihnen.</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 pb-8">
          <p className="text-xs text-gray-400">
            JET Germany — Digital Out of Home
          </p>
        </div>
      </main>
    </div>
  );
}
