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

## Ekran widowni

Widok `/wyniki/` zachowuje tło i logotypy wydarzenia, wyróżnia odliczanie oraz pokazuje podium placówek, dziesięciu najlepszych graczy, punkty placówek i pełną listę uczestników. Komunikat organizatora ma stały pasek, razem ze stanem aktualizacji i przyciskiem „Tryb projekcyjny”. Układ mieści się na ekranach 1920 × 1080, 1366 × 768 i 1280 × 720; na telefonach i mniejszych oknach sekcje układają się pionowo.

Podium trzech placówek jest nieruchome. Sekcja „Najlepsi uczestnicy” obejmuje maksymalnie 10 osób, również w trybie projekcyjnym. Na dużym ekranie pozostałe długie listy i komunikaty przewijają się automatycznie. Paski przewijania są ukryte; przewijanie dotykiem, myszą i klawiaturą pozostaje dostępne. Wskazanie kursorem, użycie klawiatury lub ręczne przewijanie wstrzymuje ruch. Ustawienie systemowe ograniczające animacje wyłącza automatyczne przewijanie. Pełne nazwy i teksty pozostają dostępne. Zasłanianie ostatnich trzech minut i etapowe odsłanianie finału obowiązuje we wszystkich rankingach, również na bocznej liście. Po chwilowej utracie połączenia widok odzyskuje prawidłowy komunikat także wtedy, gdy dane się nie zmieniły.

Tablica używa jasnych kart i różowo-fioletowych akcentów ekranu gracza; licznik powtarza jego pastelowe tło. Numery podium mają osobną kolumnę z odstępem od nazw. Lista placówek pokazuje wszystkie pozycje, bez wcześniejszego ograniczenia do ośmiu. Sprawdzono zestaw 50 placówek i 500 uczestników, dostęp do ostatnich pozycji, aktualizacje nazw, sumy oraz finał. Na małych ekranach listy mają ograniczoną wysokość i można je przewijać. To test danych i renderowania, a nie jednoczesnej gry na 500 fizycznych telefonach.

## Posty na stronie głównej

Pod ikonami mediów społecznościowych znajduje się zapętlona karuzela dziewięciu postów. Zdjęcia i podpisy otwierają wskazane wpisy Instagrama w nowej karcie. Miniatury pochodzą z tych wpisów i są zapisane w `public/social-posts/`, więc strona nie pobiera osadzeń ani skryptów Instagrama. Podpisy, linki i kolejność ustala `public/social-posts/posts.js`. „Projekt Uważni” pozostaje ukryty na życzenie organizatora, do czasu dodania linku i zdjęcia.

Kafelki przesuwają się w lewo, a po ostatnim wraca pierwszy. Zdjęcia są bezpośrednimi linkami do postów; karuzela nie ma przycisków sterowania ani strzałek na zdjęciach. Można ją przewijać dotykiem. Ruch zatrzymuje się podczas korzystania z klawiatury lub wskazania zdjęcia myszą; respektuje też systemowe ograniczenie animacji. Karuzela jest częścią strony powitalnej i nie zmienia ekranów pytań, punktacji ani przebiegu rundy.

## Blokady techniczne kodów QR

Panel → Gra → „Blokady techniczne” (`/admin/#content-blocks`) pozwala osobno zablokować lub odblokować pytanie i bonus. Lista ma wyszukiwanie oraz filtry rodzaju kodu i zablokowanych pozycji. Blokada jest ręczna i działa niezależnie od aktywności katalogu: nie usuwa pytania, nie zmienia istniejących odpowiedzi ani punktów, nie resetuje czasu gry. Pozostałe kody działają dalej. Ustawienie katalogu dotyczy gry LIVE również podczas przeglądania danych TEST. Blokady pozostają po restarcie lub resecie rundy, do ręcznego odblokowania.

Serwer sprawdza dostępność przy pobieraniu pytania/bonusu oraz przy wysyłaniu odpowiedzi/hasła. Zapis ma dodatkowy warunek w transakcji zsynchronizowanej z blokadą administratora: formularz otwarty wcześniej nie pozwala ominąć blokady. Odpowiedź API `423` z `contentBlocked: true` jest oddzielona od pauzy całej gry. Próba odrzucona z powodu blokady nie zapisuje odpowiedzi ani odbioru bonusu. Edycja treści katalogu nie znosi blokady i zachowuje jej dotychczasową punktację.

Gracz widzi komunikat, możliwość ponowienia i powrotu do gry. Odświeżenie w tle wykrywa zmianę dostępności; sam zapis jest zabezpieczony natychmiast po zatwierdzeniu blokady. Po awarii pobierania pytania lub bonusu można ponowić żądanie. Ekran niedostępnego bonusu nie wyświetla potwierdzenia zdobycia punktu. Nie zastępuje to naprawy samej awarii serwera lub połączenia.

## Wejście wielu uczestników po starcie

Wersje przygotowania bazy są zapisane w `qr_schema_migrations`. Nowa instancja funkcji odczytuje je raz; nie powtarza wykonanych zmian tabel, indeksów i danych. Nowe migracje są wykonywane transakcyjnie, ze wspólną blokadą zapisu i znacznikiem wersji zapisanym dopiero po powodzeniu. Migracje muszą pozostawać idempotentne: przy równoczesnym pierwszym uruchomieniu kilku instancji mogą zostać wykonane kolejno, zanim instancje odczytają nową wersję. **Przy każdej zmianie struktury, indeksów lub danych startowych zwiększ wersję odpowiedniej migracji w `db-schema.js` albo `institutions.js`.**

Weryfikacja urządzenia i odświeżenie aktywności korzystają z jednego zapytania; odczyt postępu wymaga dwóch połączeń HTTP z bazą zamiast pięciu. Blokady, autoryzacja i unikalność zapisów odpowiedzi oraz bonusów nadal są sprawdzane po stronie serwera. Nie dodano współdzielonej pamięci podręcznej danych uczestników.

Ekran główny, pytania i bonusy odświeżają dane w tle co 15–18 sekund po zakończeniu poprzedniego odczytu. Odczyt samego postępu jest dodatkowo ograniczony do jednego na 30 sekund, z wymuszeniem aktualnych danych po zapisie lub powrocie do karty. Pierwsze odświeżenie ma losowe opóźnienie; ukryta karta nie wysyła odczytów. Jednoczesne wymuszenia odświeżenia współdzielą bieżące żądanie. Odliczanie nadal działa lokalnie co sekundę, a potwierdzenia odpowiedzi i bonusów pokazują się od razu po zapisie.

Logowanie ma maksymalnie trzy próby z rosnącym, losowo rozłożonym opóźnieniem dla problemów sieciowych oraz odpowiedzi 429/500/502/503/504. Każda próba zachowuje identyfikator urządzenia i te same dane, więc utrata odpowiedzi po zapisaniu konta nie tworzy drugiego uczestnika. Błędy danych nie są ponawiane. Chwilowy błąd pobrania stanu rundy nie usuwa lokalnej sesji.

Przed wydarzeniem otwórz panel administratora i wykonaj „Szybki test” kilka minut przed startem, aby sprawdzić aktualne połączenie i zakończyć przygotowanie bazy po wdrożeniu. Plan i bieżące wykorzystanie Vercel oraz bazy Neon należy sprawdzić w ich panelach. Lokalna próba obciążeniowa nie jest gwarancją wydajności rzeczywistej infrastruktury ani sieci uczestników.
