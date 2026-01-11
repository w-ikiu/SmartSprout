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
        div.style.borderBottom = "1px solid #ccc";
        div.style.padding = "10px";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";

        // nazwa i przycisk
        div.innerHTML = `
            <span>🌱 ${plant.name} (ID: ${plant.id})</span>
            <button onclick="deletePlant(${plant.id})" style="color: red; cursor: pointer;">Usuń</button>
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