# Screenshot dell'implementazione M14

Galleria dell'app SvelteKit da confrontare con le schermate approvate in `../screens/`.

- `dark/` e `light/`: una cartella per tema.
- Nome: `<larghezza>-<pagina>.png`, a 360, 768 e 1280 px; viewport alta 900 px.
- Pagine: `accesso`, `calendario`, `profilo`, `display`, `admin-settimana`, `admin-template`,
  `admin-nuovo-template`, `admin-partecipanti`, `admin-whitelist`, `admin-log`.

## Riproduzione

Le immagini provengono da `tests/e2e/design.test.ts`, esclusivamente sul database di test popolato
con il seed. Dopo una build e un seed validi, per esempio dopo `corepack pnpm ci:local`, senza altri
test o server Playwright attivi:

```sh
UPDATE_DESIGN_SCREENSHOTS=1 corepack pnpm exec playwright test tests/e2e/design.test.ts --project=chromium-shared --no-deps
```

Senza la variabile il test scrive in `test-results/` e conserva questa galleria. Il seed usa date
relative al giorno di esecuzione: contenuti, eventi conclusi e indicazione di oggi possono cambiare.

## Varianti approvate dopo i mockup

- Il calendario utenti usa tutta la larghezza disponibile, con il padding laterale del layout.
- Admin Settimane conserva in alto i quattro riquadri impostazioni e mostra sotto sette colonne
  di biglietti verticali, con scorrimento orizzontale confinato alla griglia. Su mobile i giorni
  sono impilati. Creazione e modifica avvengono nei dialog; il pulsante di ogni giorno preimposta
  il giorno anche senza JavaScript. Gli iscritti restano visibili nei biglietti.
- I messaggi compaiono in basso a destra, sopra la navigazione mobile e il footer del builder.
- Gli altri scarti di dati autorizzati sono registrati nelle note di `../../SESSIONS.md`.

## Verifiche e limiti

Per ogni pagina, tema e larghezza il test controlla l'assenza di overflow della pagina, di attributi
`style` propri dell'app, di violazioni CSP e di errori browser. La griglia può scorrere nel proprio
contenitore. I controlli vengono eseguiti anche in WebKit; gli screenshot sono prodotti in Chromium,
perché lo strumento di cattura Playwright inietta uno stile che WebKit segnala come violazione CSP.

Il test non dimostra la fedeltà al mockup: serve anche il confronto visivo. Queste immagini mostrano
il viewport iniziale, non ogni stato dei dialog o l'intera pagina. I flussi con e senza JavaScript,
i dialog e lo stato finale dell'animazione hanno test separati.

OAuth 42 reale, Safari su dispositivi fisici e il browser del TV reale restano verifiche manuali;
WebKit automatizzato non li sostituisce.
