// IMPORTY

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
// ws
const http = require('http');
const { Server } = require("socket.io");
const { Socket } = require('dgram');

const app = express();
const PORT = 3000;

const server = http.createServer(app);

const io = new Server(server);

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
        const payload = JSON.parse(message.toString());
        // np. topic: smartsprout/plant/1/data
        // data: { temp: 22.5, humidity: 40 }
        
        const topicParts = topic.split('/');
        const plantId = topicParts[2];

        if (topicParts[3] === 'data') {
            
            const temp = parseFloat(payload.temp);
            const hum = parseInt(payload.humidity);
            
            // konwersja boolean (true/false) na int (1/0) dla SQLite
            const heaterVal = payload.heater ? 1 : 0;
            const fanVal = payload.fan ? 1 : 0;

            // aktualizacja bazy
            db.run(
                "UPDATE plants SET temperature = ?, humidity = ?, heater_status = ?, fan_status = ? WHERE id = ?", 
                [temp, hum, heaterVal, fanVal, plantId],
                (err) => {
                    if (err) console.error("Błąd SQL:", err.message);
                }
            );

            // logika smart home

            // ogrzewanie
            if (temp < 15 && !payload.heater) {
                console.log(`Zimno (${temp}°C)! Włączam grzejnik [ID ${plantId}]`);
                mqttClient.publish(`smartsprout/plant/${plantId}/heater`, JSON.stringify({status: 'ON'}));
            } 
            else if (temp > 25 && payload.heater) {
                console.log(`Ciepło (${temp}°C). Wyłączam grzejnik [ID ${plantId}]`);
                mqttClient.publish(`smartsprout/plant/${plantId}/heater`, JSON.stringify({status: 'OFF'}));
            }

            // wentylacja
            if (hum > 90 && !payload.fan) {
                console.log(`Wilgotno (${hum}%)! Włączam wentylator [ID ${plantId}]`);
                mqttClient.publish(`smartsprout/plant/${plantId}/fan`, JSON.stringify({status: 'ON'}));
            }
            else if (hum < 60 && payload.fan) {
                console.log(`Sucho (${hum}%), Wyłączam wentylator [ID ${plantId}]`);
                mqttClient.publish(`smartsprout/plant/${plantId}/fan`, JSON.stringify({status: 'OFF'}));
            }
        }

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
        humidity INTEGER DEFAULT 50,
        heater_status INTEGER DEFAULT 0,
        fan_status INTEGER DEFAULT 0
    )`);
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

// OBSLUGA WEBSOCKET

// wlaczenie wws kiedy ktos wejdzie na strone
io.on('connection', (socket) => {
    console.log('Nowy klient podłączony przez WS. ID:', socket.id);

    socket.on('disconnect', () => {
        console.log('Klient rozłączony. ID:', socket.id)
    });
});

// start serwera
server.listen(PORT, () => {
    console.log(`Serwer działa na http://localhost:${PORT}`);
});