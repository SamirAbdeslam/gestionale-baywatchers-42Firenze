# 🏊 Gestionale Baywatchers - 42 Firenze

Sistema di gestione degli eventi e delle presenze per i Baywatcher della scuola 42 Firenze.

## 📋 Descrizione del Progetto

Gestionale Baywatchers è un'applicazione web Flask che permette di:

- **Gestire eventi settimanali** (sorveglianza esami, icebreaker, rush, accoglienza, ecc.)
- **Registrare partecipanti** con sistema di slot limitati
- **Tracciare presenze** e compensi (wallet system)
- **Visualizzare il calendario** su display per gli utenti
- **Autenticazione OAuth** tramite 42 API
- **Sistema di whitelist** per controllare chi può iscriversi agli eventi
- **Template settimane** per riutilizzare configurazioni di eventi
- **Real-time updates** tramite WebSocket (SocketIO)
- **Deployment automatico** via webhook GitHub/GitLab

## 🏗️ Architettura

```
┌─────────────────────────────────────────────────────────┐
│  GitHub/GitLab                                          │
│  (Push triggers webhook)                                │
└───────────────┬─────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Tunnel                                      │
│  (Exposes app securely via HTTPS)                       │
└───────────────┬─────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│  Docker Compose Network                                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Baywatcher Container (Flask + SocketIO)         │   │
│  │  - OAuth 42 Authentication                       │   │
│  │  - Event Management                              │   │
│  │  - Real-time WebSocket Updates                   │   │
│  │  - Webhook Endpoint (/webhook)                   │   │
│  │  - SQLite Database (volume: baywatcher-data)     │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │                                        │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │  Deployer Container                              │   │
│  │  - Listens for deployment requests               │   │
│  │  - Pulls latest code from git                    │   │
│  │  - Rebuilds Docker containers                    │   │
│  │  - Access to Docker socket                       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Setup Rapido

### Prerequisiti

- Docker & Docker Compose
- Account 42 OAuth (per autenticazione)
- Cloudflare Tunnel (per esposizione pubblica)

### 1. Clone del Repository

```bash
git clone https://github.com/Bombatomica64/gestionale-baywatchers-42Firenze.git
cd gestionale-baywatchers-42Firenze
```

### 2. Configurazione Variabili d'Ambiente

```bash
cp .env.example .env
# Modifica .env con i tuoi dati
```

Variabili essenziali:
- `CLIENT_ID` e `CLIENT_SECRET`: Ottieni da https://profile.intra.42.fr/oauth/applications/new
- `SECRET_KEY`: Genera con `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- `CLOUDFLARE_TOKEN`: Token del tuo Cloudflare Tunnel
- `WEBHOOK_SECRET` (opzionale): Per sicurezza webhook

### 3. Avvio Applicazione

```bash
docker compose up -d --build
```

Verifica lo stato:
```bash
docker compose ps
docker compose logs -f baywatcher
```

### 4. Accesso

