# Gra terenowa QR - wersja po naprawach, 11.09.2026

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
- Nowa tura otrzymuje oddzielne wyniki. Reset najpierw archiwizuje historię wybranego zakresu LIVE lub TEST w tej samej transakcji, następnie czyści dane robocze; potwierdzenie wskazuje zakres.
- Jeden ranking obowiązuje w panelu, na tablicy i na dyplomach: punkty malejąco, czas zdobycia aktualnego wyniku rosnąco, identyfikator rosnąco. Błędne odpowiedzi nie zmieniają czasu wyniku. Zwykłe odświeżanie sesji nie zmienia miejsca przy remisie. Dla placówek: punkty, wcześniejszy czas wspólnego wyniku, nazwa alfabetycznie.
- Końcowe trzy minuty i finał respektują etapowe odsłanianie także w publicznym API. Po zakończeniu gry podziękowanie włącza ręcznie administrator.
- Symulacja 300 osób jest oddzielona od LIVE. Jej uruchomienie nie zastępuje testu obciążenia 300 fizycznych telefonów.
- QR powstają lokalnie na serwerze. Zbiorczy ZIP składany jest w przeglądarce z pojedynczych obrazów, także przy katalogu 300 pytań.

## Regulamin i granice testów

`public/regulamin/index.html` to zatwierdzony do przygotowania **projekt roboczy**, a nie końcowy regulamin. Organizator musi uzupełnić i zatwierdzić wskazane w nim informacje przed udostępnieniem gry uczestnikom.

Sprawdzono logikę na lokalnej bazie PGlite i działanie interfejsu w Edge, w tym skanowanie z symulowanych klatek obrazu, pobrania QR i generowanie PDF dyplomów. Nie wykonywano wdrożenia, połączenia z produkcyjną bazą Neon ani testów rzeczywistych aparatów iPhone/Android. Eksport „Excel” zachowuje dotychczasowy format tabeli HTML z rozszerzeniem `.xls`; nie jest plikiem `.xlsx`.

## Instrukcja i postępy gracza

Po zalogowaniu gracz przechodzi trzy kroki instrukcji: pytania QR, bonusy i wspólny czas rundy. „Start” kończy instrukcję, zachowując zeskanowane pytanie lub bonus. Instrukcja jest zapamiętana na urządzeniu na daną rundę. Kamienie milowe są wspólne dla pytań i bonusów, widoczne również na małych ekranach; komunikaty pojawiają się kolejno. Odliczanie korzysta z czasu serwera. Zmiana długości dotyczy nowych rund; już rozpoczęta runda zachowuje swój czas.

## Placówki

Gracz wybiera placówkę z katalogu, wyszukując nazwę lub miasto (również bez polskich znaków). API rejestracji wymaga institutionId; dowolny tekst miasta nie jest już przyjmowany jako wybór. Panel → Placówki pozwala dodawać i edytować nazwy oraz miasta, wyłączać placówki z nowych zapisów i przypisywać starsze konta bez placówki. Wyłączenie nie usuwa uczestników ani punktów. Stały identyfikator zachowuje wspólny ranking po zmianie nazwy. Istniejące dane bez placówki są wyraźnie oznaczone i nie są automatycznie przypisywane.

## Płynne otwieranie widoków

Gracz i administrator widzą docelowy ekran dopiero po ustaleniu sesji i stanu gry. Wspólne `view-loading.css` i `view-loading.js` zapobiegają chwilowemu pokazaniu strony głównej lub logowania; przy wolnym połączeniu wyświetlają informację i możliwość odświeżenia. Widoki gracza startują po `DOMContentLoaded`, bez oczekiwania na zdjęcia. Przejściowy błąd sprawdzenia sesji nie oznacza wylogowania, a potwierdzony brak dostępu nadal wymaga logowania.

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

