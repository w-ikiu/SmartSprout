const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// polaczenie z tym samym brokerem co serwer
const MQTT_BROKER = 'mqtt://test.mosquitto.org';
const client = mqtt.connect(MQTT_BROKER);

// polaczenie z baza danych aby miec dostep do roslin
const db_path = path.join(__dirname, '../data/database.db');
const db = new sqlite3.Database(db_path);

// pamiec podreczna stanu roslin (symulacja stanu)
// { plantId: { humidity: 80, temp: 22 } }
let plantsState = {};

client.on('connect', () => {
    console.log("Symulator połączony z MQTT");
    
    // nasluchiwanie na komendy podlewania dla wszystkich roslin
    client.subscribe('smartsprout/plant/+/water');
    
    // petla symulacji co 5 sekund
    setInterval(simulateLoop, 5000);
});

// Obsługa komendy podlewania (Subscriber)
client.on('message', (topic, message) => {
    // topic: smartsprout/plant/5/water
    const plantId = topic.split('/')[2];
    console.log(`💦 Otrzymano sygnał podlewania dla rośliny ID: ${plantId}`);
    
    // "Fizyczne" nawodnienie gleby do 100%
    if (plantsState[plantId]) {
        plantsState[plantId].humidity = 100;
        // Opcjonalnie: lekkie ochłodzenie gleby po podlaniu
        plantsState[plantId].temp -= 1;
    }
});

function simulateLoop() {
    // 1. Pobierz aktualną listę roślin z bazy (gdyby ktoś dodał nową)
    db.all("SELECT id FROM plants", [], (err, rows) => {
        if (err) return;

        rows.forEach(row => {
            const id = row.id;

            // Jeśli nie mamy tej rośliny w pamięci, inicjalizujemy ją
            if (!plantsState[id]) {
                plantsState[id] = { 
                    humidity: 100, // Startowa wilgotność
                    temp: 20 + Math.random() * 5 // Losowa temp 20-25 stopni
                };
            }

            // 2. SYMULACJA ZMIAN (Fizyka)
            
            // Wilgotność spada (ziemia wysycha)
            // Losowo od 1 do 3% co cykl
            let drop = Math.floor(Math.random() * 3) + 1;
            plantsState[id].humidity -= drop;
            if (plantsState[id].humidity < 0) plantsState[id].humidity = 0;

            // Temperatura się waha (symulacja dnia/pogody z internetu)
            // Zmieniamy o -0.5 do +0.5 stopnia
            let tempChange = (Math.random() - 0.5); 
            plantsState[id].temp += tempChange;
            // ograniczniki, temperatura nie moze przekroczyc niektorych danych
            if(plantsState[id].temp < 15) plantsState[id].temp = 15;
            if(plantsState[id].temp > 30) plantsState[id].temp = 30;

            // "publikacja" wynikow
            const topic = `smartsprout/plant/${id}/data`;
            const payload = JSON.stringify({
                temp: plantsState[id].temp.toFixed(1),
                humidity: plantsState[id].humidity
            });

            client.publish(topic, payload);
            console.log(`Wysłano [${topic}]: ${payload}`);
        });
    });
}