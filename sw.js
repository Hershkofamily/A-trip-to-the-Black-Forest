/*
 * The Black Forest · Summer 2026
 * Service Worker — שמירת האתר במכשיר לשימוש בלי אינטרנט.
 *
 * מוחק את עצמו אוטומטית אחרי הטיסה חזרה (26.8.2026, 19:00 שעון ציריך).
 * המחיקה מתבצעת בפעם הראשונה שהאתר נפתח אחרי התאריך — דפדפנים לא
 * מריצים קוד של אתר סגור, לא באייפון ולא באנדרואיד.
 */

const CACHE = 'black-forest-2026-v1';
const TRIP_END = new Date('2026-08-26T19:00:00+02:00').getTime();

// נשמרים מיד בהתקנה. שאר הקבצים (תמונות, פונטים) נשמרים תוך כדי גלישה.
const CORE = ['./', './index.html'];

// אלה אף פעם לא נשמרים — הם חייבים רשת חיה ואין טעם לשמור אותם.
const NEVER_CACHE = /google\.com\/maps\/embed|gemini\.google\.com|google\.com\/search/;

function expired() {
    return Date.now() > TRIP_END;
}

async function selfDestruct() {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'WIPED', reason: 'expired' }));
}

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(CORE))
            .catch(() => {}) // התקנה לא נכשלת בגלל קובץ בודד שלא נטען
    );
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        if (expired()) {
            await selfDestruct();
            return;
        }
        // ניקוי גרסאות ישנות של המטמון
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const req = event.request;

    if (req.method !== 'GET') return;
    if (NEVER_CACHE.test(req.url)) return;

    // אחרי סוף הטיול: מוחק הכל ומפסיק להתערב בבקשות
    if (expired()) {
        event.waitUntil(selfDestruct());
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(req);

        // רענון ברקע — המבקר מקבל מיד את העותק השמור,
        // והגרסה החדשה תופיע בביקור הבא.
        const network = fetch(req).then(res => {
            // status 0 = תגובה אטומה (תמונות מדומיין אחר) — עדיין שווה לשמור
            if (res && (res.status === 200 || res.type === 'opaque')) {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
            }
            return res;
        }).catch(() => null);

        if (cached) {
            event.waitUntil(network);
            return cached;
        }

        const fresh = await network;
        if (fresh) return fresh;

        // אין רשת ואין עותק שמור — מחזירים את דף הבית אם זו בקשת ניווט
        if (req.mode === 'navigate') {
            const home = await caches.match('./index.html') || await caches.match('./');
            if (home) return home;
        }
        return Response.error();
    })());
});

// מחיקה ידנית מהכפתור שבתחתית האתר
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'WIPE') {
        event.waitUntil(selfDestruct());
    }
});
