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

/* ── i18n translations ────────────────────────────────────── */
const LANGS = {
  de: { flag: '🇩🇪', label: 'Deutsch' },
  en: { flag: '🇬🇧', label: 'English' },
  tr: { flag: '🇹🇷', label: 'Türkçe' },
  ar: { flag: '🇸🇦', label: 'العربية' },
};

const T = {
  de: {
    stepDate: 'Datum', stepTime: 'Uhrzeit', stepInfo: 'Info', stepBook: 'Buchen',
    loading: 'Verfügbare Termine werden geladen...',
    noSlots: 'Keine Termine verfügbar', expired: 'Link abgelaufen',
    invalidLink: 'Ungültiger Link', connectionError: 'Verbindungsfehler',
    hello: 'Hallo', selectDate: 'Termin auswählen',
    selectDateDesc: 'Wählen Sie einen Installationstermin für Ihr Liefernado Display.',
    availableDays: 'Verfügbare Tage', slotsAvail: 'Zeitfenster verfügbar', free: 'frei',
    noSlotsMsg: 'Momentan sind keine Termine verfügbar.',
    otherDate: 'Anderes Datum wählen', selectTime: 'Wählen Sie eine Uhrzeit für die Installation.',
    slotGone: 'Dieses Zeitfenster ist leider nicht mehr verfügbar.',
    otherTime: 'Andere Uhrzeit wählen',
    howItWorks: 'So funktioniert die Installation',
    readInfo: 'Bitte lesen Sie diese Informationen, damit am Installationstag alles reibungslos abläuft.',
    theDisplay: 'Das Display',
    displayDesc: 'Wir installieren ein 55-Zoll Digital-Display im Hochformat (ca. 125 × 75 cm) mit Standfuß in Ihrem Schaufenster. Das Display verfügt über ein eigenes 5G-Modul — Sie benötigen kein WLAN oder Internet.',
    placement: 'Platzierung im Schaufenster',
    placementDesc: 'Das Display wird mittig im Schaufenster auf Augenhöhe (ca. 1,60 m) positioniert, mit 3–5 cm Abstand zur Scheibe. Bitte stellen Sie sicher, dass der Bereich frei ist — keine Aufkleber, Poster oder Hindernisse vor dem Display.',
    power: 'Strom: 6–24 Uhr durchgehend',
    powerDesc: 'Das Display muss täglich von 6:00 bis 24:00 Uhr mit Strom versorgt sein. Es wird eine freie Steckdose innerhalb von 2 Metern benötigt. Wichtig: Kein Mehrfachstecker, und die Steckdose darf nicht an einem Lichtschalter hängen.',
    process: 'Ablauf vor Ort',
    processDesc: 'Unser Installationsteam kommt zum vereinbarten Zeitpunkt. Die Installation dauert ca. 30–60 Minuten. Das Team bringt alles mit — Display, Standfuß und SIM-Karte. Bitte stellen Sie sicher, dass jemand vor Ort ist.',
    checklist: 'Checkliste für den Installationstag:',
    check1: 'Schaufenster frei (mind. 125 × 75 cm, keine Aufkleber/Poster)',
    check2: 'Freie Steckdose innerhalb von 2m (6–24 Uhr Strom, nicht am Lichtschalter)',
    check3: 'Ebener Boden für den Standfuß',
    check4: 'Ansprechpartner vor Ort',
    understood: 'Verstanden — weiter zur Bestätigung',
    back: 'Zurück',
    confirmTitle: 'Termin bestätigen',
    confirmDesc: 'Bitte prüfen Sie die Details und bestätigen Sie den Termin.',
    notesLabel: 'Anmerkungen', optional: '(optional)',
    notesPlaceholder: 'z.B. Zugang über Hintereingang, Parkplatz vorhanden...',
    bookNow: 'Termin verbindlich buchen', booking: 'Wird gebucht...',
    bookFailed: 'Buchung fehlgeschlagen.',
    doneTitle: 'Termin gebucht!',
    thanksMsg: 'Ihr Installationstermin wurde erfolgreich gebucht.',
    thanks: 'Vielen Dank',
    whatsappConfirm: 'Sie erhalten in Kürze eine Bestätigung per WhatsApp.',
    teamContact: 'Unser Team meldet sich am Installationstag bei Ihnen.',
    location: 'Standort',
  },
  en: {
    stepDate: 'Date', stepTime: 'Time', stepInfo: 'Info', stepBook: 'Book',
    loading: 'Loading available dates...',
    noSlots: 'No appointments available', expired: 'Link expired',
    invalidLink: 'Invalid link', connectionError: 'Connection error',
    hello: 'Hello', selectDate: 'Select appointment',
    selectDateDesc: 'Choose an installation date for your Liefernado display.',
    availableDays: 'Available days', slotsAvail: 'time slots available', free: 'free',
    noSlotsMsg: 'No appointments are currently available.',
    otherDate: 'Choose another date', selectTime: 'Choose a time for the installation.',
    slotGone: 'This time slot is no longer available.',
    otherTime: 'Choose another time',
    howItWorks: 'How the installation works',
    readInfo: 'Please read this information so everything runs smoothly on installation day.',
    theDisplay: 'The display',
    displayDesc: 'We install a 55-inch portrait digital display (approx. 125 × 75 cm) with a stand in your shop window. The display has its own 5G module — no WiFi or internet needed.',
    placement: 'Shop window placement',
    placementDesc: 'The display is placed centrally in the shop window at eye level (approx. 1.60 m), with 3–5 cm distance from the glass. Please make sure the area is clear — no stickers, posters or obstacles.',
    power: 'Power: 6 AM – midnight continuously',
    powerDesc: 'The display must be powered daily from 6:00 AM to midnight. A free power outlet within 2 meters is needed. Important: No power strips, and the outlet must not be on a light switch.',
    process: 'On-site procedure',
    processDesc: 'Our installation team arrives at the agreed time. Installation takes approx. 30–60 minutes. The team brings everything — display, stand and SIM card. Please ensure someone is on-site.',
    checklist: 'Checklist for installation day:',
    check1: 'Shop window clear (min. 125 × 75 cm, no stickers/posters)',
    check2: 'Free power outlet within 2m (6 AM–midnight, not on light switch)',
    check3: 'Level floor for the stand',
    check4: 'Contact person on-site',
    understood: 'Understood — continue to confirmation',
    back: 'Back',
    confirmTitle: 'Confirm appointment',
    confirmDesc: 'Please review the details and confirm the appointment.',
    notesLabel: 'Notes', optional: '(optional)',
    notesPlaceholder: 'e.g. Access via back entrance, parking available...',
    bookNow: 'Book appointment', booking: 'Booking...',
    bookFailed: 'Booking failed.',
    doneTitle: 'Appointment booked!',
    thanksMsg: 'Your installation appointment has been successfully booked.',
    thanks: 'Thank you',
    whatsappConfirm: 'You will receive a confirmation via WhatsApp shortly.',
    teamContact: 'Our team will contact you on installation day.',
    location: 'Location',
  },
  tr: {
    stepDate: 'Tarih', stepTime: 'Saat', stepInfo: 'Bilgi', stepBook: 'Rezerve',
    loading: 'Mevcut randevular yükleniyor...',
    noSlots: 'Randevu mevcut değil', expired: 'Link süresi dolmuş',
    invalidLink: 'Geçersiz link', connectionError: 'Bağlantı hatası',
    hello: 'Merhaba', selectDate: 'Randevu seçin',
    selectDateDesc: 'Liefernado ekranınız için bir kurulum tarihi seçin.',
    availableDays: 'Mevcut günler', slotsAvail: 'zaman dilimi mevcut', free: 'boş',
    noSlotsMsg: 'Şu anda mevcut randevu bulunmamaktadır.',
    otherDate: 'Başka bir tarih seçin', selectTime: 'Kurulum için bir saat seçin.',
    slotGone: 'Bu zaman dilimi artık mevcut değil.',
    otherTime: 'Başka bir saat seçin',
    howItWorks: 'Kurulum nasıl yapılır',
    readInfo: 'Kurulum gününde her şeyin sorunsuz ilerlemesi için bu bilgileri okuyun.',
    theDisplay: 'Ekran',
    displayDesc: 'Vitrin camınıza standlı 55 inç dikey dijital ekran (yakl. 125 × 75 cm) kuruyoruz. Ekranın kendi 5G modülü var — WiFi veya internet gerekmez.',
    placement: 'Vitrin yerleşimi',
    placementDesc: 'Ekran vitrinde göz hizasında (yakl. 1,60 m) ortaya, camdan 3–5 cm mesafeyle yerleştirilir. Alanın boş olduğundan emin olun — etiket, poster veya engel olmamalı.',
    power: 'Elektrik: 06:00–24:00 kesintisiz',
    powerDesc: 'Ekranın günlük 06:00–24:00 arası elektrikle beslenmesi gerekir. 2 metre içinde boş bir priz gereklidir. Önemli: Çoklu priz kullanmayın ve priz bir ışık anahtarına bağlı olmamalı.',
    process: 'Yerinde süreç',
    processDesc: 'Kurulum ekibimiz belirlenen saatte gelir. Kurulum yakl. 30–60 dakika sürer. Ekip her şeyi getirir — ekran, stand ve SIM kart. Lütfen yerinde biri olduğundan emin olun.',
    checklist: 'Kurulum günü kontrol listesi:',
    check1: 'Vitrin boş (min. 125 × 75 cm, etiket/poster yok)',
    check2: '2m içinde boş priz (06–24 saat elektrik, ışık anahtarında değil)',
    check3: 'Stand için düz zemin',
    check4: 'Yerinde yetkili kişi',
    understood: 'Anladım — onaya devam et',
    back: 'Geri',
    confirmTitle: 'Randevuyu onayla',
    confirmDesc: 'Lütfen detayları kontrol edip randevuyu onaylayın.',
    notesLabel: 'Notlar', optional: '(isteğe bağlı)',
    notesPlaceholder: 'örn. Arka girişten erişim, otopark mevcut...',
    bookNow: 'Randevuyu kesin olarak ayırt', booking: 'Kaydediliyor...',
    bookFailed: 'Rezervasyon başarısız.',
    doneTitle: 'Randevu alındı!',
    thanksMsg: 'Kurulum randevunuz başarıyla kaydedildi.',
    thanks: 'Teşekkürler',
    whatsappConfirm: 'Kısa süre içinde WhatsApp ile onay alacaksınız.',
    teamContact: 'Ekibimiz kurulum günü sizinle iletişime geçecek.',
    location: 'Konum',
  },
  ar: {
    stepDate: 'التاريخ', stepTime: 'الوقت', stepInfo: 'معلومات', stepBook: 'حجز',
    loading: '...جاري تحميل المواعيد المتاحة',
    noSlots: 'لا توجد مواعيد متاحة', expired: 'الرابط منتهي الصلاحية',
    invalidLink: 'رابط غير صالح', connectionError: 'خطأ في الاتصال',
    hello: 'مرحبا', selectDate: 'اختر موعد',
    selectDateDesc: 'اختر موعد تركيب شاشة ليفراندو الخاصة بك.',
    availableDays: 'الأيام المتاحة', slotsAvail: 'فترات زمنية متاحة', free: 'متاح',
    noSlotsMsg: 'لا توجد مواعيد متاحة حالياً.',
    otherDate: 'اختر تاريخاً آخر', selectTime: 'اختر وقتاً للتركيب.',
    slotGone: 'هذا الموعد لم يعد متاحاً.',
    otherTime: 'اختر وقتاً آخر',
    howItWorks: 'كيف يتم التركيب',
    readInfo: 'يرجى قراءة هذه المعلومات لضمان سير عملية التركيب بسلاسة.',
    theDisplay: 'الشاشة',
    displayDesc: 'نقوم بتركيب شاشة رقمية عمودية 55 بوصة (حوالي 125 × 75 سم) مع حامل في واجهة متجرك. الشاشة مزودة بوحدة 5G خاصة بها — لا حاجة لشبكة WiFi أو إنترنت.',
    placement: 'موضع الواجهة',
    placementDesc: 'يتم وضع الشاشة في منتصف الواجهة على مستوى العين (حوالي 1.60 م)، على بعد 3-5 سم من الزجاج. يرجى التأكد من خلو المنطقة — بدون ملصقات أو ملصقات أو عوائق.',
    power: 'الكهرباء: 6 صباحاً حتى منتصف الليل',
    powerDesc: 'يجب تزويد الشاشة بالكهرباء يومياً من الساعة 6 صباحاً حتى منتصف الليل. يلزم مقبس كهربائي حر في نطاق 2 متر. مهم: بدون مشترك كهربائي، والمقبس لا يجب أن يكون على مفتاح إضاءة.',
    process: 'إجراءات الموقع',
    processDesc: 'يصل فريق التركيب في الوقت المتفق عليه. يستغرق التركيب حوالي 30-60 دقيقة. الفريق يحضر كل شيء — الشاشة والحامل وبطاقة SIM. يرجى التأكد من وجود شخص في الموقع.',
    checklist: ':قائمة مراجعة يوم التركيب',
    check1: 'واجهة فارغة (125 × 75 سم على الأقل، بدون ملصقات)',
    check2: 'مقبس كهربائي حر في نطاق 2 متر (كهرباء 6-24 ساعة)',
    check3: 'أرضية مستوية للحامل',
    check4: 'شخص مسؤول في الموقع',
    understood: 'فهمت — المتابعة للتأكيد',
    back: 'رجوع',
    confirmTitle: 'تأكيد الموعد',
    confirmDesc: 'يرجى مراجعة التفاصيل وتأكيد الموعد.',
    notesLabel: 'ملاحظات', optional: '(اختياري)',
    notesPlaceholder: 'مثل: الدخول من الباب الخلفي، موقف سيارات متوفر...',
    bookNow: 'حجز الموعد نهائياً', booking: '...جاري الحجز',
    bookFailed: 'فشل الحجز.',
    doneTitle: '!تم حجز الموعد',
    thanksMsg: 'تم حجز موعد التركيب بنجاح.',
    thanks: 'شكراً',
    whatsappConfirm: 'ستتلقى تأكيداً عبر واتساب قريباً.',
    teamContact: 'سيتواصل فريقنا معك في يوم التركيب.',
    location: 'الموقع',
  },
};

