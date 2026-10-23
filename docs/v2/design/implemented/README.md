# Screenshot dell'implementazione — design v2

Galleria dell'app SvelteKit secondo `../DESIGN-V2.md`. I PNG in `../screens/` restano il riferimento storico v1; non sono nuove esportazioni del canvas.

- `dark/` e `light/`: una cartella per tema.
- Nome: `<larghezza>-<pagina>.png`, a 360, 768 e 1280 px; viewport alta 900 px.
- Admin Settimane include anche lo screenshot a 1920 px con sette colonne senza scorrimento.
- Pagine: `accesso`, `calendario`, `profilo`, `display`, `admin-settimana`, `admin-template`,
  `admin-nuovo-template`, `admin-partecipanti`, `admin-whitelist`, `admin-log`.

## Riproduzione

Le immagini provengono da `tests/e2e/design.test.ts` e `tests/e2e/design-v2.test.ts`, esclusivamente sul database di test popolato
con il seed. Dopo una build e un seed validi, per esempio dopo `corepack pnpm ci:local`, senza altri
test o server Playwright attivi:

```sh
UPDATE_DESIGN_SCREENSHOTS=1 corepack pnpm exec playwright test tests/e2e/design.test.ts tests/e2e/design-v2.test.ts --project=chromium-shared --no-deps
```

Senza la variabile il test scrive in `test-results/` e conserva questa galleria. Il seed usa date
relative al giorno di esecuzione: contenuti, eventi conclusi e indicazione di oggi possono cambiare.

## Stati aggiuntivi della v2

- `v2-1280-calendario-compatto.png`: almeno due biglietti per colonna e cinque giorni visibili.
- `v2-1920-calendario.png`: sette giorni senza scorrimento.
- `v2-360-inizio-settimana.png`, `v2-360-durante-scorrimento.png`, `v2-360-turno-mio.png`:
  tre stati del calendario mobile; il secondo è catturato durante un gesto touch nativo di Chromium.
- `v2-1920-menu-utente.png` e `v2-360-menu-utente.png`: popover dell’avatar aperto.
- `v2-360-admin-impostazioni-chiuse.png`, `v2-360-admin-impostazioni-aperte.png` e
  `v2-1920-admin-compatto.png`: toolbar admin, sette giorni desktop e pannello richiudibile mobile.

Le schermate aggiuntive usano quattordici eventi fittizi, un login univoco per esecuzione e una data browser fissa nel 2099:
nessun dato reale, immagine 42 o credenziale viene esportato. Le immagini con il prefisso v2
sono prodotte solo con JavaScript; i test coprono gli stessi flussi anche senza JS, tramite
link ai giorni, menu popover e details nativi. I messaggi ora appaiono in alto a destra.

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
