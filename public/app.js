// polaczenie ws
const socket = io();

// nasluchiwanie na polaczenie uzytkownika
socket.on('connect', () => {
    console.log("Połączono z serwerem WS. ID:", socket.id)
})

let ROLE = localStorage.getItem('role');
let USERNAME = localStorage.getItem('username');

// zamiast if(TOKEN) sprawdzamy sesję na serwerze
checkSession();

async function checkSession() {
    // proba pobrania listy roslin
    // jesli jest cookie, serwer zwroci 200, jesli nie 401
    try {
        const res = await fetch('/api/plants');
        if (res.ok) {
            showApp();
        } else {
            // jesli brak sesji upewniamy sie ze UI jest czyste
            document.getElementById('loginView').style.display = 'block';
            document.getElementById('appView').style.display = 'none';
        }
    } catch (e) {
        console.error("Błąd sprawdzania sesji:", e);
    }
}

// funkcja pomocnicza dla admina ktora przechowuje id aktualnie przegladanego uzytkownika
let currentViewedUserId = null;

// AUTH
// logowanie/rejestracja
async function auth(action) {
    // action to 'login' albo 'register'
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;

    if (!user || !pass) return alert("Podaj login i hasło!");

    try {
        const res = await fetch(`/api/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Błąd połączenia");
        }

        if (action === 'register') {
            alert("Zarejestrowano pomyślnie! Teraz możesz się zalogować.");
        } else {
            // przy logowaniu zapisujemy dane do localStorage !!!
            localStorage.setItem('role', data.role);
            localStorage.setItem('username', data.username);
            localStorage.setItem('userId', data.userId);
            
            // aktualizacja zmiennych globalnych
            ROLE = data.role;
            USERNAME = data.username;
            
            showApp();
        }
    } catch (err) {
        alert(err.message);
    }
}

// wylogowanie
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
        console.log(e);
    }

    localStorage.clear();
    // przeladowanie zeby wrocic do "czystego" stanu
    location.reload();
}

// CHANGE USERNAME
// zmiana nazwy uzytkownika
async function changeUsername(id, currentName) {
    const newName = prompt(`Zaktualizuj nazwę: "${currentName}" na:`, currentName);

    if (!newName || newName === currentName) return;

    try {
        const res = await fetch(`/api/users/${id}/username`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newUsername: newName })
        });

        const data = await res.json();

        if (res.ok) {
            alert("Nazwa zmieniona pomyślnie!");
            
            // zmiana wlasnej nazwy
            if (String(id) === localStorage.getItem('userId')) {
                localStorage.setItem('username', newName);
                USERNAME = newName;
                document.getElementById('currentUser').innerText = newName;
            }
            
            // admin zmienia komus nazwe
            if (ROLE === 'admin') {
                loadUsersForAdmin(); // odswiezenie tabeli
                loadLogs(); // odswiezenie logow
            }
        } else {
            alert(data.error || "Błąd zmiany nazwy (lub jest zajęta).");
        }
    } catch (e) {
        console.error(e);
        alert("Błąd serwera.");
    }
}

// LOAD PLANTS
// pobieranie roslin

// query params do np filtrowania, jak filtruje przekazuje inna sciezke do serwera, np zeby wzial tylko pewne dane od uzytkownika o id 5
async function loadPlants(queryParams = '') {
    const res = await fetch(`/api/plants${queryParams}`);
    
    if (res.status === 401) { logout(); return; }

    const plants = await res.json();
    const list = document.getElementById('plantsList');
    list.innerHTML = '';

    if (plants.length === 0) {
        list.innerHTML = '<p style="width: 500px; text-align: center;">Brak roślin do wyświetlenia.</p>';
        return;
    }

    plants.forEach(p => {
        // kolor dla paska wilgotnosci
        let barClass = 'bar-green';
        if(p.humidity < 30) barClass = 'bar-orange';
        if(p.humidity < 10) barClass = 'bar-red';

        // html dla statusow
        const heaterHtml = p.heater_status === 1
            ? `<span class="status-badge status-on-heat">HEATER: ON</span>`
            : `<span class="status-badge status-off">HEATER: OFF</span>`;

        const fanHtml = p.fan_status === 1
            ? `<span class="status-badge status-on-fan">FAN: ON</span>`
            : `<span class="status-badge status-off">FAN: OFF</span>`;

        // budowanie kafelka
        const div = document.createElement('div');
        div.className = 'plant-item';
        div.innerHTML = `
            <button onclick="deletePlant(${p.id})" class="delete-btn" title="Usuń">&times</button>
            
            <div>
                <div class="plant-header">
                    <span class="plant-name">🌱 ${p.name}</span>
                </div>
                
                <div class="plant-stats">
                    <div class="stat-row">
                        <span>🌡️ Temp: <b>${p.temperature ? p.temperature.toFixed(1) : '--'}°C</b></span>
                        ${heaterHtml}
                    </div>
                    <div class="stat-row">
                        <span>💧 Wilgotność: <b>${p.humidity}%</b></span>
                        ${fanHtml}
                    </div>
                </div>

                <div class="humidity-bar-container">
                    <div class="humidity-bar-fill ${barClass}" style="width: ${p.humidity}%;"></div>
                </div>
            </div>

            <div class="plant-actions">
                <button onclick="waterPlant(${p.id})" class="plant-btn btn-water">
                    <span>💦</span> Podlej
                </button>
                
                <button onclick="editPlant(${p.id}, '${p.name}')" class="plant-btn btn-edit">
                    <span>✎</span> Edytuj
                </button>
                
                <button onclick="openSettings(${p.id})" class="plant-btn btn-settings">
                    <span>⚙️</span> Opcje
                </button>
            </div>
        `;
        list.appendChild(div);
    });
}

// EDIT PLANT
// zmiana nazwy rosliny
async function editPlant(id, oldName) {
    // okienko do wpisania zmienionej nazwy
    const newName = prompt("Wpisz nową nazwę dla rośliny:", oldName);

    // walidacja (nie da sie dodac pustego) jesli jest puste albo uzytkownik anulowal
    if (!newName || newName === oldName) return;

    try {
        // wyslanie zadania PUT do serwera
        const res = await fetch(`/api/plants/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: newName })
        });

        const data = await res.json();

        if (res.ok) {
            // jesli sukces to odswiezamy liste
            const currentSearch = document.getElementById('searchPlantInput').value;
            if (currentSearch) searchPlants();
            else loadPlants();
        } else {
            alert(data.error || "Błąd podczas zmiany nazwy.");
        }
    } catch (err) {
        console.error(err);
        alert("Błąd połączenia z serwerem.");
    }
}

