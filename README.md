# Rotator

Rotator bestimmt, wer im Team als Nächstes eine wiederkehrende Aufgabe übernimmt. Jede Aufgabe hat eine eigene Teilnehmerliste, eigene Auswahlstände und einen aktuellen Gewinner. Bei Gleichstand inszeniert eine Raumschiff-Show mit Asteroidenfeld und Hyperraumsprung die Gewinnerenthüllung.

Der vereinbarte Umfang und die fachlichen Entscheidungen stehen in [PLAN.md](PLAN.md).

Farben und Typografie sind in [DESIGN.md](DESIGN.md) dokumentiert. Die aktuelle Palette verwendet Space Indigo, Pastel Petal, Lilac, Lavender Purple und Charcoal Blue. Fira Code wird in Regular, Medium und Bold lokal mitgeliefert; es gibt keine externen Font-Anfragen. Die Schriftdateien stehen unter der [SIL Open Font License](frontend/public/assets/fonts/FiraCode-LICENSE.txt).

## Features

- Aufgaben anlegen, bearbeiten, archivieren und wieder öffnen.
- Aufgaben mit Beschreibung und Teilnehmern duplizieren; die Kopie startet ohne Auswahlen und mit Auswahlständen 0.
- Wöchentliche oder monatliche Fälligkeiten mit erstem Termin; jede Übernahme setzt die Terminfolge fort, eine Rücknahme stellt den vorherigen Termin wieder her.
- Mehrere teamweite Abwesenheiten pro Person planen; automatische Pause und Rückkehr ohne Änderung der Auswahlstände.
- Verfügbare Personen bewusst manuell übernehmen lassen, mit Zählererhöhung, Kennzeichnung im Verlauf, Rücknahme und Berücksichtigung in Stats.
- Personen zentral verwalten und mehreren Aufgaben zuordnen.
- Personen nach Bestätigung aus dem Team und sämtlichen Aufgaben entfernen; die Historie bleibt erhalten.
- Aktivstatus und Auswahlstand unabhängig pro Aufgabe verwalten.
- Neue Teilnehmer beim niedrigsten aktiven Auswahlstand starten lassen.
- Ausschließlich aktive Personen mit dem niedrigsten Stand berücksichtigen; Gleichstände gleichverteilt zufällig auflösen.
- Auswahlstand mit verpflichtender Begründung korrigieren; Änderungen protokollieren.
- Aktuelle Auswahl, Auswahlhistorie und damalige Kandidaten nachvollziehen.
- Letzte Auswahl zurücknehmen, solange keine relevante Folgeänderung erfolgt ist.
- Space-Chooser mit zwölfsekündiger Raumschiff-Show, Schnellmodus, optionalem Sound, Vollbild und Überspringen; bei reduzierter Bewegung direkt das Ergebnis zeigen.
- Direkter interner Zugriff ohne Login; optional einfacher Browserschutz über HTTP Basic Auth.
- SQLite-Persistenz, konsistente Backups und Integritätsprüfung über CLI.
- Ein Anwendungscontainer mit Docker Compose und persistentem Datenvolume.

## Auswahlregeln

1. Für die gewählte Aufgabe werden alle aktiven, derzeit nicht abwesenden Zuordnungen gelesen.
2. Nur Personen mit dem kleinsten aktiven Auswahlstand kommen in den Lostopf.
3. Ein einzelner Kandidat wird direkt gewählt. Bei mehreren Kandidaten entscheidet eine gleichverteilte Zufallsauswahl auf dem Server.
4. Der Stand des Gewinners steigt um genau 1. Ergebnis, Historie und aktueller Gewinner werden gemeinsam gespeichert.
5. Erst danach präsentiert der Browser das gespeicherte Ergebnis.

„Manuell übernehmen“ wählt ausdrücklich eine verfügbare Person unabhängig vom Minimum; es gelten derselbe Schreibschutz und dieselbe Rücknahmeregel. Die kurze Auswahl-Animation zeigt die gespeicherte Übernahme. Abwesenheiten stehen unter **Team → Abwesenheiten**, die Wiederholung unter **Aufgabe anlegen/bearbeiten**, Duplizieren und manuelle Übernahme auf der Aufgabenseite. Daten ohne Wiederholung bleiben ohne Termin. Start-/Endtage von Abwesenheiten zählen vollständig in `APP_TIMEZONE`; manuell inaktive Zuordnungen bleiben auch danach inaktiv. Fällige Aufgaben erhalten einen dezenten Texthinweis. Eine frühe Übernahme erledigt bereits den nächsten Termin; verpasste Wiederholungen werden übersprungen. Monatsanker kehren nach kürzeren Monaten zum ursprünglichen Kalendertag zurück.

