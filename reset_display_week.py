#!/usr/bin/env python3
"""
Script per resettare display_week basandosi sulla logica automatica.
Trova la prima settimana che ha eventi non ancora passati.
"""
import sqlite3
from datetime import datetime

DB_PATH = 'calendar.db'

def is_event_passed(event_date, end_time):
    """Controlla se un evento è già passato"""
    if not event_date:
        return False
    try:
        now = datetime.now()
        event_date_obj = datetime.strptime(event_date, '%Y-%m-%d')
        end_h, end_m = map(int, end_time.split(':'))
        event_end = event_date_obj.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
        return now > event_end
    except:
        return False

def compute_week_day_dates(pool_start_str, week_number):
    """Calcola le date per una settimana"""
    from datetime import timedelta
    days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì']
    if not pool_start_str:
        return {}
    try:
        start = datetime.strptime(pool_start_str, '%Y-%m-%d')
        week_offset = (week_number - 1) * 7
        result = {}
        for i, day in enumerate(days):
            day_date = start + timedelta(days=week_offset + i)
            result[day] = day_date.strftime('%Y-%m-%d')
        return result
    except:
        return {}

def main():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Ottieni pool_start
    c.execute("SELECT value FROM settings WHERE key = 'pool_start'")
    pool_start_row = c.fetchone()
    if not pool_start_row:
        print("❌ pool_start non configurato")
        return
    pool_start = pool_start_row[0]
    
    print(f"📅 Pool start: {pool_start}")
    print(f"🕐 Ora corrente: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print()
    
    # Controlla ogni settimana
    best_week = None
    for week in range(1, 5):
        c.execute("SELECT id, day, start_time, end_time, event_date, title FROM events WHERE week = ?", (week,))
        events = c.fetchall()
        
        if not events:
            print(f"Week {week}: ❌ Nessun evento")
            continue
        
        day_dates = compute_week_day_dates(pool_start, week)
        
        # Conta eventi passati e futuri
        passed_count = 0
        future_count = 0
        
        for event in events:
            event_id, day, start_time, end_time, event_date, title = event
            concrete_date = event_date if event_date else day_dates.get(day)
            
            if concrete_date:
                if is_event_passed(concrete_date, end_time):
                    passed_count += 1
                else:
                    future_count += 1
        
        print(f"Week {week}: {len(events)} eventi totali | ✅ {future_count} futuri | ⏰ {passed_count} passati")
        
        # Se ci sono eventi futuri e non abbiamo ancora trovato una settimana, questa è la migliore
        if future_count > 0 and best_week is None:
            best_week = week
    
    print()
    
    if best_week:
        print(f"🎯 Settimana migliore da mostrare: Week {best_week}")
        c.execute("UPDATE settings SET value = ? WHERE key = 'display_week'", (str(best_week),))
        conn.commit()
        print(f"✅ display_week aggiornato a {best_week}")
    else:
        print("⚠️ Nessuna settimana con eventi futuri trovata")
        # Default alla week 1
        c.execute("UPDATE settings SET value = ? WHERE key = 'display_week'", ('1',))
        conn.commit()
        print("✅ display_week impostato a 1 (default)")
    
    conn.close()

if __name__ == "__main__":
    main()
