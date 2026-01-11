// pobieranie roslin
async function loadPlants() {
    const response = await fetch('/api/plants');
    const plants = await response.json();
    
    const list = document.getElementById('plantsList');
    list.innerHTML = ''; // czyszczenie listy

    // petla dla wyswietlania i tworzenia elementu
    plants.forEach(plant => {
        const div = document.createElement('div');

        // style
        div.className = 'plant-item';

        // nazwa i przycisk
        div.innerHTML = `
            <span>🌱 <b>${plant.name}</b> <small>(ID: ${plant.id})</small></span>
            <button class="delete-btn" onclick="deletePlant(${plant.id})"">Usuń</button>
        `;
        list.appendChild(div);
    });
}

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

// zaladowanie roslin przy starcie
loadPlants();