Ekran główny, pytania i bonusy odświeżają dane w tle co 15-18 sekund po zakończeniu poprzedniego odczytu. Odczyt samego postępu jest dodatkowo ograniczony do jednego na 30 sekund, z wymuszeniem aktualnych danych po zapisie lub powrocie do karty. Pierwsze odświeżenie ma losowe opóźnienie; ukryta karta nie wysyła odczytów. Jednoczesne wymuszenia odświeżenia współdzielą bieżące żądanie. Odliczanie nadal działa lokalnie co sekundę, a potwierdzenia odpowiedzi i bonusów pokazują się od razu po zapisie.

Logowanie ma maksymalnie trzy próby z rosnącym, losowo rozłożonym opóźnieniem dla problemów sieciowych oraz odpowiedzi 429/500/502/503/504. Każda próba zachowuje identyfikator urządzenia i te same dane, więc utrata odpowiedzi po zapisaniu konta nie tworzy drugiego uczestnika. Błędy danych nie są ponawiane. Chwilowy błąd pobrania stanu rundy nie usuwa lokalnej sesji.

Przed wydarzeniem otwórz panel administratora i wykonaj „Szybki test” kilka minut przed startem, aby sprawdzić aktualne połączenie i zakończyć przygotowanie bazy po wdrożeniu. Plan i bieżące wykorzystanie Vercel oraz bazy Neon należy sprawdzić w ich panelach. Lokalna próba obciążeniowa nie jest gwarancją wydajności rzeczywistej infrastruktury ani sieci uczestników.

## Wolontariusze i zgłoszenia

Panel wolontariusza znajduje się pod `/wolontariusz/`, a obsługa organizatora w menu **Wolontariusze** (`/admin/wolontariusze/`). Najpierw administrator rozwija „Przypisanie wolontariuszy do bonusów”, wpisuje imię przy identyfikatorze bonusu i zapisuje przypisanie. Jeden bonus ma jednego wolontariusza. Login to identyfikator (np. B01), hasło to przypisane imię; wielkość liter i skrajne spacje nie mają znaczenia. To odrębne dane dostępu do panelu - zapis nie zmienia hasła bonusu w samej grze. Nowe konta nie są wypełniane przykładowymi osobami.

Wolontariusz widzi zgłoszenia swojego punktu, tworzy pytania i usterki ogólne lub przypisane do dowolnego pytania/bonusu oraz dopisuje odpowiedzi w rozmowie. Administrator widzi wszystkie zgłoszenia, odpowiada pod wpisem, filtruje listę i ustawia status: Nowe, W trakcie lub Rozwiązane. Odpowiedzi odświeżają się co około 20-23 sekundy w aktywnej karcie. Listy i rozmowy mają stronicowanie; ponowienie zapisu z tym samym identyfikatorem nie tworzy duplikatu.

Sesja wolontariusza używa oddzielnego losowego tokenu w HttpOnly/SameSite cookie (12 godzin), a hasło ma solony skrót scrypt. Serwer sprawdza przypisanie przy każdym żądaniu. Zmiana imienia lub przełącznika dostępu unieważnia poprzednie sesje. Limit logowania działa w bazie: 30 prób na adres IP w 10 minut. Blokada techniczna bonusu nie blokuje dostępu wolontariusza. Zgłoszenia i konta są wspólne dla rzeczywistego wydarzenia, niezależne od symulacji TEST i zachowywane po resetowaniu gry. Nie zmieniają punktacji ani stanu kodów.

Tabele `volunteer_accounts`, `volunteer_sessions`, `volunteer_login_attempts`, `volunteer_tickets` i `volunteer_messages` tworzy wersjonowana migracja `volunteer-desk` v1. Nowe API: `volunteer-session`, `volunteer-tickets`, `admin-volunteers`. Wolontariusz nie otrzymuje listy haseł, poprawnych odpowiedzi ani zgłoszeń innych punktów.

## Widoki mobilne i tło

Wspólny arkusz `public/mobile-canvas.css` przypisuje tło do całego dokumentu, który rośnie wraz z treścią. Usuwa ograniczenie wysokości głównego elementu przez `-webkit-fill-available`, ustawia minimalną wysokość widoku przez `dvh` z zapasem dla starszych przeglądarek i zachowuje kolory poszczególnych paneli. Widoki korzystają z `viewport-fit=cover` oraz odstępów `safe-area-inset-*`. Reguły wspólnego tła dotyczą wyłącznie ekranu, nie wydruków QR.

