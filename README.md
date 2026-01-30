# SmartSprout - IoT Plant Monitoring System

**SmartSprout** is a simulation of a comprehensive Smart Home system designed for monitoring and automating indoor plant care. The project integrates modern web technologies with IoT protocols to create a secure, responsive, and real-time Single Page Application (SPA).

## About the Project

The system architecture consists of three main modules:
1.  **Backend (Server):** The central hub managing logic, database, and communication bridging.
2.  **IoT Simulator:** An application simulating physical sensors and actuators (heaters, fans), communicating via the MQTT protocol.
3.  **Frontend (Web Client):** A user interface for plant management and live data visualization.

## Key Features

* **Real-Time Monitoring:** Live display of temperature and humidity data via WebSockets without page reloads.
* **Automation & Simulation:** Automatic system response to critical conditions (e.g., turning on a heater when temperature drops) with communication between the client and the server.
* **Live Support Chat:** Real-time messaging between Users and Administrators using WebSocket Rooms.
* **Plant Management (CRUD):** Full capability to add, edit settings, view details, and delete plants.
* **Admin Panel:** Dedicated dashboard for user management and viewing system event logs.

## Security

The project emphasizes standard web security practices:
* **HTTPS/TLS:** All traffic (Frontend <-> Backend) is encrypted using a Self-Signed certificate.
* **Secure Sessions:** Authentication based on cookies with the `HttpOnly` flag (protection against XSS).
* **Data Protection:** User passwords are securely hashed using `bcrypt`.
* **Access Control:** Role-based access control (User/Admin) enforced via server-side middleware.

## Tech Stack & Protocols

**Backend & IoT:**
* **Node.js & Express:** REST API server.
* **MQTT (HiveMQ):** Lightweight messaging protocol for sensor communication.
* **SQLite:** Relational database for storing users, plants, and logs.
* **Protocol Bridging:** The server acts as a gateway, translating MQTT messages into WebSocket events for the frontend.

**Frontend:**
* **HTML5 / CSS3 / JavaScript (Vanilla):** Responsive SPA interface.
* **Socket.io (WebSocket):** Bi-directional communication for live charts and chat.
* **Fetch API:** Handling asynchronous HTTP requests (GET, POST, PUT, DELETE).

## Installation & Setup

1.  Install dependencies: `npm install`
2.  Ensure MQTT broker is running or configured.
3.  Start the server: `node server.js`
4.  Start the simulator in a separate terminal: `node simulator.js`
5.  Access the application: `https://localhost:3000`

# SmartSprout - System Monitorowania Roślin IoT

**SmartSprout** to symulacja kompletnego systemu Smart Home przeznaczonego do monitorowania i automatyzacji hodowli roślin domowych. Projekt integruje technologie internetowe z protokołami IoT, tworząc bezpieczną i responsywną platformę typu SPA (Single Page Application).

## O Projekcie

System składa się z trzech głównych modułów:
1.  **Backend (Serwer):** Centralny punkt zarządzający logiką, bazą danych i komunikacją.
2.  **Symulator IoT:** Aplikacja symulująca fizyczne czujniki i urządzenia wykonawcze (grzejniki, wentylatory), komunikująca się przez protokół MQTT.
3.  **Frontend (Klient Webowy):** Interfejs użytkownika do zarządzania roślinami i podglądu danych w czasie rzeczywistym.

## Kluczowe Funkcjonalności

* **Monitoring w Czasie Rzeczywistym:** Wyświetlanie temperatury i wilgotności bez konieczności odświeżania strony (Live Data).
* **Automatyka i Symulacja:** System automatycznie reaguje na warunki krytyczne (np. włączenie grzejnika przy niskiej temperaturze) – komunikacja dwukierunkowa z symulatorem.
* **Czat Wsparcia:** Komunikacja w czasie rzeczywistym między Użytkownikami a Administratorem z wykorzystaniem WebSocketów.
* **Zarządzanie Roślinami (CRUD):** Pełna obsługa dodawania, edycji ustawień, usuwania oraz podglądu szczegółów roślin.
* **Panel Administratora:** Dostęp do listy użytkowników, historii logów systemowych oraz narzędzi administracyjnych.

## Bezpieczeństwo

Projekt kładzie duży nacisk na bezpieczne praktyki webowe:
* **HTTPS/TLS:** Cała komunikacja (Frontend <-> Backend) jest szyfrowana przy użyciu certyfikatu Self-Signed.
* **Bezpieczne Sesje:** Autentykacja oparta na ciasteczkach z flagą `HttpOnly` (ochrona przed XSS).
* **Ochrona Danych:** Hasła użytkowników są haszowane algorytmem `bcrypt`.
* **Separacja Uprawnień:** Podział na role User/Admin z middleware autoryzacyjnym po stronie serwera.

## Technologie i Protokoły

**Backend & IoT:**
* **Node.js & Express:** Serwer aplikacji REST API.
* **MQTT (HiveMQ):** Lekki protokół do komunikacji z symulatorem czujników.
* **SQLite:** Relacyjna baza danych (przechowywanie użytkowników, roślin, logów).
* **Protocol Bridging:** Serwer działa jako most, tłumacząc komunikaty MQTT na zdarzenia WebSocket.

**Frontend:**
* **HTML5 / CSS3 / JavaScript:** Responsywny interfejs SPA.
* **Socket.io (WebSocket):** Dwukierunkowa komunikacja dla wykresów na żywo i czatu.
* **Fetch API:** Obsługa żądań HTTP (GET, POST, PUT, DELETE).

## Instalacja i Uruchomienie

1.  Zainstaluj zależności: `npm install`
2.  Uruchom broker MQTT (jeśli wymagane) lub skonfiguruj połączenie.
3.  Uruchom serwer: `node server.js`
4.  Uruchom symulator w osobnej konsoli: `node simulator.js`
5.  Otwórz aplikację w przeglądarce: `https://localhost:3000`

Wiktoria Chełmińska gr.1
