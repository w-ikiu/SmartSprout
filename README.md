Wiktoria Chełmińska 300868 gr.1

SmartSprout - System Monitorowania Roślin IoT
Projekt to symulacja systemu Smart Home do monitorowania stanu roślin domowych. Składa się z serwera, klienta webowego oraz symulatora czujników.

Funkcjonalności:

Dane na żywo: temperatura i wilgotność bez odświeżania strony.

Zarządzanie: dodawanie, edycja i usuwanie roślin (CRUD).

Panel Admina: zarządzanie użytkownikami i logami.

Czat: komunikacja w czasie rzeczywistym.

Bezpieczeństwo: szyfrowanie HTTPS i bezpieczne sesje.

Wykorzystane technologie i protokoły:

Backend: MQTT (broker HiveMQ na localhost) do komunikacji czujników, HTTP/REST do API.

Frontend: WebSocket (Socket.io) do danych na żywo i czatu, HTTPS (TLS/SSL) do szyfrowania transmisji.

Bezpieczeństwo: Certyfikat TLS, ciasteczka HttpOnly, baza SQLite, haszowanie haseł.