// LOAD USERS FOR ADMIN
// wyswietlanie uzytkownikow dla admina
async function loadUsersForAdmin() {
    const res = await fetch('/api/users');
    const users = await res.json();

    const tbody = document.getElementById('usersListBody');
    tbody.innerHTML = '';

    users.forEach(u => {
        const tr = document.createElement('tr');
        
        tr.onclick = () => loadUserPlants(u.id, u.username);
        tr.style.cursor = 'pointer';

        tr.innerHTML = `
            <td>${u.id}</td>
            <td><b>${u.username}</b></td>
            <td style="text-align: right;">

                <button 
                    onclick="event.stopPropagation(); changeUsername(${u.id}, '${u.username}')"
                    style="background-color: #1976D2; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; margin-right: 5px;">
                    Edytuj
                </button>

                <button 
                    onclick="deleteUser(event, ${u.id}, '${u.username}')" 
                    style="background-color: #e53935; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">
                    Usuń
                </button>

            </td>
        `;
        
        tbody.appendChild(tr);
    })
}

// funkcja pomocniczna ladowania roslin danego uzytkownika
async function loadUserPlants(userId, username) {
    document.getElementById('adminMessage').innerText = `Przeglądasz rośliny użytkownika: ${username}`;
    currentViewedUserId = userId;
    
    // czyszczenie inputa przy zmianie uzytkownika
    document.getElementById('searchPlantInput').value = '';

    // pokazanie wyszukiwarki
    document.getElementById('plantSearchContainer').style.display = 'block';

    loadPlants(`?userId=${userId}`);
}

