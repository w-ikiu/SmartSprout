// pobranie danych z localStorage
let TOKEN = localStorage.getItem('token');
let ROLE = localStorage.getItem('role');
let USERNAME = localStorage.getItem('username');

// jezeli uzytkownik jest zalogowany to pokazujemy aplikacje
if (TOKEN) {
    showApp();
}

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

    if(plants.length === 0) {
        list.innerHTML = '<p>Brak roślin do wyświetlenia.</p>';
        return;
    }

    plants.forEach(p => {
        const div = document.createElement('div');
        div.className = 'plant-item';
        div.innerHTML = `
            <span>
                🌱 <b>${p.name}</b> 
            </span>
            <button class="delete-btn" onclick="deletePlant(${p.id})">Usuń</button>
        `;
        list.appendChild(div);
    });
}

// SHOW APP
// wyswietlanie aplikacji
function showApp() {
    // ukrycie logowania i wyswietlenie aplikacji po zalogowaniu uzytkownika
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('appView').style.display = 'block';
    
    // dane uzytkownika
    document.getElementById('currentUser').innerText = USERNAME;
    document.getElementById('currentRole').innerText = ROLE;

    // admin
    if (ROLE === 'admin') {
        document.getElementById('adminPanel').style.display = 'block';
        loadUsersForAdmin();
    // uzytkownik widzi rosliny
    } else {
        document.getElementById('adminPanel').style.display = 'none';
        loadPlants();
    }
}

// wyswietlanie uzytkownikow dla admina
async function loadUsersForAdmin() {
    const res = await fetch('/api/users', { headers: {'Authorization': TOKEN} });
    const users = await res.json();

    const tbody = document.getElementById('usersListBody');
    tbody.innerHTML = '';

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #ddd";
        tr.style.cursor = "pointer";

        tr.onclick = () => loadUserPlants(u.id, u.username);

        tr.innerHTML = `
            <td style="padding: 10px;">${u.id}</td>
            <td style="padding: 10px;"><b>${u.username}</b></td>
            <td style="padding: 10px;">${u.role}</td>
            <td style="padding: 10px;"><button onclick="alert('Tu możesz dodać usuwanie usera')" style="font-size:0.8em">Opcje</button></td>
        `;
        tbody.appendChild(tr);
    })
}

// funkcja pomocniczna ladowania roslin danego uzytkownika
async function loadUserPlants(userId, username) {
    document.getElementById('adminMessage').innerText = `Przeglądasz rośliny użytkownika: ${username}`;
    loadPlants(`?userId=${userId}`);
}

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