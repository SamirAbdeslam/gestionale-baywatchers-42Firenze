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
- 2026-10-21: revisione di M7 e M8. **Da fare dopo la chiusura di M8, prima di iniziare M9.** Se un punto è già risolto, saltalo e scrivilo nel diario. Riferimenti di riga al commit `3e3b40b`. Commit piccoli (`fix(display): ...`, `fix(calendar): ...`, `refactor: ...`), `pnpm ci:local` verde, push, CI verde. Nessun cambiamento di comportamento oltre a R8 e R9.
  - **R8 (media)** `nginx/nginx.conf`: nessun `log_format`, quindi il log di accesso standard scrive `$request` con la query string e il token del display (`/display?token=...`, da M9 anche `/api/stream?token=...`) finisce in `docker compose logs nginx`. Il piano (§8.6) vieta il token nei log. Definisci un `log_format` che usa `$uri` (senza `$args`/`$request`) e usalo in `access_log`, oppure `access_log off` nelle location `/display` e `/api/stream`. Verifica: richiesta con token, poi `docker compose logs nginx` non contiene il valore.
  - **R9 (bassa)** `src/lib/server/domain/ics.ts` L61-75: `downloadIcs` restituisce il file anche per eventi di settimane successive ad `active_week`, che il calendario utente nasconde (§8.4); un utente loggato può enumerare gli id e leggere titolo, data e orario dei turni futuri. Se l'utente non è admin e `event.week > config.activeWeek` → 404 `error_event_not_found`. Test integration: utente normale 404 su settimana futura, admin 200.
  - **Ponytail 15** array `m.weekday_1…7` copiato in `src/routes/admin/+page.svelte`, `src/routes/calendar/+page.svelte` L10-18 e `src/routes/display/+page.svelte` L7-15. Un solo modulo condiviso (es. `src/lib/weekdays.ts`) importato dalle tre pagine.
  - **Ponytail 16** `src/routes/calendar/+page.server.ts` L21-28 e `src/routes/display/+page.server.ts` L12-19: stessa mappatura che formatta `days[].date` ed `events[].date`. Fai restituire le date già formattate a `getCalendar`/`getDisplay` (passando la locale) o usa un helper condiviso.
  - **Ponytail 17** `new Intl.NumberFormat(getLocale()).format(...)` ripetuto in admin, calendario, display, `EventCard.svelte` e `Toast.svelte`. Un solo `formatNumber(value)` condiviso.
  - **Ponytail 18** `src/lib/server/domain/events.ts` L32-38: `datedWeekday` è uno schema Zod usato solo come booleano. Sostituiscilo con una funzione `matchesWeekday(weekday, eventDate)` usata nel refine di `createSchema` e in `updateEvent` (stessa chiave `error_event_date_weekday`).
  - **Ponytail 19** `src/routes/calendar/+page.server.ts` L36-39: l'action `register` rilegge il form con `request.clone()` solo per l'id. Fai includere l'id dell'evento nel risultato di successo di `register` (dominio) ed elimina la seconda lettura.
  - **Ponytail 20** `src/lib/server/domain/display.ts` L16 e L29: controllo `poolStart === null || displayWeek === 4` ripetuto. Tienine uno solo (il test unit di `nextDisplayWeek` deve restare valido).
  - **Test (bassa)** gli e2e girano solo su Chromium (anche il progetto mobile, Pixel 7): i pulsanti `command`/`commandfor` dei dialog non sono provati su WebKit. Aggiungi un progetto Playwright WebKit (anche solo per `events.test.ts` e `calendar.test.ts`); se WebKit non li supporta, segnalalo nel diario prima di cambiare il componente.
- 2026-10-21: revisione di M9. **Da fare prima di iniziare M10.** Se un punto è già risolto, saltalo e scrivilo nel diario. Riferimenti di riga al commit `db38c2e`. Commit piccoli (`fix(realtime): ...`, `refactor(realtime): ...`), `pnpm ci:local` verde, push, CI verde. Nessun cambiamento di comportamento oltre a R10–R12.
  - **R10 (media)** `src/routes/api/stream/+server.ts` e `src/lib/server/realtime/bus.ts` L7: nessun limite alle connessioni SSE (`setMaxListeners(0)`); con `DISPLAY_TOKEN` vuoto anche un anonimo può aprire lo stream, e uno script con migliaia di `EventSource` esaurisce file descriptor e memoria del processo. Aggiungi un tetto globale: esporta dal bus il numero di ascoltatori (`emitter.listenerCount('event')`) e, se è ≥ 500, rispondi 503 prima di creare lo stream (costante nel codice, commento `shortcut:` con il limite). Niente `limit_conn` per IP in nginx: gli studenti possono uscire con lo stesso IP della scuola. Test unit o integration: al tetto la richiesta riceve 503 e non registra ascoltatori.
  - **R11 (media)** `src/lib/realtime.ts`: dopo una riconnessione nativa di `EventSource` (riavvio app, reload nginx) gli eventi persi non vengono recuperati e la pagina resta con dati vecchi fino al prossimo evento. In `listenRealtime` aggiungi un callback di ricarica chiamato su ogni `open` successivo al primo; le quattro pagine passano lo stesso `invalidate` che già usano. Test unit: secondo `open` → callback chiamato una volta; primo `open` → nessuna chiamata.
  - **R12 (bassa)** `src/routes/display/+page.svelte`: stato "Passato" e avanzamento di `display_week` si calcolano solo al caricamento; senza `DISPLAY_REDIRECT_URL` la TV non ricarica mai e un evento finito resta "N posti liberi". Nello stesso `onMount` aggiungi `setInterval(() => invalidate('app:display'), 60000)` e ripuliscilo nel cleanup. Test e2e o unit con orologio finto: dopo 60 s parte un `invalidate`.
  - **Ponytail 21** `src/routes/admin/+page.svelte`: l'handler realtime invalida anche su `log_created`, quindi ogni iscrizione ricarica il pannello due volte (`event_changed` + `log_created`). Ignora `log_created` come fa già il calendario.
  - **Ponytail 22** `src/lib/realtime.ts` L20-37 e `src/routes/api/stream/+server.ts` L25: tre listener separati, uno per tipo, ognuno con il suo `JSON.parse`. Il server invia solo `data: {"type":…,…}` senza riga `event:`, il client usa un solo `source.onmessage` con `realtimeEventSchema.safeParse`. Aggiorna i test unit dello stream.
  - **Ponytail 23** `src/lib/realtime.ts` L34-35: il ciclo `removeEventListener` prima di `source.close()` è inutile; basta `close()`.
- 2026-10-21: revisione di M10. **Da fare prima di iniziare M11.** Se un punto è già risolto, saltalo e scrivilo nel diario. Riferimenti di riga al commit `b3da838`. Commit piccoli (`fix(templates): ...`, `refactor(templates): ...`), `pnpm ci:local` verde, push, CI verde. Nessun cambiamento di comportamento oltre a R13–R14.
  - **R13 (media)** `src/lib/server/domain/templates.ts` `applyTemplate` L104-147: il lock copre solo l'admin e il template. Due admin che applicano nello stesso momento due template **diversi** alla stessa settimana vuota vedono entrambi 0 eventi e inseriscono entrambi: settimana raddoppiata senza avviso. All'inizio della transazione, dopo `lockAdmin`, blocca la riga `settings` (`SELECT ... FOR UPDATE` su id 1) così le applicazioni sono serializzate; rispetta l'ordine dei lock già usato (utente, poi settings, poi eventi) e verifica che nessun altro percorso blocchi `settings` dopo gli eventi. Test integration di concorrenza: due template diversi sulla stessa settimana vuota, senza overwrite → uno applicato, l'altro warning `template_existing`.
  - **R14 (bassa)** `src/lib/server/domain/templates.ts` L17-22: `templateSchema` senza tetto alle righe e descrizione del template senza lunghezza massima (anche nel DB, `schema.ts` L123). Aggiungi `events.max(200)` e `description.max(500)`, più il vincolo `char_length(description) <= 500` su `week_templates` con migrazione Drizzle, come per eventi e `template_events`. Test integration: 201 righe e descrizione di 501 caratteri → 400, nessuna scrittura.
  - **Ponytail 24** `src/lib/server/domain/csv.ts` L5-20: `templateEventSchema` ricopia campi e regole di `editable`/`timeOrder` di `events.ts` (titolo, descrizione, orari, posti, compenso, inizio < fine). Esportali da `events.ts` e componi lo schema del template da lì (con i default 2/0 e `eventDate` del template); i test esistenti devono restare verdi.
  - **Ponytail 25** `src/routes/admin/templates/new/+page.server.ts` L17-42: il salvataggio riscrive la mappatura `ZodError` → 400 di `formAction`. Tieni nell'action solo i rami `add`/`remove:<i>` e delega `save` a `formAction` (aggiungendo `values` alla risposta), senza cambiare messaggi o status.
  - **Ponytail 26** `src/lib/server/domain/templates.ts` L237: il limite di 1 MB è controllato sia nel `refine` del file sia in `parseTemplateCsv`. Tieni solo quello di `parseTemplateCsv` (il `refine` controlla estensione e file non vuoto).
  - **Da fare in M11** `src/lib/server/domain/csv.ts` `writeCsv` L22-35: gli export CSV di M11 useranno questa funzione. Una cella che inizia con `=`, `+`, `-` o `@` (es. titolo evento) viene eseguita come formula da Excel (CSV injection). Prefissa `'` a queste celle in `writeCsv`, con un test unit.
- 2026-10-22: revisione di M11–M13. Nessun bug: solo pulizie, **da fare prima di iniziare M14**. Se un punto è già risolto, saltalo e scrivilo nel diario. Riferimenti di riga al commit `d4d1d91`. Commit piccoli (`refactor(...)`, `docs(plan): ...`), `pnpm ci:local` verde, push, CI verde. Nessun cambiamento di comportamento.
  - **Ponytail 27** `src/routes/admin/participants/+page.svelte` L13: `dateTime` crea un `Intl.DateTimeFormat` nuovo per ogni iscrizione a ogni render. Crea il formatter una sola volta e usa `formatter.format(date)`; i test esistenti devono restare verdi.
  - **Ponytail 28** `docs/v2/PLAN.md` §8.11: le ore del profilo si arrotondano con `toFixed(1)`, che sui valori esattamente a metà arrotonda per eccesso, mentre il legacy (`round` di Python) va al pari: 1h15 = 1,25 h è `1.3` in v2 e `1.2` nel legacy. Il codice resta così. Aggiungi in §8.11 una riga che documenta la differenza come accettata. Sui CSV a 2 decimali il pareggio non può capitare, quindi `verify-legacy-import` resta valido.
  - **Ponytail 29** `src/lib/server/domain/logs.ts` L71, `src/routes/admin/logs/+page.svelte` L167-169, `src/lib/styles/tokens.css` L47: la categoria `setting` non scatta mai, perché il controllo di update riconosce già `set` (`UPDATE_SETTING` → `update`, come nel legacy e come conferma il test unit). Cancella il ramo `setting`, la classe `.setting` e il token `--color-log-setting`; il test unit `logCategory` deve restare verde senza modifiche.