// DELETE USER
// usuwanie uzytkownika przez admina
async function deleteUser(event, id, username) {
    event.stopPropagation();

    // potwierdzenie usuniecia
    const confirmDelete = confirm(`UWAGA! \nCzy na pewno chcesz usunąć użytkownika "${username}"? \n\nZostaną usunięte również wszystkie jego rośliny i historia.`);
    
    if (!confirmDelete) return;

    try {
        const res = await fetch(`/api/users/${id}`, {
            method: 'DELETE'
        });

        const data = await res.json();

        if (res.ok) {
            alert("Użytkownik usunięty.");
            
            if (currentViewedUserId === id) {
                document.getElementById('plantsList').innerHTML = '<p>Użytkownik usunięty.</p>';
                document.getElementById('plantSearchContainer').style.display = 'none';
                document.getElementById('searchPlantInput').value = '';
                currentViewedUserId = null;
            }

            loadUsersForAdmin();
        } else {
            alert(data.error || "Błąd usuwania.");
        }
    } catch (e) {
        console.error(e);
        alert("Błąd serwera.");
    }
}

// ADD PLANT
// dodawanie roslin
async function addPlant() {
    const nameInput = document.getElementById('plantName');
    const name = nameInput.value;

    if(!name) return alert("Wpisz nazwę rośliny!");

    await fetch('/api/plants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    });

    nameInput.value = ''; // wyczyszczenie pola
    loadPlants(); // odswiezenie listy po dodaniu nowej rosliny
}

// DELETE PLANT
// usuwanie rosliny
async function deletePlant(id) {
    // potwierdzenie usuniecia
    if(!confirm("Czy na pewno chcesz usunąć tę roślinę?")) return;

    // wyslanie zadania DELETE do serwera
    await fetch(`/api/plants/${id}`, {
        method: 'DELETE'
    });

    // odswiezenie listy po usunieciu
    loadPlants();
}

// WATER PLANT
// podlewanie rosliny
async function waterPlant(id) {
    console.log(`Podlewanie ${id}...`);

    // zadanie do serwera
    try {
        const res = await fetch(`/api/plants/${id}/water`, {
            method: 'POST'
        });
        const data = await res.json();
        
        if(data.success) {
            // od razu odswiezenie jesli sukces, ale 500ms dla serwera na przetworzenie mqtt
            setTimeout(() => {
                const currentSearch = document.getElementById('searchPlantInput').value;
                if(currentSearch) searchPlants(); // odswiezenie z wyszukiwaniem
                else loadPlants(); // zwykle odswiezenie
            }, 500);
        }
    } catch (e) {
        alert("Błąd połączenia.");
    }
}

// SEARCH PLANTS
// wyszukiwarka
let searchTimeout = null;

function searchPlants() {
    const query = document.getElementById('searchPlantInput').value;

    if (searchTimeout) clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(() => {
        let queryParams = `?search=${query}`;

        if (ROLE === 'admin' && currentViewedUserId) {
            queryParams += `&userId=${currentViewedUserId}`;
        }
        
        loadPlants(queryParams);

    }, 300);
}

// ! ! ! SHOW APP ! ! !
// wyswietlanie aplikacji
function showApp() {
    // zmiana wyswietlania danych elementow jesli jestesmy zalogowani
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('appView').style.display = 'block';
    
    document.getElementById('plantSearchContainer').style.display = 'block';
    
    // nazwa uzytkownika wyswietlana
    const userLabel = document.getElementById('currentUser');
    userLabel.innerHTML = `${USERNAME} <span style="font-size:12px; cursor:pointer;" title="Zmień nazwę">✎</span>`;
    userLabel.style.cursor = 'pointer';
    userLabel.onclick = () => changeUsername(localStorage.getItem('userId'), USERNAME);

    document.getElementById('currentRole').innerText = ROLE;

    // logi wypisujace kim jest uzytkownik, do testow
    console.log("FRONTEND: Uruchamiam aplikację. Rola:", ROLE, "Login:", USERNAME);

    // czy wyswietlamy wersje dla admina czy dla uzytkownika
    if (USERNAME === 'admin' || ROLE === 'admin') {
        console.log("FRONTEND: Tryb Administratora");
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('userPanel').style.display = 'none';
        document.getElementById('plantsList').innerHTML = '<p style="text-align: center; width: 500px;">Kliknij użytkownika powyżej, aby zobaczyć jego rośliny.</p>';
        
        // ukrycie wyszukiwarki dopoki admin nie kliknie jakiegos uzytkownika
        document.getElementById('plantSearchContainer').style.display = 'none';

        loadUsersForAdmin();
    } else {
        console.log("FRONTEND: Tryb Użytkownika");
        document.getElementById('adminPanel').style.display = 'none';
        document.getElementById('userPanel').style.display = 'flex';
        document.getElementById('plantSearchContainer').style.display = 'block';
        loadPlants();
    }

    document.getElementById('chatButton').style.display = 'flex';

    // chat
    initChat();

    // logi
    loadLogs();
}

// FUNKCJONALNOSCI CHATU

// TOGGLE CHAT
// wyswietlanie i zamykanie chatu
function toggleChat() {
    const chatWindow = document.getElementById('chatWindow');
    if (chatWindow.style.display === 'none') {
        chatWindow.style.display = 'flex';
    } else {
        chatWindow.style.display = 'none';
    }
}

// APPEND MESSAGE
// tworzy HTML dymku wiadomosci
function appendMessage(content, type, senderName = null) {
    // type: 'me' lub 'other'
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `msg msg-${type}`;
    
    // wstawienie tresci wiadomosci
    div.innerHTML = content; 

    container.appendChild(div);

    // automatyczny scroll na dol
    container.scrollTop = container.scrollHeight;
}

// SEND MESSAGE
// wysylanie wiadomosci
function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value;
    if (!text) return;

    if (ROLE === 'admin') {
        // logika dla admina
        const targetId = document.getElementById('targetUserId').value;
        if (!targetId) return alert("Wybierz użytkownika z listy po lewej!");
        
        socket.emit('admin_reply', { targetUserId: targetId, content: text });
        appendMessage(text, 'me'); 
    } else {
        // logika dla uzytkownika
        const userId = localStorage.getItem('userId');
        const username = localStorage.getItem('username');
        
        socket.emit('user_message', { userId, username, content: text });
        appendMessage(text, 'me');
    }
    
    input.value = '';
}

