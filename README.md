# Gestionale Baywatchers v2

Gestione dei turni Baywatchers di 42 Firenze. Comprende:

- calendario e iscrizioni ai turni;
- display per la TV;
- pannello admin (eventi, settimane, presenze, whitelist, template, riepilogo ed export, log);
- profilo;
- aggiornamenti in tempo reale.

Stack: SvelteKit, Svelte 5, Postgres 17, Drizzle, Paraglide (it, en, fr) e nginx.

- Piano e decisioni: [docs/v2/PLAN.md](docs/v2/PLAN.md).
- Diario: [docs/v2/SESSIONS.md](docs/v2/SESSIONS.md).
- Avvio in produzione: [docs/v2/CUTOVER.md](docs/v2/CUTOVER.md).
- Design: [docs/v2/design/](docs/v2/design/).

Il codice Flask originale resta disponibile nella storia Git.

## Requisiti

- Node.js 24 (`.nvmrc`) e pnpm 10 tramite Corepack: `corepack enable && corepack install`.
- Docker con Compose.
- OpenSSL per il certificato locale.

## Configurazione

Copiare `.env.example` in `.env` e compilare i valori. Ogni variabile ha un commento. L'app valida tutto
all'avvio e non parte se manca un valore obbligatorio.

- `ORIGIN` viene incorporata nella build (`kit.paths.origin`) e deve coincidere con il valore usato a runtime per
  cookie e OAuth. Quando cambia, ricostruire.
- `FT_CLIENT_ID` e `FT_CLIENT_SECRET` vengono dall'app OAuth 42. Nell'app 42 va registrato il redirect URI
  `<ORIGIN>/auth/callback`.
- `AUTH_DEV_LOGIN=true` abilita il login di sviluppo su `/auth/dev`, ammesso solo con `ORIGIN` su `localhost` o
  `127.0.0.1`.
- `DISPLAY_TOKEN`, se impostato, rende `/display` accessibile solo con `?token=<valore>`.
- `.env` resta fuori da Git.

## Sviluppo

```sh
pnpm install
docker compose -f compose.dev.yaml up -d --wait   # Postgres su 127.0.0.1:5432
pnpm db:migrate
pnpm db:seed                                     # dati fittizi e utenti dev_admin, dev_user, dev_outsider
pnpm dev                                         # con ORIGIN=http://localhost:5173
```

Con `AUTH_DEV_LOGIN=true` si entra da `/auth/dev` senza 42.

## Test

```sh
pnpm ci:local
```

Esegue in ordine:

- avvio del Postgres di sviluppo;
- migrazioni sul database `baywatchers_test`;
- lint, check, unit e integration;
- seed e build per `http://localhost:4173`;
- e2e Playwright: Chromium desktop e mobile, WebKit, con e senza JavaScript.

La prima volta servono i browser: `pnpm exec playwright install chromium webkit`.

Singole parti:

- `pnpm test:unit`;
- `pnpm test:integration`, con `DATABASE_URL` sul database di test;
- `pnpm test:e2e`.

La CI su GitHub (`.github/workflows/ci.yml`) esegue gli stessi controlli.

## Stack completo (nginx, HTTPS)

In `.env` impostare `DATABASE_URL` con host `db` e `ORIGIN=https://localhost:8443`.

Prima del primo avvio, generare il certificato locale con OpenSSL (validità 365 giorni). Il comando protegge la chiave e
non sovrascrive certificati esistenti:

```sh
mkdir -m 700 -p nginx/certs
(
  umask 077
  test ! -e nginx/certs/localhost.key && test ! -e nginx/certs/localhost.crt &&
    openssl req -x509 -newkey rsa:2048 -noenc -sha256 -days 365 \
      -subj '/CN=localhost' \
      -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1' \
      -keyout nginx/certs/localhost.key -out nginx/certs/localhost.crt
)
docker compose up -d --build
```

- HTTP su `http://localhost:8080` reindirizza a HTTPS su `https://localhost:8443`. Le porte 80 e 443 non vengono
  usate.
- Database e app non espongono porte. Le migrazioni si applicano all'avvio dell'app.
- Il browser mostra un avviso perché il certificato è autofirmato. Controllo da terminale:
  `curl --cacert nginx/certs/localhost.crt https://localhost:8443/healthz`.
- I certificati restano in `nginx/certs/`, fuori da Git e dall'immagine Docker.
- Build senza Compose: `docker build --build-arg ORIGIN=https://localhost:8443 .`.
- Non usare `docker compose down -v`: cancella il volume del database.

## Lingue

Le stringhe dell'interfaccia sono in `messages/it.json`, `messages/en.json` e `messages/fr.json`, con le stesse
chiavi. Un test lo verifica. La lingua si sceglie dal selettore nell'header e viene salvata in un cookie. Titoli
degli eventi, CSV e descrizioni dei log restano in italiano.

## Import dal legacy

`pnpm legacy:import -- --sqlite <calendar.db> [--dry-run]` e `pnpm legacy:verify -- --sqlite <calendar.db>` sono
disponibili e verificati in CI su un database fittizio (`pnpm legacy:fake-db`). Non fanno parte dell'avvio: la v2
parte con un database vuoto (vedi `docs/v2/CUTOVER.md`).
