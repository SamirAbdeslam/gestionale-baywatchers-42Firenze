# Runbook di avvio v2

Passaggio dal Flask legacy all'app v2. Ismail ha deciso, il 26 ottobre 2026, che la v2 parte con un **database
vuoto**: nessun import di `calendar.db` e nessun dump. Il passaggio dei dati dal vecchio sito, se servirà, si deciderà
più avanti. Gli script `legacy:import` e `legacy:verify` restano nel repository ma non fanno parte di questo runbook.

I comandi si eseguono nella cartella del repository, sul branch `v2`.

## 1. Preparazione

1. Registrare nell'app OAuth 42 il redirect URI `<ORIGIN>/auth/callback`. Per lo stack locale è
   `https://localhost:8443/auth/callback`. È un'azione manuale nel profilo 42.
2. Creare `.env` da `.env.example` e impostare:
   - `DATABASE_URL=postgres://<utente>:<password>@db:5432/<database>`, con gli stessi valori di `POSTGRES_USER`,
     `POSTGRES_PASSWORD` e `POSTGRES_DB`. La password deve essere nuova e non quella di esempio;
   - `ORIGIN` con l'indirizzo pubblico, senza percorso;
   - `FT_CLIENT_ID` e `FT_CLIENT_SECRET` dell'app 42;
   - `AUTH_DEV_LOGIN=false`. Il login di sviluppo è accettato solo con `ORIGIN` su `localhost` o `127.0.0.1`;
   - `DISPLAY_TOKEN`, obbligatorio fuori da `localhost`/`127.0.0.1`: almeno 32 caratteri casuali,
     generati per esempio con `openssl rand -hex 32`. Solo in locale può essere vuoto; se impostato,
     richiede almeno 24 caratteri;
   - `DISPLAY_REDIRECT_URL` e `DISPLAY_REDIRECT_SECONDS`, facoltativi.

   `.env` resta fuori da Git. Non copiarne il contenuto in chat, ticket o documenti.
3. Certificato in `nginx/certs/localhost.crt` e `nginx/certs/localhost.key`. In locale usare il comando del
   `README.md`. Su un dominio pubblico usare un certificato valido con gli stessi nomi di file. In
   `nginx/nginx.conf` il redirect da HTTP punta a `https://localhost:8443`: va cambiato con l'indirizzo pubblico.

## 2. Avvio

```sh
docker compose up -d --build
docker compose ps
```

- `db` e `app` devono risultare `healthy`. Le migrazioni si applicano da sole all'avvio dell'app e creano la riga
  delle impostazioni.
- Non usare mai `docker compose down -v`: cancella il volume `pgdata` con tutti i dati.

Controlli:

```sh
curl --cacert nginx/certs/localhost.crt https://localhost:8443/healthz
curl -sI http://localhost:8080/ | head -n 1
```

Il primo deve rispondere `200`. Il secondo deve rispondere `308` verso `https://localhost:8443`.

## 3. Primo accesso e impostazioni

1. Aprire `<ORIGIN>` e accedere con 42 come `igilani`. L'utente è admin per costruzione (`ADMIN_LOGINS` in
   `src/lib/server/admins.ts`).
2. In **Admin → Settimane** impostare:
   - le date del pool;
   - la settimana attiva;
   - la settimana del display;
   - il limite di turni per persona.
3. In **Admin → Whitelist** aggiungere i login dei baywatcher.
4. Creare gli eventi della settimana, a mano o da **Admin → Template**: builder oppure import CSV.
5. Aprire `/display`, con `?token=<DISPLAY_TOKEN>` se il token è impostato, e verificare la TV.
   Il display usa la lingua del browser della TV e non ha il selettore. Se esce in un'altra lingua, aprire una
   volta sulla TV `<ORIGIN>/language/it?to=/display`, aggiungendo `?token=…` al percorso se serve: il cookie fissa
   l'italiano.

## 4. Spegnimento del legacy

1. Avvisare gli utenti del cambio di indirizzo, se cambia.
2. Fermare il processo Flask.
3. Conservare `calendar.db` del legacy fuori dal repository, senza cancellarlo.
4. Il codice Flask è stato rimosso dal repository con la conferma di Ismail del 27 ottobre 2026; resta disponibile nella storia Git.

## 5. Ritorno indietro

Se la v2 non va, eseguire `docker compose stop`. Per riavviare Flask, recuperare il codice dalla storia Git
(per esempio dal tag `v1.5.24`) in una cartella separata e usare il `calendar.db` conservato fuori dal repository.
Il ritorno indietro non dipende da una cartella presente nel checkout corrente. I dati inseriti nella v2
restano nel volume `pgdata`.

## HSTS sul dominio di produzione — da decidere

HSTS non è attualmente configurato e non va aggiunto allo stack locale: il browser applica la
politica a tutto il nome host, anche su altre porte, e ne conserva la durata. La sua precedente
indicazione come header già presente nello smoke era errata.

Per il dominio di produzione, Ismail decide se abilitarlo, con quale `max-age` ed eventuale
ambito dei sottodomini. Nessuna direttiva HSTS è implementata.
