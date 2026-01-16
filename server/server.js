const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
// do szyfrowania hasel
const bcrypt = require('bcryptjs'); 
// do generowania tokenow
const { v4: uuidv4 } = require('uuid');
// mqtt
const mqtt = require('mqtt');

const app = express();
const PORT = 3000;

app.use(cors());

// do obslugi json
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// KONFIGURACJA MQTT
// nie instaluje na razie hiveMQ lokalnie
const MQTT_BROKER = 'mqtt://test.mosquitto.org'; 
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
    console.log("Połączono z brokerem MQTT");
    // serwer nasluchuje danych od wszystkich roslin
    mqttClient.subscribe('smartsprout/plant/+/data');
});

// kiedy przychodzi wiadomosc z czujnika
mqttClient.on('message', (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        // np. topic: smartsprout/plant/1/data
        // data: { temp: 22.5, humidity: 40 }
        
        const plantId = topic.split('/')[2]; // wyciagamy ID z tematu
        
        // aktualizacja stanu rosliny do bazy
        db.run("UPDATE plants SET temperature = ?, humidity = ? WHERE id = ?", 
            [data.temp, data.humidity, plantId], 
            (err) => {
                if (err) console.error("Błąd zapisu MQTT:", err.message);
                else console.log(`Odebrano dane dla rośliny ID ${plantId}: Wilgotność ${data.humidity}%`);
            }
        );

        // logowania do tabeli logs do zrobienia

    } catch (e) {
        console.error("Błąd przetwarzania wiadomości MQTT:", e);
    }
});

// BAZA DANYCH
const db_path = path.join(__dirname, '../data/database.db');
const db = new sqlite3.Database(db_path, (err) => {
    if (err) console.error("Błąd bazy danych:", err.message);
    else console.log("Połączono z bazą SQLite.");
});

db.serialize(() => {
    // tabela UZYTKOWNIKOW
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`)

    // dane admina sa w bazie, nie mozna sie zarejestrowac jako admin
    const adminPassword = 'admin123';
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync(adminPassword, salt);

    // ustawi takiego admina tylko jesli nie istnieje w bazie
    db.run(`INSERT OR IGNORE INTO users (username, password, role) 
            VALUES ('admin', ?, 'admin')`, [adminHash], (err) => {
        if (!err) console.log("System: Konto Administratora gotowe (login: admin, hasło: admin123)");
    });

    // tabela ROSLIN
    db.run(`CREATE TABLE IF NOT EXISTS plants (
        id INTEGER PRIMARY KEY,
        name TEXT,
        owner_id INTEGER,
        temperature REAL DEFAULT 0,
        humidity INTEGER DEFAULT 100
    )`);

    // testowa roslina
    db.run("INSERT OR IGNORE INTO plants (id, name) VALUES (1, 'Testowa Paprotka')");

    db.run("INSERT OR IGNORE INTO plants (id, name) VALUES (1, 'Testowa Paprotka')");
});

// PAMIEC SESJI
// tokeny
const sessions = {};

const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token || !sessions[token]) {
        return res.status(401).json({ error: "Brak dostępu.Zaloguj się."});
    }

    req.user = sessions[token]
    next();
}

// API

// ENDPOINTY REJESTRACJI I LOGOWANIA

// rejestracja
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if(!username || !password) return res.status(400).json({error: "Podaj login i hasło."});

    // nie mozna sie zarejestrowac jako admin
    if (username.toLowerCase() === 'admin') {
        return res.status(400).json({error: "Nazwa 'admin' jest zarezerwowana."});
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    
    // zawsze rola user
    const role = 'user'; 

    // dodanie uzytkownika do bazy
    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", 
        [username, hashedPassword, role], 
        function(err) {
            if (err) {
                // blad login zajety
                return res.status(400).json({error: "Użytkownik o takim loginie już istnieje."});
            }
            res.json({ success: true });
        }
    );
});

// logowanie
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (!user) return res.status(400).json({error: "Błędny login lub hasło."});

        // sprawdzenie haszowanego hasla
        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(400).json({error: "Błędny login lub hasło."});

        // generowanie tokenu sesji
        const token = uuidv4();
        sessions[token] = { userId: user.id, role: user.role, username: user.username };

        res.json({ token, role: user.role, username: user.username });
    });
});

// wylogowanie
app.post('/api/logout', (req, res) => {
    const token = req.headers['authorization'];
    if (token) delete sessions[token];
    res.json({ success: true });
});

// API DLA ADMINA

// lista wszystkich uzytkownikow
app.get('/api/users/', authenticate, (req, res) => {

    // jesli rola to nie admin
    if (req.user.role !== "admin") {
        return res.status(403).json({error: "Brak uprawnień administratora."});
    }

    // pobranie listy
    db.all("SELECT id, username FROM users WHERE username != 'admin'", [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

// API ROSLIN

// GET -> pobranie listy roslin
app.get('/api/plants', authenticate, (req, res) => {
    // admin widzi wszystkie a uzytkownik tylko swoje
    let sql = "SELECT * FROM plants";
    let params = [];

    // logika filtrowania dla admina
    if (req.user.role === "admin") {
        if (req.query.userId) {
            sql += " WHERE owner_id = ?";
            params.push(req.query.userId)
        } else {
            sql += " WHERE owner_id = ?";
            params.push(req.user.userId)
        }
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

// POST -> dodanie rosliny do listy
app.post('/api/plants', authenticate, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({error: "Nie podano nazwy."});
    
    // id zalogowanego to id wlasciciela
    db.run("INSERT INTO plants (name, owner_id) VALUES (?, ?)", 
        [name, req.user.userId], 
        function(err) {
            if (err) return res.status(500).json({error: err.message});
            res.json({ id: this.lastID, name: name });
        }
    );
});

// DELETE -> usuwanie rosliny po ID
app.delete('/api/plants/:id', authenticate, (req, res) => {
    const id = req.params.id;
    
    // czyja roslina
    db.get("SELECT owner_id FROM plants WHERE id = ?", [id], (err, plant) => {
        if (!plant) return res.status(404).json({error: "Nie znaleziono rośliny"});

        db.run("DELETE FROM plants WHERE id = ?", id, function(err) {
            if (err) return res.status(500).json({error: err.message});
            res.json({ message: `Usunięto roślinę ID: ${id}` });
        });
    });
});

// POST -> symulacja podlewania roslin
app.post('/api/plants/:id/water', authenticate, (req, res) => {
    const id = req.params.id;
    
    // serwer wysyla komende o podlaniu danej rosliny przez MQTT
    // symulator podlewania zmienia wilgotonosc
    const topic = `smartsprout/plant/${id}/water`;
    const message = JSON.stringify({ action: "WATER_ON", duration: 5 });
    
    mqttClient.publish(topic, message, () => {
        console.log(`Wysłano komendę podlewania dla rośliny o ID: ${id}`);
        res.json({ success: true, message: "Podlewanie uruchomione..." });
    });
});

// pliki z public
app.use(express.static(path.join(__dirname, '../public')));

// start serwera
app.listen(PORT, () => {
    console.log(`Serwer działa na http://localhost:${PORT}`);
});