// wysylanie wiadomosci enterem
document.getElementById('chatInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// inicjalizacja chatu
function initChat() {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        console.error("FRONTEND BŁĄD: Brak ID użytkownika!");
        return;
    }

    // log do testow
    console.log("FRONTEND: Inicjalizuję czat dla ID:", userId);

    socket.emit('identify', userId);

    // czyszczenie starych listenerow
    socket.off('admin_new_message');
    socket.off('new_message');
    socket.off('active_chats_list');
    socket.off('chat_history');
    socket.off('force_refresh_profile');

    socket.off('plant_update');

    // live dane od roslin
    socket.on('plant_update', (data) => {
        console.log("LIVE DATA:", data);

        // zwykly uzytkownik
        if (ROLE !== 'admin') {
            // czy cos jest w wyszukiwarce zeby nie odswiezyc wyszukan
            const searchValue = document.getElementById('searchPlantInput').value;
            // odswiezenie listy
            loadPlants(searchValue ? `?search=${searchValue}` : '');
        }
        
        // admin
        else if (ROLE === 'admin') {
            // admina odswiezamy jesli aktualnie patrzy na uzytkownika do ktorego nalezy ta roslina
            if (currentViewedUserId && String(data.ownerId) === String(currentViewedUserId)) {
                 const searchValue = document.getElementById('searchPlantInput').value;
                
                 let query = `?userId=${currentViewedUserId}`;
                 if (searchValue) query += `&search=${searchValue}`;
                 
                 loadPlants(query);
            }
        }
    });

    // automatyczne odswiezanie profilu jesli admin zmienil komus nazwe
    socket.on('force_refresh_profile', (data) => {
        console.log("Otrzymano sygnał zmiany nazwy:", data.newName);
        
        // aktualizacja localstorage
        localStorage.setItem('username', data.newName);
        
        // alert do uzytkownika
        if (localStorage.getItem('userId') === userId) {
            alert(`Twoja nazwa użytkownika została zmieniona przez administratora na: "${data.newName}". \nStrona zostanie odświeżona.`);
            
            // przeladowanie strony
            location.reload(); 
        }
    });

    if (USERNAME === 'admin' || ROLE === 'admin') {
        // dla admina
        document.getElementById('adminUserList').style.display = 'block';
        document.getElementById('chatTitle').innerText = "Panel Admina";
        
        socket.emit('get_active_chats');

        socket.on('active_chats_list', (users) => {
            const list = document.getElementById('adminUserList');
            list.innerHTML = '';
            
            if (users.length === 0) list.innerHTML = '<div style="padding:10px; font-size:12px;">Brak użytkowników</div>';

            users.forEach(u => {
                const btn = document.createElement('div');
                btn.innerText = u.username;
                btn.style.padding = "10px";
                btn.style.cursor = "pointer";
                btn.style.borderBottom = "1px solid #ccc";
                btn.style.background = "#fff";
                btn.id = `user-btn-${u.id}`;
                
                btn.onclick = () => {
                    Array.from(list.children).forEach(c => c.style.background = "#fff");
                    btn.style.background = "#d1e7dd";
                    
                    document.getElementById('targetUserId').value = u.id;
                    document.getElementById('chatMessages').innerHTML = '<div>Ładowanie...</div>';
                    socket.emit('get_history', u.id);
                };
                list.appendChild(btn);
            });
        });

        socket.on('chat_history', (messages) => {
            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = ''; 
            messages.forEach(m => {
                // kto wyslal wiadomosc
                const type = (String(m.sender_id) === "1") ? 'me' : 'other';
                appendMessage(m.content, type);
            });
        });

        socket.on('admin_new_message', (msg) => {
            const currentTarget = document.getElementById('targetUserId').value;
            
            console.log("Otrzymano wiadomość od:", msg.fromId, "Aktualnie wybrany:", currentTarget);

            if (currentTarget && String(currentTarget) === String(msg.fromId)) {
                appendMessage(msg.content, 'other');
            } else {
                // jesli admin nie ma otwartego czatu z dana osoba
                alert(`Nowa wiadomość od ${msg.fromName}`);
                socket.emit('get_active_chats');
            }
        });

    } else {
        // dla uzytkownika
        document.getElementById('adminUserList').style.display = 'none';
        document.getElementById('chatTitle').innerText = "Czat z administratorem";
        
        socket.emit('get_history', userId);

        socket.on('chat_history', (messages) => {
            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = '';
            const myId = localStorage.getItem('userId');
            messages.forEach(m => {
                // sprawdzenie czy sender id to id aktualnego uzytkownika
                const type = (String(m.sender_id) === String(myId)) ? 'me' : 'other';
                appendMessage(m.content, type);
            });
        });

        socket.on('new_message', (msg) => {
            // type to other bo to wiadomosc od admina
            appendMessage(msg.content, 'other'); 
        });
    }
}

