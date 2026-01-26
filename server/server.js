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
// cookies
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3000;

const server = http.createServer(app);

const io = new Server(server);

// app.use

app.use(cors());

// do obslugi json
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use(cookieParser());

// DODAWANIE LOGOW DO TABELI
function logSystemEvent(plantId, message) {
    console.log(`[LOG] Roślina ${plantId}, ${message}`);

    db.run("INSERT INTO logs (plant_id, message) VALUES (?, ?)", [plantId, message], (err) => { if (err) console.log("Błąd zapisu logu:", err.message);
    });
}

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

            // logika smart home + logi

            // ogrzewanie
            if (temp < 15 && !payload.heater) {
                const msg = `Temperatura: ${temp}°C. Grzejnik włączony.`
                logSystemEvent(plantId, msg)

                mqttClient.publish(`smartsprout/plant/${plantId}/heater`, JSON.stringify({status: 'ON'}));
            } 
            else if (temp > 25 && payload.heater) {
                const msg = `Temperatura ${temp}°C. Wyłączam grzejnik.`;
                logSystemEvent(plantId, msg);

                mqttClient.publish(`smartsprout/plant/${plantId}/heater`, JSON.stringify({status: 'OFF'}));
            }

            // wentylacja
            if (hum > 90 && !payload.fan) {
                const msg = `Wilgoć na poziomie: ${hum}. Włączam wentylator.`;
                logSystemEvent(plantId, msg);

                mqttClient.publish(`smartsprout/plant/${plantId}/fan`, JSON.stringify({status: 'ON'}));
            }
            else if (hum < 60 && payload.fan) {
                const msg = `Wilgoć na poziomie: ${hum}. Wyłączam wentylator.`;
                logSystemEvent(plantId, msg);

                mqttClient.publish(`smartsprout/plant/${plantId}/fan`, JSON.stringify({status: 'OFF'}));
            }
        }

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
    // tworzenie tabel

    // uzytkownicy
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, role TEXT)`);

    // rosliny
    db.run(`CREATE TABLE IF NOT EXISTS plants (id INTEGER PRIMARY KEY, name TEXT, owner_id INTEGER, temperature REAL DEFAULT 0, humidity INTEGER DEFAULT 50, heater_status INTEGER DEFAULT 0, fan_status INTEGER DEFAULT 0)`);
    
    // wiadomosci
    db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, sender_id INTEGER, receiver_id INTEGER, content TEXT, sender_name TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // logi
    db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, plant_id INTEGER, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP )`);

    // automatyczne utworzenie konta admina
    const adminPassword = 'admin123';
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync(adminPassword, salt);

    db.run(`DELETE FROM users WHERE username = 'admin'`, [], (err) => {
        // potem tworzymy go na nowo z ID = 1
        db.run(`INSERT INTO users (id, username, password, role) VALUES (1, 'admin', ?, 'admin')`, [adminHash], (err) => {
            if (!err) console.log("System: Konto Administratora zresetowane (ID: 1, login: admin)");
            else console.log("Info: Admin już istnieje lub błąd:", err.message);
        });
    });
});

// PAMIEC SESJI

// tokeny
const sessions = {};

const authenticate = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization'];

    if (!token || !sessions[token]) {
        return res.status(401).json({ error: "Brak dostępu. Zaloguj się."});
    }

    req.user = sessions[token];
    req.token = token;
    next();
}

// !!! API !!!

// ENDPOINTY REJESTRACJI I LOGOWANIA

// POST -> rejestracja
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

// POST -> logowanie
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (!user) return res.status(400).json({error: "Błędny login lub hasło."});

        // sprawdzenie haszowanego hasla
        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(400).json({error: "Błędny login lub hasło."});

        const token = uuidv4();
        sessions[token] = { userId: user.id, role: user.role, username: user.username };

        // ustawianie ciasteczka
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 3600000 // godzina
        });

        res.json({ 
            role: user.role, 
            username: user.username, 
            userId: user.id
        });
    });
});

// POST -> wylogowanie
app.post('/api/logout', (req, res) => {
    // pobranie tokenu z ciasteczka
    const token = req.cookies.token;

    if (token) delete sessions[token];

    // usuniecie ciasteczka z przegladarki
    res.clearCookie('token');
    res.json({success: true});
});

