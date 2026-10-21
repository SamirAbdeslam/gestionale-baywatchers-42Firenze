# Diario delle sessioni v2

Una voce per sessione di lavoro, la più recente **in fondo**. Non modificare le voci precedenti.
Regole e piano: `docs/v2/PLAN.md`.

## Formato di una voce

```
## AAAA-MM-GG — <modulo> — <stato a fine sessione: in corso | completato | bloccato>

**Fatto**
- <cosa è stato fatto, con i file principali>

**Commit**
- <hash breve> <messaggio>

**Controlli**
- `pnpm ci:local`: <verde | rosso, con il motivo>
- CI su GitHub: <link alla run, verde | rossa | non eseguita (nessun push)>

**Decisioni prese dentro il perimetro del piano**
- <scelte tecniche minori e perché; "nessuna" se non ce ne sono>

**Domande / blocchi**
- <cosa serve da Ismail per proseguire; "nessuno" se non ce ne sono>

**Prossimo passo**
- <primo compito della sessione successiva>
```

---

## Note di Ismail

Spazio per istruzioni o risposte di Ismail all'agent (conferme di decisioni, priorità, permessi). L'agent le legge a inizio sessione.

- 2026-10-16: confermate tutte le decisioni D1–D5 di `PLAN.md` §3.
- 2026-10-16: risposta al blocco di M0 (versioni).
  - Usa TypeScript 6.0.x (ultima patch della 6.0).
  - **Non** tornare a SvelteKit 2: lo stack è SvelteKit 3 + `@sveltejs/adapter-node` 6. `PLAN.md` §4.1 e §4.2 sono stati aggiornati di conseguenza.
  - pnpm 10 via Corepack, come hai già impostato.
  - `.gitignore`: oltre alle voci SvelteKit deve contenere `graphify-out/`, `*.db`, `*.csv`, `playwright-report/`, `test-results/`, `src/lib/paraglide/` (vedi M0 punto 3).
- 2026-10-16: §16.2 "attended come stringa '1'": approvata la proposta dell'agent. Schema SQLite fedele al legacy, il generatore inserisce '1' accettando la conversione a INTEGER, la normalizzazione dell'import (1, '1', true → true; altro → false) è coperta da un test unit. Il requisito di §16.2 va letto così.
- 2026-10-19: risposta al blocco Arctic. Rimuovi `arctic` prima di iniziare M3.
  - Sostituisci le due sole funzioni usate con codice scritto a mano, senza nuove dipendenze:
    - `generateState()` → `crypto.randomBytes(32).toString('base64url')` (da `node:crypto`);
    - URL di autorizzazione → `new URL(authorizeUrl)` con `URLSearchParams`: `client_id`, `redirect_uri`, `response_type=code`, `scope=public`, `state`;
    - scambio del codice → `fetch` POST su `https://api.intra.42.fr/oauth/token`, corpo `application/x-www-form-urlencoded` con `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`; risposta non 2xx = errore; corpo validato con Zod (`access_token` stringa non vuota obbligatoria, altri campi ignorati).
  - Nessun cambiamento di comportamento: stesse route, stesso cookie `oauth_state`, stessi redirect e stessi errori. I test esistenti con risposte 42 simulate devono passare senza modifiche alle aspettative; aggiungi un test unit per `state` (lunghezza, alfabeto base64url, valori diversi a ogni chiamata) e uno per la risposta token non valida.
  - `pnpm remove arctic`, lockfile aggiornato, nessun riferimento rimasto (`grep -r arctic src` vuoto).
  - Un commit `refactor(auth): replace arctic with built-in oauth client`, `pnpm ci:local` verde, push, CI verde. Solo dopo inizia M3.
  - `PLAN.md` §4.1 e §9.2 sono già aggiornati.
- 2026-10-19: correzioni dalla revisione di M3. **Da fare solo dopo aver chiuso M4** (commit, CI verde e voce di chiusura nel diario), **prima di iniziare M5**. Durante M4 potresti aver già sistemato alcuni punti: per ognuno verifica prima lo stato attuale del codice, salta quelli già risolti e scrivi nel diario quali erano già a posto. Un commit `fix(settings): address M3 review findings` (o più commit piccoli con lo stesso prefisso), poi `pnpm ci:local` verde, push, CI verde. Riferimenti di riga al commit `6999dea`.
  - **S1 (media)** `src/lib/server/realtime/bus.ts`: `publish()` chiama gli ascoltatori in modo sincrono, quindi un ascoltatore che lancia un'eccezione fa fallire l'azione dopo il commit e blocca gli altri ascoltatori. Isola ogni ascoltatore (`listeners()` + try/catch + `console.error` senza dati personali). Test unit: un ascoltatore che lancia non impedisce agli altri di ricevere l'evento e `publish()` non lancia.
  - **S2 (bassa)** date del pool: limita `start` e `end` agli anni 2000–2100 nello schema di `setPoolDates` (oggi `9999-12-31` produce un 500 al calcolo della fine). Test integration con `1999-12-31`, `2101-01-01` e `9999-12-31` → 400, nessuna scrittura.
  - **S3 (bassa)** `settings.ts` L11-18: settimana e limite accettano solo cifre (`/^\d{1,5}$/` prima della conversione). Oggi passano `"0x2"`, `"1e0"`, `" 2 "`. Test integration con questi valori → rifiutati.
  - **S4 (bassa)** `oauth42.ts` L82-85: aggiungi `redirect: 'error'` alla richiesta del profilo, come per lo scambio del token. Test unit: la richiesta del profilo ha `redirect === 'error'`.
  - **S5 (bassa)** `settings.ts` L45-59: per `UPDATE_SETTING` e `ACTIVATE_WEEK` salva `old_value`/`new_value` come descritto in `PLAN.md` §8.10 (aggiornato). Test integration sui valori registrati per ognuna delle quattro azioni.
  - **P1** §8.15: le form di M3 (date pool, settimana attiva, limite, reset display) usano `use:enhance` e la struttura `{ ok, messages }` con toast, come le form di M4. Funzionano anche senza JavaScript.
  - **P2** fine pool prima dell'inizio: messaggio specifico (nuova chiave i18n, es. `error_pool_end_before_start`) invece del generico "Dati non validi". Aggiorna l'e2e che oggi si aspetta "Dati non validi".
  - **P3** `setPoolDates` pubblica anche `event_changed` `{ eventId: null, week: null, action: 'update' }` dopo il commit, come descritto in `PLAN.md` §10 (aggiornato). Aggiorna il test integration sugli eventi pubblicati.
  - **T1** `playwright.config.ts`: togli `workers: 1` globale. Esegui in sequenza solo i test che modificano o confrontano la riga `settings` (`test.describe.configure({ mode: 'serial' })` o un progetto Playwright dedicato con `dependencies`), il resto torna parallelo. Il controllo di non modifica nella matrice dei permessi deve restare affidabile: se serve, escludi `settings.updated_at` dall'hash solo per i test che girano in parallelo e spiega la scelta nel diario.
  - **T2** e2e: POST da origine estranea (`origin: https://evil.example`) su `/admin?/setActiveWeek` con un admin loggato → 403 e nessuna scrittura né log.
  - **Ponytail 1** `settings.ts` L55, L58: non dedurre tipo di log e `resourceId` da `changes.activeWeek === undefined`; passali esplicitamente da chi chiama.
  - **Ponytail 2** `settings.ts` L22, L128: elimina `resetSchema`; `resetDisplayWeek` non legge input.
  - **Ponytail 3** `admin/+page.server.ts` L22 e `+page.svelte` L43: restituisci solo le date già formattate (`null` se assenti) invece di `dayDates` + `formattedDayDates`.
  - **Ponytail 4** `oauth42.ts` L21-31: sostituisci `createAuthorizationURL(endpoint, state, scopes)` con `authorizationUrl(state)` che usa internamente `AUTHORIZE_URL` e lo scope `public`; aggiorna chiamante e test.
  - Nessun cambiamento di comportamento oltre a quelli elencati. `PLAN.md` §8.10 e §10 sono già aggiornati.
- 2026-10-20: correzioni dalla revisione di M4, M5, M6 e della revisione M3. **Da fare dopo la chiusura di M6, prima di iniziare M7.** Se un punto è già risolto, saltalo e scrivilo nel diario. Riferimenti di riga al commit `e6be491`. Un commit per gruppo (`fix(events): ...`, `fix(registrations): ...`, `refactor: ...`), `pnpm ci:local` verde, push, CI verde.
  - **R1 (bassa)** input numerici: estendi la regola S3 (solo cifre prima della conversione) a tutti i domini. Sposta `digits` da `settings.ts` L11 a `dates.ts` (o al file condiviso più vicino) come funzione con lunghezza massima, es. `digits(5)` per settimana/limiti e `digits(10)` per gli id con `max(2147483647)`. Usala in `events.ts` L14-20 (`integer`, `week`, `weekday`, `id`), `registrations.ts` L43 (`idSchema`) e `whitelist.ts` L24 (`removeSchema`). Test integration: `"0x2"`, `"1e0"`, `" 2 "`, `""` rifiutati con 400 e nessuna scrittura per una action di ciascun dominio.
  - **R2 (bassa)** `events.ts`: le mutazioni bloccano la riga dell'utente ma non ricontrollano il ruolo. Come in `registrations.ts` L89-91, leggi la riga bloccata e chiama `assertAdmin` su di essa (non sull'utente di sessione) in `createEvent`, `updateEvent`, `deleteEvent` e `deleteMatching`. Test integration: utente declassato fra sessione e azione → 403, nessuna scrittura.
  - **R3 (media)** audit delle eliminazioni: applica la nuova regola di `PLAN.md` §8.10 (aggiornato). `deleteEvent` e `deleteMatching` leggono nella stessa transazione gli eventi da eliminare con le iscrizioni e li salvano in `old_value` (array JSON, eventi con `participants`). Vale anche per `APPLY_TEMPLATE` con sovrascrittura quando arriverà M8. Test integration: valori registrati per singolo, giorno, settimana e tutto, con e senza iscritti.
  - **R4 (bassa)** `Toast.svelte`: il pulsante di chiusura nasconde tutti i messaggi; deve chiudere solo il suo (stato per indice o lista dei chiusi). `removeParticipant` su login non iscritto oggi restituisce `messages: []` e l'admin non vede nulla: restituisci un warning (nuova chiave i18n, es. `registration_not_registered_login`, "<login> non è iscritto a questo evento"), senza scritture, log o notifiche. La disiscrizione propria dell'utente resta silenziosa come da §8.5.2. Aggiorna e2e.
  - **R5 (bassa)** `whitelist.ts` L45: un login ripetuto nello stesso invio (es. `Alpha … ALPHA`) finisce sia in "Aggiunti" sia in "Già presenti". Deduplica `valid` con `new Set` prima del ciclo; i "Già presenti" sono solo quelli già nel database. Correggi l'aspettativa di `tests/integration/whitelist.test.ts` L63 (oggi `'alpha, existing'` → `'existing'`).
  - **R6 (bassa)** `whitelist.ts` L17-23: `logins` senza lunghezza massima (limite solo `BODY_SIZE_LIMIT` 2M). Aggiungi `.max(5000)` allo schema. Test integration: 5001 caratteri → 400, nessuna scrittura né log.
  - **Ponytail 1** `Toast.svelte` L36-46: i quattro rami fanno la stessa chiamata `m[message.key](message.params)`. Tieni il ramo `error_weekly_limit` e un solo `{:else}`.
  - **Ponytail 2** `registrations.ts` L260-294: cinque wrapper identici. Sostituiscili con una funzione che riceve l'operazione (es. `const op = (operation: Operation) => (database, actor, input, info, now) => changeRegistration(...)`) o equivalente più corto.
  - **Ponytail 3** `registrations.ts` L55-61 e L126-136: semplifica i tipi di `failure` (niente `Exclude` annidati) e usa `failure` anche per `error_weekly_limit` invece del blocco scritto a mano.
  - **Ponytail 4** tre adattatori quasi uguali da action a contratto `{ ok, messages }`: `save` in `src/routes/admin/+page.server.ts`, `save` in `src/routes/admin/whitelist/+page.server.ts` e `registrationAction` in `src/lib/server/registration-actions.ts`. Uniscili in un solo helper (ZodError → 400 `error_invalid_input` o chiave specifica come `error_pool_end_before_start`; 404 → chiave passata dal chiamante; `status` del risultato → `fail`) e usalo in tutte e tre le pagine. Nessun cambiamento di risposte o messaggi.
  - Nessun altro cambiamento di comportamento. `PLAN.md` §8.10 è già aggiornato.
