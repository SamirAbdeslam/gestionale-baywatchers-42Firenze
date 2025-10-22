from flask import Flask, render_template, request, redirect, url_for, session, make_response, flash, g, jsonify
from icalendar import Calendar, Event, Alarm
import sqlite3
import os
import csv
import io
import json
import time
import logging
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from datetime import datetime, timedelta
from functools import wraps
from flask_socketio import SocketIO, emit 

# -------------------------------
# Helper Functions
# -------------------------------

def capitalize_event_title(title):
    """Capitalizza la prima lettera del titolo evento"""
    if not title:
        return title
    return title[0].upper() + title[1:] if len(title) > 0 else title

def format_event_date(event_date):
    """Formatta la data in italiano (es: 15 Ott)"""
    if not event_date:
        return ""
    
    months_it = {
        1: 'Gen', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'Mag', 6: 'Giu',
        7: 'Lug', 8: 'Ago', 9: 'Set', 10: 'Ott', 11: 'Nov', 12: 'Dic'
    }
    
    try:
        date_obj = datetime.strptime(event_date, '%Y-%m-%d')
        return f"{date_obj.day} {months_it[date_obj.month]}"
    except:
        return event_date

def compute_week_day_dates(pool_start_str, week_number):
    """Given a pool start YYYY-MM-DD and a week number (1..4), return a dict mapping
    Italian weekday names to YYYY-MM-DD for that week.
    If pool_start_str is None or invalid, return empty dict.
    """
    days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
    if not pool_start_str:
        return {}
    try:
        start = datetime.strptime(pool_start_str, '%Y-%m-%d')
        # week_number is 1-based
        week_offset = max(0, int(week_number) - 1)
        week_start = start + timedelta(days=7 * week_offset)
        mapping = {}
        for i, day in enumerate(days):
            d = week_start + timedelta(days=i)
            mapping[day] = d.strftime('%Y-%m-%d')
        return mapping
    except Exception:
        return {}

def is_event_passed(event_date, end_time):
    """Controlla se un evento è già passato usando la data completa"""
    # Se non c'è una data, non bloccare (per retrocompatibilità)
    if not event_date:
        return False
    
    try:
        now = datetime.now()
        
        # Parse della data evento (formato YYYY-MM-DD)
        event_date_obj = datetime.strptime(event_date, '%Y-%m-%d')
        
        # Parse dell'orario di fine
        end_h, end_m = map(int, end_time.split(':'))
        
        # Crea datetime completo dell'evento
        event_end = event_date_obj.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
        
        # Ritorna True se l'evento è passato
        return now > event_end
    except:
        return False

def auto_update_display_week():
    """
    Aggiorna automaticamente display_week basandosi sulla logica:
    - Se tutti gli eventi della settimana corrente del display sono passati, 
      passa alla settimana successiva (se esiste e ha eventi)
    - Questo permette la transizione automatica tra settimane
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        # Ottieni display_week corrente
        c.execute("SELECT value FROM settings WHERE key = 'display_week'")
        display_week_row = c.fetchone()
        if not display_week_row:
            return
        display_week = int(display_week_row[0])
        
        # Ottieni pool_start per calcolare le date
        c.execute("SELECT value FROM settings WHERE key = 'pool_start'")
        pool_start_row = c.fetchone()
        if not pool_start_row:
            return
        pool_start = pool_start_row[0]
        
        # Ottieni tutti gli eventi della settimana corrente del display
        c.execute("SELECT id, day, start_time, end_time, event_date FROM events WHERE week = ?", (display_week,))
        events = c.fetchall()
        
        if not events:
            # Nessun evento, prova con la settimana successiva
            if display_week < 4:
                c.execute("UPDATE settings SET value = ? WHERE key = 'display_week'", (str(display_week + 1),))
                conn.commit()
            return
        
        # Calcola le date per questa settimana
        day_dates = compute_week_day_dates(pool_start, display_week)
        
        # Controlla se tutti gli eventi sono passati
        all_passed = True
        for event in events:
            event_id, day, start_time, end_time, event_date = event
            
            # Usa event_date se disponibile, altrimenti calcola da day_dates
            concrete_date = event_date if event_date else day_dates.get(day)
            
            if concrete_date and not is_event_passed(concrete_date, end_time):
                all_passed = False
                break
        
        # Se tutti gli eventi sono passati, passa alla settimana successiva
        if all_passed and display_week < 4:
            new_display_week = display_week + 1
            
            # Verifica che la nuova settimana abbia eventi
            c.execute("SELECT COUNT(*) FROM events WHERE week = ?", (new_display_week,))
            count = c.fetchone()[0]
            
            if count > 0:
                c.execute("UPDATE settings SET value = ? WHERE key = 'display_week'", (str(new_display_week),))
                conn.commit()
                app.logger.info(f"Display automaticamente aggiornato da Week {display_week} a Week {new_display_week}")
    
    except Exception as e:
        app.logger.warning(f"Errore nell'aggiornamento automatico display_week: {e}")
    finally:
        conn.close()

def emit_event_update(event_id, action='update'):
    """Emetti aggiornamento WebSocket per un evento specifico"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Ottieni dettagli evento aggiornati
        c.execute("""
            SELECT id, title, description, day, start_time, end_time, max_slots, registered, compensation, week
            FROM events WHERE id = ?
        """, (event_id,))
        event = c.fetchone()
        
        if event:
            # Ottieni partecipanti
            c.execute("SELECT participant_name FROM registrations WHERE event_id = ? ORDER BY registration_date", 
                     (event_id,))
            participants = [p[0] for p in c.fetchall()]
            
            event_data = {
                'id': event[0],
                'title': event[1],
                'description': event[2],
                'day': event[3],
                'start_time': event[4],
                'end_time': event[5],
                'max_slots': event[6],
                'registered': event[7],
                'compensation': event[8],
                'week': event[9],
                'participants': participants,
                'action': action  # 'update', 'delete', 'create'
            }
            
            # In Flask-SocketIO, broadcast è il comportamento di default
            # Non serve specificare broadcast=True
            socketio.emit('event_update', event_data)
        
        conn.close()
    except Exception as e:
        app.logger.error(f"Error emitting event update: {e}")

# Carica variabili d'ambiente
# Usa ENV_FILE se specificato, altrimenti .env
env_file = os.getenv('ENV_FILE', '.env')
load_dotenv(env_file)

# Configurazione del logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Silenzia i log di engineio e socketio che sono troppo verbosi di default
logging.getLogger('socketio').setLevel(logging.WARNING)
logging.getLogger('engineio').setLevel(logging.WARNING)

# Inizializzazione Flask App
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-secret-key-change-this')

# Initialize SocketIO for real-time updates
# In produzione, specifica il dominio esatto invece di "*"
# Esempio: cors_allowed_origins="https://tuodominio.com"
cors_origins = os.getenv('CORS_ORIGINS', '*')  # In dev usa "*", in prod specifica il dominio
socketio = SocketIO(app, 
                    cors_allowed_origins=cors_origins,
                    async_mode='threading',  # Importante per Gunicorn/production
                    logger=False,            # Usiamo il logger di Flask
                    engineio_logger=False)   # Usiamo il logger di Flask

# Force HTTPS in URL generation for production (behind Cloudflare)
app.config['PREFERRED_URL_SCHEME'] = 'https'

# -------------------------------
# Filtro Jinja per classi CSS eventi
# -------------------------------
@app.template_filter('event_type_class')
def event_type_class(title):
    """Determina la classe CSS basata sul titolo dell'evento"""
    title_lower = title.lower()
    
    # Sorveglianza esami
    if 'esam' in title_lower or 'sorveglianza' in title_lower:
        return 'event-type-esame'
    
    # Icebreaker
    elif 'icebreaker' in title_lower:
        return 'event-type-icebreaker'
    
    # Correzioni rush
    elif 'rush' in title_lower or 'correzion' in title_lower:
        return 'event-type-rush'
    
    # Presenza cluster
    elif 'cluster' in title_lower or 'presenza' in title_lower:
        return 'event-type-cluster'
    
    # Accoglienza
    elif 'accoglienza' in title_lower:
        return 'event-type-accoglienza'
    
    # Default: evento personalizzato (colore intra)
    else:
        return 'event-type-custom'

# Filtro Jinja per formattare la data evento
app.jinja_env.filters['format_event_date'] = format_event_date

# Database path - uses volume for persistence in Docker
DB_DIR = os.getenv('DB_DIR', '/app/calendar_data')
os.makedirs(DB_DIR, exist_ok=True)

app.logger.info(f"📁 Ambiente caricato da: {env_file}")
app.logger.info(f"📦 Directory database: {DB_DIR}")

# -------------------------------
# Request Timing and Logging
# -------------------------------
@app.before_request
def before_request_timing():
    g.start_time = time.time()

DB_PATH = os.path.join(DB_DIR, "calendar.db")

# Configurazione OAuth 42
oauth = OAuth(app)
oauth.register(
    name='fortytwo',
    client_id=os.getenv('CLIENT_ID'),
    client_secret=os.getenv('CLIENT_SECRET'),
    access_token_url=os.getenv('OAUTH_TOKEN_URL'),
    authorize_url=os.getenv('OAUTH_AUTHORIZE_URL'),
    api_base_url=os.getenv('OAUTH_API_BASE_URL'),
    client_kwargs={'scope': 'public'}
)

# -------------------------------
# Content Security Policy
# -------------------------------
@app.after_request
def after_request_timing(response):
    if 'start_time' in g:
        duration = time.time() - g.start_time
        app.logger.info(
            f"Request: {request.method} {request.path} | Status: {response.status_code} | Duration: {duration:.4f}s"
        )
    return response

@app.after_request
def set_csp(response):
    """Set Content Security Policy headers"""
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://api.intra.42.fr; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "font-src 'self' https://cdn.jsdelivr.net; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://api.intra.42.fr; "
        "frame-ancestors 'none'; "
    )
    response.headers['Content-Security-Policy'] = csp
    return response

