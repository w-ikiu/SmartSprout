// polaczenie ws
const socket = io();

// nasluchiwanie na polaczenie uzytkownika
socket.on('connect', () => {
    console.log("Połączono z serwerem WS. ID:", socket.id)
})

let ROLE = localStorage.getItem('role');
let USERNAME = localStorage.getItem('username');

// kontener na powiadomienia
if (!document.getElementById('notification-container')) {
    const container = document.createElement('div');
    container.id = 'notification-container';
    document.body.appendChild(container);
}

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
    const currentUsername = localStorage.getItem('username');

    if (!userId) {
        console.error("FRONTEND BŁĄD: Brak ID użytkownika!");
        return;
    }

    // log do testow
    console.log("FRONTEND: Inicjalizuję czat dla:", currentUsername, "ID:", userId);

    socket.emit('identify', { userId: userId, username: currentUsername });

    // czyszczenie starych listenerow
    socket.off('admin_new_message');
    socket.off('new_message');
    socket.off('active_chats_list');
    socket.off('chat_history');
    socket.off('force_refresh_profile');

    socket.off('plant_update');

    // live dane od roslin
    socket.on('plant_update', (data) => {

        // aktualizacja roslin w spolecznosci
        const tempSpan = document.getElementById(`comm-temp-${data.plantId}`);
        const humSpan = document.getElementById(`comm-hum-${data.plantId}`);
        const barDiv = document.getElementById(`comm-bar-${data.plantId}`);

        if (tempSpan && humSpan) {
            // aktualizacja liczb
            tempSpan.innerText = data.temp.toFixed(1);
            humSpan.innerText = data.humidity;

            // aktualizacja paska wilgotności
            if (barDiv) {
                barDiv.style.width = `${data.humidity}%`;
                
                // aktualizacja koloru paska
                barDiv.className = 'humidity-bar-fill';
                if (data.humidity < 10) barDiv.classList.add('bar-red');
                else if (data.humidity < 30) barDiv.classList.add('bar-orange');
                else barDiv.classList.add('bar-green');
            }
        }

        // aktualizacja roslin uzytkownika

        // sprawdzamy czy uzytkownik jest w zakladce moje rosliny
        const isMyPlantsTabActive = document.getElementById('communityContainer').style.display === 'none';

        // zwykly user
        if (ROLE !== 'admin') {
            if (isMyPlantsTabActive) {
                const searchValue = document.getElementById('searchPlantInput').value;
                loadPlants(searchValue ? `?search=${searchValue}` : '');
            }
        }
        
        // jesli admin
        else if (ROLE === 'admin') {
            // admin odswieza widok jesli patrzy na uzytkownika do ktoego nalezy dana rosilna
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
            
            // jesli admin ma otwarty chat z ta osoba
            if (currentTarget && String(currentTarget) === String(msg.fromId)) {
                appendMessage(msg.content, 'other');
            } else {
                // powiadomienie
                showNotification(`Nowa wiadomość od ${msg.fromName}`, 'msg');
                
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
            // dymek czatu
            appendMessage(msg.content, 'other'); 
            
            // czy okno zamkniete
            const chatWindow = document.getElementById('chatWindow');
            if (chatWindow.style.display === 'none') {
                // jak tak pokazujemy powiadomienie
                showNotification(`Nowa wiadomość od Admina: ${msg.content.substring(0,20)}...`, 'msg');
            }
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

// NOWE FUNKCJONALNOSCI

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

// komentarze

let currentCommentPlantId = null;

// otwieranie modala i pobieranie komentarzy
async function openComments(plantId, plantName) {
    currentCommentPlantId = plantId;
    document.getElementById('commentsPlantName').innerText = `💬 ${plantName}`;
    document.getElementById('commentsModal').style.display = 'flex';
    
    loadComments(plantId);
}

function closeCommentsModal() {
    document.getElementById('commentsModal').style.display = 'none';
}

// pobieranie listy (READ)
async function loadComments(plantId) {
    const list = document.getElementById('commentsList');
    list.innerHTML = '<p style="text-align:center;">Ładowanie...</p>';

    const res = await fetch(`/api/plants/${plantId}/comments`);
    const comments = await res.json();

    list.innerHTML = '';
    if (comments.length === 0) {
        list.innerHTML = '<p style="color:#aaa; text-align:center;">Brak komentarzy.</p>';
        return;
    }

    const currentUserId = localStorage.getItem('userId');

    comments.forEach(c => {
        // czy moj komentarz
        const isMine = String(c.user_id) === String(currentUserId);
        const editBtn = isMine ? `<small style="color:blue; cursor:pointer; margin-left:10px;" onclick="editComment(${c.id}, '${c.content}')">Edytuj</small>` : '';

        const div = document.createElement('div');
        div.style.borderBottom = '1px solid #eee';
        div.style.padding = '8px 0';
        div.innerHTML = `
            <div style="font-size:12px; color:#888;">
                <b>${c.username}</b> <span style="float:right;">${new Date(c.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style="font-size:14px; margin-top:4px; color:#333;">
                ${c.content} ${editBtn}
            </div>
        `;
        list.appendChild(div);
    });
    
    // scroll na dol
    list.scrollTop = list.scrollHeight;
}

// dodawanie komentarza (CREATE)
async function addComment() {
    const input = document.getElementById('newCommentInput');
    const content = input.value;
    if (!content) return;

    await fetch(`/api/plants/${currentCommentPlantId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });

    input.value = '';
    loadComments(currentCommentPlantId); // odswiezenie listy
}

// edycja komentarza (UPDATE)
async function editComment(commentId, oldContent) {
    const newContent = prompt("Edytuj komentarz:", oldContent);
    if (!newContent || newContent === oldContent) return;

    const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
    });

    if (res.ok) {
        loadComments(currentCommentPlantId);
    } else {
        alert("Błąd edycji.");
    }
}

// live update kiedy ktos inny skomentuje
socket.on('plant_new_comment', (data) => {
    // odswiezenie tylko jesli mam otwarte okno TEJ rosliny
    if (document.getElementById('commentsModal').style.display === 'flex' && 
        String(currentCommentPlantId) === String(data.plant_id)) {
        loadComments(currentCommentPlantId);
    }
});

// spolecznosc

// przelaczanie zakladek
function switchTab(tab) {
    const myContainer = document.getElementById('userPanel');
    const myList = document.getElementById('plantsList');
    const commContainer = document.getElementById('communityContainer');
    const searchBar = document.getElementById('plantSearchContainer');
    const leaderboard = document.getElementById('leaderboardContainer');

    if (tab === 'my') {
        // moje
        myContainer.style.display = 'flex';
        myList.style.display = 'grid';
        searchBar.style.display = 'block';
        commContainer.style.display = 'none';
        commContainer.style.display = 'none';
        if (leaderboard) leaderboard.style.display = 'none';
        
        document.getElementById('btnTabMy').style.background = '#2E7D32';
        document.getElementById('btnTabCommunity').style.background = '#aaa';
        
        loadPlants();
    } else {
        // spolecznosc
        myContainer.style.display = 'none';
        myList.style.display = 'none';
        searchBar.style.display = 'none';
        commContainer.style.display = 'block';
        commContainer.style.display = 'block';
        if (leaderboard) leaderboard.style.display = 'block';

        document.getElementById('btnTabMy').style.background = '#aaa';
        document.getElementById('btnTabCommunity').style.background = '#2E7D32';

        loadCommunityPlants();
    }
}

// pobranie roslin innych (READ)
async function loadCommunityPlants() {
    const list = document.getElementById('communityList');
    list.innerHTML = '<p style="text-align:center; width:200%;">Ładowanie świata...</p>';

    try {
        const res = await fetch('/api/community/plants');
        if (!res.ok) throw new Error("Błąd pobierania");
        
        const plants = await res.json();
        list.innerHTML = '';

        if (plants.length === 0) {
            list.innerHTML = '<p>Brak roślin w społeczności.</p>';
            return;
        }

        plants.forEach(p => {
            const div = document.createElement('div');
            div.className = 'plant-item';

            const isLiked = p.is_liked_by_me > 0;
            const likeBtnClass = isLiked ? 'btn-like-filled' : 'btn-like-outline';
            const likeIcon = isLiked ? '❤️' : '🤍';
            
            // HTML kafelka spolecznosci
            div.innerHTML = `
                <div style="width: 100%;">
                    <div class="plant-header">
                        <span class="plant-name">🌱 ${p.name}</span>
                    </div>
                    <small style="color: #2E7D32; font-weight: bold;">Właściciel: ${p.owner_name}</small>
                    
                    <div class="plant-stats" style="margin-top: 10px;">
                        <div class="stat-row">
                            <span>🌡️ <b id="comm-temp-${p.id}">${p.temperature ? p.temperature.toFixed(1) : '--'}</b>°C</span>
                            <span>💧 <b id="comm-hum-${p.id}">${p.humidity}</b>%</span>
                        </div>

                        <div class="humidity-bar-container" style="margin-top:10px;">
                            <div id="comm-bar-${p.id}" class="humidity-bar-fill bar-green" style="width: ${p.humidity}%;"></div>
                        </div>
                    </div>
                </div>

                <div class="plant-actions" style="margin-top: 15px;">
                    <button onclick="openComments(${p.id}, '${p.name} (${p.owner_name})')" class="plant-btn" style="background-color: #7337b8;">
                        <span>💬</span> Komentuj
                    </button>
                    
                    <button onclick="likePlant(${p.id})" id="like-btn-${p.id}" class="plant-btn ${likeBtnClass}">
                        <span id="like-icon-${p.id}">${likeIcon}</span> 
                        <span id="likes-count-${p.id}">${p.likes_count || 0}</span>
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p>Błąd ładowania.</p>';
    }
}

// polubienie rosliny
function likePlant(plantId) {
    // sygnal do serwera ze wysylamy polubienie
    socket.emit('like_plant', plantId);
    
    const btn = document.getElementById(`like-btn-${plantId}`);
    const icon = document.getElementById(`like-icon-${plantId}`);
    
    // zmiana koloru serca
    if (btn.classList.contains('btn-like-filled')) {
        btn.classList.remove('btn-like-filled');
        btn.classList.add('btn-like-outline');
        icon.innerText = '🤍';
    } else {
        btn.classList.remove('btn-like-outline');
        btn.classList.add('btn-like-filled');
        icon.innerText = '❤️';
    }
}

// odbieranie aktualizacji licznika
socket.on('update_likes', (data) => {
    // data = { plantId: 123, count: 5 }
    
    // szukamy licznika tej konkretnej rosliny
    const counterElement = document.getElementById(`likes-count-${data.plantId}`);
    
    if (counterElement) {
        // aktualizacja liczby polubien
        counterElement.innerText = data.count;
        
        counterElement.style.transition = "0.2s";
        counterElement.style.transform = "scale(1.5)";
        setTimeout(() => counterElement.style.transform = "scale(1)", 200);
    }
});

// wyswietlanie powiadomien
function showNotification(text, type = 'info') {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // zalezy jakie powiadomienie - inna ikona
    let icon = '🔔';
    if (type === 'like') icon = '❤️';
    if (type === 'msg') icon = '💬';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span style="font-size:18px;">${icon}</span> <span>${text}</span>`;
    
    container.appendChild(toast);

    // usuwanie po 4 sekundach
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

socket.on('update_leaderboard', (topPlants) => {
    const container = document.getElementById('leaderboardList');
    if (!container) return;

    container.innerHTML = '';

    if (topPlants.length === 0) {
        container.innerHTML = '<p>Brak polubień.</p>';
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];

    topPlants.forEach((p, index) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '10px';
        row.style.background = '#f9f9f9';
        row.style.borderRadius = '10px';
        row.style.borderLeft = index === 0 ? '5px solid #FFD700' : '5px solid #eee';

        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size: 1.5em;">${medals[index] || (index + 1) + '.'}</span>
                <div>
                    <strong style="font-size: 1.1em;">${p.name}</strong>
                    <br>
                    <small style="color:#666;">Właściciel: ${p.owner_name}</small>
                </div>
            </div>
            <div style="font-weight: bold; color: #E91E63;">
                ❤️ ${p.likes_count}
            </div>
        `;
        container.appendChild(row);
    });
});

// nasluchiwanie powiadomien z serwera
socket.on('notification', (data) => {
    // data = { type: 'like', text: 'Ktoś polubił...' }
    showNotification(data.text, data.type);
});