// API UZYTKOWNIKOW

// GET -> lista wszystkich uzytkownikow
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

// PUT -> zmiana nazwy uzytkownika
app.put('/api/users/:id/username', authenticate, (req, res) => {
    const targetId = req.params.id;
    const { newUsername } = req.body;

    if (!newUsername) return res.status(400).json({error: "Podaj nową nazwę."});

    // tylko admin lub wlasciciel moze zmienic nazwe konta
    if (req.user.role !== 'admin' && String(req.user.userId) !== String(targetId)) {
        return res.status(403).json({error: "Możesz zmienić tylko własną nazwę."});
    }

    db.run("UPDATE users SET username = ? WHERE id = ?", [newUsername, targetId], function(err) {
        if (err) return res.status(500).json({error: "Nazwa zajęta lub błąd bazy."});

        // aktualizacja sesji w pamieci RAM
        // musimy znalezc sesje tego uzytkownika i zaktualizowac w niej imie zeby po odswiezeniu strony frontend dostal nowe dane
        
        // aktualizacja biezacej sesji (jeśli to user zmienia sobie)
        if (sessions[req.token] && String(sessions[req.token].userId) === String(targetId)) {
            sessions[req.token].username = newUsername;
        }

        // aktualizacja wszystkich sesji tego usera (jesli jest na wielu urzadzeniach)
        Object.keys(sessions).forEach(key => {
            if (String(sessions[key].userId) === String(targetId)) {
                sessions[key].username = newUsername;
            }
        });

        res.json({ success: true, newUsername });
    });
});

// DELETE -> usuwanie uzytkownika
app.delete('/api/users/:id', authenticate, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({error: "Brak uprawnień."});
    const idToDelete = req.params.id;
    if (String(idToDelete) === '1') return res.status(400).json({error: "Nie można usunąć admina."});

    db.serialize(() => {
        // najpierw usuwamy rosliny i logi danego uzytkownika
        db.run("DELETE FROM plants WHERE owner_id = ?", idToDelete);
        db.run("DELETE FROM logs WHERE plant_id IN (SELECT id FROM plants WHERE owner_id = ?)", idToDelete);
        
        db.run("DELETE FROM users WHERE id = ?", idToDelete, function(err) {
            if (err) return res.status(500).json({error: err.message});
            res.json({ success: true, message: "Użytkownik usunięty." });
        });
    });
});

// API ROSLIN

// GET -> pobranie listy roslin
app.get('/api/plants', authenticate, (req, res) => {
    let sql = "SELECT * FROM plants";
    let params = [];
    let conditions = []; // uzywane do "sklejenia" zapytania SQL ze wszystkich wymagan wyszukiwania

    // jesli admin widzi to widzi rosliny uzytkownika ktorego wybral
    if (req.user.role === "admin") {
        if (req.query.userId) {
            conditions.push("owner_id = ?");
            params.push(req.query.userId);
        } else {
            conditions.push("owner_id = ?");
            params.push(req.user.userId);
        }
    // jesli nie to tylko swoje rosliny
    } else {
        conditions.push("owner_id = ?");
        params.push(req.user.userId);
    }

    // wyszukiwanie roslin po nazwie
    if (req.query.search) {
        conditions.push("name LIKE ?");
        params.push(`%${req.query.search}%`);
    }

    // zapytanie sql wg conditions
    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
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
        console.log(`Wysłano komendę podlewania dla rośliny ID: ${id}`);
        
        // log
        logSystemEvent(id, "Użytkownik ręcznie uruchomił podlewanie.");
        res.json({ success: true, message: "Podlewanie uruchomione..." });
    });
});

