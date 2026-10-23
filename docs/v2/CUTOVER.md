# Appunto per il runbook di M15

M15 non è iniziato. Questa nota registra soltanto la decisione rinviata da Ismail il 23 ottobre 2026.

## HSTS sul dominio di produzione — da decidere

HSTS non è attualmente configurato e non va aggiunto allo stack locale: il browser applica la
politica a tutto il nome host, anche su altre porte, e ne conserva la durata. La sua precedente
indicazione come header già presente nello smoke era errata.

Per il dominio di produzione, decidere in M15 se abilitarlo, con quale `max-age` ed eventuale
ambito dei sottodomini. Nessuna direttiva HSTS è implementata da questa nota.
