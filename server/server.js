// IMPORTY
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
// do szyfrowania hasel
const bcrypt = require('bcryptjs'); 
// do generowania tokenow
const { v4: uuidv4 } = require('uuid');
// mqtt
const mqtt = require('mqtt');
// ws
// const http = require('http');
const { Server } = require("socket.io");
// const { Socket } = require('dgram');
// cookies
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3000;

// wczytanie certyfikatow openssl
const options = {
    key: fs.readFileSync(path.join(__dirname, '../key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../cert.pem'))
};

const server = https.createServer(options, app);
const io = new Server(server);

// app.use

app.use(cors());

// do obslugi json
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// uzywamy ciasteczek
app.use(cookieParser());

// DODAWANIE LOGOW DO TABELI
function logSystemEvent(plantId, message) {
    console.log(`[LOG] Roślina ${plantId}, ${message}`);

    db.run("INSERT INTO logs (plant_id, message) VALUES (?, ?)", [plantId, message], (err) => { if (err) console.log("Błąd zapisu logu:", err.message);
    });
}

// KONFIGURACJA MQTT

// hiveMQ lokalnie
const MQTT_BROKER = 'mqtt://localhost'; 
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
        // topic: np smartsprout/plant/1/data
        const topicParts = topic.split('/');
        const plantId = topicParts[2];

        if (topicParts[3] === 'data') {
            const temp = parseFloat(payload.temp);
            const hum = parseInt(payload.humidity);
            const heaterVal = payload.heater ? 1 : 0;
            const fanVal = payload.fan ? 1 : 0;

            // aktualizacja w bazie
            db.run(
                "UPDATE plants SET temperature = ?, humidity = ?, heater_status = ?, fan_status = ? WHERE id = ?", 
                [temp, hum, heaterVal, fanVal, plantId],
                (err) => {
                    if (err) return console.error("Błąd SQL update:", err.message);

                    // pobranie id wlasciciela rosliny zeby wiadomo bylo do kogo wyslac powiadomienie
                    db.get("SELECT owner_id FROM plants WHERE id = ?", [plantId], (err, row) => {
                        if (row) {
                            // wysylanie live data przez websocket
                            
                            // do wlasciciela rosliny
                            io.to(`user_${row.owner_id}`).emit('plant_update', {
                                plantId: plantId,
                                temp: temp,
                                humidity: hum,
                                heater: heaterVal,
                                fan: fanVal,
                                ownerId: row.owner_id
                            });

                            // do admina (zmiany w podgladzie)
                            io.to('admins').emit('plant_update', {
                                plantId: plantId,
                                temp: temp,
                                humidity: hum,
                                heater: heaterVal,
                                fan: fanVal,
                                ownerId: row.owner_id
                            });
                        }
                    });
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
    db.run(`CREATE TABLE IF NOT EXISTS plants (id INTEGER PRIMARY KEY, name TEXT, owner_id INTEGER, temperature REAL DEFAULT 0, humidity INTEGER DEFAULT 50, heater_status INTEGER DEFAULT 0, fan_status INTEGER DEFAULT 0, min_humidity INTEGER DEFAULT 20)`);
    
    // wiadomosci
    db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, sender_id INTEGER, receiver_id INTEGER, content TEXT, sender_name TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // logi
    db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, plant_id INTEGER, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP )`);

    // komentarze
    db.run(`CREATE TABLE IF NOT EXISTS comments ( id INTEGER PRIMARY KEY, plant_id INTEGER, user_id INTEGER, username TEXT, content TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // polubienia
    db.run(`CREATE TABLE IF NOT EXISTS likes ( user_id INTEGER, plant_id INTEGER, PRIMARY KEY (user_id, plant_id))`);

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

// CREATE -> rejestracja
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

// CREATE -> logowanie
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

// DELETE -> wylogowanie
app.post('/api/logout', (req, res) => {
    // pobranie tokenu z ciasteczka
    const token = req.cookies.token;

    if (token) delete sessions[token];

    // usuniecie ciasteczka z przegladarki
    res.clearCookie('token');
    res.json({success: true});
});

// API UZYTKOWNIKOW

// READ -> lista wszystkich uzytkownikow
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

// UPDATE -> zmiana nazwy uzytkownika
app.put('/api/users/:id/username', authenticate, (req, res) => {
    const targetId = req.params.id;
    const { newUsername } = req.body;

    if (!newUsername) return res.status(400).json({error: "Podaj nową nazwę."});

    // nie mozna zmienic nazwy admina
    if (String(targetId) === '1') {
        return res.status(403).json({error: "Nie można zmienić nazwy administratora."});
    }

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

        if (String(req.user.userId) !== String(targetId)) {
            // sygnal websocket do uzytkownika ktoremu admin zmienil nazwe zeby zmienila sie od razu
            io.to(`user_${targetId}`).emit('force_refresh_profile', { newName: newUsername });
        }

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

// READ -> pobranie listy roslin
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

// CREATE -> dodanie rosliny do listy
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

// symulacja podlewania roslin
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

// UPDATE -> aktualizacja nazwy rosliny
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

// READ -> pobranie ostatnich logow
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
        socket.userId = userId;
        socket.username = data.username;

        // uzytkownik dolacza do swojego dedykowanego pokoju
        socket.join(`user_${userId}`);

        // admin dolacza do pokoju admins
        if (String(userId) === "1") {
            socket.join('admins');
            console.log("Administrator dołączył do pokoju adminów");
        }
        console.log(`Zidentyfikowano użytkownika ${data.username} ID: ${userId}`);
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

    // NOWE FUNKCJONALNOSCI WEBSOCKET

    // polubienie rosliny
    socket.on('like_plant', (plantId) => {
        const userId = socket.userId;
        const username = sessions[socket.handshake.headers.cookie?.split('token=')[1]?.split(';')[0]]?.username || "Ktoś"; 

        if (!userId) return;

        db.get("SELECT * FROM likes WHERE user_id = ? AND plant_id = ?", [userId, plantId], (err, row) => {
            if (!row) {
                // polubienie
                db.run("INSERT INTO likes (user_id, plant_id) VALUES (?, ?)", [userId, plantId], () => {
                    // liczenie
                    db.get("SELECT COUNT(*) as count FROM likes WHERE plant_id = ?", [plantId], (err, res) => {
                        io.emit('update_likes', { plantId: plantId, count: res.count }); // update licznika dla wszystkich

                        // powiadomienie dla wlasciciela
                        // czyja to roslina
                        db.get("SELECT owner_id, name FROM plants WHERE id = ?", [plantId], (err, plant) => {
                            // nie wysylamy powiadomienia samemu sobie
                            if (plant && String(plant.owner_id) !== String(userId)) {
                                io.to(`user_${plant.owner_id}`).emit('notification', {
                                    type: 'like',
                                    text: `Użytkownik ${username} polubił Twoją roślinę: ${plant.name} ❤️`
                                });
                            }
                        });
                    });
                });
            } else {
                // usuniecie polubienia
                db.run("DELETE FROM likes WHERE user_id = ? AND plant_id = ?", [userId, plantId], () => {
                    db.get("SELECT COUNT(*) as count FROM likes WHERE plant_id = ?", [plantId], (err, res) => {
                        io.emit('update_likes', { plantId: plantId, count: res.count });
                    });
                });
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('Klient rozłączony:', socket.id);
    });
});

// NOWE FUNKCJONALNOSCI CRUD

// READ -> pobranie danych jednej konkretnej rosliny
app.get('/api/plants/:id', authenticate, (req, res) => {
    const { id } = req.params;
    
    db.get("SELECT * FROM plants WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: "Błąd bazy danych" });
        if (!row) return res.status(404).json({ error: "Nie znaleziono rośliny" });

        // sprawdzenie czy to roslina tego uzytkownika (lub to admin patrzy)
        if (req.user.role !== 'admin' && String(row.owner_id) !== String(req.user.userId)) {
            return res.status(403).json({ error: "Brak dostępu do tej rośliny." });
        }

        res.json(row);
    });
});

// UPDATE -> zmiana min humidity do wystapienia alarmu
app.put('/api/plants/:id/settings', authenticate, (req, res) => {
    const { id } = req.params;
    const { minHumidity } = req.body;

    if (minHumidity === undefined) return res.status(400).json({ error: "Brak danych" });

    let sql = "UPDATE plants SET min_humidity = ? WHERE id = ?";
    let params = [minHumidity, id];

    if (req.user.role !== 'admin') {
        sql += " AND owner_id = ?";
        params.push(req.user.userId);
    }

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: "Błąd bazy danych" });
        if (this.changes === 0) return res.status(403).json({ error: "Brak uprawnień lub nie znaleziono rośliny." });

        logSystemEvent(id, `Zmieniono próg alarmu wilgotności na: ${minHumidity}%`);
        res.json({ success: true, minHumidity });
    });
});

// DELETE -> usuniecie wszystkich logow danej rosliny bez usuwania rosliny
app.delete('/api/plants/:id/logs', authenticate, (req, res) => {
    const { id } = req.params;

    // czy roslina jest uzytkownika
    db.get("SELECT owner_id FROM plants WHERE id = ?", [id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Roślina nie istnieje" });

        if (req.user.role !== 'admin' && String(row.owner_id) !== String(req.user.userId)) {
            return res.status(403).json({ error: "To nie twoja roślina." });
        }

        // usuwanie logow
        db.run("DELETE FROM logs WHERE plant_id = ?", [id], function(err) {
            if (err) return res.status(500).json({ error: "Błąd usuwania logów" });
            
            // dodanie logu o usunieciu
            logSystemEvent(id, "Historia zdarzeń została ręcznie wyczyszczona.");
            res.json({ success: true, message: "Historia wyczyszczona." });
        });
    });
});

// API KOMENTARZY

// READ -> pobranie komentarzy danej rosliny
app.get('/api/plants/:id/comments', authenticate, (req, res) => {
    const { id } = req.params;
    db.all("SELECT * FROM comments WHERE plant_id = ? ORDER BY timestamp DESC", [id], (err, rows) => {
        if (err) return res.status(500).json({ error: "Błąd bazy" });
        res.json(rows);
    });
});

// CREATE -> dodanie komentarza
app.post('/api/plants/:id/comments', authenticate, (req, res) => {
    const { id } = req.params;  // id rosliny
    const { content } = req.body;
    
    if (!content) return res.status(400).json({ error: "Komentarz nie może być pusty." });

    db.run("INSERT INTO comments (plant_id, user_id, username, content) VALUES (?, ?, ?, ?)",
        [id, req.user.userId, req.user.username, content],
        function(err) {
            if (err) return res.status(500).json({ error: "Błąd dodawania" });
            
            const newComment = {
                id: this.lastID,
                plant_id: id,
                user_id: req.user.userId,
                username: req.user.username,
                content: content,
                timestamp: new Date()
            };

            // wyslanie przez websocket ze jest nowy komentarz
            io.emit('plant_new_comment', newComment);

            res.json(newComment);
        }
    );
});

// UPDATE -> edycja swojego komentarza
app.put('/api/comments/:id', authenticate, (req, res) => {
    const { id } = req.params; // id komentarza
    const { content } = req.body;

    if (!content) return res.status(400).json({ error: "Treść wymagana" });

    // czy komentarz tego uzytkownika czy admina
    db.get("SELECT user_id FROM comments WHERE id = ?", [id], (err, row) => {
        if (!row) return res.status(404).json({ error: "Nie znaleziono komentarza" });
        
        if (req.user.role !== 'admin' && String(row.user_id) !== String(req.user.userId)) {
            return res.status(403).json({ error: "Możesz edytować tylko swoje komentarze." });
        }

        db.run("UPDATE comments SET content = ? WHERE id = ?", [content, id], function(err) {
            if (err) return res.status(500).json({ error: "Błąd edycji" });
            res.json({ success: true, content });
        });
    });
});

// READ -> pobierz rosliny wszystkich
app.get('/api/community/plants', authenticate, (req, res) => {
    const userId = req.user.userId;
    
    const sql = `
        SELECT p.*, u.username as owner_name, 
        (SELECT COUNT(*) FROM likes WHERE plant_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM likes WHERE plant_id = p.id AND user_id = ?) as is_liked_by_me
        FROM plants p 
        JOIN users u ON p.owner_id = u.id 
        ORDER BY p.id DESC
    `;
    
    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: "Błąd bazy" });
        res.json(rows);
    });
});

// start serwera
server.listen(PORT, () => {
    console.log(`Serwer HTTPS działa na http://localhost:${PORT}`);
});