// PUT -> aktualizacja nazwy rosliny
app.put('/api/plants/:id', authenticate, (req, res) => {
    const id = req.params.id;
    const { name } = req.body;

    if (!name) return res.status(400).json({error: "Podaj nową nazwę rośliny."});

    // admin moze edytowac wszystko a uzytkownik tylko swoje
    let sql = "UPDATE plants SET name = ? WHERE id = ?";
    let params = [name, id];

    if (req.user.role !== 'admin') {
        sql += " AND owner_id = ? ";
        params.push(req.user.userId);
    }

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({error: err.message});

        // jesli nic sie nie zmieni
        if (this.changes === 0) {
            return res.status(404).json({error: "Wystąpił błąd."})
        }

        // log
        logSystemEvent(id, `Zmieniono nazwę rośliny na: "${name}"`);

        res.json({ success: true, message: "Zaktualizowano nazwę rośliny." })
    });
});

// API LOGOW

// GET -> pobranie ostatnich logow
app.get('/api/logs', authenticate, (req, res) => {
    // admin widzi wszystkie, uzytkownicy tylko swoje
    let sql = `SELECT l.id, l.message, l.timestamp, p.name as plant_name, u.username FROM logs l JOIN plants p ON l.plant_id = p.id JOIN users u ON p.owner_id = u.id`;
    let params = []

    // nie admin
    if (req.user.role !== 'admin') {
        sql += " WHERE p.owner_id = ?";
        params.push(req.user.userId);
    }

    // wyswietlamy 50 ostatnich logow
    sql += " ORDER BY l.timestamp DESC LIMIT 50"

    // bierzemy wszystko z bazy danych ktore spelnia te warunki
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
})

// DELETE -> usuwanie logow
app.delete('/api/logs/:id', authenticate, (req, res) => {
    // tylko admin może czyscic historie
    if (req.user.role !== 'admin') return res.status(403).json({error: "Tylko admin może usuwać logi."});
    
    const logId = req.params.id;
    db.run("DELETE FROM logs WHERE id = ?", logId, function(err) {
        if (err) return res.status(500).json({error: err.message});
        res.json({ success: true });
    });
});

// OBSLUGA WEBSOCKET + logi do debugowania

io.on('connection', (socket) => {
    console.log('Nowy klient WebSocket:', socket.id);

    socket.on('identify', (userId) => {
        // uzytkownik dolacza do swojego dedykowanego pokoju
        socket.join(`user_${userId}`);

        // admin dolacza do pokoju admins
        if (String(userId) === "1") {
            socket.join('admins');
            console.log("Administrator dołączył do pokoju adminów");
        }
        console.log(`Zidentyfikowano użytkownika ID: ${userId}`);
    });

    socket.on('get_active_chats', () => {
        const sql = `SELECT id, username FROM users WHERE role != 'admin'`;
        db.all(sql, [], (err, rows) => {
            if (!err) socket.emit('active_chats_list', rows);
        });
    });

    socket.on('get_history', (targetUserId) => {
        const sql = `
            SELECT content, sender_id, sender_name, timestamp 
            FROM messages 
            WHERE (sender_id = ? AND receiver_id = 1) 
               OR (sender_id = 1 AND receiver_id = ?)
            ORDER BY timestamp ASC
        `;
        db.all(sql, [targetUserId, targetUserId], (err, rows) => {
            if (!err) socket.emit('chat_history', rows);
        });
    });

    socket.on('user_message', (data) => {
        const { userId, username, content } = data;
        
        db.run("INSERT INTO messages (sender_id, receiver_id, content, sender_name) VALUES (?, 1, ?, ?)", 
            [userId, content, username]);

        // wiadomosc od uzytkownika wysylana do pokoju admins (czyli do admina)
        io.to('admins').emit('admin_new_message', { fromId: userId, fromName: username, content: content });
    });

    socket.on('admin_reply', (data) => {
        const { targetUserId, content } = data;

        db.run("INSERT INTO messages (sender_id, receiver_id, content, sender_name) VALUES (1, ?, ?, 'Admin')", 
            [targetUserId, content]);

        // admin wysyla wiadomosc do uzytkownika po jego id
        io.to(`user_${targetUserId}`).emit('new_message', { 
            fromName: 'Admin', 
            content: content 
        });
    });

    socket.on('disconnect', () => {
        console.log('Klient rozłączony:', socket.id);
    });
});

// start serwera
server.listen(PORT, () => {
    console.log(`Serwer działa na http://localhost:${PORT}`);
});