- 2026-10-22: M14, scarti tra design e vincolo «nessuna modifica a logica/query». Decisioni sui punti segnalati dall'agent (già inviate in chat). Fuori da questi punti il vincolo resta: nessuna modifica a logica, query o form action in M14, tranne il tema (design README §2).
  - **M14-1 (eccezione consentita)** Calendario, contatore "I tuoi turni": in `getCalendar` (`src/lib/server/domain/calendar.ts`) aggiungi al `return` il campo `maxEventsPerUser: config.maxEventsPerUser` (la riga `settings` è già letta: nessuna query nuova). Numero dei miei turni e somma `₳` si ricavano nella vista dagli eventi già caricati. Con `maxEventsPerUser = 0` il contatore mostra solo numero e `₳`, senza quadrati. Test: unit su `getCalendar` che il campo arrivi; e2e che il contatore cresca dopo "Prendo il turno".
    - **M14-1a (caso limite, eccezione consentita)** Per un utente normale `participants` esclude gli assenti, inclusa la propria iscrizione, quindi non basta per contare. Aggiungi a ogni evento `isRegistered: registered` (già calcolato prima del filtro, nessuna query nuova, non espone altri partecipanti). Quadrati e conteggio del contatore = eventi con `isRegistered`, come il limite in `registrations.ts` (che conta anche iscrizioni passate e assenze). `₳` = somma di `compensation` degli eventi con `isRegistered`, escludendo quelli con `state === 'passed'` in cui l'utente non compare in `participants` (assente). Test: unit con un evento passato in cui l'utente è assente (conta nel limite, non nei `₳`).
    - **M14-1b (presentazione)** Contatore: quadrati solo con `maxEventsPerUser` da 1 a 10; oltre 10 solo `n/limite · ₳`, come i posti dei biglietti (design README §4.2). Con 0 resta quanto già deciso in M14-1. Valore e regola del limite invariati. Test: unit o e2e con limite 11 (nessun quadrato, testo `n/11`).
  - **M14-2 (eccezione consentita)** Profilo, stato "In programma": in `readParticipantReports` (`src/lib/server/domain/reports.ts`) aggiungi a ogni evento `passed: isPassed(date, endTime, now)`, riusando `isPassed` di `dates.ts` (Europe/Rome), con `now` passato come parametro. Vista: non passato → "In programma"; passato e `attended` → "Partecipato"; passato e non `attended` → "Non partecipato" (barrato). CSV e riepilogo admin invariati. Test: unit con `now` fisso per i tre stati, compreso l'evento che finisce esattamente a `now` (non passato).
  - **M14-3 (nessun dato vero)** Accesso, anteprima della settimana: niente query nuova e niente riuso dei dati del display (con il token del display impostato, D4, li esporrebbe senza token). Tre biglietti decorativi fissi nel markup (Esame 11:00, Icebreaker 14:00, Rush 16:00, come in `docs/v2/design/screens/accesso-desktop.png`), `aria-hidden="true"`, testi da Paraglide. Nessuna modifica a `src/routes/+page.server.ts`.
  - **M14-4 (logica invariata)** Profilo, totali Ore e Altarian: nel mockup escludono la settimana in programma, ma nel codice `attended` vale `true` di default (`schema.ts`) e i turni futuri contano, come nel legacy (§8). Tieni la logica attuale; i numeri del mockup sono solo un esempio.
  - **M14-5 (eccezione consentita)** Template, barra dei `kind`: in `listTemplates` (`src/lib/server/domain/templates.ts`) aggiungi nella stessa query `kinds`, i `kind` degli eventi del template ordinati per `weekday`, `startTime`, `id`, con `array_agg(... ORDER BY ...) FILTER (WHERE template_events.id IS NOT NULL)` e `coalesce` a `'{}'` (template vuoto → `[]`, non `[null]`). `eventCount` resta. Vista: un quadratino per evento con `--color-<kind>`, `aria-hidden="true"`; il conteggio testuale resta visibile. Test: integration con un template vuoto e uno con eventi in ordine non banale.
  - **M14-6 (spostamento consentito)** Sposta `src/lib/server/domain/kinds.ts` in `src/lib/kinds.ts` (modulo puro: niente DB né segreti), così il builder del template può usare `inferKind` nel browser. Funzione e contenuto identici. Nessun re-export nel vecchio percorso: aggiorna tutti gli import (`schema.ts`, `admin/+page.server.ts`, `admin/templates/new/+page.svelte`, `EventCard.svelte`, `tests/unit/dates-kinds.test.ts`, `tests/integration/events.test.ts`, `scripts/legacy/fixtures.ts`, `scripts/legacy/normalize.ts`). `pnpm check` e i test devono restare verdi senza altre modifiche.
  - **M14-7 (CSP: eccezione consentita, solo attributi `style`)** SvelteKit crea `#svelte-announcer` con uno `style` inline (`@sveltejs/kit` `root.svelte`), bloccato da `style-src 'self'`. In `vite.config.ts` aggiungi solo `'style-src-attr': ['unsafe-inline']`, come fanno GitHub e Proton ma più ristretto: `style-src` resta `'self'` (niente tag `<style>` né fogli esterni), `script-src` invariato, nessuna dipendenza nuova, nessuna regola di riserva in `base.css`. Il nostro codice continua a non usare `style=` inline: solo classi e variabili di `tokens.css`. Test e2e: dopo una navigazione client `#svelte-announcer` è largo 1px, contiene il titolo e non c'è nessuna violazione CSP in console. Verifica che il design non introduca altre violazioni.
  - **M14-8 (dati di presentazione consentiti)**
    - Calendario: in `formatWeekDates` (`src/lib/server/domain/dates.ts`) conserva la data ISO dei giorni come `isoDate` prima di formattare `date`. "Oggi" nella vista = `isoDate` uguale alla data corrente in Europe/Rome (`Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' })`), mai il fuso del browser. `isoDate` null (nessun `poolStart`) → nessun giorno "oggi". Test: unit su `formatWeekDates` che `isoDate` resti ISO.
    - Admin: sposta la costruzione di `displayUrl` da `src/routes/admin/+page.server.ts` a un nuovo `src/routes/admin/+layout.server.ts` (stessa logica, `env.ORIGIN` + `DISPLAY_TOKEN`, nessuna query), con `assertAdmin(locals.user)`. Toglila da `+page.server.ts`: una sola copia. Nessuna modifica alle azioni. Test: e2e che "Apri il display TV" nella sottobarra di una pagina admin diversa da `/admin` punti all'URL con token.
  - **M14-9 (Zod senza JIT nel browser, consentito)** Zod 4 prova `new Function('')` per il JIT; la CSP lo blocca e il browser registra una violazione, anche se Zod ripiega già sull'interprete. Crea `src/hooks.client.ts` con solo `import { z } from 'zod'; z.config({ jitless: true });` e un commento di una riga sul perché. Non metterlo in `src/lib/realtime.ts`: quel modulo è importato anche dal server e `z.config` è globale, spegnerebbe il JIT anche lato server. Nessuna modifica a schemi, validazioni, CSP o dipendenze. Test e2e: su `/calendar` e `/admin` nessuna violazione CSP in console.
  - **M14-10 (presentazione consentita)** Display: in `getDisplay` (`src/lib/server/domain/display.ts`) aggiungi al risultato di ogni evento solo `maxSlots` (già letto, nessuna query nuova). Posti presi nella vista = `maxSlots - freeSlots`; non aggiungere `registeredCount`, sarebbe un doppione. Login degli assenti sempre nascosti. Quadrati fino a 10 posti, oltre solo numero (design README §4.2). Test: unit su `getDisplay` con un assente (quadrati presi contano anche l'assente, il suo login non compare).

- 2026-10-23: **Avatar 42 tramite server, senza salvataggio**, nuova rotta autorizzata (variante avatar sostitutiva del punto 10 indicato in chat). Usare image.versions.medium con fallback image.link, nella colonna esistente users.image_url; token client_credentials solo in memoria, scadenza meno 60 s e una promise condivisa. GET /avatar/[login] autenticato, login validato e URL esclusivamente dal DB, solo HTTPS su cdn.intra.42.fr senza redirect, immagine 200 image/* fino a 2 MB letti con limite. Nessuna immagine su file/DB/volume/cache server; sola cache browser private, max-age=86400. Avatar condiviso in header/profilo con iniziali su errore, nessun URL CDN nei dati client; img-src self/data. Nessuna modifica a schema, migrazioni o dipendenze.
  - Eccezione hooks approvata: conservare Cache-Control soltanto per route.id /avatar/[login] con status 200; per tutti gli altri casi, inclusi avatar 401/404, resta private, no-store. Nginx: location /avatar/ con proxy_pass http://app, proxy_buffering off e proxy_cache off, senza add_header locali.
  - CSP della risposta avatar: default-src 'none'; frame-ancestors 'none'; sandbox. **HSTS non era presente ed era stato indicato per errore nello smoke: non aggiungerlo né richiederlo allo smoke locale.** Annotare in CUTOVER.md la decisione per il dominio di produzione. Lo smoke verifica CSP avatar/nosniff e CSP HTML invariata.
  - Correzione Avatar approvata: nessun onerror nel markup Svelte. Il replay degli eventi di Svelte genera un attributo inline incompatibile con la CSP. Collegare error con addEventListener in onMount, rimuoverlo allo smontaggio e controllare complete/naturalWidth al mount. Test prima/dopo idratazione senza violazioni CSP; senza JS resta alt.
  - Test senza chiamate reali a 42; verifica separata su credenziali/foto reali, con esito riportato nel diario. M15 non iniziato.

- 2026-10-23: **Design v2 autorizzato per l’implementazione** dalla specifica baywatchers-design/DESIGN-V2.md (copia nel repository: docs/v2/design/DESIGN-V2.md). Biglietti compatti, pillole piene, calendario mobile ibrido con scroll snap, messaggi in alto a destra con successi a 4 s, menu sull’avatar e toolbar admin compatta. Conservare regole applicative, query e action, CSP e dipendenze. Le esportazioni PNG e gli artboard disponibili sono ancora v1; la galleria dell’app resta distinta dal canvas. M15 non iniziato.

- 2026-10-26: revisione di `1d044f6`, `47cfae5` e `c0ee267` (avatar e design v2) più report Lighthouse di `/calendar` del 2026-10-23 (mobile 70, desktop 98). **Da fare prima di iniziare M15.** Se un punto è già risolto, saltalo e scrivilo nel diario. Riferimenti di riga al commit `c0ee267`. Commit piccoli (`fix(avatar): ...`, `ci: ...`, `fix(a11y): ...`, `perf: ...`), `corepack pnpm ci:local` verde, push, `gh run watch <id> --exit-status` con i sei job verdi. Se qualcosa non va come descritto, fermati e chiedi.
  - **R15 (media)** `src/routes/avatar/[login]/+server.ts` L7-16: la rotta controlla solo che l'utente sia loggato, quindi chiunque può ottenere la foto 42 di qualunque login presente nel DB (es. `/avatar/igilani`). Ismail ha autorizzato la rotta a condizione che ognuno veda solo la propria foto. Se `params.login !== locals.user.login` rispondi `404` (stesso `Cache-Control: private, no-store` degli altri 404), senza leggere il DB né chiamare il CDN. L'app usa `Avatar` solo per l'utente stesso (`+layout.svelte` L79, `profile/+page.svelte` L15), quindi nessuna pagina cambia. Test: utente A chiede `/avatar/<login di B>` → 404 e nessuna `fetch`; utente A chiede il proprio → comportamento attuale.
  - **R16 (media)** `.github/workflows/ci.yml`: nessun job ha `timeout-minutes`. La run `39964427309` di `c0ee267` è stata cancellata dopo 6 h: l'e2e si è bloccato su `pnpm exec playwright install --with-deps chromium webkit` (L110), durante l'installazione apt, prima dei test. Il commit non è quindi verificato dalla CI remota. Aggiungi `timeout-minutes` a ogni job: 30 per e2e, 15 per gli altri. Dopo il push verifica che i sei job siano verdi, compreso il codice di `c0ee267`, e riporta l'id della run nel diario. Se l'installazione si blocca di nuovo, fermati e riporta: non cambiare il modo di installare i browser senza conferma.
  - **Ponytail 30** `src/lib/components/Toast.svelte` L46-60: senza JavaScript il clic sulla × chiude il `<details>` ma la × resta visibile come un quadratino. Nascondi `.notice:not([open])` (o il suo contenitore) con una regola CSS. Test senza JS: dopo il clic sulla × il messaggio non è più visibile.
  - **L1 (media, CLS)** Lighthouse mobile su `/calendar`: CLS 0,235, tutto su `.calendar`. Dopo `c0ee267` la barra dei giorni è già generata in SSR: rimisura. Se il CLS mobile resta ≥ 0,1, individua cosa cambia dopo l'idratazione (es. `showDay` all'apertura, attributi `role`/`tabindex` che cambiano con `ready`) e correggi senza nascondere giorni.
  - **L2 (bassa, prestazioni)** CSS che bloccano il rendering: 6 file piccoli (0.css, 11.css, EventCard, Logo, ParticipantBadge, Dialog; 0,7–4,8 KB), stimati 1,15 s su mobile. Prova `kit.inlineStyleThreshold` (circa 5 KB) nella configurazione di SvelteKit. SvelteKit aggiunge l'hash degli stili inline che genera alla CSP: verifica con `design.test.ts` (nessuna violazione CSP, anche WebKit) e confronta FCP prima e dopo. Se la CSP si rompe o serve `unsafe-inline`, annulla e riporta.
  - **L3 (media, contrasto)** `src/lib/components/WeekNav.svelte` L71: i chip "Non aperta" usano `opacity: var(--opacity-faint)`, e il testo ha un contrasto di 2,26:1 (serve 4,5:1). Niente opacità sul testo: usa `--color-muted` e un bordo tratteggiato per indicare la settimana non disponibile. Contrasto AA nei due temi.
  - **L4 (media, nome accessibile)** `src/lib/components/WeekNav.svelte` L26: il link mostra "W01 Attiva" ma ha `aria-label` "Settimana 1" / "precedente" / "successiva", quindi chi usa i comandi vocali non lo attiva dicendo "W01". Togli `aria-label` dai link e metti il testo per screen reader in uno `<span class="sr-only">` dentro il link, così il nome contiene il testo visibile. Inoltre L8: la `nav` usa `m.calendar_events()` ("Eventi della settimana"), lo stesso nome della griglia del calendario. Nuova chiave con etichetta "Settimane". Aggiorna i test che usano questi nomi.
  - **L5 (bassa, titoli)** `src/routes/calendar/+page.svelte` L233: i titoli dei giorni sono `h3`; su mobile si passa da `h1` a `h3`. Passali a `h2` e adegua il CSS. I test cercano i titoli per nome.
  - **L6 (bassa, SEO)** `src/app.html`: aggiungi `<meta name="description">` con una frase breve in italiano.
  - **Chiusura** Rifai Lighthouse mobile e desktop su `/calendar` (stack HTTPS su 8443) e riporta i punteggi nel diario. Obiettivi: CLS mobile < 0,1, nessun errore di contrasto, di nome accessibile o di ordine dei titoli. Rigenera la galleria solo se cambia l'aspetto. Nessun riferimento ad AI nei commit. M15 non iniziato.
  - **Risposte di Ismail (2026-10-26)**: autorizzato EventCard con prop numerico del livello e svelte:element, h4 predefinito; h3 nel calendario e h2 nella landing, h4 in admin/display/dialog. Il nome del pulsante avatar deve contenere @login e iniziali visibili; testo sr-only nel pulsante, iniziali accessibili solo nell'header, immagine header con alt vuoto; profilo invariato. L2 da annullare: «provato, FCP invariato (mobile 3,62→3,71 s, desktop 0,864→0,853 s), annullato». Lighthouse 13.4.1 tramite npx, simulate, mobile e desktop su 8443, solo seed del DB di test, nessun cookie/token nei report o nel repository, JSON fuori repo; nessuna modifica a package.json/lockfile.

- 2026-10-26: revisione di `dcb859e`..`fdb1cc0`: tutto approvato, CI `40295195870` con i sei job verdi. Due ritocchi di accessibilità, poi M15 resta fermo fino al mio via.
  - **Ponytail 31 (lean)** `src/routes/+page.svelte` L32, L45, L58: le tre `EventCard` d'anteprima stanno dentro `.preview` con `aria-hidden="true"`, quindi `headingLevel={2}` non ha effetto né per gli screen reader né per Lighthouse. Togli le tre righe: resta h4, il valore predefinito. Era una mia indicazione sbagliata.
  - **Ponytail 32 (a11y)** `src/routes/display/+page.svelte` L53-62: la settimana è `h1` e i giorni sono `h3`, quindi manca un livello come in L5. Porta i giorni a `h2` con una classe propria e le card a `headingLevel={3}`. L'aspetto non deve cambiare: se gli stili globali di `h2` differiscono da quelli di `h3`, ripristina le misure attuali con CSS circoscritto alla pagina, come fatto per `.day-heading` nel calendario. Aggiorna `tests/e2e/display.test.ts` verificando `level: 2` per i giorni e `level: 3` per un titolo di card.
  - **Chiusura** `corepack pnpm ci:local` verde, Lighthouse 13.4.1 su `/display` (mobile e desktop, stesse regole della misura precedente) senza errori di ordine dei titoli, commit `fix(a11y): ...`, push e sei job verdi con id nel diario. Rigenera la galleria solo se cambia l'aspetto. M15 non iniziato.

- 2026-10-26: **CI e2e bloccata, causa trovata.** Nel log della run cancellata `39964427309` il passo `pnpm exec playwright install --with-deps chromium webkit` esegue `apt-get update`. Il mirror `http://azure.archive.ubuntu.com` del runner non risponde (`Ign:2..15`). Dopo l'ultimo `Get:5 ... noble-security InRelease` alle 13:51:30 non arriva più nulla fino alla cancellazione delle 19:49. La run `40302378178` di `18701b4` è ferma sullo stesso passo da 09:49 UTC, mentre nelle run riuscite il passo dura circa 40 s. Il problema è la rete del runner GitHub verso il mirror apt, non il nostro codice.
  - **CI-1** In `.github/workflows/ci.yml` il job `e2e` gira nel container ufficiale `mcr.microsoft.com/playwright:v1.64.1-noble`. La versione è la stessa di `@playwright/test` in `package.json`: browser e dipendenze di sistema sono già nell'immagine, quindi niente `apt` e niente download dei browser. Togli il passo `playwright install`. Nel job imposta `DATABASE_URL: postgres://bay:bay@postgres:5432/baywatchers_test`, perché dal container il servizio si chiama `postgres` e non `localhost`. Lascia invariati `ORIGIN`, gli altri job e il `DATABASE_URL` globale. Togli `ports` dal servizio solo se non serve più. Tieni `timeout-minutes: 30`.
  - **CI-2** Accanto alla versione di `@playwright/test` in `package.json` non si possono mettere commenti. Metti quindi un commento di una riga nel workflow: `# shortcut: image tag must match @playwright/test in package.json, bump both together`. Se le versioni non coincidono, i test devono fallire subito con l'errore di browser mancante di Playwright, non restare bloccati.
  - **Verifica** `corepack pnpm ci:local` verde, commit `ci: run e2e in the Playwright container`, push e sei job verdi con id nel diario. Il push annulla da solo la run bloccata (`cancel-in-progress`). Se nel container compaiono problemi di permessi, utente root, sandbox di Chromium o cache pnpm, fermati e riporta senza aggirarli. M15 non iniziato.

- 2026-10-26: **CI e2e nel container: fallisce l'installazione delle dipendenze.** Nella run `40305382981` di `f7fe466` l'e2e si ferma dopo 55 s su `pnpm install`, con `better-sqlite3 install: gyp ERR! stack Error: not found: make`. L'immagine Playwright non contiene `make` e `g++`, che sul runner standard sono già installati. Gli altri cinque job sono verdi. Decisione di Ismail: opzione 1, nessuna compilazione nativa nel job e2e.
  - **CI-3** Solo nel job `e2e` di `.github/workflows/ci.yml` sostituisci `pnpm install --frozen-lockfile` con `pnpm install --frozen-lockfile --ignore-scripts && pnpm run prepare`. `--ignore-scripts` salta anche lo script `prepare` del progetto (Paraglide e `svelte-kit sync`), per questo va rilanciato a mano. Esbuild usa il pacchetto binario della piattaforma. Gli altri job non cambiano. Commento di una riga sul perché: `# no build tools in the Playwright image; better-sqlite3 is only needed by the legacy import`.
  - **Perché dovrebbe bastare** `better-sqlite3` carica il modulo nativo solo in `new Database(...)` (`node_modules/better-sqlite3/lib/database.js` L46). Il seed importa `scripts/import-legacy.ts` ma, per quanto ho visto, usa solo `writeData` e non apre file SQLite. Verificalo.
  - **Verifica locale prima del push** Lavora in una copia temporanea fuori dal repo, non nella cartella di Ismail, e senza toccare i volumi Docker. In quella copia lancia `pnpm install --frozen-lockfile --ignore-scripts && pnpm run prepare`. Controlla che `node_modules/better-sqlite3/build` non esista. Poi, sul DB di test, `pnpm db:migrate`, `pnpm db:seed`, `pnpm build` e `pnpm test:e2e`. Se il seed o un e2e richiede il binding nativo, fermati e riporta: si passa all'opzione 2 solo con il mio via.
  - **Chiusura** `corepack pnpm ci:local` verde nel repo, commit `ci: skip native builds in the e2e container`, push e sei job verdi con id nel diario. Poi committa il diario. M15 non iniziato.

- 2026-10-26: revisione di `290d4d8`/`ccc37b8`: approvati, la CI `40308454799` ha i sei job verdi. Restano due punti, poi M15 attende il mio via.
  - **T1 (bassa, test instabile)** `tests/e2e/profile.test.ts:223`, variante "before hydration", solo su `webkit-shared`. Nella run `40308454799` ha superato i 30 s dentro il `try` al primo tentativo e poi è passata al retry. Su Chromium e mobile dura circa 0,5 s. Ipotesi non verificata: con gli script `/_app/**/*.js` bloccati dal `gate`, WebKit a volte non segnala l'errore dell'immagine, quindi `waitForFunction` resta in attesa fino al timeout. Riproduci in locale con `pnpm exec playwright test tests/e2e/profile.test.ts:223 --project=webkit-shared --repeat-each=30`.
    - Se si riproduce, apri la traccia e correggi solo il test. Non allungare il timeout e non escludere WebKit. Se la causa è nell'app e non nel test, fermati e riporta.
    - Se non si riproduce, scrivilo nel diario e lascia il test com'è.
  - **D1 (documentazione)** Ho aggiornato la specifica di design in `~/personal_github/baywatchers-design/DESIGN-V2.md`: §6 rotta `/avatar` e nome accessibile dell'avatar, nuovo §11 su accessibilità e Lighthouse. Copiala identica in `docs/v2/design/DESIGN-V2.md`.
  - **Chiusura** `corepack pnpm ci:local` verde. Commit piccoli: `test(e2e): ...` solo se T1 cambia il test, `docs: ...` per DESIGN-V2 e diario, compresa la precisazione sul test instabile ancora non committata. Push e sei job verdi con id nel diario. M15 non iniziato.

- 2026-10-26: **Piano di lavoro fino alla fine: fix, poi M15, poi M16.** Questa voce autorizza i tre blocchi in sequenza, nello stesso ordine, senza attendere un mio via tra un blocco e l'altro. Valgono le regole del PLAN (§1): `ci:local` verde, push a fine di ogni blocco, CI con i sei job verdi prima del blocco successivo e una voce di diario per ogni sessione. Se qualcosa non va come descritto, fermati e chiedi. Alla fine Ismail fa fare una verifica finale: non iniziare altro lavoro.
  - **Blocco A — fix prima di M15**
    - **A1 (CLS `/display`)** Lighthouse 13.4.1 mobile su `/display` riporta CLS 0,119, con 2 spostamenti di layout; desktop 0,128. Individua gli elementi che si spostano (audit `layout-shifts` / `cls-culprits-insight`) e correggi la causa, per esempio con dimensioni riservate o font. Non nascondere contenuti e non usare stili inline. Obiettivo: CLS < 0,1 in mobile e desktop. Rimisura con le stesse regole delle misure precedenti e riporta i valori nel diario.
    - **A2 (`robots.txt`)** `/robots.txt` oggi risponde con una pagina HTML e Lighthouse toglie punti SEO. Aggiungi `static/robots.txt` con due righe: `User-agent: *` e `Allow: /`. Verifica che sia servito come `text/plain` anche dietro nginx. Test e2e o di integrazione: risposta 200 `text/plain`.
    - Commit `fix(display): ...` e `fix(seo): ...`, push e CI verde.
  - **Blocco B — M15, con queste modifiche al PLAN decise da Ismail**
    - **Niente dump**: `scripts/backup.sh` non va fatto, e nel README non c'è la sezione backup e ripristino. La produzione parte con un **database vuoto**. Il passaggio dei dati dal vecchio sito si deciderà in un secondo momento.
    - **`docs/v2/CUTOVER.md`** è il runbook di avvio con DB vuoto:
      - preparazione di `.env` (senza valori segreti nel documento);
      - certificato;
      - `docker compose up -d --build`;
      - migrazioni;
      - controlli di salute;
      - primo login 42 di `igilani`, admin da `ADMIN_LOGINS`;
      - impostazioni iniziali (date del pool, settimana attiva);
      - stop del vecchio Flask.
    - Niente import di `calendar.db` nel runbook. Mantieni la sezione HSTS esistente: la decisione resta mia, scrivila sotto "Domande / blocchi", non implementarla e continua con il resto.
    - **`compose.yaml` definitivo** secondo §15.3: `db` senza porte esposte, `app` senza porte, `restart: unless-stopped`, healthcheck. Mai `docker compose down -v`. Porte autorizzate: solo 8080 e 8443.
    - **`README.md` nuovo**: setup, sviluppo, test, stack completo, certificato locale, redirect URI 42 da registrare (azione manuale mia). Gli script di import legacy restano nel repo: nel README c'è una riga che li indica come strumento disponibile, non usato nel cutover.
    - **`legacy/` non va cancellata.** Non ho dato la conferma scritta: lasciala intatta e chiedimelo a fine lavoro.
    - Aggiorna lo stato di M15 nella tabella §19. Commit piccoli (`chore(docker): ...`, `docs: ...`), push e CI verde.
  - **Blocco C — M16 (§11)**
    - `messages/en.json` e `messages/fr.json` complete, con le stesse chiavi di `it.json`.
    - Selettore di lingua nel layout, visibile anche su mobile e da non loggati (landing). Deve funzionare senza JavaScript, cioè impostare il cookie della strategia Paraglide tramite link o form. Niente stili inline, CSP invariata, nome accessibile, contrasto AA, nessuno spostamento di layout.
    - Date e numeri con `Intl` nella lingua corrente. Restano in italiano titoli e descrizioni degli eventi, CSV e descrizioni dei log.
    - Test che verifica le stesse chiavi nei tre file. E2e di un flusso per lingua (login di sviluppo, calendario, iscrizione), con e senza JS.
    - Traduzioni naturali, non letterali. Termini 42 come "wallet", "₳" e "intra" restano invariati.
    - Rigenera la galleria solo se cambia l'aspetto, e solo in italiano.
    - Aggiorna lo stato di M16 nella tabella §19. Commit `feat(i18n): ...`, push e CI verde.
  - **Fine** Ultima voce del diario con stato "pronto per la verifica finale". Includi:
    - elenco dei commit;
    - id delle run CI;
    - misure Lighthouse (A1);
    - domande aperte: HSTS, cancellazione di `legacy/`, passaggio dati.

    Poi fermati. Nessun riferimento ad AI nei commit. Non stampare `.env` né segreti.

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

## 2026-10-21 — M8 — implementazione e controlli locali

**Fatto**
- Ripresa dal punto corrente, riletti piano e note; branch `v2.0.0`, D2/D4 confermate. Implementato §8.6 senza real-time M9.
- Dominio `display.ts`: autorizzazione prima di leggere o avanzare le impostazioni. Con DISPLAY_TOKEN vuota accesso pubblico; se valorizzata, confronto a tempo costante tramite il guard esistente e 404 generico per token mancante o errato. Admin autenticato sempre ammesso. Nessuna registrazione del token nei log applicativi o nel payload del display.
- `advanceDisplayWeek(database, now)` blocca settings con SELECT FOR UPDATE. Nessun avanzamento senza inizio pool; settimana vuota avanti di un solo passo per richiesta; settimana terminata avanti soltanto se la successiva contiene eventi; limite alla quarta settimana. Settimana attiva indipendente e invariata, updatedAt modificato soltanto quando avanza displayWeek.
- Display con colonne lunedì–venerdì, sabato/domenica solo quando popolati, date concrete e ordinamento per giorno/ora. Titolo, orario, compenso, posti liberi calcolati su tutte le iscrizioni D1 e stato Passato/Completo/posti liberi. Soltanto login presenti, anche per l'admin; nessuna identità assente nel payload.
- Pagina in sola lettura senza navigazione, login, form o pulsanti, anche con sessione admin. Testo più grande e griglia orizzontale su TV; impaginazione mobile senza overflow. Redirect configurato con meta refresh nativo, operativo anche senza JavaScript.
- Pannello admin con URL completo della TV in campo readonly copiabile, token codificato nei parametri dell'URL e origine canonica configurata.
- Estratta la lettura eventi/iscrizioni già presente in `events.ts` in `readWeekEvents`, riutilizzata dai caricamenti autorizzati admin, calendario e display. Condiviso il calcolo delle colonne weekend in `visibleWeekDays`. Nuovo `EventCard.svelte` usato ora da due pagine: calendario e display, conservando azioni e comportamento M7.

**Commit**
- `20ade83` `feat(display): add guarded week views and automatic advancement`.
- `28ea717` `feat(display): add responsive read-only TV screen and native redirect`.

**Controlli**
- `pnpm ci:local`: exit code 0, 104 unit, 216 integration, 56 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- Cinque nuovi unit: pool non impostato, settimane vuote con singolo passo e limite a quattro, prossima settimana obbligatoriamente popolata, data specifica rispetto al pool, eventi futuri e istante esatto di fine in Europe/Rome.
- Quattordici nuove integration: richieste concorrenti serializzate senza perdita di avanzamenti, impostazioni invariate quando non avanza, lettura successiva all'avanzamento, indipendenza dalla settimana attiva/query, colonne weekend e ordinamento, conteggio degli assenti e sovracapienza, precedenza degli stati, quattro varianti di token errato senza scritture, token corretto e bypass admin, configurazione redirect e URL TV accessibile solo all'admin. Corretti due confronti iniziali dei timestamp dei test tra postgres.js e Drizzle, senza cambiare la logica applicativa.
- Otto nuovi e2e desktop/mobile con e senza JavaScript: accesso pubblico, sola lettura anche per admin, link TV copiabile, redazione assenti nell'HTML, XSS come testo, conteggi D1, stati, weekend, date, nessun overflow a 360/768/1280 px e colonne allineate su TV. Meta refresh verificato fino all'effettiva navigazione a healthz. Fixture del server Playwright esplicita: token vuoto, redirect locale di prova dopo otto secondi; nessuna modifica alle variabili dell'applicazione locale.
- Tutti i test precedenti del calendario, dei dialog e della matrice di autorizzazione ancora verdi. I test browser ripristinano impostazioni, eventi e iscrizioni preesistenti nel DB di test.
- `git diff --check`: verde. Nessuna modifica a schema, dipendenze o legacy; note precedenti preservate.

**Decisioni prese dentro il perimetro del piano**
- Nuovo dominio display e relativi test previsti dal modulo. EventCard introdotto soltanto al secondo uso effettivo, senza altre astrazioni UI. Nessuna nuova dipendenza.
- Avanzamento automatico senza attore mantenuto nel dominio del display; nessun evento SSE anticipato rispetto a M9.
- Graphify consultato per display_calendar, auto_update_display_week e is_event_passed legacy; grafo pre-spostamento interpretato con i percorsi sotto legacy, senza ricostruirlo. Applicati Ponytail e Caveman.

**Domande / blocchi**
- Nessun blocco tecnico nei controlli locali. Login 42 reale resta la verifica manuale di Ismail già prevista.

**Prossimo passo**
- Terminare ricostruzione e prova HTTPS, pubblicare M8 e verificare tutti i sei job CI, quindi aggiornare soltanto lo Stato di M8 nel piano e registrare la chiusura. Non iniziare M9.

**Verifica stack HTTPS dopo la ricostruzione**
- `docker compose up -d --build --wait`: exit code 0, app/Postgres healthy e nginx running sulle porte 8080/8443; nessun volume eliminato.
- Con CA locale esplicita e TLS attivo: health HTTPS 200, admin anonimo 303, ICS anonimo 401, redirect HTTP 8080 verso HTTPS 8443 su `/display?check=m8` con 308 e percorso/query preservati. Nessuna richiesta al caricamento del display sul DB applicativo durante questa prova, per evitare l'avanzamento automatico previsto; display e redirect già verificati sul DB di test. Nessuna scrittura sul database applicativo.

## 2026-10-21 — M8 — chiusura

**Fatto**
- Completato e pubblicato M8 sul branch `v2.0.0`; aggiornata soltanto la colonna Stato di §19 al commit funzionale `28ea717`. M9 non iniziato.
- Display operativo con token facoltativo e bypass admin, avanzamento transazionale, settimana indipendente, conteggi D1, login dei soli presenti, weekend condizionali, vista TV/mobile in sola lettura e redirect nativo. URL completo copiabile dall'admin; scheda evento e lettura dati riutilizzate nelle pagine esistenti.
- Dettagli, decisioni e copertura nella voce precedente. Nessuna modifica a schema, dipendenze o legacy; note originali preservate.

**Commit**
- `20ade83`: dominio display, letture condivise e test unit/integration.
- `28ea717`: pagina TV, scheda condivisa, link admin e test browser.
- `1617554`: controlli locali e diario.

**Controlli**
- `pnpm ci:local`: exit code 0, 104 unit, 216 integration e 56 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- CI [run 39592470352](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39592470352) verde su `1617554`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- Stack completo ricostruito e lasciato attivo su 8080/8443; app/Postgres healthy e nginx running. Health HTTPS 200, admin anonimo 303, ICS anonimo 401 e redirect HTTP 308 verificati con CA locale esplicita e TLS attivo. Nessun volume eliminato o dato applicativo modificato dalla prova HTTPS.
- Working tree pulito prima di questa registrazione finale. Token configurato verificato con dominio e caricamenti reali contro il DB di test; pagina pubblica e redirect verificati nei browser desktop/mobile, con e senza JavaScript. Nessuna prova su una TV fisica.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale ancora da verificare manualmente da Ismail.

**Prossimo passo**
- M9: real-time SSE, da avviare alla prossima richiesta.

## 2026-10-21 — Revisione M7–M8 — bloccato su dipendenze WebKit

**Fatto**
- Durante la chiusura di M8 è arrivato il commit di Ismail `61fecc2` con la nuova revisione. La CI del commit di chiusura `3e3b40b` (run 39592960782) è stata annullata dalla concorrenza del nuovo push; la run successiva 39593032328 su `61fecc2` ha tutti i sei job verdi. La precedente verifica funzionale M8 39592470352 rimane verde.
- Iniziata la revisione richiesta dopo M8 e prima di M9. Nessun punto già completamente risolto all'inizio. Modifiche salvate nel working tree, ancora da validare e non committate o pubblicate.
- R8: configurato log_format/access_log nginx con metodo, URI senza query, protocollo, stato e dimensione; omessi request completo, args e referer. Verifica con token e ricostruzione dello stack ancora da eseguire.
- R9: aggiunto 404 ICS per un utente non admin quando event.week supera activeWeek; aggiunto integration per utente respinto e admin ammesso, non ancora eseguito.
- Ponytail 15–17: introdotti `src/lib/weekdays.ts` e `src/lib/format.ts` per giorni e numeri condivisi; `formatWeekDates` in dates.ts riutilizzato nei due caricamenti. Aggiunti due unit per formato, conservazione dei campi e input immutato, non ancora eseguiti.
- Ponytail 18: datedWeekday sostituito con matchesWeekday, conservando errore Zod dedicato in create/update e lock esistente.
- Ponytail 19: registeredEventId nel risultato di successo del dominio; action senza clone/rilettura del form. Aggiornati tipo dell'adattatore e aspettativa integration.
- Ponytail 20: controllo iniziale conservato solo in nextDisplayWeek; rimosso il duplicato nella transazione, test unit esistenti invariati.
- Aggiunto progetto `webkit-shared` per eventi e calendario, serializzato dopo mobile-shared e prima dei test paralleli; workflow predisposto per installare Chromium e WebKit. Nessuna modifica al Dialog prima della prova WebKit.

**Commit**
- Nessun nuovo commit per la revisione; tutte le modifiche restano locali.

**Controlli**
- `pnpm check` della revisione: due errori in admin/+page.svelte, rimasti due `each days` da rinominare `each weekdays` dopo l'estrazione dell'array. Correzione e nuova verifica ancora da eseguire; arresto al blocco di ambiente come richiesto.
- `pnpm ci:local` della revisione non ancora eseguito. Unit/integration/browser della revisione non ancora eseguiti.
- `pnpm exec playwright install webkit`: exit code 0, WebKit 27.2 v2370 scaricato. Il comando ha gestito internamente due errori DNS su un mirror, poi completato il download. Validazione host segnala dipendenze mancanti: libevent-2.1-7t64, libgstreamer-plugins-bad1.0-0, libflite1, libavif16.
- Nessun tentativo di sudo, installazione di pacchetti di sistema o metodo alternativo dopo il blocco.
- Stack HTTPS M8 lasciato attivo su 8080/8443; l'immagine applicativa e la configurazione nginx caricata non contengono ancora la revisione. Nessun volume eliminato. M9 non iniziato.

**Decisioni prese dentro il perimetro del piano**
- Helper minimi condivisi dove richiesti dalle note; nessuna nuova dipendenza npm o modifica di schema/legacy. Graphify consultato, nessuna ricostruzione del grafo. Ponytail e Caveman applicati.

**Domande / blocchi**
- Per provare WebKit servono le dipendenze di sistema. Dalla root del repository, Ismail può eseguire: `sudo "$(command -v node)" node_modules/playwright/cli.js install-deps webkit`.
- Nessuna conclusione sul supporto WebKit a command/commandfor: browser non ancora avviato. Non modificare Dialog prima della prova e dell'eventuale segnalazione richiesta dalla nota.

**Prossimo passo**
- Dopo la conferma dell'installazione: correggere i due riferimenti days, completare check e test; verificare WebKit e registrare l'esito prima di cambiare il componente. Poi ci:local, prova R8 con token e log nginx, commit piccoli, push e CI verde, diario di chiusura. Non iniziare M9.

## 2026-10-21 — Revisione M7–M8 — ripresa e controlli locali completati

**Fatto**
- Ripresa dopo la conferma di Ismail. WebKit avviato e chiuso correttamente: dipendenze di sistema disponibili, blocco risolto. Corretti i due riferimenti residui days/weekday nella pagina admin. Conservate la nota originale e la voce di interruzione.
- Completati tutti i punti della revisione: R8, R9, Ponytail 15–20 e progetto WebKit. Nessun punto era già completamente risolto all'inizio. M9 non iniziato.
- **R8:** nginx usa un formato di accesso basato su metodo, `$uri`, protocollo, stato e dimensione; niente `$request`, query o referer. Vale anche per il redirect HTTP e per il futuro stream. Richieste di prova con token eseguite; URI presenti nei log e valore del token assente da `docker compose logs nginx`.
- **R9:** ICS delle settimane successive ad activeWeek respinti con 404 `error_event_not_found` per utenti non admin; download admin conservato. Nessuna modifica al contenuto dei file o agli altri controlli.
- **Ponytail 15:** `src/lib/weekdays.ts` esporta le sette funzioni i18n, riutilizzate da admin, calendario e display. I nomi italiani destinati all'audit del dominio iscrizioni rimangono dati di audit.
- **Ponytail 16:** helper `formatWeekDates` in dates.ts usato dai due caricamenti; date formattate una volta conservando gli altri campi e lasciando invariati gli input. Date ISO nel dominio e controlli di autorizzazione conservati.
- **Ponytail 17:** `src/lib/format.ts` con formatNumber, riutilizzato nelle tre pagine, EventCard e Toast; locale letta a ogni chiamata. Nessuna duplicazione di Intl.NumberFormat rimasta nei chiamanti indicati.
- **Ponytail 18:** matchesWeekday condiviso tra refine di creazione e modifica sotto lock; conservate chiave dedicata, risposta 400 e assenza di scritture/audit/notifiche in caso di incoerenza.
- **Ponytail 19:** id dell'evento validato restituito soltanto dopo iscrizione riuscita dal dominio; action ridotta a formAction, senza clone/rilettura. Tipi aggiornati; errori e altre operazioni non ricevono l'id di successo.
- **Ponytail 20:** unico controllo pool non impostato/settimana quattro nella funzione nextDisplayWeek; test unit originali conservati. La transazione mantiene il lock prima di leggere e aggiornare la configurazione.
- **WebKit:** aggiunto `webkit-shared` con i sei test di eventi/calendario, eseguito dopo mobile-shared e prima delle prove parallele. Workflow installa Chromium e WebKit. Apertura, annullamento e conferma dei dialog nativi funzionano anche con JavaScript disabilitato; nessuna modifica al componente Dialog.

**Commit**
- `0b3a460` `fix(display): omit query strings from nginx access logs`.
- `9ecc155` `fix(calendar): hide future-week event downloads from users`.
- `4d4708d` `refactor: share calendar formatting and verify native dialogs in webkit`.

**Controlli**
- `pnpm ci:local`: exit code 0, 106 unit, 217 integration, 62 e2e. Lint/check e build verdi, svelte-check senza errori o warning.
- Due nuovi unit su numeri/giorni nella locale attuale e formattazione condivisa delle due raccolte di date, con conservazione dei campi e degli input. Il primo tentativo assumeva il separatore delle migliaia per quattro cifre: corretto il fixture a cinque cifre, coerente con Intl/CLDR, senza cambiare il formato applicativo.
- Nuova integration R9: utente normale 404 su settimana futura e admin 200 con ICS valido. Test del dominio iscrizioni aggiornato con registeredEventId; test action già esistente verifica id soltanto su successo e assenza su errore. Test R7, concorrenza e avanzamento display ancora verdi.
- Sei nuove prove WebKit: quattro calendario e due eventi; passano flussi con e senza JavaScript, iscrizione/dialog/download/disiscrizione e conferme admin. Totale browser passato da 56 a 62.
- `docker compose up -d --build --wait`: exit code 0; app/Postgres healthy, nginx running su 8080/8443. Nessun volume eliminato.
- R8 con token di prova: GET HTTP `/display?token=...` risponde 308 preservando percorso/query; GET HTTPS `/api/stream?token=...` risponde ancora 501, previsto prima di M9. Entrambi gli URI compaiono negli access log, il valore del token non compare nei log nginx. Non eseguito il caricamento display sul DB applicativo, evitando avanzamenti automatici durante la prova.
- Con CA locale esplicita e TLS attivo: health 200, admin anonimo 303, ICS anonimo 401. Nessuna scrittura sul DB applicativo durante la prova HTTPS.
- `git diff --check`: verde. Nessuna nuova dipendenza npm, modifica di schema o legacy; piano invariato.

**Decisioni prese dentro il perimetro del piano**
- Nuovi moduli weekdays/format richiesti dalle note e relativo test unit; helper date nel modulo esistente. Nessun componente UI nuovo o cambiamento di comportamento oltre R8/R9.
- Graphify già consultato per localizzare il riferimento legacy; nessuna ricostruzione. Applicati Ponytail e Caveman.

**Domande / blocchi**
- Blocco WebKit risolto. Nessun altro blocco tecnico nei controlli locali. Login 42 reale resta la verifica manuale prevista per Ismail.

**Prossimo passo**
- Pubblicare i commit e verificare tutti i sei job CI; aggiungere la chiusura della revisione nel diario. Non iniziare M9.

## 2026-10-21 — Revisione M7–M8 — chiusura

**Fatto**
- Completati e pubblicati R8, R9, Ponytail 15–20 e la copertura WebKit richiesta. Rapporto per ciascun punto nella voce precedente; note originali e voce di interruzione preservate. Nessun punto già completamente risolto all'inizio della revisione.
- Token esclusi dagli access log nginx, ICS futuri riservati agli admin, formattazione condivisa e action iscrizione senza seconda lettura del form. Dialog originale mantenuto dopo le prove WebKit con e senza JavaScript.
- M9 non iniziato. Piano invariato, nessuna modifica a schema, dipendenze npm o legacy.

**Commit**
- `0b3a460` `fix(display): omit query strings from nginx access logs`.
- `9ecc155` `fix(calendar): hide future-week event downloads from users`.
- `4d4708d` `refactor: share calendar formatting and verify native dialogs in webkit`.
- `62f47a6` `docs: record M7-M8 review validation and webkit coverage`.

**Controlli**
- `pnpm ci:local`: exit code 0, 106 unit, 217 integration e 62 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- CI [run 39595322379](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39595322379) verde su `62f47a6`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0; installazione WebKit e relativi sei test inclusi nel job e2e.
- Stack HTTPS aggiornato e lasciato attivo su 8080/8443; app/Postgres healthy e nginx running. Health 200, admin anonimo 303, ICS anonimo 401 e redirect HTTP 308 verificati con CA locale esplicita. R8 verificato con token di prova assente dai log nginx, conservando gli URI richiesti. Nessun dato applicativo modificato o volume eliminato dalla prova.
- Working tree pulito prima di questa registrazione finale.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale ancora da verificare manualmente da Ismail. WebKit provato nel motore Playwright su Linux; nessuna prova su un dispositivo Safari fisico.

**Prossimo passo**
- M9: real-time SSE, da avviare alla prossima richiesta.

## 2026-10-21 — M9 — implementazione e controlli locali

**Fatto**
- Riletti piano e ultima chiusura della revisione M7–M8, branch `v2.0.0` e working tree inizialmente pulito. Implementato §10 e collegamenti real-time di calendario/display/admin/log; M10 non iniziato.
- Endpoint GET `/api/stream` con eventi SSE nominati, Content-Type text/event-stream, Cache-Control no-cache e X-Accel-Buffering no. Ping iniziale per rendere subito disponibile la connessione, poi heartbeat ogni 25 secondi. Su abort della richiesta o cancellazione del reader vengono rimossi iscrizione al bus, timer e listener di abort.
- Stream anonimo pubblico se DISPLAY_TOKEN è vuoto, altrimenti token corretto obbligatorio con 404 generico. Gli utenti autenticati usano la sessione per il calendario; il display passa il token della propria URL, anche vuoto. La presenza del parametro token identifica lo stream del display, che riceve soltanto eventi pubblici anche con una sessione admin. Bypass admin conservato; ruolo acquisito all'apertura come previsto dal piano.
- `log_created` inviato soltanto agli admin sugli stream delle pagine autenticate. Payload pubblici limitati a eventId/week/action o week; payload log limitato all'id. Schema Zod condiviso valida i messaggi e rimuove eventuali campi estranei prima del trasporto; nessun dato personale, dettaglio audit o token trasmesso negli eventi.
- Unico helper `src/lib/realtime.ts` con EventSource nativo, riconnessione nativa, listener per i tre eventi e cleanup esplicito. Messaggi malformati ignorati. Tipi del bus derivati dallo stesso schema e riesportati dal percorso esistente, senza cambiare i chiamanti.
- Calendario: invalidate app:calendar su event_changed/week_activated; dialog nativo automatico con messaggio i18n della settimana attivata. Display: invalidate app:display sui due eventi pubblici, senza pulsanti o reload. Admin: dipendenza app:admin e aggiornamento anche sui log per riflettere limite eventi/reset display che pubblicano soltanto log_created. Log: collegamento app:logs e caricamento minimo per la dipendenza; pagina completa, evidenziazione e banner restano in M13.
- Bus ancora in memoria per una sola istanza, come previsto; eliminata la soglia di avviso di dieci listener per consentire più connessioni SSE contemporanee. Cleanup verificato con venti stream.
- Individuata e corretta una regressione introdotta dagli aggiornamenti SSE: SvelteKit 3 conserva il risultato del form nelle props ma azzera page.form durante l'invalidazione; il Toast nel layout perdeva il messaggio dopo alcune eliminazioni. Messaggi del layout conservati fino alla navigazione successiva, con timer/dismiss del Toast invariati. Prova specifica con un secondo aggiornamento da un'altra sessione e test precedenti di eliminazione ancora verdi.

**Commit**
- `98e6357` `feat(realtime): add filtered SSE streams and native subscriptions`.
- `1fe2bc9` `feat(realtime): refresh live views and announce week activation`.

**Controlli**
- `pnpm ci:local`: exit code 0, 121 unit, 217 integration, 68 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- Quindici nuovi unit: header e framing SSE, ping iniziale e intervallo esatto 25 secondi con timer finti, pubblico/utente/admin e filtro audit, quattro token errati, token valido/sessione/bypass admin, display admin privo di log, redazione di campi estranei, abort/cancel e richiesta già abortita, venti connessioni con cleanup, URL codificata dell'EventSource, validazione client e rimozione degli handler.
- Sei nuovi e2e desktop/mobile: attivazione settimana da seconda sessione con dialog utente e aggiornamento admin/log senza reload; feedback del form conservato dopo SSE; capienza e login presenti aggiornati nel display pubblico con token inoltrato, assenza che mantiene occupato il posto, sola lettura; riconnessione nativa dopo una risposta SSE chiusa e ricezione degli eventi successivi. I test ripristinano impostazioni, eventi e iscrizioni preesistenti.
- Test precedenti, matrice dei permessi, flussi senza JavaScript e sei prove WebKit ancora verdi. Aggiornata solo la fixture dell'integration adminLoad con depends richiesto dal nuovo caricamento.
- Prima validazione interrotta da un cast della fixture da aggiornare; poi la prova admin ha evidenziato il Toast perso. Analizzati trace di rete e runtime SvelteKit installato con investigate-first prima della correzione. Corretto anche un selettore ambiguo del nuovo test (regione e input con lo stesso nome), usando il ruolo spinbutton. Cinque prove browser mirate verdi prima del controllo completo finale.
- Stack completo ricostruito con `docker compose up -d --build --wait`: exit code 0, app/Postgres healthy e nginx running su 8080/8443; nessun volume eliminato.
- HTTPS con CA locale esplicita: stream 200 con ping immediato e secondo heartbeat reale dopo 25 secondi attraverso nginx, senza buffering; Cache-Control no-cache conservato. Connessione chiusa dopo la prova. URI dello stream presente nei log nginx, token assente. Health 200, admin anonimo 303, ICS anonimo 401 e HTTP 308 con percorso/query preservati. Nessuna scrittura sul DB applicativo durante la prova.
- `git diff --check`: verde. Nessuna modifica a schema, dipendenze o legacy; note originali preservate.

**Decisioni prese dentro il perimetro del piano**
- Helper client/schema nello stesso file richiesto da §10; nuovo caricamento minimo dei log per dichiarare depends e relativi test protocollo/browser. Nessuna anticipazione della UI M13.
- Header globale private/no-store conservato per le altre risposte, esclusi soltanto i response text/event-stream per rispettare no-cache richiesto da §10. Nessuna nuova dipendenza.
- Graphify consultato per emit_event_update, emit_log_update e week_activated legacy, con i percorsi del grafo precedenti allo spostamento sotto legacy; nessuna ricostruzione. Applicati Ponytail e Caveman.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale resta la verifica manuale di Ismail già prevista. Il bus resta limitato a una singola istanza applicativa.

**Prossimo passo**
- Pubblicare M9 e verificare tutti i sei job CI, poi aggiornare soltanto lo Stato di M9 nel piano e registrare la chiusura. Non iniziare M10.

## 2026-10-21 — M9 — chiusura

**Fatto**
- Completato e pubblicato M9 sul branch `v2.0.0`; aggiornata soltanto la colonna Stato di §19 al commit funzionale `1fe2bc9`. M10 non iniziato.
- Stream SSE con token/sessione, filtro dei log admin, payload senza dati personali, heartbeat e cleanup. Unico helper EventSource con riconnessione nativa; aggiornamenti di calendario/display/admin/log senza reload e dialog di attivazione settimana.
- Feedback dei form conservato durante l'invalidazione SSE. UI completa e banner dei log restano previsti per M13. Dettagli e copertura nella voce precedente.
- Nessuna modifica a schema, dipendenze o legacy; note originali preservate.

**Commit**
- `98e6357`: stream filtrato, schema/helper condiviso e unit.
- `1fe2bc9`: collegamenti alle pagine, dialog settimana, feedback dei form e browser.
- `1925100`: controlli locali e diario.

**Controlli**
- `pnpm ci:local`: exit code 0, 121 unit, 217 integration e 68 e2e; lint/check e build verdi, svelte-check senza errori o warning.
- CI [run 39602664325](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39602664325) verde su `1925100`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker completati con successo. `gh run watch --exit-status` terminato con exit code 0.
- Stack completo ricostruito e lasciato attivo su 8080/8443; app/Postgres healthy e nginx running. Con CA locale esplicita: stream HTTPS 200 e heartbeat reale a 25 secondi attraverso nginx; token assente dai log. Health 200, admin anonimo 303, ICS anonimo 401 e HTTP 308 verificati. Nessun dato applicativo modificato o volume eliminato durante la prova.
- Working tree pulito prima di questa registrazione finale.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Bus in memoria previsto per una sola istanza applicativa. Login 42 reale ancora da verificare manualmente da Ismail.

**Prossimo passo**
- M10: template e import CSV, da avviare alla prossima richiesta.


## 2026-10-21 — Revisione M9 — controlli locali completati

**Fatto**
- Completati R10–R12 e Ponytail 21–23 prima di M10. Nessun punto era già risolto; note originali preservate.
- R10: tetto globale di 500 ascoltatori per processo, conteggio esportato dal bus e risposta 503 prima di creare lo stream; costante e commento shortcut espliciti. Nessun limite nginx per IP.
- R11: callback di ricarica dopo ogni open successivo al primo; calendario, display, admin e log passano la propria invalidate. La riconnessione recupera anche modifiche avvenute durante la disconnessione.
- R12: display aggiornato ogni 60 secondi, intervallo rimosso nel cleanup insieme alla connessione.
- Ponytail 21: admin ignora log_created. Ponytail 22: solo data JSON comprensivo di type, singolo onmessage con safeParse. Ponytail 23: cleanup client ridotto a close(). Filtri, heartbeat, token e controlli di accesso conservati.

**Commit**
- `61ca6dd` `fix(realtime): cap streams and recover stale views after reconnect`.

**Controlli**
- `pnpm ci:local`: exit code 0, 123 unit, 217 integration e 70 e2e; lint/check e build verdi, nessun errore o warning svelte-check.
- Unit: 501ª connessione respinta senza nuovi ascoltatori, riapertura dopo cleanup, primo open senza ricarica e open successivi con una ricarica ciascuno; framing aggiornato e precedenti prove di sicurezza ancora verdi.
- E2e desktop/mobile: recupero di una modifica persa durante la disconnessione; orologio finto, nessuna ricarica a 59999 ms e una a 60000 ms, nessuna richiesta display dopo la navigazione. Prima esecuzione completa fermata da due problemi dei nuovi test: handler di rete ancora attivo dopo chiusura del contesto e orologio non congelato prima del mount. Corretti solo i fixture; quattro prove mirate e nuova suite completa verdi.
- Stack ricostruito con `docker compose up -d --build --wait`, app/Postgres/nginx healthy su 8080/8443. CA locale esplicita: health 200, admin anonimo 303, ICS anonimo 401, redirect HTTP 308 con query preservata, SSE 200 con ping immediato e no-cache. URI stream presente nei log nginx, token assente. Nessuna scrittura sul DB applicativo o eliminazione di volumi.
- `git diff --check`: verde. Nessuna dipendenza, schema o modifica legacy. CI non ancora eseguita per questa revisione.

**Decisioni prese dentro il perimetro del piano**
- Un solo commit funzionale per la modifica coordinata del protocollo e dei quattro chiamanti. Graphify consultato; Ponytail e Caveman applicati, nessuna ricostruzione del grafo.

**Domande / blocchi**
- Nessun blocco tecnico. Bus ancora per singola istanza; login 42 reale resta la verifica manuale di Ismail.

**Prossimo passo**
- Push e verifica dei sei job CI; registrare la chiusura della revisione, poi iniziare M10 come richiesto.


## 2026-10-21 — Revisione M9 — chiusura

**Fatto**
- Completati e pubblicati R10–R12 e Ponytail 21–23; dettagli nella voce precedente. Nessun punto saltato, note originali preservate.

**Commit**
- `61ca6dd` correzioni real-time; `1f26007` controlli locali e diario.

**Controlli**
- `pnpm ci:local`: verde, 123 unit, 217 integration, 70 e2e.
- CI [run 39620048679](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39620048679) su `1f26007`: tutti i sei job verdi; `gh run watch --exit-status` exit code 0.
- Stack HTTPS healthy su 8080/8443, verificato con CA locale; token assente dai log nginx. Nessuna scrittura sul DB applicativo durante la prova.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Bus per singola istanza e login 42 reale manuale come già registrato.

**Prossimo passo**
- Avvio M10 autorizzato da Ismail: template e import CSV.


## 2026-10-21 — M10 — bloccato sul builder, lavoro locale conservato

**Fatto**
- Avviato M10 dopo la chiusura della revisione M9 e CI verde; nessun avvio di M11.
- Implementazione locale di domain/templates.ts: elenco con conteggio e ordinamento, creazione da payload JSON validato, applicazione con warning e sovrascrittura, eliminazione in cascata, import raggruppato per settimana. Audit nella transazione, ruolo admin ricontrollato sotto lock e pubblicazione dopo commit. Date specifiche escluse dagli eventi applicati.
- Riutilizzato deletionSnapshot di events.ts per l'audit della sovrascrittura, esportando la funzione esistente. Un template legacy vuoto lascia intatta la settimana: nel legacy il DELETE precedente al warning non era seguito da commit.
- Aggiunto domain/csv.ts: parser senza nuove dipendenze, BOM, UTF-8/latin-1, separatore, campi tra virgolette e multilinea, righe scartate e relativi numeri, limiti 1 MB/2000 righe; writer con escaping richiesto da §13.
- Collegati lista, applicazione, eliminazione, import e CSV di esempio alle route esistenti, con i18n e toast. Dopo applicazione la pagina mostra il collegamento alla settimana admin. Builder e relativa action save restano segnaposto in attesa della risposta; matrice dei permessi ancora da aggiornare per M10.
- Graphify consultato per save_template/apply_template/import_csv_templates, poi verificato il sorgente sotto legacy/. Ponytail e Caveman applicati; grafo non ricostruito.

**Commit**
- Nessun commit o push M10: modifiche e nuovi test conservati nel working tree. La chiusura M9 del diario è locale, i commit funzionali M9 e la sua validazione sono già pubblicati.

**Controlli**
- `pnpm check`: verde, zero errori e warning dopo il collegamento della lista.
- Unit CSV: 23 test verdi. Integration template su DB separato: 20 test verdi, inclusi creazione/lista, applicazione senza/con sovrascrittura, cascata e snapshot delle iscrizioni, template vuoto, eliminazione, import end-to-end, input/file errati, righe scartate, 404, accesso negato, ruolo declassato e rollback quando l'audit fallisce.
- Controlli M10 completi e browser non ancora eseguiti; nessun `pnpm ci:local` o CI M10. Nessuna conclusione sul funzionamento browser del nuovo elenco.
- Stack di test fermato e stack completo M9 riavviato senza rebuild: app/Postgres/nginx healthy su 8080/8443. L'immagine attiva contiene la revisione M9 già verificata, non M10 parziale. Nessun volume eliminato o dato applicativo modificato dai test.

**Decisioni prese dentro il perimetro del piano**
- Moduli csv/templates e relativi test richiesti dal piano; nessuna nuova dipendenza o modifica di schema/legacy. Nessun salvataggio persistente di bozze introdotto.

**Domande / blocchi**
- Chiesta conferma per conciliare il singolo payload JSON del builder (§8.9) con il funzionamento senza JavaScript (§8.15): proposta aggiunta/modifica/rimozione tramite POST al server, bozza mantenuta nel form, salvataggio finale del JSON completo. Alternativa da autorizzare: builder che richiede JavaScript. Risposta non ancora ricevuta; nessuna scelta applicata autonomamente.

**Prossimo passo**
- Ricevuta la risposta, completare builder/action save e aggiornare matrice; e2e desktop/mobile anche senza JavaScript secondo la scelta, fixture CSV prevista, controlli completi, stack HTTPS ricostruito, commit piccoli, push e sei job CI verdi, chiusura M10 e aggiornamento Stato. Non iniziare M11.

**Ultimo controllo locale**
- `pnpm lint`: exit code 0 dopo la correzione dei collegamenti con resolve, coerenti con il calendario esistente. `git diff --check`: verde.


## 2026-10-21 — M10 — implementazione e controlli locali completati

**Fatto**
- Blocco sul builder risolto dalla conferma di Ismail: nessuna bozza in database, cookie o altro storage server. Unico form con campi normali events.<indice>.<campo>, senza JSON nascosto. Pulsanti submit intent=add/remove:<indice>/save.
- Senza JavaScript, add/remove ricostruiscono i campi ricevuti e restituiscono il form senza scritture o audit. Con JavaScript, gli stessi pulsanti modificano le righe nel browser, annullando l'invio. Save ricostruisce un oggetto unico e lo valida integralmente con templateSchema Zod; su errore torna 400 con messaggio i18n e tutti i valori originali. Solo dopo validazione vengono aperte transazione e scrittura CREATE_TEMPLATE.
- Completato §8.9: lista ordinata per data con conteggio, builder con tutti i campi e default previsti, applicazione con warning senza overwrite, sovrascrittura/cascata e snapshot delle iscrizioni nell'audit, eventi applicati senza eventDate, eliminazione del template, CSV di esempio, import con raggruppamento per settimana e messaggi delle righe scartate.
- Riutilizzati formAction, Toast, Dialog, weekdays, controlli admin e deletionSnapshot esistenti. Il piccolo modulo src/lib/template-form.ts condivide campi grezzi e default tra browser e action senza importare il dominio server nel client. Il dominio riceve direttamente l'oggetto aggregato, non una stringa JSON.
- Eliminazione per gli ID dello snapshot, coerente con le eliminazioni in massa già presenti, per conservare nell'audit tutti gli eventi effettivamente cancellati. Template legacy vuoti non eliminano la settimana e non producono log.
- Matrice dei permessi aggiornata per tutte le action M10 e per il CSV di esempio implementato; input degli id template deliberatamente invalido nella prova admin, senza mutazioni. Fixture tests/fixtures/import.csv prevista da §13 aggiunta esplicitamente nonostante l'ignore globale dei CSV.

**Commit**
- `f0a9acf` `feat(templates): add validated templates and CSV import`.
- `f2d0e78` `feat(templates): add progressive builder and admin workflows`.

**Controlli**
- `pnpm ci:local`: exit code 0; 146 unit, 237 integration, 74 e2e. Lint/check/build verdi, zero errori e warning svelte-check. Ripetuti lint/check dopo il controllo finale della cancellazione per ID: entrambi verdi.
- 23 unit CSV e 20 integration template, descritti nella voce precedente; aggiornati gli input di creazione all'oggetto unico confermato da Ismail. Nessuna nuova dipendenza o migrazione.
- Quattro nuovi e2e, desktop/mobile con JavaScript acceso/spento: aggiunta di due righe, rimozione di una, zero POST add/remove con JS e tre senza JS, nessuna scrittura di template o audit, nessun cookie bozza; valori di tutti i campi conservati su errore di compenso, salvataggio finale con un evento, warning su settimana occupata, overwrite, collegamento /admin?week=4, data specifica esclusa, esempio CSV esatto, import della fixture con una riga scartata, eliminazione e sequenza esatta dei quattro audit. Dati di test ripristinati nel finally.
- Primo giro fermato da formattazione/chiavi each dei nuovi file, corretti. I nuovi e2e hanno poi evidenziato un'aspettativa troppo rigida del test sui cookie: Paraglide può aggiungere il cookie lingua e il cookie sessione può ricevere una nuova scadenza. Test corretto per ammettere soltanto sessione/lingua e verificare il token sessione invariato; nessuna modifica applicativa ai cookie. Due prove mirate verdi, poi suite completa verde.
- Stack ricostruito con docker compose up -d --build --wait: app/Postgres/nginx healthy su 8080/8443. Con CA locale esplicita: health 200, entrambe le pagine template anonime 303, CSV anonimo 401, redirect HTTP 308. Nessuna scrittura sul DB applicativo o eliminazione di volumi; flussi completi browser verificati sul DB di test.
- git diff --check verde. CI M10 ancora da eseguire; legacy e dipendenze invariati.

**Decisioni prese dentro il perimetro del piano**
- Applicate tutte le condizioni della conferma sul builder. Graphify, Ponytail e Caveman applicati; nessuna ricostruzione del grafo. Nessuna implementazione M11.

**Domande / blocchi**
- Nessun blocco tecnico. Login OAuth 42 reale resta la verifica manuale già prevista.

**Prossimo passo**
- Pubblicare M10, attendere tutti i sei job CI, poi aggiornare Stato e registrare la chiusura. Non iniziare M11 senza richiesta.


## 2026-10-21 — M10 — chiusura

**Fatto**
- Completato e pubblicato M10, con tutte le condizioni confermate da Ismail sul builder. Nessuna bozza persistita, campi normali nello stesso form, add/remove locali con JavaScript o restituiti dalla action senza scritture, validazione Zod dell'oggetto intero e conservazione dei valori su errore.
- Lista, builder, applicazione con/senza overwrite, snapshot audit, eliminazione, esempio e import CSV completi. Aggiornata soltanto la colonna Stato di M10 in §19 al commit funzionale f2d0e78. Note originali e precedenti voci conservate. M11 non iniziato.

**Commit**
- `f0a9acf` dominio e CSV con unit/integration.
- `f2d0e78` builder progressivo, UI e matrice/e2e.
- `914153e` decisioni confermate, controlli locali e diario.

**Controlli**
- `pnpm ci:local`: exit code 0, 146 unit, 237 integration, 74 e2e; lint/check e build verdi, nessun errore o warning svelte-check. Dettaglio e correzioni dei fixture nella voce precedente.
- CI [run 39623616561](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39623616561) su `914153e`: tutti i sei job lint, unit, integration, e2e, legacy-import e docker verdi; `gh run watch --exit-status` exit code 0.
- Stack M10 ricostruito e lasciato healthy su 8080/8443. HTTPS con CA locale: health 200, pagine template anonime 303 e CSV anonimo 401; redirect HTTP 308. Flussi completi verificati sul DB di test, nessuna scrittura sul DB applicativo durante lo smoke HTTPS e nessun volume eliminato.
- Working tree pulito prima di questa registrazione finale. Nessuna nuova dipendenza, migrazione o modifica legacy.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione oltre alla conferma sul builder. Graphify, Ponytail e Caveman applicati.

**Domande / blocchi**
- Nessun blocco tecnico. Login 42 reale resta da verificare manualmente da Ismail; nessuna nuova verifica manuale bloccante.

**Prossimo passo**
- M11: riepilogo partecipanti ed export, da avviare alla prossima richiesta.


## 2026-10-22 — Revisione M10 — bloccato: Docker non disponibile in WSL

**Fatto**
- Riletti piano, note di revisione M10 e ultima chiusura. Ismail ha autorizzato la revisione e poi M11; ordine mantenuto. Stato iniziale pulito sul branch v2.0.0, ultimo commit d5f0902 con le note.
- Modifiche locali non ancora validate: R13 lock della riga settings dopo lockAdmin in applyTemplate; R14 massimo 200 eventi e descrizione di 500 caratteri nello schema, vincolo DB e migrazione Drizzle generata; Ponytail 24 editable/timeOrder esportati e riusati dal template; Ponytail 25 salvataggio delegato a formAction con input già letto e values restituiti; Ponytail 26 limite byte conservato nel solo parser CSV.
- Controllati i percorsi dei lock: nessun percorso blocca settings dopo aver bloccato eventi. Individuato nel salvataggio impostazioni un lock implicito sull'utente dovuto alla FK dell'audit, successivo a settings. Aggiunto lockAdmin prima di settings anche a saveSettings per mantenere l'ordine utente → settings e prevenire l'inversione introdotta dalla serializzazione R13. Modifica locale ancora da verificare con test.
- Graphify consultato per localizzare i report legacy, senza modificare codice M11 o ricostruire il grafo. Ponytail e Caveman applicati.

**Commit**
- Nessun nuovo commit o push; modifiche conservate nel working tree. M11 non iniziato.

**Controlli**
- db:generate completato: generata drizzle/0001_clean_kitty_pryde.sql con il vincolo della descrizione template e relativi metadati. Migrazione non applicata.
- Preflight previsto sul DB applicativo, solo in lettura, per verificare descrizioni già oltre 500 caratteri: non eseguito perché Docker non disponibile.
- Errore del comando docker compose exec: “The command 'docker' could not be found in this WSL 2 distro.” Il messaggio richiede WSL integration in Docker Desktop.
- Stop al primo blocco di ambiente, senza installare Docker, cambiare metodo o toccare configurazioni di sistema. Nessuna scrittura sul DB applicativo o eliminazione di volumi.
- Lint/check, nuovi test R13/R14, migrazione sul test DB e ci:local ancora da eseguire. Nessuna conclusione sulla correttezza delle modifiche locali.

**Decisioni prese dentro il perimetro del piano**
- formAction accetta un input già ricostruito per evitare una seconda lettura del body e riusare la mappatura degli errori. L'action mantiene add/remove e aggiunge values alla risposta del salvataggio.

**Domande / blocchi**
- Avviare Docker Desktop e abilitare l'integrazione WSL per questa distro. Verificare dalla stessa shell con docker version; poi confermare per riprendere. Non serve installare un Docker alternativo nella distro.

**Prossimo passo**
- Docker disponibile: completare revisione e test (concorrenza fra due admin/template e limiti con risposta 400 senza scritture), verificare migrazione e lock, lint/check/ci:local, stack HTTPS, commit piccoli, push e CI verde, chiusura revisione. Solo dopo iniziare M11, inclusa protezione CSV injection già richiesta dalle note. Non iniziare M12.

## 2026-10-22 — Revisione M10 — bloccato: database dello stack fermo

**Fatto**
- Ripresa dopo la conferma di avvio Docker. docker version ora risponde con client e server Docker Desktop; precedente blocco WSL risolto.
- Nessuna ulteriore modifica al codice o migrazione dalla precedente interruzione. Revisione conservata nel working tree, nessun commit/push; M11 non iniziato.

**Controlli**
- docker compose ps: app restarting, nessun db attivo.
- Preflight delle descrizioni template non eseguito: docker compose exec db fallisce con service db is not running. Stop al primo fallimento di ambiente come richiesto da PLAN §1.2.
- Nessuna migrazione applicata, nessuna scrittura applicativa, test ancora da eseguire.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione. Nessun tentativo alternativo o eliminazione di volumi.

**Domande / blocchi**
- Avviare lo stack esistente dalla root con docker compose up -d --wait (senza --build), quindi confermare l'esito. Se fallisce, fornire l'output per diagnosticare il blocco prima di modificare l'ambiente.

**Prossimo passo**
- Stack disponibile: preflight descrizioni oltre 500 caratteri, completamento revisione R13/R14 e Ponytail 24–26, nuovi test, controlli e CI verde; poi M11 come già autorizzato.

## 2026-10-22 — Stack Docker — diagnosi dopo avvio manuale

**Fatto**
- Controllo richiesto da Ismail dopo il fallimento di docker compose up --wait. Applicata investigate-first, solo letture e nessuna modifica di configurazione o riavvio di container.
- Il primo comando eseguito dopo cd nella home non trovava il file Compose. Il successivo comando dalla repo ha avviato Postgres; l'app ha inizialmente continuato a fallire la connessione e poi ha completato l'avvio.

**Controlli**
- Postgres running/healthy. App ora running/healthy, FailingStreak 0. GET interno /healthz risponde 200 con status ok.
- Log app: precedenti CONNECT_TIMEOUT db:5432 durante init/migrazioni, seguiti da Listening on http://0.0.0.0:3000. Il problema di connessione osservato non è più presente al momento della prova.
- nginx exited, codice 1. Ultimo avvio fallito con host not found in upstream app:3000 in nginx.conf:21. Il proxy non si è ripreso dopo l'avvio riuscito dell'app.
- Nessuna prova HTTPS esterna in questa diagnosi: nginx è fermo. Nessun test o migrazione della revisione M10 eseguiti; M11 non iniziato.

**Decisioni prese dentro il perimetro del piano**
- Causa del fallimento nginx identificata dai log; nessuna correzione del codice applicativo indicata dalle prove raccolte. Nessuna modifica automatica del Compose durante la richiesta di controllo.

**Domande / blocchi**
- Ora che l'app è healthy, riavviare il proxy con docker compose up -d --wait nginx dalla root della repo. Poi verificare HTTPS e riprendere la revisione autorizzata. Un eventuale cambiamento alla sequenza di avvio Compose resta da concordare, fuori dalla revisione template.

**Prossimo passo**
- Ripristino nginx e verifica stack, poi revisione M10 e successivamente M11 come già autorizzato.


## 2026-10-22 — Revisione M10 — controlli locali e ricostruzione completa riusciti

**Fatto**
- Ismail ha precisato che avvio, arresto, riavvio e ricostruzione ordinari dei container vanno gestiti autonomamente. Ha richiesto di fermare lo stack, ricostruirlo interamente e rieseguire i test. Gestiti questi comandi senza nuove conferme, conservando i volumi.
- Completati R13, R14 e Ponytail 24–26. Nessun punto era già risolto. Protezione CSV injection lasciata a M11 come indicato nelle note; M11 non ancora iniziato.
- R13: applyTemplate blocca utente, settings id 1, template ed eventi. Due admin con due template diversi sulla settimana vuota sono serializzati. Verificati tutti i percorsi: nessun lock settings dopo eventi. Allineato anche saveSettings al lock utente prima di settings, evitando il successivo lock implicito sull'utente dovuto alla FK audit e una possibile inversione.
- R14: templateSchema limita gli eventi a 200 e la descrizione a 500 caratteri; vincolo DB con migrazione Drizzle 0001_clean_kitty_pryde. Preflight applicativo: zero descrizioni esistenti oltre 500 caratteri, nessuna correzione/troncamento di dati necessaria.
- Ponytail 24: editable/timeOrder esportati dal dominio eventi e riutilizzati per i template, conservando default 2/0 e data facoltativa. Ponytail 25: action save delegata a formAction con input già aggregato, values conservati nel fail e svuotati solo su successo. Add/remove senza scritture invariati. Ponytail 26: unico limite byte in parseTemplateCsv, refine file limitato a estensione e non vuoto.

**Commit**
- `76f74b4` fix(templates): serialize applications and bound builder input.
- `5a48909` refactor(templates): reuse event validation and form error handling.

**Controlli**
- pnpm ci:local: exit code 0, 146 unit, 242 integration, 74 e2e. Lint/check/build verdi, svelte-check senza errori o warning. Test precedenti del builder, anche senza JavaScript, ancora verdi.
- Cinque nuovi integration: applicazioni concorrenti di due admin/template, un solo successo e un warning template_existing con un solo evento/audit pubblico; aggiornamento impostazioni contemporaneo all'applicazione; 201 eventi e descrizione di 501 caratteri tramite action → 400, nessuna scrittura e valori restituiti; accettazione di 200/500 e rifiuto DB della descrizione eccessiva.
- Stack completo arrestato con compose down, test eseguiti sullo stack dev poi arrestato. docker compose build --no-cache: exit code 0. Download iniziale Corepack lento; prove isolate di registry, archivio pnpm e versione Corepack riuscite. Nessuna modifica di rete, mirror o TLS necessaria.
- docker compose up -d --wait dopo ricostruzione: exit code 0. Avvio a freddo riuscito senza riavvii manuali del proxy; app/Postgres healthy, nginx running. Vincolo templates_description_length presente e convalidated=true sul DB applicativo.
- HTTPS con CA locale esplicita: health 200, pagine template anonime 303, CSV anonimo 401; HTTP 8080 → HTTPS 8443 con 308. SSE 200 con ping immediato e heartbeat reale dopo 25 secondi attraverso nginx, cache no-cache e token assente dagli access log. Nessuna scrittura applicativa dai controlli HTTP; applicata soltanto la migrazione richiesta, senza modificare righe applicative.
- Nessun volume eliminato, legacy o dipendenza modificati. git diff --check verde. Nessuna modifica Compose necessaria per questa ricostruzione; gli errori precedenti erano relativi all'avvio parziale dello stack. Questa prova non simula il riavvio di Docker Desktop.

**Decisioni prese dentro il perimetro del piano**
- Riutilizzati helper/schema esistenti. Graphify, Ponytail, Caveman e investigate-first applicati; nessuna ricostruzione del grafo.

**Domande / blocchi**
- Blocchi Docker precedenti risolti. Nessun altro blocco tecnico; OAuth 42 reale resta una verifica manuale già prevista.

**Prossimo passo**
- Pubblicare revisione e verificare tutti i sei job CI, registrare la chiusura; poi avviare M11 come autorizzato. Non avviare M12.


## 2026-10-22 — Revisione M10 — chiusura

**Fatto**
- Completati e pubblicati R13/R14 e Ponytail 24–26, nessun punto saltato. Dettagli nella voce precedente. Blocchi Docker risolti e ricostruzione senza cache richiesta da Ismail completata.

**Commit**
- 76f74b4: serializzazione applicazioni, limiti/migrazione e test.
- 5a48909: validazioni/adattatore condivisi.
- eb4295f: controlli locali, avvio a freddo e diario.

**Controlli**
- pnpm ci:local verde: 146 unit, 242 integration, 74 e2e. Migrazione applicata, build Docker senza cache e avvio a freddo verdi; HTTPS e heartbeat SSE reale verificati. Nessun volume eliminato.
- CI [run 39742741469](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39742741469) su eb4295f: tutti i sei job verdi; gh run watch --exit-status exit code 0.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. OAuth 42 reale resta la verifica manuale prevista.

**Prossimo passo**
- Avvio M11 già autorizzato: riepilogo partecipanti ed export CSV, inclusa protezione formule. Non avviare M12.


## 2026-10-22 — M11 — implementazione e controlli locali completati

**Fatto**
- Avviato M11 soltanto dopo chiusura della revisione M10 e sei job CI verdi. Implementato §8.13; M12 non iniziato.
- Riepilogo amministrativo dei login distinti nelle iscrizioni, inclusi quelli senza account e con sole assenze. Totali di eventi, ore e Altarian solo per le presenze. Dettagli di tutti gli eventi per settimana/giorno/inizio, con date specifiche o derivate dal pool, durata, compenso, iscrizione e stato.
- Riutilizzato participantTotals anche per il nuovo caricamento, conservando il contratto usato da verify-legacy-import e i totali calcolati da minuti interi prima dell'arrotondamento. Caricamento con due query, senza query per ciascun partecipante.
- Pagina admin con tabella, ricerca login lato client, details nativi per settimana e tre download. Dettagli e download funzionano anche senza JavaScript. Tabella in regione scorrevole con focus per tastiera; ignorata soltanto la segnalazione Svelte sul tabindex non interattivo, con motivazione accessibile puntuale nel markup.
- Implementati summary.csv, detailed.csv e [login].csv con intestazioni/nomi file italiani richiesti, testi amministrativi indipendenti dalla locale UI, numeri senza zeri superflui, ordine settimana/giorno/inizio, quoting RFC 4180 e CRLF. Dettagli includono gli assenti; nel CSV individuale compenso zero per assenze. Giorni amministrativi in italiano, date evento DD/MM/YYYY e data iscrizione YYYY-MM-DD HH:mm:ss in Europe/Rome.
- Login del CSV individuale validato con loginPattern prima di comporre il nome file; 400 per input non valido. Per un login valido senza iscrizioni viene restituita la sola intestazione, coerentemente con il legacy. Nessun report scrive dati o audit.
- Applicata la nota CSV injection: writeCsv prefissa apostrofo alle celle che iniziano con =, +, - o @ prima del quoting. Il parametro di fine riga serve ai due consumatori effettivi: esempio M10 con LF conservato, export M11 con CRLF. Nessuna dipendenza aggiunta.

**Commit**
- 54f3571: chiusura revisione M10 e avvio M11.
- 840cd9a: protezione formule e fine riga CSV.
- a225022: dominio, endpoint e unit/integration dei report.
- 6258899: pagina, traduzioni e flussi browser.

**Controlli**
- pnpm ci:local exit code 0: 156 unit, 252 integration, 78 e2e. Lint/check/build verdi, zero errori e warning svelte-check. Quattro nuovi e2e su desktop/mobile con JavaScript acceso/spento.
- Dieci nuovi unit: quattro prefissi formula e quoting con CRLF, durate e somma di tre eventi da venti minuti senza arrotondamento intermedio, assenze, stringhe CSV esatte per i tre formati, virgole/virgolette, data null, stato/compenso assenza, timezone iscrizione e intestazioni per insiemi vuoti.
- Dieci nuovi integration: raggruppamento e ordine, sole assenze e login senza account, date specifiche e pool, pool assente, filtro login, login valido sconosciuto, protezione ruolo, cinque login non validi, tre endpoint e nomi file, CRLF e nessun audit.
- E2e: totali corretti, dettagli per settimane 1/2/4 con domenica e assenze, ricerca case-insensitive e nessun risultato, tre download tramite browser con nome/contenuto/fine riga verificati, formula neutralizzata e titolo XSS reso come testo senza esecuzione, login non valido 400, iscrizioni e audit invariati, nessun overflow della pagina a 360 px. Dati dei fixture rimossi nel finally.
- Prima validazione fermata da due cast dei fixture RequestEvent (aggiunto unknown esplicito) e dalla segnalazione sul focus della regione scorrevole. Corretti prima della suite finale; nessun errore funzionale nei nuovi test browser.
- Stack dev arrestato e stack completo M11 ricostruito con docker compose up -d --build --wait, exit code 0; app/Postgres healthy e nginx running su 8080/8443. Con CA locale: health 200, pagina report anonima 303, tre CSV anonimi 401, redirect HTTP 308. Nessuna scrittura applicativa dal controllo HTTPS e nessun volume eliminato. La ricostruzione senza cache e l'avvio a freddo richiesti da Ismail sono già documentati nella revisione precedente; immagine aggiornata nuovamente con M11.
- git diff --check verde. Nessuna modifica legacy o nuova migrazione M11. Matrice dei permessi aggiornata per i tre endpoint implementati; import legacy verificato dalla CI nella revisione, sarà rieseguito dalla CI M11.

**Decisioni prese dentro il perimetro del piano**
- Nuovi file limitati al caricamento della pagina e ai tre gruppi di test richiesti. Riutilizzati writer, totali, formatter, weekdays e guard esistenti. Graphify consultato per i quattro handler legacy, verificati in app.py e nel template; Ponytail e Caveman applicati, grafo non ricostruito.

**Domande / blocchi**
- Nessun blocco tecnico. Login OAuth 42 reale resta la verifica manuale prevista; nessuna prova di apertura in Excel fisico, verificati i byte dei CSV e la neutralizzazione richiesta.

**Prossimo passo**
- Push M11, tutti i sei job CI verdi, aggiornamento dello Stato e chiusura nel diario. Non iniziare M12 senza richiesta.


## 2026-10-22 — M11 — chiusura

**Fatto**
- Completato e pubblicato M11 dopo revisione M10 e CI verde. Riepilogo partecipanti con totali delle presenze, dettagli settimanali comprensivi delle assenze, ricerca client e tre CSV amministrativi protetti dalla formula injection. Aggiornata soltanto la colonna Stato di M11 in §19 al commit 6258899.
- Richiesta aggiuntiva di Ismail gestita autonomamente: arresto stack, test completi, ricostruzione senza cache, avvio a freddo e successiva ricostruzione con M11. Volumi conservati; nessuna modifica alla configurazione Compose.
- Note originali e precedenti voci preservate. M12 non iniziato.

**Commit**
- 840cd9a: sicurezza/fine riga CSV.
- a225022: totali, caricamento ed export, unit/integration.
- 6258899: pagina e flussi browser.
- 82ea0de: controlli locali e diario.

**Controlli**
- pnpm ci:local exit code 0: 156 unit, 252 integration, 78 e2e, totale 486 test. Lint/check/build verdi, zero errori e warning svelte-check; import e totali legacy conservati.
- CI [run 39744443696](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39744443696) su 82ea0de: tutti i sei job lint, unit, integration, e2e, legacy-import e docker verdi; gh run watch --exit-status exit code 0.
- Stack M11 ricostruito e lasciato attivo su 8080/8443. App/Postgres healthy, nginx running. App e nginx con RestartCount 0 al controllo successivo. HTTPS con CA locale: health 200, pagina anonima 303, tre CSV anonimi 401; redirect HTTP 308. Dati applicativi non modificati dalle prove HTTP; nessun volume eliminato.
- Ricostruzione senza cache, migrazione R14 validata e heartbeat SSE a 25 secondi già documentati nella chiusura della revisione. Working tree pulito prima della registrazione finale. Nessuna nuova dipendenza, migrazione M11 o modifica legacy.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione. Graphify, Ponytail e Caveman applicati.

**Domande / blocchi**
- Nessun blocco tecnico. Non simulato un riavvio di Docker Desktop; provato l'avvio a freddo dello stack. OAuth 42 reale e apertura dei CSV in Excel restano verifiche manuali, senza bloccare la consegna del modulo.

**Prossimo passo**
- M12: profilo utente, da avviare alla prossima richiesta.


## 2026-10-22 — M12 — implementazione e controlli locali completati

**Fatto**
- Implementato il profilo personale di §8.11: immagine, nome con fallback al login, login e wallet 42 salvato; conteggio di tutte le iscrizioni, ore delle sole presenze arrotondate a un decimale e somma dei compensi guadagnati.
- Tabelle per le sole settimane con iscrizioni, ordinate per settimana/giorno/inizio, con giorno, data specifica o derivata dal pool, orario, compenso e stato; righe assenti attenuate. Nessuna sezione notifiche. Testi i18n, token e formatter esistenti, tabelle scorrevoli accessibili da tastiera.
- Riutilizzato il caricamento dei report in reports.ts con filtro imposto dal login autenticato; getParticipants conserva la guard admin e la precisione di due decimali. Il profilo non accetta un utente bersaglio, non scrive dati e non produce audit.
- Correzione del menu mobile autorizzata esplicitamente da Ismail: adottato popover/popovertarget nativo al posto della proposta jsReady. Rimossi menuOpen, onclick dei link e attributi ARIA manuali; onNavigate chiude il popover insieme alla pulizia dei messaggi. Navigazione desktop sempre visibile, menu mobile sovrapposto senza spostare l'header; funziona anche senza JavaScript. Nessuna modifica CSP o dipendenza.

**Commit**
- 8a994c9: profilo, caricamento e unit/integration/e2e.
- 77633f7: menu nativo e copertura Chromium/WebKit.
- 2e6d514: verifica della visibilità del menu nel precedente test di autenticazione.

**Controlli**
- pnpm ci:local exit code 0: 157 unit, 259 integration, 88 e2e, totale 504. Lint/check/build verdi, zero errori e warning svelte-check.
- Nuovi test del profilo: utenti normali e admin vedono solo i propri dati; tutti gli iscritti nel conteggio, assenti esclusi da ore/guadagni, somma dei minuti prima dell'arrotondamento, precisione admin conservata, settimane 1/2/4 e weekend, date specifiche/pool/null, sole assenze e profilo vuoto, campi opzionali null, parametri login/userId ignorati, protezione anonimi e assenza di audit.
- Quattro e2e del profilo su desktop/mobile con JavaScript acceso/spento: identità e wallet, totali, ordinamento e date, XSS reso come testo, isolamento dei dati, nessuna modifica a iscrizioni/audit, stato vuoto e fallback, nessun overflow a 360 px. Accesso dal collegamento del menu anche senza JavaScript.
- Sei nuovi e2e di navigazione su Chromium desktop/mobile e WebKit, con JavaScript acceso/spento: desktop sempre visibile, apertura mobile, header fermo, Esc e ritorno del focus, clic esterno, chiusura dopo navigazione in entrambe le direzioni e nessun errore JavaScript.
- Corrette due aspettative dei test durante la verifica: classi Svelte aggiuntive alle righe assenti e snapshot ARIA Playwright, che legge aria-expanded esplicito e non quello implicito del browser. Il test esistente ora verifica la visibilità della navigazione identificata da main-navigation. Nessun attributo manuale reintrodotto. Dopo le correzioni rieseguito l'intero controllo locale, verde.
- Immagine ricostruita con docker compose build app; stack dev arrestato e stack completo avviato con docker compose up -d --wait. App/Postgres healthy e nginx running su 8080/8443. HTTPS con CA locale: health 200, profilo anonimo 303; __data.json anonimo restituisce soltanto l'involucro redirect SvelteKit (HTTP 200, status interno 303, destinazione /), senza dati personali. HTTP 8080 reindirizza alla stessa pagina HTTPS 8443 con 308. Nessuna scrittura applicativa dai controlli HTTP e nessun volume eliminato.
- git diff --check verde. Nessuna modifica a legacy, schema o dipendenze. CI non ancora eseguita: nessun push M12 al momento di questa voce.

**Decisioni prese dentro il perimetro del piano**
- Riutilizzati caricamento, totali, guard, formatter e traduzioni condivise. Graphify consultato e riferimenti legacy verificati nei sorgenti; Ponytail e Caveman applicati. Grafo non ricostruito.
- Eccezione di perimetro approvata da Ismail: correzione del menu tramite popover nativo, con i test richiesti e inclusione della navigazione nel progetto WebKit esistente.

**Domande / blocchi**
- Nessun blocco tecnico. OAuth 42 reale resta la verifica manuale prevista; WebKit automatizzato non sostituisce una prova su dispositivi Safari fisici.

**Prossimo passo**
- Push M12, verifica di tutti i sei job CI, aggiornamento dello Stato e chiusura nel diario. Non iniziare M13 senza richiesta.


## 2026-10-22 — M12 — chiusura

**Fatto**
- Completato e pubblicato M12: profilo personale, statistiche e iscrizioni settimanali in sola lettura, con precisione e regole di §8.11. Dati di altri utenti esclusi dal caricamento anche per gli admin e in presenza di parametri di query contraffatti.
- Completata anche la correzione del menu mobile autorizzata da Ismail: popover nativo funzionante con JavaScript acceso/spento, chiusura con Esc/clic esterno/navigazione, desktop sempre visibile. Eliminati stato manuale di apertura, onclick dei link e attributi ARIA manuali; nessun jsReady.
- Aggiornata soltanto la colonna Stato di M12 al commit 2e6d514. Note originali e precedenti voci preservate integralmente; M13 non iniziato.

**Commit**
- 8a994c9: profilo e test.
- 77633f7: menu popover e test Chromium/WebKit.
- 2e6d514: aspettative del test di autenticazione adattate al menu nativo.
- 8870099: controlli locali e diario.

**Controlli**
- pnpm ci:local exit code 0: 157 unit, 259 integration, 88 e2e, totale 504; lint/check/build verdi e zero errori/warning svelte-check. Dieci nuovi e2e: quattro profilo e sei navigazione, con JavaScript acceso/spento.
- CI [run 39751225885](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39751225885) su 8870099: tutti i sei job lint, unit, integration, e2e, legacy-import e docker verdi; gh run watch --exit-status exit code 0.
- Immagine M12 ricostruita e stack completo lasciato attivo su 8080/8443, app/Postgres healthy. HTTPS con CA locale e redirect HTTP verificati; profilo e risposta dati anonimi non espongono dati personali. Nessuna scrittura applicativa dai controlli HTTP, nessun volume eliminato, nessuna modifica a legacy/schema/dipendenze.
- Verificato che SESSIONS.md conserva come prefisso l'intero documento precedente a M12; git diff --check verde.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione. Correzione popover autorizzata esplicitamente da Ismail; Graphify, Ponytail e Caveman applicati.

**Domande / blocchi**
- Nessun blocco tecnico. OAuth 42 reale e dispositivi Safari fisici restano verifiche manuali; Chromium e WebKit automatizzati verificati.

**Prossimo passo**
- M13: pagina dei log di audit, da avviare alla prossima richiesta. Non iniziato in questa sessione.


## 2026-10-22 — M13 — implementazione e controlli locali completati

**Fatto**
- Implementato §8.10 per la consultazione dei log. Il nuovo dominio di lettura logs.ts riutilizza schema, guard e writer CSV esistenti; audit.ts e le scritture transazionali già implementate restano invariati. Nessuna nuova dipendenza o migrazione.
- Filtri GET per data ISO nel giorno Europe/Rome, actor_login esatto e tipo azione esatto. Select con valori distinti globali, inclusi attori storici senza account. Validazione Zod, 50 righe per pagina, ordinamento created_at/id decrescente e indicazione pagina corrente/totale. Le pagine positive oltre l'ultima sono ricondotte all'ultima disponibile; input malformati danno 400.
- Pagina con data/ora localizzate in Europe/Rome, utente, azione con colore per categoria, descrizione, IP e dialog nativo per ogni riga con tutti i campi, old_value/new_value formattati come JSON. Tutti i valori sono testo, senza markup HTML interpretato. I filtri, la paginazione, i dialog e il download funzionano senza JavaScript. Tabella scorrevole da tastiera, nessun overflow della pagina a 360 px, stringhe i18n e colori/spaziature da token.
- /admin/logs.csv restituisce action_logs.csv UTF-8 con intestazioni italiane, tutte le colonne e tutte le righe degli stessi filtri, anche quando la pagina visualizzata contiene soltanto 50 righe. Timestamp CSV in Europe/Rome, JSON serializzato, CRLF, quoting e protezione formule del writer condiviso. Pagina e CSV non scrivono dati o audit; accesso riservato agli admin anche nelle funzioni del dominio.
- Su log_created, la prima pagina senza filtri ricarica i dati ed evidenzia soltanto gli ID ricevuti via SSE. Le viste filtrate o paginate mostrano il banner Nuovi log disponibili e ricaricano soltanto al clic. Riconnessione gestita con la stessa politica tramite listenRealtime; stato pulito alla navigazione e stream chiuso nel cleanup esistente. Nessun nuovo endpoint di lettura per singolo log, né dati personali aggiunti al payload SSE.
- Matrice dei permessi aggiornata per il CSV implementato; aggiunti i log al progetto WebKit già esistente.

**Commit**
- c400314: caricamento, filtri, paginazione, CSV, unit/integration e matrice permessi.
- 398ab5b: pagina, dettagli, colori, aggiornamenti live e flussi browser.
- 5b835d1: fixture bigserial e aspettative degli ID localizzati tra motori browser.

**Controlli**
- pnpm ci:local exit code 0: 172 unit, 276 integration, 97 e2e, totale 545. Lint/check/build verdi e svelte-check con zero errori e warning.
- Quindici nuovi unit sulle categorie e sulla precedenza legacy, inclusi unregister rispetto a register e update/set rispetto a setting. Diciassette nuovi integration: 50 righe, ordinamento stabile, pagine successive/fuori intervallo, select globali, filtri esatti e combinati, SQL injection neutralizzata, confini inclusivi/esclusivi dei giorni di 23/25 ore al cambio ora, insieme vuoto, nove input malformati, guard 401/403, CSV oltre pagina 1 con tutti i campi/JSON/quoting/formule/CRLF, loader e header del download.
- Nove nuovi e2e su Chromium desktop/mobile e WebKit: filtri, paginazione con conservazione dei parametri e reset alla prima pagina, insieme vuoto, dialog con tutti i campi e JSON, download reale e filename, export filtrato completo e formula neutralizzata, XSS statico e live in descrizione/user agent/JSON senza elementi img né alert, nessuna scrittura audit da consultazione e nessun overflow a 360 px. I flussi di consultazione sono provati con JavaScript acceso/spento.
- Live: nuova riga in cima evidenziata senza ricaricare il documento; nessuna evidenziazione falsa per un ID maggiore con data precedente; pagina 2 e filtro attivo conservano la vista fino al clic sul banner, poi effettuano una sola invalidazione mantenendo l'URL.
- Durante la verifica sono state corrette le label delle select, che comprendevano le opzioni, e l'evidenziazione basata sul primo ID visibile, sostituita con gli ID SSE effettivi. Il primo avvio mirato di due progetti condivisi senza dipendenze è stato interrotto e rieseguito in sequenza; la suite completa conserva le dipendenze già previste. Corretti anche i fixture bigserial e il test che imponeva la formattazione numerica di Node a WebKit: prova isolata conferma 1294 in Node e 1.294 in WebKit per locale it. Il test verifica ora riga, nome accessibile e valore dell'ID. La suite completa finale è stata rieseguita dopo queste correzioni ed è verde.
- Immagine M13 ricostruita con docker compose build app, stack dev arrestato e stack completo avviato con docker compose up -d --wait: app/Postgres healthy, nginx running su 8080/8443. HTTPS con CA locale: health 200, log anonimi 303, CSV anonimo 401; risposta dati anonima contiene soltanto il redirect SvelteKit a /. HTTP 8080 → stessa pagina HTTPS 8443 con 308. Nessuna scrittura applicativa dai controlli HTTP, nessun volume eliminato.
- git diff --check verde. Note precedenti conservate; nessuna modifica legacy/schema/dipendenze. CI non ancora eseguita: nessun push M13 al momento di questa voce.

**Decisioni prese dentro il perimetro del piano**
- Lettura separata dal writer audit per riutilizzare il writer CSV senza introdurre un ciclo fra audit, CSV ed eventi. Filtri parametrizzati con intervallo fra due mezzanotti locali, conservando l'indice created_at e rispettando il cambio ora.
- Categorie con la stessa precedenza del template legacy: anche UPDATE_SETTING ricade in update, dato che set precede setting. Palette provvisoria tramite token con contrasto leggibile; nessuna modifica al design di M14.
- Graphify consultato per view_logs/download_logs_csv e admin_logs.html, con verifica nei sorgenti legacy. Ponytail e Caveman applicati; grafo non ricostruito.

**Domande / blocchi**
- Nessun blocco tecnico. OAuth 42 reale e Safari su dispositivi fisici restano verifiche manuali; WebKit automatizzato verificato.

**Prossimo passo**
- Push M13 e verifica di tutti i sei job CI, poi aggiornamento Stato e chiusura. Non iniziare M14 senza richiesta e senza i materiali design previsti dal piano.


## 2026-10-22 — M13 — chiusura

**Fatto**
- Completato e pubblicato M13: consultazione admin dei log, filtri per giorno Europe/Rome/utente/azione, paginazione da 50 righe, dettagli completi in dialog e CSV filtrato con tutte le righe e colonne.
- Prima pagina senza filtri aggiornata via SSE con evidenziazione degli ID ricevuti; nelle viste filtrate o paginate banner di aggiornamento manuale. Valori resi sempre come testo, inclusi user agent e JSON; filtri, dettagli, paginazione e download funzionano anche senza JavaScript.
- Aggiornata soltanto la colonna Stato di M13 al commit 5b835d1. Tutte le note originali e le voci precedenti conservate; M14 non iniziato.

**Commit**
- c400314: dominio di lettura, CSV, unit/integration e matrice permessi.
- 398ab5b: pagina, filtri, dialog, live, token e test browser.
- 5b835d1: fixture bigserial e verifica degli ID indipendente dai separatori Intl dei motori browser.
- 12b5b15: controlli locali e diario.

**Controlli**
- pnpm ci:local exit code 0: 172 unit, 276 integration, 97 e2e, totale 545; lint/check/build verdi, zero errori e warning svelte-check. Nuovi test: 15 unit, 17 integration e 9 e2e, inclusi Chromium desktop/mobile e WebKit, JavaScript acceso/spento, cambio ora Europe/Rome, export completo e XSS statico/live.
- CI [run 39760214986](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39760214986) su 12b5b15: tutti i sei job lint, unit, integration, e2e, legacy-import e docker verdi; gh run watch --exit-status exit code 0.
- Immagine ricostruita e stack completo attivo su 8080/8443: app/Postgres healthy, nginx running. HTTPS con CA locale verificato: health 200, log anonimi 303, CSV anonimo 401 e risposta dati senza informazioni personali; redirect HTTP 308 alla stessa pagina HTTPS. Nessuna scrittura applicativa dai controlli HTTP e nessun volume eliminato.
- git diff --check verde. SESSIONS conserva integralmente il contenuto precedente a M13; nessuna modifica legacy/schema/dipendenze o al writer transazionale audit.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione rispetto alla voce precedente. Graphify, Ponytail e Caveman applicati.

**Domande / blocchi**
- Nessun blocco tecnico. OAuth 42 reale e Safari su dispositivi fisici restano verifiche manuali; WebKit automatizzato verificato.

**Prossimo passo**
- M14, integrazione del design, soltanto dopo richiesta di Ismail e disponibilità dei materiali previsti in docs/v2/design/. Non iniziato in questa sessione.


## 2026-10-22 — Revisione M11–M13 — controlli locali completati

**Fatto**
- Risolti tutti i punti Ponytail 27–29 delle note di Ismail; nessuno era già risolto. M14 non iniziato, come richiesto.
- P27: formatter Intl.DateTimeFormat creato una sola volta per istanza della pagina partecipanti e riutilizzato direttamente con formatter.format. Stessi locale, formato e fuso Europe/Rome; eliminata la funzione che ricreava il formatter per ogni iscrizione.
- P28: aggiunta in PLAN.md §8.11 la differenza di arrotondamento accettata, come autorizzato espressamente dalla nota: 1 h 15 min diventa 1,3 in v2 e 1,2 nel legacy. Calcolo del profilo e CSV invariati; nessun'altra modifica al piano, inclusi gli stati dei moduli.
- P29: eliminati il ramo irraggiungibile setting di logCategory, la classe CSS e il token corrispondenti. UPDATE_SETTING e SETTING continuano a essere update; tutti i test esistenti, compreso il test unit delle categorie, lasciati invariati.

**Commit**
- d79a555: formatter riutilizzato e categoria inutilizzata rimossa.
- 71644aa: documentazione della differenza di arrotondamento accettata.

**Controlli**
- pnpm ci:local exit code 0: 172 unit, 276 integration, 97 e2e, totale 545; lint/check/build verdi e svelte-check con zero errori e warning. Nessun test aggiunto o modificato.
- git diff --check verde; verificata l'assenza del ramo/classe/token setting. Il diff dei test e di reports.ts rispetto a 3127d82 è vuoto.
- Immagine ricostruita con docker compose build app; stack dev arrestato e stack completo avviato con docker compose up -d --wait. App/Postgres healthy, nginx running su 8080/8443. Con CA locale: health 200, pagine partecipanti/log/profilo anonime 303, CSV log anonimo 401; HTTP 8080 → HTTPS 8443 con 308. Nessuna scrittura applicativa dai controlli HTTP e nessun volume eliminato.
- Nessuna modifica a schema, dipendenze o legacy. Note precedenti conservate; CI non ancora eseguita, nessun push della revisione al momento di questa voce.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione. Applicate esclusivamente le tre pulizie richieste. Ponytail, Caveman e riferimenti Graphify già consultati per i moduli coinvolti.

**Domande / blocchi**
- Nessun blocco tecnico. OAuth 42 reale e Safari fisico restano verifiche manuali già previste.

**Prossimo passo**
- Pubblicare la revisione, verificare tutti i sei job CI e registrare la chiusura. Poi fermarsi in attesa di indicazioni per M14.


## 2026-10-22 — Revisione M11–M13 — chiusura

**Fatto**
- Completati e pubblicati Ponytail 27–29: formatter riutilizzato nella pagina partecipanti, differenza di arrotondamento del profilo documentata in §8.11, ramo/classe/token setting rimossi.
- Nessun punto saltato; comportamento applicativo, calcolo delle ore e test esistenti invariati. Nota nel piano aggiunta con l'autorizzazione specifica di P28; stati dei moduli invariati.
- M14 non iniziato: attesa di indicazioni di Ismail, come richiesto.

**Commit**
- d79a555: pulizie di formatter e categorie.
- 71644aa: differenza di arrotondamento accettata nel piano.
- 12e54b1: controlli locali e diario.

**Controlli**
- pnpm ci:local exit code 0: 172 unit, 276 integration, 97 e2e, totale 545. Lint/check/build verdi, zero errori e warning svelte-check; test delle categorie invariato e verde.
- CI [run 39781899564](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39781899564) su 12e54b1: tutti i sei job lint, unit, integration, e2e, legacy-import e docker verdi; gh run watch --exit-status exit code 0.
- Immagine ricostruita, stack completo lasciato attivo su 8080/8443 con app/Postgres healthy e nginx running. Controlli HTTPS e redirect HTTP verdi, senza scritture applicative o eliminazione di volumi.
- git diff --check verde; nessuna modifica a test, reports.ts, schema, dipendenze o legacy. Note originali preservate integralmente.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione.

**Domande / blocchi**
- Nessun blocco tecnico. Restano le verifiche manuali OAuth 42 reale e Safari fisico già previste.

**Prossimo passo**
- Attendere Ismail per M14; nessun lavoro sul modulo avviato.


## 2026-10-23 — M14 — in corso, verifiche locali completate

**Fatto**
- Ripreso il lavoro delle due sessioni precedenti dal promemoria temporaneo, conservando le modifiche e le note di Ismail. Integrati font locali/licenze, token chiaro/scuro, logo SVG, navigazione, biglietti con perforazione, posti, settimane, partecipanti, dialog e messaggi nelle dieci pagine previste. Nessuna nuova dipendenza.
- Tema di sistema fino alla scelta esplicita, cookie light/dark validato e applicato nell'HTML server; interruttore prima dell'avatar/Logout. Nessuna opzione di ripristino del sistema, come concordato.
- Calendario a tutta larghezza, schede giorno mobile e animazione B con riduzione del movimento, cancellazione e coordinamento SSE. Builder conserva un solo form, intent add/remove/save e funzionamento senza JavaScript, senza bozze server né JSON nascosto.
- Applicata la variante admin successivamente approvata da Ismail: quattro riquadri impostazioni, settimana e selettore, sette colonne desktop di biglietti verticali con scorrimento confinato, giorni impilati su mobile. Creazione dal titolo o dal + del giorno con giorno preimpostato anche senza JS; modifica/eliminazione a icona nei dialog; iscritti e controlli presenze sempre visibili. Pannello fisso di creazione rimosso. Query e action admin invariate.
- Messaggi fissi in basso a destra, sopra la barra mobile e il footer del builder; eliminata la sovrapposizione che impediva il salvataggio senza JS. Dialog di attivazione settimana con OK. Rifiniti profilo, partecipanti, whitelist, template e log. Corretto il padding della matrice orizzontale secondo il riferimento, evitando il ritorno a capo di Icebreaker.
- Rigenerati 60 screenshot a 360/768/1280 nei due temi in docs/v2/design/implemented; README con riproduzione, varianti autorizzate e limiti dei controlli.

**Eccezioni di M14 autorizzate da Ismail durante il lavoro**
- Calendario: maxEventsPerUser dalla riga già letta e isRegistered dal booleano già calcolato. Il contatore include tutte le proprie iscrizioni, anche passate/assenti; i ₳ escludono le proprie assenze passate. Quadrati solo per limiti 1–10, oltre 10 testo n/limite; 0 resta senza limite e senza quadrati. Nessuna query nuova.
- Profilo: passed da isPassed con now esplicito e Europe/Rome; fine esattamente a now non passata. Stati In programma/Partecipato/Non partecipato; totali legacy, riepilogo admin e colonne CSV invariati, inclusi i turni futuri attended=true nei totali.
- Accesso: tre biglietti decorativi fissi, aria-hidden e testi Paraglide; nessun dato reale né modifica al loader root.
- Template: kinds nella stessa query, array_agg ordinato weekday/startTime/id con FILTER id non null e coalesce a '{}'; template vuoto [], eventCount invariato, barra decorativa e conteggio accessibile.
- Modulo puro kinds spostato in src/lib/kinds.ts con contenuto identico, nessun re-export; aggiornati tutti gli import, inclusi test e scripts/legacy. SHA256 originale e spostato identico.
- CSP: aggiunta esclusivamente style-src-attr unsafe-inline; style-src self e script-src invariati. Nessuna regola di riserva per svelte-announcer in base.css e nessuno style inline nei nostri componenti. Zod jitless configurato soltanto in hooks.client.ts, mai in realtime.ts/server.
- Giorni calendario: isoDate conservata prima della formattazione; oggi dal fuso Europe/Rome, nessun oggi con data null. displayUrl spostata nell'unico layout server admin con assertAdmin, stessa configurazione e nessuna query nuova.
- Display: aggiunto soltanto maxSlots già letto; occupati calcolati in vista come maxSlots-freeSlots, includendo gli assenti senza mostrarne i login; quadrati fino a 10, oltre solo numero.

**Commit**
- ab55ed5: dati di presentazione autorizzati, spostamento kinds e test unit/integration.
- bf31b06: temi, font, token, componenti condivisi, navigazione e accesso.
- d671485: pagine responsive, variante admin, animazione e test browser.

**Controlli**
- corepack pnpm ci:local exit 0: 186 unit, 277 integration, 121 e2e, totale 584; lint/check/build verdi, svelte-check zero errori e warning. Chromium desktop/mobile e WebKit, JS acceso/spento, tema SSR, CSP/announcer, dati oscurati, contatori, dialog, movimento normale/ridotto e audit/CSV verdi. Risolti i fallimenti precedentemente annotati nel promemoria.
- Galleria rigenerata con test 1/1 verde e controlli overflow/CSP/errori su tutte le pagine e larghezze. Confronto visivo nei due temi; controllo aggiuntivo admin mobile e giorno preimpostato. WebKit esegue i controlli senza cattura immagini: lo screenshot Playwright inietta uno stile che WebKit segnala come violazione CSP.
- Due revisioni mirate del diff, UI admin e dati/tema, senza rilievi. git diff --check verde; normalizzati soltanto spazi finali/CRLF nelle copie delle licenze, testo preservato. Nessuna modifica a legacy, dipendenze, migrazioni o regole di dominio oltre alle eccezioni approvate.
- Docker ricostruito; Compose dev fermato e stack completo lasciato attivo su 8080/8443, app/Postgres healthy e nginx running. Con CA locale: landing/health 200, calendario/admin/profilo anonimi 303, CSV log/partecipanti anonimi 401, redirect HTTP 308 con percorso/query preservati. CSP verificata sull'HTML. Nessun volume eliminato e nessuna scrittura applicativa durante lo smoke HTTPS.
- CI GitHub non ancora eseguita: pubblicazione e verifica dei sei job sono il prossimo passo.

**Decisioni prese dentro il perimetro del piano**
- Graphify consultato per il riferimento legacy; il grafo esistente non copre il codice v2, verificato direttamente nei sorgenti. Applicati Ponytail e Caveman, revisione mirata Cavecrew. Nessuna ricostruzione del grafo.

**Domande / blocchi**
- Nessun blocco tecnico. OAuth 42 reale, Safari su dispositivo fisico e browser del TV reale restano verifiche manuali; WebKit automatizzato non li sostituisce.

**Prossimo passo**
- Pubblicare M14, attendere tutti i sei job CI verdi e registrare la chiusura. Non iniziare M15.


## 2026-10-23 — M14 — completato

**Fatto**
- Completata e pubblicata l'integrazione del design con tutte le eccezioni e varianti autorizzate registrate nella voce precedente. Nessun punto del promemoria di implementazione lasciato aperto; M15 non iniziato.
- Aggiornata esclusivamente la colonna Stato di M14 al commit d671485. Note di Ismail e voci precedenti preservate. Screenshot finali nei due temi e README riproducibile disponibili in docs/v2/design/implemented/.

**Commit**
- ab55ed5: dati di presentazione autorizzati e relativi test.
- bf31b06: tema, tipografia, componenti e navigazione.
- d671485: pagine, calendario admin, animazione e test browser.
- afbada1: galleria, controlli locali e diario.

**Controlli**
- corepack pnpm ci:local exit 0: 186 unit, 277 integration, 121 e2e, totale 584; lint/check/build verdi, svelte-check zero errori e warning. Tutti i progetti browser verdi, inclusi i casi senza JavaScript e WebKit. Galleria aggiuntiva 1/1 verde, 60 screenshot aggiornati.
- CI [run 39915699285](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/39915699285) su afbada1: tutti i sei job lint, unit, integration, e2e, legacy-import e docker conclusi success; gh run watch --exit-status exit 0. GitHub ha aggiornato lo stato finale alcuni minuti dopo la conclusione degli step: atteso l'esito effettivo prima di segnare il modulo completato.
- Stack completo ricostruito e attivo su 8080/8443, app/Postgres healthy e nginx running. Smoke HTTPS con CA locale verde, redirect e permessi anonimi verificati senza scritture applicative né eliminazione di volumi. git diff --check verde; legacy, dipendenze e migrazioni invariati.

**Decisioni prese dentro il perimetro del piano**
- Nessuna ulteriore decisione rispetto alla voce precedente. Promemoria temporaneo locale da segnare FATTO al termine del controllo CI del push di questa chiusura.

**Domande / blocchi**
- Nessun blocco tecnico. Restano manuali OAuth 42 reale, Safari fisico e browser del TV reale, come già indicato; nessuna verifica su tali dispositivi dichiarata effettuata.

**Prossimo passo**
- Attendere indicazioni di Ismail per M15. Nessuna eliminazione della cartella legacy senza conferma scritta.


## 2026-10-23 — M14 post-review — correzioni completate, verifica CI dopo il push

**Fatto**
- Calendario a tutta larghezza anche per la sola pagina /admin. Variante autorizzata: nuovo token --admin-day-width: 15rem (240 px) per le sette colonne admin; --calendar-day-width e calendario utenti invariati. Sette giorni senza scorrimento a 1920 px; a 1280 scorrimento soltanto dentro days-grid, righe dei partecipanti contenute nelle card.
- Header globale circoscritto a site-header, incluse regole responsive/accesso; rimosso il reset superfluo dalle card template. Intestazioni dei giorni allineate alle colonne.
- Toast: timer di 6 secondi soltanto se tutti i messaggi sono successi; errori e avvisi persistono fino alla chiusura o navigazione. Nuovo e2e con page.clock verifica permanenza dopo 7 secondi, chiusura, navigazione e scadenza dei successi.
- Nomi accessibili distinti per giorno tramite admin_create_event_day e admin_delete_day_named; pulsante principale e titoli dei dialog invariati, selettori e2e aggiornati per Martedì.
- Eliminati i file locali non tracciati M14-RIPRESA-TEMP.md e w.png. Nessuna modifica a query, action, dipendenze, migrazioni, legacy o Stato dei moduli; M15 non iniziato.

**Controlli**
- corepack pnpm ci:local exit 0: 186 unit, 277 integration e 124 e2e (587 totali); lint/check/build verdi, check zero errori e warning. Chromium desktop/mobile e WebKit verdi, inclusi layout, dialog con/senza JS e nuovi controlli sui messaggi.
- Galleria rigenerata, test 1/1 verde: 62 immagini nei due temi, comprese admin a 1920 px. Header del sito pixel-identico a 360/768/1280 nei due temi; sei immagini template byte-identiche a e64f3fd. Verificati assenza di overflow della pagina, intestazioni allineate e contenimento dei partecipanti nelle colonne da 240 px.
- git diff --check verde; immagine Docker ricostruita, stack completo su 8080/8443 con app/Postgres healthy. Smoke con CA locale: landing/health 200, admin anonimo 303, redirect HTTP 308 con percorso/query preservati; nessun volume eliminato.
- CI GitHub: da verificare dopo il push dell'unico commit richiesto, tramite gh run watch --exit-status; esito nel rapporto finale e nella run associata al commit.

**Domande / blocchi**
- Nessuno. L'unica variante rispetto alle istruzioni iniziali, colonne admin da 240 px, è stata autorizzata esplicitamente prima di applicarla.

**Prossimo passo**
- Verificare tutti i sei job CI dopo il push e fermarsi; stato M14 invariato, M15 in attesa di Ismail.


## 2026-10-23 — M14 — avatar 42 tramite il server, senza salvataggio

**Fatto**
- Implementata la nuova rotta autenticata GET /avatar/[login], autorizzata nelle Note di Ismail. Login validato, URL letto soltanto da users.image_url, HTTPS e host esatto cdn.intra.42.fr senza redirect; inoltro soltanto di risposte 200 image/* entro 2 MB, con limite sia sul Content-Length sia sui byte letti. Errori 404 con log generici senza segreti.
- Token client_credentials esclusivamente in memoria di processo, scadenza anticipata di 60 secondi, richiesta concorrente condivisa e un solo rinnovo dopo 401 del CDN. Senza credenziali nessuna chiamata esterna. Immagini soltanto in memoria durante la risposta, mai salvate su file, DB, volumi o cache server; nel DB resta soltanto il link esistente. Al prossimo login OAuth si preferisce image.versions.medium con fallback a image.link.
- Avatar condiviso tra header e profilo, iniziali su errore, URL interno e solo hasImage nei dati client. Il replay degli eventi di Svelte genera un attributo onerror inline incompatibile con la CSP: su autorizzazione esplicita, listener error tramite addEventListener in onMount, rimosso allo smontaggio, e controllo complete/naturalWidth al mount. Nessun onerror nel markup; senza JavaScript rimane l'alt.
- CSP HTML: img-src ristretto a self/data, altre direttive invariate. La risposta avatar 200 imposta default-src 'none'; frame-ancestors 'none'; sandbox, nosniff e Cache-Control private, max-age=86400. Hooks conserva questa cache soltanto per /avatar/[login] con status 200; 401/404 restano private, no-store, con 401 esplicito prima del resolve per gli anonimi.
- Nginx: location /avatar/ senza buffering né cache e senza add_header locali, preservando gli header di sicurezza ereditati. Correzione della precedente indicazione: HSTS non era presente ed era stato citato per errore; non aggiunto né richiesto allo smoke. La sola decisione futura sul dominio di produzione è annotata in docs/v2/CUTOVER.md. M15 non iniziato.
- Nessuna modifica a schema, migrazioni, dipendenze, action o legacy. Note e diario precedenti preservati.

**Controlli**
- corepack pnpm ci:local exit 0: 223 unit, 277 integration, 135 e2e, totale 635. Lint/check/build verdi, svelte-check zero errori e warning. Chromium desktop/mobile e WebKit verificano immagini interne, assenza di URL CDN nei dati, fallback prima/dopo idratazione senza violazioni CSP e alt senza JavaScript.
- Fetch finto per i casi SSRF, HTML, limite di 2 MB, rinnovo dopo 401, token concorrenti/scadenza e credenziali assenti. Verificati CSP e header della risposta 200, eccezione cache hooks 200/404, anonimo 401 e assenza di import filesystem nei moduli del proxy. Nessun test automatico chiama il CDN reale.
- Immagine Docker ricostruita e stack completo attivo su 8080/8443, app/Postgres healthy. nginx -t e git diff --check verdi; nessun node build rimasto sull'host, nessun volume eliminato. Smoke HTTPS con CA locale: landing/health 200 e avatar anonimo 401/no-store, nosniff e altri header ereditati presenti; CSP HTML verificata, senza controllo HSTS.
- CI GitHub da verificare dopo il push tramite gh run watch --exit-status: devono risultare verdi tutti i sei job; esito nel rapporto finale e nella run associata al commit.

**Domande / blocchi**
- Verifica manuale con login OAuth 42 reale richiesta a Ismail dopo il riavvio: foto in header/profilo, /avatar/igilani 200 image/jpeg con CSP propria e nosniff, nessun ERR_BLOCKED_BY_ORB, secondo caricamento dalla cache del browser. In attesa di riscontro; i test simulati e lo smoke anonimo non sostituiscono questa verifica.

**Prossimo passo**
- Verificare i sei job dopo il push e registrare il riscontro manuale quando disponibile. Non iniziare M15.


## 2026-10-23 — M14 post-review — design v2 implementato e verificato localmente

**Fatto**
- Implementata la specifica approvata DESIGN-V2.md: titolo nello stub (due righe con ellissi), orari a 18 px, meta compatta senza data duplicata, posti fino a 10 e pillole piene. Animazione B e regole applicative preservate.
- Calendario utenti a tutta larghezza, colonne minime da 240 px con distacco nel padding: cinque giorni a 1280 px e sette a 1920 px. Mobile: colonne all'88%, scroll snap nativo, link ai giorni senza JS, selezione sincronizzata con lo scorrimento e con JS apertura su oggi in Europe/Rome, altrimenti sul primo giorno disponibile.
- Menu utente nativo sull'avatar con Profilo/Esci; niente Profilo o Logout nella barra desktop. Popover funzionante con/senza JS, chiuso con Esc, clic esterno e navigazione. Barra mobile inferiore preservata; foto e fallback del proxy avatar invariati.
- Messaggi compatti in alto a destra, × da 32 px e chiusura nativa con details anche senza JS. Con JS solo i successi scadono dopo 4 s, anche nelle liste miste; errori/avvisi restano fino a chiusura o navigazione. Nessun handler inline o modifica CSP.
- Toolbar admin compatta con valori e controlli affiancati, impostazioni richiudibili e inizialmente chiuse su mobile, chip delle settimane e azioni distruttive nella barra della settimana. Presente/Assente segmentati conservano i campi e le action esistenti. Biglietti orizzontali su mobile; sette giorni sempre disponibili. Display TV con biglietti compatti e pillole a 16 px.
- Copiata la specifica v2 nel repository e aggiornati README/token. Reference e PNG del canvas restano v1, non sono nuove esportazioni; galleria dell'app rigenerata separatamente con stati mobile/menu/admin aggiuntivi.
- Nessuna modifica a query, logica server, action, schema, migrazioni, dipendenze, CSP, legacy o stato dei moduli. M15 non iniziato.

**Controlli**
- corepack pnpm ci:local exit 0 sul codice finale: 223 unit, 277 integration e 141 e2e, totale 641. Lint/check/build verdi; controllo finale ripetuto sui test aggiornati, zero errori e warning di svelte-check. Messaggi verificati anche in liste miste, chiusura nativa senza JS e successi presenti dopo 3 s e assenti dopo 4 s.
- Prove di densità, scroll, date Europe/Rome, contrasto e impostazioni/menu con e senza JS passate in Chromium desktop/mobile e WebKit. Messaggi: contrasto minimo 5,43:1, superiore ad AA in entrambi i temi.
- Galleria finale 3/3 verde: 82 screenshot nei due temi, inclusi calendario compatto, sette giorni desktop, inizio/metà scorrimento/turno mio mobile, menu aperto e impostazioni admin chiuse/aperte. Gesto touch nativo Chromium riuscito; screenshot riletti, controlli della toolbar contenuti nelle rispettive sezioni e nessun overflow della pagina. Le fixture v2 usano login univoci e date fisse del 2099; la galleria generale usa il seed con date relative.
- Docker ricostruito e stack completo su 8080/8443 con app/Postgres healthy, nginx running. Smoke HTTPS con CA locale: landing/health 200, avatar anonimo 401/no-store, CSP HTML e header ereditati presenti; nginx -t e git diff --check verdi. Nessun controllo o aggiunta HSTS, volume eliminato o server node build lasciato sull’host.
- CI remota da verificare dopo il push tramite gh run watch --exit-status: tutti i sei job devono risultare verdi; esito nella run associata al commit e nel rapporto finale.

**Domande / blocchi**
- Nessun blocco di implementazione. Restano manuali OAuth/foto 42 reali, Safari fisico e TV reale, come nelle voci precedenti; non sono sostituiti dai test automatizzati.

**Prossimo passo**
- Commit/push e verifica dei sei job CI. Poi attendere indicazioni di Ismail, senza iniziare M15.


## 2026-10-26 — revisione avatar/design v2 e Lighthouse

**Fatto**
- R15: /avatar/[login] rifiuta con 404 un login diverso dall'utente corrente prima della lettura dell'immagine dal DB e prima del downloader. Unit con fetch finto, query/downloader mai chiamati; aggiunti controlli HTTP 404/no-store alla matrice utenti/admin. Commit locale dcb859e.
- R16: timeout-minutes 30 per e2e, 15 per ciascuno degli altri cinque job. Installer Playwright e runner invariati. Confermata via GitHub la cancellazione della vecchia run 39964427309: c0ee267 non ha ancora una CI remota completa. Commit locale 33d40fa.
- Ponytail 30 già risolto dalla regola .notice-wrapper:not(:has([open])). Riprodotta la chiusura reale senza JS: sia .notice sia summary non sono visibili. Rafforzato l'e2e con verifiche fisiche di visibilità; nessun CSS ridondante aggiunto.
- L3/L4: settimane non aperte senza opacity, testo muted e bordo tratteggiato; nome visibile dei link conservato, descrizione sr-only e nav distinta «Settimane». L5: giorni h2 con CSS circoscritto al giorno. L6: meta description italiana.
- L2: provato, FCP invariato (mobile 3,62→3,71 s, desktop 0,864→0,853 s), annullato. Ripristinato vite.config.ts senza inlineStyleThreshold, direttive CSP e dipendenze invariate.

**Misure**
- Autorizzato Lighthouse 13.4.1 tramite npx, throttling simulate, preset mobile predefinito e desktop. Solo seed dev_user del database baywatchers_test su HTTPS 8443; credenziali 42 disabilitate nel container di misura. Cookie/token non stampati né salvati nei report o nel repository; JSON sanitizzati fuori repository. package.json e lockfile invariati.
- Prima delle modifiche UI: mobile P82/A95/BP100/SEO90, FCP/LCP 3623,69 ms, CLS 0,002747, TBT 0 ms; desktop P98/A96/BP100/SEO90, FCP/LCP 863,92 ms, CLS 0,007096, TBT 0 ms. L1 risulta già risolto dopo la barra SSR: nessuna modifica al comportamento dei giorni.
- Prima prova L2 e correzioni indicate: mobile P81/A98/BP100/SEO100, FCP/LCP 3705,73 ms, CLS 0,002747; desktop P98/A98/BP100/SEO100, FCP/LCP 853,13 ms, CLS 0,007096; TBT 0 in entrambi. Nessun guadagno netto FCP mobile dimostrato; prova annullata su indicazione di Ismail.
- Misura finale senza L2: mobile P82/A100/BP100/SEO100, FCP/LCP e Speed Index 3622,34 ms, CLS 0,002747; desktop P98/A100/BP100/SEO100, FCP/LCP e Speed Index 865,69 ms, CLS 0,007096. TBT 0 ms in entrambi. Nessun errore di contrasto, nome accessibile o ordine dei titoli. Contrasto delle settimane non aperte misurato nel browser: 6,08:1 chiaro, 7,91:1 scuro.
- corepack pnpm ci:local exit 0: 224 unit, 277 integration, 141 e2e, totale 642; Chromium desktop/mobile, WebKit e prove senza JS verdi. Check zero errori e warning, lint/build verdi. Dopo il solo reset finale letter-spacing dei titoli, ripetuti check/lint/build e galleria: 3/3 verdi, 82 immagini rigenerate nei due temi; screenshot riletti. Nessuna nuova violazione CSP.

- CI GitHub [40295195870](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40295195870) su fdb1cc0: gh run watch --exit-status exit 0, tutti i sei job verdi (lint, unit, integration, legacy-import, e2e, docker). Verificato anche c0ee267 come antenato: installer browser terminato e test e2e completati, nessuna modifica al metodo di installazione.

**Decisioni autorizzate e applicate**
- EventCard con headingLevel 2/3/4 tramite svelte:element: 4 predefinito, 3 nel calendario, 2 nella landing. Admin, display e dialog restano su 4. Nome del pulsante avatar ricavato dal contenuto con prefisso sr-only e iniziali accessibili solo nell'header; alt vuoto per la foto dell'header, profilo invariato. Test aggiornati per livelli, nome visibile e alt.

**Domande / blocchi**
- Nessuna domanda di implementazione aperta. OAuth/foto 42 reali, Safari fisico e TV reale restano verifiche manuali separate.

**Prossimo passo**
- Lavoro completato; attendere indicazioni di Ismail. Stack normale ripristinato su 8080/8443: app/DB healthy, nginx -t verde, landing/health 200 con CSP HTML e nosniff, avatar anonimo 401/no-store/nosniff. Nessun volume eliminato né controllo HSTS. M15 non iniziato.


## 2026-10-26 — Ponytail 31 e 32 — CI remota in attesa

**Fatto**
- Ponytail 31: rimossi i tre headingLevel espliciti dalle EventCard decorative della landing, già escluse dall'albero accessibile con aria-hidden; torna il valore predefinito h4.
- Ponytail 32: display con giorni h2.day-heading e titoli delle card h3. CSS locale con le misure precedenti degli h3 (1.17em, letter-spacing normal), senza modificare gli stili globali. E2e aggiornati per verificare esplicitamente i livelli 2 e 3 con/senza JavaScript.
- Nessuna modifica a query, action, schema, migrazioni, dipendenze, CSP o legacy. M15 non iniziato.

**Controlli**
- corepack pnpm ci:local exit 0: 224 unit, 277 integration, 141 e2e (642 totali); lint/check/build verdi, svelte-check senza errori o warning. Chromium desktop/mobile e WebKit verdi.
- Confronto prima/dopo di 12 screenshot temporanei: landing e display a 360/768/1280 px nei due temi, immagini byte-identiche. Galleria non rigenerata perché l'aspetto non cambia.
- Lighthouse 13.4.1 su HTTPS /display, simulate, preset mobile predefinito e desktop; solo seed dev_user del DB di test, credenziali 42 disabilitate, nessun cookie/token nei report o nel repository, JSON sanitizzati fuori repo. Mobile P78/A100/BP100/SEO100, FCP/LCP 3609,95 ms, CLS 0,123686, TBT 0 ms; desktop P94/A100/BP100/SEO100, FCP 826,92 ms, LCP 866,92 ms, CLS 0,127522, TBT 0 ms. Nessun errore di ordine dei titoli, contrasto o nome accessibile; nessun errore console. CLS riportato come misura, nessun intervento aggiuntivo richiesto da Ponytail 31/32.
- git diff --check verde. Immagine Docker ricostruita, stack normale ripristinato su 8080/8443 con app/DB healthy. Smoke con CA locale: landing/health 200 con CSP HTML e nosniff, avatar anonimo 401/no-store/nosniff; nginx -t verde. Nessun volume eliminato, nessun controllo HSTS o node build rimasto sull’host.
- Commit 18701b4 fix(a11y): correct display heading levels and trim decorative props, pubblicato. CI [40302378178](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40302378178): cinque job verdi; alle 09:54:43 UTC il job e2e è ancora su playwright install --with-deps chromium webkit, iniziato alle 09:49:00 UTC, prima dei test. Log del job non disponibili finché è in corso. Non dichiarata verde, installer invariato; nessun nuovo push per evitare di cancellarla.

**Domande / blocchi**
- Installazione browser remota più lenta delle run precedenti, senza evidenza sufficiente per distinguere lentezza e blocco. Richiesta indicazione a Ismail prima di ulteriori interventi, come da note.

**Prossimo passo**
- Chiarire con Ismail se attendere il timeout di 30 minuti della run attuale; poi completare la verifica CI e pubblicare il diario. M15 non iniziato.


## 2026-10-26 — CI-1 e CI-2 — bloccato nella verifica remota

**Fatto**
- Solo job e2e in .github/workflows/ci.yml: container ufficiale mcr.microsoft.com/playwright:v1.64.1-noble, DATABASE_URL locale al job con host postgres, rimosso il mapping della porta del servizio e il passo playwright install. Timeout 30 minuti conservato; DATABASE_URL globale, ORIGIN e altri cinque job invariati.
- Inserito il commento shortcut richiesto per aggiornare insieme tag dell'immagine e @playwright/test. Verificata staticamente la corrispondenza 1.64.1; nessun download/installazione dei browser aggiunto.
- Commit f7fe466 ci: run e2e in the Playwright container, pubblicato. Il push ha cancellato automaticamente la vecchia run 40302378178. Nessuna modifica a codice applicativo, dipendenze, schema, migrazioni o legacy. M15 non iniziato.

**Controlli**
- corepack pnpm ci:local exit 0: 224 unit, 277 integration e 141 e2e (642 totali); lint/check/build verdi, check senza errori o warning. git diff --check verde.
- Stack normale ripristinato su 8080/8443, app/DB healthy; landing e health HTTPS 200 con CA locale, CSP e nosniff presenti. Nessun volume eliminato.
- CI [40305382981](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40305382981): gh run watch --exit-status exit 1. Lint, unit, integration, legacy-import e docker verdi. E2e fallisce in pnpm install --frozen-lockfile, prima di migrazioni/build/test: better-sqlite3@13.0.3 esegue node-gyp rebuild e termina con Error: not found: make. Il container ufficiale è stato inizializzato; il precedente passo apt dei browser non esiste più.

**Domande / blocchi**
- La compilazione nativa di better-sqlite3 richiede strumenti assenti dall'immagine Playwright. Fermato come richiesto, senza installare pacchetti, cambiare immagine, saltare script o applicare altri aggiramenti. Serve una decisione di Ismail prima di intervenire.

**Prossimo passo**
- Chiarire la gestione della dipendenza nativa nel job e2e, poi completare la verifica dei sei job e pubblicare il diario. M15 non iniziato.


## 2026-10-26 — CI-3 e chiusura Ponytail 31/32 — completato

**Fatto**
- Solo installazione del job e2e: pnpm install --frozen-lockfile --ignore-scripts && pnpm run prepare, con il commento richiesto. Immagine Playwright 1.64.1-noble, host postgres, timeout e altri cinque job invariati. Nessuna modifica a dipendenze, lockfile o codice applicativo; nessun apt, build tool, eccezione sandbox o aggiramento dei permessi aggiunto.
- Confermata la catena del seed: scripts/seed.ts importa writeData da import-legacy.ts; il binding di better-sqlite3 viene caricato solo costruendo Database nel percorso di import SQLite, non eseguito dal seed.
- Commit 290d4d8 ci: skip native builds in the e2e container, pubblicato.

**Controlli**
- Copia pulita temporanea fuori repo, dipendenze e store separati: install --ignore-scripts, prepare, db:migrate, db:seed, build ed e2e tutti con exit 0. Tutti i 141 e2e verdi, inclusi Chromium desktop/mobile, WebKit e casi senza JS. node_modules/better-sqlite3/build assente prima e dopo i test: nessun binding compilato riutilizzato.
- DB della prova in un container PostgreSQL separato, dati su tmpfs, senza montare volumi esistenti; container rimosso dopo la prova. Nessuna modifica ai node_modules della cartella di Ismail durante la verifica nella copia.
- corepack pnpm ci:local nel repo exit 0: 224 unit, 277 integration, 141 e2e, totale 642; lint/check/build verdi, check senza errori o warning. git diff --check verde.
- Stack normale ripristinato su 8080/8443, app/DB healthy; landing/health HTTPS 200 con CA locale, CSP e nosniff presenti. Nessun volume eliminato. M15 non iniziato.

- CI [40308454799](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40308454799) su 290d4d8: gh run watch --exit-status exit 0, tutti i sei job verdi (lint, unit, integration, legacy-import, e2e, docker). Il container ufficiale supera installazione senza script, prepare, migrazioni, seed, build ed e2e; nessun intervento su apt, permessi, root, sandbox o cache. Verificati anche gli antenati 18701b4 (Ponytail 31/32) e f7fe466 (CI-1/2).

**Domande / blocchi**
- Dettaglio della run 40308454799, verificato dopo il riepilogo dei job: 140 e2e passati direttamente e 1 flaky passato al retry. Caso WebKit tests/e2e/profile.test.ts:223, fallback avatar prima dell’idratazione; primo tentativo oltre 30000 ms, errore page.goto con pagina/context/browser chiuso nel finally a riga 271. Nessun errore di binding SQLite, installazione o build. Richiesta a Ismail prima di indagare o modificare questo comportamento non previsto; nessuna modifica a test o timeout.

**Prossimo passo**
- Diario pubblicato con ccc37b8; questa precisazione sul test flaky resta locale. Chiarire con Ismail se indagare il timeout e completare la verifica della run del commit del diario. M15 non iniziato.


## 2026-10-26 — T1 e D1 — completato

**Fatto**
- T1: eseguito il comando richiesto pnpm exec playwright test tests/e2e/profile.test.ts:223 --project=webkit-shared --repeat-each=30. Problema non riprodotto: 30/30 before hydration e 30/30 after hydration verdi su WebKit, più 86 test dei progetti dipendenti (146 totali, exit 0). Nessun retry locale; test, timeout, progetti e codice applicativo invariati, come richiesto in caso di mancata riproduzione. L'ipotesi sul gate resta non verificata: non è stata dichiarata causa.
- D1: copiata identica la specifica ~/personal_github/baywatchers-design/DESIGN-V2.md in docs/v2/design/DESIGN-V2.md, comprese rotta/nome accessibile avatar (§6) e accessibilità/Lighthouse (§11). cmp e SHA-256 identici: 1b3d4220dfec40bf747e4a5ebf08e45f7353b601f026a50df7bd2ce5708a52d2.
- Inclusa la precisazione rimasta locale: la run 40308454799 era verde con 140 e2e passati direttamente e uno passato al retry (fallback avatar prima dell'idratazione su WebKit). La successiva run del diario 40309548673 è conclusa con successo. Nessuna modifica al test non riprodotto; M15 non iniziato.

**Controlli**
- corepack pnpm ci:local exit 0: 224 unit, 277 integration e 141 e2e, totale 642; lint/check/build verdi, check senza errori o warning. git diff --check verde.
- Nessuna modifica a dipendenze, workflow, schema, migrazioni, query, action o legacy. Nessuna rigenerazione della galleria: l'applicazione non cambia.

- CI [40312275031](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40312275031) su cafca56: gh run watch --exit-status exit 0, sei job verdi. Riepilogo e2e verificato nei log: 141 passed, nessun flaky o retry. T1 e D1 completati senza modificare il test.
- Stack normale ripristinato su 8080/8443 con app/DB healthy; landing/health HTTPS 200 con CA locale, CSP e nosniff presenti. Nessun volume eliminato.

**Domande / blocchi**
- Nessuno. Il timeout intermittente della vecchia run non è riprodotto nelle 30 prove richieste; anche la nuova CI passa senza retry, quindi il test resta invariato.

**Prossimo passo**
- Attendere indicazioni di Ismail. M15 non iniziato.


## 2026-10-26 — Piano fino alla fine, blocco A — in attesa di decisione sul contrasto

**Fatto**
- A1: identificato lo spostamento della griglia causato dall'orologio vuoto in SSR. Prova prima/dopo idratazione: +248 px a 360 px e +29,875 px a 1280 px; su mobile il testo dell'orologio andava a capo. Riservati 8ch e altezza di riga nel CSS, white-space nowrap e token tipografico mobile esistente. Nessun contenuto nascosto né stile inline.
- A2: static/robots.txt con le due righe richieste; test e2e per 200 text/plain e contenuto esatto. Verificato anche tramite nginx su HTTPS 8443.
- Test mirati 8/8 e corepack pnpm ci:local exit 0: 224 unit, 277 integration, 145 e2e (646 totali). Nuovo e2e con script sospesi prima dell'idratazione verifica spazio dell'orologio, posizione della griglia invariata e assenza di overflow a 360/1280 px; Chromium desktop/mobile verdi. Check/lint/build e controlli di design/CSP WebKit verdi. git diff --check verde.
- Lighthouse 13.4.1 simulate, preset mobile e desktop su HTTPS /display, seed dev_user del DB di test, credenziali 42 disabilitate; nessun cookie/token nei report o nel repo, JSON sanitizzati fuori repo. Mobile P82/A95/BP100/SEO100, FCP/LCP 3616,94 ms, CLS 0,004983; desktop P98/A95/BP100/SEO100, FCP 838,81 ms, LCP 878,81 ms, CLS 0,021127. TBT 0 ms in entrambi. Obiettivo CLS <0,1 raggiunto (prima 0,123686/0,127522).

**Domande / blocchi**
- La nuova misura segnala contrasto insufficiente sui biglietti passati: EventCard.svelte applica opacity: var(--opacity-muted), pari a 0.5, all'intero article. Testi su stub dell'esame 2,61:1, metadati 2,27:1, stato 2,32:1. Il CSS è preesistente, non modificato dal fix dell'orologio; gli eventi conclusi del seed lo rendono visibile nella misura corrente. Richiesta autorizzazione prima di intervenire sul componente condiviso e sul suo stato passato. Nessuna correzione ulteriore applicata.
- Blocco A non ancora committato/pubblicato. Blocchi B e C non iniziati: rispettata la sequenza con CI verde prima del blocco successivo. Stack normale ripristinato su 8080/8443 con app/DB healthy, senza cancellare volumi.

**Prossimo passo**
- Chiarire la gestione del contrasto dei turni passati con Ismail, poi completare A con ci:local/push/CI verde prima di B e C.

## 2026-10-26 — Blocco A e M15 — completato

**Fatto**
- A: autorizzata da Ismail la rimozione dell'opacità dei turni passati. `EventCard.svelte` usa uno stub neutro (`--kind-fill: var(--color-raised)`, `--kind-ink: var(--color-muted)`): contrasto 5,55:1 nel tema chiaro e 6,02:1 nello scuro. Lo stato «Concluso» resta. Rimosso il token `--opacity-muted`, non più usato.
- M15, con le modifiche decise da Ismail:
  - niente `scripts/backup.sh` e nessuna sezione backup;
  - `docs/v2/CUTOVER.md` riscritto come runbook di avvio con database vuoto; la sezione HSTS resta da decidere;
  - `compose.yaml` con `restart: unless-stopped` anche per `db` e `nginx`;
  - `README.md` nuovo.
- `legacy/` non toccata.

**Commit**
- e315cf2 fix(display): reserve clock space to avoid layout shift
- 43e1740 fix(seo): serve a plain text robots.txt
- 9e82964 fix(a11y): keep text contrast on past tickets
- 1bf275b chore(docker): restart database and proxy with the stack
- 0afcd95 docs: rewrite README for setup, tests and the full stack
- 21f093e docs: add cutover runbook starting from an empty database

**Controlli**
- `pnpm ci:local`: verde, 145 e2e (blocco A).
- CI su GitHub: run 40322676861 verde, sei job (blocco A).

**Decisioni prese dentro il perimetro del piano**
- `robots.txt` con `Allow: /`. Il runbook indica che il redirect HTTP in `nginx/nginx.conf` punta a `localhost:8443` e va cambiato per un dominio pubblico.

**Domande / blocchi**
- HSTS sul dominio di produzione, cancellazione di `legacy/` e passaggio dei dati: decisioni di Ismail.

**Prossimo passo**
- M16.

## 2026-10-26 — M16 — completato, pronto per la verifica finale

**Fatto**
- `messages/en.json` e `messages/fr.json` complete, con le stesse chiavi di `it.json`; `project.inlang/settings.json` con `it`, `en`, `fr`. I nomi delle colonne CSV nel testo d'aiuto dei template restano quelli reali.
- Selettore di lingua nell'header, visibile anche da non loggati e su mobile. Il pulsante con il codice della lingua apre un menu `popover` con tre link, che funziona anche senza JavaScript.
- La rotta `GET /language/[locale]` imposta il cookie Paraglide e reindirizza solo a URL della stessa origine. È pubblica in `isPublicPath`.
- Date e numeri usavano già `Intl` con `getLocale()`. Titoli degli eventi, CSV e descrizioni dei log restano in italiano.
- Test:
  - unit sulle stesse chiavi e sugli stessi segnaposto nei tre file;
  - e2e per inglese e francese, con e senza JS: cambio lingua, login di sviluppo, calendario e iscrizione;
  - e2e sulla rotta: locale sconosciuto e redirect esterni come `//host`, `/\host`, tab e `https://…`.
- Galleria del design rigenerata in italiano: l'header contiene il selettore e i turni passati hanno lo stub neutro.

**Commit**
- ccebbf1 feat(i18n): add English and French translations
- e9d7550 feat(i18n): add a language switcher that works without JavaScript
- abf05d8 docs: document languages and refresh the design gallery
- 35b7201 fix(i18n): redirect only to same-origin URLs after a language change

**Controlli**
- `pnpm ci:local`: verde, 227 unit, 277 integration, 155 e2e.
- CI su GitHub: M15 run 40323565916 verde, sei job; M16 in fondo a questa voce dopo il push.

**Decisioni prese dentro il perimetro del piano**
- Nomi delle lingue scritti nella lingua stessa (Italiano, English, Français), fuori dai file di messaggi.

**Domande / blocchi**
- HSTS sul dominio di produzione, cancellazione di `legacy/` e passaggio dei dati: decisioni di Ismail.
- Le traduzioni inglese e francese vanno rilette da chi parla quelle lingue.

**Prossimo passo**
- Verifica finale di Ismail.

## 2026-10-26 — Verifica finale, correzioni della review — completato

**Fatto**
- Orologio del display a 24 ore in tutte le lingue (`hourCycle: 'h23'`). In inglese `01:50:13 PM` superava gli 8 caratteri riservati e faceva tornare lo spostamento di layout.
- `docs/v2/CUTOVER.md`: il display usa la lingua del browser della TV e non ha il selettore; aprire una volta `/language/it?to=/display` fissa l'italiano.

**Commit**
- vedi `git log`: `fix(display): use a 24-hour clock in every language`, `docs: explain how to pin the TV display to Italian`.

**Controlli**
- `pnpm ci:local`: verde, 227 unit, 277 integration, 155 e2e.
- CI su GitHub: M16 run 40325539457 verde, sei job; questa voce viene verificata dopo il push.

**Decisioni prese dentro il perimetro del piano**
- Nessuna.

**Domande / blocchi**
- HSTS sul dominio di produzione, cancellazione di `legacy/`, passaggio dei dati e rilettura delle traduzioni restano a Ismail.

**Prossimo passo**
- Nessuno: lavoro del piano completato.


## 2026-10-26 — M17 — blocco risolto, ripresa autorizzata

**Fatto**
- Letto integralmente `docs/v2/PLAN.md` e letta l'ultima voce del diario. Confermati branch `v2.0.0` e unica modifica iniziale in `docs/v2/PLAN.md`.
- Rilevato durante la lettura un conflitto tra le porte autorizzate nella richiesta della sessione e il controllo locale obbligatorio. Nessuna implementazione di M17; M18 non iniziato. Piano lasciato identico alla versione ricevuta.

**Commit**
- Nessuno: arresto al rilevamento del conflitto, prima del commit del piano. Nessun push.

**Controlli**
- `pnpm ci:local`: non eseguito; zero test eseguiti in questa sessione.
- CI su GitHub: non eseguita (nessun push, nessuna run avviata).
- Verifica in sola lettura: `package.json` avvia `compose.dev.yaml` e usa il database di test su `localhost:5432`; `compose.dev.yaml` pubblica `127.0.0.1:5432:5432`; `playwright.config.ts` avvia `node build` con `PORT=4173`. Il piano conferma questi valori in §14.3 e §15.2.

**Decisioni prese dentro il perimetro del piano**
- Nessuna. Nessun servizio avviato e nessuna configurazione modificata per aggirare il vincolo.

**Domande / blocchi**
- Risolto da Ismail: porte `5432` e `4173` autorizzate solo per i test locali (`pnpm ci:local`); le porte esposte dello stack restano `8080` e `8443`. Ismail ha fermato app e nginx senza toccare volumi; resta attivo il database su `127.0.0.1:5432`. Ripresa di M17 autorizzata, senza iniziare M18.

**Prossimo passo**
- Chiarimento ricevuto: committare il piano con `docs(plan): add 2.1.0 audit fixes and features`, eseguire solo M17 e completare i controlli e la pubblicazione richiesti. Login OAuth reale e verifica del builder aggiornato resteranno da verificare a mano dopo l'implementazione.


## 2026-10-26 — M17 — completato

**Fatto**
- D6: `FIRENZE_CAMPUS_ID = 52` e lettura validata di `campus_users` con default vuoto. Ammessi i membri del campus Firenze e i login in `ADMIN_LOGINS`; lo staff di altri campus è respinto. Il ruolo si calcola solo dopo l'ammissione. Il callback respinge prima di chiamare la persistenza: nessun utente creato o aggiornato, sessione o log; redirect a `/?error=campus` e messaggio nella landing in italiano, inglese e francese.
- D7: eliminata la data dal builder, dal modello del form, dalla validazione e dallo schema dei template. L'import CSV ignora `Data` e `Date`, anche invalide o relative a pool vecchi. Aggiornati i testi nelle tre lingue e §7 e §8.9 del piano nello stesso commit della migrazione.
- Nuovi file `drizzle/0002_married_sage.sql` e `drizzle/meta/0002_snapshot.json`, generati da Drizzle con il relativo journal: servono a eliminare solo `template_events.event_date`. Le date degli eventi reali restano invariate; quelle degli eventi applicati dai template derivano dal pool.
- Adeguata la preparazione dell'import SQLite usata anche dal seed: ignora le date dei template e scrive solo le colonne rimaste. `legacy/` non modificata.
- `createSession` elimina tutte le sessioni con scadenza minore o uguale a `now` prima dell'insert, nella transazione di login già esistente, senza timer o job.
- Stato M17 aggiornato in §19. Nessun aumento di versione; M18 non iniziato.

**Commit**
- `186a845` — `docs(plan): add 2.1.0 audit fixes and features` (piano iniziale identico a quello ricevuto).
- `75cde19` — `fix: enforce Firenze campus access and complete M17 audit fixes`.
- Chiusura del diario e dello stato M17 nel successivo commit documentale.

**Controlli**
- `corepack pnpm ci:local`: exit 0; 238 unit, 278 integration, 159 e2e, totale 675. Lint, check e build verdi, nessun errore o warning di svelte-check. `git diff --check` verde.
- Unit: profili Firenze, altri campus anche staff, campus assente o malformato, eccezione per admin hardcoded; callback respinto senza chiamare persistenza, impostare cookie di sessione o scrivere log applicativi. CSV con colonne `Data` e `Date` ignorate.
- Integration: login elimina sessioni scadute di un altro utente, inclusa la scadenza esatta, mantenendo quelle valide. Creazione/applicazione/import template e import SQLite verificati con lo schema migrato; data invalida nel template legacy ignorata.
- E2e: messaggio campus con e senza JavaScript su desktop/mobile; builder senza campo data, salvataggio/applicazione/import con e senza JavaScript; controlli responsive e CSP anche WebKit verdi in locale.
- Due errori introdotti durante il lavoro sono stati corretti prima del risultato verde: variabile inutilizzata nell'import e serializzazione delle date nel nuovo fixture integration. Nessun controllo saltato o configurazione di test cambiata.
- CI [40346075351](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40346075351) su `75cde19`: `gh run watch --exit-status` exit 0, sei job verdi (lint, unit, integration, legacy-import, e2e, docker).
- Dettaglio e2e CI: 158 passati direttamente e 1 passato al primo retry. `tests/e2e/profile.test.ts:223`, fallback avatar prima dell'idratazione su WebKit, timeout 30000 ms e `page.goto` nel finally a riga 271 con pagina/context/browser chiuso; stesso caso già documentato nelle sessioni precedenti. Test e timeout invariati, causa non attribuita a M17.

**Decisioni prese dentro il perimetro del piano**
- Chiarimento di Ismail applicato: `5432` e `4173` usate per `ci:local`; configurazione dello stack su `8080` e `8443` invariata. App e nginx lasciati fermi come predisposto da Ismail; nessun volume cancellato.
- Nessuna dipendenza, branch, worktree o tag aggiunto. Nessuna modifica ai moduli M18–M22.

**Domande / blocchi**
- Nessun blocco aperto per M17. Rimane segnalata l'intermittenza del test WebKit preesistente, verde al retry in CI e senza retry nella suite locale; nessuna indagine aggiuntiva fuori dal perimetro richiesto.
- Da verificare a mano: login OAuth reale con account Firenze e di altro campus (anche staff), eccezione `ADMIN_LOGINS`, rilettura dei nuovi testi inglesi/francesi e controllo del builder senza data con applicazione al pool corrente. Le verifiche automatiche usano risposte 42 simulate.

**Prossimo passo**
- Arresto della sessione dopo il commit e push dei documenti e la verifica della relativa CI. M18 resta da fare e non è stato iniziato.


## 2026-10-26 — M18 — completato

**Fatto**
- Versione `2.1.0` con il commit dedicato richiesto, contenente solo `package.json`.
- `nextShift(database, login, now)` in `domain/reports.ts`: legge solo le iscrizioni del login nelle settimane attivate, esclude gli eventi passati secondo §8.2 e ordina per settimana, giorno, inizio e id. Mantiene le iscrizioni segnate assenti e gestisce data concreta nulla e limite esatto dell'orario di fine.
- Nuovo `src/lib/components/NextShift.svelte`, condiviso perché lo stesso riquadro compare sopra la griglia del calendario e in cima al profilo: titolo, settimana, giorno, data e orari, con link ICS solo quando la data è disponibile. Non compare senza un prossimo turno. Nel calendario è indipendente dalla settimana visualizzata.
- Il calendario riusa l'invalidazione real-time già esistente; il profilo ora dichiara `app:profile` e usa lo stesso helper SSE con cleanup per `event_changed`, `week_activated` e riconnessione.
- Estratto `countWeeklyRegistrations` in `domain/registrations.ts`, usato sia dal controllo server nella transazione d'iscrizione sia dai dati del calendario. Conta tutte le iscrizioni della settimana visualizzata, comprese le assenze. Dopo la correzione della review, il contatore «I tuoi turni» resta sempre visibile: con limite positivo mostra «N di M turni questa settimana · X ₳» e i posti grafici già presenti; con limite 0 mostra il formato precedente «N · X ₳», senza «di M» e senza posti. La prima implementazione nascondeva erroneamente l’intera sezione con limite 0.
- Al limite, i pulsanti per nuove iscrizioni sono disabilitati e associati con `aria-describedby` al motivo visibile `error_weekly_limit`. Disiscrizione e controllo server restano operativi.
- Nuove stringhe in italiano, inglese e francese. Nessuna dipendenza o migrazione aggiunta, nessun cambiamento ai moduli successivi.

**Commit**
- `04231c7` — `chore: bump version to 2.1.0` (solo `package.json`).
- `e1ae195` — `feat: show next shifts and weekly booking limits`.
- `1f09e7d` — `fix(calendar): keep the weekly shift counter without a limit` (correzione richiesta dalla review).
- Chiusura del diario e dello stato M18 nel successivo commit documentale.

**Controlli**
- `corepack pnpm ci:local`: exit 0; 238 unit, 285 integration, 165 e2e, totale 688. Lint, check e build verdi; svelte-check senza errori o warning. `git diff --check` verde.
- Integration: nessuna iscrizione, altro login, soli eventi passati, settimana futura non attivata e successiva attivazione, ordine settimana/giorno/orario/id, assenza inclusa, data nulla e scadenza esatta in Europe/Rome. Prossimo turno indipendente dalla settimana visualizzata. Conteggio condiviso limitato a login e settimana, con assenze; stessa regola applicata dall'iscrizione, limite 0 illimitato.
- E2e desktop/mobile/WebKit, con e senza JavaScript: prossimo turno dopo l'iscrizione, link ICS e assenza del link senza data, contatore al limite e pulsante disabilitato con motivo visibile; richiesta diretta respinta dal server. Profilo aggiornato tramite SSE dopo una disiscrizione in un'altra scheda. Controlli di layout, temi, CSP, traduzioni e comportamento precedente verdi.
- Corretti prima del risultato verde: metadati mancanti nel nuovo fixture integration, asserzioni sul link ICS che ora verificano la destinazione risolta dal browser e altezza iniziale del riquadro. Reso compatto il riquadro con i token esistenti; il test che richiede due biglietti nel viewport desktop è rimasto invariato.
- CI [40351849655](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40351849655) su `e1ae195`: `gh run watch --exit-status` exit 0, sei job verdi (lint, unit, integration, legacy-import, e2e, docker).
- Dettaglio e2e CI: 164 passati direttamente e 1 passato al primo retry. Stesso test WebKit del fallback avatar prima dell'idratazione, `tests/e2e/profile.test.ts:223`, già segnalato nelle sessioni precedenti. Nessuna modifica a quel test o ai timeout; causa non attribuita a M18. Tutti i 165 e2e locali passati senza retry.

- Review del contatore: modifica limitata a `src/routes/calendar/+page.svelte` e alle asserzioni e2e esistenti. Nessuna modifica a query, controllo server, prossimo turno, CSS o traduzioni. Con limite 0 verificati visibilità della sezione e valori `0 · 0 ₳`, `1 · 200 ₳` e ritorno a zero dopo la disiscrizione; nessun «di» né posto grafico. Con limite positivo restano formato «N di M», posti e blocco delle nuove iscrizioni.
- Verifica della review: `corepack pnpm ci:local` exit 0 al primo passaggio; 238 unit, 285 integration, 165 e2e, totale 688, senza retry locali. Lint/check/build e `git diff --check` verdi. Inclusi desktop, mobile, WebKit, JavaScript attivo/disattivo e controlli di layout invariati.
- CI della review [40355672961](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40355672961) su `1f09e7d`: `gh run watch --exit-status` exit 0, sei job verdi e 165 e2e passati senza flaky o retry. Nessun blocco emerso; M19 non iniziato.

**Decisioni prese dentro il perimetro del piano**
- Riutilizzati helper, form e token esistenti. Nessun componente generico aggiunto oltre al riquadro effettivamente condiviso dalle due pagine.
- Branch `v2.0.0`, nessun worktree o tag. Porte `5432` e `4173` usate per i test locali; configurazione dello stack invariata. Nessun volume cancellato, app e nginx lasciati fermi.

**Domande / blocchi**
- Nessun blocco aperto per M18. Resta segnalata l'intermittenza del test WebKit preesistente, passato al retry in CI.
- Da verificare a mano: presentazione del prossimo turno e del limite con dati reali su telefono e desktop, rilettura dei nuovi testi inglesi e francesi. Nessuna prova su un deploy di produzione.

**Prossimo passo**
- Arresto dopo commit/push dei documenti e verifica della relativa CI. M19 resta da fare e non è stato iniziato.


## 2026-10-27 — M19 — completato

**Fatto**
- Action `duplicateEvent` su `/admin`: copia titolo, descrizione, tipo, orari, posti e compenso nella settimana e nel giorno scelti; data assoluta null e nessuna iscrizione copiata. Riutilizzati inserimento e log `CREATE_EVENT`, con descrizione «Duplicato dall'evento ID x», nella stessa transazione.
- Pulsante «Duplica» nella scheda admin con dialog nativo e settimana/giorno inizialmente uguali a quelli dell'evento.
- Action `saveWeekAsTemplate` e dialog sulla settimana admin: nome, descrizione e settimana target, con default alla settimana selezionata. Riutilizzati inserimento, validazione e log `CREATE_TEMPLATE`; mantenuti tipi e campi degli eventi, limite 1–200 eventi, nessuna data assoluta o iscrizione. Settimana vuota: avviso e nessuna scrittura.
- Nuovi testi in italiano, inglese e francese; entrambe le action aggiunte alla matrice di autorizzazione. Nessuna dipendenza, migrazione o nuovo file.
- Sessione del 26 ottobre interrotta dopo il push di `ab9b5ee`. Ripresa limitata alla chiusura documentale, autorizzata da Ismail; stato M19 aggiornato in §19. Review pulita, nessuna correzione richiesta.

**Commit**
- `ab9b5ee` — `feat(admin): duplicate events and save weeks as templates`.
- Chiusura del diario e dello stato M19 con `docs: record M19 completion and validation`.

**Controlli**
- `corepack pnpm ci:local` prima del push di `ab9b5ee`: exit 0; 238 unit, 293 integration, 171 e2e, totale 702, senza retry locali. Lint, check e build verdi; svelte-check senza errori o warning.
- Integration: copia dei campi anche per preset modificati, nessuna iscrizione copiata, data null, destinazioni validate, 404 su id inesistente, accesso solo admin, log e notifiche dopo commit, rollback se il log fallisce. Salvataggio della sola settimana scelta, target di default, settimana vuota, limite di 200 eventi e applicazione del template senza date assolute o iscrizioni.
- E2e desktop/mobile/WebKit con e senza JavaScript: duplicazione, valori iniziali del dialog, salvataggio della settimana, presenza del template nell'elenco, applicazione e avviso sulla settimana vuota. Controlli di layout e matrice di autorizzazione verdi.
- Corretto prima del risultato locale verde un nuovo fixture integration con descrizione minuscola inserita direttamente nel DB, incoerente con la normalizzazione già applicata dalla creazione dei template.
- CI [40360013319](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40360013319) su `ab9b5ee`: completata con successo, come verificato e comunicato da Ismail alla ripresa del 27 ottobre.
- In questa ripresa `ci:local` non rilanciato su istruzione esplicita di Ismail: commit di sola documentazione, codice invariato e Docker attualmente non disponibile. Verificati branch, checkout pulito prima delle modifiche e diff limitato ai due documenti; `git diff --check` verde.

**Decisioni prese dentro il perimetro del piano**
- Riutilizzati transazioni, log, form e dialog esistenti. Nessun branch, worktree o tag aggiunto. Nessuna modifica alla configurazione dello stack o ai volumi.

**Domande / blocchi**
- Nessun blocco aperto per M19. Da verificare a mano: uso dei due dialog con dati reali su telefono e desktop e rilettura dei nuovi testi inglesi e francesi. Nessuna verifica su un deploy di produzione.

**Prossimo passo**
- Arresto dopo commit e push dei documenti. M20 non iniziato.


## 2026-10-27 — M20 — completato

**Fatto**
- Letto il piano, compresi §1, §3 e §20 per intero, e l'ultima sessione M19. Confermati checkout pulito, branch `v2.0.0`, versione `2.1.0` e allineamento con il remoto.
- Link «Chiudi piscina» in `/admin` e nuova pagina `/admin/close-pool`, riservata agli admin: link ai due CSV esistenti, casella obbligatoria «Ho scaricato i dati», quattro opzioni indipendenti senza preselezioni e conferma in `Dialog` con l'elenco delle sole scelte effettuate. La revisione usa GET senza scritture; la conferma usa POST, anche senza JavaScript.
- Nuovo `domain/pool.ts`: validazione condivisa tra revisione e action `closePool`; avviso e nessuna scrittura senza conferma del download o senza scelte. Un'unica transazione con `lockAdmin`, lock su `settings`, `deletionSnapshot` degli eventi con iscrizioni e snapshot della whitelist prima delle cancellazioni. Vengono azzerate solo le parti scelte; i template, i log precedenti e il limite settimanale restano conservati.
- Un solo log `CLOSE_POOL`, con `old_value` contenente le parti azzerate, comprese iscrizioni e presenze. Pubblicazione dopo il commit di `log_created`, `event_changed` con `bulk_delete` e, solo se cambia almeno una delle due settimane, `week_activated` a 1.
- Nuove stringhe in italiano, inglese e francese; matrice di autorizzazione estesa a pagina e action. I fixture SQLite escludono `CLOSE_POOL`, assente nel legacy, mantenendo i 21 tipi e i dati precedenti; aggiunta un'asserzione di regressione. La cartella `legacy/` non è stata modificata.
- I cinque nuovi file sono quelli necessari al modulo: dominio, due file della route e due suite dedicate alla chiusura distruttiva. Riutilizzati `Dialog`, `Toast`, `formAction`, guard, snapshot e bus esistenti. Nessuna dipendenza o migrazione aggiunta.

**Commit**
- `00dced4` — `feat(admin): close pools with selective audited resets`.
- Chiusura del diario e dello stato M20 con `docs: record M20 completion and validation`.

**Controlli**
- `corepack pnpm ci:local`: exit 0; 238 unit, 309 integration, 175 e2e, totale 722, senza retry locali. Lint, check e build verdi; svelte-check senza errori o warning. `git diff --check` verde.
- Integration: 16 nuovi casi su soli eventi, sola whitelist, sole settimane, sole date, eventi con whitelist, settimane con date, tutto, niente e download non confermato. Verificati snapshot con presenti e assenti, un solo log e conservazione dei precedenti, template invariati, nessuna modifica alle parti non scelte, accesso negato anche dopo revoca del ruolo e richieste malformate. Rollback completo e nessuna notifica se falliscono cancellazione whitelist, update impostazioni o audit; ripetizione della chiusura e assenza di notifiche di attivazione se le settimane sono già a 1.
- E2e: quattro nuovi casi in Chromium desktop e mobile, con e senza JavaScript, su download CSV, opzioni inizialmente vuote, avviso senza scelte, revisione senza scritture, annullamento, chiusura completa, conservazione di template/log e assenza di overflow a 360 px o errori JavaScript. Matrice di autorizzazione verde per anonimo, utente e admin; suite WebKit preesistente e controlli di layout, CSP e traduzioni verdi.
- Corretti prima del risultato verde due problemi emersi nei controlli locali: inclusione della nuova azione nei fixture legacy e confronto, nei nuovi test integration, tra timestamp SQL serializzato e oggetto `Date`. Il test dei fixture mantiene il conteggio atteso di 21; il controllo del timestamp confronta l'istante effettivo. Nessun controllo saltato o timeout/configurazione di test modificato.
- CI [40472295145](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40472295145) su `00dced4`: `gh run watch --exit-status` exit 0, sei job verdi (lint, unit, integration, legacy-import, e2e, docker). Tutti i 175 e2e passati senza retry.
- Il commit di chiusura modifica soltanto questo diario e la colonna Stato di M20 in §19; il codice resta quello verificato localmente e nella run CI citata.

**Decisioni prese dentro il perimetro del piano**
- Branch e versione invariati; nessun branch nuovo, worktree o tag. Porte `5432` e `4173` usate per i test di `ci:local`; configurazione dello stack su `8080` e `8443` invariata. Nessun volume cancellato.

**Domande / blocchi**
- Nessun blocco o dubbio aperto per M20.
- Da verificare a mano: rilettura dei nuovi testi inglesi/francesi e flusso di esportazione, revisione e chiusura su una copia dei dati reali. Le verifiche automatiche usano il database di test con dati fittizi; nessuna verifica su un deploy di produzione.

**Prossimo passo**
- Arresto dopo commit e push dei documenti. M21 resta da fare e non è stato iniziato.

## 2026-10-27 — M21 — completato

**Fatto**
- Letto il piano, compresi §1, §3 e §20 per intero, e l'ultima sessione M20. Confermati checkout pulito, branch `v2.0.0`, versione `2.1.0` e allineamento con il remoto.
- `displayStates` in `domain/display.ts`: sugli eventi della sola settimana visualizzata, con data concreta, assegna `ongoing` dall'inizio fino alla fine inclusi e `next` al primo evento non ancora iniziato, ordinato per data concreta, inizio e id. Gli eventi senza data mantengono gli stati precedenti; tutti gli eventi sovrapposti in corso sono evidenziati.
- Estratto il confronto con data e ora di Roma già usato da `isPassed` in `romeDateTime`, senza cambiare il comportamento di quest'ultimo. Riutilizzati calcolo delle date, lettura degli eventi, `EventCard` e token dei temi esistenti.
- Etichette «In corso» e «Prossimo» sul display, con pillole e colori dei token di design. Restano visibili anche posti liberi o capienza piena e i soli login dei presenti. Testi aggiunti in italiano, inglese e francese.
- Riutilizzato senza modifiche il timer già presente: `invalidate('app:display')` ogni 60 secondi, oltre al real-time, con cleanup di timer e sottoscrizione. Nessuna dipendenza, migrazione o nuovo file.

**Commit**
- `b604143` — `feat(display): highlight ongoing and next events`.
- Chiusura del diario e dello stato M21 con `docs: record M21 completion and validation`.

**Controlli**
- `corepack pnpm ci:local`: exit 0; 251 unit, 309 integration, 179 e2e, totale 739, senza retry locali. Lint, check e build verdi; svelte-check senza errori o warning. `git diff --check` verde.
- Unit: prima, inizio esatto, durante, fine esatta, dopo un millisecondo, data null con e senza posti, nessun evento, eventi sovrapposti, selezione univoca del prossimo per data/orario/id, cambi primaverile e autunnale dell'ora in Europe/Rome. Aggiornato il test integration sulla fine esatta: ora `ongoing`, poi `passed`.
- E2e: quattro nuovi casi desktop/mobile, con e senza JavaScript, verificano «In corso», un solo «Prossimo» e la conservazione delle informazioni sui posti, anche per l'evento prossimo pieno. Suite preesistente su layout, temi, autorizzazione, token e real-time verde.
- Prima del risultato verde, il nuovo test unit sul salto primaverile ha rilevato che anticipare il confronto di un millisecondo attraversava il cambio d'ora: sostituito con il confronto diretto dell'ora locale condiviso con `isPassed`. Nessuna configurazione o timeout di test modificato.
- CI [40474506793](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40474506793) su `b604143`: `gh run watch --exit-status` exit 0; sei job verdi (lint, unit, integration, legacy-import, e2e, docker).
- E2e CI: 178 passati direttamente e uno passato al primo retry, `tests/e2e/calendar.test.ts:294` su WebKit con JavaScript. Il primo tentativo ha segnalato a riga 337 una navigazione verso `week=1` interrotta da una verso `week=2`. Test preesistente non modificato; causa non determinata, nessuna attribuzione a M21. I nuovi casi display sono passati direttamente.
- Il commit documentale modifica soltanto questa voce e la colonna Stato di M21 in §19; il codice resta quello verificato localmente e nella run citata.

**Decisioni prese dentro il perimetro del piano**
- Fine esatta inclusa in «In corso», coerentemente con §8.2: passato solo strettamente dopo la fine. Parità del prossimo risolta per id, coerentemente con l'ordinamento esistente.
- Branch e versione invariati; nessun branch nuovo, worktree o tag. Porte `5432` e `4173` usate per `ci:local`; stack su `8080` e `8443` invariato. Nessun volume cancellato.

**Domande / blocchi**
- Nessun blocco aperto per M21. Segnalata l'intermittenza WebKit del calendario, passata al retry in CI.
- Da verificare a mano: leggibilità delle etichette e passaggio degli stati sul TV reale, aggiornamento dopo 60 secondi senza notifiche SSE, rilettura dei nuovi testi inglesi/francesi. Nessuna verifica su un deploy di produzione.

**Prossimo passo**
- Arresto dopo commit e push dei documenti. M22 non iniziato: resta subordinato alla messa in produzione con dominio e certificato validi.


## 2026-10-27 — M23 — blocco risolto, ripresa

**Fatto**
- Letto `PLAN.md` per intero e l'ultima sessione M21; verificati branch `v2.0.0`, versione `2.1.0` e working tree inizialmente modificato soltanto nel piano.
- Committato `PLAN.md` così com'era, comprese §21 e D8–D13, senza alterarne il contenuto.
- Esaminati `domain/pool.ts` e `domain/reports.ts` per verificare il riuso richiesto e i dati disponibili.
- Arresto prima di modificare codice, schema o versione, per l'incoerenza descritta sotto. M24 e moduli successivi non iniziati.

**Commit**
- `626d287` — `docs(plan): add 2.2.0 pool archive, recap and QR enrollment`.

**Controlli**
- `git diff --check` verde prima del commit del piano.
- `ci:local` non eseguito: modulo fermato alla lettura della specifica, nessun test eseguito e nessun numero di test da riportare.
- Nessun push e nessuna run CI avviata per questa sessione: manca il requisito di modulo completato e controlli locali verdi.

**Decisioni prese dentro il perimetro del piano**
- Nessuna scelta sostitutiva sul modello dati o sulle statistiche. Versione rimasta `2.1.0`.
- Modificata soltanto la colonna Stato di M23 in §19, oltre a questa voce. Nessun branch, worktree, tag o modifica ai volumi.

**Domande / blocchi**
- §21.2 richiede che la funzione pura `poolStats(entries, login?)` restituisca la copertura dei posti per tipo anche per un archivio `site`. Tuttavia, §21.1 conserva una riga `pool_entries` per iscrizione, senza capienza (`max_slots`), identificatore dell'evento o righe per gli eventi privi di iscrizioni; neppure `pools` contiene questi dati. Dopo la cancellazione degli eventi non è possibile ricostruire il denominatore della copertura. Una singola iscrizione può appartenere a un evento da 1 oppure da 10 posti, producendo le stesse righe archiviate ma coperture diverse; anche i posti degli eventi senza iscritti andrebbero persi.
- Serve una decisione sul modello: quali dati aggiungere all'archivio per conservare le capienze di tutti gli eventi, inclusi quelli senza iscritti, e come passarli a `poolStats`; oppure una revisione esplicita del requisito di copertura. Il piano non è stato corretto autonomamente (§1.1 e §1.2).
- Verifiche manuali del flusso rinviate: nessuna nuova funzionalità implementata o validata.

**Prossimo passo**
- Chiarire e aggiornare la specifica della copertura, poi riprendere soltanto M23. Il commit del piano resta locale; diario e stato di blocco restano nel working tree.

**Risoluzione autorizzata e ripresa**
- Ismail ha eliminato da §21.2 la copertura dei posti: i totali includono turni, ore, ₳, partecipanti unici, percentuale di presenze e turni per tipo. Il modello di §21.1 resta invariato. Il blocco sopra è risolto; M23 torna in corso. La correzione del piano sarà committata con i documenti al termine del modulo.


## 2026-10-27 — M23 — completato

**Fatto**
- Ripreso soltanto M23 dopo la risoluzione autorizzata del blocco: eliminata dal piano la copertura dei posti, modello di §21.1 invariato. La correzione di §21.2 è inclusa nel commit documentale, insieme allo stato e al diario.
- Versione `2.2.0` con commit dedicato. Migrazione Drizzle `0003_pale_cerebro`: tabelle `pools` e `pool_entries`, data iniziale unica, FK con cancellazione in cascata, indice piscina/login e vincoli sui valori archiviati. Le tabelle di lavoro restano invariate.
- `closePool` salva sempre prima della pulizia, nella stessa transazione già esistente: lock admin, impostazioni e snapshot degli eventi; archivio delle iscrizioni con date concrete, durata, compenso, presenze e data di iscrizione. La stessa data iniziale aggiorna la riga della piscina e, se ci sono iscrizioni correnti, sostituisce le relative righe archiviate mantenendo l'id dell'archivio. Senza iscrizioni correnti conserva tutte le righe già archiviate (correzione della review sotto).
- La chiusura senza opzioni salva soltanto l'archivio. Download obbligatorio; senza `pool_start`, avviso `pool_dates_required` e nessuna scrittura. Audit `CLOSE_POOL` con id archivio e numero di righe in `new_value`, oltre agli snapshot precedenti delle parti azzerate. Notifiche solo dopo il commit: `log_created` ed `event_changed`, mai `week_activated`.
- `poolPhase` pura con date di Roma e verifica degli eventi oltre la fine. `poolStats` pura condivisa tra archivio e piscina corrente; query `currentPoolEntries` nella stessa forma delle righe archiviate. Riutilizzati calcolo delle date, orologio di Roma e durata dei report, senza nuove dipendenze.
- Aggiornata la pagina di chiusura esistente con l'indicazione del salvataggio dell'archivio e testi in italiano, inglese e francese. Nessuna pagina nuova; M24 e moduli successivi non iniziati.
- Nuovi file necessari: migrazione e relativi metadati generati da Drizzle, più la suite unit dedicata a fase e statistiche. Estese le suite integration ed e2e già esistenti.

**Commit**
- `626d287` — `docs(plan): add 2.2.0 pool archive, recap and QR enrollment` (creato prima del blocco, pubblicato con M23).
- `c342f9c` — `chore: bump version to 2.2.0`.
- `0187ced` — `feat(pool): archive closures and calculate pool statistics`.
- Chiusura documentale con `docs: record M23 completion and resolve archive plan blocker`.

**Controlli**
- `corepack pnpm ci:local`: exit 0; 273 unit, 313 integration, 179 e2e, totale 765, senza retry locali. Migrazione, lint, check e build verdi; svelte-check senza errori o warning. `git diff --check` verde.
- Unit: date null, prima dell'inizio, primo/ultimo giorno, mezzanotte di Roma dopo la fine, eventi assoluti e derivati oltre la fine e passaggi primaverile/autunnale dell'ora legale. Statistiche su righe vuote, login inesistente, sole assenze, dati parziali, somma dei minuti prima dell'arrotondamento, denominatore dell'intera piscina, fasce alle 12 e alle 18, ordine dei turni, parità, mese più intenso e soglie dei tre badge.
- Integration: archivio prima della cancellazione con metadata e date concrete; sostituzione dopo correzioni delle presenze, aggiunta e rimozione di iscrizioni; archivio vuoto e cascata. Conservati i controlli di pulizia selettiva, download, autorizzazione, revoca del ruolo e preview senza scritture. Rollback dell'archivio, delle cancellazioni e del log in caso di errore su righe archiviate, whitelist, impostazioni o audit; nessuna notifica prima del commit o dopo un rollback. Nessun `week_activated` alla chiusura.
- E2e desktop/mobile, con e senza JavaScript: download, revisione senza scritture, salvataggio senza pulizia, annullamento e chiusura completa con archivio conservato e unico per data iniziale. Template e log precedenti conservati, nessun overflow a 360 px o errore JavaScript. Matrice di autorizzazione e controlli precedenti su layout, CSP, temi e traduzioni verdi.
- Prima di `ci:local`, corretto un errore TypeScript del nuovo caso parametrizzato senza selezioni: l'array vuoto veniva inferito come `never[]`. Correzione limitata al tipo del fixture; nessun test saltato o timeout modificato. `ci:local` successivamente verde al primo passaggio completo.
- CI [40498130463](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40498130463) su `0187ced`: `gh run watch --exit-status` exit 0, sei job verdi (lint, unit, integration, legacy-import, e2e, docker).
- E2e CI: 178 passati direttamente e un test preesistente passato al secondo retry, `tests/e2e/profile.test.ts:223`, fallback avatar prima dell'idratazione su WebKit. I due tentativi iniziali hanno superato 30 secondi, con errore finale su `page.goto('/')` nel cleanup a riga 271. Test e timeout invariati; causa non determinata, nessuna attribuzione a M23. Tutti i casi di chiusura sono passati direttamente.
- Il commit documentale modifica soltanto questo diario, lo stato M23 in §19 e la correzione di §21.2 autorizzata da Ismail. Codice invariato rispetto alla run citata.

**Decisioni prese dentro il perimetro del piano**
- Ore, compensi, tipi e descrittori si basano sui turni effettuati, coerentemente con i report esistenti; le assenze contano nei turni presi e nel denominatore delle presenze. I partecipanti unici includono anche chi ha soltanto assenze. Il contributo usa i minuti, prima dell'arrotondamento delle ore.
- Per il periodo più intenso scelta l'opzione mensile prevista dal piano, per numero di turni effettuati. In caso di parità: giorno/mese più precoce e fascia mattina, pomeriggio, sera. Nessuna data o fascia inventata quando manca; il badge mattutino richiede una maggioranza dimostrabile sull'insieme dei turni effettuati.
- Branch `v2.0.0`, nessun nuovo branch, worktree o tag. Porte `5432` e `4173` usate per `ci:local`; configurazione dello stack su `8080` e `8443` invariata. Nessun volume cancellato.

**Domande / blocchi**
- Blocco della copertura risolto esplicitamente da Ismail; nessun dubbio o blocco aperto per M23. Resta segnalata l'intermittenza WebKit preesistente sul fallback avatar, passata al secondo retry in CI.
- Da verificare a mano: rilettura dei testi inglesi/francesi e flusso di chiusura senza pulizia, correzione delle presenze e successiva chiusura con pulizia su una copia dei dati reali. Verifiche automatiche solo con dati fittizi; nessuna verifica su un deploy di produzione. La consultazione dell'archivio dalla UI arriva in M24.

**Prossimo passo**
- Arresto dopo commit e push dei documenti e verifica della relativa CI. M24 non iniziato; M22 resta subordinato alla produzione.


**Review M23 — conservazione dell'archivio alla richiusura**
- Corretto il caso segnalato da Ismail: dopo una chiusura che cancella gli eventi ma conserva le date, una seconda chiusura senza iscrizioni correnti conserva integralmente le righe dell'archivio. La sostituzione resta attiva quando esistono iscrizioni da archiviare; la creazione di un primo archivio vuoto resta consentita.
- Con input vuoto si aggiornano soltanto fine piscina e data di archiviazione, conservando anche la sorgente dell'archivio esistente. Il log `CLOSE_POOL` conta le righe effettivamente presenti nell'archivio nella stessa transazione, comprese quelle conservate.
- Nuovo test integration: prima chiusura con cancellazione degli eventi e date conservate, seconda chiusura per svuotare la whitelist; confronto esatto delle righe archiviate, stesso id della piscina, timestamp aggiornato e numero corretto nel secondo log. Restano verdi i casi di sostituzione con correzione delle presenze, primo archivio vuoto e rollback.
- `b21486c` — `docs(plan): hide the calendar before the pool starts`: modifica di Ismail a D13 e §21.4 committata separatamente, così com'era nel working tree. Il comportamento previsto per M25 non è stato implementato in questa review.
- `677f5a4` — `fix(pool): keep archived entries when a closure has nothing to archive`: modifica limitata a `domain/pool.ts` e al test integration esistente. Nessuna nuova stringa visibile all'utente, dipendenza, migrazione o modifica della versione `2.2.0`.
- `corepack pnpm ci:local`: exit 0 al primo passaggio; 273 unit, 314 integration, 179 e2e, totale 766, senza retry locali. Migrazione, lint, check e build verdi; svelte-check senza errori o warning. `git diff --check` verde.
- CI [40501515962](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40501515962) su `677f5a4`: `gh run watch --exit-status` exit 0; sei job verdi e tutti i 179 e2e passati senza flaky o retry.
- Nessun dubbio o blocco aperto per la review. Da verificare a mano la richiusura dopo la cancellazione degli eventi su una copia dei dati reali; nessuna verifica su un deploy di produzione. M24 non iniziato.
- Chiusura documentale con `docs: record M23 archive preservation review`; aggiornato soltanto questo diario, codice invariato rispetto ai controlli citati. Arresto dopo commit/push e verifica della relativa CI.


## 2026-10-27 — M24 — completato

**Fatto**
- Letti il piano, incluse §1, D8–D13 e §21 per intero, e l'ultima sessione con la review M23. Confermati checkout pulito, branch `v2.0.0`, versione `2.2.0` e allineamento con il remoto.
- Nuova pagina `/admin/archive`, raggiungibile da `/admin`, riservata allo staff: selettori anno e piscina, nome con `Intl` nella lingua corrente, piscina corrente mostrata soltanto quando non esiste già un archivio con la stessa data iniziale. Totali, barre e ciambella SVG per tipo e tabella alfabetica dei partecipanti derivano tutti da `poolStats`, riusando `currentPoolEntries` per i dati correnti.
- Avviso in `/admin` quando `poolPhase` restituisce `finished`, con link funzionante a «Chiudi piscina». La query considera tutti gli eventi, anche quelli delle settimane diverse da quella visualizzata. Nessuna chiusura o pulizia automatica.
- Import del CSV dettagliato con file e mese/anno, anteprima di righe lette, voci importabili, scarti con motivo e totali; conferma esplicita prima della scrittura. L'anteprima non modifica il database. Alla conferma si rilegge e valida il CSV originale, senza fidarsi di righe o totali inviati dal client.
- Parser in `domain/archive.ts`, riusando il lettore CSV esistente: UTF-8, BOM e fallback latin-1, quoting e titoli multilinea, titoli con parentesi bilanciate, date e giorni coerenti, durate e compensi, assenze e date mancanti. `inferKind` assegna il tipo; orari e data di iscrizione restano null. Scarti sempre visibili nell'anteprima, senza indovinare le parti ambigue.
- Import in una sola transazione con `lockAdmin`, unicità della data iniziale, `source = 'csv'` e un log `IMPORT_POOL` con id archivio e numero di iscrizioni. Duplicato: errore senza sovrascritture né log. File senza voci importabili: avviso senza archivio vuoto. Inserimenti in blocchi di 1000 nella stessa transazione per rispettare il limite dei parametri SQL anche nei file densi. Pubblicazione di `log_created` solo dopo il commit; tabelle della piscina corrente invariate.
- Testi nuovi in italiano, inglese e francese. Estesi `Toast` per i nuovi messaggi e il tipo di ritorno di `formAction` per conservare i dati dell'anteprima, senza modificarne il comportamento. I fixture legacy escludono `IMPORT_POOL`, conservando i 21 tipi storici, come già avveniva per `CLOSE_POOL`.
- Sei nuovi file necessari al modulo: dominio archivio, due file della route e tre suite dedicate a parser, transazioni e flusso browser. Nessuna dipendenza, migrazione o modifica della versione.

**Commit**
- `85fe2b4` — `feat(archive): browse pools and import historical CSV reports`.
- Chiusura documentale con `docs: record M24 completion and validation`.

**Controlli**
- `corepack pnpm ci:local`: exit 0 nel passaggio conclusivo; 294 unit, 327 integration, 183 e2e, totale 804, senza retry locali. Migrazione, lint, check e build verdi; svelte-check senza errori o warning. `git diff --check` verde.
- Unit: 21 nuovi casi sul parser, inclusi voci valide, `NON PARTECIPATO`, compenso zero, ore decimali, parentesi bilanciate o ambigue, separatori nei titoli, date e giorni non validi, informazioni parziali, BOM, latin-1, quoting, righe vuote, limiti e round-trip con il vero `detailedCsv`.
- Integration: 13 nuovi casi su anteprima senza scritture, valori importati e audit, duplicati contro sorgenti `csv` e `site`, import concorrenti, rollback su errore di righe o audit, autorizzazione e revoca del ruolo, conferma e input malformati, file senza voci leggibili, archivio e piscina corrente senza duplicazioni, avviso di fine e import di 6000 voci sotto il limite di upload.
- E2e: quattro nuovi casi Chromium desktop/mobile, con e senza JavaScript, su anteprima senza scritture, scarti e XSS, conferma, totali per partecipante, selettori, grafici, duplicato senza nuove righe o log, avviso e navigazione alla chiusura, piscina corrente. Nessun overflow a 360 px o errore JavaScript. Matrice di autorizzazione estesa alla pagina e alle due action; gli snapshot comprendono anche `pools` e `pool_entries`. Suite preesistente, inclusa WebKit, verde.
- Prima del risultato conclusivo sono stati corretti soltanto problemi dei nuovi test E2e: formattazione, selettore «Piscina» che corrispondeva anche alla sezione e confronto del link relativo generato senza JavaScript. Il test ora seleziona il menu per ruolo e verifica il link navigando alla pagina di chiusura. Nessun test saltato, retry locale o timeout modificato; nessun errore di ambiente.
- CI [40506405897](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40506405897) su `85fe2b4`: `gh run watch --exit-status` exit 0; sei job verdi (lint, unit, integration, legacy-import, e2e, docker). Tutti i 183 e2e passati direttamente, senza flaky o retry.
- Il commit documentale modifica soltanto questa voce e la colonna Stato di M24 in §19. Il codice resta quello verificato localmente e nella run citata.

**Decisioni prese dentro il perimetro del piano**
- Il mese/anno selezionato identifica la piscina importata con il primo giorno del mese. La data finale resta null: l'ultimo turno non dimostra la fine della piscina. Le durate in ore del CSV, arrotondate dall'export a due decimali, vengono ricondotte ai minuti interi più vicini; le date mancanti restano null e il giorno della settimana noto viene conservato.
- Per le assenze il CSV non conserva il compenso originale: si salva 0, coerentemente con i report. Nessun orario o timestamp di iscrizione viene ricostruito. Questi limiti sono esplicitati nel testo del form in tutte le lingue.
- Se un frammento non permette di distinguere con certezza un separatore tra voci da un « | » nel titolo, viene scartata e segnalata l'intera riga del partecipante. Per una voce ben delimitata ma con titolo, data o numeri non validi si scarta soltanto quella voce. Nessuna deduplicazione arbitraria di turni: il CSV non conserva l'id dell'evento.
- Branch e versione invariati; nessun branch nuovo, worktree o tag. Porte `5432` e `4173` usate soltanto nei test di `ci:local`; stack su `8080` e `8443` invariato. Nessun volume cancellato.

**Domande / blocchi**
- Nessun dubbio o blocco aperto per M24.
- Da verificare a mano: rilettura dei testi inglesi/francesi, leggibilità dei grafici nei temi utilizzati dallo staff e confronto dell'anteprima con i CSV reali delle piscine passate, prestando attenzione agli scarti. I test usano dati fittizi; nessuna verifica su un deploy di produzione o import di dati reali.

**Prossimo passo**
- Arresto dopo commit e push dei documenti e verifica della relativa CI. M25 e M26 non iniziati; M22 resta subordinato alla produzione.

## 2026-10-27 — M25 — bloccato nell'ambiente

**Fatto**
- Letti le regole del piano, D8–D13, §21 e l'ultima sessione M24; verificati checkout inizialmente pulito, branch `v2.0.0`, versione `2.2.0` e remoto configurato.
- Esaminati dominio piscina, archivio, calendario, iscrizioni, profilo e test esistenti per il riuso richiesto.
- Iniziata una bozza del dominio `src/lib/server/domain/recap.ts` e dei loader `src/routes/recap/+page.server.ts` e `src/routes/recap/[poolId]/+page.server.ts`. Sono file incompleti, non verificati e non pronti per il commit: mancano componenti, collegamenti, traduzioni e test. Il loader parametrico è ancora una copia di quello corrente e deve essere completato.
- Il comando di modifica che avrebbe aggiornato `poolStats`, iscrizioni, calendario e profilo non è stato eseguito: l'interprete richiesto non è disponibile. I file preesistenti di implementazione restano invariati. `busiestMonth` non è ancora stato sostituito.

**Commit**
- Nessun commit creato; nessun push.

**Controlli**
- Nessun test eseguito; `ci:local` non eseguito. Nessuna run CI avviata.
- Nessuna verifica manuale del nuovo comportamento. M25 non completato; M26 non iniziato.

**Decisioni prese dentro il perimetro del piano**
- Arresto al primo errore di ambiente, senza tentare un interprete, strumento o metodo alternativo, come richiesto per questa esecuzione.
- Branch e versione invariati; nessun branch, worktree, tag o modifica ai volumi.

**Domande / blocchi**
- Il comando di modifica è terminato con exit 127: `zsh: command not found: python`. Il blocco riguarda lo strumento scelto per modificare i file, non una dipendenza dell'applicazione. Prima di riprendere serve autorizzare un metodo alternativo oppure rendere disponibile il comando `python` nell'ambiente.
- Il comando shell conteneva più operazioni: dopo il primo errore la shell ha continuato creando i tre file di bozza sopra elencati; anche il successivo comando `python` è fallito. Nessun tentativo di correzione o alternativa effettuato.
- Da verificare alla ripresa: completamento integrale di M25, settimana più intensa con data iniziale esatta e null per CSV/date mancanti, riservatezza dei dati serializzati, test richiesti dal piano e intera sequenza `ci:local` → push → CI → documentazione.

**Prossimo passo**
- Riprendere soltanto M25 dopo la risoluzione esplicita del blocco. Le bozze e questo diario restano locali, senza commit o push perché non sono soddisfatti i controlli verdi richiesti.

**Risoluzione autorizzata e ripresa**
- Ismail ha chiarito che l'interprete disponibile è `python3` e ha autorizzato esplicitamente `python3` e `apply_patch`. Il nome di comando errato non costituisce un controllo di ambiente fallito ai fini della regola di arresto. Blocco risolto; M25 torna in corso. Ripresa limitata a M25, senza iniziare M26.

## 2026-10-27 — M25 — completato

**Fatto**
- Ripreso soltanto M25 dopo il chiarimento autorizzato su `python3` e `apply_patch`; blocco precedente risolto. Branch `v2.0.0`, versione `2.2.0` invariata.
- Riepilogo personale `/recap` per i dati correnti e `/recap/[poolId]` per gli archivi; senza piscina corrente, `/recap` apre l'ultimo archivio personale disponibile. Nel profilo, «Le tue piscine» elenca soltanto le piscine del login, senza duplicare quella corrente se già archiviata con la stessa data iniziale.
- Componente `Recap` condiviso tra le due route e `/calendar`: schermate successive, pulsanti e frecce da tastiera, contatori con `svelte/motion`, ciambella SVG e barre settimanali animate. Con movimento ridotto i valori e i grafici sono statici; senza JavaScript tutte le schermate sono visibili una sotto l'altra. Le schermate prive di dati vengono omesse; le presenze compaiono soltanto da 80% in su, i badge soltanto quando ottenuti. Nessuna classifica o percentile.
- Tutti i numeri derivano da `poolStats`. La settimana più intensa usa `event_date` e la data iniziale esatta, con quattro intervalli consecutivi di sette giorni e parità risolta a favore della settimana precedente. Le date sono confrontate come giorni UTC, senza alterare i conteggi al cambio dell'ora legale. Gli eventi fuori dalle settimane 1–4 non vengono assegnati a una settimana inventata. Data iniziale non esatta (`source = 'csv'`), date mancanti nei turni effettuati o assenza di turni: nessuna settimana più intensa; niente barre quando il valore è null. Eliminato `busiestMonth` da codice e test, verificandone tutti gli usi.
- `/calendar` sceglie la vista con `poolPhase`: attesa con countdown verso mezzanotte di Roma e link all'ultima piscina precedente a cui si è partecipato, oppure messaggio buffo; nessuna piscina con ultimo riepilogo o messaggio; piscina finita con riepilogo dei dati di lavoro e griglia sotto; piscina attiva con calendario esistente. La griglia e i suoi eventi non sono serializzati nelle viste senza calendario. Il countdown si aggiorna ogni secondo, ricarica i dati alla scadenza e rimuove il timer alla navigazione; senza JavaScript rimane statico.
- Il dominio delle iscrizioni rifiuta `register` prima dell'inizio con `error_pool_not_started`, senza iscrizioni, audit o notifiche. Il controllo usa la data di Roma nella transazione esistente; il bypass dello staff per l'aggiunta manuale resta quello previsto dal piano.
- Il riepilogo studente contiene soltanto i propri turni e i totali anonimi della piscina, anche nei dati serializzati. Da `/admin/archive` lo staff apre lo stesso componente nella versione piscina intera: solo aggregati, nessun turno o nome individuale. L'opzione della vista intera è controllata dal dominio con `assertAdmin`.
- Testi nuovi in italiano, inglese e francese, date e numeri con `Intl`. Riutilizzati query correnti, statistiche, guard, notifiche, messaggi e token del design esistenti. Nessuna dipendenza, migrazione o modifica della versione.
- Dieci nuovi file necessari: dominio per selezione e accesso ai riepiloghi, due componenti specifici, quattro file delle due route e tre suite dedicate. Aggiornati i fixture del calendario, real-time e design affinché dichiarino una piscina attiva. Il vecchio caso della griglia senza data ora verifica la vista senza piscina e conserva il controllo del conflitto ICS; il profilo continua a verificare le date mancanti.

**Commit**
- `bc903d3` — `feat(recap): add personal pool recaps and waiting calendar`.
- Chiusura documentale con `docs: record M25 completion and validation`.

**Controlli**
- `corepack pnpm ci:local`: exit 0 nel passaggio conclusivo; 300 unit, 331 integration, 189 e2e, totale 820, senza retry locali. Migrazioni, lint, check e build verdi; svelte-check senza errori o warning. `git diff --check` verde.
- Unit: scelta della vista nelle quattro fasi; settimane da una data iniziale anche diversa dal lunedì, estremi dei quattro intervalli, attraversamento di mese e ora legale, parità, esclusione delle assenze, date mancanti, data iniziale non nota ed eventi fuori intervallo. Conservati i test precedenti delle statistiche.
- Integration: rifiuto fino al secondo precedente la mezzanotte di Roma e iscrizione consentita all'inizio, senza scritture o notifiche nel caso rifiutato; elenco personale, assenza di duplicazioni, riepilogo live a fine piscina, ultimo archivio a date rimosse, attesa che esclude la piscina futura, CSV con settimane e orari non noti, guard e dati serializzati privi di nomi e titoli altrui.
- E2e: sei nuovi casi Chromium desktop/mobile, con JavaScript, senza JavaScript e con movimento ridotto. Coprono countdown e avanzamento dell'orologio, messaggio vuoto, link all'ultimo riepilogo, tutte le fasi, blocco server delle iscrizioni anticipate, navigazione con pulsanti e frecce, schermate CSV saltate, link dal profilo e dall'archivio staff, accessi negati e input non validi, riservatezza, nessun overflow a 360 px e nessun errore JavaScript o console. Suite precedente e regressioni WebKit verdi.
- Nei passaggi di sviluppo corretti riferimenti obsoleti a `busiestMonth` nei test, direttive di accessibilità, formattazione e link interni secondo `resolve()`. Il primo passaggio E2e ha rilevato quattro errori nei test della vista senza piscina: `.calendar` selezionava anche il `main` del layout; corretto in `div.calendar`. Il passaggio completo successivo è verde. Nessun test saltato o timeout modificato; nessun controllo fallito per Docker, rete, permessi o autenticazione.
- CI [40510710825](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40510710825) su `bc903d3`: `gh run watch --exit-status` exit 0, sei job verdi (lint, unit, integration, legacy-import, e2e, docker). Log E2e verificato: 189 passati direttamente, nessun flaky o retry.
- Il commit documentale modifica soltanto questo diario e la colonna Stato di M25 in §19. Il codice resta quello verificato localmente e nella run citata.

**Decisioni prese dentro il perimetro del piano**
- L'attesa esclude dal link storico la piscina corrente futura, anche se contiene già iscrizioni inserite dallo staff. Le statistiche settimanali riguardano i turni effettuati, come gli altri descrittori di `poolStats`; le assenze con data mancante non alterano il ritmo dei turni effettuati.
- Branch e versione invariati; nessun branch nuovo, worktree o tag. Porte `5432` e `4173` usate soltanto per `ci:local`; stack su `8080` e `8443` invariato. Nessun volume cancellato.

**Domande / blocchi**
- Blocco iniziale risolto esplicitamente; nessun dubbio o blocco aperto per M25.
- Da verificare a mano: resa e navigazione del riepilogo sui dispositivi reali, leggibilità nei temi utilizzati, rilettura dei testi inglesi/francesi e corrispondenza con i dati delle piscine reali, soprattutto per gli archivi CSV parziali. Verifiche automatiche solo su dati fittizi; nessuna verifica su un deploy di produzione.

**Prossimo passo**
- Arresto dopo commit e push dei documenti e verifica della relativa CI. M26 non iniziato; M22 resta subordinato alla produzione.

## 2026-10-27 — M27 — bloccato prima dell'implementazione

**Fatto**
- Letti le regole, le decisioni D8–D17, §21 e §22 e l'ultima sessione M25. Confermati branch `v2.0.0`, versione `2.2.0` e sola modifica iniziale a `docs/v2/PLAN.md`.
- Committato il piano ricevuto senza modificarlo: `a4c4b10` — `docs(plan): add 2.3.0 pool lifecycle, full archive and final recap`.
- Ispezionati il dominio piscina, la modifica delle date, i relativi chiamanti e i test esistenti. Nessuna modifica al codice, alle migrazioni o alla versione; nessun modulo successivo iniziato.

**Controlli**
- `git diff --check` verde prima del commit del piano. `ci:local` non eseguito: nessun test eseguito in questa sessione. Nessun push e nessuna run CI avviata.
- Stato M27 aggiornato soltanto nella colonna Stato di §19; questa voce e lo stato di blocco restano locali, senza commit o push in assenza dei gate richiesti.

**Domande / blocchi**
- §22.1 definisce `pool_closed_at` e `pool_reopened`, ma non specifica la transizione quando lo staff modifica le date con `setPoolDates`. La funzione esistente (`src/lib/server/domain/settings.ts`) consente di sostituire direttamente inizio e fine; l'inizio identifica anche l'archivio (`start_date` unica).
- Occorre decidere se cambiare l'inizio identifica una nuova piscina e azzera i due campi, oppure se i campi restano invariati e il passaggio a una nuova piscina richiede prima la Pulizia delle date. Nel primo caso una correzione dell'inizio potrebbe riaprire una piscina già chiusa; nel secondo una nuova piscina potrebbe restare chiusa o mantenere l'esenzione dalla chiusura automatica della precedente. Va precisato anche se la sola correzione della fine conserva sempre i due campi.
- Arresto richiesto da §1.2 e dalle istruzioni della sessione: il punto cambia il comportamento del ciclo di vita e non viene risolto con un default implicito. Nessun problema di ambiente riscontrato; nessun metodo alternativo tentato.

**Prossimo passo**
- Chiarire la transizione di `setPoolDates` rispetto ai due campi, poi riprendere soltanto M27 con versione `2.3.0`, test e intera sequenza di gate richiesta. Verifiche manuali della nuova funzione non ancora applicabili: implementazione non iniziata.

**Risoluzione autorizzata e ripresa**
- Blocco risolto dalla precisazione di §22.1 "Date e stato": correggere la fine conserva lo stato; cambiare l'inizio a piscina chiusa è rifiutato con `pool_dates_locked`; impostare le date da `none` azzera `pool_closed_at` e `pool_reopened`. Ripresa autorizzata limitatamente a M27, inclusi i test di queste transizioni; M28 non viene iniziato. Stato M27: in corso.

## 2026-10-27 — M27 — completato

**Fatto**
- Blocco sulle date risolto dalla precisazione autorizzata di §22.1 "Date e stato", inclusa in questo aggiornamento documentale. Correggere solo la fine conserva chiusura e riapertura; cambiare l'inizio a piscina chiusa restituisce `pool_dates_locked`; impostare le date da `none` azzera entrambi i campi. Inizio e fine sono obbligatori.
- Versione `2.3.0`, migrazione dei campi `pool_closed_at` e `pool_reopened`, stati `none`, `upcoming`, `open`, `closed`. Chiusura automatica alla prima richiesta utile, protetta dal lock su `settings`, primo salvataggio e log con attore `SYSTEM`; riapertura manuale che impedisce ulteriori chiusure automatiche fino alla richiusura manuale.
- Pannello Piscina in `/admin`: Chiudi/Riapri con conferma, Salva archivio indipendente e Pulizia abilitata solo a piscina chiusa. Riutilizzata la logica della vecchia pagina `/admin/close-pool`, eliminata e rimossa dalla matrice delle route.
- Pulizia con caselle inizialmente vuote, scelta tra salvataggio prima della cancellazione e conservazione del salvataggio precedente. Verifica dell'esistenza dell'archivio e del numero di righe appena salvate nella stessa transazione delle cancellazioni; rollback e messaggio dedicato in caso di errore. Con zero iscrizioni correnti l'archivio esistente viene conservato. Template, log e archivio restano intatti.
- Iscrizioni e disiscrizioni degli studenti rifiutate in `upcoming` e `closed`; correzioni delle presenze dello staff consentite. A piscina chiusa il calendario lascia posto al riepilogo, disponibile dall'archivio anche dopo la pulizia degli eventi.
- Evento pubblico `pool_closed` privo di dati personali e popup per gli studenti, anche dal profilo e dalle pagine del riepilogo, riusando lo stream SSE già aperto dalla pagina. Conservata la notifica di attivazione settimana. Testi aggiornati in italiano, inglese e francese; nessuna dipendenza aggiunta.
- Nuovi file limitati alla migrazione SQL e al relativo snapshot Drizzle. Adeguati fixture e test esistenti ai nuovi stati e alle date obbligatorie; i dati fittizi legacy continuano a escludere le azioni introdotte nella v2.

**Commit**
- `a4c4b10` — `docs(plan): add 2.3.0 pool lifecycle, full archive and final recap`.
- `40d5006` — `chore: bump version to 2.3.0`.
- `85cf5cb` — `feat(pool): add lifecycle controls and verified archive cleanup`.
- Chiusura documentale con `docs: record M27 completion and validation`: precisazione sulle date, stato M27 in §19 e diario; codice invariato rispetto alla validazione.

**Controlli**
- `corepack pnpm ci:local`: exit 0 nell'esecuzione conclusiva; 302 unit, 348 integration, 193 e2e, totale 843 test, senza retry. Migrazioni, lint, check e build verdi; svelte-check senza errori o warning. `git diff --check` verde.
- Test su stati e transizioni, estremi delle date e ora legale, chiusura automatica una sola volta con richieste concorrenti, riapertura che impedisce la chiusura automatica, regole di modifica delle date e rifiuto delle operazioni degli studenti.
- Verificati salvataggi e correzioni indipendenti dalla chiusura, pulizia delle sole parti scelte, conservazione dell'archivio con zero iscrizioni, verifica del conteggio e rollback in caso di errori a salvataggio, cancellazioni, impostazioni o audit. Controllati privilegi anche nella transazione e validazione delle action senza fidarsi dei dialoghi.
- E2e desktop e mobile del pannello con e senza JavaScript, popup per chiusura manuale e automatica, riapertura e seconda chiusura, una sola connessione SSE per pagina, riepilogo e assenza di overflow a 360 px. Suite esistente, movimento ridotto e regressioni WebKit verdi.
- Durante lo sviluppo corretti fixture e chiamanti del vecchio flusso, tipi e sintassi del popup; eliminata una connessione SSE duplicata e usata la navigazione interna nel test del contatore per coordinarla con gli aggiornamenti realtime. Un tentativo mirato con due progetti condivisi avviati senza dipendenze ha prodotto interferenze tra fixture: esito non usato come validazione. Il passaggio completo conclusivo ha rispettato la sequenza del repository ed è verde; nessun timeout aumentato o retry aggiunto.
- Push del codice completato su `v2.0.0`. CI [40519798744](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40519798744) su `85cf5cb`: verde. Review M27 pulita, senza correzioni, come confermato alla ripresa.
- Ripresa finale limitata ai documenti: `ci:local` non rilanciato. La precisazione di §22.1 viene committata insieme al diario e allo stato di completamento richiesto.

**Domande / blocchi**
- Blocco iniziale risolto; nessun dubbio o blocco aperto per M27.
- Da verificare a mano: resa del pannello e dei popup sui dispositivi reali, rilettura dei testi inglesi e francesi, salvataggio delle correzioni e pulizia con entrambe le scelte su una copia dei dati reali. Le verifiche automatiche hanno usato dati fittizi; nessuna validazione su un deploy di produzione.

**Prossimo passo**
- Arresto dopo commit e push dei soli documenti. M28 non iniziato: formato CSV standard e relativo download restano in §22.3; riepilogo definitivo in M29 e QR in M26. Nessun branch nuovo, worktree, tag o push forzato; nessun volume cancellato.

## 2026-10-27 — M28 — completato

**Fatto**
- Migrazione `0005`: `pool_entries` con `week` (1–4), `max_slots`, `event_ref`, `week_activated_at` (nullable) e nuova tabella `week_activations`. `setActiveWeek` fa upsert dell'attivazione nella stessa transazione; la pulizia con "settimane a 1" svuota la tabella.
- `currentPoolEntries` e `saveArchive` riempiono i nuovi campi (settimana e capienza dall'evento, `event_ref` = id evento, attivazione dalla settimana). `poolStats` usa `week` per la settimana più intensa quando tutte le presenze lo hanno, altrimenti le date come prima.
- CSV standard: intestazione fissa in inglese (colonne di `pool_entries` senza `id` e `pool_id`), date ISO, orari `HH:MM`, `true`/`false`, vuoto per i null, scritto con `writeCsv`. Download da `/admin/archive/[pool].csv` (`current` o id archivio), con link nel pannello Piscina e in `/admin/archive`.
- Import in `/admin/archive` solo nel formato standard: form con data di inizio e di fine, anteprima (righe lette, righe saltate con colonna e motivo, totali) e conferma; intestazione sbagliata rifiutata con avviso dedicato; `start_date` duplicata rifiutata; `source = 'csv'`, log `IMPORT_POOL`. Eliminati parser del `detailed.csv`, test e testi dell'import M24 (l'export `detailed.csv` dei partecipanti resta). Testi in it/en/fr; rotta aggiunta alla matrice e2e.

**Commit**
- `84d524f` — `feat(archive): add full archive columns and standard CSV export/import`.

**Controlli**
- `corepack pnpm ci:local`: exit 0; 287 unit, 351 integration, 193 e2e, totale 831 test. Lint, check e build verdi.
- Test: round trip export→import, intestazione sbagliata, righe non valide saltate con motivo, duplicato, upsert e pulizia di `week_activations`, nuovi campi salvati alla chiusura, e2e con e senza JavaScript (anteprima, import, download, duplicato).
- Push su `v2.0.0`; CI [40524528681](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40524528681) su `84d524f`: verde.

**Domande / blocchi**
- Nessun blocco. Scelte nel piano: il download `current` con piscina senza date esporta comunque (solo intestazione, file `piscina_current.csv`) per rispettare la matrice e2e; il link nel pannello è nascosto in fase `none`. Limite import 1 MB e 20000 righe.
- Da verificare a mano: apertura del CSV scaricato in un foglio di calcolo, import di un archivio reale esportato e testi inglesi/francesi.

- Fix dalla review (`496811f`): l'import toglie l'apice che `writeCsv` antepone a login e titoli che iniziano con `= + - @` (round trip identico); `week_activations` si aggiorna solo se la settimana attiva cambia, così riattivare la stessa settimana conserva il primo orario. Test aggiunti; `ci:local` verde (288 unit, 351 integration, 193 e2e); CI [40528935186](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40528935186) verde.

**Prossimo passo**
- Arresto dopo i documenti. M29 e M26 non iniziati.


## 2026-10-28 — M29 — completato

**Fatto**
- `2336180` — `feat(recap): add definitive two-chapter recap with new badges`: riepilogo in due capitoli, ultima piscina personale e "In totale", con conteggi, ore, compensi, tipo preferito e badge. Presenze sempre visibili; riepilogo sotto il countdown in fase `upcoming` e come pagina di base in `none` e `closed`; calendario conservato in `open`.
- Nuovi badge descrittivi e testi in italiano, inglese e francese; aggiornati test unit, integration ed E2E del riepilogo, con e senza JavaScript, movimento ridotto e larghezza mobile. Review del codice pulita, confermata da Ismail alla ripresa.
- Aggiornata soltanto la colonna Stato di M29 in §19. Versione `2.3.0`, branch `v2.0.0`; M26 non iniziato.

**Controlli**
- `pnpm ci:local`: exit 0; 290 unit, 351 integration, 193 E2E, totale 834 test. Migrazioni, lint, check e build verdi; E2E senza retry. Validazione completa eseguita ora, dopo il push originale del codice.
- CI [40533194644](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40533194644) su `2336180`: `completed/success`, verificata alla ripresa.
- Chiusura documentale: `docs: record M29 completion and validation`.

**Decisioni prese dentro il perimetro del piano**
- "Piscine fatte" conta soltanto piscine con almeno una presenza.
- I badge di "In totale" sono l'unione dei badge per piscina e di quelli calcolati sul totale; Fedelissimo può derivare solo da una singola piscina, mai sommando settimane di piscine diverse.
- "Riflessi pronti" richiede un ritardo compreso tra zero e cinque minuti inclusi: `0 ≤ registered_at - week_activated_at ≤ 5 min`.

**Domande / blocchi**
- Nessun blocco. Restano da verificare a mano resa sui dispositivi reali e testi inglesi/francesi; nessuna verifica in produzione.

**Prossimo passo**
- Push dei documenti e verifica CI, poi rimozione autorizzata della cartella `legacy/`. M26 non viene iniziato.


## 2026-10-28 — Rimozione dell'app Flask legacy

**Fatto**
- Ismail ha confermato il 27/10: "si può cancellare il legacy senza problemi". Rimossa la cartella `legacy/`; conservati intatti `scripts/legacy/`, seed, import e test.
- Rimossi gli ignore di Prettier, ESLint e CI; aggiornati README, runbook di cutover e riferimento storico nel design. Il codice Flask resta nella storia Git; il rollback usa una copia separata recuperata dalla storia e il database conservato fuori dal repository.
- PLAN.md e voci precedenti del diario conservati come storia. M26 non iniziato.

**Controlli**
- CI documentazione M29 [40653452707](https://github.com/SamirAbdeslam/gestionale-baywatchers-42Firenze/actions/runs/40653452707) su `b8ca715`: `gh run watch --exit-status` exit 0.
- Ricerca dei riferimenti alla cartella completata; restano quelli storici nel piano e nel diario e gli import degli script conservati.
- `pnpm ci:local`: exit 0; 290 unit, 351 integration, 193 E2E, totale 834 test, senza retry. Migrazioni, lint, check e build verdi; `git diff --check` verde. Nessuna modifica a `scripts/legacy/`.
- Commit di rimozione: `chore: remove legacy Flask app`; dopo il push, verifica della relativa run con `gh run watch --exit-status`.

**Domande / blocchi**
- Nessun dubbio o blocco aperto. Nessuna verifica in produzione; il ritorno a Flask descritto nel runbook non è stato eseguito.
