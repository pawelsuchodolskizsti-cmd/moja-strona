# Gra terenowa QR — wersja po naprawach, 11.09.2026

Projekt zachowuje pytania, bonusy, panel administratora, ekran wyników, generator QR, dyplomy i symulację. Naprawiono ochronę panelu, punktację i obsługę rund oraz błędy formularzy i widoków.

## Uruchomienie

1. Zainstaluj zależności: `pnpm install --frozen-lockfile` (wymagane Node.js i pnpm). Katalog `node_modules` nie jest częścią paczki.
2. Ustaw zmienne środowiskowe na serwerze. Plik `.env.example` zawiera ich nazwy, a nie gotowe dane dostępowe:
   - `DATABASE_URL`: adres Twojej bazy Neon PostgreSQL.
   - `ADMIN_LOGIN`: login administratora, domyślnie `admin`.
   - `ADMIN_PASSWORD`: własne, długie hasło. Jest wymagane. Poprzednie hasło zapisane w publicznym kodzie zostało usunięte.
   - `ADMIN_SESSION_SECRET`: opcjonalny dodatkowy losowy sekret do podpisywania sesji.
3. Lokalny podgląd przez istniejące narzędzie Vercel: `pnpm dev`. Na Vercel wgraj cały projekt z katalogami `api`, `lib`, `public` oraz plikami zależności. Ta paczka sama niczego nie publikuje.
4. Przed pierwszym uruchomieniem na istniejącej bazie zachowaj jej kopię. Aplikacja przy pierwszym połączeniu uzupełnia schemat o rozdzielenie rund, saldo korekt punktowych i czas uzyskania wyniku. Migrację sprawdzono lokalnie na schemacie poprzedniej wersji. Archiwum źródeł nie jest kopią bazy.
5. Wejdź na `/admin/`, zaloguj się i sprawdź grę na docelowym adresie oraz telefonach. W generatorze `/admin/qr/` wpisz właściwą domenę przed pobieraniem lub drukiem kodów. `/wyniki/` to ekran widowni.

## Zasady zachowane i ujednolicone

- Tura domyślnie trwa 3 godziny (180 minut). Poprawna odpowiedź daje 1 punkt; błędna wykorzystuje jedyną próbę. Każdy bonus daje 1 punkt tylko raz na turę.
- Pauza techniczna blokuje odpowiedzi i bonusy, ale zegar nadal biegnie. Administrator może dodać czas przyciskiem „+10 minut”.
- Korekty administratora nie znikają po odpowiedzi, bonusie ani przeliczeniu katalogu. Zmiana akceptowanych odpowiedzi w katalogu nadal przelicza zapisane odpowiedzi, jak w dotychczasowej wersji.
- Nowa tura otrzymuje oddzielne wyniki. Reset usuwa historię wybranego zakresu LIVE lub TEST; potwierdzenie wskazuje zakres.
- Jeden ranking obowiązuje w panelu, na tablicy i na dyplomach: punkty malejąco, liczba odpowiedzi malejąco, czas ostatniej zmiany wyniku/liczby odpowiedzi rosnąco, identyfikator rosnąco. Zwykłe odświeżanie sesji nie zmienia miejsca przy remisie. Dla miast: punkty, liczba uczestników, nazwa alfabetycznie.
- Końcowe trzy minuty i finał respektują etapowe odsłanianie także w publicznym API. Po pięciu minutach od końca pojawia się podziękowanie.
- Symulacja 300 osób jest oddzielona od LIVE. Jej uruchomienie nie zastępuje testu obciążenia 300 fizycznych telefonów.
- QR powstają lokalnie na serwerze. Zbiorczy ZIP składany jest w przeglądarce z pojedynczych obrazów, także przy katalogu 300 pytań.

## Regulamin i granice testów

`public/regulamin/index.html` to zatwierdzony do przygotowania **projekt roboczy**, a nie końcowy regulamin. Organizator musi uzupełnić i zatwierdzić wskazane w nim informacje przed udostępnieniem gry uczestnikom.

Sprawdzono logikę na lokalnej bazie PGlite i działanie interfejsu w Edge, w tym skanowanie z symulowanych klatek obrazu, pobrania QR i generowanie PDF dyplomów. Nie wykonywano wdrożenia, połączenia z produkcyjną bazą Neon ani testów rzeczywistych aparatów iPhone/Android. Eksport „Excel” zachowuje dotychczasowy format tabeli HTML z rozszerzeniem `.xls`; nie jest plikiem `.xlsx`.

## Instrukcja i postępy gracza

Po zalogowaniu gracz przechodzi trzy kroki instrukcji: pytania QR, bonusy i wspólny czas rundy. „Start” kończy instrukcję, zachowując zeskanowane pytanie lub bonus. Instrukcja jest zapamiętana na urządzeniu na daną rundę. Kamienie milowe są wspólne dla pytań i bonusów, widoczne również na małych ekranach; komunikaty pojawiają się kolejno. Odliczanie korzysta z czasu serwera. Zmiana długości dotyczy nowych rund; już rozpoczęta runda zachowuje swój czas.

## Placówki

Gracz wybiera placówkę z katalogu, wyszukując nazwę lub miasto (również bez polskich znaków). API rejestracji wymaga institutionId; dowolny tekst miasta nie jest już przyjmowany jako wybór. Panel → Placówki pozwala dodawać i edytować nazwy oraz miasta, wyłączać placówki z nowych zapisów i przypisywać starsze konta bez placówki. Wyłączenie nie usuwa uczestników ani punktów. Stały identyfikator zachowuje wspólny ranking po zmianie nazwy. Istniejące dane bez placówki są wyraźnie oznaczone i nie są automatycznie przypisywane.

## Nawigacja panelu administratora

Pulpit zawiera stan i czas rundy, liczniki uczestników, odpowiedzi i bonusów oraz start, stop, pauzę techniczną i przedłużenie gry. Boczne menu prowadzi do osobnych sekcji: aktywności na żywo, komunikatów, podglądu gracza, rankingów, placówek, odpowiedzi, bonusów, statystyk pytań, finału, kodów QR, dyplomów oraz testów i ustawień. Reset danych i symulacja znajdują się w sekcji „Testy i ustawienia”. Oznaczenie LIVE/TEST pozostaje widoczne w głównym panelu.

Na telefonie menu otwiera przycisk „Menu”. Katalog placówek i generator QR korzystają z tej samej nawigacji. Przełączanie sekcji głównego panelu zachowuje filtry i roboczy komunikat, a adres z fragmentem (np. `/admin/#leaderboard`) umożliwia powrót do konkretnego widoku.