// wyswietlanie logow
async function loadLogs() {
    const container = document.getElementById('systemLogs');
    const btn = document.querySelector('.btn-refresh');
    
    // animacja
    if(btn) btn.style.transform = 'rotate(360deg)';
    setTimeout(() => { if(btn) btn.style.transform = 'rotate(0deg)'; }, 500);

    try {
        const res = await fetch('/api/logs');
        const logs = await res.json();

        if (!Array.isArray(logs) || logs.length === 0) {
            container.innerHTML = '<div style="padding:10px; text-align:center;">Brak zdarzeń w historii.</div>';
            return;
        }

        container.innerHTML = logs.map(l => {
            const time = new Date(l.timestamp).toLocaleTimeString();
            
            // dla admina
            // jesli admin: "@login|nazwaRosliny"
            // jesli user: "nazwaRosliny"
            let ownerPrefix = '';
            let deleteBtn = '';
            
            if (ROLE === 'admin') {
                // stylowanie dla loginu
                ownerPrefix = `<span style="color: #1976D2; font-weight: bold;">@${l.username}</span> <span style="color:#ccc">|</span> `;

                // przycisk usuwania logu
                deleteBtn = `
                    <span 
                        onclick="deleteLog(${l.id})" 
                        style="float:right; cursor:pointer; color:#e53935; font-weight:bold; padding:0 5px;" 
                        title="Usuń ten wpis">
                        &times;
                    </span>
                `;
            }

            return `
                <div style="border-bottom:1px solid #eee; padding:8px 0;">
                    ${deleteBtn} <span style="color:#888; font-size:11px; margin-right:5px;">[${time}]</span>
                    ${ownerPrefix}
                    <span style="color:#2e7d32; font-weight:600;">${l.plant_name}:</span> 
                    <span style="color:#555;">${l.message}</span>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error(e);
        container.innerHTML = "Błąd pobierania logów.";
    }
}

// usuwanie logu (admin)
async function deleteLog(logId) {
    if (!confirm("Czy usunąć ten wpis z historii?")) return;

    try {
        const res = await fetch(`/api/logs/${logId}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            loadLogs(); // odswiezenie listy logow
        } else {
            alert("Błąd usuwania logu.");
        }
    } catch (e) {
        console.error(e);
    }
}

// nowe funkcjonalnosci CRUD

let currentSettingsPlantId = null;

// ustawienia danej rosliny (pobranie danych jednej rosliny)
async function openSettings(id) {
    currentSettingsPlantId = id;
    const modal = document.getElementById('settingsModal');
    
    try {
        const response = await fetch(`/api/plants/${id}`);
        if (!response.ok) throw new Error("Błąd pobierania.");
        
        const plant = await response.json();
        
        // dane z bazy
        document.getElementById('modalPlantName').innerText = `Ustawienia: ${plant.name}`;
        document.getElementById('modalMinHumidity').value = plant.min_humidity || 20;
        
        modal.style.display = 'flex';
    } catch (err) {
        alert("Nie udało się pobrać szczegółów rośliny.");
        console.error(err);
    }
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

// zapis nowych ustawien rosliny
async function savePlantSettings() {
    const newVal = document.getElementById('modalMinHumidity').value;
    
    const response = await fetch(`/api/plants/${currentSettingsPlantId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minHumidity: newVal })
    });

    if (response.ok) {
        alert("Zapisano pomyślnie!");
        closeSettingsModal();
    } else {
        alert("Błąd zapisu.");
    }
}

// usuwanie wszystkich logow danej rosliny
async function clearPlantLogs() {
    if (!confirm("Czy na pewno chcesz usunąć historię logów tej rośliny?")) return;

    const response = await fetch(`/api/plants/${currentSettingsPlantId}/logs`, {
        method: 'DELETE'
    });

    if (response.ok) {
        alert("Historia wyczyszczona.");
        closeSettingsModal();
    } else {
        alert("Błąd usuwania logów.");
    }
}

// zamkniecie modala jesli uzytkownik kliknie poza nim
window.onclick = function(event) {
    const modal = document.getElementById('settingsModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}