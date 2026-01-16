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

const WATERING_SPEED = 20; // ile % przybywa w jednym cyklu przy podlewaniu
const DRYING_SPEED = 2; // ile % ubywa w normalnym czasie bez podlewania

client.on('connect', () => {
    console.log("Symulator połączony z MQTT");
    
    // nasluchiwanie na komendy podlewania dla wszystkich roslin
    client.subscribe('smartsprout/plant/+/water');
    
    // petla symulacji co 5 sekund
    setInterval(simulateLoop, 1000);
});

// obsluga komendy podlewania (subscriber)
client.on('message', (topic, message) => {
    // topic: smartsprout/plant/5/water
    const plantId = topic.split('/')[2];
    console.log(`Otrzymano sygnał podlewania dla rośliny ID: ${plantId}`);
    
    // zaczyna sie podlewanie
    if (plantsState[plantId]) {
        plantsState[plantId].isWatering = true;
    }
});

function simulateLoop() {
    // pobranie listy roslin z bazy
    db.all("SELECT id FROM plants", [], (err, rows) => {
        if (err) return;

        rows.forEach(row => {
            const id = row.id;

            // inicjalizacja dla nowej rosliny
            if (!plantsState[id]) {
                plantsState[id] = { 
                    humidity: 100, 
                    temp: 20 + Math.random() * 5,
                    isWatering: false // domyslnie roslina nie jest podlewana
                };
            }

            // logika zmian stanu roslin

            if (plantsState[id].isWatering) {
                // dla trybu PODLEWANIA
                plantsState[id].humidity += WATERING_SPEED;
                
                // spadek temperatury przy podlewaniu
                plantsState[id].temp -= 0.2; 

                // czy pelne nawodnienie
                if (plantsState[id].humidity >= 100) {
                    plantsState[id].humidity = 100;
                    plantsState[id].isWatering = false; // koniec podlewania
                    console.log(`Roślina ID ${id} w pełni nawodniona.`);
                }

            } else {
                // dla trybu WYSYCHANIA
                // losowo od 0 do DRYING_SPEED
                let drop = Math.floor(Math.random() * DRYING_SPEED) + 1;
                plantsState[id].humidity -= drop;
                
                // zeby wilgotnosc nie byla ujemna
                if (plantsState[id].humidity < 0) plantsState[id].humidity = 0;

                let tempChange = (Math.random() - 0.5); 
                plantsState[id].temp += tempChange;
            }

            // ograniczniki temperatury
            if(plantsState[id].temp < 15) plantsState[id].temp = 15;
            if(plantsState[id].temp > 30) plantsState[id].temp = 30;

            // "publikacja" wynikow
            const topic = `smartsprout/plant/${id}/data`;
            const payload = JSON.stringify({
                temp: plantsState[id].temp.toFixed(1),
                humidity: plantsState[id].humidity
            });

            client.publish(topic, payload);
        });
    });
}