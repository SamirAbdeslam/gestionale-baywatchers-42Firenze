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