# ------------------------------- 
# Logging
# -------------------------------
def _log_action_db(c, user_id, username, action_type, description=None,
               resource_id=None, resource_type=None, 
               old_value=None, new_value=None):
    """
    Funzione interna per inserire un log nel database usando un cursore esistente.
    NON esegue il commit.
    
    Restituisce l'ID del log inserito.
    action_type: tipo azione (es: 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT')
    description: descrizione leggibile (es: 'Creato nuovo evento')
    resource_id: ID della risorsa modificata
    resource_type: tipo risorsa (es: 'event', 'user', 'booking')
    old_value/new_value: valori prima/dopo (opzionale, per tracking modifiche)
    """
    try:
        timestamp = datetime.now()
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
        user_agent = request.headers.get('User-Agent', '')[:200]  # Limita lunghezza
        
        c.execute(
            '''
            INSERT INTO action_logs 
            (timestamp, user_id, username, action_type, action_description,
             ip_address, user_agent, resource_id, resource_type, old_value, new_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                timestamp, user_id, username, action_type, description,
                ip_address, user_agent, resource_id, resource_type,
                old_value, new_value
            )
        )
        return c.lastrowid
    except Exception as e:
        app.logger.error(f"Errore nel logging: {e}")
        return None

def log_action(user_id, username, action_type, description=None,
               resource_id=None, resource_type=None, 
               old_value=None, new_value=None, cursor=None):
    """
    Logga un'azione. Se viene passato un cursore, usa quello.
    Altrimenti, apre una nuova connessione.
    """
    if cursor:
        return _log_action_db(cursor, user_id, username, action_type, description, resource_id, resource_type, old_value, new_value)
    else:
        log_id = None
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            log_id = _log_action_db(c, user_id, username, action_type, description, resource_id, resource_type, old_value, new_value)
            conn.commit()
        except Exception as e:
            app.logger.error(f"Errore nel logging con nuova connessione: {e}")
        finally:
            if conn:
                conn.close()
        
        if log_id:
            emit_log_update(log_id)
        return log_id

def emit_log_update(log_id):
    """Recupera un log dal DB e lo emette via Socket.IO."""
    if not log_id:
        return
    try:
        read_conn = sqlite3.connect(DB_PATH)
        read_conn.row_factory = sqlite3.Row
        read_c = read_conn.cursor()
        read_c.execute("SELECT * FROM action_logs WHERE id = ?", (log_id,))
        new_log_row = read_c.fetchone()
        read_conn.close()
        if new_log_row:
            socketio.emit('new_log', dict(new_log_row))
    except Exception as e:
        app.logger.error(f"Errore durante l'emissione del log Socket.IO: {e}")

# -------------------------------
# Admin Configuration
# -------------------------------
# Whitelist di login che sono sempre admin (per testing)
# Nella versione finale: rimuovi questa lista e usa solo staff? = True
ADMIN_WHITELIST = ['igilani']  # Aggiungi qui i login che devono essere admin

def is_user_admin(user_info):
    """
    Determina se un utente è admin basandosi su:
    1. Whitelist manuale (per testing)
    2. Campo staff? dall'API 42 (versione finale)
    """
    login = user_info.get('login', '')
    is_staff = user_info.get('staff?', False)
    
    # Controlla whitelist o staff
    return login in ADMIN_WHITELIST or is_staff

# -------------------------------
# Database setup
# -------------------------------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Tabella utenti
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intra_id INTEGER UNIQUE NOT NULL,
            login TEXT UNIQUE NOT NULL,
            email TEXT,
            display_name TEXT,
            image_url TEXT,
            wallet INTEGER DEFAULT 0,
            is_admin BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Tabella eventi
    c.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            day TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            max_slots INTEGER DEFAULT 10,
            registered INTEGER DEFAULT 0,
            compensation INTEGER DEFAULT 0,
            week INTEGER DEFAULT 1
        )
    ''')
    
    # Tabella per gestire la settimana attiva
    c.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    
    # Imposta settimana attiva di default
    c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('active_week', '1')")
    
    # Imposta settimana da mostrare nel display (default = settimana attiva)
    c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('display_week', '1')")
    
    # Imposta numero massimo di eventi per utente (0 = illimitato)
    c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('max_events_per_user', '0')")
    
    # Tabella registrazioni
    c.execute('''
        CREATE TABLE IF NOT EXISTS registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            participant_name TEXT NOT NULL,
            registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id)
        )
    ''')
    
    # Tabella template settimane
    c.execute('''
        CREATE TABLE IF NOT EXISTS week_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            target_week INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Tabella eventi nei template
    c.execute('''
        CREATE TABLE IF NOT EXISTS template_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            day TEXT NOT NULL,
            event_date DATE,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            max_slots INTEGER DEFAULT 10,
            compensation INTEGER DEFAULT 0,
            FOREIGN KEY (template_id) REFERENCES week_templates(id) ON DELETE CASCADE
        )
    ''')
    
    # Tabella whitelist baywatcher (utenti autorizzati a iscriversi)
    c.execute('''
        CREATE TABLE IF NOT EXISTS baywatcher_whitelist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intra_login TEXT UNIQUE NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Tabella per i log delle azioni
    c.execute('''
        CREATE TABLE IF NOT EXISTS action_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            action_type TEXT NOT NULL,
            action_description TEXT,
            ip_address TEXT,
            user_agent TEXT,
            resource_id TEXT,
            resource_type TEXT,
            old_value TEXT,
            new_value TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    # Indice per velocizzare le query per data
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp 
        ON action_logs(timestamp DESC)
    ''')
    
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_logs_user 
        ON action_logs(user_id)
    ''')
    
    # Migrazione: aggiungi colonna week se non esiste
    try:
        c.execute("ALTER TABLE events ADD COLUMN week INTEGER DEFAULT 1")
    except sqlite3.OperationalError:
        pass  # La colonna esiste già
    
    # Migrazione: aggiungi colonna event_date se non esiste
    try:
        c.execute("ALTER TABLE events ADD COLUMN event_date DATE")
    except sqlite3.OperationalError:
        pass  # La colonna esiste già
    
    # Migrazione: aggiungi colonna wallet se non esiste
    try:
        c.execute("ALTER TABLE users ADD COLUMN wallet INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # La colonna esiste già
    
    # Migrazione: aggiungi colonna attended per tracciare la presenza
    try:
        c.execute("ALTER TABLE registrations ADD COLUMN attended BOOLEAN DEFAULT 1")
    except sqlite3.OperationalError:
        pass  # La colonna esiste già
    
    conn.commit()
    conn.close()

init_db()

# -------------------------------
# Decorators
# -------------------------------
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('login'))
        if not session.get('user', {}).get('is_admin', False):
            return redirect(url_for('home'))
        return f(*args, **kwargs)
    return decorated_function

# -------------------------------
# Routes OAuth
# -------------------------------

@app.route('/health')
def health_check():
    """Health check endpoint for Docker and monitoring"""
    try:
        # Check database connection
        conn = sqlite3.connect(DB_PATH)
        conn.execute("SELECT 1")
        conn.close()
        return {'status': 'healthy', 'database': 'connected'}, 200
    except Exception as e:
        return {'status': 'unhealthy', 'error': str(e)}, 503

@app.route('/')
def index():
    # Landing page pubblica
    if 'user' in session:
        return redirect(url_for('home'))
    return render_template('index.html')

@app.route('/login')
def login():
    # Usa HTTP in locale (DB_DIR=./), HTTPS in produzione
    scheme = 'http' if os.getenv('DB_DIR', '/app/calendar_data') == './' else 'https'
    redirect_uri = url_for('authorize', _external=True, _scheme=scheme)
    app.logger.info(f"OAuth redirect URI: {redirect_uri}")
    return oauth.fortytwo.authorize_redirect(redirect_uri)

@app.route('/callback')
def authorize():
    try:
        token = oauth.fortytwo.authorize_access_token()
        resp = oauth.fortytwo.get('me', token=token)
        user_info = resp.json()
        
        # Determina se l'utente è admin (staff o whitelist)
        is_admin = is_user_admin(user_info)
        
        # Salva o aggiorna utente nel database
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Controlla se l'utente esiste già
        c.execute("SELECT id FROM users WHERE intra_id = ?", (user_info['id'],))
        existing_user = c.fetchone()
        
        if existing_user:
            # Utente esistente: aggiorna tutti i dati incluso is_admin
            c.execute("""
                UPDATE users 
                SET login = ?, email = ?, display_name = ?, image_url = ?, wallet = ?, is_admin = ?
                WHERE intra_id = ?
            """, (
                user_info['login'],
                user_info.get('email', ''),
                user_info.get('displayname', user_info['login']),
                user_info.get('image', {}).get('link', ''),
                user_info.get('wallet', 0),
                1 if is_admin else 0,
                user_info['id']
            ))
        else:
            # Nuovo utente: crea con is_admin basato su staff/whitelist
            c.execute("""
                INSERT INTO users (intra_id, login, email, display_name, image_url, wallet, is_admin)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                user_info['id'],
                user_info['login'],
                user_info.get('email', ''),
                user_info.get('displayname', user_info['login']),
                user_info.get('image', {}).get('link', ''),
                user_info.get('wallet', 0),
                1 if is_admin else 0
            ))
        
        conn.commit()
        conn.close()
        
        # Salva in sessione
        session['user'] = {
            'id': user_info['id'],
            'login': user_info['login'],
            'display_name': user_info.get('displayname', user_info['login']),
            'email': user_info.get('email', ''),
            'image_url': user_info.get('image', {}).get('link', ''),
            'wallet': user_info.get('wallet', 0),
            'is_admin': bool(is_admin)
        }
        
        return redirect(url_for('home'))
    except Exception as e:
        app.logger.error(f"OAuth Error: {e}")
        return redirect(url_for('login'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

# -------------------------------
# Routes
# -------------------------------

@app.route('/calendar')
@login_required
def home():
    # Mostra calendario per utenti (settimana attiva o precedenti se specificate)
    # Parametro opzionale: week (permette di navigare le settimane <= active_week)
    requested_week = request.args.get('week', type=int)
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni settimana attiva
    c.execute("SELECT value FROM settings WHERE key = 'active_week'")
    active_week = int(c.fetchone()[0])
    
    # Determina quale settimana visualizzare
    # Se non specificata, mostra la settimana attiva
    # Se specificata, permetti solo settimane <= active_week (non puoi vedere il futuro)
    if requested_week is None:
        current_week = active_week
    else:
        # Limita la navigazione: min 1, max active_week
        current_week = max(1, min(requested_week, active_week))
    
    # Prendi solo eventi della settimana corrente (includi event_date)
    c.execute("SELECT * FROM events WHERE week = ?", (current_week,))
    events = c.fetchall()
    
    # Prendi i partecipanti per ogni evento
    events_with_participants = []
    for event in events:
        c.execute("SELECT participant_name, registration_date, attended FROM registrations WHERE event_id = ? ORDER BY registration_date", (event[0],))
        participants_raw = c.fetchall()  # list of tuples (name, registration_date, attended)

        # Build lists: all participant names and only the 'visible' ones (attended==1)
        participants_all = [p[0] for p in participants_raw]
        participants_visible = [p[0] for p in participants_raw if (p[2] == 1 or p[2] == '1' or p[2] is True)]

        # compute visible registered count (only attended==1)
        attended_count = len(participants_visible)

        # determine if current session user is registered for this event (any registration regardless of attended)
        is_user_reg = False
        try:
            current_login = session.get('user', {}).get('login')
            if current_login and current_login in participants_all:
                is_user_reg = True
        except Exception:
            is_user_reg = False

        events_with_participants.append({
            'id': event[0],
            'title': event[1],
            'description': event[2],
            'day': event[3],
            'event_date': event[10] if len(event) > 10 else None,
            'start_time': event[4],
            'end_time': event[5],
            'max_slots': event[6],
            'registered': attended_count,
            'compensation': event[8] if len(event) > 8 else 0,
            'week': event[9] if len(event) > 9 else 1,
            # raw tuples for admin view
            'participants_raw': participants_raw,
            # convenience lists
            'participants_all': participants_all,
            'participants_visible': participants_visible,
            'is_user_registered': is_user_reg
        })
    
    # Load pool start from settings and compute day dates for the current week
    c = sqlite3.connect(DB_PATH).cursor()
    # reopen a connection to read settings
    conn2 = sqlite3.connect(DB_PATH)
    c2 = conn2.cursor()
    c2.execute("SELECT value FROM settings WHERE key = 'pool_start'")
    pool_start_row = c2.fetchone()
    pool_start = pool_start_row[0] if pool_start_row else None
    # Compute day dates for the week being viewed
    day_dates = compute_week_day_dates(pool_start, current_week)
    conn2.close()
    conn.close()
    
    # Organizza eventi per giorno e ordina per orario
    days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì']
    calendar_grid = {day: [] for day in days}
    
    for event in events_with_participants:
        if event['day'] in calendar_grid:
            calendar_grid[event['day']].append(event)

    # Calcola per ogni evento la data concreta (event_date o derivata dal pool) e se l'evento è passato
    for day, ev_list in calendar_grid.items():
        for ev in ev_list:
            concrete_date = ev.get('event_date')
            if not concrete_date:
                concrete_date = day_dates.get(ev.get('day'))
            ev['concrete_date'] = concrete_date
            ev['is_passed'] = is_event_passed(concrete_date, ev.get('end_time'))
    
    # Ordina gli eventi per orario di inizio (formato 24h)
    for day in days:
        calendar_grid[day].sort(key=lambda x: x['start_time'])
    
    return render_template("calendar.html", calendar_grid=calendar_grid, days=days, active_week=active_week, current_week=current_week, day_dates=day_dates)

@app.route('/display')
def display_calendar():
    """
    Pagina di visualizzazione pubblica per proiezione su schermo.
    Mostra la settimana configurata per il display (che può essere diversa dalla settimana attiva).
    Accessibile senza autenticazione.
    """
    # Prima aggiorna automaticamente display_week se necessario
    auto_update_display_week()
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni settimana attiva (per le registrazioni)
    c.execute("SELECT value FROM settings WHERE key = 'active_week'")
    active_week = int(c.fetchone()[0])
    
    # Ottieni settimana da mostrare nel display (ora aggiornata automaticamente)
    c.execute("SELECT value FROM settings WHERE key = 'display_week'")
    display_week_row = c.fetchone()
    display_week = int(display_week_row[0]) if display_week_row else active_week
    
    # Prendi solo eventi della settimana da visualizzare
    c.execute("SELECT * FROM events WHERE week = ?", (display_week,))
    events = c.fetchall()
    
    # Prendi i partecipanti per ogni evento
    events_with_participants = []
    for event in events:
        c.execute("SELECT participant_name, registration_date, attended FROM registrations WHERE event_id = ? ORDER BY registration_date", (event[0],))
        participants_raw = c.fetchall()
        
        # Build lists: only visible participants (attended==1)
        participants_visible = [p[0] for p in participants_raw if (p[2] == 1 or p[2] == '1' or p[2] is True)]
        attended_count = len(participants_visible)

        events_with_participants.append({
            'id': event[0],
            'title': event[1],
            'description': event[2],
            'day': event[3],
            'event_date': event[10] if len(event) > 10 else None,
            'start_time': event[4],
            'end_time': event[5],
            'max_slots': event[6],
            'registered': attended_count,
            'compensation': event[8] if len(event) > 8 else 0,
            'week': event[9] if len(event) > 9 else 1,
            'participants_visible': participants_visible
        })
    
    # Load pool start and compute day dates
    c.execute("SELECT value FROM settings WHERE key = 'pool_start'")
    pool_start_row = c.fetchone()
    pool_start = pool_start_row[0] if pool_start_row else None
    day_dates = compute_week_day_dates(pool_start, display_week)
    conn.close()
    
    # Organizza eventi per giorno e ordina per orario
    days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì']
    calendar_grid = {day: [] for day in days}
    
    for event in events_with_participants:
        if event['day'] in calendar_grid:
            calendar_grid[event['day']].append(event)

    # Calcola per ogni evento se è passato
    for day, ev_list in calendar_grid.items():
        for ev in ev_list:
            concrete_date = ev.get('event_date')
            if not concrete_date:
                concrete_date = day_dates.get(ev.get('day'))
            ev['concrete_date'] = concrete_date
            ev['is_passed'] = is_event_passed(concrete_date, ev.get('end_time'))
            # Calcola disponibilità
            ev['available_slots'] = ev['max_slots'] - ev['registered']
            ev['is_available'] = ev['available_slots'] > 0 and not ev['is_passed']
    
    # Ordina gli eventi per orario di inizio
    for day in days:
        calendar_grid[day].sort(key=lambda x: x['start_time'])
    
    return render_template("display.html", calendar_grid=calendar_grid, days=days, 
                         display_week=display_week, active_week=active_week, day_dates=day_dates)

@app.route('/admin')
@admin_required
def admin_panel():
    # Pagina admin per aggiungere eventi - mostra settimana selezionata
    week = request.args.get('week', type=int)
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni settimana attiva
    c.execute("SELECT value FROM settings WHERE key = 'active_week'")
    active_week = int(c.fetchone()[0])
    
    # Ottieni settimana display
    c.execute("SELECT value FROM settings WHERE key = 'display_week'")
    display_week_row = c.fetchone()
    display_week = int(display_week_row[0]) if display_week_row else active_week
    
    # Ottieni numero massimo di eventi per utente
    c.execute("SELECT value FROM settings WHERE key = 'max_events_per_user'")
    max_events_result = c.fetchone()
    max_events_per_user = int(max_events_result[0]) if max_events_result else 0
    
    # Se non specificata, mostra settimana attiva
    if week is None:
        week = active_week
    
    c.execute("""SELECT * FROM events WHERE week = ? ORDER BY CASE day 
        WHEN 'Lunedì' THEN 1 
        WHEN 'Martedì' THEN 2 
        WHEN 'Mercoledì' THEN 3 
        WHEN 'Giovedì' THEN 4 
        WHEN 'Venerdì' THEN 5 
        END, start_time""", (week,))
    events = c.fetchall()
    
    # Prendi i partecipanti per ogni evento CON stato di presenza
    events_with_participants = []
    for event in events:
        c.execute("SELECT participant_name, registration_date, attended FROM registrations WHERE event_id = ? ORDER BY registration_date", (event[0],))
        participants_raw = c.fetchall()
        participants_all = [p[0] for p in participants_raw]
        participants_visible = [p[0] for p in participants_raw if (p[2] == 1 or p[2] == '1' or p[2] is True)]

        # registered (admin view uses stored registered, but keep attended-based count as well)
        attended_count = len(participants_visible)

        events_with_participants.append({
            'id': event[0],
            'title': event[1],
            'description': event[2],
            'day': event[3],
            'event_date': event[10] if len(event) > 10 else None,
            'start_time': event[4],
            'end_time': event[5],
            'max_slots': event[6],
            'registered': event[7],
            'registered_visible': attended_count,
            'compensation': event[8] if len(event) > 8 else 0,
            'week': event[9] if len(event) > 9 else 1,
            'participants_raw': participants_raw,
            'participants_all': participants_all,
            'participants_visible': participants_visible
        })
    
    # Organizza eventi per giorno
    days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
    events_by_day = {day: [] for day in days}
    
    for event in events_with_participants:
        if event['day'] in events_by_day:
            events_by_day[event['day']].append(event)
    
    # Carica i template di settimana
    c.execute("""
        SELECT wt.id, wt.name, wt.description, wt.target_week, wt.created_at, 
               COUNT(te.id) as event_count
        FROM week_templates wt
        LEFT JOIN template_events te ON wt.id = te.template_id
        GROUP BY wt.id
        ORDER BY wt.created_at DESC
    """)
    templates_raw = c.fetchall()
    templates = []
    for t in templates_raw:
        templates.append({
            'id': t[0],
            'name': t[1],
            'description': t[2],
            'target_week': t[3],
            'created_at': t[4],
            'event_count': t[5]
        })
    
    # Carica whitelist baywatcher
    c.execute("SELECT id, intra_login, added_at FROM baywatcher_whitelist ORDER BY intra_login")
    whitelist_raw = c.fetchall()
    whitelist = [{'id': w[0], 'login': w[1], 'added_at': w[2]} for w in whitelist_raw]
    
    # Load pool start for admin view to show dates
    c.execute("SELECT value FROM settings WHERE key = 'pool_start'")
    pool_start_row = c.fetchone()
    pool_start = pool_start_row[0] if pool_start_row else None
    c.execute("SELECT value FROM settings WHERE key = 'pool_end'")
    pool_end_row = c.fetchone()
    pool_end = pool_end_row[0] if pool_end_row else None
    day_dates = compute_week_day_dates(pool_start, week)

    conn.close()
    return render_template("admin.html", events=events_with_participants, events_by_day=events_by_day, current_week=week, active_week=active_week, display_week=display_week, max_events_per_user=max_events_per_user, templates=templates, whitelist=whitelist, day_dates=day_dates, pool_start=pool_start, pool_end=pool_end)


@app.route('/admin/set_pool_dates', methods=['POST'])
@admin_required
def set_pool_dates():
    """Admin sets global pool_start and pool_end (YYYY-MM-DD). We store only pool_start for deriving weeks; pool_end stored for reference."""
    pool_start = request.form.get('pool_start', '').strip() or None
    pool_end = request.form.get('pool_end', '').strip() or None
    # If pool_end not provided, infer 4 full weeks from pool_start
    if pool_start and not pool_end: 
        start_dt = datetime.strptime(pool_start, '%Y-%m-%d')
        pool_end_dt = start_dt + timedelta(days=27)  # 4 weeks (0-based)
        pool_end = pool_end_dt.strftime('%Y-%m-%d')
    
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        if pool_start:
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('pool_start', ?)", (pool_start,))
        if pool_end:
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('pool_end', ?)", (pool_end,))
    
        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='UPDATE_SETTING',
            description=f"Date pool impostate. Inizio: {pool_start}, Fine: {pool_end}",
            resource_type='setting',
            cursor=c
        )
        conn.commit()
        if log_id:
            emit_log_update(log_id)
    finally:
        if conn:
            conn.close()
            
    flash('Date pool salvate con successo', 'success')
    return redirect(url_for('admin_panel'))

@app.route('/set_active_week/<int:week>', methods=['POST'])
@admin_required
def set_active_week(week):
    if 1 <= week <= 4:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE settings SET value = ? WHERE key = 'active_week'", (str(week),))

        # Log action
        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='ACTIVATE_WEEK',
            description=f"Settimana {week} attivata",
            resource_id=str(week),
            cursor=c
        )
        conn.commit()
        conn.close()

        if log_id:
            emit_log_update(log_id)

        # Notifica tutti i client del cambio di settimana attiva
        socketio.emit('week_activated', {
            'week': week,
            'message': f'Week {week} è stata attivata!'
        })
    return redirect(url_for('admin_panel'))

@app.route('/set_max_events_per_user', methods=['POST'])
@admin_required
def set_max_events_per_user():
    max_events = request.form.get('max_events', type=int, default=0)
    if max_events >= 0:  # 0 = illimitato
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE settings SET value = ? WHERE key = 'max_events_per_user'", (str(max_events),))

        # Log action
        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='UPDATE_SETTING',
            description=f"Impostato il numero massimo di eventi per utente a {max_events}",
            resource_type='setting',
            cursor=c
        )
        conn.commit()
        conn.close()

        if log_id:
            emit_log_update(log_id)
    return redirect(url_for('admin_panel'))

@app.route('/add_event', methods=['POST'])
def add_event():
    event_type = request.form['event_type']
    day = request.form['day']
    # Per ora non usiamo event_date per eventi singoli: usera' la data globale pool_start + week mapping
    event_date = request.form.get('event_date', '').strip() or None
    start_time = request.form.get('start_time', '').strip()
    end_time = request.form.get('end_time', '').strip()
    max_slots = request.form['max_slots']
    week = int(request.form.get('week', 1))
    # NOTE: We accept empty event_date and will compute concrete dates from pool_start when needed.
    
    # Validazione orari - devono essere nel formato HH:MM e non vuoti
    if not start_time or not end_time or ':' not in start_time or ':' not in end_time:
        flash('Gli orari di inizio e fine sono obbligatori e devono essere nel formato corretto', 'danger')
        return redirect(url_for('admin_panel', week=week))
    
    # Eventi predefiniti con compensi
    event_types = {
        'icebreaker': {'title': 'Icebreaker', 'compensation': 150, 'description': 'Evento sociale o icebreaker'},
        'sorveglianza': {'title': 'Sorveglianza esami (2 ore)', 'compensation': 200, 'description': 'Sorveglianza durante gli esami'},
        'correzioni': {'title': 'Correzioni rush', 'compensation': 300, 'description': 'Correzione veloce di compiti o esami'},
        'cluster': {'title': 'Presenza cluster', 'compensation': 100, 'description': 'Presenza al cluster per assistenza'},
        'accoglienza': {'title': 'Accoglienza primo giorno', 'compensation': 300, 'description': 'Accoglienza studenti il primo giorno'}
    }
    
    # Gestisci evento personalizzato
    if event_type == 'custom':
        title = request.form.get('custom_title', '').strip()
        compensation = int(request.form.get('custom_compensation', 0))
        description = request.form.get('custom_description', '').strip()
        
        if not title or compensation < 0:
            return redirect(url_for('admin_panel'))
        
        event_info = {
            'title': capitalize_event_title(title),
            'compensation': compensation,
            'description': capitalize_event_title(description) if description else 'Evento personalizzato'
        }
    else:
        event_info = event_types.get(event_type)
        if not event_info:
            return redirect(url_for('admin_panel'))

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "INSERT INTO events (title, description, day, start_time, end_time, max_slots, compensation, week, event_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (capitalize_event_title(event_info['title']), capitalize_event_title(event_info['description']), day, start_time, end_time, max_slots, event_info['compensation'], week, event_date)
    )
    event_id = c.lastrowid

    # Log action
    log_id = log_action(
        user_id=session['user']['id'],
        username=session['user']['login'],
        action_type='CREATE_EVENT',
        description=f"Creato evento '{event_info['title']}' ({day}, {start_time}-{end_time}) per la settimana {week}.",
        resource_id=str(event_id),
        resource_type='event',
        new_value=json.dumps(event_info),
        cursor=c
    )
    conn.commit()
    conn.close()

    if log_id:
        emit_log_update(log_id)

    # Emetti aggiornamento live
    emit_event_update(event_id, 'create')
    
    return redirect(url_for('admin_panel', week=week))

@app.route('/register/<int:event_id>', methods=['POST'])
@login_required
def register(event_id):
    # Utente si iscrive a un evento con il proprio login 42
    participant_name = session['user']['login']
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # CONTROLLO WHITELIST: verifica se l'utente è autorizzato
    c.execute("SELECT COUNT(*) FROM baywatcher_whitelist WHERE intra_login = ?", (participant_name,))
    is_whitelisted = c.fetchone()[0] > 0
    
    if not is_whitelisted:
        conn.close()
        flash('⚠️ Non sei autorizzato a iscriverti agli eventi Baywatcher! Contatta lo staff per maggiori informazioni.', 'danger')
        return redirect(url_for('home'))
    
    # CONTROLLO ORARIO: verifica se l'evento è già passato
    c.execute("SELECT title, day, start_time, end_time, week, event_date FROM events WHERE id = ?", (event_id,))
    event_time = c.fetchone()
    if event_time:
        event_title, event_day, start_time, end_time, event_week, event_date_db = event_time

        # If no per-event date, compute from global pool_start and week mapping
        if not event_date_db:
            c2 = sqlite3.connect(DB_PATH).cursor()
            conn2 = sqlite3.connect(DB_PATH)
            c2 = conn2.cursor()
            c2.execute("SELECT value FROM settings WHERE key = 'pool_start'")
            pool_row = c2.fetchone()
            pool_start = pool_row[0] if pool_row else None
            conn2.close()
            computed_dates = compute_week_day_dates(pool_start, event_week)
            event_date_db = computed_dates.get(event_day)

        if is_event_passed(event_date_db, end_time):
            conn.close()
            flash('⏰ Non puoi iscriverti a un evento già passato!', 'danger')
            return redirect(url_for('home'))
    
    # Ottieni il limite massimo di eventi per utente
    c.execute("SELECT value FROM settings WHERE key = 'max_events_per_user'")
    max_events_result = c.fetchone()
    max_events_per_user = int(max_events_result[0]) if max_events_result else 0
    
    # Controlla quanti eventi l'utente ha già prenotato nella settimana corrente
    if max_events_per_user > 0:  # 0 = illimitato
        # Ottieni la settimana dell'evento
        c.execute("SELECT week FROM events WHERE id = ?", (event_id,))
        event_week_result = c.fetchone()
        if event_week_result:
            event_week = event_week_result[0]
            
            # Conta quanti eventi l'utente ha già nella stessa settimana
            c.execute("""
                SELECT COUNT(*) FROM registrations r
                JOIN events e ON r.event_id = e.id
                WHERE r.participant_name = ? AND e.week = ?
            """, (participant_name, event_week))
            current_events_count = c.fetchone()[0]
            
            if current_events_count >= max_events_per_user:
                conn.close()
                # Usa flash message per notificare l'utente
                flash(f'Hai raggiunto il limite massimo di {max_events_per_user} eventi per questa settimana!', 'danger')
                return redirect(url_for('home'))
    
    # Controlla se ci sono posti disponibili
    c.execute("SELECT registered, max_slots FROM events WHERE id = ?", (event_id,))
    result = c.fetchone()
    
    # Controlla se l'utente è già iscritto
    c.execute("SELECT COUNT(*) FROM registrations WHERE event_id = ? AND participant_name = ?", 
              (event_id, participant_name))
    already_registered = c.fetchone()[0] > 0
    
    if result and result[0] < result[1] and not already_registered:
        # Aggiungi registrazione
        c.execute("INSERT INTO registrations (event_id, participant_name) VALUES (?, ?)", 
                  (event_id, participant_name))
        # Aggiorna contatore
        c.execute("UPDATE events SET registered = registered + 1 WHERE id = ?", (event_id,))
        
        log_description = f"Utente '{participant_name}' registrato all'evento '{event_title}' ({event_day}, {start_time}-{end_time}, ID: {event_id})."
        # Log action
        log_id = log_action(
            user_id=session['user']['id'],
            username=participant_name,
            action_type='REGISTER_EVENT',
            description=log_description,
            resource_id=str(event_id),
            cursor=c
        )
        conn.commit()

        if log_id:
            emit_log_update(log_id)

        # Emetti aggiornamento live
        emit_event_update(event_id, 'update')
    
    conn.close()
    return redirect(url_for('home', registered_event_id=event_id))

@app.route('/unregister/<int:event_id>', methods=['POST'])
@login_required
def unregister(event_id):
    # Utente si disiscreve dal proprio evento
    participant_name = session['user']['login']
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Controllo: se l'evento è già passato, impedisci la disiscrizione per utenti non-admin
    c.execute("SELECT title, day, start_time, end_time, week, event_date FROM events WHERE id = ?", (event_id,))
    evt = c.fetchone()
    if evt:
        event_title, event_day, start_time, end_time, event_week, event_date_db = evt

        # If no per-event date, compute from global pool_start and week mapping
        if not event_date_db:
            conn2 = sqlite3.connect(DB_PATH)
            c2 = conn2.cursor()
            c2.execute("SELECT value FROM settings WHERE key = 'pool_start'")
            pool_row = c2.fetchone()
            pool_start = pool_row[0] if pool_row else None
            conn2.close()
            computed_dates = compute_week_day_dates(pool_start, event_week)
            event_date_db = computed_dates.get(event_day)

        # Se l'evento è passato e l'utente non è admin, blocca la cancellazione
        if is_event_passed(event_date_db, end_time) and not session.get('user', {}).get('is_admin', False):
            conn.close()
            flash('⏰ Non puoi disiscriverti da un evento già passato!', 'danger')
            return redirect(url_for('home'))
    
    # Trova e rimuovi solo la propria registrazione (usando ROWID per rimuovere solo una)
    c.execute("""DELETE FROM registrations WHERE rowid = (
        SELECT rowid FROM registrations 
        WHERE event_id = ? AND participant_name = ? 
        LIMIT 1
    )""", (event_id, participant_name))
    
    if c.rowcount > 0:
        # Aggiorna contatore solo se è stata rimossa una registrazione
        c.execute("UPDATE events SET registered = registered - 1 WHERE id = ? AND registered > 0", (event_id,))
        
        log_description = f"Utente '{participant_name}' disiscritto dall'evento '{event_title}' ({event_day}, {start_time}-{end_time}, ID: {event_id})."
        # Log action
        log_id = log_action(
            user_id=session['user']['id'],
            username=participant_name,
            action_type='UNREGISTER_EVENT',
            description=log_description,
            resource_id=str(event_id),
            cursor=c
        )
        conn.commit()

        if log_id:
            emit_log_update(log_id)

        # Emetti aggiornamento live
        emit_event_update(event_id, 'update')
    
    conn.close()
    return redirect(url_for('home'))

@app.route('/delete_event/<int:event_id>', methods=['POST'])
def delete_event(event_id):
    # Admin elimina un evento
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Ottieni info per il log prima di cancellare
        c.execute("SELECT title, week FROM events WHERE id = ?", (event_id,))
        event_info = c.fetchone()
        
        # Elimina prima le registrazioni associate
        c.execute("DELETE FROM registrations WHERE event_id = ?", (event_id,))
        # Poi elimina l'evento
        c.execute("DELETE FROM events WHERE id = ?", (event_id,))

        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='DELETE_EVENT',
            description=f"Eliminato evento '{event_info[0]}' (ID: {event_id}) dalla settimana {event_info[1]}.",
            resource_id=str(event_id),
            cursor=c
        )
        conn.commit()

        if log_id:
            emit_log_update(log_id)
    finally:
        if conn:
            conn.close()
            
    # Emetti aggiornamento live (delete)
    socketio.emit('event_update', {'id': event_id, 'action': 'delete'})
    
    return redirect(url_for('admin_panel'))

@app.route('/edit_event/<int:event_id>', methods=['POST'])
@admin_required
def edit_event(event_id):
    # Admin modifica un evento esistente
    title = request.form.get('title', '').strip()
    description = request.form.get('description', '').strip()
    day = request.form.get('day')
    start_time = request.form.get('start_time', '').strip()
    end_time = request.form.get('end_time', '').strip()
    max_slots = request.form.get('max_slots')
    compensation = request.form.get('compensation')
    
    # Validazione orari
    if not start_time or not end_time or ':' not in start_time or ':' not in end_time:
        flash('Gli orari di inizio e fine sono obbligatori e devono essere nel formato corretto', 'danger')
        return redirect(url_for('admin_panel'))
    
    # Validazione start < end
    try:
        start_h, start_m = map(int, start_time.split(':'))
        end_h, end_m = map(int, end_time.split(':'))
        start_minutes = start_h * 60 + start_m
        end_minutes = end_h * 60 + end_m
        
        if start_minutes >= end_minutes:
            flash('L\'orario di inizio deve essere minore dell\'orario di fine', 'danger')
            return redirect(url_for('admin_panel'))
    except ValueError:
        flash('Formato orario non valido', 'danger')
        return redirect(url_for('admin_panel'))
    
    if not title:
        flash('Il titolo è obbligatorio', 'danger')
        return redirect(url_for('admin_panel'))
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Log action
    c.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    old_event_data = c.fetchone()
    log_id = log_action(
        user_id=session['user']['id'],
        username=session['user']['login'],
        action_type='UPDATE_EVENT',
        description=f"Aggiornato evento '{title}' (ID: {event_id}).",
        resource_id=str(event_id),
        resource_type='event',
        old_value=str(old_event_data),
        new_value=str(request.form.to_dict()),
        cursor=c
    )
    # Aggiorna l'evento
    c.execute("""
        UPDATE events 
        SET title = ?, description = ?, day = ?, start_time = ?, end_time = ?, 
            max_slots = ?, compensation = ?
        WHERE id = ?
    """, (capitalize_event_title(title), capitalize_event_title(description), day, start_time, end_time, max_slots, compensation, event_id))
    
    conn.commit()
    if log_id:
        emit_log_update(log_id)
    conn.close()
    
    # Emetti aggiornamento live
    emit_event_update(event_id, 'update')
    
    flash('Evento modificato con successo!', 'success')
    return redirect(url_for('admin_panel'))

@app.route('/create_template')
@admin_required
def create_template():
    # Pagina per creare un nuovo template settimana
    return render_template('create_template.html')

@app.route('/save_template', methods=['POST'])
@admin_required
def save_template():
    # Salva il template settimana nel database
    template_name = request.form.get('template_name', '').strip()
    target_week = request.form.get('target_week', '').strip()
    template_description = request.form.get('template_description', '').strip()
    
    if not template_name or not target_week:
        flash('Nome template e settimana target sono obbligatori', 'danger')
        return redirect(url_for('create_template'))
    
    # Ottieni gli eventi dal form (JSON array)
    events_data = []
    i = 0
    while f'events[{i}]' in request.form:
        event_json = request.form.get(f'events[{i}]')
        try:
            event = json.loads(event_json)
            events_data.append(event)
        except:
            pass
        i += 1
    
    if not events_data:
        flash('Aggiungi almeno un evento al template', 'danger')
        return redirect(url_for('create_template'))
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Inserisci il template
    c.execute("""
        INSERT INTO week_templates (name, description, target_week, created_at)
        VALUES (?, ?, ?, datetime('now'))
    """, (template_name, template_description, target_week))
    
    template_id = c.lastrowid
    
    # Inserisci gli eventi del template
    for event in events_data:
        c.execute("""
            INSERT INTO template_events 
            (template_id, title, description, day, event_date, start_time, end_time, max_slots, compensation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            template_id,
            capitalize_event_title(event.get('title', '')),
            capitalize_event_title(event.get('description', '')),
            event.get('day', ''),
            event.get('date', None),
            event.get('start', ''),
            event.get('end', ''),
            event.get('slots', 2),
            event.get('compensation', 0)
        ))
    
    # Log action e commit
    log_id = log_action(
        user_id=session['user']['id'],
        username=session['user']['login'],
        action_type='CREATE_TEMPLATE',
        description=f"Creato template '{template_name}' per la settimana {target_week}.",
        resource_id=str(template_id),
        resource_type='template',
        cursor=c
    )
    conn.commit()
    if log_id:
        emit_log_update(log_id)
    conn.close()
    
    flash(f'Template "{template_name}" creato con successo con {len(events_data)} eventi!', 'success')
    return redirect(url_for('admin_panel'))

@app.route('/apply_template/<int:template_id>', methods=['POST'])
@admin_required
def apply_template(template_id):
    # Applica un template alla settimana target creando tutti gli eventi
    overwrite = request.form.get('overwrite', 'false') == 'true'
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni il template
    c.execute("SELECT name, target_week FROM week_templates WHERE id = ?", (template_id,))
    template = c.fetchone()
    if not template:
        flash('Template non trovato', 'danger')
        conn.close()
        return redirect(url_for('admin_panel'))
    
    template_name, target_week = template
    
    # Controlla se ci sono già eventi nella settimana target
    c.execute("SELECT COUNT(*) FROM events WHERE week = ?", (target_week,))
    existing_events_count = c.fetchone()[0]
    
    if existing_events_count > 0 and overwrite:
        # Elimina tutti gli eventi esistenti nella settimana (con registrazioni)
        c.execute("SELECT id FROM events WHERE week = ?", (target_week,))
        event_ids = [row[0] for row in c.fetchall()]
        
        for event_id in event_ids:
            c.execute("DELETE FROM registrations WHERE event_id = ?", (event_id,))
        
        c.execute("DELETE FROM events WHERE week = ?", (target_week,))
    elif existing_events_count > 0 and not overwrite:
        flash(f'Esistono già {existing_events_count} eventi nella settimana {target_week}. Seleziona "Sovrascrivi" per continuare.', 'warning')
        conn.close()
        return redirect(url_for('admin_panel'))
    
    # Ottieni gli eventi del template
    c.execute("""
        SELECT title, description, day, start_time, end_time, max_slots, compensation
        FROM template_events WHERE template_id = ?
    """, (template_id,))
    template_events = c.fetchall()
    
    if not template_events:
        flash('Template senza eventi', 'warning')
        conn.close()
        return redirect(url_for('admin_panel'))
    
    # Crea tutti gli eventi nella settimana target
    created_count = 0
    for event in template_events:
        title, description, day, start_time, end_time, max_slots, compensation = event
        c.execute("""
            INSERT INTO events (title, description, day, start_time, end_time, max_slots, registered, compensation, week)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        """, (capitalize_event_title(title), capitalize_event_title(description), day, start_time, end_time, max_slots, compensation, target_week))
        created_count += 1

    # Log action
    log_id = log_action(
        user_id=session['user']['id'],
        username=session['user']['login'],
        action_type='APPLY_TEMPLATE',
        description=f"Applicato template '{template_name}' alla settimana {target_week}. Sovrascrittura: {overwrite}.",
        resource_id=str(template_id),
        resource_type='template',
        cursor=c
    )
    conn.commit()
    if log_id:
        emit_log_update(log_id)
    conn.close()
    
    if overwrite and existing_events_count > 0:
        flash(f'Template "{template_name}" applicato! Eliminati {existing_events_count} eventi esistenti e creati {created_count} nuovi eventi nella Week {target_week}', 'success')
    else:
        flash(f'Template "{template_name}" applicato! Creati {created_count} eventi nella Week {target_week}', 'success')
    return redirect(url_for('admin_panel', week=target_week))

@app.route('/delete_template/<int:template_id>', methods=['POST'])
@admin_required
def delete_template(template_id):
    # Elimina un template (CASCADE eliminerà anche gli eventi)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni nome per messaggio
    c.execute("SELECT name FROM week_templates WHERE id = ?", (template_id,))
    result = c.fetchone()
    template_name = result[0] if result else 'Template'
    
    c.execute("DELETE FROM week_templates WHERE id = ?", (template_id,))

    # Log action
    log_id = log_action(
        user_id=session['user']['id'],
        username=session['user']['login'],
        action_type='DELETE_TEMPLATE',
        description=f"Eliminato template '{template_name}' (ID: {template_id}).",
        resource_id=str(template_id),
        cursor=c
    )
    conn.commit()
    if log_id:
        emit_log_update(log_id)
    conn.close()
    
    flash(f'Template "{template_name}" eliminato', 'success')
    return redirect(url_for('admin_panel'))

@app.route('/download_template_csv')
@admin_required
def download_template_csv():
    """Scarica il template CSV di esempio"""
    # CSV template vuoto
    csv_content = "Week,Giorno,Orario,Tipo Evento,Compenso,Partecipanti\n"
    
    # Crea response
    response = make_response(csv_content)
    response.headers["Content-Disposition"] = "attachment; filename=template_esempio.csv"
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    return response

@app.route('/import_csv_templates', methods=['POST'])
@admin_required
def import_csv_templates():
    """Importa template da file CSV con formato: Week,Giorno,Orario,Tipo Evento,Compenso,Partecipanti"""
    
    if 'csv_file' not in request.files:
        flash('Nessun file caricato', 'danger')
        return redirect(url_for('admin_panel'))
    
    file = request.files['csv_file']
    
    if file.filename == '':
        flash('Nessun file selezionato', 'danger')
        return redirect(url_for('admin_panel'))
    
    if not file.filename.endswith('.csv'):
        flash('Il file deve essere in formato CSV', 'danger')
        return redirect(url_for('admin_panel'))
    
    try:
        # Leggi il CSV - prova diversi encoding
        try:
            content = file.stream.read().decode("UTF-8")
        except UnicodeDecodeError:
            file.stream.seek(0)
            content = file.stream.read().decode("latin-1")
        
        # Rimuovi BOM se presente
        if content.startswith('\ufeff'):
            content = content[1:]
        
        stream = io.StringIO(content, newline=None)
        
        # Prova a determinare il delimiter
        sample = content[:1024]
        delimiter = ',' if sample.count(',') > sample.count(';') else ';'
        
        csv_reader = csv.DictReader(stream, delimiter=delimiter)
        
        app.logger.info(f"Colonne CSV rilevate: {csv_reader.fieldnames}")
        
        # Organizza eventi per settimana
        events_by_week = {}
        skipped_rows = 0
        
        for row in csv_reader:
            week = row.get('Week', '').strip()
            day = row.get('Giorno', '').strip()
            time_range = row.get('Orario', '').strip()
            event_type = row.get('Tipo Evento', '').strip()
            compensation = row.get('Compenso', '0').strip()
            max_slots = row.get('Partecipanti', '1').strip()
            
            # Validazione dati
            if not week or not day or not time_range or not event_type:
                skipped_rows += 1
                app.logger.warning(f"Riga CSV saltata (dati mancanti): week={week}, day={day}, time={time_range}, type={event_type}")
                continue
            
            # Parse orario (formato: "HH:MM-HH:MM")
            if '-' not in time_range:
                skipped_rows += 1
                app.logger.warning(f"Riga CSV saltata (orario invalido): {time_range}")
                continue
            
            start_time, end_time = time_range.split('-', 1)
            start_time = start_time.strip()
            end_time = end_time.strip()
            
            # Converti compenso e partecipanti in int
            try:
                compensation_int = int(compensation)
                max_slots_int = int(max_slots)
            except ValueError as e:
                skipped_rows += 1
                app.logger.warning(f"Riga CSV saltata (errore conversione numeri): compenso={compensation}, slots={max_slots}, error={e}")
                continue
            
            # Organizza per settimana
            if week not in events_by_week:
                events_by_week[week] = []
            
            # Cerca una colonna data (es. 'Data' oppure 'Date') e normalizza a YYYY-MM-DD se possibile
            event_date_raw = row.get('Data', '').strip() or row.get('Date', '').strip()
            event_date = event_date_raw if event_date_raw else None

            events_by_week[week].append({
                'day': day,
                'start_time': start_time,
                'end_time': end_time,
                'title': event_type,
                'compensation': compensation_int,
                'max_slots': max_slots_int,
                'description': f'{event_type} - {compensation_int}₳',
                'event_date': event_date
            })
        
        if not events_by_week:
            flash(f'Nessun evento valido trovato nel CSV (saltate {skipped_rows} righe)', 'warning')
            return redirect(url_for('admin_panel'))
        
        if skipped_rows > 0:
            app.logger.warning(f"Import CSV: {skipped_rows} righe saltate per errori di formato.")
        
        # Crea un template per ogni settimana
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        created_templates = 0
        total_events = 0;
        
        for week, events in events_by_week.items():
            # Crea template per la settimana
            template_name = f"Week {week} - Import CSV"
            template_description = f"Template importato da CSV con {len(events)} eventi"
            
            c.execute("""
                INSERT INTO week_templates (name, description, target_week, created_at)
                VALUES (?, ?, ?, datetime('now'))
            """, (template_name, template_description, week))
            
            template_id = c.lastrowid
            
            # Aggiungi tutti gli eventi al template
            for event in events:
                c.execute("""
                    INSERT INTO template_events 
                    (template_id, title, description, day, event_date, start_time, end_time, max_slots, compensation)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    template_id,
                    capitalize_event_title(event['title']),
                    capitalize_event_title(event['description']),
                    event['day'],
                    event.get('event_date', None),
                    event['start_time'],
                    event['end_time'],
                    event['max_slots'],
                    event['compensation']
                ))
                total_events += 1
            
            created_templates += 1
        
        # Log action e commit
        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='IMPORT_TEMPLATES',
            description=f"Importati {created_templates} template da CSV '{file.filename}'.",
            resource_type='template',
            new_value=f"{total_events} events created",
            cursor=c
        )
        conn.commit()
        if log_id:
            emit_log_update(log_id)
        conn.close()
        
        flash(f'Import completato! Creati {created_templates} template con {total_events} eventi totali', 'success')
        return redirect(url_for('admin_panel'))
        
    except Exception as e:
        flash(f'Errore durante l\'import: {str(e)}', 'danger')
        return redirect(url_for('admin_panel'))

@app.route('/admin_unregister/<int:event_id>/<participant_name>', methods=['POST'])
def admin_unregister(event_id, participant_name):
    # Admin disiscreve un partecipante
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni dettagli evento per il log
    c.execute("SELECT title, day, start_time, end_time FROM events WHERE id = ?", (event_id,))
    event_info = c.fetchone()
    
    # Rimuovi la registrazione (usando ROWID per rimuovere solo una)
    c.execute("""DELETE FROM registrations WHERE rowid = (
        SELECT rowid FROM registrations 
        WHERE event_id = ? AND participant_name = ? 
        LIMIT 1
    )""", (event_id, participant_name))
    
    if c.rowcount > 0:
        # Aggiorna contatore
        c.execute("UPDATE events SET registered = registered - 1 WHERE id = ? AND registered > 0", (event_id,))
        
        log_description = f"Admin ha disiscritto '{participant_name}' dall'evento '{event_info[0]}' ({event_info[1]}, {event_info[2]}-{event_info[3]}, ID: {event_id})."
        # Log action
        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='ADMIN_UNREGISTER',
            description=log_description,
            resource_id=str(event_id),
            cursor=c
        )
        conn.commit()

        if log_id:
            emit_log_update(log_id)

        # Emetti aggiornamento live
        emit_event_update(event_id, 'update')
    
    conn.close()
    return redirect(url_for('admin_panel'))

@app.route('/admin/add_participant/<int:event_id>', methods=['POST'])
@admin_required
def admin_add_participant(event_id):
    """Admin aggiunge manualmente un partecipante tramite login intra (BYPASS limite posti)"""
    intra_login = request.form.get('intra_login', '').strip().lower()
    
    if not intra_login:
        return redirect(url_for('admin_panel'))
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni dettagli evento per il log e per il redirect
    c.execute("SELECT title, day, start_time, end_time, week FROM events WHERE id = ?", (event_id,))
    event = c.fetchone()
    
    if not event:
        conn.close()
        return redirect(url_for('admin_panel'))
    
    event_title, event_day, start_time, end_time, week = event
    
    # Controlla se l'utente è già iscritto
    c.execute("SELECT COUNT(*) FROM registrations WHERE event_id = ? AND participant_name = ?", 
              (event_id, intra_login))
    if c.fetchone()[0] > 0:
        # Già iscritto
        conn.close()
        flash(f'{intra_login} è già iscritto a questo evento', 'warning')
        return redirect(url_for('admin_panel', week=week))
    
    # ADMIN BYPASS: Aggiungi l'utente anche se l'evento è pieno
    c.execute("INSERT INTO registrations (event_id, participant_name, attended) VALUES (?, ?, 1)",
              (event_id, intra_login))
    
    # Aggiorna il contatore
    c.execute("UPDATE events SET registered = registered + 1 WHERE id = ?", (event_id,))
    
    log_description = f"Admin ha aggiunto '{intra_login}' all'evento '{event_title}' ({event_day}, {start_time}-{end_time}, ID: {event_id})."
    # Log action
    log_id = log_action(
        user_id=session['user']['id'],
        username=session['user']['login'],
        action_type='ADMIN_ADD_PARTICIPANT',
        description=log_description,
        resource_id=str(event_id),
        resource_type='event',
        cursor=c
    )
    conn.commit()
    conn.close()

    if log_id:
        emit_log_update(log_id)

    # Emetti aggiornamento live
    emit_event_update(event_id, 'update')
    
    return redirect(url_for('admin_panel', week=week))

@app.route('/admin/mark_absent/<int:event_id>/<participant_name>', methods=['POST'])
@admin_required
def mark_absent(event_id, participant_name):
    """Admin segna un partecipante come assente (non partecipato)"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni dettagli evento per il log
    c.execute("SELECT title, day, start_time, end_time FROM events WHERE id = ?", (event_id,))
    event_info = c.fetchone()
    
    # Aggiorna lo stato di presenza
    c.execute("""
        UPDATE registrations 
        SET attended = 0 
        WHERE event_id = ? AND participant_name = ?
    """, (event_id, participant_name))
    
    log_description = f"Segnato '{participant_name}' come assente per l'evento '{event_info[0]}' ({event_info[1]}, {event_info[2]}-{event_info[3]}, ID: {event_id})."
    # Log action
    log_id = log_action(
        user_id=session['user']['id'],
        username=session['user']['login'],
        action_type='MARK_ABSENT',
        description=log_description,
        resource_id=str(event_id),
        cursor=c
    )
    conn.commit()
    conn.close()

    if log_id:
        emit_log_update(log_id)
    
    flash(f'{participant_name} segnato come NON PARTECIPATO', 'warning')
    
    # Emetti aggiornamento live
    emit_event_update(event_id, 'update')
    
    return redirect(url_for('admin_panel'))

@app.route('/admin/mark_present/<int:event_id>/<participant_name>', methods=['POST'])
@admin_required
def mark_present(event_id, participant_name):
    """Admin segna un partecipante come presente"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni dettagli evento per il log
    c.execute("SELECT title, day, start_time, end_time FROM events WHERE id = ?", (event_id,))
    event_info = c.fetchone()
    
    # Aggiorna lo stato di presenza
    c.execute("""
        UPDATE registrations 
        SET attended = 1 
        WHERE event_id = ? AND participant_name = ?
    """, (event_id, participant_name))
    
    log_description = f"Segnato '{participant_name}' come presente per l'evento '{event_info[0]}' ({event_info[1]}, {event_info[2]}-{event_info[3]}, ID: {event_id})."
    # Log action
    log_id = log_action(
        user_id=session['user']['id'],
        username=session['user']['login'],
        action_type='MARK_PRESENT',
        description=log_description,
        resource_id=str(event_id),
        cursor=c
    )
    conn.commit()
    conn.close()

    if log_id:
        emit_log_update(log_id)
    
    flash(f'{participant_name} segnato come PARTECIPATO', 'success')
    
    # Emetti aggiornamento live
    emit_event_update(event_id, 'update')
    
    return redirect(url_for('admin_panel'))

@app.route('/admin/delete_day_events/<int:week>/<day>', methods=['POST'])
@admin_required
def delete_day_events(week, day):
    """Elimina tutti gli eventi di un giorno specifico in una settimana"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Ottieni tutti gli ID degli eventi del giorno
        c.execute("SELECT id FROM events WHERE week = ? AND day = ?", (week, day))
        event_ids = [row[0] for row in c.fetchall()]
        
        # Elimina tutte le registrazioni associate agli eventi del giorno
        if event_ids:
            c.execute(f"DELETE FROM registrations WHERE event_id IN ({','.join('?' for _ in event_ids)})", event_ids)
        
        # Elimina tutti gli eventi del giorno
        c.execute("DELETE FROM events WHERE week = ? AND day = ?", (week, day))

        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='DELETE_DAY_EVENTS',
            description=f"Eliminati tutti gli eventi del giorno '{day}' della settimana {week}.",
            resource_id=f"{week}-{day}",
            cursor=c
        )
        conn.commit()

        if log_id:
            emit_log_update(log_id)
    finally:
        if conn:
            conn.close()
            
    return redirect(url_for('admin_panel', week=week))

@app.route('/admin/delete_week_events/<int:week>', methods=['POST'])
@admin_required
def delete_week_events(week):
    """Elimina tutti gli eventi di una settimana specifica"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Ottieni tutti gli ID degli eventi della settimana
        c.execute("SELECT id FROM events WHERE week = ?", (week,))
        event_ids = [row[0] for row in c.fetchall()]
        
        # Elimina tutte le registrazioni associate agli eventi della settimana
        if event_ids:
            c.execute(f"DELETE FROM registrations WHERE event_id IN ({','.join('?' for _ in event_ids)})", event_ids)
        
        # Elimina tutti gli eventi della settimana
        c.execute("DELETE FROM events WHERE week = ?", (week,))

        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='DELETE_WEEK_EVENTS',
            description=f"Eliminati tutti gli eventi della settimana {week}.",
            resource_id=str(week),
            cursor=c
        )
        conn.commit()

        if log_id:
            emit_log_update(log_id)
    finally:
        if conn:
            conn.close()
            
    return redirect(url_for('admin_panel', week=week))

@app.route('/admin/delete_all_events', methods=['POST'])
@admin_required
def delete_all_events():
    """Elimina TUTTI gli eventi di tutte le settimane"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Elimina tutte le registrazioni
        c.execute("DELETE FROM registrations")
        
        # Elimina tutti gli eventi
        c.execute("DELETE FROM events")

        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='DELETE_ALL_EVENTS',
            description="Eliminati TUTTI gli eventi da TUTTE le settimane.",
            cursor=c
        )
        conn.commit()

        if log_id:
            emit_log_update(log_id)
    finally:
        if conn:
            conn.close()
            
    return redirect(url_for('admin_panel'))

@app.route('/admin/participants_summary')
@admin_required
def participants_summary():
    # Riepilogo completo di tutti i partecipanti con statistiche
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni tutti i partecipanti unici
    c.execute("SELECT DISTINCT participant_name FROM registrations ORDER BY participant_name")
    participants = [p[0] for p in c.fetchall()]
    
    participants_stats = []
    for participant in participants:
        # Conta solo gli eventi a cui ha effettivamente partecipato (attended = 1)
        c.execute("SELECT COUNT(*) FROM registrations WHERE participant_name = ? AND attended = 1", (participant,))
        num_events = c.fetchone()[0]

        # Ottieni dettagli eventi con orari e compensi (includi stato presenza)
        # Also select event.week so we can compute concrete dates from pool_start when event_date is missing
        c.execute("""
            SELECT e.title, e.day, e.start_time, e.end_time, e.compensation, r.registration_date, r.attended, e.event_date, e.week
            FROM registrations r
            JOIN events e ON r.event_id = e.id
            WHERE r.participant_name = ?
            ORDER BY CASE e.day 
                WHEN 'Lunedì' THEN 1 
                WHEN 'Martedì' THEN 2 
                WHEN 'Mercoledì' THEN 3 
                WHEN 'Giovedì' THEN 4 
                WHEN 'Venerdì' THEN 5 
            END, e.start_time
        """, (participant,))
        events = c.fetchall()

        # Calcola ore totali e compenso totale (solo eventi partecipati)
        total_hours = 0
        total_compensation = 0
        events_by_week = {}
        # Load global pool_start once
        c.execute("SELECT value FROM settings WHERE key = 'pool_start'")
        pool_row = c.fetchone()
        pool_start = pool_row[0] if pool_row else None

        for event in events:
            title, day, start_time, end_time, compensation, reg_date, attended, event_date, event_week = event
            # Calcola durata in ore
            # Skip events with missing times
            if not start_time or not end_time or ':' not in start_time or ':' not in end_time:
                continue
            start_h, start_m = map(int, start_time.split(':'))
            end_h, end_m = map(int, end_time.split(':'))
            duration = (end_h * 60 + end_m - start_h * 60 - start_m) / 60

            # Conta solo se ha partecipato
            if attended == 1:
                total_hours += duration
                total_compensation += compensation if compensation else 0

            # If event_date not set, compute from pool_start / week mapping
            if not event_date:
                computed = compute_week_day_dates(pool_start, event_week)
                event_date = computed.get(day)

            if event_week not in events_by_week:
                events_by_week[event_week] = []
            events_by_week[event_week].append({
                'title': title,
                'day': day,
                'event_date': event_date,
                'start_time': start_time,
                'end_time': end_time,
                'duration': duration,
                'compensation': compensation if compensation else 0,
                'registration_date': reg_date,
                'attended': attended
            })

        participants_stats.append({
            'name': participant,
            'num_events': num_events,
            'total_hours': round(total_hours, 2),
            'total_compensation': total_compensation,
            'events_by_week': events_by_week
        })
    
    conn.close()
    return render_template("participants_summary.html", participants_stats=participants_stats)

@app.route('/admin/download_all_participants_csv')
@admin_required
def download_all_participants_csv():
    """Download CSV sintetico di tutti i partecipanti"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni tutti i partecipanti unici
    c.execute("SELECT DISTINCT participant_name FROM registrations ORDER BY participant_name")
    participants = [p[0] for p in c.fetchall()]
    
    # Crea CSV in memoria
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(['Nome Partecipante', 'Eventi Iscritti', 'Ore Totali', 'Altarian Totale'])
    
    # Dati
    for participant in participants:
        # Conta solo gli eventi effettivamente partecipati
        c.execute("SELECT COUNT(*) FROM registrations WHERE participant_name = ? AND attended = 1", (participant,))
        num_events = c.fetchone()[0]
        
        c.execute("""
            SELECT e.start_time, e.end_time, e.compensation, r.attended
            FROM registrations r
            JOIN events e ON r.event_id = e.id
            WHERE r.participant_name = ?
        """, (participant,))
        events = c.fetchall()
        
        total_hours = 0
        total_compensation = 0
        for start_time, end_time, compensation, attended in events:
            start_h, start_m = map(int, start_time.split(':'))
            end_h, end_m = map(int, end_time.split(':'))
            duration = (end_h * 60 + end_m - start_h * 60 - start_m) / 60
            
            # Conta solo se ha partecipato
            if attended == 1:
                total_hours += duration
                total_compensation += compensation if compensation else 0
        
        writer.writerow([participant, num_events, round(total_hours, 2), total_compensation])
    
    conn.close()
    
    # Crea response
    output.seek(0)
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=partecipanti_sintetico.csv"
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    return response

@app.route('/admin/download_all_participants_detailed_csv')
@admin_required
def download_all_participants_detailed_csv():
    """Download CSV dettagliato di tutti i partecipanti (una riga per partecipante con eventi raggruppati)"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni tutti i partecipanti unici
    c.execute("SELECT DISTINCT participant_name FROM registrations ORDER BY participant_name")
    participants = [p[0] for p in c.fetchall()]
    
    # Crea CSV in memoria
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        'Nome Partecipante', 
        'Eventi Partecipati',
        'Numero Eventi', 
        'Totale Ore', 
        'Totale Altarian'
    ])
    
    # Per ogni partecipante
    for participant_name in participants:
        # Ottieni tutti gli eventi del partecipante (con stato presenza)
        # Also fetch event_date and week so we can compute/format concrete dates
        c.execute("""
            SELECT e.title, e.day, e.start_time, e.end_time, e.compensation, r.attended, e.event_date, e.week
            FROM registrations r
            JOIN events e ON r.event_id = e.id
            WHERE r.participant_name = ?
            ORDER BY CASE e.day 
                WHEN 'Lunedì' THEN 1 
                WHEN 'Martedì' THEN 2 
                WHEN 'Mercoledì' THEN 3 
                WHEN 'Giovedì' THEN 4 
                WHEN 'Venerdì' THEN 5 
            END, e.start_time
        """, (participant_name,))
        events = c.fetchall()
        
        # Calcola totali e crea lista eventi (conta solo se attended = 1)
        total_hours = 0
        total_compensation = 0
        events_list = []
        
        # Load global pool_start once for this participant to compute derived dates
        c.execute("SELECT value FROM settings WHERE key = 'pool_start'")
        pool_row = c.fetchone()
        pool_start = pool_row[0] if pool_row else None

        for event in events:
            title, day, start_time, end_time, compensation, attended, event_date, event_week = event
            
            # Calcola durata evento
            start_h, start_m = map(int, start_time.split(':'))
            end_h, end_m = map(int, end_time.split(':'))
            duration = round((end_h * 60 + end_m - start_h * 60 - start_m) / 60, 2)
            
            # Conta ore e compenso solo se ha partecipato
            if attended == 1:
                total_hours += duration
                total_compensation += compensation if compensation else 0
                # If event_date not set, compute from pool_start / week mapping
                if not event_date:
                    computed = compute_week_day_dates(pool_start, event_week)
                    event_date = computed.get(day)

                # Format date as DD/MM/YYYY for CSV
                if event_date:
                    try:
                        date_formatted = f"{event_date[8:10]}/{event_date[5:7]}/{event_date[0:4]}"
                    except Exception:
                        date_formatted = event_date
                else:
                    date_formatted = ''

                events_list.append(f"{title} ({day} {date_formatted}, {duration}h, {compensation if compensation else 0}₳)")
            else:
                # Aggiungi con indicazione "NON PARTECIPATO"
                # If event_date not set, compute from pool_start / week mapping
                if not event_date:
                    computed = compute_week_day_dates(pool_start, event_week)
                    event_date = computed.get(day)

                if event_date:
                    try:
                        date_formatted = f"{event_date[8:10]}/{event_date[5:7]}/{event_date[0:4]}"
                    except Exception:
                        date_formatted = event_date
                else:
                    date_formatted = ''

                events_list.append(f"{title} ({day} {date_formatted}, {duration}h, NON PARTECIPATO)")
        
        # Unisci tutti gli eventi con " | " come separatore
        events_string = " | ".join(events_list)
        
        # Conta solo gli eventi effettivamente partecipati per il CSV
        participated_count = sum(1 for ev in events if ev[5] == 1)

        # Scrivi la riga per il partecipante (numero eventi = eventi partecipati)
        writer.writerow([
            participant_name,
            events_string,
            participated_count,
            round(total_hours, 2),
            total_compensation
        ])
    
    conn.close()
    
    # Crea response
    output.seek(0)
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=partecipanti_dettagliato.csv"
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    return response

@app.route('/admin/download_participant_csv/<participant_name>')
@admin_required
def download_participant_csv(participant_name):
    """Download CSV di un singolo partecipante"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni dettagli eventi (con stato presenza)
    c.execute("""
        SELECT e.title, e.day, e.start_time, e.end_time, e.compensation, r.registration_date, r.attended
        FROM registrations r
        JOIN events e ON r.event_id = e.id
        WHERE r.participant_name = ?
        ORDER BY CASE e.day 
            WHEN 'Lunedì' THEN 1 
            WHEN 'Martedì' THEN 2 
            WHEN 'Mercoledì' THEN 3 
            WHEN 'Giovedì' THEN 4 
            WHEN 'Venerdì' THEN 5 
        END, e.start_time
    """, (participant_name,))
    events = c.fetchall()
    
    # Crea CSV in memoria
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(['Titolo Evento', 'Giorno', 'Orario Inizio', 'Orario Fine', 'Durata (ore)', 'Altarian', 'Stato', 'Data Iscrizione'])
    
    # Dati
    for event in events:
        title, day, start_time, end_time, compensation, reg_date, attended = event
        start_h, start_m = map(int, start_time.split(':'))
        end_h, end_m = map(int, end_time.split(':'))
        duration = round((end_h * 60 + end_m - start_h * 60 - start_m) / 60, 2)
        
        # Altarian conta solo se ha partecipato
        altarian = (compensation if compensation else 0) if attended == 1 else 0
        stato = "PARTECIPATO" if attended == 1 else "NON PARTECIPATO"
        
        writer.writerow([title, day, start_time, end_time, duration, altarian, stato, reg_date])
    
    conn.close()
    
    # Crea response
    output.seek(0)
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = f"attachment; filename=partecipante_{participant_name}.csv"
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    return response

@app.route('/participants/<int:event_id>')
def participants(event_id):
    # Mostra chi si è iscritto a un evento
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Prendi info evento
    c.execute("SELECT title, day, start_time, end_time FROM events WHERE id = ?", (event_id,))
    event = c.fetchone()
    
    # Prendi lista partecipanti
    c.execute("SELECT participant_name, registration_date FROM registrations WHERE event_id = ? ORDER BY registration_date", 
              (event_id,))
    participants_list = c.fetchall()
    
    conn.close()
    return render_template("participants.html", event=event, participants=participants_list, event_id=event_id)

@app.route('/user/profile')
@login_required
def user_profile():
    """Ottieni riepilogo completo dell'utente"""
    user_login = session['user']['login']
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni info utente dal database
    c.execute("SELECT wallet FROM users WHERE login = ?", (user_login,))
    user_data = c.fetchone()
    current_wallet = user_data[0] if user_data else 0
    
    # Ottieni tutti gli eventi a cui l'utente è iscritto (con stato presenza)
    c.execute("""
        SELECT e.id, e.title, e.day, e.start_time, e.end_time, e.compensation, e.week, r.attended, e.event_date
        FROM events e
        JOIN registrations r ON e.id = r.event_id
        WHERE r.participant_name = ?
        ORDER BY e.week, 
                 CASE e.day
                     WHEN 'Lunedì' THEN 1
                     WHEN 'Martedì' THEN 2
                     WHEN 'Mercoledì' THEN 3
                     WHEN 'Giovedì' THEN 4
                     WHEN 'Venerdì' THEN 5
                 END,
                 e.start_time
    """, (user_login,))
    
    user_events = c.fetchall()
    conn.close()
    
    # Calcola statistiche (conta solo eventi con attended = 1)
    total_events = len(user_events)
    total_points_earned = sum(event[5] for event in user_events if event[7] == 1)  # compensation solo se attended
    
    # Calcola ore totali effettuate (solo eventi partecipati)
    total_hours = 0
    for event in user_events:
        # Salta eventi non partecipati
        if event[7] == 0:
            continue
            
        start_time = event[3]  # start_time formato "HH:MM"
        end_time = event[4]    # end_time formato "HH:MM"
        
        # Skip events with missing times
        if not start_time or not end_time or ':' not in start_time or ':' not in end_time:
            continue
            
        start_h, start_m = map(int, start_time.split(':'))
        end_h, end_m = map(int, end_time.split(':'))
        
        duration_minutes = (end_h * 60 + end_m) - (start_h * 60 + start_m)
        total_hours += duration_minutes / 60
    
    # Organizza eventi per settimana (includi stato attended)
    events_by_week = {}
    # Load global pool_start for computing missing dates
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key = 'pool_start'")
    pool_row = c.fetchone()
    pool_start = pool_row[0] if pool_row else None
    conn.close()

    for event in user_events:
        week = event[6]
        if week not in events_by_week:
            events_by_week[week] = []

        # event_date might be at index 8
        event_date = event[8] if len(event) > 8 else None
        if not event_date:
            computed = compute_week_day_dates(pool_start, week)
            event_date = computed.get(event[2])

        events_by_week[week].append({
            'id': event[0],
            'title': event[1],
            'day': event[2],
            'event_date': event_date,
            'start_time': event[3],
            'end_time': event[4],
            'compensation': event[5],
            'attended': event[7],
            'concrete_date': event_date  # Aggiungi concrete_date
        })
    
    return render_template('user_profile.html',
                         total_events=total_events,
                         total_hours=round(total_hours, 1),
                         total_points_earned=total_points_earned,
                         current_wallet=current_wallet,
                         events_by_week=events_by_week)

@app.route('/admin/whitelist')
@admin_required
def manage_whitelist():
    """Pagina per gestire la whitelist baywatcher"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni tutti gli utenti nella whitelist
    c.execute("SELECT id, intra_login, added_at FROM baywatcher_whitelist ORDER BY intra_login")
    whitelist = c.fetchall()
    
    conn.close()
    
    whitelist_data = [{'id': w[0], 'login': w[1], 'added_at': w[2]} for w in whitelist]
    return render_template('whitelist.html', whitelist=whitelist_data)

@app.route('/admin/whitelist/add', methods=['POST'])
@admin_required
def add_to_whitelist():
    """Aggiungi uno o più utenti alla whitelist (separati da virgola)"""
    intra_logins_input = request.form.get('intra_login', '').strip()
    
    if not intra_logins_input:
        flash('Login intra richiesto', 'danger')
        return redirect(url_for('admin_panel'))
    
    # Separa i login per virgola e pulisci gli spazi
    logins = [login.strip().lower() for login in intra_logins_input.split(',') if login.strip()]
    
    if not logins:
        flash('Nessun login valido fornito', 'danger')
        return redirect(url_for('admin_panel'))

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    added = []
    already_exists = []
    log_ids = []
    
    for login in logins:
        try:
            c.execute("INSERT INTO baywatcher_whitelist (intra_login) VALUES (?)", (login,))
            added.append(login)
            log_id = log_action(
                user_id=session['user']['id'],
                username=session['user']['login'],
                action_type='WHITELIST_ADD',
                description=f"Aggiunto '{login}' alla whitelist.",
                resource_type='whitelist',
                new_value=login,
                cursor=c
            )
            if log_id:
                log_ids.append(log_id)
        except sqlite3.IntegrityError:
            already_exists.append(login)
    
    conn.commit()
    conn.close()

    for log_id in log_ids:
        emit_log_update(log_id)
    
    # Messaggi di feedback
    if added:
        flash(f'✓ Aggiunti alla whitelist: {", ".join(added)}', 'success')
    if already_exists:
        flash(f'⚠️ Già presenti: {", ".join(already_exists)}', 'warning')
    
    return redirect(url_for('admin_panel'))

@app.route('/admin/whitelist/remove/<int:whitelist_id>', methods=['POST'])
@admin_required
def remove_from_whitelist(whitelist_id):
    """Rimuovi un utente dalla whitelist"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Ottieni il login per il log prima di cancellare
        c.execute("SELECT intra_login FROM baywatcher_whitelist WHERE id = ?", (whitelist_id,))
        user_to_remove = c.fetchone()
        
        # Esegui la cancellazione
        c.execute("DELETE FROM baywatcher_whitelist WHERE id = ?", (whitelist_id,))
        
        # Log action (usa la stessa connessione)
        log_id = log_action(
            user_id=session['user']['id'],
            username=session['user']['login'],
            action_type='WHITELIST_REMOVE',
            description=f"Rimosso '{user_to_remove[0] if user_to_remove else 'ID:'+str(whitelist_id)}' dalla whitelist.",
            resource_id=str(whitelist_id),
            cursor=c
        )
        conn.commit()

        if log_id:
            emit_log_update(log_id)
    finally:
        if conn:
            conn.close()
            
    flash('Utente rimosso dalla whitelist', 'success')
    return redirect(url_for('admin_panel'))

@app.route('/admin/logs')
@admin_required
def view_logs():
    """
    Visualizza i log delle azioni degli utenti.
    Permette di filtrare per data, utente e tipo di azione.
    """
    date_filter = request.args.get('date')  # formato: YYYY-MM-DD
    user_filter = request.args.get('user')
    action_filter = request.args.get('action')
    page = int(request.args.get('page', 1))
    per_page = 50
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    # Query base per i log
    query = "SELECT * FROM action_logs WHERE 1=1"
    params = []
    
    # Query base per il conteggio totale (senza LIMIT/OFFSET)
    count_query = "SELECT COUNT(*) FROM action_logs WHERE 1=1"
    count_params = []
    
    # Applica filtri
    if date_filter:
        query += " AND DATE(timestamp) = ?"
        count_query += " AND DATE(timestamp) = ?"
        params.append(date_filter)
        count_params.append(date_filter)
    
    if user_filter:
        query += " AND username = ?"
        count_query += " AND username = ?"
        params.append(user_filter)
        count_params.append(user_filter)
    
    if action_filter:
        query += " AND action_type = ?"
        count_query += " AND action_type = ?"
        params.append(action_filter)
        count_params.append(action_filter)
    
    # Ordina per data decrescente e applica paginazione
    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params.extend([per_page, (page - 1) * per_page])
    
    c.execute(query, params)
    logs = [dict(row) for row in c.fetchall()]
    
    # Conta totale per paginazione
    c.execute(count_query, count_params)
    total_logs = c.fetchone()[0]
    
    # Ottieni utenti e azioni unici per i filtri dropdown
    c.execute("SELECT DISTINCT username FROM action_logs ORDER BY username")
    all_users = [row['username'] for row in c.fetchall()]
    
    c.execute("SELECT DISTINCT action_type FROM action_logs ORDER BY action_type")
    all_actions = [row['action_type'] for row in c.fetchall()]
    
    conn.close()
    
    return render_template('admin_logs.html', 
                         logs=logs,
                         total_logs=total_logs,
                         page=page,
                         per_page=per_page,
                         total_pages=(total_logs + per_page - 1) // per_page,
                         date_filter=date_filter,
                         user_filter=user_filter,
                         action_filter=action_filter,
                         all_users=all_users,
                         all_actions=all_actions)

@app.route('/admin/logs/download')
@admin_required
def download_logs_csv():
    """
    Scarica i log filtrati in formato CSV.
    """
    date_filter = request.args.get('date')
    user_filter = request.args.get('user')
    action_filter = request.args.get('action')

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    query = "SELECT id, timestamp, user_id, username, action_type, action_description, ip_address, user_agent, resource_id, resource_type, old_value, new_value FROM action_logs WHERE 1=1"
    params = []

    if date_filter:
        query += " AND DATE(timestamp) = ?"
        params.append(date_filter)
    if user_filter:
        query += " AND username = ?"
        params.append(user_filter)
    if action_filter:
        query += " AND action_type = ?"
        params.append(action_filter)

    query += " ORDER BY timestamp DESC"
    
    c.execute(query, params)
    logs = c.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)

    if logs:
        writer.writerow(logs[0].keys())
        for log in logs:
            writer.writerow(log)

    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=action_logs.csv"
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    return response

@app.route('/webhook', methods=['POST'])
def webhook():
    """
    Webhook endpoint per ricevere notifiche di push da GitHub/GitLab.
    Invia una richiesta al deployer per aggiornare l'applicazione.
    """
    try:
        # Verifica opzionale del secret (consigliato in produzione)
        webhook_secret = os.getenv('WEBHOOK_SECRET')
        if webhook_secret:
            # Per GitHub: X-Hub-Signature-256
            # Per GitLab: X-Gitlab-Token
            provided_secret = request.headers.get('X-Gitlab-Token') or request.headers.get('X-Hub-Signature-256')
            if not provided_secret or webhook_secret not in str(provided_secret):
                return "Unauthorized", 401
        
        # Chiamata al deployer interno
        import requests
        deployer_url = os.getenv('DEPLOYER_URL', 'http://webhook_listener:9000/webhook')
        app.logger.info(f"Webhook ricevuto, chiamata al deployer: {deployer_url}")
        
        # Inoltra la richiesta al deployer
        response = requests.post(deployer_url, json=request.get_json(), timeout=10)
        
        if response.status_code == 200:
            app.logger.info("Deployer chiamato con successo.")
            return "Deployment triggered successfully", 200
        else:
            app.logger.error(f"Errore dal deployer: {response.status_code} - {response.text}")
            return f"Deployer error: {response.status_code}", 500
            
    except Exception as e:
        app.logger.error(f"Errore durante la gestione del webhook: {e}")
        return f"Webhook error: {str(e)}", 500

@app.route('/event/<int:event_id>/calendar.ics')
@login_required
def download_ics(event_id):
    """Genera un file iCalendar (.ics) per un singolo evento."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Ottieni dettagli evento
    c.execute("SELECT title, description, day, start_time, end_time, week, event_date FROM events WHERE id = ?", (event_id,))
    event_data = c.fetchone()

    if not event_data:
        conn.close()
        return "Evento non trovato", 404

    title, description, day, start_time, end_time, week, event_date = event_data

    # Calcola la data concreta dell'evento
    concrete_date_str = event_date
    if not concrete_date_str:
        c.execute("SELECT value FROM settings WHERE key = 'pool_start'")
        pool_start_row = c.fetchone()
        pool_start = pool_start_row[0] if pool_start_row else None
        day_dates = compute_week_day_dates(pool_start, week)
        concrete_date_str = day_dates.get(day)

    conn.close()

    if not concrete_date_str:
        return "Impossibile determinare la data dell'evento. Impostare la data di inizio pool.", 500

    try:
        # Crea oggetti datetime per inizio e fine
        event_dt_obj = datetime.strptime(concrete_date_str, '%Y-%m-%d')
        start_h, start_m = map(int, start_time.split(':'))
        end_h, end_m = map(int, end_time.split(':'))

        start_datetime = event_dt_obj.replace(hour=start_h, minute=start_m)
        end_datetime = event_dt_obj.replace(hour=end_h, minute=end_m)

        # Crea l'evento iCalendar
        cal = Calendar()
        cal.add('prodid', '-//GestionaleBaywatchers//42Firenze//IT')
        cal.add('version', '2.0')

        event = Event()
        event.add('summary', title)
        event.add('dtstart', start_datetime)
        event.add('dtend', end_datetime)
        event.add('dtstamp', datetime.now())
        event.add('description', description or '')
        event.add('uid', f'event-{event_id}-{start_datetime.isoformat()}@baywatchers.42firenze.it')

        # Aggiungi notifiche preimpostate
        from datetime import timedelta

        # Notifica 1 giorno prima
        alarm1 = Alarm()
        alarm1.add('action', 'DISPLAY')
        alarm1.add('description', f'Ricorda: {title}')
        alarm1.add('trigger', timedelta(minutes=-1440))
        event.add_component(alarm1)

        # Notifica 2 ore prima
        alarm2 = Alarm()
        alarm2.add('action', 'DISPLAY')
        alarm2.add('description', f'Ricorda: {title}')
        alarm2.add('trigger', timedelta(minutes=-120))
        event.add_component(alarm2)

        # Notifica 1 ora prima
        alarm3 = Alarm()
        alarm3.add('action', 'DISPLAY')
        alarm3.add('description', f'Ricorda: {title}')
        alarm3.add('trigger', timedelta(minutes=-60))
        event.add_component(alarm3)

        cal.add_component(event)

        response = make_response(cal.to_ical())
        response.headers['Content-Disposition'] = f'attachment; filename="evento_{event_id}.ics"'
        response.headers['Content-Type'] = 'text/calendar; charset=utf-8'
        return response

    except Exception as e:
        app.logger.error(f"Errore durante la creazione del file ICS: {e}")
        return "Errore interno del server", 500

if __name__ == '__main__':
    # Run with SocketIO for real-time updates
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
