const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// do obslugi json
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// BAZA DANYCH
const db_path = path.join(__dirname, '../data/database.db');
const db = new sqlite3.Database(db_path, (err) => {
    if (err) console.error("Błąd bazy danych:", err.message);
    else console.log("Połączono z bazą SQLite.");
});

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS plants (id INTEGER PRIMARY KEY, name TEXT)");
    // testowa roslina
    db.run("INSERT OR IGNORE INTO plants (id, name) VALUES (1, 'Testowa Paprotka')");
});

// API

// GET -> pobranie listy roslin
app.get('api/plants', (req, res) => {
    db.all("SELECT * FROM PLANTS", [], (err, rows) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

// POST - dodanie rosliny do listy
app.post('/api/plants', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({error: "Nie podano nazwy."});
    
    db.run("INSERT INTO plants (name) VALUES (?)", [name], function(err) {
        if (err) return res.status(500).json({error: err.message});
        res.json({ id: this.lastID, name: name });
    });
});

// pliki z public
app.use(express.static(path.join(__dirname, '../public')));

// start serwera
app.listen(PORT, () => {
    console.log(`Serwer działa na http://localhost:${PORT}`);
});