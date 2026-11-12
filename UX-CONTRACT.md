# UX Contract

## Product context

Interne Teamaufgaben, deutschsprachig, Zeitzone `APP_TIMEZONE`. Produktgrundlage und Fachregeln: [PLAN.md](PLAN.md). Daten- und Auswahlverhalten: `src/shared/contracts.ts` und `src/service.ts`. Die Personenverwaltung erhält eine ausdrücklich bestätigte globale Entfernen-Aktion. Minimumauswahl, Archivierung, Rücknahme und Zugriffsregeln bleiben ansonsten bestehen.

## Visual contract

[DESIGN.md](DESIGN.md) dokumentiert die Indigo-/Pastell-Palette, Fira Code und die orbitale Richtung. Runtime-Eigentümer ist `frontend/src/app.css`; Svelte-Komponenten konsumieren diese Variablen. Eine dunkle Rahmung mit hellen Arbeitsflächen ist das einzige unterstützte Farbschema, kein zusätzlicher Theme-Schalter.

Der Introtext der Teamseite ist linksbündig und an den übrigen Arbeitsflächen ausgerichtet. Die Verwaltung bleibt ruhig. Die zwölfsekündige Raumschiff-/Asteroidenszene ist die ausdrücklich gewünschte visuelle Ausnahme und bleibt auf den Chooser begrenzt.

## Canonical UI Map

| Capability     | Canonical owner                               | Source of truth                        | Allowed variants                                                                            | Verification                          |
| -------------- | --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| Select/Listbox | Native `select` in TaskDetail und EditorModal | Bestehende einfache interne Anwendung  | OS-eigenes Popup; sichtbarer Trigger gemeinsam gestylt                                      | Browser und Tastatur                  |
| Date           | `lib/format.ts`                               | `APP_TIMEZONE`                         | Nur Anzeige; kein Date-Picker                                                               | Browser                               |
| Form           | `FormModal.svelte` und `EditorModal.svelte`   | Zod-API-Schemas und bestehende Dialoge | Anlegen/Bearbeiten/Korrektur                                                                | E2E                                   |
| Scrollbar      | `app.css`                                     | DESIGN.md                              | Globale Basis, Forced Colors systemeigen                                                    | Computed Style                        |
| Toast          | `App.svelte`                                  | Gemeinsames `notify`                   | Erfolg/Fehler                                                                               | Live-Region, E2E                      |
| CRUD           | `App.svelte` und API-Service                  | PLAN.md                                | Aufgabe öffnet Detail; Personenänderungen bleiben auf der Teamseite, Entfernen wirkt global | Vollständiger E2E-Ablauf              |
| Chooser        | `Chooser.svelte`                              | Gespeicherter Auswahl-Snapshot         | Space-Show, Schnellmodus, einzelner Kandidat und reduzierte Bewegung                        | Browser, Skip, Vollbild, DOM-Ergebnis |

Keine Tabellen-Selektion, Mehrfachaktionen oder Suchkomponenten. Alle Mitglieder eines kleinen Teams werden gerendert, deterministisch nach Aktivstatus, Auswahlstand und Name. Historie lädt die jüngsten 50 Einträge; die bestehende Einschränkung bleibt dokumentiert. Der flüchtige Archivfilter bleibt lokal und wird nicht als neuer URL-Vertrag eingeführt.

## Existing flow ledger

Aufgaben-Anlegen öffnet die neue Detailseite. Bearbeiten, Korrektur, Zuordnen und Statuswechsel aktualisieren die aktuelle Ansicht. Personen werden zentral angelegt, umbenannt oder nach Bestätigung entfernt. Gespeicherte Aktionen erhalten eine gemeinsame Statusmeldung. Escape/Abbrechen schließt Formdialoge; Fokus kehrt zum Auslöser oder Hauptinhalt zurück.

Archivierung, Rücknahme und Personenentfernung besitzen explizite Bestätigungsdialoge mit Wirkung und Objekt. Native Dialogelemente sichern Fokus und inerten Hintergrund. Formulare behalten ihre bestehende native Feldvalidierung plus sichtbare Serverfehler; eine neue Validierungsarchitektur ist ausdrücklich außerhalb dieser Änderung. Die gemeinsam gestylten Textareas erhalten ausreichend Höhe und bleiben für die bestehenden maximalen Eingabelängen nutzbar.

