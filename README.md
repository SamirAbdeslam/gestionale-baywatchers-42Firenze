# Gestionale Baywatchers v2

Refactor in corso sul branch `v2.0.0`. Piano e stato dei moduli: [docs/v2/PLAN.md](docs/v2/PLAN.md). Diario: [docs/v2/SESSIONS.md](docs/v2/SESSIONS.md).

Il codice Flask originale è conservato in `legacy/`. Il bootstrap v2 contiene una landing provvisoria e `/healthz`; le funzioni applicative arrivano nei moduli successivi.

Node.js 24 e pnpm 10 tramite Corepack. Copiare `.env.example` in `.env` e impostare i valori per l'ambiente locale. Il README definitivo viene completato in M15.

Avvio locale dello stack completo: impostare in `.env` `DATABASE_URL` con host `db` e `ORIGIN=https://localhost:8443`. HTTP su `http://localhost:8080` reindirizza a HTTPS su `https://localhost:8443`. La porta 80 non viene utilizzata.

Prima del primo avvio, generare il certificato locale con OpenSSL (validità 365 giorni). Il comando protegge la chiave e non sovrascrive certificati esistenti:

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

I certificati restano locali in `nginx/certs/`, fuori da Git e dall'immagine Docker. Il browser mostra un avviso perché il certificato è autofirmato; per il controllo da terminale usare `curl --cacert nginx/certs/localhost.crt https://localhost:8443/healthz`.
