# Rotator – Grundplan und vereinbarter Umfang

Stand: 11. November 2026. Dieses Dokument hält den abgestimmten Grundplan einschließlich der später bestätigten Vereinfachungen fest. Es beschreibt das Ziel; tatsächliche Implementierung und geprüfte Grenzen stehen in der README.

Nach der ersten Umsetzung wurde die technische Richtung präzisiert: kleine etablierte Frameworks und eine gut lesbare Codebasis statt eigener umfangreicher UI- und Sitzungsinfrastruktur. Das Frontend verwendet deshalb Svelte 5 mit Vite; intern startet die Anwendung ohne Login. Optional kann eine einfache HTTP-Basic-Authentifizierung aktiviert werden.

## Ziel

Ein kleines Teamwerkzeug zur fairen Bestimmung der nächsten Person für wiederkehrende Aufgaben. Eine Installation verwaltet ein Team mit mehreren unabhängigen Aufgaben. Bedienung auf Deutsch, responsive und per Tastatur möglich. Bereitstellung als ein Docker-Container mit einfacher persistenter SQLite-Datenbank.

## Verbindliche Auswahlregeln

1. Personen werden zentral angelegt und Aufgaben zugeordnet. Pro Zuordnung gibt es einen eigenen Aktivstatus und nichtnegativen ganzzahligen Auswahlstand.
2. Neue Zuordnungen starten beim kleinsten Auswahlstand der zuvor aktiven Mitglieder dieser Aufgabe. Gibt es keine aktiven Mitglieder, starten sie bei 0. Es wird kein fiktiver historischer Auswahlvorgang erzeugt; der Startwert wird protokolliert.
3. Bei jeder Auswahl werden ausschließlich aktive Mitglieder berücksichtigt. Nur Personen mit dem niedrigsten aktiven Stand kommen in die Auswahlmenge.
4. Ein einzelner Kandidat wird direkt bestimmt. Bei Gleichstand erfolgt eine gleichverteilte kryptografische Zufallsauswahl auf dem Server.
5. Eine erfolgreich gespeicherte Auswahl gilt sofort als Übernahme: Genau der Auswahlstand des Gewinners wird um 1 erhöht. Eine weitere Bestätigung oder Erledigt-Markierung ist nicht vorgesehen.
6. Aufgaben haben jeweils einen eigenen aktuellen Gewinner. Er bleibt bis zur nächsten Auswahl, deren Rücknahme oder der Entfernung der gewählten Person sichtbar. Spätere Inaktivierung entfernt keine vergangene Auswahl.
7. Deaktivierung bewahrt den Stand, Reaktivierung setzt ihn fort. Nachholbedarf nach längerer Abwesenheit ist möglich. Direkte Wiederholung derselben Person ist zulässig, sofern die Regeln sie ergeben.
8. Auswahlstandkorrekturen sind Teil der ersten Version. Neuer Wert und verpflichtende Begründung werden zusammen mit altem Wert und Zeitpunkt protokolliert. Die historische Zahl tatsächlicher Auswahlen wird dadurch nicht umgeschrieben.
9. Eine Person kann nach ausdrücklicher Bestätigung aus dem gesamten Team entfernt werden. Sie wird intern als entfernt markiert, alle ihre Aufgabenzuordnungen werden inaktiv und aus den laufenden Ansichten ausgeblendet. Ihre historischen Auswahlen, Namen und Auswahlstände bleiben erhalten. Eine aktuelle Gewinneranzeige dieser Person wird geleert; Auswahlstände und aktuelle Gewinner anderer Personen ändern sich nicht. Betroffene Aufgaben erhalten eine neue Revision und einen Protokolleintrag. Eine Wiederherstellung einzelner Personen ist nicht vorgesehen.

## Funktionsumfang

