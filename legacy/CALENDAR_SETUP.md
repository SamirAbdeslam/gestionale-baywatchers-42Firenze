# 📅 Integrazione "Sottoscrivi il mio calendario"

## 🎯 Obiettivo
Permettere agli utenti di aggiungere **automaticamente tutti i loro eventi** al proprio calendario (Google, Apple, Outlook, ecc.) **senza login** e **senza ricevere email multiple**.

---

## 🔧 Strategia
Usare un **feed iCalendar (.ics)** personale per ogni utente, accessibile tramite link sicuro e sottoscrivibile con il protocollo `webcal://`.

### ✅ Vantaggi
- Nessun accesso o login a Google o altri servizi.
- L’utente si iscrive **una sola volta**.
- Gli eventi futuri vengono sincronizzati automaticamente.
- Compatibile con Apple Calendar, Outlook, Google Calendar, ecc.

---

## 🧱 Struttura tecnica

### 1. Endpoint utente (feed personale)
Crea un endpoint tipo:

GET /users/<token>/calendar.ics

Questo endpoint restituisce un file `.ics` contenente **tutti gli eventi** dell’utente.

#### Esempio di struttura ICS:
```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TuoSito//Feed//IT
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:123e4567-e89b-12d3-a456-426614174000
DTSTAMP:20251017T140000Z
DTSTART:20251101T180000Z
DTEND:20251101T190000Z
SUMMARY:Meetup su X
DESCRIPTION:Dettagli evento: porta laptop.
LOCATION:Via Roma 1, Firenze
SEQUENCE:0
END:VEVENT
END:VCALENDAR

Ogni evento deve avere un UID univoco e, se modificato, un SEQUENCE incrementato.

Sicurezza:

Ogni utente ha un token univoco nel link (/users/<token>/calendar.ics).

Il link deve essere servito su HTTPS.

Possibilità di revocare o rigenerare il token.

📱 Esperienza utente

L’utente clicca “Sottoscrivi il mio calendario”.

Il sito riconosce il dispositivo:

iPhone/macOS → apre direttamente Apple Calendar.

Android → apre Google Calendar.

Desktop → apre il client calendario o mostra istruzioni.

L’utente conferma → calendario aggiunto per sempre.

Ogni nuovo evento iscritto appare automaticamente.

🔒 Buone pratiche

Token lunghi (es. 32+ caratteri alfanumerici).

HTTPS obbligatorio.

Endpoint con rate limit.

Possibilità di “Rigenera link calendario” nel profilo.

Usa DTSTAMP aggiornato per modifiche agli eventi.

Risultato finale

Esperienza 1 click per l’utente.

Nessun bisogno di autenticarsi con Google o simili.

Nessuna email multipla inviata.

Calendario sempre aggiornato con gli eventi iscritti.