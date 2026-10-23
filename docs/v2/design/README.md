# 42 Baywatchers — Design v2

Specifica corrente: [DESIGN-V2.md](DESIGN-V2.md), approvata da Ismail il 23 ottobre 2026.
È la fonte delle correzioni di presentazione dopo M14; M15 non è iniziato.
La v2 prevale sui paragrafi v1 riportati sotto per biglietti compatti, pillole, calendario
mobile, messaggi, menu utente e toolbar admin. Query, regole applicative e form action restano invariate.

- Orari dei biglietti: `--font-ticket-time: 18px`; titolo nello stub, nessuna data ripetuta nel corpo.
- Giorni utenti/admin: minimo 240 px; sul calendario utenti il distacco visivo è ricavato nel padding delle colonne,
  così cinque colonne entrano nei 1200 px utili a una finestra di 1280 px con margini da 40 px.
- Mobile utenti: giorni all'88% con scroll snap, scorciatoie ai giorni, selezione sincronizzata e apertura su oggi (Europe/Rome).
- Messaggi: massimo 320 px, in alto a destra, chiusura × da 32 px; solo i successi scadono dopo 4 secondi.
- Menu utente: popover nativo da 200 px sull'avatar, Profilo/Esci; funziona anche senza JavaScript.
- Impostazioni admin: fascia compatta su desktop; details nativo chiuso inizialmente su mobile. Le chip sostituiscono la select della settimana visualizzata.

I PNG in `screens/` e i sorgenti in `reference/` sono ancora le esportazioni **v1**: i nuovi artboard
non sono stati forniti. Non sono stati sovrascritti o presentati come v2.
La galleria `implemented/` contiene gli screenshot dell'app ed è distinta dal canvas di riferimento.

---

# 42 Baywatchers v2 — Design v1

Design approvato da Ismail il 2026-10-22. È la fonte per il modulo **M14** (PLAN §12): cambia solo `tokens.css`, CSS dei componenti e markup, mai la logica.