| Fall                                          | Verhalten                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Neue Zuordnung bei aktiven Ständen `8, 10, 8` | Start bei `8`                                                                          |
| Neue Zuordnung ohne aktive Teilnehmer         | Start bei `0`                                                                          |
| Person wird inaktiv                           | Keine zukünftige Auswahl; Stand bleibt erhalten                                        |
| Person wird wieder aktiv                      | Bestehenden Stand weiterverwenden                                                      |
| Alle Teilnehmer inaktiv                       | Auswahl wird abgelehnt                                                                 |
| Aktueller Gewinner wird inaktiv               | Vergangene Auswahl bleibt sichtbar                                                     |
| Person wird aus dem Team entfernt             | Aus allen Aufgaben ausblenden; ihre aktuelle Gewinneranzeige leeren, Historie erhalten |
| Seitenneuladen oder Animation überspringen    | Keine neue Auswahl, keine weitere Erhöhung                                             |
| Wiederholung derselben Auswahl-Anfrage        | Bereits gespeichertes Ergebnis zurückgeben                                             |

Der Auswahlstand enthält Startwerte und begründete Korrekturen. Er ist deshalb keine Lebenszeitstatistik tatsächlich durchgeführter Aufgaben. Die Historie hält echte Auswahlvorgänge separat fest. Eine gespeicherte Auswahl zählt sofort als Übernahme; ein zusätzlicher Annahme- oder Erledigt-Workflow ist nicht vorgesehen.

Direkte Wiederholungen sind erlaubt, wenn die Minimumregel sie ergibt. Nach längerer Inaktivität kann eine zurückkehrende Person mehrmals hintereinander gewählt werden, bis sie aufgeholt hat. Es gibt keine vorab feststehende Warteschlange.

## Schnellstart mit Docker

Voraussetzungen: Docker mit Compose und ein erreichbarer Docker-Daemon.

1. Bei Bedarf `.env.example` nach `.env` kopieren, um Port, Zeitzone oder optionalen Passwortschutz anzupassen:

   ```powershell
   Copy-Item .env.example .env
   ```

   Unter Linux/macOS: `cp .env.example .env`.

2. Anwendung bauen und starten:

   ```sh
   docker compose up -d --build
   docker compose logs -f rotator
   ```

