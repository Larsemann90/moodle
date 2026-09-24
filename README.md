# Kaskaden-Aufgaben – Setup-Anleitung

Eine PWA, mit der Schüler:innen Aufgaben herunterladen, Ergebnisse hochladen
und danach Lösungen sowie Feedback erhalten. Läuft komplett auf deinem
eigenen Supabase-Projekt (EU-Region wählbar) + GitHub Pages – wie deine
anderen Projekte.

## 1. Supabase-Projekt anlegen

1. Auf https://supabase.com kostenlos registrieren, "New project" wählen.
2. **Wichtig für Datenschutz:** Bei "Region" eine EU-Region wählen (z. B.
   Frankfurt / `eu-central-1`).
3. Projekt anlegen, kurz warten bis es bereit ist.

## 2. Datenbank einrichten

1. Im Supabase-Dashboard links auf **SQL Editor** → **New query**.
2. Inhalt der Datei `schema.sql` komplett hineinkopieren und auf **Run**
   klicken.
3. Danach im Storage-Bereich (siehe Schritt 3) und erst anschließend die
   Datei `storage-policies.sql` genauso ausführen.

## 3. Storage-Buckets anlegen

Im Dashboard unter **Storage** → **New bucket** dreimal anlegen (jeweils
**"Public bucket" ausgeschaltet lassen**):
- `aufgaben`
- `abgaben`
- `feedback`

Erst danach `storage-policies.sql` ausführen (Schritt 2.3), da sich die
Policies auf diese Buckets beziehen.

> Hinweis: Aktuell sind die Dateien technisch über eine "öffentliche URL"
> abrufbar, sobald man den genauen (langen, zufälligen) Link kennt – das ist
> für ein Klassen-internes Tool ein vertretbarer Kompromiss. Für höhere
> Anforderungen können die Buckets später auf signierte, zeitlich begrenzte
> Links umgestellt werden (sprich mich gerne an, falls gewünscht).

## 4. API-Zugangsdaten eintragen

1. Im Dashboard unter **Project Settings → API**: `Project URL` und
   `anon public key` kopieren.
2. In der Datei `js/config.js` beide Werte eintragen:
   ```js
   const SUPABASE_URL = "https://dein-projekt.supabase.co";
   const SUPABASE_ANON_KEY = "dein-anon-key";
   ```

## 5. Auf GitHub Pages veröffentlichen

1. Neues GitHub-Repository anlegen, den Inhalt dieses Ordners hochladen
   (genau wie bei deiner Kochapp).
2. Unter **Settings → Pages** die Veröffentlichung ab dem `main`-Branch
   aktivieren.
3. Die Seite ist danach unter `https://dein-github-name.github.io/repo-name/`
   erreichbar.

## 6. Erste Nutzung

1. `teacher.html` öffnen → **Konto erstellen** mit deiner E-Mail und einem
   Passwort (das ist dein persönlicher Lehrer-Login, getrennt von den
   Schüler-Logins).
2. Klasse anlegen (z. B. "9a").
3. Klasse auswählen → Schüler mit Vorname + Passwort anlegen. Diese Zugangsdaten
   gibst du den Schülern (z. B. ausgedruckt).
4. Kaskade anlegen (Titel + Freischalt-Modus: automatisch oder nach deiner
   Freigabe).
5. Kaskade auswählen → Stufen mit Aufgabentext/-datei und Lösungstext/-datei
   hinzufügen.
6. Schüler öffnen `student.html`, wählen ihre Klasse, melden sich mit
   Vorname + Passwort an, sehen die erste Stufe, laden ihre Bearbeitung hoch.
7. Bei "nach Freigabe": Du siehst die Einreichung im Dashboard unter der
   Kaskade, kannst die Abgabe öffnen, Text-/Datei-/Audio-Feedback geben und
   dann die Lösung freigeben.
8. Nach Freigabe sieht der Schüler automatisch Lösung + dein Feedback beim
   nächsten Öffnen der Seite.

## Update 1: echte Zugriffsbeschränkung, Umbenennen, Passwort-Reset

Falls du die App schon eingerichtet hattest, zusätzlich:

1. **Anonyme Anmeldungen aktivieren:** Im Supabase-Dashboard unter
   **Authentication → Sign In / Providers** den Schalter **"Allow
   anonymous sign-ins"** aktivieren. Ohne das funktioniert der
   Schüler-Login danach nicht mehr.
2. Im SQL Editor nacheinander ausführen: `update-1.sql`, danach
   `update-1-storage-policies.sql`.
3. **Redirect-URL für Passwort-Reset erlauben:** Unter
   **Authentication → URL Configuration** bei "Redirect URLs" deine
   GitHub-Pages-Adresse eintragen, z. B.
   `https://dein-github-name.github.io/repo-name/teacher.html`.
4. Alle Dateien (inkl. `js/student.js`, `js/teacher.js`,
   `teacher.html`) erneut hochladen.

**Was sich geändert hat:**
- Schüler-Dateien (Abgaben, Feedback) sind jetzt wirklich nur für den
  jeweiligen Schüler und dich abrufbar – nicht mehr nur über einen
  schwer erratbaren Link, sondern über eine echte Zugriffsprüfung in
  der Datenbank. Downloadlinks laufen zusätzlich nach 10 Minuten ab.
- Klassen lassen sich über das Stift-Symbol ✏️ neben dem Klassennamen
  umbenennen.
- Auf der Lehrer-Login-Seite gibt es jetzt "Passwort vergessen?" –
  verschickt einen Reset-Link per E-Mail.
- Ein Schüler ist jetzt jeweils nur auf einem Gerät gleichzeitig aktiv
  eingeloggt: meldet er sich auf einem neuen Gerät an, wird die
  vorherige Sitzung ungültig (guter Nebeneffekt an Schul-Rechnern).

## Datenschutz-Hinweise

- Passwörter der Schüler werden serverseitig gehasht gespeichert (nie im
  Klartext), Vergleich läuft ausschließlich über eine gesicherte
  Datenbankfunktion.
- Schüler haben keinen direkten Datenbankzugriff, sondern nur über eng
  begrenzte Funktionen (RPCs) – sie können nie Daten anderer Schüler sehen.
- Für den produktiven Einsatz an einer Schule empfiehlt es sich zusätzlich,
  mit Supabase einen Auftragsverarbeitungsvertrag (AVV) abzuschließen und
  mit deiner Schule/Datenschutzbeauftragten Rücksprache zu halten, da die
  rechtliche Bewertung je nach Bundesland variieren kann.
- Es werden nur Vornamen statt vollständiger Namen verwendet; bei
  Namensdopplungen in einer Klasse ggf. ein Kürzel (z. B. "Max K.") als
  Vorname-Feld nutzen.
- Für automatische Löschung alter Einreichungen am Schuljahresende gibt es
  aktuell keine automatische Funktion – das lässt sich bei Bedarf ergänzen.

## Grenzen dieser ersten Version

- Kein Passwort-"Vergessen"-Mechanismus für Schüler – dafür kannst du als
  Lehrkraft das Passwort im Dashboard zurücksetzen.
- Schüler-Sitzungen laufen nach 12 Stunden ab (dann einfach neu anmelden).
- Es gibt noch keine Möglichkeit, eine Kaskade mehreren Klassen gleichzeitig
  zuzuweisen – bei Bedarf sag Bescheid, das lässt sich ergänzen.