/* ── helpers ──────────────────────────────────────────────── */
function formatDateLocale(dateStr, lang = 'de') {
  const d = new Date(dateStr + 'T00:00:00');
  const locale = lang === 'ar' ? 'ar-SA' : lang === 'tr' ? 'tr-TR' : lang === 'en' ? 'en-GB' : 'de-DE';
  return d.toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateShortLocale(dateStr, lang = 'de') {
  const d = new Date(dateStr + 'T00:00:00');
  const locale = lang === 'ar' ? 'ar-SA' : lang === 'tr' ? 'tr-TR' : lang === 'en' ? 'en-GB' : 'de-DE';
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

function endTime(start) {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + 90;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/* ── Language selector ───────────────────────────────────── */
function LanguageSelector({ lang, setLang }) {
  return (
    <div className="flex items-center gap-1">
      {Object.entries(LANGS).map(([code, { flag }]) => (
        <button key={code}
          onClick={() => setLang(code)}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
            lang === code ? 'bg-orange-100 ring-2 ring-orange-400 scale-110' : 'hover:bg-gray-100'
          }`}
          title={LANGS[code].label}>
          {flag}
        </button>
      ))}
    </div>
  );
}

/* ── steps ────────────────────────────────────────────────── */
const STEP = { LOADING: 0, DATE: 1, TIME: 2, INFO: 2.5, CONFIRM: 3, DONE: 4, ERROR: -1 };

/* ── Info Section Component ───────────────────────────────── */
function InstallInfoSection({ onContinue, onBack, t = T.de }) {
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
          {t.otherTime}
        </button>
        <h2 className="text-lg font-bold" style={{ color: BRAND.text }}>
          {t.howItWorks}
        </h2>
        <p className="text-sm mt-1" style={{ color: BRAND.textLight }}>
          {t.readInfo}
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
            <p className="text-sm font-semibold" style={{ color: BRAND.text }}>{t.theDisplay}</p>
            <p className="text-sm mt-0.5" style={{ color: BRAND.textLight }}>
              {t.displayDesc}
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
            <p className="text-sm font-semibold" style={{ color: BRAND.text }}>{t.placement}</p>
            <p className="text-sm mt-0.5" style={{ color: BRAND.textLight }}>
              {t.placementDesc}
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
            <p className="text-sm font-semibold" style={{ color: BRAND.text }}>{t.power}</p>
            <p className="text-sm mt-0.5" style={{ color: BRAND.textLight }}>
              {t.powerDesc}
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
            <p className="text-sm font-semibold" style={{ color: BRAND.text }}>{t.process}</p>
            <p className="text-sm mt-0.5" style={{ color: BRAND.textLight }}>
              {t.processDesc}
            </p>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-2xl p-4 border" style={{ backgroundColor: BRAND.orangeLight, borderColor: BRAND.orangeMedium }}>
        <p className="text-sm font-semibold mb-2" style={{ color: BRAND.orangeDark }}>{t.checklist}</p>
        <ul className="space-y-1.5">
          {[t.check1, t.check2, t.check3, t.check4].map((item, i) => (
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
        {t.understood}
      </button>
    </div>
  );
}

/* ── main component ──────────────────────────────────────── */
export default function BookingPage() {
  const [step, setStep] = useState(STEP.LOADING);
  const [error, setError] = useState(null);
  const [lang, setLang] = useState('de');
  const t = T[lang] || T.de;
  const isRtl = lang === 'ar';

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
    { label: t.stepDate, s: STEP.DATE },
    { label: t.stepTime, s: STEP.TIME },
    { label: t.stepInfo, s: STEP.INFO },
    { label: t.stepBook, s: STEP.CONFIRM },
  ];

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.bg }} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="border-b px-4 py-3" style={{ backgroundColor: BRAND.white, borderColor: BRAND.orangeMedium }}>
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <LieferandoLogo className="h-12 w-auto" />
          <LanguageSelector lang={lang} setLang={setLang} />
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
            <p className="mt-4 text-sm" style={{ color: BRAND.textLight }}>{t.loading}</p>
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
                <h2 className="text-lg font-semibold mb-2" style={{ color: BRAND.text }}>{t.noSlots}</h2>
                {locationName && <p className="text-sm mb-1" style={{ color: BRAND.textLight }}>{t.location}: {locationName}</p>}
              </>
            )}
            {error.type === 'expired' && (
              <h2 className="text-lg font-semibold mb-2" style={{ color: BRAND.text }}>{t.expired}</h2>
            )}
            {error.type === 'invalid_token' && (
              <h2 className="text-lg font-semibold mb-2" style={{ color: BRAND.text }}>{t.invalidLink}</h2>
            )}
            {error.type === 'network' && (
              <h2 className="text-lg font-semibold mb-2" style={{ color: BRAND.text }}>{t.connectionError}</h2>
            )}
            <p className="text-sm" style={{ color: BRAND.textLight }}>{error.message}</p>
          </div>
        )}

        {/* ── STEP 1: DATE ─────────────────────────── */}
        {step === STEP.DATE && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: '#FED7AA' }}>
              <h2 className="text-xl font-bold mb-1" style={{ color: BRAND.text }}>
                {contactName ? `${t.hello} ${contactName},` : t.selectDate}
              </h2>
              <p className="text-sm mb-1" style={{ color: BRAND.textLight }}>
                {t.selectDateDesc}
              </p>
              {locationName && (
                <p className="text-sm font-medium" style={{ color: BRAND.orange }}>{locationName} — {city}</p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold px-1" style={{ color: BRAND.textLight }}>{t.availableDays}</h3>
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
                    <p className="font-semibold" style={{ color: BRAND.text }}>{formatDateShortLocale(d.date, lang)}</p>
                    <p className="text-xs mt-0.5" style={{ color: BRAND.textLight }}>
                      {d.slots.filter(s => s.available !== false).length} {t.slotsAvail}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{ color: BRAND.orange, backgroundColor: BRAND.orangeLight }}>
                      {d.slots.filter(s => s.available !== false).length} {t.free}
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
                <p className="text-sm" style={{ color: '#92400E' }}>{t.noSlotsMsg}</p>
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
                {t.otherDate}
              </button>
              <h2 className="text-lg font-bold" style={{ color: BRAND.text }}>{formatDateLocale(selectedDate, lang)}</h2>
              <p className="text-sm" style={{ color: BRAND.textLight }}>{t.selectTime}</p>
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
            t={t}
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
                {t.back}
              </button>
              <h2 className="text-lg font-bold" style={{ color: BRAND.text }}>{t.confirmTitle}</h2>
              <p className="text-sm mb-4" style={{ color: BRAND.textLight }}>{t.confirmDesc}</p>

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
                    <p className="text-sm font-bold" style={{ color: BRAND.text }}>{formatDateLocale(selectedDate, lang)}</p>
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
                {t.notesLabel} <span style={{ color: BRAND.textMuted }}>{t.optional}</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t.notesPlaceholder}
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
                  {t.booking}
                </span>
              ) : (
                t.bookNow
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
              <h2 className="text-xl font-bold mb-2" style={{ color: BRAND.text }}>{t.doneTitle}</h2>
              <p className="text-sm mb-4" style={{ color: BRAND.textLight }}>
                {contactName ? `${t.thanks}, ${contactName}!` : `${t.thanks}!`} {t.thanksMsg}
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
                    <p className="text-sm font-bold" style={{ color: BRAND.text }}>{formatDateLocale(bookingResult.date, lang)}</p>
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
                <p className="font-medium">{t.whatsappConfirm}</p>
                <p className="mt-1">{t.teamContact}</p>
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
