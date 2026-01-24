// polaczenie ws
const socket = io();

// nasluchiwanie na polaczenie uzytkownika
socket.on('connect', () => {
    console.log("Połączono z serwerem WS. ID:", socket.id)
})

// pobranie danych z localStorage
let TOKEN = localStorage.getItem('token');
let ROLE = localStorage.getItem('role');
let USERNAME = localStorage.getItem('username');

// interwal odswiezania aplikacji zeby wilgotnosc spadala in real time
let refreshInterval = null;

// jezeli uzytkownik jest zalogowany to pokazujemy aplikacje
if (TOKEN) {
    showApp();
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
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            localStorage.setItem('username', data.username);
            localStorage.setItem('userId', data.userId);
            
            // aktualizacja zmiennych globalnych
            TOKEN = data.token;
            ROLE = data.role;
            USERNAME = data.username;
            
            showApp();
        }
    } catch (err) {
        alert(err.message);
    }
}

// wylogowanie
function logout() {
    localStorage.clear();
    // przeladowanie zeby wrocic do "czystego" stanu
    location.reload();
}

// LOAD PLANTS
// pobieranie roslin

// query params do np filtrowania, jak filtruje przekazuje inna sciezke do serwera, np zeby wzial tylko pewne dane od uzytkownika o id 5
async function loadPlants(queryParams = '') {
    const res = await fetch(`/api/plants${queryParams}`, {
        headers: { 'Authorization': TOKEN }
    });
    
    if (res.status === 401) { logout(); return; }

    const plants = await res.json();
    const list = document.getElementById('plantsList');
    list.innerHTML = '';

    if (plants.length === 0) {
        list.innerHTML = '<p class="empty-list">Brak roślin do wyświetlenia.</p>';
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
                <button onclick="waterPlant(${p.id})" class="btn-water">💦 Podlej</button>
                <button onclick="deletePlant(${p.id})" class="btn-delete-icon" title="Usuń">×</button>
            </div>
        `;
        list.appendChild(div);
    });
}

// LOAD USERS FOR ADMIN
// wyswietlanie uzytkownikow dla admina
async function loadUsersForAdmin() {
    const res = await fetch('/api/users', { headers: {'Authorization': TOKEN} });
    const users = await res.json();

    const tbody = document.getElementById('usersListBody');
    tbody.innerHTML = '';

    users.forEach(u => {
const tr = document.createElement('tr');
    
    tr.onclick = () => loadUserPlants(u.id, u.username);

    tr.innerHTML = `
        <td>${u.id}</td>
        <td><b>${u.username}</b></td>
        <td><button style="width:auto; padding:5px 10px; font-size:12px;">Opcje</button></td>
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
    
    if (refreshInterval) clearInterval(refreshInterval);
    
    refreshInterval = setInterval(() => {
        const searchValue = document.getElementById('searchPlantInput').value;
        
        // budowa zapytania
        let query = `?userId=${userId}`;
        
        if (searchValue) {
            query += `&search=${searchValue}`;
        }
        
        loadPlants(query);
    }, 3000);
}

// ADD PLANT
// dodawanie roslin
async function addPlant() {
    const nameInput = document.getElementById('plantName');
    const name = nameInput.value;

    if(!name) return alert("Wpisz nazwę rośliny!");

    await fetch('/api/plants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': TOKEN },
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
        method: 'DELETE',
        headers: { 'Authorization': TOKEN }
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
            method: 'POST',
            headers: { 'Authorization': TOKEN }
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
    
    // zatrzymanie automatycznego odswiezania podczas pisania
    if (refreshInterval) clearInterval(refreshInterval);

    if (searchTimeout) clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(() => {
        let queryParams = `?search=${query}`;

        if (ROLE === 'admin' && currentViewedUserId) {
            queryParams += `&userId=${currentViewedUserId}`;
        }
        
        loadPlants(queryParams);

        refreshInterval = setInterval(() => {
             const currentSearch = document.getElementById('searchPlantInput').value;
             let loopQuery = `?search=${currentSearch}`;
             
             if (ROLE === 'admin' && currentViewedUserId) {
                 loopQuery += `&userId=${currentViewedUserId}`;
             }
             loadPlants(loopQuery);
        }, 3000);

    }, 300);
}

// ! ! ! SHOW APP ! ! !
// wyswietlanie aplikacji
function showApp() {
    // zmiana wyswietlania danych elementow jesli jestesmy zalogowani
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('appView').style.display = 'block';
    
    document.getElementById('plantSearchContainer').style.display = 'block';
    
    document.getElementById('currentUser').innerText = USERNAME;
    document.getElementById('currentRole').innerText = ROLE;

    if (refreshInterval) clearInterval(refreshInterval)

    // logi wypisujace kim jest uzytkownik, do testow
    console.log("FRONTEND: Uruchamiam aplikację. Rola:", ROLE, "Login:", USERNAME);

    // czy wyswietlamy wersje dla admina czy dla uzytkownika
    if (USERNAME === 'admin' || ROLE === 'admin') {
        console.log("FRONTEND: Tryb Administratora");
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('userPanel').style.display = 'none';
        document.getElementById('plantsList').innerHTML = '<p style="text-align:center; margin-top:20px;">Kliknij użytkownika powyżej, aby zobaczyć jego rośliny.</p>';
        
        // ukrycie wyszukiwarki dopoki admin nie kliknie jakiegos uzytkownika
        document.getElementById('plantSearchContainer').style.display = 'none';

        loadUsersForAdmin();
    } else {
        console.log("FRONTEND: Tryb Użytkownika");
        document.getElementById('adminPanel').style.display = 'none';
        document.getElementById('userPanel').style.display = 'flex';
        document.getElementById('plantSearchContainer').style.display = 'block';
        loadPlants();

        // odswiezanie w zaleznosci od tego czy cos wyszukujemy czy nie, zeby nie reloadowac strony po wyszukaniu
        refreshInterval = setInterval(() => {
            const searchValue = document.getElementById('searchPlantInput').value;
            
            // jesli cos jest wyszukane ladujemy rosliny pasujace do wyszukiwania
            if (searchValue) {
                loadPlants(`?search=${searchValue}`);
            } else {
                loadPlants();
            }
        }, 3000);
    }

    document.getElementById('chatButton').style.display = 'flex';
    initChat();
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
    
    socket.off('admin_new_message');
    socket.off('new_message');
    socket.off('active_chats_list');
    socket.off('chat_history');

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
        document.getElementById('chatTitle').innerText = "Czat z pomocą";
        
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