3. [http://localhost:8080](http://localhost:8080) öffnen. Standardmäßig ist für das interne Tool kein Login erforderlich. Wenn `BASIC_AUTH_PASSWORD` gesetzt ist, erscheint stattdessen der Anmeldedialog des Browsers; der Benutzername ist standardmäßig `team`.

Compose veröffentlicht den Port standardmäßig ausschließlich auf `127.0.0.1`. Für andere Geräte wird ein Reverse Proxy auf dem Host vorgeschaltet oder die Portfreigabe bewusst an das Teamnetz angepasst. Der Anwendungscontainer verwendet Port `3000`.

Ein Reverse Proxy muss den ursprünglichen `Host`-Header einschließlich eines etwaigen Ports weiterreichen. Der API-Ursprungsschutz vergleicht ihn mit dem Browser-Ursprung; ein auf die interne Zieladresse umgeschriebener Host führt bei schreibenden Anfragen zu HTTP 403.

```sh
docker compose ps
docker compose stop rotator
docker compose up -d
```

Projektordner, Compose-Projekt, Service, Image und Container heißen `rotator`. Der Containername ist fest vergeben und bleibt auch bei einem anderen Verzeichnisnamen gleich.

Der Compose-Datenträger `chooser-data` verwendet ausdrücklich den bestehenden Docker-Volume-Namen `chooser_chooser-data` und enthält die Datenbank unter `/data/chooser.sqlite3`. Dadurch bleibt der vorhandene Datenbestand auch nach der Umbenennung verfügbar. Ein normaler Containerneustart oder Neuaufbau erhält die Daten. `docker compose down -v` entfernt dagegen das Volume und damit den Datenbestand.

## Bedienung

Unter **Stats** zeigt Rotator Übernahmen nach Personen und Aufgaben. „Details ansehen“ öffnet die Zuordnungen mit Filtern für Person und Aufgabe. Ansicht und Filter bleiben beim Neuladen erhalten und können über die URL geteilt werden. Die Auswertung umfasst die gesamte gespeicherte Historie einschließlich archivierter Aufgaben und entfernter Personen. Rückgenommene Auswahlen werden separat ausgewiesen und zählen nicht als Übernahmen. Der Auswahlstand enthält zusätzlich Startwerte und Korrekturen und wird deshalb separat dargestellt.

Auf der Aufgabenseite ist **Auswahlverlauf & Änderungsprotokoll** standardmäßig eingeklappt. Zum Lesen des Verlaufs oder Zurücknehmen der letzten Auswahl diesen Bereich zuerst öffnen.

Der Stats-Filter **Zeitraum** bietet „Insgesamt“, „Letzte Woche“ (letzte sieben Tage) und „Letzter Monat“ (rollierend bis zum entsprechenden Datum des Vormonats). Das genaue Zeitfenster steht unter dem Filter und bleibt beim Neuladen erhalten. Übernahmen, Rücknahmen und letzte Übernahme beziehen sich auf dieses Fenster; der ausdrücklich als aktuell beschriftete Auswahlstand bleibt der heutige Zähler.

Eingabedialoge fokussieren beim Öffnen das erste nutzbare Eingabefeld, damit direkt getippt werden kann. Bestätigungen ohne Eingabefeld starten bei „Abbrechen“.

Für einen eigenen Stats-Zeitraum **Benutzerdefiniert** wählen, **Startdatum** und **Enddatum** eingeben und **Anwenden** drücken. Der gesamte Endtag zählt in der Zeitzone der Anwendung mit. Erst „Anwenden“ ändert die Auswertung; der übernommene Bereich bleibt mit den anderen Filtern in der URL gespeichert.

### Aufgaben und Teilnehmer vorbereiten

Eine Aufgabe anlegen, beispielsweise „Daily moderieren“, und optional eine Beschreibung hinterlegen. Im Dialog können vorhandene Personen direkt per Checkbox ausgewählt werden; „Alle auswählen“ und „Auswahl leeren“ erleichtern die Zusammenstellung. Die ausgewählten Personen starten aktiv mit Auswahlstand 0. Aufgabe und Zuordnungen werden gemeinsam gespeichert. Die Auswahl ist optional; weitere Personen lassen sich später hinzufügen.

Personen lassen sich zentral anlegen und einer oder mehreren Aufgaben zuordnen. Dieselbe Person erhält für jede Aufgabe einen eigenen Aktivstatus und Auswahlstand.

Beim Hinzufügen übernimmt eine neue Zuordnung das aktive Minimum der Aufgabe. Eine vorhandene Zuordnung sollte bei Abwesenheit deaktiviert und später wieder aktiviert werden; ihr Stand bleibt erhalten.

### Person aus dem Team entfernen

Auf der Teamseite bei der Person „Entfernen“ wählen. Der Bestätigungsdialog nennt die Wirkung auf das gesamte Team und alle Aufgaben. Nach Bestätigung wird die Person aus den Team- und Aufgabenlisten ausgeblendet und nimmt an keiner weiteren Auswahl teil. Ist sie aktuell für eine Aufgabe ausgewählt, wird dort die aktuelle Gewinneranzeige geleert. Andere Personen behalten ihre Auswahlstände und aktuellen Auswahlen.

Vergangene Auswahlen einschließlich der damaligen Namen sowie die Auswahlstände der entfernten Person bleiben intern erhalten. Die Entfernung wird in den betroffenen Aufgaben protokolliert. Es gibt keine Aktion zum Wiederherstellen einer entfernten Person; für eine vorübergehende Pause stattdessen den Aktivstatus pro Aufgabe verwenden.

### Nächste Person auswählen

In der Aufgabendetailansicht stehen der aktuelle Gewinner, die Teilnehmer mit ihren Ständen und die Kandidaten für die nächste Auswahl. „Nächste Person auswählen“ speichert eine neue verbindliche Auswahl und startet bei Gleichstand die Präsentation.

Der Showmodus dauert zwölf Sekunden: Countdown, Start der benannten Kandidaten-Raumschiffe, Flug durch ein Asteroidenfeld, Hyperraumsprung und Anflug zur Gewinnerenthüllung. Parallaxsterne, Ausweichmanöver und Sprungtunnel inszenieren die bereits gespeicherte Auswahl. Die Schiffe fliegen sicher durch die Szene; Kollisionen entscheiden nicht über den Gewinner.

Der Schnellmodus zeigt das Ergebnis nach etwa einer Sekunde. Ein einzelner Kandidat erhält einen kurzen Start und Anflug von etwa 2,4 Sekunden. Bei aktivierter reduzierter Bewegung erscheint das Ergebnis unmittelbar. Sound ist optional; Vollbild und Überspringen stehen weiterhin zur Verfügung. Überspringen zeigt dasselbe gespeicherte Ergebnis und löst keine weitere Auswahl aus.

Bleibt eine Ansicht länger geöffnet, wird der aktuelle Stand regelmäßig nachgeladen. Hat jemand die Aufgabe zwischenzeitlich geändert, wird eine Auswahl aus dem veralteten Stand abgelehnt und die Oberfläche aktualisiert. Die Animation selbst hält keine Datenbanksperre.

### Auswahlstand korrigieren

Die Korrektur bei der jeweiligen Person öffnen, neuen nichtnegativen ganzzahligen Stand und eine aussagekräftige Begründung eingeben. Das Änderungsprotokoll enthält den vorherigen und neuen Stand sowie Grund und Zeitpunkt. Bestehende historische Auswahlvorgänge werden dadurch nicht umgeschrieben.

### Letzte Auswahl zurücknehmen

Eine versehentliche Auswahl kann zurückgenommen werden, sofern seitdem keine relevante Änderung der Aufgabe stattgefunden hat. Rücknahme reduziert den Gewinnerstand um 1, stellt die vorherige aktuelle Auswahl wieder her und markiert den Vorgang als zurückgenommen. Historie wird nicht gelöscht. Ältere oder durch Folgeänderungen überholte Vorgänge werden über eine begründete Korrektur behandelt.

### Archivieren

Archivierte Aufgaben bleiben mit ihren Daten erhalten und können wieder geöffnet werden. Während der Archivierung finden keine weiteren Auswahlen statt. Fachliche Teilnehmer sind keine Login-Konten; ihre Namen dienen der Auswahl und Anzeige.

## Lokale Entwicklung

Voraussetzung: Bun passend zur im `Dockerfile` festgelegten Version.

```sh
bun install --frozen-lockfile
```

Die `.env` ist optional. Bei Bedarf `.env.example` kopieren und die gewünschten Werte anpassen. Lokal ist `DATABASE_PATH=./data/chooser.sqlite3` und `PORT=3000` für die API vorgesehen.

```sh
bun run dev
```

[http://localhost:5173](http://localhost:5173) öffnen. `dev` startet den Bun-API-Server auf Port 3000 und den Vite-Entwicklungsserver auf Port 5173 gemeinsam. Vite leitet API-Anfragen weiter und aktualisiert die Svelte-Oberfläche bei Änderungen automatisch. Der produktive Build wird mit `bun run build` erzeugt; `bun run start` liefert danach API und gebaute Oberfläche gemeinsam auf Port 3000 aus.

| Befehl                              | Zweck                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `bun run dev`                       | Bun-API und Vite mit Hot Reload gemeinsam starten                        |
| `bun run start`                     | Server ohne Quellüberwachung starten                                     |
| `bun run build`                     | Svelte-Oberfläche mit Vite nach `dist/` bauen                            |
| `bun run typecheck`                 | Backend-TypeScript und Svelte-Komponenten prüfen                         |
| `bun run format`                    | Quellcode mit Prettier formatieren                                       |
| `bun run format:check`              | Formatierung ohne Änderungen prüfen                                      |
| `bun run test`                      | Automatisierte Tests ausführen                                           |
| `bun run test:e2e`                  | Browserassets bauen und isolierte Playwright-Tests ausführen             |
| `bun run test:docker`               | Image bauen und isolierten Container-/Persistenz-/Restore-Test ausführen |
| `bun run backup <zieldatei>`        | Konsistente geprüfte Sicherung erstellen                                 |
| `bun run check:db [datenbankdatei]` | Datenbankintegrität und Fremdschlüssel prüfen                            |

Schema und Datenverzeichnis werden beim ersten Anwendungsstart angelegt. Migrationen laufen beim Start. CLI-Befehle erzeugen bei einem falschen Quellpfad keine neue leere Datenbank.

### Wo wird was geändert?

```text
frontend/
  index.html                  Vite-Einstieg
  tsconfig.json               Frontend-Typprüfung
  src/
    main.ts                   Svelte starten
    App.svelte                Navigation, Daten und zentrale Aktionen
    app.css                   Globale Gestaltung und responsive Basis
    pages/                    Aufgabenübersicht, Aufgabendetails, Teamseite
    components/               Formulare, Teilnehmerliste, Verlauf, Chooser
    lib/                      API-Aufrufe, Formatierung und kleine UI-Helfer
src/
  server.ts                   Hono-Routen, statische Produktionsdateien, Serverstart
  auth.ts                     Optionales BasicAuth und API-Ursprungsschutz
  db.ts                       SQLite öffnen und Schema migrieren
  service.ts                  Auswahlregeln und atomare Fachoperationen
  cli.ts                      Backup und Integritätsprüfung
  shared/contracts.ts         Gemeinsame API-Datentypen
tests/                        Fach-, HTTP- und CLI-Tests
e2e/                          Playwright-Browserprüfungen
scripts/docker-smoke.ts       Isolierter Docker-Abnahmetest
vite.config.ts                Vite-Root, API-Proxy und Buildziel
svelte.config.js              Svelte-/TypeScript-Vorverarbeitung
```

Eine reine Darstellungsänderung beginnt in `frontend/src/pages` oder `components`. Kleine wiederverwendbare Ansichten bleiben in Komponenten; `App.svelte` koordiniert Datenladen und Aktionen. Animationen gehören in die Chooser-Komponente und beeinflussen das vom Server gespeicherte Ergebnis nicht.

Für neue API-Felder zuerst die gemeinsamen Verträge und Eingabevalidierung prüfen, danach Route und Fachoperation anpassen. Die Auswahlregel gehört in `src/service.ts`, nicht in die Oberfläche oder die HTTP-Route. Änderungen an der Persistenz erhalten eine Migration in `src/db.ts`. Die API verwendet JSON; Zod validiert Eingaben. Nach fachlichen Änderungen passende Tests ergänzen und Typprüfung, Tests, Formatprüfung sowie Build ausführen.

## Konfiguration

Bun liest lokal die `.env`. Compose übernimmt die unterstützten Werte aus der Projekt-`.env` und setzt Datenpfad, Host und Port im Container explizit.

| Variable              | Standard / Bedeutung                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `BASIC_AUTH_PASSWORD` | Leer beziehungsweise nicht gesetzt: direkter Zugriff ohne Login; gesetzt: HTTP Basic Auth aktiv |
| `BASIC_AUTH_USER`     | `team`; Benutzername für optionales BasicAuth                                                   |
| `APP_TIMEZONE`        | `Europe/Berlin` für angezeigte Zeitpunkte                                                       |
| `DATABASE_PATH`       | Lokal `./data/chooser.sqlite3`, im Container `/data/chooser.sqlite3`                            |
| `HOST`                | In `.env.example` lokal `127.0.0.1`, im Container `0.0.0.0`                                     |
| `PORT`                | `3000`                                                                                          |
| `CHOOSER_PORT`        | Compose-Hostport, standardmäßig `8080`                                                          |

Ohne Passwort sind alle fachlichen Aktionen für jeden erlaubt, der die Anwendung erreichen kann. Das ist der vorgesehene Standard für den internen Einsatz. Für einfachen zusätzlichen Schutz ein eigenes `BASIC_AUTH_PASSWORD` in `.env` setzen und den Container neu erstellen. Der Browser übernimmt die Anmeldung; eigene Konten, Sessions und Loginseiten gibt es nicht. BasicAuth-Zugangsdaten bei Netzwerkzugriff über HTTPS übertragen. Ein vorhandener geschützter Reverse Proxy kann den Zugang ebenfalls übernehmen.

Schreibende API-Anfragen verlangen `Content-Type: application/json` und lehnen fremde Ursprünge sowie entsprechende Fetch-Metadata ab. Der Browserclient benötigt keinen Sitzungsschlüssel oder CSRF-Token. Bei gemeinsamem Zugang gibt es keine verlässliche persönliche Zuordnung von Änderungen zu einzelnen Teammitgliedern.

## Backup und Integritätsprüfung

Das Datenvolume ist keine Sicherung. Für laufende Datenbanken erstellt der CLI-Befehl einen konsistenten Snapshot mit `VACUUM INTO` und prüft anschließend Datenbankintegrität sowie Fremdschlüssel. Vorhandene Zieldateien werden nicht überschrieben. Dateinamen mit Leerzeichen müssen in der Shell in Anführungszeichen stehen.

Lokal:

```sh
bun run backup ./backups/reihum-01.sqlite3
bun run check:db ./backups/reihum-01.sqlite3
```

Docker:

```sh
docker compose exec rotator bun run backup /data/backups/reihum-01.sqlite3
docker compose cp rotator:/data/backups/reihum-01.sqlite3 ./reihum-backup.sqlite3
```

Für jedes Backup einen neuen Dateinamen verwenden. Die Kopie anschließend außerhalb des Docker-Datenvolumes und möglichst auf einem anderen Speichermedium ablegen. Die tägliche Ausführung kann der Host über Task Scheduler, cron oder einen vorhandenen Sicherungsdienst übernehmen. Vor Updates mit Migrationen zusätzlich sichern.

Bei aktivem WAL-Modus darf die laufende Hauptdatei nicht isoliert als Backup kopiert werden: Noch nicht eingecheckte Daten können in der WAL-Datei liegen. Der Backupbefehl berücksichtigt den konsistenten Datenbankstand.

## Wiederherstellung

Nur bei gestoppter Anwendung wiederherstellen. Das Backup muss zur eingesetzten Anwendungsversion beziehungsweise zum unterstützten Datenbankschema passen.

Beispiel für Docker, ausgehend von `./reihum-backup.sqlite3`:

```sh
docker compose stop rotator
docker compose run --rm --no-deps rotator bun run backup /data/backups/before-restore-01.sqlite3
docker compose cp ./reihum-backup.sqlite3 rotator:/data/restore.sqlite3
docker compose run --rm --no-deps rotator bun run check:db /data/restore.sqlite3
```

Die zweite Zeile sichert den bisherigen Datenstand zusätzlich. Bei einer erneuten Wiederherstellung einen neuen Dateinamen statt `before-restore-01.sqlite3` verwenden. Nur fortfahren, wenn Sicherung und Prüfung erfolgreich waren. Danach im folgenden Hilfscontainer ausschließlich die benannten SQLite-Dateien austauschen. Der Hauptdienst bleibt dabei gestoppt:

```sh
docker compose run --rm --no-deps --entrypoint sh rotator -c 'rm -f /data/chooser.sqlite3-wal /data/chooser.sqlite3-shm && cp /data/restore.sqlite3 /data/chooser.sqlite3'
docker compose run --rm --no-deps rotator bun run check:db
docker compose up -d
```

Anschließend Aufgaben, Auswahlstände, aktuelle Gewinner und Historie kontrollieren. Den wiederhergestellten Stand bei Bedarf in einer getrennten Testinstallation prüfen, bevor er produktiv eingesetzt wird.

Lokal gilt derselbe Ablauf: Server vollständig stoppen, bisherigen Stand sichern, Backup prüfen, Hauptdatei ersetzen und ausschließlich die zugehörigen alten `-wal`-/`-shm`-Dateien entfernen. Danach den Server starten. Es darf währenddessen keine andere Verbindung auf die Datenbank schreiben.

## Updates und Betrieb

Vor einem Update ein geprüftes extern abgelegtes Backup erstellen. Anschließend:

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 rotator
```

Der Container läuft als Benutzer `bun`; das Datenverzeichnis gehört diesem Benutzer. Ein frisches benanntes Docker-Volume übernimmt diese Rechte. Bei einem eigenen Bind-Mount muss der Betreiber die Schreibrechte passend zum Containerbenutzer setzen.

Das Rootdateisystem ist im Compose-Betrieb schreibgeschützt. SQLite schreibt ins Datenvolume, temporäre Dateien liegen im `/tmp`-tmpfs. `/healthz` prüft die Erreichbarkeit der Anwendung. Logs gehen an stdout/stderr.

Ein altes Image ist nach einer Schemaänderung nicht automatisch kompatibel. Für einen Rollback gegebenenfalls das vorherige Image zusammen mit dem passenden Datenbankbackup wiederherstellen.

## Architektur und Grenzen

```text
Browser (Svelte 5 / CSS / TypeScript)
               |
       Bun + Hono / API
               |
       SQLite im Docker-Volume
```

Die Fachlogik verwendet kurze Transaktionen. Eine Request-ID verhindert doppelte Verarbeitung derselben Auswahl. Eine erwartete Aufgabenrevision schützt vor Auswahlen auf veraltetem Stand. Die Prüfung auf eine bereits verarbeitete Request-ID erfolgt vor der Versionsprüfung.

SQLite liegt auf lokalem Speicher. Eine Installation betreibt eine Anwendungsinstanz; ein gemeinsames Netzwerkdateisystem und mehrere horizontal verteilte Instanzen gehören nicht zum vorgesehenen Betrieb.

Noch nicht Teil des vereinbarten Startumfangs sind individuelle Konten/Rollen, mehrere Teams, zeitgesteuerte Abwesenheit, CSV-Export, Gewichtungen, mehrere Gewinner zugleich und ein Annahme-/Erledigt-Workflow. Eine Korrektur kann die ursprüngliche Fairness bewusst verändern und wird deshalb begründet protokolliert.

## Fehlerbehebung

| Symptom                                     | Prüfen                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Unerwarteter Browser-Anmeldedialog          | `BASIC_AUTH_PASSWORD` prüfen; ohne gesetztes Passwort ist der Zugang direkt                              |
| BasicAuth-Anmeldung scheitert               | `BASIC_AUTH_USER` und `BASIC_AUTH_PASSWORD` prüfen; der Browser kann alte Zugangsdaten zwischenspeichern |
| Andere Geräte erreichen die Anwendung nicht | Compose bindet absichtlich an localhost; Reverse Proxy beziehungsweise Teamnetzfreigabe konfigurieren    |
| Datenbank ist nicht beschreibbar            | Volume-/Bind-Mount-Rechte und freien Speicher prüfen                                                     |
| Auswahl meldet Konflikt                     | Aktuellen Stand laden; jemand hat die Aufgabe zwischenzeitlich geändert                                  |
| Backup meldet bestehende Zieldatei          | Neuen Dateinamen verwenden                                                                               |
| CLI findet keine Datenbank                  | `DATABASE_PATH` prüfen und Anwendung zunächst einmal starten                                             |
| Browser zeigt nach Änderung alten Stand     | In Entwicklung Port 5173 verwenden; für Produktion `bun run build` ausführen und neu laden               |

## Prüfung

Vor Änderungen beziehungsweise einem Release `bun run typecheck`, `bun run test`, `bun run format:check` und `bun run build` ausführen. Die Fach-, HTTP- und Backup-Tests laufen ohne Docker.

Für Browserprüfungen zunächst Chromium installieren und danach die Tests starten:

```sh
bunx playwright install chromium
bun run test:e2e
```

Die Browsertests starten einen eigenen Server auf Port 3199 mit einer eigenen Testdatenbank unter `.tools/`. Sie decken den Verwaltungsablauf, den Chooser, reduzierte Bewegung, Mobilansicht, Revisionskonflikte und den gezielten Verlust einer bereits gespeicherten Auswahlantwort ab. Nach Änderungen an Personenentfernung oder Space-Show sind die betreffenden Fach- und Browserprüfungen erneut auszuführen; diese Anleitung behauptet keine neue Testabnahme. Für eine vorhandene Chromium-Installation kann `PLAYWRIGHT_CHROMIUM_EXECUTABLE` auf deren ausführbare Datei zeigen. `BUN_EXECUTABLE` überschreibt bei Bedarf den Bun-Pfad für den Testserver.

Der Docker-Abnahmetest benötigt einen erreichbaren Docker-Daemon:

```sh
bun run test:docker
```

Er baut ein eigenes Testimage, erstellt einen ausschließlich lokal erreichbaren Container und ein eindeutig benanntes Testvolume, prüft den HTTP-Zugriff, Auswahl, Idempotenz, Nonroot-Betrieb, Containerwechsel sowie eine echte Offline-Wiederherstellung. Anschließend entfernt er ausschließlich seine eigenen Testressourcen. Produktivdaten werden nicht verwendet.

Die Oberfläche lädt jeweils die jüngsten 50 Auswahlen und Änderungsereignisse einer Aufgabe. Ältere Einträge bleiben vollständig in der Datenbank und ihren Sicherungen erhalten; eine Navigation durch ältere Historieneinträge ist noch nicht vorgesehen.