- **Applicazione**: [https://app.baywatchers42firenze.dev](https://app.baywatchers42firenze.dev)

## 📚 Documentazione

- [**WEBHOOK_SETUP.md**](WEBHOOK_SETUP.md) - Guida completa per configurare il deployment automatico

## 🔧 Funzionalità Principali

### Per Utenti
- ✅ Login con account 42
- ✅ Visualizzazione calendario eventi (4 settimane)
- ✅ Registrazione/cancellazione da eventi
- ✅ Profilo personale con storico eventi e wallet
- ✅ Sistema di compensi per eventi completati

### Per Admin
- ✅ Gestione eventi (creazione, modifica, eliminazione)
- ✅ Sistema di template per settimane ricorrenti
- ✅ Import/export CSV eventi
- ✅ Gestione whitelist baywatcher
- ✅ Tracciamento presenze (mark present/absent)
- ✅ Report partecipanti con CSV export
- ✅ Configurazione settimane attive e display
- ✅ Impostazione date pool e limiti eventi per utente

### Display Pubblico
- ✅ Visualizzazione calendario senza autenticazione
- ✅ Auto-aggiornamento quando eventi passano
- ✅ Aggiornamenti real-time via WebSocket
- ✅ Design ottimizzato per proiezione

## 🗃️ Struttura Database

- **users** - Profili utenti con wallet
- **events** - Eventi con settimana, giorno, orari, slot
- **registrations** - Iscrizioni con tracking presenze
- **week_templates** - Template riutilizzabili
- **template_events** - Eventi nei template
- **baywatcher_whitelist** - Utenti autorizzati
- **settings** - Configurazione globale (settimana attiva, display, limiti)

## 🔄 Deployment Automatico

Il sistema supporta deployment automatico tramite webhook:

1. Configura il webhook su GitHub/GitLab (vedi [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md))
2. Ogni push al repository triggera automaticamente:
   - Git pull del codice aggiornato
   - Rebuild dei container Docker
   - Restart dell'applicazione

## 🛠️ Sviluppo Locale

```bash
# Usa environment locale (senza Docker)
cp .env.example .env
# Imposta DB_DIR=./ nel .env

# Installa dipendenze
pip install -r requirements.txt

# Avvia app
python app.py
```

L'app sarà disponibile su http://localhost:5000

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:5000/health
```

### Logs
```bash
# Tutti i container
docker compose logs -f

# Solo baywatcher
docker logs -f gestionaleBaywatcher

# Solo deployer
docker logs -f webhook_listener
```

## 🔐 Sicurezza

- ✅ OAuth 42 per autenticazione
- ✅ Admin basato su campo `staff?` dell'API 42
- ✅ Content Security Policy headers
- ✅ Webhook secret per validare deploy
- ✅ HTTPS tramite Cloudflare Tunnel
- ✅ Database persistente su volume Docker

## 📝 Prossimi Sviluppi / TODO

### 🎯 Priorità Alta

- [ ] **Sistema di notifiche**
  - Notifiche email per eventi imminenti
  - Reminder 24h prima dell'evento
  - Conferma presenza via email

- [ ] **Miglioramenti al wallet system**
  - Storico transazioni dettagliato
  - Sistema di bonus per presenze consecutive

- [ ] **Dashboard analytics per admin**
  - Statistiche partecipazione per evento
  - Grafici andamento presenze
  - Export report mensili

### 🔄 Priorità Media

- [ ] **Sistema di turni automatico**
  - Auto-assegnazione equa dei turni
  - Rotazione basata su disponibilità
  - Bilanciamento ore per utente

- [ ] **Miglioramenti UI/UX**
  - Filtri eventi per tipo
  - Calendario mensile vista compatta
  - Mobile app (PWA)

- [ ] **Sistema di feedback**
### 🌟 Priorità Bassa / Nice to Have

- [ ] **Integrazione con altri sistemi 42**
  - Sincronizzazione con calendar Intra
  - Import automatico eventi dal campus
  - Integrazione con Black Hole tracker

- [ ] **Sistema di team/squadre**
  - Divisione baywatcher in team
  - Competizione tra team
  - Leaderboard

- [ ] **Backup automatico database**
  - Backup giornaliero su cloud storage
  - Sistema di restore rapido
  - Export automatico CSV

- [ ] **Testing**
  - Unit tests per funzioni critiche
  - Integration tests per workflow principali
  - Load testing per scalabilità

- [ ] **Miglioramenti tecnici**
  - Migrazione da SQLite a PostgreSQL (per scalabilità)
  - Migrazione da flask a un linguaggio serio (es. Go, Angular, React)
  - Caching con Redis
  - Rate limiting per API
  - Containerizzazione frontend separata

## 🐛 Bug Noti


## 🤝 Contribuire

1. Fork del repository
2. Crea un branch per la feature (`git checkout -b feature/AmazingFeature`)
3. Commit delle modifiche (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Apri una Pull Request

## 📄 Licenza

Vedi il file [LICENSE](LICENSE) per i dettagli.

## 👥 Autori

- **Team Baywatchers 42 Firenze**

## 🙏 Ringraziamenti

- 42 Network per l'API OAuth
- Cloudflare per il tunnel service
- Tutti i Baywatcher che testano e usano il sistema!