Sprawdzono dziewięć widoków w WebKit z emulacją iPhone’a przy szerokościach 320-844 px, zmianę wysokości przy aktywnym polu pytania i bonusu oraz wydłużanie i skracanie treści panelu. Weryfikacja obejmuje brak poziomego przepełnienia i tło na całej wysokości dokumentu. Są to testy silnika przeglądarki i emulacji, nie fizycznego iPhone’a.

## Historia, finał i pobieranie danych - 13.09.2026

- **Historia i archiwum** w menu admina prowadzi do /admin/historia/. Archiwum obejmuje uczestników, ich punkty i korekty, odpowiedzi, bonusy, otwarcia pytań, placówki, katalog pytań/bonusów i dostępny stan rundy. Tokeny urządzeń są pomijane. Zapis następuje przed resetem, startem nowej rundy, zatrzymaniem i zmianą katalogu; również przed czyszczeniem TEST. Zakończona runda jest dodatkowo zapisywana raz przy odczycie stanu przez zalogowanego administratora. Przycisk „Zapisz rundę teraz” tworzy ręczny zapis. Błąd archiwum przerywa transakcję resetu, więc dane robocze nie są usuwane.
- Archiwa są niezależne od roboczych tabel i pozostają po resetach; aplikacja nie udostępnia ich kasowania. Podgląd pobiera rekordy porcjami, a „Pobierz pełną kopię rundy” składa kompletny JSON na komputerze. Taki plik umożliwia późniejszą rekonstrukcję danych; nie ma automatycznego przywracania do trwającej rundy. Archiwum w tej samej bazie zabezpiecza przed resetem w aplikacji, nie przed utratą całej bazy. Kopię warto pobrać na osobne urządzenie.
- Logi zapisują uwierzytelniony login organizatora, akcję, czas, zakres, wynik oraz wybrane parametry; dla punktów także stan przed i po. Hasła i tokeny nie trafiają do logów. Przy wspólnym loginie nie da się rozróżnić fizycznych osób. Wpis „Brak potwierdzenia zakończenia” oznacza przerwanie procesu lub brak potwierdzenia logu: należy sprawdzić stan danych, nie powtarzać w ciemno korekty. Nie rekonstruujemy operacji sprzed wdrożenia logów.
- Migracja event-operations v1 tworzy admin_audit_log, round_archives i round_archive_items. Migracja score-time-ranking v1 odtwarza czas ostatniego zdobytego punktu dla istniejących kont bez ręcznych korekt, z zapisanych poprawnych odpowiedzi i bonusów; dla kont z korektami zachowuje dotychczasowy czas. score_at zmienia się odtąd tylko przy zmianie punktów, nie liczby odpowiedzi.
- W ostatnich 3 minutach publiczne wyniki są automatycznie ukryte. Odsłanianie jest możliwe po zakończeniu rundy, a podziękowanie po ręcznej akcji. Przycisk „Wróć do finału” cofa podziękowanie. Data strony powitalnej pozostaje 13 grudnia 2026, 10:00 czasu polskiego. Wszystkie liczniki rundy używają game-clock.js i czasu serwera; publiczna tablica domyślnie pokazuje LIVE niezależnie od widoku admina.
- admin-results zwraca podsumowanie, zagregowane statystyki, uczestników i katalogi; tablice answers/bonuses są puste. admin-records zwraca po 50 odpowiedzi lub bonusów z filtrami i kursorem. Zmiana ta nie zmienia zapisu danych gry. Szczegóły uczestnika pobierane są po otwarciu jego karty; liczniki i rankingi obejmują całą rundę. CSV/Excel/dyplomy nadal korzystają z pełnej listy uczestników.
- Lokalna próba 500 osób, 15 000 odpowiedzi i 5000 bonusów: podsumowanie 216 348 bajtów, największa strona odpowiedzi 16 888 bajtów, odczytano wszystkie 15 000 rekordów bez duplikatów. Nie jest to gwarancja wydajności produkcyjnej infrastruktury.
