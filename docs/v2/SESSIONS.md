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