Fonte originale: canvas di design (https://claude.ai/artifact/E5g6vAA2HsBf3RZweoghvb). Questa cartella ne è la copia completa: non serve aprire il canvas per implementare.

## 0. Contenuto

| Percorso | Cosa contiene | Come usarlo |
|---|---|---|
| `tokens.css` | Tutti i valori: colori dei due temi, colori dei `kind`, font, scala tipografica, spaziature, raggi, misure del biglietto. | Sostituisce `src/lib/styles/tokens.css`. I nomi esistenti restano (stesso significato, valori nuovi). |
| `fonts/` | Bricolage Grotesque, Instrument Sans, IBM Plex Mono in woff2 (sottoinsiemi latin e latin-ext), `fonts.css`, licenze OFL. | Copiare in `src/lib/styles/fonts/`. Font serviti dall'app: la CSP (`'self'`) non cambia. |
| `screens/` | Le schermate di riferimento in PNG (scala 2×). | Confronto visivo. Sono la verità quando un valore non è scritto qui. |
| `reference/` | Il markup sorgente di ogni schermata (`*.dc.html`), con gli stili inline esatti. | Per leggere un valore preciso (padding, gap, dimensioni). Non sono pagine da copiare: niente stili inline nell'app. Non si aprono da sole nel browser. |
| `animation/` | `animation-b.md` (specifica completa dell'animazione "prendo / lascio il turno") e `conferma-v2.3.2.html` (prototipo funzionante). | Il prototipo si apre da disco. La specifica dice cosa rifare e quali errori evitare. |
| `logo/` | `logo-horizontal.svg`, `logo-stacked.svg`, `logo-icon.svg`. | Copiare in `static/` o `src/lib/assets/`. Sostituiscono `42_Logo.svg.png`. |

`reference/Alt.dc.html` è la pagina "fondamenta" (colori, tipografia, pezzi, biglietto, in tema chiaro e scuro): la prima da leggere. Screenshot: `screens/42-baywatchers-fondamenta.png`.

## 1. Principi

- **Il biglietto è il centro.** Ogni turno è un biglietto con matrice (colore del `kind`) e corpo (superficie), separati da una perforazione. Prendere un turno = staccare la matrice e metterla "in tasca" (animazione B).
- **Arancio segnale = tu.** L'arancio indica solo ciò che riguarda l'utente o lo stato attivo: i tuoi posti, la tua chip, la settimana attiva, il campo attivo, il focus. Non usarlo per decorare.
- **Mono per i numeri.** Orari, posti, Altarian (`₳`), login e codici settimana sono in IBM Plex Mono.
- **Pochi bordi forti.** Bordo da 2 px solo per le cose importanti (settimana attiva, campo attivo, pulsanti secondari, pannello di modifica). Il resto ha bordo da 1 px o nessuno.
- **Una linea arancio da 4 px** in cima a ogni pagina (`--brand-bar`).

## 2. Temi

Due temi con gli stessi ruoli: **scuro ("notte")** e **chiaro ("giorno")**. Tutte le schermate in `screens/` sono in tema scuro; il tema chiaro è in `reference/Alt.dc.html` (proprietà `theme: "light"`) e nei valori di `tokens.css`.

| Ruolo | Variabile | Scuro | Chiaro | Uso |
|---|---|---|---|---|
| Mare | `--color-background` | `#0b1422` | `#f2f4f7` | fondo pagina |
| Schiuma | `--color-surface` | `#121f33` | `#ffffff` | corpo dei biglietti, pannelli, tabelle |
| Sabbia bagnata | `--color-raised` | `#1c2c45` | `#e6eaf0` | disattivati, righe nuove, sfondi secondari |
| Corda | `--color-border` | `#2b3e5c` | `#cfd6df` | bordi, posti liberi |
| Blu notte | `--color-text` | `#eef3fa` | `#0e1a2b` | testo, posti presi |
| Foschia | `--color-muted` | `#9aabc4` | `#4f5d70` | testo secondario |
| Primario | `--color-brand` / `--color-on-brand` | `#ff6a3d` / `#0b1422` | `#0e1a2b` / `#ffffff` | pulsante principale |
| Arancio segnale | `--color-signal` | `#ff6a3d` | `#ff4f1f` | tu, attivo |
| Testo segnale | `--color-signal-text` | `#ff8a63` | `#c2380f` | testo arancio |
| Su segnale | `--color-on-signal` | `#1a0700` | `#1a0700` | testo su fondo arancio |
| Ok | `--color-ok` / `--color-ok-bg` | `#5ee0b5` / `#0f3a33` | `#0b6b50` / `#dcf5ec` | posti liberi, presente, conferme |
| Avviso | `--color-warn` / `--color-warn-bg` | `#ffd36b` / `#3b2f0c` | `#7a5000` / `#fff1cc` | avvisi |
| Pieno | `--color-danger` / `--color-danger-bg` | `#ff8f87` / `#43191a` | `#b4231b` / `#fde4e1` | completo, assente, errori, azioni distruttive |

Colori dei `kind`, uguali nei due temi (fondo matrice / testo matrice):

| `kind` | Etichetta | Fondo | Testo |
|---|---|---|---|
| `exam` | Esame | `#3d3aa8` | `#ffffff` |
| `icebreaker` | Icebreaker | `#f06ba8` | `#1f0612` |
| `rush` | Rush | `#ffcf2e` | `#1f1700` |
| `cluster` | Cluster | `#17a589` | `#03180f` |
| `welcome` | Accoglienza | `#9bd34a` | `#132006` |
| `custom` | Personalizzato / Extra | `#5cc8f0` | `#04202c` |

**Come si sceglie il tema** (deciso da Ismail il 2026-10-22): preferenza di sistema come default, più un interruttore nell'app che la sovrascrive.

- `tokens.css` scrive ogni colore una volta sola con `light-dark(<chiaro>, <scuro>)`. `:root` ha `color-scheme: light dark`, quindi senza scelta segue il sistema.
- L'interruttore scrive un cookie `theme` (`light` o `dark`; assente = sistema). `hooks.server.ts` lo legge e mette `data-theme="light|dark"` su `<html>` nel `transformPageChunk` già usato per Paraglide: il tema giusto arriva con l'HTML, senza lampo. Il cambio sul client aggiorna subito `document.documentElement.dataset.theme` e il cookie.
- Il cookie non è un dato sensibile: `SameSite=Lax`, `Path=/`, durata 1 anno, leggibile dal client. Valori diversi da `light`/`dark` si ignorano.
- `light-dark()` richiede Chrome/Edge 123, Firefox 120, Safari 17.5 (2024). Va bene anche per il browser del display TV; se fosse più vecchio vedrebbe i colori di ripiego del browser: da verificare sul TV reale.
- I tag del log in tema chiaro (proposti nel canvas solo in scuro) sono approvati da Ismail.

**Interruttore** (approvato da Ismail il 2026-10-22, non disegnato nel canvas): pulsante a icona 40 px (sole / luna) nella barra in alto, prima dell'avatar su desktop e prima di "Esci" su mobile, con `aria-label` che dice il tema a cui si passa.
- Alla prima apertura vale il tema del sistema (nessun cookie).
- Finché l'utente non tocca l'interruttore, resta il tema del sistema, anche se il sistema cambia.
- Un clic passa al tema opposto a quello mostrato e lo salva nel cookie; da quel momento resta il tema scelto.
- Nessuna opzione "torna al sistema" (né nel Profilo né altrove).

## 3. Tipografia

Font: **Bricolage Grotesque** (titoli, asse `opsz` 12–96, pesi 500–800), **Instrument Sans** (testo, 400–700), **IBM Plex Mono** (numeri, 400 e 600).

| Nome | Font | Desktop | Note |
|---|---|---|---|
| display | Bricolage 800, `-0.03em`, interlinea 0.95 | 72 px (scala); "Settimana 3" nel calendario è 64 px | mobile 40 px |
| titolo | Bricolage 800, `-0.02em` | 40 px; pagine admin 44 px, profilo 32 px | mobile 26–30 px |
| sezione | Bricolage 700, `-0.01em` | 24 px | giorno nel calendario: numero 30 px |
| corpo | Instrument Sans 400 | 16 px | interlinea 1.5 |
| etichetta | Instrument Sans 700, maiuscolo, `0.06em` | 13 px | 10–12 px nella matrice |
| registro grande | Plex Mono 600 | 26 px | orari sulla matrice |
| registro | Plex Mono 400/600 | 14 px | posti, `₳`, login (11–13 px nelle chip) |

## 4. Componenti

Le misure sono del tema scuro desktop; i colori vengono sempre dalle variabili.

### 4.1 Biglietto (`EventCard`)

Due forme, stessa anatomia: **matrice** (fondo e testo del `kind`) + **perforazione** + **corpo** (`--color-surface`).

- **Verticale** (calendario desktop, colonna del giorno): matrice in alto, alta 92 px, raggio `14px 14px 0 0`, padding `12px 14px 16px`. Dentro: etichetta del `kind` e tag (10 px, maiuscolo) in alto, orario `09:00` 26 px mono + `→ 11:00` 12 px in basso. Corpo: raggio `0 0 14px 14px`, padding 14 px, gap 9 px; titolo Bricolage 16/700; compenso mono 12 px muted; riga dei posti; chip dei partecipanti; pulsante.
- **Orizzontale** (calendario mobile, admin, dialog): matrice a sinistra, larga 88 px (admin 96, dialog 84), raggio `16px 0 0 16px`.
- **Perforazione**: maschere CSS con mezzi fori ogni 10 px, raggio 3 px (bordo morbido fino a 3,6 px). La matrice porta la metà esterna, il corpo quella interna: accostati mostrano fori interi. Classi esatte (`nb`, `nt`, `nr`, `nl`) in `reference/Calendar.dc.html` righe 17–20. La vecchia linea tratteggiata con due tacche non esiste più.
- **Stati**:
  - *libero*: pulsante "Prendo il turno" (pieno, `--color-brand`, alto 40 px, pill);
  - *tuo*: la matrice è vuota e mostra il contorno "in tasca tua" (verticale) o "tuo" (orizzontale): tratteggio 2 px `--color-signal`, fondo `--color-ghost-fill`, testo `--color-signal-text`. Sul lato della perforazione il tratteggio è un gradiente sul passo dei fori (classi `ghost-v`, `ghost-h` in `reference/Calendar.dc.html` righe 21–24): i trattini cadono tra i fori. Nessun bordo arancio sul biglietto. Pulsanti "Lascio" (contorno 2 px `--color-danger`) e "Aggiungi al calendario" (cerchio 40 px);
  - *pieno*: pulsante disattivato "Turno pieno" (`--color-raised`, testo muted), stato "completo" in `--color-danger`;
  - *passato*: tutto il biglietto a `--opacity-muted` (0.5), stato "concluso".
- **Animazione** prendo / lascio: `animation/animation-b.md`. Con `prefers-reduced-motion: reduce` la matrice diventa contorno subito, senza volo.

### 4.2 Posti e contatore

- Un quadrato per posto, 14 px (18 px nelle dimostrazioni), raggio 4 px, gap 3–4 px. Preso = `--color-text`; tuo = `--color-signal`; libero = solo bordo 2 px `--color-border`.
- Oltre 10 posti si mostra solo il numero (es. `12/15`).
- Accanto: stato in mono 11 px: "3 liberi" (`--color-ok`), "completo" (`--color-danger`), "concluso" (muted).
- **Contatore "I tuoi turni"** (calendario, in alto a destra): pannello `--color-surface`, bordo 1 px, raggio 14, etichetta 12 px maiuscola, quadrati per il limite settimanale (presi = signal, liberi = bordo), testo `2/3 · 250 ₳` mono 14/600. È la destinazione del volo della matrice.

### 4.3 Pulsanti

- Pill, raggio 999 px, alti 48 px (40 px dentro i biglietti), testo 14–15 px 700.
- Principale: fondo `--color-brand`, testo `--color-on-brand`.
- Secondario: contorno 2 px `--color-text`, fondo trasparente.
- Distruttivo: contorno 2 px `--color-danger`, testo `--color-danger` (es. "Svuota settimana", "Lascio"). "Elimina tutti gli eventi" è un link sottolineato in `--color-danger`.
- Disattivato: fondo `--color-raised`, testo muted.
- Solo icona: cerchio 40 px, contorno 2 px, `aria-label` obbligatorio.

### 4.4 Navigazione

- **Desktop**: barra 72 px, logo orizzontale alto 20 px a sinistra; a destra Calendario / Profilo / Admin (15 px 600, attivo = testo pieno + linea sotto 3 px `--color-signal`, `aria-current="page"`), poi avatar (cerchio 32 px, bordo 2 px signal, iniziali mono) e `@login` mono 13 px.
- **Admin**: seconda barra di schede Settimane / Template / Partecipanti / Whitelist / Log, stesso stile; a destra "Apri il display TV".
- **Mobile**: barra in alto 60 px (logo, a destra "Esci" o icona display); barra in basso 76 px con 3 voci a icona + etichetta (Calendario, Profilo, Admin solo per admin), voce attiva in signal con linea sopra. Le schede admin scorrono in orizzontale dentro il loro contenitore.

### 4.5 Settimane e giorni (`WeekNav`)

- **Chip settimana** (desktop 112 × 60 px, raggio 12): codice mono 12 px (`W03`) + etichetta 14/700 ("Conclusa", "Attiva", "Non aperta"). Attiva = bordo 2 px signal, fondo surface, codice in signal-text. Non aperta = `--opacity-faint` (0.4). Admin: chip quadrate `W01`…`W04`, selezionata con fondo `--color-text`.
- **Schede giorno mobile** (`role="tablist"`): 5 colonne, alte 68 px, raggio 12; puntino arancio sui giorni con un tuo turno.
- **Intestazione giorno desktop**: numero Bricolage 30/800 + nome 14/700 maiuscolo muted; linea sotto 2 px (`--color-signal` per oggi, con tag "oggi" in mono).
- Weekend: colonne solo se ci sono eventi (D2); l'admin vede sempre 7 giorni.

### 4.6 Chip partecipanti (`ParticipantBadge`)

Pill alta 24–30 px, mono 11–12 px, `@login`. Normale = bordo 1 px; tu = fondo signal, testo on-signal, 600; assente (solo admin) = bordo tratteggiato e testo barrato.

### 4.7 Dialog (`Dialog`)

`<dialog>` nativo. Mobile: foglio dal basso, raggio grande in alto, maniglia. Esempio "Il turno è tuo" (`screens/calendario-mobile-turno-preso.png`): etichetta "✓ turno confermato" in `--color-ok`, titolo, biglietto orizzontale con matrice colorata (qui la matrice resta: è quella appena presa), testo, "Google Calendar" (principale), "Scarica file .ics (Apple, Outlook)" (secondario), "Chiudi" (link).

### 4.8 Messaggi (`Toast` e banner)

Banner con icona, raggio 14, fondo `--color-*-bg`, testo `--color-*`: ok (es. "Ultimo import: 2 template, 31 eventi"), avviso (es. "Esistono già 9 eventi…"), errore. Esito di un'azione su più righe: titolo 700 + righe di dettaglio.

### 4.9 Campi e form

Fondo `--color-background`, bordo 2 px `--color-border`, raggio 12 (10 nei campi piccoli), alti 44 px (40 dentro i pannelli compatti, 52 per il nome del template), etichetta 13/700 sopra. Campo attivo = bordo `--color-signal`. Testi mono (orari, login, numeri) in Plex Mono. Selezione del `kind` = griglia di opzioni con pallino del colore e compenso. Zona di trascinamento CSV = bordo tratteggiato 2 px, icona, testo, pulsante.

### 4.10 Tabelle e liste admin

Contenitore surface, bordo 1 px, raggio 16; intestazioni 12 px maiuscole muted; righe separate da 1 px. Admin settimana: biglietti orizzontali con righe partecipante (`@login` + segmentato "Presente / Assente": presente = `--color-ok-bg`, assente = `--color-danger-bg`) + campo "login intra" + "Aggiungi". Partecipanti: righe espandibili con presenze come quadrati (pieno = presente, rosso barrato = assente). Log: tag tipo azione mono 11/600 con fondo/testo `--color-log-*`, pannello dettaglio con "Prima / Dopo" in `<pre>`.

## 5. Pagine

Larghezza massima contenuto 1360 px, padding laterale 40 px desktop, 16 px mobile.

| Route | Schermate | Note |
|---|---|---|
| `/` (accesso) | `accesso-desktop.png`, `accesso-mobile.png` | Logo compatto grande, frase, "Accedi con l'intra 42 →", biglietti della settimana come anteprima. |
| `/calendar` | `calendario-desktop.png`, `calendario-mobile.png`, `calendario-mobile-turno-preso.png` | Desktop: titolo settimana + contatore + chip settimane, griglia a colonne di biglietti verticali. Mobile: chip settimane, schede giorno, lista di biglietti orizzontali. |
| `/profile` | `profilo-desktop.png`, `profilo-mobile.png` | Avatar con iniziali, 4 riquadri (Turni, Ore, Altarian con bordo signal, Wallet intra), tabelle per settimana con stato (In programma / Partecipato / Non partecipato barrato). Nessuna pagina partecipante (D3). |
| `/display` | `display-tv-1920x1080.png` | Pubblica con token opzionale (D4). Logo compatto, "Settimana 3", orologio grande mono, 5 colonne, piè di pagina "Aggiornato in tempo reale" (pallino ok). |
| `/admin` | `admin-settimana-desktop.png`, `admin-settimana-mobile.png` | Riquadri: date del pool, settimana attiva (bordo signal), display TV, turni per persona. Giorni richiudibili con biglietti orizzontali e presenze. Pannello "Nuovo evento" a destra (desktop) o pulsante "+ Nuovo evento" (mobile). |
| `/admin/templates` | `admin-template-e-import-csv.png` | Card template con barra di colori dei `kind`, "Sovrascrivi", "Applica a W*", pannello "Importa da CSV". |
| `/admin/templates/new` | `admin-nuovo-template.png` | Barra superiore con "← Template" e "bozza non salvata", 5 colonne giorno, pannello di modifica evento con bordo signal, piè di pagina con totali e "Salva template". |
| `/admin/participants` | `admin-partecipanti.png` | Ricerca, "CSV sintetico" / "CSV dettagliato", tabella espandibile. |
| `/admin/whitelist` | `admin-whitelist.png` | "Aggiungi login" (textarea con bordo signal), esiti ok/avviso, griglia di login a 2 colonne con "aggiunto adesso" evidenziato in ok. |
| `/admin/logs` | `admin-log.png` | Filtri, banner "3 nuove azioni da quando hai aperto la pagina · mostra", tabella, pannello dettaglio, paginazione. |

Le schermate dei dati usano esempi (nomi, numeri, "[Nome Cognome]", "[indirizzo dell'app]"): i testi veri vengono da Paraglide e dal DB.

**Larghezze.** Disegnate: 390 px (mobile) e 1440 px (desktop). Regola per M14:
- sotto `--bp-md` (768 px): layout mobile;
- da 768 px: layout desktop; la griglia della settimana scorre in orizzontale dentro il suo contenitore se non ci sta (PLAN §12), la pagina mai;
- verificare a 360, 768 e 1280 px (PLAN M14).

## 6. Accessibilità

- Contrasto AA in entrambi i temi. Per questo il testo arancio usa `--color-signal-text`, non `--color-signal`, e il focus in tema chiaro è `#c2380f`.
- Focus visibile ovunque: contorno `--focus-width` (3 px) `--color-focus`, offset 3 px.
- I quadrati dei posti e il contorno "in tasca tua" sono decorativi (`aria-hidden`): lo stato è anche nel testo ("3 liberi", "completo") e nel nome accessibile del pulsante.
- Navigazione con `aria-current="page"`; schede giorno con `role="tablist"`; chip settimane con `aria-current`.
- `prefers-reduced-motion: reduce`: niente strappo, volo, scintille (vedi `animation/animation-b.md`).
- Target tattili almeno 40 px.

## 7. Ordine di lavoro M14

1. Font (`fonts/`) e `tokens.css` in `src/lib/styles/`; cookie `theme` e `data-theme` su `<html>` dal server (§2); `base.css` con colori, font e focus nuovi. Logo SVG nella barra. Test: unit sulla lettura del cookie (valori validi, assente, non validi), e2e che con il cookie `light` la pagina arriva già chiara.
2. Navigazione desktop e mobile (§4.4).
3. `EventCard` con le due forme, la perforazione, gli stati (§4.1) e i posti (§4.2). Poi `WeekNav`, `ParticipantBadge`, `Dialog`, `Toast`.
4. Pagine nell'ordine: calendario, accesso, profilo, display, admin settimana, template, nuovo template, partecipanti, whitelist, log.
5. Animazione B (`animation/`), per ultima, con test e2e che controlla lo stato finale (non i fotogrammi).
6. Screenshot di riferimento aggiornati a 360 / 768 / 1280 px e confronto con `screens/`.

Regole: nessun valore sparso nei componenti (solo variabili di `tokens.css`); nessuna modifica alla logica, alle query o alle form action; nessuna nuova dipendenza.

## 8. Punti aperti

Nessuno.
