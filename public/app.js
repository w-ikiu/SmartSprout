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
    // powiadomienie serwera o wylogowaniu
    // if (TOKEN) {
    //     fetch('/api/logout', { 
    //         method: 'POST', 
    //         headers: { 'Authorization': TOKEN } 
    //     });
    // }
    // czyszczenie localStorage
    localStorage.clear();
    // przeladowanie zeby wrocic do "czystego" stanu
    location.reload();
}

// pobieranie roslin
async function loadPlants() {
    const response = await fetch('/api/plants', {
        headers: { 'Authorization': TOKEN }
    });

    // jesli token wygasl to wylogowanie
    if (response.status === 401) {
        logout();
        return;
    }
    const plants = await response.json();
    
    const list = document.getElementById('plantsList');
    list.innerHTML = ''; // czyszczenie listy

    // petla dla wyswietlania i tworzenia elementu
    plants.forEach(plant => {
        const div = document.createElement('div');

        // style
        div.className = 'plant-item';

        // nazwa i przycisk do usuwania
        div.innerHTML = `
            <span>🌱 <b>${plant.name}</b> <small>(ID: ${plant.id})</small></span>
            <button class="delete-btn" onclick="deletePlant(${plant.id})"">Usuń</button>
        `;
        list.appendChild(div);
    });
}

// wyswietlanie aplikacji
function showApp() {
    // ukrycie logowania i wyswietlenie aplikacji po zalogowaniu uzytkownika
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('appView').style.display = 'block';
    
    // dane uzytkownika
    document.getElementById('currentUser').innerText = USERNAME;
    document.getElementById('currentRole').innerText = ROLE;

    // zaladowanie roslin
    loadPlants();
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