// pobieranie roslin
async function loadPlants() {
    const response = await fetch('/api/plants');
    const plants = await response.json();
    
    const list = document.getElementById('plantsList');
    list.innerHTML = ''; // czyszczenie listy

    // petla dla wyswietlania i tworzenia elementu
    plants.forEach(plant => {
        const div = document.createElement('div');
        div.style.borderBottom = "1px solid #ccc";
        div.style.padding = "10px";
        div.innerText = `🌱 ${plant.name} (ID: ${plant.id})`;
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

// zaladowanie roslin przy starcie
loadPlants();