- Aufgaben anlegen, bearbeiten, archivieren und wieder öffnen; Übersicht und direkte Detailseiten. Beim Anlegen vorhandene Personen optional per Checkbox auswählen; Aufgabe und Zuordnungen gemeinsam speichern, alle starten aktiv bei 0.
- Zentrale Personenverwaltung, bestehende Personen zu Aufgaben hinzufügen, Namen ändern und Personen nach Bestätigung global entfernen.
- Aktiv/inaktiv pro Aufgabe; Tabelle mit Auswahlstand und Kennzeichnung der nächsten Kandidaten.
- Aktueller Gewinner, Auswahlhistorie mit Kandidatensnapshot sowie Verwaltungsprotokoll.
- Letzte Auswahl rückgängig machen, sofern danach keine relevante Änderung der Aufgabe erfolgte. Gewinnerstand reduzieren, vorherigen Gewinner wiederherstellen, Vorgang sichtbar stornieren. Keine beliebige historische Rückabwicklung.
- Interner Betrieb ohne Login als Standard; optional HTTP-Basic-Authentifizierung mit einem gemeinsamen Benutzernamen und Passwort. Fachliche Teilnehmer sind keine Login-Konten.
- Sicherung und Integritätsprüfung per CLI, dokumentierte Offline-Wiederherstellung.

## Unterhaltsamer Chooser

Die ausdrücklich gewünschte spektakuläre Space-Show ist auf den Chooser konzentriert. Benannte Kandidaten-Raumschiffe starten zwischen Parallaxsternen, weichen einem Asteroidenfeld aus und erreichen über einen Hyperraumsprung den Anflug zur Gewinnerenthüllung. Die normale Verwaltung bleibt ruhig und lesbar; Produktname Rotator, die fünf vereinbarten Farben und Fira Code gelten auch für die Show.

Der Showmodus dauert zwölf Sekunden: Countdown 2,4 Sekunden, Flottenstart 1,6 Sekunden, Asteroidenfeld 3,2 Sekunden, Hyperraumsprung 2,5 Sekunden und Anflug 2,3 Sekunden. Der Schnellmodus dauert etwa eine Sekunde. Ein einzelner Kandidat erhält einen kurzen Start und Anflug von etwa 2,4 Sekunden. Bei reduzierter Bewegung erscheint das Ergebnis unmittelbar. Sound bleibt optional; Vollbild und jederzeitiges Überspringen bleiben erhalten. Nur tatsächlich berechtigte Kandidaten werden als Teilnehmer dargestellt. Die Szene visualisiert den gespeicherten Gewinner; Kollisionen oder Ausweichmanöver sind keine Auswahlregel.

Der Server speichert die Entscheidung vor Animationsbeginn. Browser, Animation, Überspringen und Neuladen bestimmen weder Gewinner noch Zähler. Andere Ansichten erhalten Zustandsaktualisierungen; Animationssnapshots bleiben als solche erkennbar.

## Technischer Aufbau

- TypeScript mit strikter Typprüfung, Bun als Laufzeit, Hono als kleiner HTTP-Router.
- Svelte 5 mit TypeScript und eigenem lesbarem CSS; Vite übernimmt Entwicklung mit Hot Reload und den Produktionsbuild.
- Kleine UI-Komponenten für Teilnehmer, Verlauf, Formulare und Chooser; eigene Seiten für Aufgabenübersicht, Aufgabendetails und Teamverwaltung.
- Eingabevalidierung durch kleine wiederverwendbare Zod-Schemas statt verstreuter eigener Prüfungen; gemeinsame API-Typen.
- `bun:sqlite`, direkte parametrisierte SQL-Abfragen, versionierte Migrationen; kein separater Datenbankserver und kein ORM.
- SQLite in lokalem persistentem Docker-Volume unter `/data`; eine Anwendungsinstanz. Fremdschlüssel, kurze Transaktionen, Schreibwartezeit und WAL.
- Getrennte Module für HTTP, Zugriffsschutz, Datenbank, Fachlogik, Validierung, Browser und Chooser. Ein Formatter hält die Dateien einheitlich lesbar.
- Ein Container liefert Oberfläche und API. Vorhandener Reverse Proxy kann HTTPS und vorgeschalteten Zugriff übernehmen.

## Integrität und Nebenläufigkeit

Auswahlmenge, Zufallsentscheidung, Zähleränderung, Historie und aktueller Gewinner werden atomar gespeichert. Pro Anfrage gibt es eine Request-ID: Wiederholung derselben Auswahl-Anfrage liefert denselben Vorgang und erhöht keinen Zähler erneut. Eine erwartete Aufgabenrevision verhindert unbeabsichtigte doppelte Auswahlen aus veralteten Ansichten. Die Idempotenzprüfung erfolgt vor der Revisionsprüfung. Alle relevanten Änderungen erhöhen die Aufgabenrevision. Die Animation hält keine Datenbanksperre.

## Datenmodell

