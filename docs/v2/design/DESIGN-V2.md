# 42 Baywatchers — design v2

Approvato da Ismail il 23 ottobre 2026. Parte dal design v1 (canvas
https://claude.ai/artifact/E5g6vAA2HsBf3RZweoghvb, sorgenti in `project/`, PNG in `Baywatchers v2 Design-png/`,
copia nel repo in `docs/v2/design/`) e ne corregge l'usabilità.

Obiettivo: tenere l'identità visiva della v1 e recuperare la densità e la rapidità di lettura del vecchio sito
(`gestionale-baywatchers-42Firenze/legacy/templates/calendar.html` e `admin.html`). Il mobile è la priorità:
è il formato usato di più dagli studenti.

## 1. Cosa resta della v1

- Biglietto con perforazione a mezzi fori, colori per tipo di evento, animazione di conferma B v2.3.2
  (`standalone/CONFERMA-B.md`).
- Font: Bricolage Grotesque (titoli), Instrument Sans (testo), IBM Plex Mono (orari, login, numeri).
- Token colore dei due temi (`docs/v2/design/tokens.css`), tema di sistema più interruttore.
- Colori di stato distinti: ok, avviso, pericolo, passato.
- Nessuna emoji come icona: solo icone SVG a tratto.
- Barra di navigazione mobile in basso (Calendario, Profilo, Admin).
- Profilo: riepilogo a sinistra, tabelle per settimana a destra.
- Ogni schermata funziona anche senza JavaScript; nessuno stile inline.

## 2. Biglietto compatto (tutte le schermate con biglietti)

Riferimento di densità: colonna del calendario legacy, due eventi per colonna visibili a 1280 × 900.

Stub colorato:
- Contiene il **titolo** dell'evento (Bricolage 16/700, colore `--kind-ink`, massimo due righe) e sotto l'**orario**
  (Plex Mono 18/600, fine turno 13/400 dopo la freccia).
- Niente etichetta del tipo ("ESAME", "RUSH"…) visibile: il tipo lo dice il colore e resta come testo per screen
  reader.
- Resta il badge "In tasca tua" nello stato mio (stub fantasma con bordo tratteggiato `--color-signal`).
- Altezza: quella del contenuto, padding 12 px. Il vecchio stub fisso da 92 px non c'è più.

Corpo:
- Una sola riga meta: `₳ 200 · 6/10` in Plex Mono 13, colore `--color-muted`.
- Sotto, i quadratini dei posti (14 px, raggio 4) quando i posti sono al massimo 10.
- Stato breve sulla stessa riga quando ci sta: "Concluso", "4 liberi", "Sei dentro".
- Niente data nel biglietto: è già nell'intestazione del giorno.
- Partecipanti come pillole **piene** (vedi §3), poi l'azione ("Prendo il turno" / "Lascio").

Controlli: nello stato mio il contrasto del titolo resta leggibile; con titoli lunghi lo stub va a capo in due righe,
poi c'è l'ellissi.

## 3. Pillole dei partecipanti

- Fondo `--color-raised`, testo `--color-text`, Plex Mono 12/500, raggio pill, altezza 24 px, niente bordo tenue.
- Mia: fondo `--color-signal`, testo `--color-on-signal`.
- Assente: testo barrato, colore `--color-danger`, fondo `--color-danger-bg`.
- Contrasto AA in entrambi i temi; sul display TV le pillole salgono a 16 px di testo.

## 4. Calendario utenti

### Desktop
- Larghezza piena della finestra, con margine laterale di 40 px (non più contenuto a 1360 px).
- Colonne dei giorni da minimo 240 px; con 1920 px si vedono sette colonne senza scorrimento. Sotto quella larghezza
  la griglia scorre in orizzontale solo dentro di sé.
- Il weekend compare solo se ha eventi (decisione D2).
- Intestazione: periodo, "Settimana N", contatore "I tuoi turni", chip W01–W04 su una riga, come la v1.

### Mobile (≤767 px) — soluzione ibrida
- I giorni scorrono in orizzontale col dito con aggancio: ogni giorno occupa l'88% della larghezza e si intravede il
  successivo.