Die Entfernen-Bestätigung nennt die Person und erklärt: Sie verschwindet aus dem Team und allen Aufgaben und nimmt an keiner weiteren Auswahl teil. Ihre aktuelle Gewinneranzeige wird gegebenenfalls geleert. Andere Personen behalten ihre Auswahlstände und aktuellen Auswahlen. Historische Auswahlen, Namen und Auswahlstände bleiben erhalten; es gibt keine Personen-Wiederherstellung. Für Pausen bleibt „inaktiv“ die passende Aktion. Abbrechen ändert nichts; bei Serverfehler bleibt der Dialog mit verständlichem Fehler nutzbar. Nach Erfolg werden Team und betroffene Aufgaben aktualisiert; der Fokus erhält einen vorhandenen sinnvollen Zielpunkt, da der entfernte Auslöser nicht mehr existiert.

Backend-Vertrag: Globale Entfernung, inaktive Zuordnungen, gegebenenfalls geleerte Gewinneranzeigen, Aufgabenrevisionen und Änderungsereignisse werden atomar gespeichert. Historische Snapshots werden nicht umgeschrieben. Veraltete offene Aufgabenansichten müssen beim nächsten Schreiben einen Konflikt behandeln.

## Async and resilience

Beim Anlegen einer Aufgabe können vorhandene Personen über native, beschriftete Checkboxen ausgewählt werden. Die Mehrfachauswahl ist optional und zunächst leer; „Alle auswählen“ und „Auswahl leeren“ ändern nur die Auswahl im Dialog. Eine begrenzte scrollbare Liste hält lange Teams und Namen bedienbar. Bestehende Aufgaben behalten die Teilnehmerverwaltung auf der Detailseite. Der Server speichert neue Aufgabe, aktive Zuordnungen mit Auswahlstand 0 und Protokoll atomar. Ungültige oder inzwischen entfernte Personen erzeugen keine Teilaufgabe. Bei Fehlern bleiben Name, Beschreibung und Auswahl zur Korrektur erhalten.

Schreiben ist pessimistisch. Buttons blockieren doppelte Anfragen. Auswahl verwendet Request-ID und erwartete Revision gemäß Fachvertrag. Bei unklarer Netzwerkantwort wird dieselbe Anfrage geprüft. Konflikte laden den aktuellen Zustand und würfeln nicht automatisch erneut. Polling pausiert bei offenen Dialogen und während der Show. Namen und Kandidaten einer Auswahl stammen aus dem Server-Snapshot.

Die Space-Show visualisiert das bereits gespeicherte Ergebnis: Countdown, Flottenstart, Asteroidenfeld, Hyperraumsprung und Anflug dauern zusammen zwölf Sekunden. Einzelflug dauert etwa 2,4 Sekunden, Schnellmodus etwa eine Sekunde. Bei reduzierter Bewegung erscheint das Ergebnis direkt. Alle Schiffe passieren Hindernisse sicher; Ausweichmanöver und Asteroiden sind keine zusätzliche Auswahlregel. Optionaler Sound, Vollbild und Überspringen bleiben verfügbar. Überspringen bricht nur die Präsentation ab und zeigt denselben Gewinner; Neuladen erzeugt keine weitere Auswahl. Kandidatenmanifest und Endergebnis bleiben als DOM-Text verfügbar.

## Accessibility and verification

Native Buttons/Links/Tabellen, echte Labels, sichtbarer Fokus, textliche Statuskennzeichnung und reduzierte Bewegung bleiben erhalten. Native Select-Popups sind bewusst akzeptiert. Schmale Displays dürfen innerhalb von Tabellen scrollen; Seiten und Dialoge bleiben zugänglich. Canvas ersetzt keine Namen, Ergebnisanzeige oder Bedienaktionen. Das Gewinnergebnis wird einmal verständlich angekündigt; schnelle HUD- oder Flugupdates erzeugen keine dauernden Screenreader-Ansagen.

Die bestehenden Testszenarien für Erfolg, Konflikt, verlorene Antwort, Mobilansicht, Vollbild und reduzierte Bewegung sind nach der Änderung erneut auszuführen. Personenentfernung ist zusätzlich auf Bestätigung/Abbruch, globale Wirkung, erhaltene Historie, unveränderte andere Auswahlstände und sinnvoll wiederhergestellten Fokus zu prüfen. Dieses Dokument hält Prüfanforderungen fest und behauptet keine neue erfolgreiche Browserabnahme.

Relevante Projektbefehle: `bun run format:check`, `bun run typecheck`, `bun run test`, `bun run test:e2e`, `bun run build`. Neue visuelle Prüfungen vergleichen Aufgabenübersicht, Detail, Team, Formdialog und Chooser. Die visuelle Änderung beansprucht keine neue vollständige Barrierefreiheitszertifizierung.
