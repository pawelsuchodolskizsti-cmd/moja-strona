# Konfiguracja ochrony danych

Stan zmian: 20 listopada 2026. Zmiany lokalne, bez publikacji i bez kontroli ustawień produkcyjnego konta.

## Sekrety

DATABASE_URL, ADMIN_LOGIN, ADMIN_PASSWORD i ADMIN_SESSION_SECRET ustawiaj wyłącznie w konfiguracji serwera. Pliki .env i .vercel są wykluczone z repozytorium. Przykład konfiguracji nie zawiera wartości. W produkcji wymagamy hasła o długości minimum 16 znaków i oddzielnego losowego sekretu sesji o długości minimum 32 znaków. Brak konfiguracji blokuje logowanie administratora. Po zmianie sekretu stare sesje wygasają.

## Szyfrowanie

Aplikacja korzysta z Neon przez sterownik serverless. Neon opisuje szyfrowanie danych w spoczynku AES-256 i szyfrowanie transmisji TLS: https://neon.com/docs/security/security-overview . Ochrona ta obejmuje przechowywanie bazy, a nie ukrywanie danych przed uprawnionym administratorem bazy. Produkcyjne API na Vercel odrzuca żądania bez HTTPS. Nie dodano własnego szyfrowania poszczególnych kolumn. Nie potwierdzono konfiguracji konta Neon, kopii zapasowych ani uprawnień dostępu do hostingu.

Pobrane PDF, Excel i JSON są zwykłymi plikami, nie zaszyfrowanymi archiwami. Nie publikuj ich w katalogu publicznym. Szyfrowanie dysku komputera i kontrola dostępu do pobranych plików wymagają osobnej konfiguracji. Nie można stwierdzić, że każda kopia danych jest szyfrowana tylko na podstawie kodu aplikacji.

## Historia zdarzeń

Panel pokazuje odrzucone i błędne żądania API: datę, endpoint, metodę, kod HTTP oraz losowy numer zdarzenia. Numer wraca w odpowiedzi i nagłówku X-Request-Id. Nie zapisujemy treści formularzy, haseł, tokenów ani parametrów adresu. Zdarzenia są ograniczone do ostatnich 30 dni i 10000 wpisów, porządkowanych przy kolejnym zapisie. Historia operacji administratora i archiwa rund pozostają osobno. Awaria zapisu historii nie blokuje odpowiedzi gry; zapisuje jedynie bezpieczne metadane w logu serwera. Błędy przeglądarki i awarie przed dotarciem do API nie są zbierane przez ten mechanizm.

## Usunięte moduły

Usunięto podstrony, trasy API i obsługę kontaktów Fundacji oraz panelu wolontariuszy. Nowy eksport nie tworzy ani nie eksportuje tabel wolontariuszy. Istniejących tabel historycznych i wcześniejszych kopii nie kasowano. Bonusy zdobywane w grze pozostały aktywne.

## Sprawdzenie przed publikacją

Zweryfikuj komplet sekretów, HTTPS, uprawnienia konta bazy i hostingu, retencję kopii oraz szyfrowanie dysków urządzeń z eksportami. Testy funkcjonalne nie zastępują audytu bezpieczeństwa i nie potwierdzają braku wszystkich możliwych podatności.
