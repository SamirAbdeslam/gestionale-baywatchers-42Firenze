# Gestionale Baywatchers v2 — Piano di refactor

> Documento di riferimento unico per chi esegue il refactor (agent esterno o persona).
> Leggilo **tutto** a inizio di ogni sessione, poi leggi l'ultima voce di `docs/v2/SESSIONS.md`.
> Branch di lavoro: `v2.0.0`. Versione in sviluppo: `2.2.0` (SemVer, §20, §21). Ultima release Flask: tag `v1.5.24` su `main`.

---

## 0. Indice

1. Regole di lavoro (obbligatorie)
2. Obiettivo e perimetro
3. Decisioni da confermare
4. Stack e dipendenze consentite
5. Struttura del repository
6. Configurazione (variabili d'ambiente)
7. Modello dati (Postgres)
8. Specifica funzionale (comportamento da riprodurre)
9. Sicurezza: requisiti
10. Real-time (SSE)
11. i18n
12. UI e design
13. Test
14. CI
15. Docker, nginx, deploy locale
16. Dati fittizi e import del DB legacy
17. Moduli (ordine di esecuzione)
18. Bug legacy da NON riprodurre
19. Stato dei moduli
20. Versione 2.1.0: correzioni dell'audit e nuove funzioni
21. Versione 2.2.0: archivio piscine, riepilogo animato e iscrizioni con QR

---

## 1. Regole di lavoro (obbligatorie)

### 1.1 Flusso di una sessione
1. Leggi questo file per intero e l'ultima voce di `docs/v2/SESSIONS.md`.
2. Lavora **solo** sul primo modulo non completato della tabella §19, salvo istruzioni diverse scritte in `SESSIONS.md` da Ismail.
3. A fine sessione aggiungi una voce in `docs/v2/SESSIONS.md` (formato in quel file), anche se il modulo non è finito.
4. Aggiorna solo la colonna "Stato" della tabella §19. Non modificare altre parti di questo piano: se qualcosa è sbagliato o manca, scrivilo in `SESSIONS.md` sotto "Domande / blocchi" e fermati.

### 1.2 Quando fermarsi e chiedere
Fermati, scrivi il problema in `SESSIONS.md` e chiedi a Ismail, **senza** cercare alternative per conto tuo, se:
- il piano è ambiguo o contraddittorio su un punto che cambia il comportamento;
- una decisione in §3 è ancora "DA CONFERMARE" e il modulo corrente ne dipende;
- serve una dipendenza non elencata in §4.3;
- serve un permesso, una password, una credenziale, `sudo`, un login (`gh auth`, 42 OAuth, ecc.);
- un comando fallisce per motivi di ambiente (Docker, rete, permessi) e non per un bug del tuo codice;
- la CI resta rossa dopo due tentativi di correzione sullo stesso problema.

### 1.3 Git
- Lavora sempre sul branch `v2.0.0`. Non creare altri branch, worktree o tag senza richiesta esplicita.
- Commit piccoli, in inglese, formato Conventional Commits (`feat(registrations): ...`, `fix(auth): ...`, `test: ...`, `chore(ci): ...`).
- Usa l'identità git già configurata nel repo. Non modificarla.
- **Vietato** inserire nei commit, nelle PR o nei commenti qualunque riferimento a Claude, AI, assistenti o generatori (niente `Co-Authored-By`, niente footer "Generated with ...").
- **Push**: solo a modulo completato e con tutti i controlli locali verdi (§14.3). Dopo il push verifica la CI (`gh run watch --exit-status`). Se è rossa, correggi prima di iniziare il modulo successivo.
- Mai `git push --force`, mai riscrivere la storia già pubblicata.
- Non toccare `main` e il tag `v1.5.24`.

### 1.4 Codice
- La cartella `legacy/` è **sola lettura**: serve come riferimento. Si cancella solo nel modulo M15 e solo dopo conferma scritta di Ismail.
- Scrivi il minimo codice che soddisfa la specifica: niente astrazioni "per il futuro", niente classi o interfacce con una sola implementazione, niente config per valori che non cambiano.
- TypeScript `strict`. Niente `any` se non motivato da un commento.
- Ogni regola di business sta in `src/lib/server/domain/*` come funzione testabile; le route chiamano il dominio, non contengono logica.
- Ogni stringa visibile all'utente passa da i18n (§11) fin dal primo modulo.
- I commenti nel codice sono in inglese, brevi e spiegano il "perché".

---

## 2. Obiettivo e perimetro

Riscrivere il gestionale Flask (`legacy/app.py`, ~3200 righe) in **SvelteKit + Postgres**, con parità funzionale (§8), sicurezza corretta (§9) e una UI responsive web e mobile nella stessa web app (§12).

### 2.1 Dentro il perimetro
HTTPS locale su porta 8443 con certificato autofirmato e redirect HTTP da porta 8080 (§15). Login 42, calendario utente, iscrizioni/disiscrizioni, display pubblico, pannello admin (eventi, settimane, date pool, limite eventi), presenze, whitelist, template settimane (builder, applicazione, import CSV), riepilogo partecipanti ed export CSV, profilo utente, log di audit con aggiornamento live, download `.ics` per evento, aggiornamenti real-time, i18n it/en/fr (en/fr alla fine).

### 2.2 Fuori dal perimetro (rimossi)
- Notifiche push (VAPID, service worker, `notifications.py`, APScheduler, tabelle `push_subscriptions`, `scheduled_notifications`, `user_notification_preferences`, route `/api/push/*`, `/api/vapid-public-key`, `/api/notifications/preferences`, `/sw.js`).
- Webhook di deploy (`/webhook`, `deployer/`).
- Cloudflare Tunnel (`cloudflared`).
- `reset_display_week.py`: la logica vive nell'app (§8.6).
- Feed `.ics` personale descritto in `legacy/CALENDAR_SETUP.md`: non è mai stato implementato. Rientra in 2.1.0 come M22, solo dopo la messa in produzione (§20.6).
- Lista d'attesa sugli eventi pieni: valutata e rimandata. Le sostituzioni restano fuori dal sito (Slack o a voce, D1).

---

## 3. Decisioni da confermare

Ismail deve confermare queste decisioni prima del modulo indicato. Finché lo stato è "DA CONFERMARE", il modulo che ne dipende non si inizia.

| ID | Decisione | Motivo / note | Serve per | Stato |
|---|---|---|---|---|
| D1 | La capienza di un evento conta **tutte** le iscrizioni, anche quelle segnate assenti. Il badge "iscritti/posti" mostra lo stesso numero (es. 5/5 anche con un assente). | Quando un utente viene segnato assente l'evento è già iniziato; la sostituzione si gestisce fuori dal sito. Il legacy mostrava solo i presenti e creava un'incoerenza tra badge e controllo del server. | M5 | CONFERMATA |
| D2 | `weekday` ammesso 1–7 come oggi (l'admin può creare eventi nel weekend). Calendario utente e display mostrano sempre Lunedì–Venerdì e aggiungono le colonne Sabato e/o Domenica **solo se** la settimana visualizzata ha eventi in quel giorno. Il pannello admin mostra sempre tutti e 7 i giorni. | Oggi non ci sono eventi nel weekend, ma se l'admin ne crea uno deve essere visibile (il legacy lo nascondeva). | M7, M8 | CONFERMATA |
| D3 | La pagina `/participants/<id>` viene eliminata. | Era pubblica senza login, nessun link dell'app ci portava, e i dati sono già nel calendario. | M7 | CONFERMATA |
| D4 | Il display `/display` resta in sola lettura e mostra i login dei presenti. Se la variabile `DISPLAY_TOKEN` è impostata, l'URL deve contenere `?token=<valore>` (così la TV funziona con un link unico e chi non ha il link non vede nulla); se è vuota, il display è pubblico. | Pensato per la TV della scuola con accesso via URL. | M8 | CONFERMATA |
| D5 | Admin = utente con `staff? = true` nel profilo `/v2/me` dell'API 42 **oppure** login presente nell'array `ADMIN_LOGINS` del file `src/lib/server/admins.ts` (valore iniziale `['igilani']`). L'array è volutamente nel codice e non in una variabile d'ambiente o nella UI: solo chi modifica il codice può aggiungere admin. Il ruolo si ricalcola a ogni login e si legge dal DB a ogni richiesta. | Il legacy aveva la stessa lista (`ADMIN_WHITELIST`) dentro `app.py`; ora sta in un file dedicato, facile da trovare. | M2 | CONFERMATA |

| D6 | Il login è consentito solo agli utenti 42 che hanno il campus **42 Firenze** tra i loro `campus_users` (profilo `/v2/me`). Vale anche per lo staff: `staff? = true` di un altro campus non entra e non diventa admin. I login in `ADMIN_LOGINS` entrano sempre. L'id del campus è la costante `FIRENZE_CAMPUS_ID = 52` in `src/lib/server/auth/oauth42.ts` (campus "Florence", verificato dall'API 42 sul profilo `igilani`). | Dall'audit di 2.0.0: `staff?` vale per tutti i campus del mondo, quindi lo staff di qualunque campus diventava admin di questo sito, e qualunque studente 42 poteva vedere il calendario con i login degli iscritti. | M17 | CONFERMATA |
| D7 | Nei template **non** si salva più la data dell'evento: si toglie il campo dal builder, l'import CSV ignora la colonna `Data`/`Date` e la colonna `template_events.event_date` si elimina con una migrazione. Le date degli eventi creati da un template derivano dal pool, come oggi. | Oggi la data si chiede e poi non si usa (§8.9 punto 5). Copiarla invece è sbagliato: un template si riusa nei pool successivi, e una data assoluta di un pool vecchio creerebbe eventi già "Passati". | M17 | CONFERMATA |
| D8 | La piscina corrente resta in `settings` e nelle tabelle di lavoro. La fase "finita" si calcola in automatico (fine passata e nessun evento oltre la fine) ma è solo una visualizzazione: **la pulizia dei dati è sempre manuale** con "Chiudi piscina", che salva prima l'archivio. | Lo staff deve poter correggere le presenze dopo la fine; nessun dato sparisce senza un'azione dello staff. | M23 | CONFERMATA |
| D9 | Lo storico delle piscine sta nello stesso Postgres (`pools`, `pool_entries`, §21.1). Le piscine vecchie si importano dal `detailed.csv` attuale (pochi file, una tantum). | Una piscina pesa meno di 1 MB; il CSV scaricato alla chiusura resta la copia esterna. | M23, M24 | CONFERMATA |
| D10 | Il riepilogo non ha classifiche né percentili tra studenti: solo i propri dati, il proprio contributo in % sul totale della piscina e i totali della piscina senza nomi. | Niente competizione. | M25 | CONFERMATA |
| D11 | Chi si iscrive con il QR finisce in una **lista d'attesa**; lo staff approva (anche "Approva tutti") o rifiuta. | Un QR fotografato e girato in chat non basta per entrare. | M26 | CONFERMATA |
| D12 | Dipendenza `uqr` per generare il QR. | Approvata da Ismail. | M26 | CONFERMATA |
| D13 | Nella fase "in arrivo" il countdown sta in cima a `/calendar` e il calendario resta sotto (iscrizioni anticipate possibili come oggi); nelle fasi "nessuna piscina" e "finita" in cima c'è il riepilogo. | Non toglie funzioni esistenti; modificabile da Ismail dopo il report. | M25 | CONFERMATA |

Le altre differenze rispetto al legacy sono correzioni di bug (§18) e non richiedono conferma.

---

## 4. Stack e dipendenze consentite

### 4.1 Runtime e strumenti
| Cosa | Scelta | Note |
|---|---|---|
| Runtime | Node.js 24 LTS | Fissato in `.nvmrc` e `package.json#engines`. |
| Package manager | pnpm 10 via Corepack | `packageManager` in `package.json`. Lockfile committato. |
| Framework | SvelteKit 3 + Svelte 5 (runes) | `@sveltejs/adapter-node` 6. |
| Linguaggio | TypeScript 6.0.x, strict | Non TypeScript 7: SvelteKit 3, `svelte-check` e `typescript-eslint` supportano al massimo la 6 (`typescript-eslint` richiede `<6.1.0`). |
| DB | PostgreSQL 17 | Container `postgres:17-alpine`. |
| ORM e migrazioni | Drizzle ORM + drizzle-kit | Driver `postgres` (postgres.js). Migrazioni SQL generate e committate in `drizzle/`. |
| Validazione | Zod 4 | Per form action, query string e import. |
| OAuth | Client scritto a mano con `fetch` e `node:crypto`, nessuna libreria | `arctic` è stato rimosso: deprecato su npm il 2026-07 ("Package no longer supported"), nessuna versione successiva. Sessioni scritte a mano (§9.2). Nessuna libreria auth "tutto incluso". |
| i18n | Paraglide JS 2 (inlang) | Locale base `it`. |
| `.ics` | `ical-generator` | |
| Test | Vitest, Playwright | |
| Lint/format | ESLint (flat config, `eslint-plugin-svelte`, `typescript-eslint`), Prettier (`prettier-plugin-svelte`), `svelte-check` | |
| Dati fittizi | `@faker-js/faker` | Seed fisso. |
| Lettura SQLite legacy | `better-sqlite3` | Solo in `scripts/`, devDependency. |

### 4.2 Versioni
Al bootstrap (M0) installa con `pnpm add -E` (versioni esatte) ogni pacchetto alla **major indicata in §4.1**, con l'ultima minor/patch stabile di quella major che rispetta le peer dependency degli altri pacchetti dello stack. Per i pacchetti senza major indicata usa l'ultima release stabile (mai `next`, `beta`, `rc`, `canary`). Annota le versioni in `SESSIONS.md`. Gli aggiornamenti successivi si fanno solo con un commit dedicato `chore(deps): ...`; il passaggio a una major diversa da quella di §4.1 richiede conferma di Ismail.

### 4.3 Dipendenze consentite
Solo quelle elencate in §4.1, più i loro plugin ufficiali (`@sveltejs/*`, `@types/*`, `@playwright/test`, `drizzle-kit`, `tsx`). Qualunque altra dipendenza richiede conferma di Ismail (§1.2). In particolare **non** usare: framework CSS (Bootstrap, Tailwind), librerie di componenti UI, librerie per toast/modali/date picker, `moment`, `lodash`, Socket.IO.

---

## 5. Struttura del repository

```
.
├── legacy/                      # Flask v1, sola lettura (spostato con git mv in M0)
├── docs/v2/
│   ├── PLAN.md                  # questo file
│   ├── SESSIONS.md              # diario delle sessioni
│   └── design/                  # design v1: token, font, schermate, specifiche UI (§12)
├── drizzle/                     # migrazioni SQL generate da drizzle-kit
├── messages/                    # it.json, en.json, fr.json (Paraglide)
├── nginx/nginx.conf
├── scripts/
│   ├── legacy/legacy-schema.sql # schema SQLite legacy, copiato da legacy/app.py:init_db
│   ├── legacy/make-fake-db.ts   # genera un calendar.db legacy fittizio
│   ├── import-legacy.ts         # importa un calendar.db legacy in Postgres
│   ├── seed.ts                  # popola Postgres con dati fittizi per sviluppo
│   └── backup.sh                # pg_dump (M15)
├── src/
│   ├── app.d.ts
│   ├── app.html
│   ├── hooks.server.ts          # init (migrazioni), sessione, guard default-deny, header
│   ├── lib/
│   │   ├── components/          # componenti Svelte riusabili
│   │   ├── styles/              # tokens.css, base.css
│   │   ├── paraglide/           # generato, in .gitignore
│   │   └── server/
│   │       ├── env.ts           # lettura e validazione env con Zod
│   │       ├── admins.ts        # ADMIN_LOGINS hardcoded (D5)
│   │       ├── db/{index.ts,schema.ts}
│   │       ├── auth/{session.ts,oauth42.ts,guards.ts}
│   │       ├── realtime/bus.ts
│   │       └── domain/
│   │           ├── dates.ts         # pool, settimane, date concrete, isPassed
│   │           ├── kinds.ts         # tipi evento, preset, inferenza da titolo
│   │           ├── settings.ts
│   │           ├── events.ts
│   │           ├── registrations.ts
│   │           ├── whitelist.ts
│   │           ├── templates.ts
│   │           ├── csv.ts           # parse/scrittura CSV
│   │           ├── reports.ts       # riepilogo e export
│   │           ├── display.ts       # avanzamento automatico display_week
│   │           ├── ics.ts
│   │           └── audit.ts
│   └── routes/                  # vedi §8.1
├── static/                      # favicon, logo 42, badge
├── tests/{unit,integration,e2e}/
├── .github/workflows/ci.yml
├── compose.yaml                 # stack locale completo: postgres + app + nginx
├── compose.dev.yaml             # solo postgres per sviluppo
├── Dockerfile
├── .env.example
├── .nvmrc
└── README.md                    # riscritto in M15
```

Regola: niente file oltre a questi senza motivo. Se ne serve uno nuovo, spiega il perché nella voce di `SESSIONS.md`.

---

## 6. Configurazione (variabili d'ambiente)

Tutte lette e validate in `src/lib/server/env.ts` con Zod all'avvio. Se una variabile obbligatoria manca, l'app non parte e mostra un errore chiaro. Il file `.env.example` le elenca tutte con un commento.

| Variabile | Obbligatoria | Esempio | Uso |
|---|---|---|---|
| `DATABASE_URL` | sì | `postgres://bay:bay@localhost:5432/baywatchers` | Connessione Postgres. |
| `ORIGIN` | sì, build e runtime | `https://localhost:8443` | Origine pubblica senza percorso, query o frammento. La build la incorpora in `kit.paths.origin`; a runtime serve per cookie e redirect OAuth. I due valori devono coincidere. |
| `FT_CLIENT_ID` | sì in produzione | | App OAuth 42. |
| `FT_CLIENT_SECRET` | sì in produzione | | App OAuth 42. |
| `AUTH_DEV_LOGIN` | no | `true` | Abilita il login di sviluppo (§9.3). Vietato fuori da localhost. |
| `DISPLAY_TOKEN` | no | stringa casuale di almeno 24 caratteri | Se impostata, `/display` richiede `?token=` uguale (D4, §8.6). |
| `DISPLAY_REDIRECT_URL` | no | `https://monitoring.42firenze.it/tv/clusters.html` | Se impostata, il display reindirizza qui dopo `DISPLAY_REDIRECT_SECONDS` (§8.6). |
| `DISPLAY_REDIRECT_SECONDS` | no | `30` | Default 30. |
| `TZ` | sì | `Europe/Rome` | Fuso orario del processo Node. Tutte le regole su date e orari usano Europe/Rome. |
| `ADDRESS_HEADER` | in compose | `X-Forwarded-For` | adapter-node: IP del client dietro nginx. |
| `XFF_DEPTH` | in compose | `1` | adapter-node. |
| `BODY_SIZE_LIMIT` | no | `2M` | Limite upload (import CSV). |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | in compose | | Container Postgres. |

Costanti 42 nel codice (non configurabili): authorize `https://api.intra.42.fr/oauth/authorize`, token `https://api.intra.42.fr/oauth/token`, profilo `https://api.intra.42.fr/v2/me`, scope `public`. Redirect URI: `${ORIGIN}/auth/callback`.

Documentazione API 42: https://api.intra.42.fr/apidoc (serve il login 42 per leggerla). Campi di `/v2/me` usati dall'app, gli stessi letti dal legacy (`legacy/app.py:714`): `id`, `login`, `email`, `displayname`, `image.link`, `wallet`, `staff?`. Se un campo manca o ha un tipo diverso, il callback usa questi default: `email` `''`, `displayname` = `login`, `image.link` `''`, `wallet` `0`, `staff?` `false`. Gli stessi campi vanno simulati nei test con una risposta finta, mai chiamando l'API reale in CI.

Admin hardcoded (D5): `src/lib/server/admins.ts` esporta `export const ADMIN_LOGINS: readonly string[] = ['igilani'];` con un commento che spiega che è intenzionalmente nel codice. Il confronto è case-insensitive.

---

## 7. Modello dati (Postgres)

Schema in `src/lib/server/db/schema.ts`. Tutti i timestamp sono `timestamptz`. Nomi tabella e colonna in `snake_case`.

### 7.1 Enum
- `user_role`: `user`, `admin`.
- `event_kind`: `exam`, `icebreaker`, `rush`, `cluster`, `welcome`, `custom`.

### 7.2 Tabelle

**`users`**
| Colonna | Tipo | Vincoli |
|---|---|---|
| `id` | `serial` | PK |
| `intra_id` | `integer` | `NOT NULL UNIQUE` |
| `login` | `text` | `NOT NULL UNIQUE`, `CHECK (login = lower(login))` |
| `email` | `text` | |
| `display_name` | `text` | |
| `image_url` | `text` | |
| `wallet` | `integer` | `NOT NULL DEFAULT 0` (valore dall'API 42 al login) |
| `role` | `user_role` | `NOT NULL DEFAULT 'user'` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `last_login_at` | `timestamptz` | |

**`sessions`**
| Colonna | Tipo | Vincoli |
|---|---|---|
| `id` | `text` | PK, SHA-256 esadecimale del token del cookie |
| `user_id` | `integer` | `NOT NULL`, FK `users.id ON DELETE CASCADE` |
| `expires_at` | `timestamptz` | `NOT NULL` |

**`settings`** (una sola riga)
| Colonna | Tipo | Vincoli |
|---|---|---|
| `id` | `smallint` | PK, `CHECK (id = 1)`, default 1 |
| `pool_start` | `date` | null = date non impostate |
| `pool_end` | `date` | |
| `active_week` | `smallint` | `NOT NULL DEFAULT 1`, `CHECK (active_week BETWEEN 1 AND 4)` |
| `display_week` | `smallint` | `NOT NULL DEFAULT 1`, `CHECK (display_week BETWEEN 1 AND 4)` |
| `max_events_per_user` | `smallint` | `NOT NULL DEFAULT 0`, `CHECK (max_events_per_user >= 0)`. 0 = illimitato |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

La migrazione iniziale inserisce la riga `id = 1`.

**`events`**
| Colonna | Tipo | Vincoli |
|---|---|---|
| `id` | `serial` | PK |
| `title` | `text` | `NOT NULL`, lunghezza 1–120 |
| `description` | `text` | `NOT NULL DEFAULT ''`, max 500 |
| `kind` | `event_kind` | `NOT NULL DEFAULT 'custom'` |
| `week` | `smallint` | `NOT NULL`, `CHECK (week BETWEEN 1 AND 4)` |
| `weekday` | `smallint` | `NOT NULL`, `CHECK (weekday BETWEEN 1 AND 7)`. 1 = lunedì, ISO 8601 |
| `event_date` | `date` | null = data derivata dal pool (§8.2) |
| `start_time` | `time` | `NOT NULL` |
| `end_time` | `time` | `NOT NULL`, `CHECK (end_time > start_time)` |
| `max_slots` | `integer` | `NOT NULL DEFAULT 10`, `CHECK (max_slots >= 1)` |
| `compensation` | `integer` | `NOT NULL DEFAULT 0`, `CHECK (compensation >= 0)` |
| `created_at`, `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

Indice: `(week, weekday, start_time)`.
**Nessuna** colonna `registered`: il conteggio si calcola sempre da `registrations`.

**`registrations`**
| Colonna | Tipo | Vincoli |
|---|---|---|
| `id` | `serial` | PK |
| `event_id` | `integer` | `NOT NULL`, FK `events.id ON DELETE CASCADE` |
| `participant_login` | `text` | `NOT NULL`, `CHECK (participant_login = lower(participant_login))` |
| `attended` | `boolean` | `NOT NULL DEFAULT true` |
| `registered_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

Vincoli: `UNIQUE (event_id, participant_login)`. Indice su `participant_login`.
Il partecipante è identificato dal **login**, non da una FK su `users`, perché l'admin può iscrivere un login che non ha mai fatto accesso (§8.5.4).

**`week_templates`**
| Colonna | Tipo | Vincoli |
|---|---|---|
| `id` | `serial` | PK |
| `name` | `text` | `NOT NULL`, 1–120 |
| `description` | `text` | `NOT NULL DEFAULT ''` |
| `target_week` | `smallint` | `NOT NULL`, `CHECK (target_week BETWEEN 1 AND 4)` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

**`template_events`**
Stesse colonne di `events` per `title`, `description`, `kind`, `weekday`, `start_time`, `end_time`, `max_slots`, `compensation` (stessi vincoli), più `id serial PK` e `template_id integer NOT NULL` FK `week_templates.id ON DELETE CASCADE`. Niente `week`: la settimana è `target_week` del template. Nessuna data assoluta (`event_date`): le date degli eventi applicati derivano dal pool (D7).

**`whitelist`**
| Colonna | Tipo | Vincoli |
|---|---|---|
| `id` | `serial` | PK |
| `login` | `text` | `NOT NULL UNIQUE`, `CHECK (login = lower(login))` |
| `added_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

**`action_logs`**
| Colonna | Tipo | Vincoli |
|---|---|---|
| `id` | `bigserial` | PK |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `actor_user_id` | `integer` | FK `users.id ON DELETE SET NULL` |
| `actor_login` | `text` | `NOT NULL` |
| `action_type` | `text` | `NOT NULL` (valori in §8.10) |
| `description` | `text` | `NOT NULL` |
| `ip_address` | `text` | |
| `user_agent` | `text` | max 200 caratteri (troncato) |
| `resource_type` | `text` | |
| `resource_id` | `text` | |
| `old_value` | `jsonb` | |
| `new_value` | `jsonb` | |

Indici: `created_at DESC`, `actor_login`, `action_type`.

### 7.3 Regole trasversali
- Login sempre in minuscolo, con `trim()`, in input e nel DB.
- Titoli e descrizioni: si applica "prima lettera maiuscola, resto invariato" (legacy `capitalize_event_title`, `legacy/app.py:21`), come funzione `capitalizeFirst` in `domain/kinds.ts`.
- Ogni azione che scrive sul DB gira in **una sola transazione**, che include la riga di `action_logs`. La pubblicazione SSE (§10) avviene **dopo** il commit.

---

## 8. Specifica funzionale

Il riferimento è il codice legacy citato con `legacy/app.py:<riga>`. In caso di conflitto tra questa sezione e il codice legacy vale questa sezione.

### 8.1 Mappa delle route

| Legacy | v2 | Accesso | Note |
|---|---|---|---|
| `GET /` | `/` | pubblico | Landing. Se loggato, redirect a `/calendar`. |
| `GET /login` | `GET /auth/login` | pubblico | Avvia OAuth 42. |
| `GET /callback` | `GET /auth/callback` | pubblico | Callback OAuth. |
| `GET /logout` | `POST /auth/logout` | loggato | Diventa POST (protezione CSRF). |
| — | `GET/POST /auth/dev` | solo con `AUTH_DEV_LOGIN=true` | §9.3. |
| `GET /calendar` | `/calendar?week=N` | loggato | §8.4. |
| `POST /register/<id>` | action `?/register` su `/calendar` | loggato | §8.5.1. |
| `POST /unregister/<id>` | action `?/unregister` su `/calendar` | loggato | §8.5.2. |
| `GET /event/<id>/calendar.ics` | `GET /events/[id]/calendar.ics` | loggato | §8.12. |
| `GET /display` | `/display` | pubblico, oppure con `?token=` se `DISPLAY_TOKEN` è impostata (D4) | §8.6. |
| `GET /participants/<id>` | eliminata (D3) | — | |
| `GET /user/profile` | `/profile` | loggato | §8.11. |
| `GET /admin` | `/admin?week=N` | admin | §8.7. |
| `POST /admin/set_pool_dates` | action `?/setPoolDates` su `/admin` | admin | |
| `POST /set_active_week/<w>` | action `?/setActiveWeek` | admin | |
| `POST /set_max_events_per_user` | action `?/setMaxEvents` | admin | |
| `POST /add_event` | action `?/createEvent` | admin | Legacy senza controllo (§18). |
| `POST /edit_event/<id>` | action `?/updateEvent` | admin | |
| `POST /delete_event/<id>` | action `?/deleteEvent` | admin | Legacy senza controllo (§18). |
| `POST /admin/delete_day_events/<w>/<d>` | action `?/deleteDayEvents` | admin | |
| `POST /admin/delete_week_events/<w>` | action `?/deleteWeekEvents` | admin | |
| `POST /admin/delete_all_events` | action `?/deleteAllEvents` | admin | |
| `POST /admin/add_participant/<id>` | action `?/addParticipant` | admin | |
| `POST /admin_unregister/<id>/<name>` | action `?/removeParticipant` | admin | Legacy senza controllo (§18). |
| `POST /admin/mark_absent/...` | action `?/setAttendance` con `attended=false` | admin | |
| `POST /admin/mark_present/...` | action `?/setAttendance` con `attended=true` | admin | |
| `GET /admin/whitelist` | eliminata | — | Template `whitelist.html` mancante nel legacy (500). La whitelist sta in `/admin/whitelist`. |
| `POST /admin/whitelist/add` | `/admin/whitelist` action `?/add` | admin | |
| `POST /admin/whitelist/remove/<id>` | `/admin/whitelist` action `?/remove` | admin | |
| `GET /create_template` | `/admin/templates/new` | admin | Builder. |
| `POST /save_template` | action `?/save` su `/admin/templates/new` | admin | |
| `POST /apply_template/<id>` | `/admin/templates` action `?/apply` | admin | |
| `POST /delete_template/<id>` | `/admin/templates` action `?/delete` | admin | |
| `POST /import_csv_templates` | `/admin/templates` action `?/importCsv` | admin | |
| `GET /download_template_csv` | `GET /admin/templates/example.csv` | admin | |
| `GET /admin/participants_summary` | `/admin/participants` | admin | §8.9. |
| `GET /admin/download_all_participants_csv` | `GET /admin/participants/summary.csv` | admin | |
| `GET /admin/download_all_participants_detailed_csv` | `GET /admin/participants/detailed.csv` | admin | |
| `GET /admin/download_participant_csv/<name>` | `GET /admin/participants/[login].csv` | admin | |
| `GET /admin/logs` | `/admin/logs` | admin | §8.10. |
| `GET /admin/logs/download` | `GET /admin/logs.csv` | admin | |
| `GET /health` | `GET /healthz` | pubblico | `{ status: 'ok' }` 200 se il DB risponde a `SELECT 1`, altrimenti 503 `{ status: 'error' }`, senza dettagli. |
| — | `GET /api/stream` | pubblico con filtro (§10) | SSE. |

La pagina admin può essere divisa in sotto-pagine (`/admin`, `/admin/whitelist`, `/admin/templates`, `/admin/participants`, `/admin/logs`) per renderla usabile su mobile. Le action restano sulla pagina che mostra i dati su cui agiscono.

### 8.2 Pool, settimane e date (`domain/dates.ts`)

- Un pool dura **4 settimane**, numerate 1–4.
- `pool_start` è il primo giorno della settimana 1. Non deve essere obbligatoriamente un lunedì: il calcolo legacy somma giorni senza allineare (`legacy/app.py:43`). Mantieni questo comportamento.
- Data concreta di un evento: se `event_date` non è null si usa quella; altrimenti `pool_start + 7*(week-1) + (weekday-1)` giorni. Se `pool_start` è null, la data concreta è null.
- `isPassed(concreteDate, endTime, now)`: false se `concreteDate` è null; altrimenti true se `now` (Europe/Rome) è **strettamente maggiore** di `concreteDate` alle `endTime` (`legacy/app.py:64`).
- Tutte le funzioni ricevono `now` come parametro (testabili). Nelle route si passa `new Date()`.
- `setPoolDates(start, end?)`: se `end` manca e `start` c'è, `end = start + 27 giorni` (`legacy/app.py:1098`). Validazioni nuove: date ISO valide; `end >= start`.
- Nomi dei giorni mostrati: i18n `weekday_1` … `weekday_7` (it: Lunedì … Domenica). Formato data breve it: `15 Ott` (`legacy/app.py:27`), via `Intl.DateTimeFormat` con la lingua corrente.

### 8.3 Tipi di evento (`domain/kinds.ts`)

Preset per la creazione rapida (`legacy/app.py:1203`). Titolo e descrizione sono i valori salvati nel DB al momento della creazione:

| kind | Titolo | Descrizione | Compenso |
|---|---|---|---|
| `icebreaker` | `Icebreaker` | `Evento sociale o icebreaker` | 150 |
| `exam` | `Sorveglianza esami (2 ore)` | `Sorveglianza durante gli esami` | 200 |
| `rush` | `Correzioni rush` | `Correzione veloce di compiti o esami` | 300 |
| `cluster` | `Presenza cluster` | `Presenza al cluster per assistenza` | 100 |
| `welcome` | `Accoglienza primo giorno` | `Accoglienza studenti il primo giorno` | 300 |
| `custom` | inserito dall'admin (obbligatorio) | inserita dall'admin, default `Evento personalizzato` | inserito dall'admin (≥ 0) |

`inferKind(title)`: usata dall'import legacy e dall'import CSV. Confronto case-insensitive, **in quest'ordine** (`legacy/app.py:231`):
1. contiene `esam` o `sorveglianza` → `exam`
2. contiene `icebreaker` → `icebreaker`
3. contiene `rush` o `correzion` → `rush`
4. contiene `cluster` o `presenza` → `cluster`
5. contiene `accoglienza` → `welcome`
6. altrimenti → `custom`

Il `kind` determina il colore dell'evento nella UI (token di design, §12).

La valuta si chiama **Altarian**, simbolo `₳`.

### 8.4 Calendario utente (`/calendar`)

Riferimento: `legacy/app.py:790`, `legacy/templates/calendar.html`.

- Query `week` facoltativa. Senza `week` si mostra `active_week`. Con `week` si mostra `clamp(week, 1, active_week)`: l'utente non vede settimane future.
- Navigazione "settimana precedente" visibile se `week > 1`, "successiva" se `week < active_week`.
- Colonne: Lunedì–Venerdì, più Sabato e/o Domenica solo se la settimana ha eventi in quel giorno (D2). Ogni colonna mostra la data concreta, se calcolabile.
- Eventi di ogni giorno ordinati per `start_time`.
- Ogni evento mostra: titolo, orario `HH:MM–HH:MM`, compenso `N ₳`, badge "iscritti/posti" (conteggio secondo D1, rosso se pieno, verde altrimenti), lista dei login iscritti.
  - Utente normale: vede solo gli iscritti con `attended = true`. Il proprio login è evidenziato.
  - Admin: vede tutti gli iscritti, gli assenti marcati in modo diverso.
- Stato del pulsante, in quest'ordine:
  1. evento passato → etichetta "Passato", nessuna azione;
  2. utente già iscritto → pulsante "Disiscriviti" (anche sul badge del proprio login);
  3. evento pieno → etichetta "Completo";
  4. altrimenti → pulsante "Iscriviti".
- Dopo un'iscrizione riuscita si apre un dialog "Aggiungi al calendario" con:
  - link Google Calendar: `https://www.google.com/calendar/render?action=TEMPLATE&text=<titolo>&dates=<inizio>/<fine>&details=<descrizione o "Evento Baywatcher: <titolo>">&location=42 Firenze&ctz=Europe/Rome`, con date in UTC formato `YYYYMMDDTHHMMSSZ` (`legacy/templates/calendar.html:360`). Se la data concreta è null, il link non c'è;
  - link al file `.ics` dell'evento (§8.12).
- Real-time: quando arriva `event_changed` o `week_activated` si ricaricano i dati con `invalidate('app:calendar')`, **senza** ricaricare la pagina. Su `week_activated` appare anche un dialog "La settimana N è stata attivata!".

### 8.5 Iscrizioni (`domain/registrations.ts`)

#### 8.5.1 Iscrizione utente
Una sola transazione:
1. `SELECT ... FROM users WHERE id = $me FOR UPDATE`, poi `SELECT ... FROM events WHERE id = $event FOR UPDATE` (sempre in quest'ordine, per evitare deadlock).
2. L'evento non esiste → errore 404 `event_not_found`.
3. Il login dell'utente non è in `whitelist` → errore `not_whitelisted` ("Non sei autorizzato a iscriverti agli eventi Baywatcher! Contatta lo staff per maggiori informazioni.").
4. L'evento è passato (§8.2) → errore `event_passed` ("Non puoi iscriverti a un evento già passato!").
5. Se `max_events_per_user > 0`: conta le iscrizioni dell'utente (tutte, anche assenti) agli eventi con la stessa `week` dell'evento. Se `>= max` → errore `weekly_limit` ("Hai raggiunto il limite massimo di N eventi per questa settimana!").
6. L'utente è già iscritto → errore `already_registered`.
7. Conta le iscrizioni dell'evento (D1). Se `>= max_slots` → errore `event_full`.
8. `INSERT` in `registrations` (`attended = true`), log `REGISTER_EVENT`, commit, pubblica `event_changed`.

L'ordine dei controlli 3→7 è quello legacy (`legacy/app.py:1262`), con l'aggiunta del 404 e dei messaggi per i casi 6 e 7, che nel legacy fallivano in silenzio.

#### 8.5.2 Disiscrizione utente
1. Evento inesistente → 404.
2. Evento passato e utente non admin → errore `event_passed_unregister` ("Non puoi disiscriverti da un evento già passato!").
3. `DELETE` della propria iscrizione. Se non esisteva, nessun errore e nessun log.
4. Log `UNREGISTER_EVENT`, commit, `event_changed`.

#### 8.5.3 Rimozione da parte dell'admin
Come 8.5.2 ma per un login qualsiasi, senza il controllo "passato". Log `ADMIN_UNREGISTER`.

#### 8.5.4 Aggiunta da parte dell'admin
- Input `login` (trim, minuscolo, non vuoto, regex `^[a-z0-9_-]{1,32}$`).
- Evento inesistente → 404. Già iscritto → warning `already_registered_login` ("<login> è già iscritto a questo evento").
- **Ignora** capienza, whitelist, limite settimanale e data passata (bypass admin, `legacy/app.py:1985`).
- `attended = true`. Log `ADMIN_ADD_PARTICIPANT`.

#### 8.5.5 Presenza
`setAttendance(eventId, login, attended)`: aggiorna la riga (una sola, grazie al vincolo `UNIQUE`). Se la riga non esiste → 404. Log `MARK_PRESENT` o `MARK_ABSENT`. Messaggio: "<login> segnato come PARTECIPATO" / "NON PARTECIPATO".

### 8.6 Display pubblico (`/display`, `domain/display.ts`)

Riferimento: `legacy/app.py:87` e `:895`, `legacy/templates/display.html`.

- Accesso (D4): se `DISPLAY_TOKEN` è vuota, pagina pubblica. Se è impostata, la query `token` deve essere uguale (confronto a tempo costante, `crypto.timingSafeEqual` su buffer della stessa lunghezza); altrimenti 404, senza indicare che serve un token. Lo stream SSE aperto dal display passa lo stesso token (`/api/stream?token=...`) e riceve solo gli eventi pubblici. Il token non va mai nei log applicativi. Un utente admin loggato vede sempre il display, anche senza token, e nel pannello admin trova il link completo da copiare per la TV.
- Prima di leggere i dati si esegue `advanceDisplayWeek(now)` in una transazione con `SELECT ... FOR UPDATE` sulla riga `settings`:
  1. Se `pool_start` è null → non fare nulla.
  2. Se la settimana `display_week` non ha eventi: se `display_week < 4`, `display_week += 1`. Fine (un solo passo per richiesta, come il legacy).
  3. Se **tutti** gli eventi di `display_week` con data concreta non null sono passati, e `display_week < 4`, e la settimana successiva ha almeno un evento: `display_week += 1`.
- Mostra gli eventi di `display_week`, colonne come nel calendario utente (D2), con data concreta.
- Per ogni evento: titolo, orario, compenso, posti liberi `max_slots - iscritti` (D1), stato "Passato" / "N posti liberi" / "Completo", login dei presenti (D4).
- Nessun login, nessun pulsante, layout pensato per uno schermo TV orizzontale (testo grande), ma usabile anche su mobile.
- Se `DISPLAY_REDIRECT_URL` è impostata: dopo `DISPLAY_REDIRECT_SECONDS` il browser va a quell'URL (`<meta http-equiv="refresh">`, come il legacy, `legacy/templates/display.html:9`).
- Real-time: si iscrive a `/api/stream` e su `event_changed` / `week_activated` richiama `invalidate('app:display')`.

### 8.7 Pannello admin (`/admin`)

Riferimento: `legacy/app.py:980`, `legacy/templates/admin.html`.

- Query `week` facoltativa, default `active_week`. L'admin può vedere tutte le settimane 1–4.
- Mostra: settimana visualizzata, `active_week`, `display_week`, `max_events_per_user`, `pool_start`, `pool_end`, le date concrete della settimana.
- Eventi della settimana raggruppati per giorno (Lunedì–Domenica), ordinati per `start_time`. Per ogni evento: tutti i campi, conteggio totale e conteggio presenti, lista iscritti con stato presenza e azioni (presente/assente, rimuovi), form "aggiungi partecipante", modifica, elimina.
- Azioni:
  - `setActiveWeek(week)` (1–4): aggiorna, log `ACTIVATE_WEEK` ("Settimana N attivata"), pubblica `week_activated`.
  - `setMaxEvents(n)` (intero ≥ 0): log `UPDATE_SETTING`.
  - `setPoolDates(start, end?)`: §8.2, log `UPDATE_SETTING` ("Date pool impostate. Inizio: X, Fine: Y").
  - Il valore di `display_week` non si imposta a mano: segue `advanceDisplayWeek`. **Nota**: nel legacy non esiste un modo per riportarlo indietro dalla UI. Aggiungi un'azione `resetDisplayWeek` che lo imposta a 1 (sostituisce `reset_display_week.py`), log `UPDATE_SETTING`.
- Eliminazioni in massa, ognuna con conferma esplicita nella UI (dialog nativo `<dialog>`, non `confirm()`):
  - `deleteDayEvents(week, weekday)` → log `DELETE_DAY_EVENTS`, `resource_id = "<week>-<weekday>"`;
  - `deleteWeekEvents(week)` → log `DELETE_WEEK_EVENTS`;
  - `deleteAllEvents()` → log `DELETE_ALL_EVENTS`.
  Le iscrizioni si cancellano in cascata (FK). Dopo ogni eliminazione si pubblica un `event_changed` con `action: 'bulk_delete'`.

### 8.8 Eventi (`domain/events.ts`)

- `createEvent`: input `week` (1–4), `weekday` (1–7), `kind`, `start_time`, `end_time` (formato `HH:MM`, `start < end`), `max_slots` (intero ≥ 1), `event_date` facoltativa. Per `kind != custom` titolo, descrizione e compenso vengono dal preset (§8.3). Per `custom` sono obbligatori titolo (non vuoto) e compenso (≥ 0); descrizione default "Evento personalizzato". Applica `capitalizeFirst` a titolo e descrizione. Log `CREATE_EVENT` con `new_value` = evento creato.
- `updateEvent`: campi modificabili `title`, `description`, `weekday`, `start_time`, `end_time`, `max_slots`, `compensation`. Non si modificano `week` né `kind` (come nel legacy). Stesse validazioni. Se il nuovo `max_slots` è minore degli iscritti attuali, consentito, ma la UI mostra un avviso. Log `UPDATE_EVENT` con `old_value` e `new_value` in JSON (non stringhe Python come nel legacy).
- `deleteEvent`: 404 se non esiste. Log `DELETE_EVENT`. Pubblica `event_changed` con `action: 'delete'`.

### 8.9 Template settimane (`domain/templates.ts`, `domain/csv.ts`)

Riferimento: `legacy/app.py:1569`–`1938`, `legacy/templates/create_template.html`.

- **Lista** (`/admin/templates`): nome, descrizione, settimana target, data creazione, numero eventi; ordinata per `created_at` decrescente.
- **Builder** (`/admin/templates/new`): nome (obbligatorio), descrizione, settimana target (1–4), lista eventi con giorno, inizio, fine, posti (default 2), compenso (default 0), titolo, descrizione. Si possono aggiungere, modificare e rimuovere eventi prima di salvare. Almeno un evento. Il salvataggio invia un unico payload JSON validato con Zod (nel legacy: campi `events[i]` con JSON dentro). Log `CREATE_TEMPLATE`.
- **Applica** (`apply(templateId, overwrite)`):
  1. Template inesistente → 404.
  2. Se la settimana target ha eventi e `overwrite` è falso → warning con il numero di eventi esistenti ("Esistono già N eventi nella settimana W. Seleziona 'Sovrascrivi' per continuare.").
  3. Se `overwrite` è vero → cancella gli eventi della settimana (le iscrizioni cadono in cascata).
  4. Template senza eventi → warning "Template senza eventi".
  5. Crea gli eventi con `week = target_week`. La data deriva dal pool corrente; il template non contiene date assolute (D7). Log `APPLY_TEMPLATE` ("... Sovrascrittura: true/false").
  6. Messaggio di successo con il numero di eventi creati (ed eliminati, se sovrascrittura). Redirect/visualizzazione su `/admin?week=<target_week>`.
- **Elimina**: log `DELETE_TEMPLATE`, eventi del template in cascata.
- **CSV di esempio**: file `template_esempio.csv` con la sola riga di intestazione `Week,Giorno,Orario,Tipo Evento,Compenso,Partecipanti`.
- **Import CSV** (`legacy/app.py:1776`):
  - File obbligatorio, nome che finisce con `.csv` (case-insensitive), massimo 1 MB, massimo 2000 righe.
  - Decodifica UTF-8; se fallisce, latin-1. Rimuovi il BOM iniziale.
  - Separatore: `,` se nei primi 1024 caratteri le virgole sono più dei punti e virgola, altrimenti `;`.
  - Colonne per nome di intestazione: `Week`, `Giorno`, `Orario`, `Tipo Evento`, `Compenso` (default `0`), `Partecipanti` (default `1`), le colonne `Data` e `Date` vengono ignorate (D7).
  - Una riga si **salta** (e si conta) se: manca uno tra Week, Giorno, Orario, Tipo Evento; `Orario` non contiene `-`; Compenso o Partecipanti non sono interi. Validazioni aggiunte rispetto al legacy (anch'esse saltano la riga): Week non in 1–4; Giorno non riconosciuto (nomi italiani, case-insensitive, con o senza accento: `Lunedi`/`Lunedì`); orari non validi o `inizio >= fine`; Partecipanti < 1; Compenso < 0.
  - `Orario` = `HH:MM-HH:MM` (spazi ammessi attorno ai valori).
  - Si crea **un template per ogni settimana** presente nel file: nome `Week <w> - Import CSV`, descrizione `Template importato da CSV con <n> eventi`. Ogni evento: titolo = `Tipo Evento`, descrizione = `<Tipo Evento> - <Compenso>₳`, `kind = inferKind(titolo)`.
  - Nessuna riga valida → warning "Nessun evento valido trovato nel CSV (saltate N righe)".
  - Successo → "Import completato! Creati X template con Y eventi totali" e, se ci sono righe saltate, un secondo messaggio con il numero e i numeri di riga (max 20 elencati).
  - Tutto in una transazione. Log `IMPORT_TEMPLATES`.

### 8.10 Log di audit (`domain/audit.ts`, `/admin/logs`)

- `audit(tx, { actor, actionType, description, resourceType?, resourceId?, oldValue?, newValue? })` scrive in `action_logs` usando IP e user agent della richiesta corrente (`event.getClientAddress()`, header `user-agent` troncato a 200).
- Tipi di azione (costante `ACTION_TYPES` in `audit.ts`, nessun altro valore ammesso):
  `CREATE_EVENT`, `UPDATE_EVENT`, `DELETE_EVENT`, `DELETE_DAY_EVENTS`, `DELETE_WEEK_EVENTS`, `DELETE_ALL_EVENTS`, `REGISTER_EVENT`, `UNREGISTER_EVENT`, `ADMIN_UNREGISTER`, `ADMIN_ADD_PARTICIPANT`, `MARK_PRESENT`, `MARK_ABSENT`, `ACTIVATE_WEEK`, `UPDATE_SETTING`, `CREATE_TEMPLATE`, `APPLY_TEMPLATE`, `DELETE_TEMPLATE`, `IMPORT_TEMPLATES`, `WHITELIST_ADD`, `WHITELIST_REMOVE`, `LOGIN`.
  `LOGIN` è nuovo: si registra a ogni login riuscito.
- Per `UPDATE_SETTING` e `ACTIVATE_WEEK`, `old_value` e `new_value` contengono in JSON solo i campi di `settings` modificati, con il valore prima e dopo (es. `{"activeWeek": 2}` → `{"activeWeek": 3}`). Il valore precedente si legge nella stessa transazione con `SELECT ... FOR UPDATE` sulla riga `settings`.
- Ogni azione che elimina eventi (`DELETE_EVENT`, `DELETE_DAY_EVENTS`, `DELETE_WEEK_EVENTS`, `DELETE_ALL_EVENTS`, `APPLY_TEMPLATE` con sovrascrittura) salva in `old_value` l'array JSON degli eventi eliminati, ognuno con le sue iscrizioni (`participantLogin`, `attended`, `registeredAt`), letti nella stessa transazione prima del `DELETE`. Le iscrizioni cadono in cascata e sono i dati dei compensi: il log è l'unica traccia che resta.
- Le descrizioni restano in italiano come nel legacy (sono dati storici, non UI). Esempi: `Utente 'x' registrato all'evento 'T' (Lunedì, 09:00-11:00, ID: 5).`
- Pagina `/admin/logs`:
  - filtri: data (`YYYY-MM-DD`, giorno in Europe/Rome), utente (`actor_login` esatto, select con i valori distinti), tipo azione (select con i valori distinti);
  - 50 righe per pagina, ordinate per `created_at` decrescente, paginazione con pagina corrente/totale;
  - colonne: data e ora, utente, tipo (con colore per categoria: create/update/delete/register/setting, come `legacy/templates/admin_logs.html:200`), descrizione, IP, pulsante dettagli che apre un dialog con tutti i campi (`old_value`/`new_value` formattati come JSON);
  - download CSV `action_logs.csv` con gli stessi filtri, tutte le colonne, tutte le righe filtrate;
  - real-time: su `log_created`, se l'admin è a pagina 1 senza filtri la nuova riga compare in cima evidenziata; altrimenti compare un banner "Nuovi log disponibili" che ricarica i dati al clic.
- **Tutti** i valori si rendono come testo (interpolazione Svelte), mai con `{@html}`.

### 8.11 Profilo (`/profile`)

Riferimento: `legacy/app.py:2563`, `legacy/templates/user_profile.html`.
- Dati utente: immagine, nome, login, wallet (valore 42 salvato al login).
- Statistiche: eventi totali (tutte le iscrizioni), ore totali (solo `attended = true`, arrotondate a 1 decimale), Altarian guadagnati (somma compensi con `attended = true`).
- Differenza accettata rispetto al legacy: le ore del profilo usano `toFixed(1)` invece di `round` di Python; per esempio 1 h 15 min (1,25 h) diventa 1,3 in v2 e 1,2 nel legacy.
- Tabella per settimana (1–4, solo settimane con eventi): giorno, data concreta, orario, compenso, stato (Partecipato / Non partecipato, riga attenuata se assente).
- Ordinamento: settimana, giorno, ora di inizio.
- Niente sezione notifiche push.

### 8.12 File `.ics` per evento (`domain/ics.ts`)

Riferimento: `legacy/app.py:2925`.
- 404 se l'evento non esiste; 409 con messaggio "Impossibile determinare la data dell'evento. Impostare la data di inizio pool." se la data concreta è null.
- Un `VEVENT` con: `SUMMARY` titolo, `DESCRIPTION` descrizione, `DTSTART`/`DTEND` con `TZID=Europe/Rome`, `DTSTAMP` ora, `UID` `event-<id>-<inizio ISO>@baywatchers.42firenze.it`, `LOCATION` `42 Firenze`. Tre `VALARM` `DISPLAY` con descrizione `Ricorda: <titolo>` a −1440, −120 e −60 minuti.
- `PRODID` `-//GestionaleBaywatchers//42Firenze//IT`.
- Header: `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="evento_<id>.ics"`.

### 8.13 Riepilogo partecipanti ed export (`domain/reports.ts`)

Riferimento: `legacy/app.py:2229`–`2543`.
- Insieme dei partecipanti = login distinti presenti in `registrations`, ordinati alfabeticamente.
- Per ognuno: numero eventi partecipati (`attended = true`), ore totali (somma durate dei partecipati, 2 decimali), Altarian totali (somma compensi dei partecipati), eventi raggruppati per settimana con giorno, data concreta, orario, durata, compenso, data iscrizione, stato.
- Durata = `(end_time - start_time)` in ore.
- Pagina `/admin/participants`: tabella dei partecipanti con le statistiche, dettaglio espandibile per settimana, link al CSV del singolo, link ai due CSV globali. Campo di ricerca per login (filtro lato client).
- **`summary.csv`** → filename `partecipanti_sintetico.csv`. Colonne: `Nome Partecipante`, `Eventi Iscritti`, `Ore Totali`, `Altarian Totale`. "Eventi Iscritti" contiene il numero di eventi **partecipati** (comportamento legacy, intestazione mantenuta).
- **`detailed.csv`** → filename `partecipanti_dettagliato.csv`. Colonne: `Nome Partecipante`, `Eventi Partecipati`, `Numero Eventi`, `Totale Ore`, `Totale Altarian`. "Eventi Partecipati" è la lista di **tutti** gli eventi separati da ` | `, ognuno nel formato `<titolo> (<giorno> <DD/MM/YYYY>, <durata>h, <compenso>₳)` se partecipato, oppure `<titolo> (<giorno> <DD/MM/YYYY>, <durata>h, NON PARTECIPATO)`. Se la data concreta è null, al posto della data una stringa vuota. "Numero Eventi" = eventi partecipati.
- **`[login].csv`** → filename `partecipante_<login>.csv` (login validato con la regex di §8.5.4). Colonne: `Titolo Evento`, `Giorno`, `Orario Inizio`, `Orario Fine`, `Durata (ore)`, `Altarian`, `Stato`, `Data Iscrizione`. Altarian = compenso se partecipato, altrimenti 0. Stato = `PARTECIPATO` / `NON PARTECIPATO`.
- Ordinamento eventi nei CSV: settimana, giorno, ora di inizio.
- Formato CSV: UTF-8, separatore `,`, fine riga `\r\n`, quoting RFC 4180 (virgolette solo se il campo contiene `,`, `"`, `\r` o `\n`; le virgolette interne si raddoppiano). Numeri decimali con il punto e senza zeri inutili (`2`, `1.5`, `0.33`). Header `Content-Type: text/csv; charset=utf-8`.
- I CSV contengono testi in italiano indipendentemente dalla lingua della UI (sono documenti amministrativi). Questo vale anche dopo M16.

### 8.14 Whitelist (`domain/whitelist.ts`, `/admin/whitelist`)

- Lista ordinata per login, con data di aggiunta e pulsante rimuovi.
- Aggiunta: un campo testo che accetta più login separati da virgola, spazi o a capo. Ogni login: trim, minuscolo, regex di §8.5.4; i non validi si segnalano e si saltano. I duplicati (già presenti) si segnalano come warning ("Già presenti: ..."), gli aggiunti come successo ("Aggiunti alla whitelist: ..."). Un log `WHITELIST_ADD` per ogni login aggiunto.
- Rimozione per id: 404 se non esiste. Log `WHITELIST_REMOVE`. La rimozione **non** cancella le iscrizioni esistenti.

### 8.15 Messaggi all'utente

- Le form action restituiscono `{ ok, messages: [{ type: 'success' | 'warning' | 'error', key, params }] }`, oppure `fail(status, …)` per gli errori.
- Il layout mostra i messaggi come toast accessibili (`role="status"` per success/warning, `role="alert"` per error), che si chiudono da soli dopo 6 s o al clic.
- Le form usano `use:enhance` e funzionano anche senza JavaScript (progressive enhancement).
- Il testo dei messaggi viene da i18n (§11) tramite `key`, mai composto nel server in italiano.

---

## 9. Sicurezza: requisiti

### 9.1 Autorizzazione default-deny
In `hooks.server.ts`, prima di ogni route:
- Prefissi **pubblici**: `/`, `/display`, `/auth/`, `/healthz`, `/api/stream`, file statici e `/_app/`. Il confronto è sul path normalizzato, esatto per `/` e per prefisso con `/` finale per gli altri.
- Tutto il resto richiede una sessione valida. Senza sessione: le pagine `GET` fanno redirect a `/` (303); `POST`, `+server.ts` e form action rispondono 401.
- Tutto ciò che inizia con `/admin` richiede `role = 'admin'`, altrimenti 403.
- Difesa in profondità: anche le funzioni di dominio che modificano dati riservati agli admin ricevono l'attore e verificano il ruolo (`assertAdmin(actor)`).
- `/auth/dev` è pubblica solo se `AUTH_DEV_LOGIN=true`; altrimenti risponde 404.

### 9.2 Sessioni e OAuth 42
- Login: `GET /auth/login` genera `state` casuale (`crypto.randomBytes(32).toString('base64url')`), lo salva in un cookie `oauth_state` (HttpOnly, SameSite=Lax, 10 minuti) e redirige a 42.
- Callback: confronta `state`; scambia il codice; chiama `/v2/me`; upsert in `users` per `intra_id` (login, email, display_name, image_url, wallet); calcola il ruolo (D5); crea la sessione; log `LOGIN`; redirect a `/calendar`. Qualunque errore → redirect a `/?error=login_failed` e log applicativo senza token.
- Sessione: token casuale di 20 byte (base32), nel DB solo `sha256(token)`. Durata 30 giorni; se mancano meno di 15 giorni alla scadenza, si estende a 30. Cookie `session`: HttpOnly, SameSite=Lax, Path=/, `Secure` se `ORIGIN` inizia con `https://`.
- Ogni richiesta: `hooks.server.ts` legge il cookie, carica sessione + utente con una query, popola `event.locals.user` (`id`, `login`, `displayName`, `imageUrl`, `wallet`, `role`). Il ruolo viene **sempre** dal DB.
- Logout: `POST /auth/logout` cancella la sessione nel DB e il cookie.

### 9.3 Login di sviluppo
- Abilitato solo con `AUTH_DEV_LOGIN=true`. All'avvio, se `AUTH_DEV_LOGIN=true` e l'host di `ORIGIN` non è `localhost` o `127.0.0.1`, l'app si rifiuta di partire con un errore esplicito.
- `GET /auth/dev`: pagina con l'elenco degli utenti nel DB e un form per entrare come uno di loro, più un campo per creare al volo un utente (login, admin sì/no).
- `POST /auth/dev`: crea la sessione come nel login 42. Log `LOGIN` con descrizione `Dev login`.
- Usato per lo sviluppo locale e per i test e2e in CI.

### 9.4 CSRF, XSS e header
- CSRF: controllo di origine nativo di SvelteKit attivo (non disattivarlo). Cookie `SameSite=Lax`. Nessuna azione che modifica dati via `GET`.
- XSS: mai `{@html}` su dati dal DB o dall'utente. ESLint con `svelte/no-at-html-tags` come errore.
- CSP: `kit.csp` in `svelte.config.js`, `mode: 'auto'`, direttive: `default-src 'self'`, `script-src 'self'`, `style-src 'self'` (aggiungi `'unsafe-inline'` per gli stili **solo** se strettamente necessario e spiegalo in `SESSIONS.md`), `img-src 'self' https://cdn.intra.42.fr data:`, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self' https://api.intra.42.fr`.
- Altri header (in nginx, §15.3): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Validazione: ogni input (form, query, params, CSV) passa da uno schema Zod. Errori di validazione → 400 con messaggi i18n, mai stack trace.
- Errori: `handleError` in `hooks.server.ts` logga l'errore lato server e restituisce al client solo `{ message: 'Errore interno' }` e un id.
- Rate limit: in nginx su `/auth/` (§15.3).

### 9.5 Segreti
- Nessun segreto nel codice o nei default. `.env` resta in `.gitignore`.
- Il container gira come utente non root (`node`).

---

## 10. Real-time (SSE)

- Server: `src/lib/server/realtime/bus.ts` esporta `publish(event)` e `subscribe(listener) → unsubscribe`, basati su un `EventEmitter` in memoria.
  - `// ponytail: in-process bus, works only with one app instance; switch to Postgres LISTEN/NOTIFY if we ever run more than one.`
- Eventi (nessun dato personale nel payload, i client ricaricano i dati con `invalidate`):
  - `event_changed` `{ eventId: number | null, week: number | null, action: 'create' | 'update' | 'delete' | 'bulk_delete' }`;
    anche il cambio delle date del pool (`setPoolDates`) pubblica `event_changed` con `{ eventId: null, week: null, action: 'update' }`, perché cambiano le date concrete mostrate da calendario e display;
  - `week_activated` `{ week: number }`;
  - `log_created` `{ id: number }` — inviato **solo** ai client con ruolo admin.
- Endpoint `GET /api/stream`: `text/event-stream`, header `Cache-Control: no-cache`, `X-Accel-Buffering: no`. Heartbeat (commento `: ping`) ogni 25 s. Su chiusura della richiesta, `unsubscribe`. Il ruolo si legge da `locals.user` all'apertura dello stream.
- Client: un unico helper in `src/lib/realtime.ts` con `EventSource` e riconnessione automatica (nativa). Le pagine registrano gli handler in `onMount` e li rimuovono in cleanup.

---

## 11. i18n

- Paraglide JS 2, locale base `it`. Strategia: `cookie`, poi `preferredLanguage`, poi `baseLocale`. URL senza prefisso di lingua.
- Fin da M0 **tutte** le stringhe UI stanno in `messages/it.json`, con chiavi in `snake_case` raggruppate per prefisso (`calendar_…`, `admin_…`, `error_…`, `weekday_1`…`weekday_7`).
- Le chiavi di errore del dominio (§8.5) corrispondono a chiavi `error_<code>`.
- Fino a M16 esiste solo `it`. In M16 si aggiungono `en.json` e `fr.json` complete, un selettore di lingua nel layout (anche su mobile) e un test che verifica che i tre file abbiano le stesse chiavi.
- Titoli e descrizioni degli eventi sono dati e non si traducono. CSV e descrizioni dei log restano in italiano.
- Date e numeri si formattano con `Intl` nella lingua corrente.

---

## 12. UI e design

- **Design v1 approvato il 2026-10-22**, in `docs/v2/design/`: `README.md` (principi, temi chiaro e scuro, tipografia, componenti, pagine, accessibilità, ordine di lavoro), `tokens.css`, font self-hosted in `fonts/`, schermate in `screens/`, markup di riferimento in `reference/`, animazione del biglietto in `animation/`, logo in `logo/`. Punti aperti in `docs/v2/design/README.md` §8.
- **Finché il design non c'è**, ogni modulo costruisce una UI funzionale e minimale:
  - HTML semantico e accessibile (label su ogni input, focus visibile, contrasto AA, navigazione da tastiera, dialog nativo `<dialog>`);
  - CSS scritto a mano, solo con le variabili di `src/lib/styles/tokens.css` (colori, spaziature, raggi, font, colori per `event_kind`), niente valori sparsi nei componenti;
  - mobile-first; breakpoint in `tokens.css` (`--bp-md: 768px`, `--bp-lg: 1200px`); nessuno scroll orizzontale della pagina a 360 px di larghezza (la griglia del calendario può scorrere dentro il suo contenitore).
- Palette provvisoria in `tokens.css`, dal tema legacy: ciano 42 `#00babc`, nero `#1c1c1c`, bianco. M14 la sostituisce con `docs/v2/design/tokens.css`.
- Componenti condivisi minimi in `src/lib/components/`: `Toast`, `Dialog`, `EventCard`, `WeekNav`, `ParticipantBadge`. Non creare altri componenti "generici" finché non servono in almeno due pagine.
- Quando il design arriva si esegue il modulo M14 (integrazione), che cambia solo `tokens.css`, CSS dei componenti e markup, non la logica.

---

## 13. Test

### 13.1 Unit (`tests/unit`, Vitest, senza DB)
Obbligatori, con casi limite:
- `dates`: data concreta con e senza `event_date`; `pool_start` null; settimane 1 e 4; `isPassed` esattamente all'ora di fine (non passato) e un minuto dopo (passato), con `now` fisso in Europe/Rome; cambio ora legale.
- `kinds`: `inferKind` per ogni regola e per l'ordine di precedenza (es. "Presenza esami" → `exam`); `capitalizeFirst` con stringa vuota.
- `csv`: parse con `,` e `;`, BOM, latin-1, righe saltate per ogni motivo, giorni con e senza accento; writer con virgole, virgolette, a capo.
- `reports`: durata, somme, formati delle righe dei CSV (confronto con stringhe attese esatte).
- `display`: tutte le transizioni di `advanceDisplayWeek` (logica pura separata dalla query).
- `ics`: struttura del file (UID, TZID, 3 allarmi).

### 13.2 Integration (`tests/integration`, Vitest + Postgres reale)
- Database di test separato (`DATABASE_URL` di test), migrazioni applicate all'inizio, tabelle svuotate tra un test e l'altro (`TRUNCATE ... RESTART IDENTITY CASCADE`).
- Obbligatori:
  - ogni regola di §8.5.1 con il suo errore;
  - **concorrenza**: 20 iscrizioni in parallelo di 20 utenti diversi a un evento con `max_slots = 5` → esattamente 5 righe; 2 iscrizioni parallele dello stesso utente → 1 riga;
  - bypass admin oltre la capienza;
  - cascata su eliminazione evento, giorno, settimana, tutto;
  - apply template con e senza overwrite;
  - import CSV end-to-end;
  - ogni azione scrive esattamente un log del tipo corretto, nella stessa transazione (se l'azione fallisce, nessun log).

### 13.3 E2E (`tests/e2e`, Playwright)
- Gira sull'app **compilata** (`pnpm build && node build`) con `AUTH_DEV_LOGIN=true` e DB di test popolato da `scripts/seed.ts`.
- Progetti: `chromium` desktop (1280×800) e `mobile` (Pixel 7).
- Obbligatori:
  - **matrice di autorizzazione**: elenco in `tests/e2e/routes.ts` di ogni pagina e ogni action admin; per anonimo e utente normale ognuna deve dare 303/401/403 e non modificare dati. Il test fallisce se esiste una route sotto `src/routes/admin` non presente nell'elenco (scansione del filesystem);
  - flusso utente: login dev, iscrizione, dialog "aggiungi al calendario", download `.ics`, disiscrizione, profilo;
  - flusso admin: imposta date pool, crea evento custom e preset, modifica, segna assente, aggiungi partecipante oltre capienza, attiva settimana (un secondo browser utente riceve il dialog via SSE), crea template dal builder, applicalo con overwrite, importa un CSV di esempio (`tests/fixtures/import.csv`), scarica i tre CSV, whitelist add/remove, filtra i log;
  - display pubblico senza login, avanzamento della settimana;
  - XSS: un evento con titolo `<img src=x onerror=alert(1)>` e uno user agent malevolo non eseguono script in calendario, display e log (nessun dialog `alert` intercettato da Playwright).
- Nessun test e2e dipende dall'ordine di esecuzione o da dati lasciati da un altro test.

### 13.4 Copertura
Nessuna soglia numerica. Ogni funzione in `src/lib/server/domain` ha almeno un test unit o integration.

---

## 14. CI

### 14.1 Workflow `.github/workflows/ci.yml`
Trigger: `push` su `v2.0.0` e `main`, `pull_request` verso `main`. Concurrency per branch con `cancel-in-progress: true`. La CI ignora `legacy/` (nessun job Python).

Job (tutti su `ubuntu-latest`, Node da `.nvmrc`, pnpm con cache):
1. `lint` — `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm check` (svelte-check + tsc).
2. `unit` — `pnpm test:unit`.
3. `integration` — service `postgres:17-alpine` con healthcheck; `pnpm db:migrate`; `pnpm test:integration`.
4. `e2e` — service Postgres; `pnpm db:migrate`; `pnpm db:seed`; `pnpm build`; `pnpm exec playwright install --with-deps chromium`; `pnpm test:e2e`. In caso di fallimento carica `playwright-report/` come artifact.
5. `legacy-import` — service Postgres; `pnpm legacy:fake-db -- --out /tmp/calendar.db`; `pnpm db:migrate`; `pnpm legacy:import -- --sqlite /tmp/calendar.db`; `pnpm legacy:verify -- --sqlite /tmp/calendar.db` (§16.3).
6. `docker` — `docker build --build-arg ORIGIN="$ORIGIN" .` (solo build, nessun push di immagini).

Variabili d'ambiente CI: `TZ=Europe/Rome`, `ORIGIN=http://localhost:4173`, `AUTH_DEV_LOGIN=true`, `DATABASE_URL` verso il service.

### 14.2 Script in `package.json`
`dev`, `build`, `preview`, `lint`, `format`, `check`, `test:unit`, `test:integration`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`, `legacy:fake-db`, `legacy:import`, `legacy:verify`, `ci:local`.

### 14.3 Controllo locale prima del push
`pnpm ci:local` esegue in sequenza lint, check, unit, integration, build ed e2e contro il Postgres di `compose.dev.yaml`; la build usa `ORIGIN=http://localhost:4173`, come il server e2e. Si fa push solo se termina con exit code 0.

---

## 15. Docker, nginx, deploy locale

### 15.1 `Dockerfile`
Multi-stage su `node:24-alpine`:
1. `deps`: Corepack, `pnpm install --frozen-lockfile`.
2. `build`: riceve `ARG ORIGIN` e lo passa a `pnpm build`, poi `pnpm prune --prod`. Con SvelteKit 3 e adapter-node 6, `kit.paths.origin` viene configurato nella build tramite `ORIGIN`; cambiare origine richiede una nuova build.
3. `runtime`: copia `build/`, `node_modules/` di produzione, `package.json`, `drizzle/`, `static/`. `ENV NODE_ENV=production TZ=Europe/Rome`. `USER node`. `EXPOSE 3000`. `HEALTHCHECK` con `wget -qO- http://localhost:3000/healthz`. `CMD ["node", "build"]`.

Le migrazioni si applicano all'avvio nell'hook `init` di `hooks.server.ts` con `migrate()` di drizzle-orm (cartella `drizzle/`).
`// ponytail: migrations at boot are fine for a single instance; move to a one-off job if we scale out.`

### 15.2 `compose.dev.yaml` (sviluppo)
Solo `postgres:17-alpine` con porta `5432` esposta su `127.0.0.1`, volume `pgdata-dev`, healthcheck `pg_isready`.

### 15.3 `compose.yaml` (stack locale completo) e nginx
Servizi:
- `db`: `postgres:17-alpine`, volume `pgdata`, **nessuna porta esposta**, healthcheck `pg_isready`.
- `app`: build locale con build arg `ORIGIN` letto da `.env`, `env_file: .env`, `depends_on: db (service_healthy)`, `ADDRESS_HEADER=X-Forwarded-For`, `XFF_DEPTH=1`, nessuna porta esposta, `restart: unless-stopped`.
- `nginx`: `nginx:1.27-alpine`, porte `8080:8080` e `8443:8443`, monta `./nginx/nginx.conf:/etc/nginx/nginx.conf:ro` e `./nginx/certs:/etc/nginx/certs:ro`, `depends_on: app`.

Contenuto di `nginx/nginx.conf` (da usare così com'è):

```nginx
worker_processes auto;
events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    server_tokens off;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml text/calendar text/csv;

    limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;

    upstream app {
        server app:3000;
        keepalive 16;
    }

    server {
        listen 8080 default_server;
        server_name _;
        return 308 https://localhost:8443$request_uri;
    }

    server {
        listen 8443 ssl default_server;
        server_name localhost;

        ssl_certificate /etc/nginx/certs/localhost.crt;
        ssl_certificate_key /etc/nginx/certs/localhost.key;
        ssl_protocols TLSv1.2 TLSv1.3;

        client_max_body_size 2m;

        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "DENY" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

        proxy_http_version 1.1;
        proxy_set_header Host              $http_host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";

        location /api/stream {
            proxy_pass http://app;
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 1h;
        }

        location /auth/ {
            limit_req zone=auth burst=10 nodelay;
            proxy_pass http://app;
        }

        location / {
            proxy_pass http://app;
        }
    }
}
```

Nota: `X-Forwarded-For` viene **sovrascritto** con l'IP reale (non concatenato), così un client non può falsificarlo. TLS termina su nginx con un certificato locale autofirmato per `localhost`, `127.0.0.1` e `::1`. Certificato e chiave sono generati localmente in `nginx/certs/`, esclusi da Git e dal contesto Docker e montati in sola lettura. HTTP su porta 8080 reindirizza a `https://localhost:8443`, preservando percorso e query. La porta 80 non viene utilizzata.

### 15.4 Uso locale
- Sviluppo: `docker compose -f compose.dev.yaml up -d`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev` con `AUTH_DEV_LOGIN=true` e `ORIGIN=http://localhost:5173`.
- Stack completo: `cp .env.example .env`, compila i valori (`DATABASE_URL` con host `db`, `ORIGIN=https://localhost:8443`), genera il certificato locale con il comando nel `README.md`, poi `docker compose up -d --build` e apri `https://localhost:8443`. Il browser mostra l'avviso previsto per il certificato autofirmato.
- Il valore `ORIGIN` deve essere lo stesso nella build e a runtime. Compose lo passa in entrambe le fasi; dopo una modifica eseguire di nuovo `docker compose up -d --build`. SvelteKit 3 configura l'origine canonica tramite `kit.paths.origin`, non tramite una variabile runtime di adapter-node.
- Per il login 42 reale, Ismail deve registrare nell'app 42 il redirect URI `https://localhost:8443/auth/callback` (azione manuale, non dell'agent).

---

## 16. Dati fittizi e import del DB legacy

Il DB di produzione **non è disponibile**. Tutto si sviluppa e si testa con dati fittizi, in modo che lo script di import sia pronto quando arriverà il file vero.

### 16.1 Schema legacy
`scripts/legacy/legacy-schema.sql`: copia fedele delle `CREATE TABLE` e degli indici di `legacy/app.py:445` (`init_db`), **comprese** le colonne aggiunte con `ALTER TABLE` (`events.week`, `events.event_date`, `users.wallet`, `registrations.attended`), le righe di default in `settings` e le tre tabelle push (servono a verificare che l'import le ignori).

### 16.2 Generatore `scripts/legacy/make-fake-db.ts`
`pnpm legacy:fake-db -- --out <path> [--seed 42]`. Usa `better-sqlite3` e `@faker-js/faker` con seed fisso (output deterministico). Contenuto:
- 60 `users` con `intra_id` unici, login realistici in minuscolo, 3 admin (`is_admin = 1`), wallet 0–2000.
- `settings`: `active_week = 2`, `display_week = 2`, `max_events_per_user = 3`, `pool_start` = un lunedì, `pool_end = pool_start + 27`.
- 4 settimane × 12–18 eventi, giorni scritti come nel legacy (`Lunedì` … `Domenica`), di cui almeno 2 nel weekend; titoli dai preset e custom; il 20% con `event_date` valorizzata; orari `HH:MM`; almeno un orario nel formato `9:00` (senza zero iniziale).
- `registrations`: in media 60% della capienza, il 10% con `attended = 0`; **casi limite**: 3 login non presenti in `users`; 2 iscrizioni duplicate (stesso evento e login); un login con lettere maiuscole; `attended` salvato come stringa `'1'` in almeno una riga.
- `events.registered` volutamente **disallineato** dal conteggio reale in almeno 3 eventi.
- 40 login in `baywatcher_whitelist`.
- 3 `week_templates` con 5–10 `template_events` ciascuno.
- 500 `action_logs` con i tipi di §8.10, `user_id` = **intra_id** (come fa il legacy), timestamp naive nel formato Python `YYYY-MM-DD HH:MM:SS.ffffff`, `old_value`/`new_value` sia null, sia JSON, sia stringhe in formato `repr` Python (es. `(5, 'Icebreaker', ...)`, `{'title': 'x'}`).
- Righe nelle tre tabelle push.

### 16.3 Import `scripts/import-legacy.ts`
`pnpm legacy:import -- --sqlite <path> [--dry-run]`.
- Rifiuta di partire se le tabelle di destinazione (escluse `settings` e quelle di sessione) non sono vuote, a meno di `--force-empty`, che le svuota dopo una conferma interattiva (`yes`). In CI si usa sempre un DB vuoto.
- Una sola transazione. Con `--dry-run` fa rollback alla fine e stampa solo il report.
- Mapping:
  - `users` → `users`: login in minuscolo; `is_admin` → `role`; `created_at` naive → `timestamptz` in Europe/Rome.
  - `settings` (key/value) → riga unica; valori mancanti → default.
  - `events` → `events`: `day` → `weekday` (Lunedì=1 … Domenica=7, case-insensitive, con o senza accento; valore non riconosciuto → evento saltato e segnalato); orari normalizzati a `HH:MM`; `kind = inferKind(title)`; `end <= start` → saltato e segnalato; `max_slots < 1` → 1 e segnalato; **mantieni gli `id`** e poi riallinea la sequence (`setval`). `registered` si ignora.
  - `registrations` → `registrations`: login in minuscolo; `attended` normalizzato (`1`, `'1'`, `true` → true; tutto il resto → false); duplicati `(event_id, login)` → si tiene la riga con `registration_date` più vecchia, le altre si segnalano; iscrizioni a eventi saltati → saltate e segnalate.
  - `week_templates`, `template_events` → stesse regole degli eventi.
  - `baywatcher_whitelist` → `whitelist` (minuscolo, dedup).
  - `action_logs` → `action_logs`: `actor_user_id` = `users.id` trovato tramite `intra_id = legacy user_id` (null se non trovato); `actor_login` = `username`; `old_value`/`new_value`: se JSON valido → jsonb; altrimenti → `{"legacy": "<stringa originale>"}`.
  - Tabelle push: ignorate (contate nel report).
- Report finale su stdout (e in JSON con `--report <path>`): righe lette, importate e saltate per tabella, con l'elenco delle anomalie.

### 16.4 Verifica `scripts/verify-legacy-import.ts`
`pnpm legacy:verify -- --sqlite <path>`: confronta SQLite e Postgres e termina con exit code ≠ 0 se una di queste regole fallisce:
- utenti, whitelist e template: stessi conteggi (al netto dei duplicati segnalati);
- per ogni evento importato, il numero di iscrizioni in Postgres = iscrizioni distinte per login nel legacy;
- per ogni partecipante, ore e Altarian totali calcolati da `reports.ts` = stessi valori calcolati in SQL direttamente sul DB legacy.

### 16.5 Seed di sviluppo `scripts/seed.ts`
`pnpm db:seed [--seed 42]`: svuota e popola Postgres direttamente (senza passare dal legacy) con dati simili a §16.2, più utenti dev noti per i test e2e: `dev_admin` (admin, in whitelist), `dev_user` (in whitelist), `dev_outsider` (non in whitelist). Il seed imposta `pool_start` in modo che la settimana 1 includa la data corrente, così ci sono eventi passati e futuri.

---

## 17. Moduli (ordine di esecuzione)

Ogni modulo termina con: controlli locali verdi (`pnpm ci:local`), push, CI verde, voce in `SESSIONS.md`, stato aggiornato in §19. Le stime sono in giorni-persona (totale ≈ 54).

### M0 — Bootstrap (2 g)
1. `git mv` di tutto il codice Flask in `legacy/`: `app.py`, `notifications.py`, `generate_vapid_keys.py`, `reset_display_week.py`, `run-test.sh`, `requirements.txt`, `Dockerfile`, `docker-compose.yml`, `deployer/`, `templates/`, `static/`, `.env.example`, `CALENDAR_SETUP.md`, `NOTIFICATIONS_SETUP.md`, `WEBHOOK_SETUP.md`, `README.md`. Restano in root `LICENSE`, `.gitignore`, `docs/`. Commit dedicato `chore: move flask app to legacy/`.
2. Crea il progetto SvelteKit nella root (`pnpm dlx sv create` con TypeScript, ESLint, Prettier, Vitest, Playwright; poi `pnpm dlx sv add` per Drizzle/Postgres e Paraglide se disponibili, altrimenti a mano). Rimuovi gli esempi generati.
3. `adapter-node`, `.nvmrc`, `engines`, `packageManager`, `.gitignore` aggiornato (node_modules, build, .svelte-kit, playwright-report, test-results, src/lib/paraglide, .env*, `!.env.example`, graphify-out).
4. `env.ts` con Zod, `.env.example` (§6), `compose.dev.yaml`, `compose.yaml`, `Dockerfile`, `nginx/nginx.conf` (§15).
5. `tokens.css`, `base.css`, layout vuoto con header provvisorio, pagina `/` provvisoria, `/healthz`.
6. Paraglide con solo `it`.
7. Script `package.json` (§14.2) e `ci.yml` (§14.1). I job senza test ancora scritti passano con test segnaposto minimi (un test vero su `/healthz` in e2e).
8. Copia `static/42_Logo.svg.png` e `static/badge.png` dal legacy in `static/`.
**Fatto quando**: `docker compose up` mostra la landing su `https://localhost:8443`, `/healthz` risponde 200, CI verde.

### M1 — Database, dati fittizi e import (5 g)
Schema §7 e prima migrazione; `db/index.ts`; `legacy-schema.sql`; `make-fake-db.ts`; `import-legacy.ts`; `verify-legacy-import.ts`; `seed.ts`; `domain/dates.ts` e `domain/kinds.ts` (servono all'import e al verify) con i loro test unit; job CI `integration` e `legacy-import`.
**Fatto quando**: `legacy:fake-db` → `legacy:import` → `legacy:verify` passa in locale e in CI; `db:seed` produce un DB utilizzabile.

### M2 — Auth, sessioni, guard, layout (3 g) — dipende da D5
§9.1–§9.3 completi; `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/dev`; `locals.user`; `handleError`; CSP; layout con navigazione (Calendario; per admin: Admin, Template, Partecipanti, Whitelist, Log; Profilo; Logout) responsive con menu mobile; pagine segnaposto per tutte le route di §8.1 (così la matrice di autorizzazione e2e è completa da subito); `domain/audit.ts` con `LOGIN`; `realtime/bus.ts` (solo `publish`/`subscribe`, l'endpoint arriva in M9).
**Fatto quando**: login dev funziona; matrice di autorizzazione e2e verde; login 42 reale verificato da Ismail (passo manuale, da segnare in `SESSIONS.md`; non blocca il push).

### M3 — Impostazioni e settimane (2 g)
`domain/settings.ts`; su `/admin`: date pool, settimana attiva, limite eventi, reset display week; log e `week_activated`.

### M4 — Eventi admin (4 g)
§8.7 (vista settimana e eliminazioni in massa) e §8.8 (crea/modifica/elimina con preset e custom).

### M5 — Iscrizioni e presenze (4 g) — dipende da D1
§8.5 completo, con i test di concorrenza.

### M6 — Whitelist (1 g)
§8.14.

### M7 — Calendario utente e `.ics` (4 g) — dipende da D2, D3
§8.4 e §8.12 (senza real-time, che arriva in M9).

### M8 — Display pubblico (2 g) — dipende da D2, D4
§8.6 (senza real-time).

### M9 — Real-time (1.5 g)
§10: endpoint, helper client, collegamento a calendario, display, admin e log (il banner log si completa in M13).

### M10 — Template e import CSV (4 g)
§8.9.

### M11 — Riepilogo partecipanti ed export (2.5 g)
§8.13.

### M12 — Profilo (1.5 g)
§8.11.

### M13 — Log di audit (2.5 g)
§8.10 (pagina, filtri, paginazione, CSV, live).

### M14 — Integrazione del design (3 g)
Applica `docs/v2/design/` seguendo l'ordine di lavoro del suo `README.md` §7: font e token (temi chiaro e scuro), navigazione, componenti condivisi (biglietto con perforazione e stati), pagine, animazione B (`docs/v2/design/animation/animation-b.md`). Font serviti dall'app, CSP invariata. Nessuna modifica alla logica, con una sola eccezione: il tema (sistema come default più interruttore, cookie `theme` letto in `hooks.server.ts`, design README §2). Aggiorna gli screenshot di riferimento e verifica a 360 px, 768 px e 1280 px contro `docs/v2/design/screens/`.

### M15 — Stack locale finale e passaggio di consegne (2 g)
`compose.yaml` definitivo, `scripts/backup.sh` (`pg_dump` compresso con data nel nome, conserva gli ultimi 14), `README.md` nuovo (setup, sviluppo, test, import legacy, backup e ripristino), runbook di cutover in `docs/v2/CUTOVER.md` (stop Flask, copia `calendar.db`, import con `--dry-run`, import reale, verify, avvio). Cancellazione di `legacy/` **solo** dopo conferma scritta di Ismail in `SESSIONS.md`.

### M16 — Inglese e francese (2 g)
§11: `en.json`, `fr.json`, selettore di lingua, test sulle chiavi, e2e di un flusso in ciascuna lingua.

### M17 — Correzioni dell'audit (1 g)
§20.1: accesso limitato al campus Firenze (D6), data nei template (D7), pulizia delle sessioni scadute.

### M18 — Prossimo turno e turni rimasti (1 g)
§20.2: versione `2.1.0`, riquadro "Il tuo prossimo turno", contatore "N di M turni questa settimana".

### M19 — Duplica evento e settimana come template (1 g)
§20.3.

### M20 — Chiusura della piscina (1.5 g)
§20.4.

### M21 — Display: evento in corso e prossimo (0.5 g)
§20.5.

### M22 — Feed calendario personale (1.5 g)
§20.6. Si inizia solo dopo la messa in produzione con il dominio vero.

### M23 — Archivio alla chiusura (1,5 g)
§21.2.

### M24 — Archivio per lo staff e import delle piscine vecchie (1,5 g)
§21.3.

### M25 — Riepilogo studente animato e pagina di attesa (2 g)
§21.4.

### M26 — Iscrizioni alla piscina con QR (1,5 g)
§21.5.

Il lavoro di test (§13) è incluso nella stima di ogni modulo, non è una fase separata.

---

## 18. Bug legacy da NON riprodurre

| # | Legacy | v2 |
|---|---|---|
| 1 | `/add_event`, `/delete_event/<id>`, `/admin_unregister/...` senza controllo di accesso (`legacy/app.py:1185`, `:1461`, `:1940`). | Guard default-deny + `assertAdmin` + matrice e2e. |
| 2 | XSS stored nella pagina log via `innerHTML` (`legacy/templates/admin_logs.html:218`). | Solo interpolazione Svelte, test e2e XSS. |
| 3 | Nessuna protezione CSRF; logout via GET. | Controllo origine SvelteKit, `SameSite=Lax`, logout POST. |
| 4 | `SECRET_KEY` con default, `CORS *`. | Nessun default per segreti, nessun CORS. La lista admin hardcoded resta per scelta (D5), spostata in `src/lib/server/admins.ts`. |
| 5 | Ruolo admin congelato nel cookie. | Ruolo letto dal DB a ogni richiesta. |
| 6 | Race condition sulla capienza; contatore `registered` duplicato e disallineabile. | Transazione con lock, `UNIQUE`, niente contatore. |
| 7 | `delete_event` va in errore se l'evento non esiste. | 404. |
| 8 | `/admin/whitelist` renderizza `whitelist.html` inesistente (500). | Pagina reale. |
| 9 | `mark_absent`/`mark_present` aggiornano tutte le righe duplicate; `admin_unregister` ne rimuove una a caso. | `UNIQUE (event_id, participant_login)`. |
| 10 | Export CSV vanno in errore se un evento ha orari non validi. | Orari validati in ingresso e tipo `time` nel DB. |
| 11 | L'evento `event_update` via Socket.IO invia i login dei partecipanti a tutti i client, anche anonimi; `new_log` a tutti i client connessi. | Payload SSE senza dati personali; `log_created` solo agli admin. |
| 12 | `X-Forwarded-For` usato senza fidarsi del proxy (IP falsificabile nei log). | adapter-node `ADDRESS_HEADER` + nginx che sovrascrive l'header. |
| 13 | Eventi nel weekend creati dall'admin ma invisibili agli utenti. | Colonne weekend mostrate quando hanno eventi (D2). |
| 14 | Messaggi di errore con il testo dell'eccezione mostrati all'utente (`legacy/app.py:1937`). | Messaggi i18n, dettagli solo nei log del server. |
| 15 | Valori `old_value`/`new_value` salvati come `repr` Python. | JSON. |
| 16 | Connessioni SQLite aperte e mai chiuse (`legacy/app.py:860`, `:1286`). | Pool postgres.js unico. |
| 17 | Server di sviluppo Werkzeug in produzione, container root. | adapter-node, utente `node`. |

---

## 19. Stato dei moduli

Valori ammessi: `da fare`, `in corso`, `completato (<commit>)`, `bloccato (vedi SESSIONS)`.

| Modulo | Stato |
|---|---|
| M0 Bootstrap | completato (35e0807) |
| M1 Database, dati fittizi e import | completato (c65209e) |
| M2 Auth, sessioni, guard, layout | completato (02517c5) |
| M3 Impostazioni e settimane | completato (6999dea) |
| M4 Eventi admin | completato (ab63bca) |
| M5 Iscrizioni e presenze | completato (bddc6e2) |
| M6 Whitelist | completato (8723c27) |
| M7 Calendario utente e .ics | completato (1890810) |
| M8 Display pubblico | completato (28ea717) |
| M9 Real-time | completato (1fe2bc9) |
| M10 Template e import CSV | completato (f2d0e78) |
| M11 Riepilogo ed export | completato (6258899) |
| M12 Profilo | completato (2e6d514) |
| M13 Log di audit | completato (5b835d1) |
| M14 Integrazione design | completato (d671485) |
| M15 Stack finale e consegna | completato (21f093e) |
| M16 Inglese e francese | completato (35b7201) |
| M17 Correzioni dell'audit | completato (75cde19) |
| M18 Prossimo turno e turni rimasti | completato (e1ae195) |
| M19 Duplica evento e settimana come template | completato (ab9b5ee) |
| M20 Chiusura della piscina | completato (00dced4) |
| M21 Display: evento in corso e prossimo | completato (b604143) |
| M22 Feed calendario personale | da fare (dopo la produzione) |
| M23 Archivio alla chiusura | completato (0187ced) |
| M24 Archivio staff e import piscine vecchie | da fare |
| M25 Riepilogo animato e pagina di attesa | da fare |
| M26 Iscrizioni con QR | da fare |

---

## 20. Versione 2.1.0: correzioni dell'audit e nuove funzioni

Valgono tutte le regole di §1: stesso branch `v2.0.0`, un modulo alla volta in ordine (M17 → M22), `pnpm ci:local` verde, push, CI verde, voce in `SESSIONS.md`. Ogni testo nuovo per l'utente va in `messages/it.json`, `en.json` e `fr.json` (il test delle chiavi lo controlla). Ogni pagina o componente nuovo segue `docs/v2/design/` e funziona anche senza JavaScript dove già lo fanno le pagine vicine.

Versione (SemVer): 2.1.0 aggiunge funzioni senza rompere quelle esistenti, quindi sale il numero di mezzo. `package.json` passa da `2.0.0` a `2.1.0` in M18, con un commit dedicato `chore: bump version to 2.1.0`. M17 sono correzioni della 2.0.0 non ancora rilasciata e non cambiano il numero.

Fuori da 2.1.0: lista d'attesa, presenze in blocco, cancellazione dei log vecchi.

### 20.1 M17 — Correzioni dell'audit

**Accesso solo al campus Firenze (D6)**
- In `src/lib/server/auth/oauth42.ts` aggiungi la costante `FIRENZE_CAMPUS_ID = 52` (D6) e leggi `campus_users: { campus_id: number }[]` dal profilo (`.catch([])`, come gli altri campi).
- Il profilo è ammesso se un elemento di `campus_users` ha `campus_id === FIRENZE_CAMPUS_ID`, oppure se il login è in `ADMIN_LOGINS`. Il ruolo admin (D5) si calcola solo per i profili ammessi.
- Profilo non ammesso: nessun utente creato o aggiornato, nessuna sessione, nessun log. Il callback reindirizza a `/?error=campus` e la landing mostra il messaggio nuovo `error_campus` ("L'accesso è riservato agli studenti e allo staff di 42 Firenze.").
- Test: unit sul parse del profilo (Firenze, altro campus, altro campus con `staff? = true`, `campus_users` mancante, login in `ADMIN_LOGINS` di altro campus); e2e: `/?error=campus` mostra il messaggio.

**Data nei template (D7)**
- Togli il campo data dal builder (`/admin/templates/new`) e da `templateEventSchema` in `domain/csv.ts`; l'import CSV ignora le colonne `Data`/`Date`.
- Migrazione Drizzle che elimina `template_events.event_date`. Aggiorna §7 e §8.9 di questo piano nello stesso commit (eccezione a §1.1 punto 4, autorizzata qui).
- Test: i test dei template e del CSV non usano più `eventDate`; un CSV con la colonna `Data` si importa lo stesso.

**Sessioni scadute**
- In `createSession` (`auth/session.ts`), prima dell'insert: `DELETE FROM sessions WHERE expires_at <= now`. Nessun job, nessun timer.
- Test integration: una sessione scaduta di un altro utente sparisce dopo un login.

### 20.2 M18 — Prossimo turno e turni rimasti

**Versione**: commit `chore: bump version to 2.1.0` (solo `package.json`).

**"Il tuo prossimo turno"**
- In `domain/reports.ts` una funzione `nextShift(database, login, now)`: tra le iscrizioni del login, il primo evento con `week <= active_week` non ancora passato (§8.2), ordinato per `week`, `weekday`, `start_time`, `id`. Restituisce titolo, tipo, settimana, giorno, data concreta (può essere null), orari, id evento; `null` se non c'è.
- Lo mostrano `/calendar` (sopra la griglia, per tutte le settimane visualizzate) e `/profile` (in cima): titolo, giorno e data, orario, link al `.ics` dell'evento quando la data concreta non è null. Se è `null` il riquadro non c'è.
- Si aggiorna con il real-time già presente (`event_changed`, `week_activated`).
- Test: unit/integration sui casi nessuna iscrizione, solo eventi passati, evento in una settimana futura non attivata (escluso), due eventi lo stesso giorno (vince l'orario prima); e2e: dopo l'iscrizione il riquadro mostra l'evento.

**"N di M turni questa settimana"**
- Nel `load` di `/calendar`, se `max_events_per_user > 0`: conta le iscrizioni dell'utente nella settimana visualizzata con la stessa regola di §8.5.1 punto 5 (tutte, anche assenti). Estrai il conteggio in una funzione usata sia dal controllo di iscrizione sia dal `load`, così la regola resta una.
- Mostra "N di M turni questa settimana". Quando `N >= M` i pulsanti "Iscriviti" di quella settimana sono disattivati con il motivo visibile (`error_weekly_limit`). Il server resta l'unico controllo vero.
- Se `max_events_per_user = 0` (nessun limite) non si mostra nulla.
- Test: integration sul conteggio condiviso; e2e: al limite il pulsante è disattivato e il testo è visibile; con limite 0 il contatore non c'è.

### 20.3 M19 — Duplica evento e settimana come template

**Duplica evento**
- Action `?/duplicateEvent` in `/admin` con `id`, `week` (1–4), `weekday` (1–7). Copia titolo, descrizione, tipo, orari, posti e compenso; `event_date` null; nessuna iscrizione. Riusa la transazione e il log di `createEvent` (`CREATE_EVENT`, descrizione "Duplicato dall'evento ID x").
- UI: pulsante "Duplica" nella scheda evento admin, apre un `<dialog>` con settimana e giorno (default: quelli dell'evento).
- Test: integration (copia dei campi, niente iscrizioni, 404 su id inesistente, solo admin); e2e del flusso.

**Salva settimana come template**
- Action `?/saveWeekAsTemplate` in `/admin` con `week`, `name`, `description`, `targetWeek` (default la settimana stessa). Legge gli eventi della settimana e crea il template con lo stesso codice di `createTemplate` (stessi limiti: 1–200 eventi, log `CREATE_TEMPLATE`). Settimana vuota: avviso, niente template.
- Test: integration (eventi copiati, settimana vuota, solo admin); e2e: il template appare in `/admin/templates` e si applica.

### 20.4 M20 — Chiusura della piscina

- Pulsante "Chiudi piscina" in `/admin`, porta a `/admin/close-pool` (solo admin, coperta dalla matrice e2e).
- Passo 1, salva i dati: link a `summary.csv` e `detailed.csv` (esistenti) e casella obbligatoria "Ho scaricato i dati".
- Passo 2, cosa azzerare (tutte facoltative, nessuna preselezionata):
  - tutti gli eventi (con le iscrizioni);
  - whitelist;
  - settimane: `active_week` e `display_week` a 1;
  - date del pool: `pool_start` e `pool_end` a null.
  I template e i log non si toccano mai.
- Passo 3: conferma in un `<dialog>` che elenca le scelte.
- Action `closePool` in un nuovo `domain/pool.ts`, una sola transazione: `lockAdmin`, `settings` FOR UPDATE, `deletionSnapshot` per gli eventi, snapshot della whitelist, poi le cancellazioni e l'update scelti. Un solo log `CLOSE_POOL` con `old_value` = `{ events, whitelist, settings }` delle parti azzerate. Poi `publish` di `log_created`, `event_changed` (`bulk_delete`) e `week_activated` se le settimane cambiano.
- Nessuna scelta selezionata o casella del passo 1 non spuntata: avviso, nessuna modifica.
- Si può usare a fine piscina senza azzerare nulla, e di nuovo all'inizio della piscina nuova per azzerare.
- Test: integration su ogni combinazione rilevante (solo eventi, solo whitelist, tutto, niente), sul contenuto del log e sul rollback se una parte fallisce; e2e del flusso completo con e senza JavaScript.

### 20.5 M21 — Display: evento in corso e prossimo

- In `domain/display.ts`, per ogni evento di `display_week` con data concreta: stato `ongoing` se `now` è tra inizio e fine (Europe/Rome), `next` per il primo evento non ancora iniziato della settimana. Gli altri stati restano quelli di §8.6.
- Il display li evidenzia (etichette "In corso" e "Prossimo", stile da `docs/v2/design/`).
- Il display richiama `invalidate('app:display')` ogni 60 secondi, oltre al real-time già presente, così anche "Passato" si aggiorna senza ricaricare.
- Test: unit sugli stati (prima, durante, all'ora esatta di fine, dopo, data null, cambio ora legale); e2e: con un evento in corso l'etichetta è visibile.

### 20.6 M22 — Feed calendario personale (dopo la produzione)

Si inizia solo quando il sito è online sul dominio vero con un certificato valido: Google Calendar non legge feed da `localhost` né con certificati autofirmati.

- Colonna `users.calendar_token_hash` (null = nessun feed). Il token è casuale (stesso generatore delle sessioni), nel DB si salva solo l'hash, come per le sessioni.
- Route pubblica `GET /calendar/feed/[token].ics` (aggiunta a `isPublicPath` e alla matrice e2e). Token sconosciuto: 404. Contenuto: un VCALENDAR con gli eventi a cui il login è iscritto, con `week <= active_week` e data concreta non null; per ogni evento lo stesso VEVENT di `domain/ics.ts` (allarmi compresi), `UID` stabile per evento e `SEQUENCE` che cresce quando l'evento cambia (da `updated_at`).
- `/profile`: "Abbonati al calendario" (link `webcal://`), "Copia link" e "Rigenera link" (action che sostituisce l'hash e invalida il link vecchio, log `CALENDAR_FEED_RESET`).
- nginx: `limit_req` sulla route del feed, come per `/auth/`.
- Il token è nel path, che nginx scrive nell'access log: per questa route usa `access_log off`.
- Test: integration (contenuto del feed, settimane future escluse, token rigenerato invalida il vecchio); e2e: 404 con token sbagliato, 200 `text/calendar` con quello giusto.
- Verifica manuale con Ismail: iPhone (Calendario → Aggiungi abbonamento) e Google Calendar (aggiornamento lento, anche 12–24 ore).

---

## 21. Versione 2.2.0: archivio piscine, riepilogo animato e iscrizioni con QR

Valgono le regole di §1 e di §20 (stesso branch, un modulo alla volta in ordine, `pnpm ci:local` verde, push, CI verde, voce in `SESSIONS.md`, testi in it/en/fr). `package.json` passa a `2.2.0` in M23 con il commit `chore: bump version to 2.2.0`. "Piscina" è il nome che lo staff usa per il pool (§8.2): nei testi per l'utente si scrive "piscina".

### 21.1 Modello (D8, D9)

- **La piscina corrente resta quella di oggi**: date in `settings.pool_start` / `pool_end`, eventi, iscrizioni e whitelist nelle tabelle attuali. Nessuna tabella di lavoro cambia forma.
- **Nome della piscina**: mese e anno di inizio, calcolati da `pool_start` con `Intl` nella lingua dell'utente ("Ottobre 2026", "October 2026"). Non si salva come testo.
- **Fase della piscina corrente**, funzione pura `poolPhase(settings, events, now)` in `domain/pool.ts`, ora di Roma:
  - `none`: `pool_start` null;
  - `upcoming`: oggi < `pool_start`;
  - `finished`: `pool_end` non null, oggi > `pool_end` e nessun evento con data concreta > `pool_end`;
  - `active`: tutti gli altri casi.
- La fase `finished` è **solo una visualizzazione** (riepilogo per gli studenti, avviso per lo staff). Non cancella né salva nulla: i dati restano finché lo staff non usa "Chiudi piscina".
- **Archivio** (Postgres, stesso DB: una piscina pesa meno di 1 MB):
  - `pools`: `id`, `start_date date NOT NULL UNIQUE`, `end_date date`, `source` (`'site' | 'csv'`), `archived_at timestamptz NOT NULL`;
  - `pool_entries`: `id`, `pool_id` FK `ON DELETE CASCADE`, `login`, `title`, `kind`, `event_date date` (null se non nota), `weekday` (null se non noto), `start_time`/`end_time` (null se non noti), `duration_minutes`, `compensation`, `attended`, `registered_at` (null se non nota). Indice su `(pool_id, login)`.
- **Una sola funzione di statistiche**, `poolStats(entries, login?)`, pura, che lavora sulle righe nella forma di `pool_entries`. Le righe arrivano dall'archivio oppure, per la piscina corrente non ancora archiviata, da una query sulle tabelle di lavoro che restituisce la stessa forma. Le statistiche non si calcolano in due modi diversi.

### 21.2 M23 — Archivio alla chiusura (1,5 g)

- Versione `2.2.0` (commit dedicato).
- Migrazione con `pools` e `pool_entries` (§21.1).
- `closePool` (§20.4) **salva sempre l'archivio prima di qualunque cancellazione**, nella stessa transazione: una riga `pools` (`source = 'site'`, date da `settings`) e una riga `pool_entries` per ogni iscrizione della piscina corrente. Se esiste già un archivio con la stessa `start_date` (chiusura ripetuta, per esempio prima senza pulizia e poi con pulizia) lo **sostituisce**, così prende le ultime correzioni delle presenze.
- Se `pool_start` è null la chiusura non parte: avviso `pool_dates_required` ("Imposta le date della piscina prima di chiuderla"), nessuna scrittura.
- Tutte le caselle di pulizia restano facoltative: "Chiudi piscina" senza caselle ora ha senso (salva solo l'archivio). Il passo 1 (download dei CSV) resta obbligatorio.
- Il log `CLOSE_POOL` indica anche l'id dell'archivio e il numero di righe salvate.
- Correzione dalla review: `closePool` non pubblica più `week_activated` (mostrava agli studenti "La settimana 1 è stata attivata!" alla chiusura). Basta `event_changed`.
- `poolPhase` e `poolStats` con test unit completi:
  - `poolPhase`: date null, giorno prima dell'inizio, primo giorno, ultimo giorno, giorno dopo la fine con e senza eventi oltre la fine, cambio ora legale;
  - `poolStats`: nessuna riga, solo assenze, dati parziali (orari null);
  - integration: archivio scritto, sostituito alla seconda chiusura, rollback se una parte fallisce.
- Nessuna pagina nuova in questo modulo.

**Statistiche di `poolStats`** (per un login, più i totali della piscina): turni presi e fatti, ore, ₳, turni per tipo (conteggio e %), giorno della settimana più frequente, fascia oraria più frequente (mattina < 12:00, pomeriggio < 18:00, sera; null se gli orari mancano), settimana o mese più intenso, primo e ultimo turno, presenze su turni presi, contributo in % delle ore totali della piscina, badge descrittivi (`early_bird` maggioranza dei turni prima delle 12, `all_rounder` 3 o più tipi, `always_there` 100% presenze con almeno 3 turni). Totali della piscina: turni, ore, ₳, partecipanti unici, % presenze, turni per tipo. Niente copertura dei posti: l'archivio non conserva capienze né eventi senza iscritti.

### 21.3 M24 — Archivio per lo staff e import delle piscine vecchie (1,5 g)

- Pagina `/admin/archive` (solo admin, matrice e2e): selettore anno → piscina ("2025 → Maggio, Ottobre"), più la piscina corrente se non è ancora archiviata. Per la piscina scelta: i totali di `poolStats` con grafici semplici (barre e ciambella in SVG, nessuna libreria) e la tabella per partecipante.
- Avviso in `/admin` quando `poolPhase = finished`: "La piscina è finita. Quando hai completato le presenze, chiudila" con link a "Chiudi piscina".
- **Import delle piscine vecchie** dal `detailed.csv` attuale (stesso formato prodotto da `detailedCsv` e dal legacy), solo per i pochi file delle piscine passate:
  - form con file e mese/anno di inizio della piscina; anteprima con righe lette, righe saltate (con il motivo) e totali, poi conferma;
  - ogni voce `Titolo (Giorno gg/mm/aaaa, Nh, X₳ | NON PARTECIPATO)` diventa una riga `pool_entries`: `kind = inferKind(titolo)`, `event_date` dalla data, `duration_minutes` dalle ore, `compensation`, `attended`; orari e data di iscrizione null;
  - una voce che non si legge con certezza (per esempio titolo con " | " o parentesi ambigue) si salta e si mostra nell'anteprima: mai indovinare;
  - se esiste già una piscina con la stessa `start_date`: errore, nessuna scrittura;
  - `source = 'csv'`, log `IMPORT_POOL`.
- Test: unit sul parser (voci valide, NON PARTECIPATO, titoli con parentesi, voci illeggibili, latin-1, BOM); integration su import e duplicato; e2e del flusso con anteprima.

### 21.4 M25 — Riepilogo studente animato e pagina di attesa (2 g)

Pagina `/recap` (utente loggato) e `/recap/[poolId]` per una piscina archiviata. Nel profilo, "Le tue piscine": elenco delle piscine (archivio + corrente) a cui il login ha partecipato, ciascuna con il link al suo riepilogo.

**Cosa vede lo studente in base alla fase** (D13):
- `upcoming`: in cima a `/calendar` un **countdown** fino a `pool_start` (giorni, ore, minuti; aggiornato ogni secondo con JS, statico senza JS) con sotto il pulsante "Durante l'attesa, guarda cosa hai fatto" che apre il riepilogo dell'ultima piscina a cui ha partecipato. Se non ha mai partecipato, al posto del pulsante il messaggio buffo (vedi sotto). Sotto il countdown il calendario resta come oggi: se lo staff ha già creato eventi nella settimana attiva, ci si può iscrivere anche prima dell'inizio.
- `none` (nessuna piscina impostata): `/calendar` mostra il riepilogo dell'ultima piscina a cui ha partecipato; se non ha mai partecipato, il messaggio buffo.
- `finished`: `/calendar` mostra in cima il riepilogo della piscina appena finita (dati di lavoro, §21.1), con il calendario sotto per consultazione.
- `active`: il calendario come oggi.
- Messaggio buffo per chi non ha mai partecipato, per esempio "Ehi, qui è tutto vuoto… la prossima piscina aspetta anche te! Fatti avanti con lo staff." (tono leggero, in it/en/fr).

**Il riepilogo** (stile "Wrapped"): schermate a tutto schermo una dopo l'altra, avanti/indietro con tap, frecce o pulsanti; numeri che salgono (`svelte/motion`), barre e ciambella in SVG animate. Nessuna libreria nuova. Con `prefers-reduced-motion` niente animazioni; senza JavaScript tutte le schermate sono una sotto l'altra, statiche.
Schermate (dati da `poolStats`, nessuna classifica, D10):
1. "La tua piscina <Mese Anno>": turni fatti, ore, ₳;
2. il tuo turno preferito, con la ciambella dei tipi;
3. il tuo ritmo: giorno preferito, fascia oraria, settimana più intensa (barre);
4. primo e ultimo turno;
5. presenze ("Presente a 9 turni su 10"), mostrata solo se le presenze sono almeno l'80%;
6. il tuo contributo: "% delle ore di tutta la piscina";
7. badge descrittivi ottenuti (solo quelli ottenuti, nessun badge "mancato");
8. la piscina insieme: totali senza nomi.
Le schermate senza dati (per esempio la fascia oraria di una piscina importata da CSV) si saltano.

- Lo staff in `/admin/archive` può aprire lo stesso riepilogo in versione "piscina intera" (solo totali).
- Test: unit sulla scelta della vista per fase; e2e con e senza JS, con reduced motion, per: countdown, pulsante riepilogo, messaggio buffo, riepilogo con dati, piscina importata (schermate saltate); nessun overflow a 360 px.

### 21.5 M26 — Iscrizioni alla piscina con QR (1,5 g)

- Dipendenza approvata (D12): `uqr` per generare il QR in SVG lato server. Versione esatta (`pnpm add -E`).
- In `/admin/whitelist`: "Apri iscrizioni" / "Chiudi iscrizioni" per la piscina corrente (richiede `pool_start`). Aprire genera un codice casuale; nel DB si salva solo l'hash, in `settings` (`enrollment_code_hash`, null = chiuse). Chiudere lo cancella: il QR vecchio smette di funzionare.
- Pagina da proiettare `/admin/enroll` (solo admin): QR grande con il link `<ORIGIN>/join/<codice>`, nome della piscina e contatore delle iscrizioni ricevute che si aggiorna in tempo reale (SSE).
- `/join/[code]` (pubblica nella guard, matrice e2e): codice non valido o iscrizioni chiuse → pagina "Le iscrizioni sono chiuse"; altrimenti, se non loggato, login 42 (campus Firenze, D6) e ritorno a `/join/[code]`. Da loggato: modale "Vuoi diventare Baywatcher di <Mese Anno>?" con conferma.
- Conferma (D11): il login entra in una **lista d'attesa**, tabella `enrollment_requests` (`login` UNIQUE, `created_at`). Log `WHITELIST_REQUEST`. Messaggio "Richiesta inviata: lo staff ti confermerà". Già in whitelist → "Sei già dentro"; già in attesa → "La tua richiesta è già in attesa".
- In `/admin/whitelist` la sezione "In attesa" con, per ogni richiesta, "Approva" e "Rifiuta", più "Approva tutti". Approvare sposta il login in whitelist (log `WHITELIST_ADD`, uno per login come oggi) e cancella la richiesta; rifiutare la cancella (log `WHITELIST_REJECT`). Il contatore della pagina da proiettare conta le richieste ricevute.
- "Chiudi piscina" con la casella whitelist svuota anche le richieste in attesa.
- Lo staff continua ad aggiungere e togliere a mano come oggi.
- Test: integration su apertura, chiusura, codice sbagliato, doppia iscrizione; e2e del flusso completo con login di sviluppo, con e senza JS; il redirect dopo il login resta sullo stesso sito (stesse regole di `/language`).