- 2026-10-20: seconda revisione di M4–M6 (dopo `3252bb5`). **Da fare prima di iniziare M7.** Riferimenti di riga al commit `3252bb5`. Commit piccoli (`fix(events): ...`, `refactor: ...`), `pnpm ci:local` verde, push, CI verde. Nessun cambiamento di comportamento oltre a R7.
  - **R7 (media)** `events.ts` L32-50: `eventDate` e `weekday` possono non coincidere. Esempio: evento di mercoledì (`weekday` 3) con `eventDate` `2026-10-26` (lunedì) appare nella colonna mercoledì, ma "passato" e date concrete usano il lunedì. Se `eventDate` è presente, il suo giorno della settimana (lunedì = 1) deve essere uguale a `weekday`, sia in `createSchema` sia in `updateSchema` (in modifica confronta con l'`eventDate` salvato, letto con il lock già presente). Errore con chiave i18n dedicata (es. `error_event_date_weekday`). Test integration: creazione e modifica incoerenti → 400, nessuna scrittura.
  - **Ponytail 5** sei copie di "lock utente + assertAdmin" (`events.ts` L106-108, L147-149, L204-206, L248-250; `whitelist.ts` L51-53, L115-117). Un solo helper `lockAdmin(tx, actor)` in `src/lib/server/auth/guards.ts` (o accanto a `audit.ts`) che restituisce la riga bloccata; usalo anche in `registrations.ts` per il ramo admin, se resta leggibile.
  - **Ponytail 6** `events.ts` L226-245: `deleteMatching` ricava `actionType`, `resourceId` e descrizione dallo `scope` con catene di ternari. I tre chiamanti (L289, L299, L309) passano esplicitamente `{ actionType, description, resourceId }`, come già fatto per le impostazioni in M3.
  - **Ponytail 7** `src/routes/admin/+page.svelte` L188-232: tre form di conferma eliminazione identiche (checkbox `confirm` + pulsante). Uno snippet `confirmDelete(action, hidden)` chiamato tre volte.
  - **Ponytail 8** regex dei login `^[a-z0-9_-]{1,32}$` ripetuta in `registrations.ts` L49, `auth.ts` L21 e due volte in `whitelist.ts` L48-49. Una costante `loginPattern` esportata da un solo file e usata ovunque; in `whitelist.ts` un solo passaggio che separa validi e non validi.
  - **Ponytail 9** `events.ts` L32-49 e L96-102: `superRefine` per custom, poi secondo `text.parse(parsed.title)` e `parsed.compensation!`. Sostituisci con `z.discriminatedUnion('kind', …)` (ramo `custom` con titolo e compenso obbligatori, ramo preset senza), così i dati arrivano già validati e tipizzati.
  - **Ponytail 10** `events.ts` L114-115: `capitalizeFirst` applicato una seconda volta (gli schemi `text`/`description` lo fanno già e i titoli dei preset sono già maiuscoli). Elimina le due chiamate.
  - **Ponytail 11** `Dialog.svelte`: `onMount`, `ready` e il ripiego `<details>` servono solo senza JavaScript. Prova le invoker commands native: `<button commandfor={id} command="show-modal">` per aprire e `command="close"` per chiudere, funzionano anche senza JavaScript. Tienile solo se gli e2e con e senza JavaScript passano su tutti i progetti Playwright; altrimenti lascia com'è e scrivilo nel diario.
  - **Ponytail 12** `registrations.ts`: lettura di `settings` + `isPassed` duplicata (L113-116 e L198-201) → una funzione locale `passed(tx, event, now)`; `insert` in `registrations` duplicato (L136 e L164) → un solo insert dopo i controlli dei due rami.
  - **Ponytail 13** `src/routes/admin/+page.svelte` L47, L84, L172: `[1, 2, 3, 4]` ripetuto. Una costante `weeks`.
  - **Ponytail 14** `whitelist.ts` L81: `[...new Set(duplicates)]` inutile, `valid` è già deduplicato a L49. Restituisci `duplicates` così com'è.

---

## Voci

## 2026-10-16 — M0 — bloccato

**Fatto**
- Letti integralmente `PLAN.md` e `SESSIONS.md`; confermate le decisioni D1–D5 e individuato M0 come primo modulo da eseguire.
- Verificati branch `v2.0.0`, working tree inizialmente pulito, identità git configurata e corrispondenza di HEAD con il branch remoto (`a71ecad`).
- Verificata la presenza del grafo Graphify esistente; nessuna generazione o modifica del grafo.
- Eseguiti i controlli preliminari degli strumenti prima di spostare il codice Flask o creare il progetto SvelteKit.
- Aggiornato solo lo stato di M0 nella tabella §19 del piano. Nessuna modifica al codice applicativo.

**Commit**
- Nessuno.

**Controlli**
- Node.js: `v24.15.0`; Corepack: `0.34.6`; pnpm disponibile: `11.28.5` (il piano richiede pnpm 10 via Corepack).
- `docker version` e `docker compose version`: falliti; Docker Desktop segnala che il comando non è disponibile in questa distribuzione WSL 2 e richiede di attivare l'integrazione WSL.
- `git ls-remote`: riuscito; il branch remoto `v2.0.0` punta ad `a71ecad`.
- `pnpm ci:local`: non eseguito; bootstrap non iniziato e Docker non disponibile.
- CI su GitHub: non eseguita (nessun push).

**Decisioni prese dentro il perimetro del piano**
- Nessuna. Arresto al primo errore di ambiente, come richiesto da §1.2.

**Domande / blocchi**
- Ismail deve rendere disponibile Docker nella distribuzione WSL corrente: Docker Desktop → Settings → Resources → WSL Integration, abilitare la distribuzione e applicare le impostazioni. Verificare poi `docker version` e `docker compose version`.
- Non sono stati tentati metodi alternativi né installazioni.

**Prossimo passo**
- Dopo la risoluzione del blocco, verificare Docker, attivare pnpm 10 via Corepack come prescritto e iniziare M0 dal punto 1: spostamento Flask in `legacy/` con commit dedicato.

## 2026-10-16 — M0 — bloccato

**Fatto**
- Ripresa dopo la disponibilità di Docker comunicata da Ismail; verificati client, daemon e Compose.
- Spostati in `legacy/` i 32 file Flask indicati in M0, con contenuti identici verificati tramite gli stati `R100` di git. La cartella rimane di sola lettura.
- Creato nella root lo scheletro con `sv@1.1.1`, template minimale TypeScript e gli add-on Prettier, ESLint, Vitest (solo unit), Playwright (senza demo), adapter-node, Drizzle/Postgres e Paraglide (solo italiano, senza demo), senza installare le dipendenze del progetto.
- Il generatore corrente imposta SvelteKit 3: lo scheletro deve ancora essere allineato a SvelteKit 2 e adapter-node 5, come richiesto dal piano. Nessuna implementazione dei moduli successivi.
- Consultati i metadati del registro npm per verificare versioni stabili e compatibilità prima dell'installazione con versioni esatte.

**Commit**
- `e6cfa29` `chore: move flask app to legacy/`

**Controlli**
- Docker client/server: `29.8.1`; Docker Compose: `v5.5.1`; controlli riusciti.
- Node.js: `v24.15.0`; pnpm 10 eseguito tramite `corepack pnpm@10`: `10.34.7`.
- Verificati 32 spostamenti git con contenuti identici (`R100`), compresi i due file binari.
- Registro npm: TypeScript stabile `7.0.2`; SvelteKit `2.70.3` richiede TypeScript `^5.3.3 || ^6.0.0`; svelte-check `4.7.6` richiede `^5.0.0 || ^6.0.0`; typescript-eslint `8.71.2` richiede `>=4.8.4 <6.1.0`.
- `pnpm ci:local`: non eseguito; dipendenze del progetto non installate, configurazione bootstrap incompleta.
- CI su GitHub: non eseguita (nessun push).

**Decisioni prese dentro il perimetro del piano**
- Usato pnpm 10 tramite Corepack senza modificare il pnpm globale.
- Nessuna deroga autonoma alla regola sulle versioni di §4.2.

**Domande / blocchi**
- §4.2 impone l'ultima release stabile di ogni pacchetto, ma TypeScript 7.0.2 non rientra nei peer dependency supportati dagli strumenti richiesti. Serve conferma di Ismail per usare l'ultima TypeScript 6.0.x compatibile, mantenendo lo stack previsto.
- Scheletro generato ancora provvisorio: versioni non fissate, configurazione SvelteKit 3 da adattare a 2, esempi e file generati da ripulire, `.gitignore` da completare secondo M0.

**Prossimo passo**
- Dopo la risposta di Ismail, allineare lo scheletro allo stack consentito, fissare tutte le versioni esatte e proseguire M0 dal punto 2. Non fare push prima dei controlli locali verdi e del completamento di M0.

## 2026-10-16 — M0 — bloccato

**Fatto**
- Riletti integralmente piano e diario. Applicate le nuove indicazioni di Ismail: SvelteKit 3, adapter-node 6, TypeScript 6.0.x e pnpm 10 tramite Corepack.
- Installate e fissate le versioni esatte delle dipendenze necessarie a M0; aggiunti lockfile, `.nvmrc`, engines, configurazione strict, lint e formattazione. Ripristinate le esclusioni richieste in `.gitignore`.
- Rimossi gli esempi generati; aggiunti landing italiana, header provvisorio, token CSS, stili accessibili e copie verificate dei due asset originali. Paraglide usa solo italiano e le strategie cookie, preferredLanguage, baseLocale.
- Aggiunti `src/lib/server/env.ts` con validazione Zod e vincolo localhost per il login di sviluppo, connessione Postgres e `/healthz` con risposte 200/503 prive di dettagli interni.
- Aggiunti stack Docker/nginx, workflow con i sei job richiesti e test unit, integration ed e2e. Con SvelteKit 3 la CSP è configurata in `vite.config.ts`, dove il framework colloca la configurazione.
- Migrazioni avviate nell'hook init; journal Drizzle vuoto e schema applicativo rinviato a M1. I comandi seed/import sono segnaposto espliciti per M1, senza simulare importazioni riuscite.
- File aggiuntivi necessari: `.dockerignore` esclude segreti, legacy e output generati dall'immagine; `scripts/init-dev-db.sql` crea il DB separato `baywatchers_test`; `scripts/bootstrap.ts` centralizza i segnaposto temporanei; configurazioni standard prodotte dagli add-on ufficiali.
- Sostituita la sola `.env` segnaposto generata dalla CLI con i valori locali di `.env.example`; per la prova dello stack completo il database punta al servizio `db`. Nessuna credenziale OAuth reale richiesta o inserita.
- Arrestato il servizio di sviluppo senza eliminare volumi e avviato lo stack completo. Nessuna modifica al legacy dopo lo spostamento.

**Commit**
- Nessun nuovo commit in questa ripresa. Rimane `e6cfa29` per lo spostamento Flask; il bootstrap è nel working tree.

**Controlli**
- `pnpm ci:local`: verde con 18 unit test, 1 integration su Postgres reale, build e 4 e2e su Chromium desktop e mobile; lint e svelte-check senza errori.
- Dopo l'aggiunta del caso ORIGIN malformata: `pnpm test:unit` verde con 19 test. Il gate completo va ripetuto dopo la risoluzione dell'healthcheck.
- Copie dei due asset identiche al legacy; versioni esatte verificate; `git diff --check` verde.
- Build Docker riuscita anche escludendo i file generati locali. Il runtime gira come utente `node` (uid 1000).
- Via nginx: `/` e `/healthz` rispondono 200, HTML italiano, CSP e header di sicurezza presenti.
- `docker compose up -d --build --wait`: fallito perché il container app risulta unhealthy. Il wget dell'healthcheck su localhost restituisce connection refused.
- Diagnostica nel container: localhost risolve prima a `::1` e poi a `127.0.0.1`; IPv4 risponde 200, `::1` restituisce ECONNREFUSED. Node fetch riesce anche con localhost grazie al fallback, mentre il wget di Alpine fallisce.
- Accesso GitHub già configurato e verificato; nessun login eseguito.
- CI su GitHub: non eseguita (nessun push).

**Decisioni prese dentro il perimetro del piano**
- Dipendenze dei moduli successivi non ancora aggiunte. Schema, seed e import applicativi restano a M1.
- Rimosso lo stile inline generato nel documento HTML per rispettare la CSP senza unsafe-inline.
- Database di test verificato come `baywatchers_test` prima di aprire connessioni e prima di avviare l'app e2e.
- Nessuna modifica autonoma all'URL dell'healthcheck prescritto in §15.1.

**Domande / blocchi**
- §15.1 prescrive `wget -qO- http://localhost:3000/healthz`, che fallisce nell'immagine Alpine per la risoluzione IPv6 mentre il server ascolta su IPv4. Serve conferma di Ismail per cambiare soltanto l'URL in `http://127.0.0.1:3000/healthz`.
- Lo stack è lasciato avviato: landing disponibile su `http://localhost`, ma container app unhealthy. Nessun push finché il controllo non passa.

**Prossimo passo**
- Dopo la conferma, correggere l'URL dell'healthcheck, ricostruire e verificare lo stack, ripetere `pnpm ci:local`, committare il bootstrap e completare push e verifica CI. Non iniziare M1 prima di completare M0.

**Versioni installate**
- Node.js `24.15.0`; Corepack `0.34.6`; pnpm `10.34.7`.
- `drizzle-orm` `0.45.4`.
- `postgres` `3.4.9`.
- `zod` `4.6.7`.
- `@eslint/js` `10.0.1`.
- `@inlang/paraglide-js` `2.29.0`.
- `@playwright/test` `1.64.1`.
- `@sveltejs/adapter-node` `6.0.0`.
- `@sveltejs/kit` `3.1.0`.
- `@sveltejs/vite-plugin-svelte` `7.3.1`.
- `@types/node` `24.19.2`.
- `drizzle-kit` `0.31.11`.
- `eslint` `10.12.0`.
- `eslint-config-prettier` `10.1.8`.
- `eslint-plugin-svelte` `3.23.1`.
- `globals` `17.13.0`.
- `prettier` `3.9.10`.
- `prettier-plugin-svelte` `4.1.1`.
- `svelte` `5.57.2`.
- `svelte-check` `4.7.6`.
- `tsx` `4.23.15`.
- `typescript` `6.0.3`.
- `typescript-eslint` `8.71.2`.
- `vite` `8.3.4`.
- `vitest` `5.0.5`.

## 2026-10-16 — M0 — in corso

**Fatto**
- Ismail ha approvato in chat il solo cambio dell'healthcheck da localhost a `127.0.0.1`. Applicata la correzione nel Dockerfile senza modificare le altre prescrizioni del piano.
- Completata l'implementazione locale di M0; restano push e verifica della CI prima di segnare il modulo completato.

**Commit**
- `7f52fb0` `feat: bootstrap sveltekit application`
- `4084e73` `chore: add local docker stack and ci checks`

**Controlli**
- `pnpm ci:local`: verde con 19 unit test, 1 integration su `baywatchers_test`, build e 4 e2e desktop/mobile. Lint e svelte-check verdi.
- `docker compose up -d --build --wait`: verde; app e database healthy. `/` e `/healthz` rispondono 200 via nginx.
- `db:migrate` verificato sul database di test con il journal iniziale vuoto.
- Legacy invariato dal commit di spostamento; copie dei due asset identiche.
- CI su GitHub: non ancora eseguita (push successivo a questa voce).

**Decisioni prese dentro il perimetro del piano**
- URL IPv4 nell'healthcheck, con autorizzazione esplicita di Ismail.
- Stack completo e stack di sviluppo verificati in sequenza, preservando entrambi i volumi. La `.env` locale è configurata per lo stack completo con host DB `db`.

**Domande / blocchi**
- Nessuno. Seed e import restano segnaposto espliciti fino a M1, come consentito per il bootstrap.

**Prossimo passo**
- Push dei commit di M0, verifica della CI con `gh run watch --exit-status`, registrazione dell'esito e aggiornamento dello stato del modulo. Non iniziare M1 in questa sessione.

## 2026-10-16 — M0 — completato

**Fatto**
- Completato M0 sul branch `v2.0.0`, con push e CI verde. Aggiornato esclusivamente lo stato di M0 nella tabella §19.
- Stack completo lasciato avviato su `http://localhost`, con app e Postgres healthy e `/healthz` a 200.
- Nessun modulo successivo iniziato; legacy preservato.

**Commit**
- `e6cfa29` `chore: move flask app to legacy/`
- `7f52fb0` `feat: bootstrap sveltekit application`
- `4084e73` `chore: add local docker stack and ci checks`
- `1537ce2` `docs: record M0 bootstrap validation`

**Controlli**
- `pnpm ci:local`: verde, 19 unit test, 1 integration con Postgres reale, build e 4 e2e Chromium desktop/mobile.
- `docker compose up -d --build --wait`: verde dopo la correzione IPv4 approvata da Ismail. Runtime non root, asset originali verificati, header di sicurezza presenti.
- CI su GitHub: [run 38899952445](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/38899952445), verde su `1537ce2`; tutti i sei job completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- Il job legacy-import verifica il collegamento dei comandi di bootstrap: generazione, import e verifica dei dati sono ancora segnaposto espliciti, da sostituire in M1.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore scelta rispetto alle voci precedenti e all'autorizzazione per l'healthcheck IPv4.

**Domande / blocchi**
- Nessuno per M0. Login OAuth e funzionalità applicative restano nei moduli previsti.

**Prossimo passo**
- M1: schema Postgres, prima migrazione applicativa, dati fittizi, import/verifica legacy, seed, dominio dates/kinds e relativi test. Rileggere piano e ultima voce del diario prima di iniziare.

## 2026-10-16 — M0, porte locali e HTTPS — completato

**Fatto**
- Su comando esplicito di Ismail, sostituita la porta 80 con 8080 e 8443. Alla richiesta di chiarimento, Ismail ha scelto HTTPS sulla 8443 con certificato locale autofirmato.
- nginx ascolta su 8080 per il redirect 308 a `https://localhost:8443`, preservando percorso e query, e su 8443 per HTTPS. Nessun listener o mapping sulla porta 80 nel nuovo stack.
- Aggiornati `compose.yaml`, nginx, `.env.example` e `.env` locale con `ORIGIN=https://localhost:8443`. L'header Host inoltrato mantiene la porta tramite `$http_host`.
- Generato un certificato RSA 2048/SHA-256, valido 365 giorni, con SAN localhost, 127.0.0.1 e ::1. Chiave privata con permessi 600 e cartella con permessi 700; certificati esclusi da Git e contesto Docker, montati in sola lettura su nginx.
- Su questa istruzione di Ismail, aggiornate le parti pertinenti del piano: perimetro TLS, ORIGIN, porte, configurazione nginx, URL locale, callback OAuth e criterio di completamento M0. Nessuna altra variazione di scope. Aggiunto al README il comando riproducibile per generare il certificato senza sovrascrivere file esistenti.
- Stack completo lasciato avviato su HTTPS 8443; nessun cambiamento al legacy o ai moduli successivi.

**Commit**
- `35e0807` `chore: serve locally on ports 8080 and 8443`

**Controlli**
- `pnpm ci:local`: verde, 19 unit test, 1 integration, build e 4 e2e.
- `docker compose up -d --wait`: verde, app e Postgres healthy. `nginx -t`: verde.
- Verificati redirect 308 con percorso/query, landing e `/healthz` HTTPS a 200 usando il certificato locale come CA esplicita, senza disattivare la verifica TLS.
- Smoke test browser: redirect a HTTPS, landing italiana, nessun errore di pagina, nessuno scroll orizzontale a 360 px. Il certificato autofirmato è stato accettato soltanto nel contesto browser di test.
- Verificati SAN e validità del certificato, permessi della chiave, esclusione da Git e Docker, sole porte pubblicate 8080/8443.
- CI su GitHub: [run 38901393161](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/38901393161), verde su `35e0807`, tutti i sei job; `gh run watch --exit-status` terminato con exit code 0.

**Decisioni prese dentro il perimetro del piano**
- HTTP reindirizza all'unica origine HTTPS, così cookie Secure, CSRF e futuri redirect OAuth usano la stessa origine.
- Certificato locale autofirmato, come scelto da Ismail; nessuna modifica all'archivio dei certificati attendibili del sistema.

**Domande / blocchi**
- Nessuno. Il browser mostra l'avviso previsto per il certificato autofirmato. Il login 42 reale resta da verificare in M2, con callback `https://localhost:8443/auth/callback`.

**Prossimo passo**
- M1 secondo il piano; nessuna implementazione M1 avviata in questa sessione.

## 2026-10-16 — M1 — bloccato

**Fatto**
- Riletti integralmente `PLAN.md` e il diario; individuato M1 come primo modulo non completato. Branch `v2.0.0` inizialmente pulito e allineato al remoto.
- Consultato Graphify per `init_db`, `compute_week_day_dates`, `is_event_passed` e `capitalize_event_title`. Il grafo conserva i percorsi precedenti allo spostamento; verificati i riferimenti direttamente in `legacy/app.py`, rimasto invariato.
- Letti schema SQLite effettivo e requisiti M1 prima di creare schema Postgres, generatore o import.
- Riprodotta in SQLite in memoria l'incompatibilità tra lo schema fedele richiesto e il caso attended testuale richiesto da §16.2.

**Commit**
- Nessuno in questa ripresa.

**Controlli**
- Legacy: `ALTER TABLE registrations ADD COLUMN attended BOOLEAN DEFAULT 1` in `legacy/app.py:653`.
- Prova SQLite: creazione di una colonna BOOLEAN, inserimento del parametro stringa `'1'`, lettura di `attended` e `typeof(attended)`; risultato `(1, 'integer')`. Ripetuta con INTEGER, stesso risultato. Nessun DB su disco creato o modificato.
- `pnpm ci:local`: non eseguito; nessuna modifica al codice applicativo.
- CI su GitHub: non eseguita (nessun push).

**Decisioni prese dentro il perimetro del piano**
- Nessuna deroga autonoma ai requisiti. Non alterato il tipo della colonna per forzare il caso testuale.

**Domande / blocchi**
- §16.1 richiede uno schema SQLite fedele al legacy, quindi `attended BOOLEAN` con affinità numerica. §16.2 richiede almeno una riga con attended salvato come stringa `'1'`, ma SQLite converte automaticamente tale testo in INTEGER all'inserimento. I due requisiti non sono simultaneamente soddisfacibili alla lettera.
- Proposta da confermare da Ismail: mantenere lo schema fedele, inserire anche il parametro stringa `'1'` nel generatore accettando la conversione SQLite a INTEGER, e verificare separatamente con un test unitario che la normalizzazione dell'import accetti la stringa `'1'` come true. Non applicata in attesa della risposta.

**Prossimo passo**
- Dopo il chiarimento di Ismail, iniziare l'implementazione M1 da schema Postgres e prima migrazione, quindi dominio dates/kinds e generatore/import con i rispettivi test. Nessuna dipendenza aggiunta e nessun codice M1 scritto in questa ripresa.

## 2026-10-16 — M1 — implementazione e controlli locali

**Fatto**
- Ripreso M1 dopo la conferma di Ismail nelle note: schema SQLite fedele, parametro attended `'1'` inserito dal generatore e conversione a INTEGER accettata; normalizzazione separata coperta da test unitari.
- Definite le nove tabelle Postgres di §7, enum, vincoli, indici, cancellazioni in cascata e conservazione dei log tramite `ON DELETE SET NULL`. Generata la prima migrazione, con inserimento della riga `settings.id = 1`; mantenuto il collegamento Drizzle già presente in `db/index.ts`.
- Aggiunti dominio date/pool/fuso Europe/Rome e inferenza/preset eventi, con test per limiti temporali, weekend, anni bisestili e ora legale.
- Copiato lo schema SQLite effettivo di `legacy/app.py:init_db`, senza modificare `legacy/`. Il generatore produce due file identici con lo stesso seed: 60 utenti, 60 eventi, 362 iscrizioni con due duplicati, 40 whitelist, tre template e 21 relativi eventi, 500 log e righe nelle tre tabelle push.
- Implementati import transazionale, report stdout/JSON, rifiuto della destinazione non vuota, conferma esatta `yes` per `--force-empty`, rollback del dry run, normalizzazione e deduplica previste dal piano. Il dry run non modifica neppure le sequence, perché `setval` non è transazionale.
- Conservati i microsecondi dei timestamp Python, evitando il passaggio implicito del driver attraverso `Date`. Interpretazione del fuso verificata in inverno, estate e nei cambi d'ora.
- Implementata verifica indipendente con conteggi e aggregazioni SQL sul legacy; ore e Altarian Postgres calcolati dal dominio. Implementato seed diretto Postgres con `dev_admin`, `dev_user`, `dev_outsider` e settimana 1 contenente la data corrente in Europe/Rome.
- Sostituiti tutti i segnaposto M0 nei comandi CLI e rimosso `scripts/bootstrap.ts`. I job CI integration/e2e/legacy-import già collegati a quei comandi ora eseguono operazioni reali. Il controllo locale applica migrazioni e seed esclusivamente a `baywatchers_test`.
- Aggiunte soltanto dipendenze consentite, con versioni esatte: `@faker-js/faker` 10.6.0, `better-sqlite3` 13.0.3, `@types/better-sqlite3` 9.6.0; autorizzata la compilazione nativa SQLite in pnpm.

**Commit**
- `1594387` `chore(deps): add legacy fixture dependencies`
- `324a642` `feat(db): define application schema and date domain`
- `c65209e` `feat(db): add legacy import verification and development seed`

**Controlli**
- `pnpm ci:local`: verde, 50 test unitari, 11 integration con Postgres reale, build e quattro e2e Chromium desktop/mobile; svelte-check senza errori o warning.
- Sequenza CLI reale `legacy:fake-db -- --out ... --seed 42`, `legacy:import -- --sqlite ... --dry-run --report ...`, import effettivo e `legacy:verify`: verde. Verifica finale: 60 eventi, 63 partecipanti; report con due duplicati scartati e tre righe push ignorate.
- `db:seed --seed 42`: verde, 60 utenti e 60 eventi; ruoli e whitelist degli utenti dev verificati anche con query Postgres nei test.
- Test di regressione: rollback completo su errore FK; destinazione non vuota; conferma mancante/errata; dry run con e senza svuotamento; conservazione di dati, impostazioni e sequence; deduplica per data più vecchia; normalizzazione giorni/login/orari/presenza; eventi saltati e capienza corretta; mapping attore tramite intra_id; JSON oggetto/scalare e repr Python; precisione dei timestamp; vincoli e cascade; verifica che rileva alterazioni dei compensi e delle iscrizioni.
- `pnpm db:generate` dopo l'implementazione: nessuna differenza tra schema e snapshot. `git diff --check`: verde; `legacy/` invariata.
- CI remota: da verificare dopo il push del modulo, secondo §1.3.

**Decisioni prese dentro il perimetro del piano**
- File aggiuntivi `scripts/legacy/{cli,data,fixtures,normalize}.ts`: condividono parsing degli argomenti, dati deterministici e conversioni tra generatore, import e seed senza duplicarli. Il seed riusa i dati in memoria e scrive direttamente Postgres, senza creare o leggere SQLite.
- `domain/reports.ts` contiene solo il calcolo puro dei totali necessario alla verifica di §16.4; pagine e CSV restano in M11.
- L'esclusione Prettier è limitata a `/legacy/`, affinché i nuovi script in `scripts/legacy/` siano formattati.
- Il generatore disabilita l'enforcement FK SQLite come il runtime Python legacy: i log usano intra_id, pur dichiarando una FK a users.id nello schema storico.
- Graphify usato per localizzare le funzioni legacy; riferimenti verificati sul sorgente dopo lo spostamento. Nessuna ricostruzione del grafo. Applicati Ponytail e Caveman alla sessione.

**Domande / blocchi**
- Nessuno aperto per l'implementazione M1. DB di produzione non disponibile: validazione limitata ai dati fittizi e alle anomalie simulate, come previsto da §16.

**Prossimo passo**
- Verificare stack HTTPS ricostruito e CI remota, poi registrare la chiusura M1. Non iniziare M2 in questa sessione.

**Verifica stack locale**
- `docker compose up -d --build --wait`: verde, app/Postgres/nginx healthy. Migrazione applicata automaticamente al DB dello stack completo: nove tabelle applicative e riga unica impostazioni verificati con SQL.
- Landing HTTPS e `/healthz` a 200 con certificato locale usato come CA esplicita; redirect 308 dalla 8080 alla 8443 preserva percorso e query. Stack completo lasciato avviato; nessun volume eliminato.


## 2026-10-16 — M1 — chiusura

**Fatto**
- Completato M1 sul branch `v2.0.0`, dopo i controlli locali e la CI remota. Aggiornata solo la colonna Stato di §19, indicando il commit funzionale `c65209e`.
- Conservate le note di Ismail e tutte le voci precedenti del diario, inclusa la registrazione del blocco poi risolto.

**Commit**
- `1594387`, `324a642`, `c65209e`: dipendenze, schema/dominio e strumenti M1.
- `f50fb03` `docs: record M1 implementation and local validation`.

**Controlli**
- CI [run 38905446472](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/38905446472), verde su `f50fb03`: lint/check, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- `pnpm ci:local` verde: 50 unit, 11 integration, quattro e2e e build. Generazione/import/verifica CLI e seed reali verificati come registrato sopra.
- Stack completo lasciato avviato: app e Postgres healthy, nginx running (senza healthcheck dedicato); HTTPS 8443 e redirect HTTP 8080 verificati. Precisazione rispetto alla voce precedente: per nginx il controllo Compose attesta l'avvio, non un healthcheck.
- Working tree pulito dopo i commit di implementazione e prima di questa registrazione finale; nessuna modifica al legacy.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessuno per M1. Il file SQLite di produzione rimane indisponibile e non è stato verificato; l'import è coperto con fixture deterministiche e anomalie simulate.

**Prossimo passo**
- M2: auth 42, sessioni, guard e layout. Non iniziato in questa sessione; rileggere piano e diario prima di procedere.


## 2026-10-16 — M2 — bloccato

**Fatto**
- Riletti piano, note di Ismail e chiusura M1. Confermata D5; branch `v2.0.0` inizialmente pulito e allineato al remoto su `e6c310c`.
- Consultato Graphify per login, callback e guard legacy; verificati i riferimenti in `legacy/app.py` e lette le parti del bootstrap coinvolte in M2.
- Esaminati i tipi locali di SvelteKit per distinguere pagine ed endpoint nella guard globale e consultata la documentazione ufficiale degli hook.
- Nessuna implementazione M2 o installazione avviata. Aggiornata solo la colonna Stato del piano.

**Commit**
- Nessuno; nessun push.

**Controlli**
- Lettura della documentazione Arctic `https://arcticjs.dev/guides/oauth2/`: fallita. Il tool web segnala un redirect verso `https://arctic.pilcrowonpaper.com/guides/oauth2/`, dominio non accessibile dal tool, con errore non ripetibile.
- `pnpm ci:local`: non eseguito, nessuna modifica al codice.
- CI remota: non eseguita, nessun push.

**Decisioni prese dentro il perimetro del piano**
- Nessuna alternativa tentata dopo l'errore di accesso, in applicazione di §1.2 e delle regole di Ismail.

**Domande / blocchi**
- Confermare se proseguire verificando l'API sul codice e sui tipi del pacchetto npm ufficiale `arctic`, la cui installazione è già prevista da §4 per M2, al posto della pagina web non accessibile.

**Prossimo passo**
- Dopo la risposta di Ismail, riprendere M2: sessioni e OAuth, guard default-deny, login dev, audit/bus, layout e matrice di autorizzazione.


## 2026-10-16 — M2 — bloccato su origine e CSRF con adapter-node 6

**Fatto**
- Ripreso M2 dopo il consenso di Ismail a verificare Arctic dal pacchetto npm ufficiale. Installato `arctic` 3.7.0, versione stabile corrente richiesta dal piano; npm lo dichiara deprecato. Nessuna libreria alternativa introdotta.
- Verificati sorgente e tipi di `OAuth2Client` nel pacchetto installato, senza ulteriori accessi alla pagina web non disponibile.
- Implementati, ancora da consolidare, sessioni con token base32 di 20 byte e hash SHA256, scadenza/rinnovo, cookie, OAuth/state, login dev, upsert profili/ruoli, audit LOGIN e bus in memoria.
- Aggiunti guard default-deny tramite manifest SvelteKit, locals.user, gestione errori compatibile con SvelteKit 3, layout/menu mobile, messaggi italiani e segnaposto per pagine, endpoint e action del piano. I segnaposto non modificano dati e restituiscono 501 per le operazioni future.
- Aggiunti test unit, integration e matrice e2e con scansione delle route e action admin. Estesa l'eccezione Git per le directory route `.csv`, altrimenti escluse dal pattern dei dati CSV; centralizzata ACTION_TYPES nel dominio audit. Integration eseguite senza parallelismo fra file perché condividono il DB isolato.
- Stack completo temporaneamente fermato per utilizzare compose.dev con il DB dei test. Nessun volume eliminato. Interruzione prima di modificare configurazione dell'origine o protezione CSRF.

**Commit**
- `17dccad` `chore(deps): add arctic oauth client` (solo locale).
- Implementazione M2 ancora non committata; nessun push.

**Controlli**
- `pnpm check`: verde, nessun errore o warning.
- `pnpm lint`: verde.
- `pnpm test:unit`: verde, 82 test, compresi callback OAuth simulati e gestione errori senza token nei log.
- `pnpm test:integration`: verde, 16 test, comprese sessioni, cambio ruolo immediato, audit transazionale e rollback senza pubblicazione.
- Seed e build: verdi. `pnpm test:e2e`: rosso, 6 passati e 14 falliti. Causa comune dei fallimenti: POST same-origin su HTTP rifiutati con 403 `Cross-site POST form submissions are forbidden`, incluso il form reale nel browser.
- Trace verificata: Origin della richiesta `http://localhost:4173`, URL del test sulla stessa origine. Nessun errore di rete o DB: rifiuto del controllo CSRF nativo.
- Sorgente installato: `@sveltejs/adapter-node/src/env.js` non include più ORIGIN; `src/handler.js` legge l'origine dalla configurazione del build oppure usa `get_origin`, il cui protocollo di fallback è HTTPS. `@sveltejs/kit/src/runtime/server/csrf.js:get_self_origin` dà precedenza a `kit.paths.origin`; il plugin Vite lo incorpora nel build tramite `__SVELTEKIT_PATHS_ORIGIN__`.
- `pnpm ci:local`: non eseguito fino al completamento, essendo gli e2e rossi. CI remota non eseguita, nessun push.

**Decisioni prese dentro il perimetro del piano**
- Connessione DB caricata solo nelle richieste runtime, affinché la build non richieda credenziali o un DB.
- Test OAuth con fetch simulato; nessuna chiamata reale all'API 42 e nessuna credenziale richiesta.
- Nessuna disattivazione del CSRF e nessuna origine aggiunta a trustedOrigins.

**Domande / blocchi**
- Il piano §6 considera ORIGIN una variabile runtime di adapter-node; ciò non corrisponde ad adapter-node 6, approvato nelle note. Serve autorizzazione per aggiornare il piano e usare `kit.paths.origin` con ORIGIN in fase di build, propagandola coerentemente a build locale, test, Docker e CI. Questa soluzione richiede di ricostruire l'immagine quando cambia l'origine pubblica.
- Alternativa non applicata: fidarsi degli header del proxy; richiederebbe dichiarare e testare tale configurazione anche nel server HTTP diretto degli e2e. Nessuna alternativa tentata dopo la diagnosi.
- Login 42 reale resta il passo manuale di Ismail previsto da M2 e non blocca il push; il blocco attuale è il rifiuto dei form locali.

**Prossimo passo**
- Dopo la scelta di Ismail, correggere la configurazione dell'origine, completare i test e2e, eseguire ci:local, ripristinare lo stack HTTPS e concludere M2 con push e CI verde.

**Ripristino ambiente prima della richiesta di conferma**
- Fermato compose.dev e riavviato lo stack completo con l'immagine M1 già esistente, senza build: app e Postgres healthy, nginx avviato sulle porte 8080/8443. Nessun volume eliminato. Il codice M2 resta nel working tree, non nell'immagine in esecuzione.


## 2026-10-19 — M2 — bloccato su Docker WSL

**Fatto**
- Ripreso M2 dopo il comando esplicito di Ismail, che autorizza l'aggiornamento del piano e della configurazione per `kit.paths.origin` con ORIGIN in fase di build.
- Configurato Vite/SvelteKit per leggere ORIGIN dall'ambiente o da `.env` e validarla tramite uno schema Zod condiviso con la configurazione runtime. Aggiornati Dockerfile, build arg Compose, build Docker in CI e build di ci:local, che usa `http://localhost:4173`.
- Aggiornati i soli punti del piano coinvolti nell'autorizzazione: configurazione ORIGIN, build Docker/Compose/CI e uso locale. Documentato anche in `.env.example` e README che origine di build e runtime devono coincidere e che cambiarla richiede una nuova build.
- Aggiunti quattro casi unitari per rifiutare un'origine con percorso, query, credenziali o frammento. Nessuna modifica a CSRF o trustedOrigins.
- Consultato Graphify; il grafo contiene ancora il corpus legacy, quindi la configurazione SvelteKit corrente è stata verificata sui file effettivi.

**Commit**
- Nessun nuovo commit o push. Rimane locale il precedente `17dccad` per Arctic; il resto di M2 è nel working tree.

**Controlli**
- Prettier sui file di configurazione e sui test modificati: verde.
- Primo comando Docker della ripresa, `docker compose down`: fallito perché il comando docker non è disponibile nella distribuzione WSL. Il messaggio richiede di attivare WSL Integration in Docker Desktop.
- Nessun arresto o avvio di container effettuato: il comando non è stato trovato. Stato attuale dei container non verificabile da questa sessione.
- Nessun tentativo alternativo o installazione. Check, test, ci:local e CI remota non eseguiti in questa ripresa; restano valide soltanto come risultati storici le verifiche della voce precedente.

**Decisioni prese dentro il perimetro del piano**
- Applicata la correzione ORIGIN autorizzata da Ismail. Arresto al primo errore di ambiente, come prescritto da §1.2.

**Domande / blocchi**
- Riattivare l'integrazione della distribuzione corrente in Docker Desktop → Settings → Resources → WSL Integration, quindi verificare `docker version` e `docker compose version`.

**Prossimo passo**
- Quando Docker torna disponibile, riprendere i test M2 con compose.dev, correggere eventuali errori del codice, eseguire ci:local e verificare lo stack HTTPS ricostruito, quindi commit/push e CI verde. L'autorizzazione alla correzione ORIGIN rimane acquisita.

## 2026-10-19 — M2 — implementazione e controlli locali completati

**Fatto**
- Ripreso il lavoro dopo il riavvio Docker comunicato da Ismail: client, daemon e Compose nuovamente disponibili. Risolto il blocco precedente senza installazioni o percorsi alternativi.
- Applicata la correzione ORIGIN già approvata: `kit.paths.origin` legge il valore validato nella build; Compose lo inoltra come build arg, il job Docker usa lo stesso argomento e ci:local compila per `http://localhost:4173`. README, `.env.example` e punti pertinenti del piano aggiornati come autorizzato. Origine di build e runtime devono coincidere; modificarla richiede una nuova build.
- Completati sessioni, OAuth, login dev, locals.user, guard default-deny, gestione errori, audit LOGIN, bus publish/subscribe e layout con navigazione responsive. Ruolo letto dal DB a ogni richiesta; upsert OAuth ricalcola il ruolo secondo D5. Login e audit condividono la transazione; pubblicazione soltanto dopo il commit.
- Aggiunti tutti i segnaposto di §8.1, inclusi download e action, affinché l'autorizzazione sia già verificabile. Le operazioni future restituiscono 501 e non modificano dati; il trasporto SSE rimane in M9. Il display segnaposto rispetta già il token configurabile e il bypass admin.
- Centralizzata ACTION_TYPES nel dominio audit e riusata nel generatore M1. Mantenuto il legacy invariato e conservate tutte le precedenti voci del diario.
- Nessuna nuova dipendenza oltre ad Arctic previsto dal piano. La versione installata, 3.7.0, è dichiarata deprecata dal registro npm; mantenuta la scelta prescritta senza sostituzioni autonome.

**Commit**
- `17dccad` `chore(deps): add arctic oauth client`
- `a87d970` `fix(config): bind public origin at build time`
- `b5de8c4` `feat(auth): add sessions oauth identities and login audit`
- `02517c5` `feat(auth): protect routes and add responsive navigation`

**Controlli**
- Docker client/server 29.8.1 e Compose 5.5.1: disponibili.
- `pnpm ci:local`: verde con exit code 0; lint, svelte-check senza errori/warning, 86 unit, 16 integration con Postgres reale, seed, build e 20 e2e Chromium desktop/mobile.
- Matrice e2e: tutte le pagine e i download admin, 19 action admin, utenti anonimi/normali/admin; snapshot dei dati di business invariati dopo le richieste. Scansione filesystem delle route e delle action confrontata con l'elenco esplicito in `tests/e2e/routes.ts`.
- Test auth: token base32 di 20 byte e hash SHA256; scadenza esatta e rinnovo sotto i 15 giorni; revoca immediata e cambio ruolo dal DB; cookie, logout esclusivamente POST, CSRF, creazione/login utenti dev, upsert identità, audit nella transazione e nessuna pubblicazione su rollback; profili 42 simulati e default dei campi; state obbligatorio/corrispondente e rimozione del cookie; errori OAuth senza codici/token nei log; `/auth/dev` disabilitata a 404; errori interni generici con id.
- La prima esecuzione ha trovato un errore nel nuovo validatore ORIGIN su URL non valide: corretto usando URL.parse, verificato dai test. Dopo la correzione dell'origine, i sei test API che si aspettavano un redirect HTTP sono stati allineati alla richiesta HTML: SvelteKit 3 restituisce altrimenti un redirect serializzato in JSON con status HTTP 200. Nessuna modifica alla protezione CSRF.
- `docker compose up -d --build --wait`: verde; immagine M2 costruita per `https://localhost:8443`, app/Postgres healthy e nginx avviato. Nessun volume eliminato.
- Prova HTTPS con certificato locale come CA esplicita, senza disabilitare la verifica TLS: health 200, anonimo calendario 303, login dev 303, cookie Secure/HttpOnly/SameSite=Lax, calendario e admin 200, CSP presente, cache privata, logout GET 405, POST senza origine o con origine estranea 403, logout valido 303, riuso del cookie revocato 303. Utente e log creati soltanto per questa prova eliminati alla fine; nessun dato preesistente cancellato.
- `git diff --check`: verde. CI remota da verificare dopo il push del modulo.

**Decisioni prese dentro il perimetro del piano**
- File aggiuntivo `domain/auth.ts`: concentra il login transazionale condiviso fra OAuth e sviluppo. Utenti dev creati al volo con intra_id sintetico negativo, distinto dagli id positivi di 42, senza aggiunta automatica alla whitelist.
- Tipi Database/Transaction condivisi per testare le funzioni con una connessione isolata. Integration eseguite in sequenza fra file perché svuotano lo stesso database di test; gli e2e restano paralleli con identità temporanee distinte.
- Manifest SvelteKit usato per distinguere pagine ed endpoint, senza affidarsi a estensioni dei file o all'header Accept per decidere l'autorizzazione.
- Eccezione Git limitata alle directory `.csv` sotto `src/routes`, affinché gli endpoint richiesti siano versionati. Il breakpoint CSS corrisponde al token `--bp-md`: le custom property non sono ammesse nelle condizioni media.
- Usati Graphify per il riferimento legacy, Ponytail per contenere l'implementazione e Caveman nella comunicazione. Nessuna ricostruzione del grafo.

**Domande / blocchi**
- Nessun blocco tecnico locale per M2.
- Login 42 reale da verificare manualmente da Ismail con le proprie credenziali e callback `https://localhost:8443/auth/callback`, come previsto dal criterio M2; questo controllo non blocca il push. Nessuna chiamata reale all'API 42 durante i test.

**Prossimo passo**
- Verificare la CI dopo il push e registrare la chiusura M2. Non avviare M3 in questa sessione. Stack completo HTTPS lasciato in esecuzione sulle porte 8080/8443.


## 2026-10-19 — M2 — chiusura

**Fatto**
- Completato e pubblicato M2 sul branch `v2.0.0`. Aggiornato lo stato di §19 con il commit funzionale `02517c5`.
- Docker disponibile dopo il riavvio di Ismail; risolto il blocco ORIGIN con la configurazione di build autorizzata. Nessuna modifica al CSRF, a trustedOrigins o al legacy.

**Commit**
- `17dccad`, `a87d970`, `b5de8c4`, `02517c5`: dipendenza, configurazione dell'origine, dominio auth e collegamento delle route/layout.
- `bd4c60d` `docs: record M2 configuration and local validation`.

**Controlli**
- CI [run 39262446068](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39262446068), verde su `bd4c60d`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- `pnpm ci:local` verde: 86 unit, 16 integration, 20 e2e, lint/check e build.
- Stack M2 HTTPS ricostruito e verificato come nella voce precedente; app/Postgres healthy, nginx running, porte 8080/8443. Working tree pulito prima di questa registrazione finale; `legacy/` invariata rispetto alla chiusura M1.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione; M3 non iniziato.

**Domande / blocchi**
- Nessun blocco tecnico per M2. Login 42 reale ancora da verificare manualmente da Ismail, come previsto dal piano; i test usano risposte simulate e non credenziali reali.
- Arctic 3.7.0 è deprecato secondo npm; conservata la dipendenza richiesta dal piano, senza introdurre alternative.

**Prossimo passo**
- M3: impostazioni, settimane, date pool, limite eventi, reset display week e relativo audit. Rileggere piano e diario prima di procedere.

## 2026-10-19 — Verifica aggiornamento Arctic — bloccato in attesa di scelta

**Fatto**
- Su richiesta di Ismail, verificata la disponibilità di un aggiornamento Arctic prima di iniziare M3.
- Branch `v2.0.0` con working tree inizialmente pulito. Nessuna dipendenza modificata; M3 non iniziato e stato del piano lasciato `da fare`.

**Commit**
- Nessuno; nessun push.

**Controlli**
- `pnpm view arctic version deprecated dist-tags --json`: riuscito. Versione stabile corrente e tag latest entrambi `3.7.0`, già fissata in package.json e lockfile.
- Il campo deprecated del registro riporta `Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.` Non è disponibile una versione stabile successiva alla dipendenza installata.
- Test e CI non eseguiti: nessuna modifica al codice o alle dipendenze.

**Decisioni prese dentro il perimetro del piano**
- Nessun downgrade, prerelease o cambio libreria. Non cercate alternative senza una scelta di Ismail, come richiesto da §1.2.

**Domande / blocchi**
- Confermare se mantenere Arctic 3.7.0 e procedere con M3, oppure autorizzare la valutazione di una sostituzione e la relativa modifica della dipendenza prevista dal piano.

**Prossimo passo**
- Dopo la risposta di Ismail, gestire la scelta su Arctic e avviare M3 se confermato; rileggere piano e diario prima dell'implementazione.

## 2026-10-19 — Sostituzione Arctic — controlli locali completati

**Fatto**
- Letta e applicata la nota di Ismail: rimosso Arctic con pnpm e aggiornato il lockfile, eliminando anche le sue sei dipendenze transitive.
- Client OAuth realizzato con URL/URLSearchParams, fetch e node:crypto. State da 32 byte in base64url; scambio codice con client_id/client_secret nel corpo form-urlencoded, risposta 2xx e access_token non vuoto validato con Zod. Redirect dello scambio token rifiutati per non inoltrare credenziali.
- Conservati contratti dei chiamanti, route, cookie, redirect e gestione errori. Nessuna nuova dipendenza e nessuna modifica alle aspettative dei test OAuth preesistenti.

**Commit**
- Previsto `refactor(auth): replace arctic with built-in oauth client` con questa registrazione; nessuna implementazione M3 avviata prima della sua CI verde.

**Controlli**
- `pnpm ci:local`: verde, 91 unit, 16 integration, 20 e2e, lint/check e build. Aggiunti test state (32 byte, 43 caratteri base64url, valori distinti) e risposte token mancanti/nulle/vuote/di tipo errato; verificati metodo, corpo e header dello scambio codice.
- Nessuna corrispondenza per arctic sotto src; git diff --check verde. Nessuna chiamata reale all'API 42.
- Push e CI remota da eseguire prima di iniziare M3, come richiesto dalla nota.

**Decisioni prese dentro il perimetro del piano**
- Nessuna sostituzione con librerie esterne. Graphify consultato per il riferimento legacy, sorgenti attuali verificati direttamente; applicati Ponytail e Caveman.

**Domande / blocchi**
- Nessuno per questa sostituzione. Login 42 reale rimane la verifica manuale di Ismail prevista dal piano.

**Prossimo passo**
- Commit, push e CI della sostituzione; soltanto dopo, M3.

## 2026-10-19 — M3 — implementazione e controlli locali

**Fatto**
- Prima di M3, completata la sostituzione Arctic nel commit `a99d67a`. CI [run 39265194953](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39265194953) verde su tutti i sei job; `gh run watch --exit-status` terminato con exit code 0.
- Implementato `domain/settings.ts`: lettura della settimana richiesta o attiva, date concrete dei sette giorni, impostazione date pool con fine predefinita a +27 giorni, settimana attiva 1–4, limite eventi e reset della sola settimana display a 1.
- Ogni mutazione controlla i privilegi admin nel dominio e salva impostazioni e audit nella stessa transazione. Pubblicazione `log_created` e, per l'attivazione, `week_activated` solo dopo il commit.
- Collegati caricamento e quattro form `/admin`, messaggi italiani Paraglide e layout responsive. Le azioni eventi rimangono ai rispettivi moduli del piano; M4 non iniziato.

**Commit**
- `bc7370a` `feat(settings): add audited admin settings mutations`.
- `6999dea` `feat(admin): expose pool and week settings with browser coverage`.

**Controlli**
- `pnpm ci:local`: verde, 91 unit, 35 integration, 22 e2e, lint/check e build; svelte-check senza errori o warning.
- Integration: date non allineate al lunedì e a cavallo d'anno, input non validi senza scritture, autorizzazioni nel dominio, limite zero e massimo memorizzabile, aggiornamenti concorrenti senza perdita di campi, rollback quando l'audit fallisce e nessun messaggio pubblicato sul rollback.
- E2E desktop/mobile: intero flusso delle quattro impostazioni, errore date invertite, fine automatica, selezione settimana, sette date, limite 2/0, reset display e assenza di overflow a 360px. Matrice autorizzazioni aggiornata per tutte le route e azioni admin, senza modifiche ai dati da richieste respinte.
- `git diff --check`: verde; nessuna modifica a legacy, schema o dipendenze in M3.
- Stack completo ricostruito con `docker compose up -d --build --wait`: verde; app/Postgres healthy, nginx running sulle porte 8080/8443, nessun volume eliminato. Prova con CA locale esplicita e verifica TLS attiva: HTTPS health 200, admin anonimo 303, HTTP 8080 → HTTPS 8443 con 308. Nessuna scrittura sul database applicativo durante questa prova.

**Decisioni prese dentro il perimetro del piano**
- Limite massimo validato a 32767, coerente con la colonna smallint prevista dal modello dati; zero resta illimitato.
- Un solo worker Playwright: i test delle impostazioni modificano la riga singleton condivisa fra progetti desktop/mobile. I valori iniziali vengono ripristinati anche quando un test fallisce.
- Graphify consultato per i comportamenti legacy; sorgenti attuali verificati direttamente. Applicati Ponytail e Caveman, senza ricostruire il grafo.

**Domande / blocchi**
- Nessun blocco tecnico per M3. Login OAuth 42 reale ancora da verificare manualmente da Ismail; nessuna chiamata reale all'API nei test.

**Prossimo passo**
- Terminare la ricostruzione dello stack HTTPS, push e verifica dei sei job CI; registrare la chiusura M3. Non iniziare M4 in questa sessione.

## 2026-10-19 — M3 — chiusura

**Fatto**
- Completato e pubblicato M3 sul branch `v2.0.0`; stato di §19 aggiornato al commit funzionale `6999dea`. M4 non iniziato.
- Sostituzione Arctic completata prima di M3, come richiesto dalla nota di Ismail.

**Commit**
- `bc7370a`: dominio impostazioni e integration.
- `6999dea`: pagina admin e copertura browser.
- `6b02a56`: controlli locali e diario.

**Controlli**
- CI [run 39266746118](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39266746118) verde su `6b02a56`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- `pnpm ci:local`: verde, 91 unit, 35 integration e 22 e2e; lint/check e build verdi.
- Stack HTTPS ricostruito e lasciato attivo sulle porte 8080/8443: app/Postgres healthy, nginx running. Health, redirect e protezione admin verificati con TLS attivo; nessun volume eliminato o dato applicativo modificato dalla prova HTTPS.
- Working tree pulito prima della registrazione finale; nessuna modifica a legacy, dipendenze o schema nel modulo.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico per M3. Login 42 reale ancora da verificare manualmente da Ismail, come previsto dal piano; test OAuth con risposte simulate.

**Prossimo passo**
- M4: eventi admin. Rileggere piano e diario prima di iniziare.

## 2026-10-19 — M4 — implementazione e controlli locali

**Fatto**
- Riletti piano e chiusura M3; verificati branch `v2.0.0`, working tree inizialmente pulito e CI verde sull'ultimo commit `50ff240`.
- Implementato `domain/events.ts`: lista settimanale ordinata per giorno e ora con tutti gli iscritti e conteggio presenti separato; creazione preset/custom; modifica dei soli campi ammessi; eliminazione singola, per giorno, per settimana e globale.
- Ogni mutazione controlla il ruolo admin nel dominio. Scrittura e audit sono atomici; pubblicati `log_created` ed `event_changed` solo dopo il commit. Modifica con lock dell'evento per rendere corretti gli snapshot JSON dell'audit anche con richieste concorrenti.
- UI admin con sette giorni, date effettive e specifiche, campi degli eventi, iscritti presenti/assenti, avviso quando i posti sono inferiori agli iscritti, form di creazione/modifica e dialog nativi per le eliminazioni. Le eliminazioni in massa richiedono una conferma esplicita, validata anche nel dominio.
- Introdotti i componenti `Dialog` e `Toast` già previsti dal piano: il primo usa un dettaglio espandibile come conferma quando JavaScript è disabilitato; il secondo mostra i messaggi nel layout con ruoli status/alert e chiusura al clic o dopo sei secondi.
- Form admin con progressive enhancement e messaggi `{ ok, messages: [{ type, key, params }] }`. Aggiornate anche le quattro action M3 della stessa pagina per usare questo contratto; conservati testi e comportamento delle impostazioni, con errore accessibile tramite role alert.
- Azioni sui partecipanti ancora riservate a M5; nessuna implementazione di SSE client/trasporto M9 o di altri moduli.

**Commit**
- `342dac6` `feat(events): add transactional admin event management`.
- `ab63bca` `feat(admin): add event forms and confirmed bulk deletion`.

**Controlli**
- `pnpm ci:local`: verde, 91 unit, 91 integration, 26 e2e, lint/check e build; svelte-check senza errori o warning.
- 56 nuove integration: tutti i preset, custom/default e data specifica, ordinamento, conteggi inclusi gli assenti, limiti e input non validi, campi immutabili, 404, permessi per ogni mutazione, modifiche concorrenti, cascata per tutte le quattro eliminazioni e rollback di eventi/iscrizioni/audit per ciascuna mutazione se l'audit fallisce.
- E2E desktop/mobile: crea custom e preset, modifica, iscritti/assenti e capienza ridotta, annulla/conferma eliminazione singola, conferma obbligatoria per giorno/settimana/tutto, messaggi con chiusura al clic e temporizzata, testo HTML ostile mostrato senza esecuzione, assenza di overflow a 360px anche con eventi e form. Flusso aggiuntivo con JavaScript disabilitato, incluso errore di validazione e conferma dell'eliminazione.
- Matrice autorizzazioni aggiornata per le sei nuove action: richieste anonime, non admin e dati invalidi non modificano eventi, iscrizioni, impostazioni o audit. I test che eliminano tutto ripristinano eventi e iscrizioni iniziali nel database di test, anche in caso di errore.
- `git diff --check`: verde. Nessuna modifica a legacy, dipendenze o schema.
- Stack completo ricostruito con `docker compose up -d --build --wait`: app/Postgres healthy, nginx running, porte 8080/8443. Prova con CA locale esplicita e verifica TLS attiva: health HTTPS 200, admin anonimo 303 e redirect HTTP 8080 verso HTTPS 8443 con 308. Nessun volume eliminato e nessuna scrittura sul database applicativo nella prova HTTPS.

**Decisioni prese dentro il perimetro del piano**
- Limiti numerici coerenti con le colonne integer Postgres. Settimana, tipo e data specifica rimangono immutabili in modifica, come nell'elenco di §8.8.
- Query unica con join per caricare eventi e iscritti, evitando query per singolo evento. Il conteggio totale comprende sempre anche gli assenti; il conteggio presenti è separato.
- Nuovi file limitati al dominio previsto, ai due componenti nominati dal piano e ai test corrispondenti. Nessuna dipendenza aggiuntiva.
- Usati Graphify per individuare le funzioni legacy, Ponytail per contenere le modifiche e Caveman nella comunicazione. Grafo pre-spostamento: percorsi `app.py` e `templates/admin.html` verificati nei corrispondenti file sotto `legacy/`; nessuna ricostruzione del grafo.

**Domande / blocchi**
- Nessun blocco tecnico per M4. Login 42 reale resta la verifica manuale di Ismail già indicata in M2/M3.

**Prossimo passo**
- Terminare la ricostruzione dello stack HTTPS, push e verifica dei sei job CI; registrare la chiusura M4. Non iniziare M5 in questa sessione.

## 2026-10-19 — M4 — chiusura

**Fatto**
- Completato e pubblicato M4 sul branch `v2.0.0`; stato di §19 aggiornato al commit funzionale `ab63bca`. M5 non iniziato.
- Gestione eventi admin operativa con preset/custom, modifiche, iscritti visibili e conteggi separati, eliminazioni con cascata e conferme esplicite, audit transazionale e notifiche dopo il commit.

**Commit**
- `342dac6`: dominio eventi e integration.
- `ab63bca`: UI, dialog, messaggi ed e2e.
- `8c38d3a`: controlli locali e diario.

**Controlli**
- CI [run 39270535314](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39270535314) verde su `8c38d3a`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- `pnpm ci:local`: verde, 91 unit, 91 integration e 26 e2e, lint/check e build.
- Stack HTTPS ricostruito e lasciato attivo sulle porte 8080/8443: app/Postgres healthy, nginx running. Health, protezione admin e redirect verificati con TLS attivo e CA locale esplicita; nessun volume eliminato o dato applicativo modificato dalla prova HTTPS.
- Working tree pulito prima della registrazione finale; nessuna modifica a legacy, dipendenze o schema nel modulo.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico per M4. Login 42 reale ancora da verificare manualmente da Ismail, come già indicato in M2/M3.

**Prossimo passo**
- M5: iscrizioni e presenze. Rileggere piano e diario prima di iniziare.

## 2026-10-19 — Revisione M3 dopo M4 — controlli locali completati

**Fatto**
- Applicata la nota di Ismail del 2026-10-19 soltanto dopo la chiusura M4 e la sua CI verde. Verificato lo stato di tutti i 14 punti prima delle modifiche: P1 era già implementato in M4; gli altri 13 richiedevano interventi. M5 non iniziato.
- **S1:** `publish()` invoca ogni ascoltatore separatamente con try/catch. Un errore non interrompe gli altri ascoltatori o l'azione già committata; il log contiene soltanto un messaggio statico, senza evento o eccezione potenzialmente personale.
- **S2:** validazione delle date del pool negli anni 2000–2100, inclusa la fine calcolata automaticamente. Le action respingono con status 400 inizio o fine `1999-12-31`, `2101-01-01` e `9999-12-31`, senza scritture, log o notifiche.
- **S3:** settimana, query settimana e limite accettano soltanto stringhe di 1–5 cifre decimali prima della conversione. Conservati gli input numerici interi del dominio; rifiutati anche `0x2`, `1e0`, spazi, decimali testuali e stringhe troppo lunghe.
- **S4:** richiesta del profilo 42 con `redirect: 'error'`; test della proprietà redirect della richiesta costruita dai parametri di fetch.
- **S5:** lettura della riga settings con `FOR UPDATE` nella stessa transazione della modifica e dell'audit; `old_value` e `new_value` JSON contengono soltanto i campi richiesti, senza id o timestamp. Coperti tutti e quattro i tipi di modifica e due modifiche concorrenti della stessa impostazione.
- **P1, già a posto:** conservati `use:enhance`, contratto `{ ok, messages }` e toast introdotti in M4. Aggiunta verifica browser delle quattro impostazioni con JavaScript disabilitato, senza riscrivere la funzionalità.
- **P2:** nuova chiave `error_pool_end_before_start` e messaggio italiano specifico per date valide ma invertite; aggiornato l'e2e. Altri errori di validazione conservano il messaggio generico.
- **P3:** `setPoolDates` pubblica dopo il commit anche `event_changed` con eventId/week null e action update. Aggiornate le aspettative integration; verificata l'assenza di notifiche in caso di rollback dell'audit.
- **T1:** rimosso il limite globale di un worker. Progetti chromium-shared e mobile-shared in sequenza tramite dependencies e con serializzazione locale; progetti chromium/mobile indipendenti in parallelo. Il limite seriale include gli eventi perché le eliminazioni globali e il loro ripristino interferiscono con gli hash di tutte le tabelle nella matrice. Nessun campo, incluso settings.updated_at, escluso dagli hash. Client Postgres dei test aperti nel beforeAll e chiusi nel relativo afterAll, compatibilmente con i gruppi di esecuzione paralleli.
- **T2:** nuovo e2e con admin autenticato, POST `/admin?/setActiveWeek` da `https://evil.example`: 403, riga settings e intero audit invariati.
- **Ponytail 1:** tipo di audit e resourceId espliciti nei chiamanti, senza dedurli da activeWeek. Pubblicazione di week_activated nel relativo chiamante.
- **Ponytail 2:** eliminato resetSchema e rimosso il parametro input da resetDisplayWeek. La matrice verifica ancora il rifiuto di anonimi e utenti normali; il successo admin, anche con campi irrilevanti, è coperto dal test impostazioni.
- **Ponytail 3:** il caricamento admin restituisce un solo array di date settimanali già formattate, con null se assenti; eliminato il doppio payload dayDates/formattedDayDates.
- **Ponytail 4:** sostituito createAuthorizationURL con authorizationUrl(state), endpoint e scope public interni; aggiornati chiamante e test.

**Commit**
- `8d6a68d` `fix(settings): address M3 review findings`.
- `b43b948` `fix(settings): restore parallel browser coverage`.

**Controlli**
- `pnpm ci:local`: verde, 92 unit, 101 integration e 30 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- Browser: 16 controlli dei dati condivisi eseguiti in sequenza fra desktop e mobile, poi 14 indipendenti in parallelo; esecuzione locale con 6 worker disponibili. Copertura desktop/mobile conservata per ogni test, senza raddoppio dei casi fra i progetti dedicati e ordinari.
- Test unit dell'ascoltatore che lancia: publish non lancia, l'altro ascoltatore riceve l'evento e nessun dettaglio privato compare nel log. Test OAuth senza chiamate reali all'API 42.
- Integration con database reale: status 400 delle action per date fuori intervallo, valori audit esatti per le quattro azioni, precedente snapshot corretto sotto concorrenza, rollback e nessuna notifica su fallimento.
- `git diff --check`: verde. Nessuna modifica a legacy, dipendenze, schema o piano; preservate integralmente le note di Ismail e le voci precedenti.

**Decisioni prese dentro il perimetro del piano**
- Nessuna esclusione dagli hash per aggirare le corse: la serializzazione interessa soltanto i test che condividono mutazioni o snapshot, mentre il resto è parallelo. Gli hook ricreano la connessione del test per ogni gruppo, evitando di riutilizzarla dopo afterAll.
- Il limite 2000–2100 si applica anche alla fine automatica: `2100-12-04` produce `2100-12-31`; un inizio successivo senza fine esplicita è rifiutato se produce una fine nel 2101.
- Graphify consultato ma senza corrispondenze per i simboli TypeScript correnti; verificati direttamente sorgenti e chiamanti. Applicati Ponytail e Caveman; nessuna ricostruzione del grafo o dipendenza aggiunta.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale rimane la verifica manuale di Ismail già prevista.

**Prossimo passo**
- Terminare la ricostruzione dello stack HTTPS, push, verificare la CI e registrare la chiusura della revisione. M5 resta da iniziare.

**Verifica stack HTTPS dopo la ricostruzione**
- `docker compose up -d --build --wait`: verde; app/Postgres healthy, nginx running, porte 8080/8443. Nessun volume eliminato.
- Con certificato locale come CA esplicita e verifica TLS attiva: health HTTPS 200, admin anonimo 303 e redirect HTTP 8080 verso HTTPS 8443 con 308. Nessuna scrittura sul database applicativo durante questa prova.

## 2026-10-19 — Revisione M3 dopo M4 — chiusura

**Fatto**
- Completati tutti i 14 punti della nota di Ismail: 13 correzioni applicate; P1 già implementato in M4 e verificato anche senza JavaScript.
- Pubblicati i commit su `v2.0.0`. Nessuna modifica al piano, al legacy, alle dipendenze o allo schema. M5 non iniziato.

**Commit**
- `8d6a68d` `fix(settings): address M3 review findings`.
- `b43b948` `fix(settings): restore parallel browser coverage`.
- `e629375` `fix(settings): record review fixes and local validation`.

**Controlli**
- `pnpm ci:local`: verde, 92 unit, 101 integration e 30 e2e; lint/check e build verdi, nessun errore o warning di svelte-check.
- CI [run 39273025317](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39273025317) verde su `e629375`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- Stack HTTPS ricostruito e lasciato attivo: app/Postgres healthy, nginx running, porte 8080/8443. Health HTTPS 200, admin anonimo 303 e redirect HTTP 308 verificati con CA locale esplicita; nessun volume eliminato o dato applicativo modificato dalla prova HTTPS.
- Working tree pulito prima di questa registrazione finale. Rapporto puntuale di S1–S5, P1–P3, T1–T2 e Ponytail 1–4 nella voce precedente.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale ancora da verificare manualmente da Ismail; test OAuth con risposte simulate.

**Prossimo passo**
- M5: iscrizioni e presenze. Rileggere piano e diario prima di iniziare.

## 2026-10-20 — M5 — implementazione e controlli locali

**Fatto**
- Ripresa la sessione interrotta con le modifiche M5 conservate sul branch `v2.0.0`; riletti piano e ultima chiusura. Il precedente processo di test non era più disponibile: rieseguito integralmente `pnpm ci:local`.
- Implementato §8.5 nel dominio iscrizioni: iscrizione e disiscrizione proprie, aggiunta e rimozione admin, modifica della presenza. D1 rispettata: capienza e limite settimanale includono anche gli assenti; zero indica limite settimanale illimitato.
- Iscrizione con lock dell'utente e poi dell'evento, controlli nell'ordine richiesto, audit atomico e notifiche prive di dati personali soltanto dopo il commit. Operazioni senza iscrizione da rimuovere idempotenti, senza audit o notifiche aggiuntive.
- Aggiunta admin con login normalizzato e validato, anche mai autenticato, bypass di capienza/whitelist/limite/data passata; duplicato segnalato come warning senza scritture. Presenze validate come booleani o stringhe esplicite true/false, con 404 per iscrizione inesistente.
- Collegate le due action del calendario e le tre action admin. Form partecipanti admin operativi con progressive enhancement, funzionamento senza JavaScript e messaggi i18n accessibili.
- Allineato l'ordine dei lock delle mutazioni eventi M4 a utente prima di evento: evita il ciclo tra lock dell'evento e FK dell'attore nell'audit durante un'iscrizione concorrente dello stesso admin. Regole degli eventi invariate.
- Corretto un test M3 che navigava subito dopo il clic di attivazione settimana, interrompendo il POST: ora attende la risposta prima della navigazione. La traccia del fallimento precedente mostrava la richiesta interrotta.
- Calendario completo, dialog di aggiunta al calendario e file ICS restano in M7; endpoint/client SSE in M9. M6 non iniziato.

**Commit**
- `8ba8e41` `feat(registrations): add transactional bookings and attendance`.
- `bddc6e2` `feat(registrations): connect participant forms and actions`.

**Controlli**
- `pnpm ci:local`: exit code 0, 92 unit, 142 integration e 36 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- 41 nuove integration: ordine dei controlli e rispettivi errori, date concrete/pool/non impostate, istante esatto di fine, assenti nel limite e nella capienza, disiscrizione propria/idempotente, bypass e duplicato admin, presenza limitata alla riga richiesta, 404, autenticazione/ruolo aggiornato e input invalidi.
- Concorrenza: 20 utenti su 5 posti producono esattamente 5 iscrizioni; due richieste dello stesso utente producono una riga; iscrizioni a eventi differenti rispettano il limite settimanale; aggiunte admin concorrenti dello stesso login normalizzato restano uniche. Verificata anche la concorrenza fra modifica evento e iscrizione dello stesso admin.
- Rollback di tutte le sei mutazioni effettive se l'audit fallisce: iscrizioni invariate, nessun log o notifica. Verificati i tipi di audit e l'assenza di effetti nei casi senza modifica.
- Sei nuovi e2e complessivi desktop/mobile: action utente con whitelist, CSRF, tentativo di impersonare un login, capienza e limite; form admin con e senza JavaScript per aggiunta oltre capienza a evento passato, warning duplicato, assente/presente e rimozione. Controllo senza overflow a 360px; matrice autorizzazioni estesa alle tre action admin.
- `git diff --check`: verde. Nessuna modifica a legacy, dipendenze o schema; preservate le note precedenti.

**Decisioni prese dentro il perimetro del piano**
- Nuovo `src/lib/server/registration-actions.ts` per condividere fra calendario e admin l'adattamento delle cinque action al contratto form e agli errori Zod; regole di business esclusivamente nel dominio previsto.
- Graphify usato per localizzare iscrizione, disiscrizione e presenze legacy; il grafo mantiene i percorsi precedenti allo spostamento, verificati in `legacy/`. Nessuna ricostruzione del grafo. Applicati Ponytail e Caveman.

**Domande / blocchi**
- Nessun blocco tecnico nei controlli locali. Login 42 reale resta la verifica manuale di Ismail già prevista.

**Prossimo passo**
- Terminare ricostruzione e prova HTTPS, push e verifica dei sei job CI, quindi registrare la chiusura M5. Non iniziare M6.

**Verifica stack HTTPS dopo la ricostruzione**
- `docker compose up -d --build --wait`: exit code 0, app/Postgres healthy e nginx running, porte 8080/8443. Nessun volume eliminato.
- Prova con certificato locale come CA esplicita e verifica TLS attiva: health HTTPS 200, admin anonimo 303 verso `/`, redirect HTTP 8080 verso HTTPS 8443 con 308. Nessuna scrittura sul database applicativo durante la prova.

## 2026-10-20 — M5 — chiusura

**Fatto**
- Completato e pubblicato M5 sul branch `v2.0.0`; aggiornata soltanto la colonna Stato di §19 al commit funzionale `bddc6e2`. M6 non iniziato.
- Iscrizioni, disiscrizioni, gestione partecipanti admin e presenze operative, con capienza comprensiva degli assenti, transazioni, audit e notifiche dopo il commit. Perimetro e verifiche dettagliati nella voce precedente.

**Commit**
- `8ba8e41`: dominio iscrizioni, ordine dei lock e integration.
- `bddc6e2`: action, form admin, messaggi ed e2e.
- `8d3d9d7`: controlli locali e diario.

**Controlli**
- `pnpm ci:local`: exit code 0, 92 unit, 142 integration, 36 e2e; lint/check e build verdi.
- CI [run 39443716424](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39443716424) verde su `8d3d9d7`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- Stack completo ricostruito e lasciato attivo su 8080/8443: app/Postgres healthy, nginx running. Health HTTPS 200, admin anonimo 303 e redirect HTTP 308 verificati con CA locale esplicita e verifica TLS attiva. Nessun volume eliminato o dato applicativo modificato dalla prova HTTPS.
- Working tree pulito prima di questa registrazione finale; nessuna modifica a legacy, dipendenze o schema.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale ancora da verificare manualmente da Ismail.

**Prossimo passo**
- M6: whitelist, da avviare alla prossima richiesta. Calendario completo, dialog e ICS restano in M7; SSE in M9.

## 2026-10-20 — M6 — implementazione e controlli locali

**Fatto**
- Riletti piano e ultima chiusura M5; verificati branch `v2.0.0` e working tree inizialmente pulito. Implementato soltanto M6 (§8.14).
- Nuovo dominio whitelist: elenco ordinato per login con data di inserimento; aggiunta multipla separata da virgole, spazi, tab o a capo; normalizzazione in minuscolo e validazione della regex prevista. Login non validi saltati e segnalati; duplicati segnalati come warning, inclusi quelli ripetuti nello stesso invio; messaggio di successo per gli aggiunti.
- Aggiunta atomica dell'intero gruppo con un audit `WHITELIST_ADD` per ogni nuova riga. Inserimenti in ordine deterministico e gestione del conflitto univoco per gruppi sovrapposti concorrenti, senza errori sui duplicati.
- Rimozione per id con 404 se inesistente e audit `WHITELIST_REMOVE`; nessuna cancellazione delle iscrizioni esistenti. Le modifiche verificano nuovamente il ruolo dell'attore nella transazione e pubblicano soltanto `log_created`, dopo il commit.
- Pagina `/admin/whitelist` operativa: textarea con istruzioni, elenco, data/ora localizzata in Europe/Rome, pulsanti rimuovi, stato vuoto. Form con progressive enhancement e funzionamento senza JavaScript; messaggi tramite i18n e toast condiviso.
- Matrice di autorizzazione estesa alle due action implementate. Corretto il test M3 che riconosceva il toast del salvataggio precedente e leggeva il database troppo presto: attesa esplicita della risposta POST per limite e reset display, come già per l'attivazione settimana.
- Nessuna modifica a legacy, schema o dipendenze. M7 non iniziato.

**Commit**
- `7d18685` `feat(whitelist): add transactional batch management`.
- `8723c27` `feat(whitelist): add accessible admin forms and browser coverage`.

**Controlli**
- `pnpm ci:local`: exit code 0, 92 unit, 164 integration e 40 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- 22 nuove integration: elenco vuoto e ordinato, date, separatori/normalizzazione, input misti e limiti di lunghezza, login mai autenticati, soli invalidi e soli duplicati senza scritture, permessi prima della validazione e ruolo aggiornato, input form non validi, rimozione/404, conservazione delle iscrizioni e disiscrizione successiva consentita.
- Gruppi concorrenti sovrapposti e in ordine opposto producono una sola riga e un solo audit per login. Fallimento del secondo audit di aggiunta annulla anche la prima aggiunta e il relativo audit; fallimento dell'audit di rimozione conserva la whitelist. Nessuna notifica in caso di rollback.
- Quattro nuovi e2e desktop/mobile, con e senza JavaScript: aggiunta mista, warning duplicati e invalidi, ordine e date, testo HTML ostile mostrato senza esecuzione, rimozione con iscrizioni conservate, audit esatto. Richieste cross-origin per entrambe le action danno 403 senza modifiche; input vuoto 400 e id inesistente 404. Verificata assenza di overflow a 360px.
- `git diff --check`: verde; note precedenti preservate integralmente.

**Decisioni prese dentro il perimetro del piano**
- Input composto soltanto da separatori rifiutato come form invalido; login non conformi alla regex segnalati e saltati anche quando nessuno è aggiunto. Duplicati e invalidi non producono audit. Le date di inserimento già esistenti rimangono invariate.
- Nessun nuovo helper o componente: riutilizzati dominio/audit, bus, guard, form e toast esistenti. Nuovi file soltanto dominio previsto e test corrispondenti.
- Graphify consultato per localizzare elenco/aggiunta/rimozione whitelist legacy; verificati i sorgenti sotto `legacy/`, dato che il grafo conserva i percorsi pre-spostamento. Applicati Ponytail e Caveman; nessuna ricostruzione del grafo.

**Domande / blocchi**
- Nessun blocco tecnico nei controlli locali. Login 42 reale resta la verifica manuale di Ismail già prevista.

**Prossimo passo**
- Terminare ricostruzione e prova HTTPS, push e verifica dei sei job CI, quindi registrare la chiusura M6. Non iniziare M7.

**Verifica stack HTTPS dopo la ricostruzione**
- `docker compose up -d --build --wait`: exit code 0; app/Postgres healthy e nginx running sulle porte 8080/8443. Nessun volume eliminato.
- Certificato locale usato come CA esplicita, verifica TLS attiva: health HTTPS 200, whitelist admin anonima 303 verso `/`, redirect HTTP 8080 verso HTTPS 8443 su `/admin/whitelist` con 308. Nessuna scrittura sul database applicativo durante la prova.

## 2026-10-20 — M6 — chiusura

**Fatto**
- Completato e pubblicato M6 sul branch `v2.0.0`; aggiornata soltanto la colonna Stato di §19 al commit funzionale `8723c27`. M7 non iniziato.
- Whitelist admin operativa con elenco ordinato e date, aggiunta multipla, segnalazione di invalidi e duplicati, rimozione senza cancellare iscrizioni e audit transazionale. Dettagli e verifiche nella voce precedente.

**Commit**
- `7d18685`: dominio whitelist e integration.
- `8723c27`: pagina, action, messaggi ed e2e.
- `6dfae68`: controlli locali e diario.

**Controlli**
- `pnpm ci:local`: exit code 0, 92 unit, 164 integration e 40 e2e; lint/check e build verdi.
- CI [run 39445984286](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39445984286) verde su `6dfae68`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- Stack ricostruito e lasciato attivo su 8080/8443: app/Postgres healthy, nginx running. Health HTTPS 200, whitelist admin anonima 303 e redirect HTTP 308 verificati con CA locale esplicita e verifica TLS attiva. Nessun volume eliminato o dato applicativo modificato dalla prova HTTPS.
- Working tree pulito prima di questa registrazione finale; nessuna modifica a legacy, schema o dipendenze. Note precedenti preservate.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale ancora da verificare manualmente da Ismail.

**Prossimo passo**
- M7: calendario utente e ICS, da avviare alla prossima richiesta. SSE resta in M9.

## 2026-10-20 — Revisione M4–M6 e revisione M3 — controlli locali completati

**Fatto**
- Letta la nota di Ismail introdotta in `d2bfd0d` dopo la chiusura M6. Verificati tutti i dieci punti sul codice: nessuno era già completamente risolto. Applicati soltanto gli interventi richiesti; M7 non iniziato.
- **R1:** spostato `digits(maxLength)` in `dates.ts`, riutilizzato in impostazioni, eventi, iscrizioni e rimozione whitelist. Stringhe numeriche ammesse soltanto con cifre decimali e lunghezza prevista, prima della conversione; conservati gli input numerici interi del dominio e i limiti Postgres.
- **R2:** creazione, modifica, eliminazione singola e massiva degli eventi rileggono l'utente bloccato e verificano il ruolo attuale; l'audit usa quell'attore. Utente declassato respinto prima delle scritture.
- **R3:** tutte le eliminazioni eventi implementate salvano in `old_value` l'array JSON degli eventi con `participants`, comprese presenze e date di iscrizione. Snapshot letto nella stessa transazione, bloccando gli eventi prima delle iscrizioni; il DELETE massivo riguarda esattamente gli id nello snapshot. Audit ed eliminazione restano atomici. La regola per APPLY_TEMPLATE con sovrascrittura sarà applicata quando verrà implementato il modulo template previsto dal piano, senza anticiparlo.
- **R4:** chiusura del singolo toast tramite indici dei messaggi chiusi; timer di sei secondi e stato ripristinati quando arrivano nuovi messaggi. Rimozione admin di un login non iscritto restituisce il warning i18n `registration_not_registered_login`, senza scritture, log o notifiche; disiscrizione propria inesistente ancora silenziosa.
- **R5:** deduplicati i login validi prima degli inserimenti whitelist. I ripetuti nello stesso invio vengono aggiunti una sola volta, senza comparire in "Già presenti"; il warning riguarda quelli già memorizzati.
- **R6:** limite di 5000 caratteri sul campo logins prima del trim. Input superiore respinto con 400 senza scritture o audit.
- **Ponytail 1:** Toast conserva il ramo di formattazione del limite settimanale e un solo ramo di traduzione per gli altri messaggi; adattamento tipizzato della mappa di traduzioni alle unioni dei parametri dei messaggi.
- **Ponytail 2:** sostituiti i cinque wrapper delle iscrizioni con la factory `op(operation)`, mantenendo firme e chiamanti.
- **Ponytail 3:** tipi espliciti delle chiavi di errore e `failure` condiviso anche per il limite settimanale; rimosso il blocco duplicato.
- **Ponytail 4:** unico `formAction` per admin, calendario e whitelist. Conservati messaggi di successo, status restituiti dal dominio, 400 Zod con chiave generica o specifica e 404 con chiave scelta dal chiamante. Eliminati i tre adattatori precedenti.

**Commit**
- `974c4b3` `fix(events): validate decimal inputs and preserve deletion audit`.
- `697bab9` `fix(registrations): address registration and whitelist review findings`.
- `5e7b5c8` `refactor: share form actions and dismiss individual notices`.

**Controlli**
- `pnpm ci:local`: exit code 0; 92 unit, 185 integration e 40 e2e, lint/check e build verdi; svelte-check senza errori o warning.
- 21 nuove integration in `review.test.ts`: tutti i quattro input numerici richiesti producono 400 per una action di ciascuno dei quattro domini senza scritture/audit/notifiche; 5001 caratteri respinti; ruolo declassato respinto per tutte le sei mutazioni eventi; snapshot JSON esatti per singolo/giorno/settimana/tutto, con e senza iscritti; 404 lanciati e restituiti mappati alle chiavi originali; warning admin e silenzio utente senza audit o notifiche.
- Aggiornate le integration su duplicati whitelist e rimozione admin inesistente. Conservate le prove di concorrenza, rollback audit, impostazioni e autorizzazioni.
- E2E desktop/mobile con e senza JavaScript aggiornati per duplicati e warning admin; verifica con JavaScript che chiudere il successo lasci visibile il warning dello stesso invio. Controlli esistenti su timeout dei toast e messaggi successivi ancora verdi.
- `git diff --check`: verde. Nessuna modifica a piano, schema, dipendenze o legacy; preservate note e voci precedenti.

**Decisioni prese dentro il perimetro del piano**
- `form-action.ts` sostituisce `registration-actions.ts` e centralizza gli adattatori richiesti; nuovo `review.test.ts` raccoglie le verifiche trasversali della nota. Nessun altro nuovo file.
- Graphify consultato per localizzare funzioni legacy pertinenti; grafo pre-spostamento e sorgenti correnti verificati direttamente. Applicati Ponytail e Caveman; nessuna ricostruzione del grafo.

**Domande / blocchi**
- Nessun blocco tecnico nei controlli locali. Login 42 reale resta la verifica manuale di Ismail già prevista.

**Prossimo passo**
- Terminare ricostruzione e prova HTTPS, push e verifica dei sei job CI, poi registrare la chiusura della revisione. Non iniziare M7.

**Verifica stack HTTPS dopo la ricostruzione**
- `docker compose up -d --build --wait`: exit code 0, app/Postgres healthy e nginx running sulle porte 8080/8443. Nessun volume eliminato.
- Con CA locale esplicita e verifica TLS attiva: health HTTPS 200, admin anonimo 303, redirect HTTP 8080 verso HTTPS 8443 con 308. Nessuna scrittura sul database applicativo durante la prova.

## 2026-10-20 — Seconda revisione M4–M6 — interrotta su richiesta di Ismail

**Fatto**
- Arresto richiesto da Ismail per spegnere il PC. Controllo in corso interrotto con Ctrl-C (exit 130); modifiche salvate nei file del working tree, senza commit o push della seconda revisione. M7 non iniziato.
- Prima revisione R1–R6/Ponytail 1–4 implementata e pubblicata fino a `3252bb5`, controlli locali verdi (92 unit, 185 integration, 40 e2e). CI 39448520312 annullata automaticamente quando è arrivato il commit di note `c58b1c7`; cinque job verdi, e2e annullato. Non registrare quella run come interamente verde.
- Letta e inclusa la seconda nota di Ismail in `c58b1c7`, ora HEAD del checkout. In lavorazione R7 e Ponytail 5–14, tutti implementati nel working tree ma ancora da validare completamente.
- R7: discriminated union preset/custom per la creazione; controllo data specifica/giorno ISO in creazione e, usando la data salvata sotto lock, in modifica; chiave `error_event_date_weekday` anche nell'adattatore e nei toast. Rimosse parse, assertion e capitalizzazioni duplicate.
- Helper `lockAdmin` e costante `loginPattern` in guards, riutilizzati in eventi/whitelist/iscrizioni e login dev; metadati delle eliminazioni massive passati dai chiamanti; snippet confirmDelete e costante weeks in admin; whitelist classificata in un solo passaggio con Set e senza deduplicazione superflua dei duplicati.
- Iscrizioni: helper passed per settings/data passata e un solo INSERT dopo i controlli di register/add.
- Dialog in prova con commandfor/show-modal/close nativi, senza onMount/ready/details. Deve essere mantenuto SOLO se gli e2e con e senza JavaScript passano in tutti i progetti; altrimenti ripristinare il Dialog da HEAD e documentarlo come richiesto da Ponytail 11.

**Commit**
- Prima revisione già pubblicata: `974c4b3`, `697bab9`, `5e7b5c8`, `3252bb5`.
- HEAD `c58b1c7` contiene la seconda nota di Ismail. Nessun commit della seconda revisione.

**Controlli**
- Seconda revisione: lint e svelte-check verdi nell'ultima esecuzione interrotta; nessun errore o warning TypeScript.
- Esecuzione precedente: 185 integration verdi e una fallita (totale 186) perché il vecchio fixture del test di concorrenza modifica/iscrizione aveva data 2026-10-20 (martedì) ma weekday 1. Corretto SOLO quel fixture e il relativo payload a weekday 2 in `tests/integration/registrations.test.ts`; nuova esecuzione interrotta prima dei test su richiesta di Ismail. La correzione resta da verificare.
- Aggiunta integration R7 in review.test.ts: creazione incoerente 400, creazione coerente ammessa, modifica incoerente 400 senza cambiamenti a evento/audit/notifiche, modifica coerente ammessa. Aggiornato il fixture custom del 2027-01-01 a weekday 5 (venerdì).
- Test e2e senza JavaScript esteso con apertura/chiusura nativa di dialog singolo e massivo. Non ancora eseguito sulla seconda revisione.
- Log temporanei: `/tmp/baywatchers-review2-ci.log`, `/tmp/baywatchers-review2-check.log` (potrebbero scomparire al riavvio).

**Decisioni prese dentro il perimetro del piano**
- Nessuna nuova dipendenza o modifica a schema/legacy/piano. Modifiche locali conservate nel checkout abituale, branch `v2.0.0`.

**Domande / blocchi**
- Nessun blocco tecnico aperto: lavoro fermato esplicitamente dall'utente. Login 42 reale resta la verifica manuale già prevista.

**Prossimo passo**
- Riprendere soltanto quando Ismail lo richiede. Rileggere entrambe le note, piano e questa voce; verificare git status e conservare le modifiche locali.
- Rieseguire `pnpm ci:local`: attesi 92 unit, 186 integration e 40 e2e. Verificare soprattutto R7 e Dialog nativo; eventuali fixture incoerenti vanno corretti rispetto alla nuova regola, senza allentarla.
- Docker al momento dell'arresto: soltanto Postgres dev healthy su 127.0.0.1:5432; stack completo app/nginx fermato per i test. Dopo i controlli ripristinare lo stack con `docker compose -f compose.dev.yaml down` e `docker compose up -d --build --wait`, senza eliminare volumi, e provare HTTPS con CA locale esplicita su 8080/8443.
- Completare commit piccoli della seconda revisione, diario, push e `gh run watch --exit-status` con tutti i sei job verdi; registrare poi la chiusura complessiva delle due revisioni. Non iniziare M7.

## 2026-10-21 — Seconda revisione M4–M6 — bloccata alla ripresa

**Fatto**
- Ripresa autorizzata da Ismail con Ponytail e Caveman. Riletta la voce di interruzione; verificati HEAD `c58b1c7` e modifiche locali conservate, inclusi i test aggiornati. Nessuna modifica al codice in questa ripresa; M7 non iniziato.

**Commit**
- Nessuno; modifiche della seconda revisione ancora nel working tree.

**Controlli**
- `docker compose -f compose.dev.yaml ps`: fallito perché Docker non è disponibile nella distribuzione WSL 2 corrente. Messaggio: "The command 'docker' could not be found in this WSL 2 distro", con richiesta di attivare l'integrazione WSL in Docker Desktop.
- `pnpm ci:local`: fallito immediatamente allo stesso prerequisito Docker, prima di eseguire lint o test.
- Nessun push o nuova CI. Non sono state tentate installazioni, alternative o altre configurazioni.

**Decisioni prese dentro il perimetro del piano**
- Arresto al blocco di ambiente, come richiesto da PLAN.md §1.2 e dalle regole di Ismail.

**Domande / blocchi**
- Ismail deve avviare Docker Desktop e verificare Settings → Resources → WSL Integration per la distribuzione corrente, poi eseguire `docker version`.

**Prossimo passo**
- Dopo la disponibilità di Docker, riprendere dalla voce di interruzione del 2026-10-20: rieseguire `pnpm ci:local`, verificare R7 e dialog nativi con/senza JavaScript, completare commit/diario/push/CI e ripristinare HTTPS 8080/8443. Non iniziare M7.

## 2026-10-21 — Seconda revisione M4–M6 — controlli locali completati

**Fatto**
- Ripresa autorizzata con Ponytail e Caveman. Docker nuovamente disponibile; conservate tutte le modifiche e le note delle interruzioni del 2026-10-20/21. Completati R7 e Ponytail 5–14; nessun punto già completamente risolto all'inizio della seconda revisione. M7 non iniziato.
- **R7:** la data specifica deve coincidere con il giorno ISO scelto. Creazione incoerente respinta; modifica confrontata con la data già salvata, letta sotto il lock esistente. Risposta 400 con chiave dedicata `error_event_date_weekday`, senza scritture, audit o notifiche. Creazione e modifica coerenti consentite.
- **Ponytail 5:** helper `lockAdmin(tx, actor)` in guards: restituisce la riga utente bloccata e verifica il ruolo attuale. Riutilizzato nelle quattro mutazioni eventi, nelle due whitelist e nel ramo admin delle iscrizioni; conservato l'ordine utente prima di evento.
- **Ponytail 6:** metadati dell'audit delle eliminazioni massive passati esplicitamente dai tre chiamanti; rimosse le catene di ternari in deleteMatching, con descrizioni e resourceId invariati.
- **Ponytail 7:** snippet confirmDelete(action, hidden) unico per le tre conferme massive; conservati campi hidden, checkbox obbligatorio, progressive enhancement e validazione lato dominio.
- **Ponytail 8:** unica costante loginPattern in guards usata da login dev, iscrizioni e whitelist. Whitelist classificata in un solo passaggio in Set validi/non validi; conservati normalizzazione e messaggi.
- **Ponytail 9:** creazione eventi con discriminatedUnion per kind, ramo custom con titolo e compenso obbligatori e ramo preset con valori facoltativi validati. Eliminati la seconda parse del titolo e la non-null assertion sul compenso; preservati default e valori fidati dei preset.
- **Ponytail 10:** eliminate le due capitalizzazioni finali duplicate; custom già trasformati dagli schemi e preset già corretti.
- **Ponytail 11:** mantenuti i comandi nativi commandfor/show-modal/close: apertura, annullamento e conferma passano con e senza JavaScript nei progetti desktop/mobile. Eliminati onMount, ready e fallback details. Conservata la chiusura del dialog al submit dei form enhanced.
- **Ponytail 12:** helper locale passed per configurazione e controllo data passata; unico INSERT per iscrizione utente e aggiunta admin dopo i rispettivi controlli. Ordine dei controlli, bypass admin, audit e notifiche invariati.
- **Ponytail 13:** costante weeks riutilizzata nelle tre select admin.
- **Ponytail 14:** restituito direttamente duplicates, già unico grazie alla deduplicazione dei validi.

**Commit**
- `c4465e6` `fix(events): enforce matching specific dates and weekdays`.
- `b20f12d` `refactor: reuse admin guards and native event confirmations`.

**Controlli**
- `pnpm ci:local`: exit code 0; 92 unit, 186 integration, 40 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- Integration R7: 400 dedicato in creazione e modifica incoerenti; nessuna modifica a evento, audit o notifiche; successo con giorno coerente. Conservate tutte le verifiche della prima revisione, concorrenza e rollback.
- Corretti due fixture antecedenti alla nuova regola: custom del 2027-01-01 impostato a venerdì; evento del test concorrenza del 2026-10-20 e relativo update impostati a martedì.
- E2E desktop/mobile: il vecchio tentativo di spostare a lunedì l'evento di domenica 2027-01-31 ora verifica prima il rifiuto R7, poi salva con domenica. Il test senza JavaScript verifica apertura e annullamento di un dialog massivo e singolo, quindi conferma eliminazione singola. Corretto il selettore del test che cercava "Elimina settimana" invece dell'etichetta effettiva "Elimina eventi della settimana"; quel timeout non dipendeva dal supporto ai comandi nativi.
- `git diff --check`: verde. Nessuna modifica a piano, schema, dipendenze o legacy; note precedenti preservate.

**Decisioni prese dentro il perimetro del piano**
- Comandi nativi mantenuti soltanto dopo la verifica richiesta da Ponytail 11, senza introdurre fallback o dipendenze aggiuntive. Nessun nuovo file per la seconda revisione.
- Applicati Ponytail e Caveman. Graphify già consultato nella prima revisione per le funzioni legacy; nessuna ricostruzione del grafo.

**Domande / blocchi**
- Blocco Docker risolto. Nessun altro blocco tecnico. Login 42 reale resta la verifica manuale di Ismail già prevista.

**Prossimo passo**
- Terminare ricostruzione e prova HTTPS, pubblicare i commit e verificare tutti i sei job CI; registrare la chiusura complessiva delle due revisioni. Non iniziare M7.

**Verifica stack HTTPS dopo la ricostruzione**
- `docker compose up -d --build --wait`: exit code 0, app/Postgres healthy e nginx running sulle porte 8080/8443; nessun volume eliminato.
- Health HTTPS 200, admin anonimo 303 e redirect HTTP 8080 verso HTTPS 8443 con 308, verificati con CA locale esplicita e TLS attivo. Nessuna scrittura sul database applicativo durante la prova.

## 2026-10-21 — Revisioni M4–M6 — chiusura

**Fatto**
- Completati e pubblicati tutti i punti delle due note: R1–R7 e Ponytail 1–14. Prima revisione nei commit fino a `3252bb5`; seconda revisione nei commit fino a `fc4be42`.
- Validazione e sicurezza aggiornate, snapshot delle eliminazioni comprensivi delle iscrizioni, messaggi corretti, adattatore form unico e semplificazioni richieste operative. Dialog nativi mantenuti dopo le verifiche con e senza JavaScript su desktop e mobile.
- M7 non iniziato. Nessuna modifica a piano, schema, dipendenze o legacy. Note originali, interruzioni e blocchi precedenti preservati.

**Commit**
- Prima revisione: `974c4b3`, `697bab9`, `5e7b5c8`, `3252bb5`.
- Seconda revisione: `c4465e6` `fix(events): enforce matching specific dates and weekdays`.
- `b20f12d` `refactor: reuse admin guards and native event confirmations`.
- `fc4be42` `docs: record resumed M4-M6 review validation`.

**Controlli**
- `pnpm ci:local`: exit code 0, 92 unit, 186 integration e 40 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- CI [run 39564856309](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39564856309) verde su `fc4be42`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0. Questa esecuzione verifica insieme entrambe le revisioni; la precedente run 39448520312 resta annullata.
- Stack completo ricostruito e lasciato attivo su 8080/8443; app/Postgres healthy e nginx running. Health HTTPS 200, admin anonimo 303 e redirect HTTP 308 verificati con CA locale esplicita e TLS attivo. Nessun volume eliminato o dato applicativo modificato dalla prova HTTPS.
- Working tree pulito prima di questa registrazione finale. Rapporto per ciascuno dei 21 punti nelle voci delle due revisioni.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale ancora da verificare manualmente da Ismail.

**Prossimo passo**
- M7: calendario utente e ICS, da avviare alla prossima richiesta. La regola sugli snapshot in APPLY_TEMPLATE sarà applicata nel modulo template; SSE resta in M9.

## 2026-10-21 — M7 — implementazione e controlli locali

**Fatto**
- Riletti piano e ultima chiusura delle revisioni; verificati working tree inizialmente pulito, branch `v2.0.0`, D2/D3 confermate. Implementati §8.4 e §8.12 senza anticipare M8 o real-time M9.
- Calendario utente con settimana attiva predefinita, clamp della query numerica valida fra 1 e activeWeek, navigazione precedente/successiva soltanto dove consentita e nessun evento di settimane future nel payload. Query non valide respinte con 400.
- Colonne lunedì–venerdì e soltanto i giorni del weekend con eventi; date del pool e specifiche, ordinamento per giorno/ora, titolo/orario/compenso, badge iscritti/posti verde o rosso. Conteggio comprensivo degli assenti secondo D1.
- Payload utenti privo dei login assenti; admin vede tutte le iscrizioni e lo stato assente. Il proprio login presente è evidenziato e offre anche la disiscrizione sul badge. Ordine dello stato: passato, già iscritto, pieno, iscrivibile; la propria iscrizione assente resta rilevata per la disiscrizione, senza rendere il login assente nell'elenco pubblico all'utente.
- Form progressive enhancement e funzionamento senza JavaScript. Dopo iscrizione riuscita, action restituisce l'id validato per selezionare l'evento nella pagina; dialog condiviso con apertura automatica, link Google Calendar e ICS. Dialog visibile anche nella risposta HTML senza JavaScript, riapribile e chiudibile con comandi nativi; conferme admin esistenti conservate.
- Link Google con titolo e descrizione codificati, fallback previsto, UTC e ctz Europe/Rome; assente quando la data non è calcolabile. Endpoint ICS autenticato con id validato, 404 per evento mancante e 409 i18n se la data non è determinabile.
- ICS con PRODID richiesto, un solo VEVENT, UID stabile basato su id/inizio ISO UTC, DTSTAMP dall'ora passata al dominio, DTSTART/DTEND con TZID Europe/Rome, location 42 Firenze e tre allarmi DISPLAY a 1440/120/60 minuti prima. Orari interpretati in Europe/Rome, obbligatorio per il processo come da §6; coperti inverno/estate e transizioni dell'ora.
- Layout minimale a colonne con scorrimento confinato al calendario, focus da tastiera e token di larghezza dedicato; nessuna dipendenza CSS o componente generico aggiunto. D3 verificata con 404 sulla vecchia pagina partecipanti da utente autenticato.
- Installato soltanto `ical-generator` 11.1.2, versione stabile verificata nel registro e compatibile con Node 24 (engines 22 oppure >=24), già consentita da §4.1. Nessun aggiornamento delle dipendenze esistenti.

**Commit**
- `0f4bad3` `chore(deps): add ical-generator for event exports`.
- `0013375` `feat(calendar): add private week views and event calendar exports`.
- `1890810` `feat(calendar): add responsive booking and calendar download flows`.

**Controlli**
- `pnpm ci:local`: exit code 0, 99 unit, 202 integration, 48 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- Sette nuovi unit: struttura ICS e valori esatti, UID/PRODID/DTSTAMP/TZID, tre allarmi, escaping contro iniezioni di proprietà/componenti, UTC Google in inverno/estate e nei due cambi ora, parametri e fallback, data nulla senza link.
- Sedici nuove integration: default/clamp delle settimane, query invalide, colonne weekend separate, ordinamento e date specifiche/pool, redazione degli assenti compreso payload serializzato, conteggi e iscrizione propria assente, precedenza degli stati e istante esatto di fine, ICS con date diverse/null, header download, 404/409/400, autenticazione e metadati soltanto dopo iscrizione riuscita.
- Otto nuovi e2e desktop/mobile: flusso completo con e senza JavaScript (navigazione, iscrizione, dialog, parametri Google, download ICS con nome/contenuto, disiscrizione sul badge, audit), assenti non presenti nell'HTML utente e visibili all'admin, capienza piena anche con assenti, evento passato senza azioni, domenica visibile e sabato assente, XSS come testo, pagina partecipanti eliminata, errori ICS e assenza di overflow a 360px. I test ripristinano impostazioni, eventi e iscrizioni preesistenti nel DB di test.
- Test dei dialog admin con e senza JavaScript e matrice autorizzazioni ancora verdi. Nessun servizio Google esterno aperto nei test: verificati URL e file scaricati, senza accesso a calendari reali.
- `git diff --check`: verde. Nessuna modifica a schema o legacy; preservate tutte le note precedenti.

**Decisioni prese dentro il perimetro del piano**
- Nuovo `domain/calendar.ts` per settimana, stati e privacy del payload utente, senza indebolire il caricamento admin esistente. Nuovo `domain/ics.ts` previsto dal piano e test corrispondenti. Nessun EventCard/WeekNav/ParticipantBadge generico anticipato: la pagina usa markup semantico e riutilizza il Dialog esistente.
- Il contenitore scorrevole ha tabindex e nome accessibile per l'uso da tastiera; unica esclusione locale del warning Svelte sui tabindex non interattivi, motivata nel codice per la regione scorrevole.
- Graphify usato per localizzare calendario e download ICS legacy; letti i sorgenti verificando i percorsi sotto legacy. Consultati README e sorgenti installati di ical-generator per formattazione, timezone e allarmi. Applicati Ponytail e Caveman; nessuna ricostruzione del grafo.

**Domande / blocchi**
- Nessun blocco tecnico nei controlli locali. Login 42 reale resta la verifica manuale di Ismail già prevista.

**Prossimo passo**
- Terminare ricostruzione e prova HTTPS, pubblicare M7 e verificare tutti i sei job CI, quindi aggiornare soltanto lo Stato di M7 nel piano e registrare la chiusura. Non iniziare M8.

**Verifica stack HTTPS dopo la ricostruzione**
- `docker compose up -d --build --wait`: exit code 0, app/Postgres healthy e nginx running sulle porte 8080/8443, nessun volume eliminato.
- Con CA locale esplicita e TLS attivo: health HTTPS 200, calendario anonimo 303, ICS anonimo 401, redirect HTTP 8080 verso HTTPS 8443 sul calendario con 308. Nessuna scrittura sul database applicativo durante la prova.

## 2026-10-21 — M7 — chiusura

**Fatto**
- Completato e pubblicato M7 sul branch `v2.0.0`; aggiornata soltanto la colonna Stato di §19 al commit funzionale `1890810`. M8 non iniziato.
- Calendario utente operativo con settimane disponibili, weekend condizionali, privacy dei login assenti, conteggi D1 e azioni nello stato corretto. Dialog automatico dopo iscrizione con Google Calendar e download ICS, funzionamento con e senza JavaScript. Endpoint ICS autenticato con date/UID/allarmi e risposte 400/404/409 previste.
- Dettagli, decisioni e copertura nella voce precedente. Nessuna modifica a schema o legacy; note originali preservate.

**Commit**
- `0f4bad3`: ical-generator 11.1.2, unica nuova dipendenza consentita dal piano.
- `0013375`: dominio calendario/ICS e test unit/integration.
- `1890810`: pagina, action, endpoint, dialog e browser.
- `8fc8968`: controlli locali e diario.

**Controlli**
- `pnpm ci:local`: exit code 0, 99 unit, 202 integration e 48 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- CI [run 39569270407](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39569270407) verde su `8fc8968`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- Stack completo ricostruito e lasciato attivo su 8080/8443; app/Postgres healthy e nginx running. Health HTTPS 200, calendario anonimo 303, ICS anonimo 401 e redirect HTTP 308 verificati con CA locale esplicita e TLS attivo. Nessun volume eliminato o dato applicativo modificato dalla prova HTTPS.
- Working tree pulito prima di questa registrazione finale. File ICS verificati strutturalmente e scaricati nei browser; nessuna importazione in account Google o client calendario esterni durante i test.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale ancora da verificare manualmente da Ismail.

**Prossimo passo**
- M8: display pubblico, da avviare alla prossima richiesta. Real-time resta in M9.