Aufgaben, Personen mit internem Entfernungsmerkmal, Aufgabenzuordnungen, Auswahlvorgänge und Änderungsereignisse. Auswahlvorgänge enthalten Namen/Kandidaten zum damaligen Zeitpunkt, alten/neuen Stand, Auswahlart, Zeitpunkt, Request-ID, Ergebnisrevision und Stornostatus. Das Entfernen einer Person löscht keine historischen Referenzen; Entfernungsmerkmal, inaktive Zuordnungen, gegebenenfalls geleerte aktuelle Auswahl sowie Revisionen und Protokolle werden gemeinsam gespeichert. Aktuelle Daten und historische Snapshots sind getrennt; es ist kein Event-Sourcing-System erforderlich.

## Betrieb und Sicherheit

Reproduzierbarer Docker-Build mit Lockfile, Prozess ohne Rootrechte, persistentes gesamtes Datenverzeichnis, Healthcheck und Logs auf stdout/stderr. Standardmäßig kein Login für den internen Einsatz. Bei gesetztem `BASIC_AUTH_PASSWORD` wird Hono-BasicAuth mit `BASIC_AUTH_USER` (Standard `team`) verwendet; der Browser übernimmt die Anmeldemaske. Eigene Sitzungen, Loginseiten und CSRF-Token entfallen. Schreibende API-Anfragen verlangen JSON und lehnen fremde Ursprünge beziehungsweise entsprechende Fetch-Metadata ab. Eingabegrenzen und parametrisierte Abfragen bleiben bestehen. Zugangsdaten gehören nicht ins Repository. Ein gemeinsamer Zugang erlaubt keine verlässliche persönliche Attribution im Änderungsprotokoll.

Compose veröffentlicht die Anwendung zunächst nur auf localhost. Der Zugriff aus dem Teamnetz wird bewusst freigegeben oder über einen vorhandenen Reverse Proxy geführt. BasicAuth wird bei Netzwerkzugriff über HTTPS verwendet.

Backups müssen konsistente SQLite-Snapshots sein und außerhalb des Live-Volumes aufbewahrt werden. Updates erhalten Daten und führen Schemaänderungen kontrolliert aus; vor Migrationen sichern. Wiederherstellung offline testen. Docker-Volume ist keine Datensicherung und SQLite-WAL gehört nicht auf ein gemeinsam genutztes Netzwerkdateisystem.

## Umsetzung und Prüfung

1. Grundgerüst, Migrationen und Docker.
2. Aufgaben, Personen, Auswahlkern, Startwerte und begründete Korrekturen.
3. Oberfläche und Space-Show.
4. Historie, Rücknahme, Zugriffsschutz, Backup/Restore und Dokumentation.

Automatisierte Tests prüfen Minimumlogik, inaktive und entfernte Personen, Startwerte, Aufgabenunabhängigkeit, exakte Zähleränderung, Request-ID-Wiederholung, Revisionskonflikte, Rücknahme und Korrekturen. Die Personenentfernung ist auf alle betroffenen Aufgaben, erhaltene Historie, unveränderte andere Auswahlstände, geleerte betroffene Gewinneranzeigen und Revisionen zu prüfen. Gezielte HTTP-/Browserprüfungen prüfen den Hauptablauf, optionales BasicAuth, Ursprungsschutz, Entfernen-Bestätigung, Fehlerzustände, Space-Show/Skip, Tastatur und Containerpersistenz, soweit die Umgebung dies ermöglicht. Keine zufallsabhängigen Gleichverteilungstests mit instabilen Erfolgsgrenzen. Dies sind Prüfanforderungen, keine Behauptung einer bereits erfolgten Abnahme neuer Änderungen.

Die Oberfläche zeigt zunächst die jüngsten 50 Auswahlen und Änderungsereignisse je Aufgabe. Ältere Daten bleiben gespeichert; eine Navigation durch ältere Einträge gehört nicht zum ersten Umfang.

## Zurückgestellte Erweiterungen

Alternative Glücksradanimation, zeitgesteuerte Abwesenheit, CSV-Export, Aufgaben duplizieren, manuelle Zuweisung, mehrere Gewinner gleichzeitig, individuelle Konten/Rollen und mehrere Teams. Gewichtung und Ausschluss der zuletzt gewählten Person wären eigenständige fachliche Änderungen. Vollständiger Reset ist eine optionale spätere Verwaltungsfunktion, keine Voraussetzung der ersten Version.