- Sopra resta la barra dei giorni (abbreviazione, numero, pallino se c'è un mio turno, evidenza di oggi) come scorciatoia:
  - un tocco porta al giorno;
  - durante lo scorrimento la barra evidenzia il giorno visibile.
- All'apertura la vista è su oggi, se è nella settimana; altrimenti sul primo giorno.
- Disegnare tre stati: inizio settimana, a metà scorrimento (due giorni parzialmente visibili) e giorno con un mio
  turno.

### Dialog "Settimana N attivata"
Pulsante unico **OK**, non "Annulla".

## 5. Messaggi (conferme ed errori)

- Piccoli, in **alto a destra**: 8 px sotto l'header, 16 px dal bordo destro. Larghezza massima 320 px; su mobile la
  larghezza dello schermo meno 32 px.
- Testo 13 px, padding 8 × 16, raggio 12, icona di stato a sinistra (✓, !, ×) e colori `--color-*-bg` /
  `--color-*`.
- Chiusura: una **×** da 32 px, ben visibile, niente pulsante "Chiudi" testuale.
- Comportamento:
  - le conferme spariscono da sole dopo 4 s;
  - errori e avvisi restano finché non si preme la ×.
- Entrata: scivolano dall'alto in 200 ms; con movimento ridotto compaiono senza animazione.
- Disegnare una conferma, un avviso e un errore impilati, su desktop e su mobile.

## 6. Header e menu utente

- Desktop: logo · Calendario · Admin (se admin) · interruttore tema · **avatar + @login**.
  - Spariscono la voce "Profilo" e il pulsante "Logout".
- Il clic su avatar o nome apre un menu a tendina sotto l'avatar, allineato a destra:
  - voce "Profilo";
  - separatore;
  - "Esci" in colore danger.
  - Larghezza 200 px, fondo `--color-surface`, bordo 1 px, raggio 12, ombra leggera.
- Mobile: header con logo, interruttore tema e avatar; l'avatar apre lo stesso menu. La barra in basso resta
  Calendario / Profilo / Admin.
- Avatar: foto 42 rotonda (32 px nell'header, 56 px nel profilo) con bordo 2 px `--color-signal`. Se la foto manca o non
  si carica: cerchio con le iniziali, come nella v1.
- Disegnare il menu aperto su desktop e su mobile, e un avatar con foto e uno con iniziali.

## 7. Admin Settimane

### Impostazioni compatte
- Desktop: una fascia unica alta circa 130 px, come la toolbar del legacy. Contiene quattro sezioni affiancate:
  - date del pool;
  - settimana attiva;
  - display TV;
  - limite turni per persona.
- In ogni sezione: etichetta 12/700 maiuscola sopra, poi valore e controllo **sulla stessa riga** (per esempio
  `W03 visibile agli utenti [W04 ▾] [Attiva]`).
- Mobile: le impostazioni stanno in un pannello richiudibile "Impostazioni" chiuso di default; nel titolo del pannello
  compare la settimana attiva. Il calendario è subito visibile.

### Settimane
Chip W01–W04 accanto a "Settimana N"; un clic cambia settimana, quella corrente è evidenziata. Al posto della select
c'è il pulsante "Mostra settimana", poi "+ Crea evento" e le azioni distruttive a destra.

### Calendario admin
- Stessa griglia del calendario utenti: larghezza piena, sette colonne sempre visibili (decisione D2), minimo 240 px,
  biglietto compatto del §2.
- Intestazione del giorno allineata alla colonna: nome, data, pulsante "+" (crea evento con il giorno preimpostato) e
  cestino (svuota giorno).
- Biglietto admin:
  - icone modifica ed elimina nello stub;
  - riga meta `₳ · iscritti/posti · presenti`;
  - lista iscritti sempre visibile, una riga compatta per iscritto: login, segmentato Presente/Assente, ×;
  - campo "login intra" con "+".
  - La data e l'ora di iscrizione non si mostrano.
- Mobile: giorni impilati uno sotto l'altro, biglietti orizzontali.
- Creazione e modifica avvengono in dialog: il pannello fisso a destra non c'è più.

## 8. Display TV (1920 × 1080)

Biglietto compatto del §2 senza data, pillole del §3 a 16 px. Le sette colonne e il resto della v1 restano invariati.

## 9. Artboard da aggiornare nel canvas

| Artboard (`project/`) | Modifiche |
|---|---|
| `Alt.dc.html` (fondamenta) | biglietto compatto, pillole, messaggi, menu utente, avatar |
| `Calendar.dc.html` | §2, §3, §4 desktop, §5, §6 |
| `CalendarMobile.dc.html` | §4 mobile ibrido (tre stati), §5, §6 |
| `CalendarMobileDialog.dc.html` | biglietto compatto nel dialog |
| `ConfirmB.dc.html` | verificare l'animazione con il titolo nello stub |
| `Admin.dc.html` | §7 desktop |
| `AdminMobile.dc.html` | §7 mobile |
| `Display.dc.html` | §8 |
| `Profile.dc.html`, `ProfileMobile.dc.html` | §6 (avatar con foto, menu) |
| `Login*`, `Logs`, `Participants`, `Templates`, `TemplateBuilder`, `Whitelist` | solo header (§6) e messaggi (§5) |

Esportare i nuovi PNG in `Baywatchers v2 Design-png/` con lo stesso nome, poi copiarli in
`gestionale-baywatchers-42Firenze/docs/v2/design/screens/`. Aggiornare `docs/v2/design/README.md` e `tokens.css` con i
nuovi valori:
- `--font-ticket-time` (18 px);
- colonna minima 240 px;
- larghezza dei messaggi 320 px;
- × da 32 px;
- menu utente 200 px.

## 10. Criteri di accettazione

- A 1280 × 900, sul calendario utenti, si vedono almeno due biglietti per colonna e cinque giorni.
- A 1920 × 1080 calendario e admin mostrano sette colonne senza scorrimento.
- A 360 px si scorre tra i giorni col dito e si intravede il giorno successivo; la barra dei giorni segue lo
  scorrimento.
- Nessun pulsante "Chiudi" testuale nei messaggi; nessun "Logout" né "Profilo" nella barra desktop.
- Contrasto AA in entrambi i temi su stub, pillole e messaggi.
