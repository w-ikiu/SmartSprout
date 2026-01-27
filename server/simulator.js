const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// polaczenie z tym samym brokerem co serwer
const MQTT_BROKER = 'mqtt://localhost';
const client = mqtt.connect(MQTT_BROKER);

// polaczenie z baza danych aby miec dostep do roslin
const db_path = path.join(__dirname, '../data/database.db');
const db = new sqlite3.Database(db_path);

// pamiec podreczna stanu roslin (symulacja stanu)
let plantsState = {};

const WATERING_SPEED = 20; // ile % przybywa w jednym cyklu przy podlewaniu
const DRYING_SPEED = 2; // ile % ubywa w normalnym czasie bez podlewania

client.on('connect', () => {
    console.log("Symulator połączony.");
    
    // nasluchiwanie na wszystkie komendy -> + czyli ze wszystkich poziomow (wszystkich roslin po id)
    client.subscribe('smartsprout/plant/+/water');
    client.subscribe('smartsprout/plant/+/heater');
    client.subscribe('smartsprout/plant/+/fan');
    
    // petla symulacji co 1 sekunde - co sekunde wysyla dane (publish) bo wywolujemy funkcje simulateLoop ktora za to odpowiada
    setInterval(simulateLoop, 1000); 
});

// obsluga komend z serwera (subscriber)
// jesli np uzytkownik kliknie na "podlej" to symulator dostaje wiadomosc przez mqtt od serwera ze ma wykonac podlewanie dla danego id
client.on('message', (topic, message) => {
    try {
        const parts = topic.split('/');
        const plantId = parts[2];
        const action = parts[3]; // 'water', 'heater' lub 'fan'
        
        // inicjalizacja jesli nie istnieje
        if (!plantsState[plantId]) return;

        const payload = JSON.parse(message.toString());

        if (action === 'water') {
            // podlewanie
            console.log(`[ID ${plantId}] Podlewanie...`);
            plantsState[plantId].isWatering = true;
        } 
        else if (action === 'heater') {
            // grzejnik wlaczony lub wylaczony
            plantsState[plantId].heaterOn = (payload.status === 'ON');
            console.log(`[ID ${plantId}] Grzejnik: ${payload.status}`);
        } 
        else if (action === 'fan') {
            // wentylator wlaczony lub wylaczony
            plantsState[plantId].fanOn = (payload.status === 'ON');
            console.log(`[ID ${plantId}] Wentylator: ${payload.status}`);
        }
    } catch (e) {
        console.error("Błąd odczytu komendy:", e);
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
                    humidity: 50, 
                    temp: 20 + Math.random() * 5,
                    // domyslnie wylaczone
                    isWatering: false,
                    heaterOn: false,
                    fanOn: false
                };
            }

            // logika zmian stanu roslin

            // 1. wilgotnosc
            if (plantsState[id].isWatering) {
                // dla trybu PODLEWANIA
                plantsState[id].humidity += WATERING_SPEED;
                plantsState[id].temp -= 0.2;
                
                // czy pelne nawodnienie
                if (plantsState[id].humidity >= 100) {
                    plantsState[id].humidity = 100;
                    plantsState[id].isWatering = false;
                }
            } else {
                // dla trybu WYSYCHANIA
                let drop = Math.floor(Math.random() * DRYING_SPEED) + 1;
                
                // jesli wiatrak wlaczony to schnie szybciej
                if (plantsState[id].fanOn) drop += 5; 
                
                plantsState[id].humidity -= drop;

                // zeby wilgotnosc nie byla ujemna
                if (plantsState[id].humidity < 0) plantsState[id].humidity = 0;
                
                // wahania temperatury
                let tempChange = (Math.random() - 0.5); 
                plantsState[id].temp += tempChange;
            }

            // 2. temperatura (reakcja na grzejnik)
            if (plantsState[id].heaterOn) {
                plantsState[id].temp += 1.5; // temperatura rosnie szybko jesli grzejnik jest wlaczony
            }

            // ograniczniki temperatury
            if(plantsState[id].temp < 10) plantsState[id].temp = 10;
            if(plantsState[id].temp > 35) plantsState[id].temp = 35;


            // "publikacja" wynikow
            const topic = `smartsprout/plant/${id}/data`;
            // wazne: wysylamy stan heater/fan z powrotem do serwera
            const payload = JSON.stringify({
                temp: plantsState[id].temp.toFixed(1),
                humidity: plantsState[id].humidity,
                heater: plantsState[id].heaterOn,
                fan: plantsState[id].fanOn
            });

            client.publish(topic, payload);
        });
    });
}