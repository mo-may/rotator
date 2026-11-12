---
version: alpha
name: Rotator
description: Teamaufgaben auf einer minimalistischen hellen Oberfläche verwalten; die Space-Show bleibt der inszenierte Auswahlmoment.
colors:
  primary: '#8661c1'
  indigo: '#2e294e'
  petal: '#efbcd5'
  lilac: '#be97c6'
  lavender: '#8661c1'
  charcoal: '#4b5267'
typography:
  body:
    fontFamily: "'Fira Code', Consolas, monospace"
    fontSize: '16px'
    lineHeight: '1.6'
  display:
    fontFamily: "'Fira Code', Consolas, monospace"
  mono:
    fontFamily: "'Fira Code', Consolas, monospace"
rounded:
  DEFAULT: '6px'
spacing:
  page-max: '1120px'
  section-gap: '32px'
components:
  button:
    height: '44px'
  dialog:
    rounded: '{rounded.DEFAULT}'
  table: {}
---

# Rotator Design System

## Overview

Ein kleines internes Werkzeug für wiederkehrende Teamaufgaben. Die Nutzerentscheidung vom 12.11.2026 vereinfacht die Verwaltung deutlich: weiße Arbeitsfläche, kompakte Listen, kleinere Überschriften und wenige violette Akzente. Fira Code, Produktname und die vollständige Auswahl-Animation bleiben erhalten.

Die Alltagsansichten sind ein sachliches Arbeitswerkzeug. Kein dekorativer Orbitrahmen, keine große Einleitung, keine mehrfachen Kennzahlen oder Kartenraster. Die starke Inszenierung konzentriert sich auf Kandidaten-Raumschiffe, Asteroidenfeld und Hyperraumsprung im Chooser.

Geschäftliche Grundlage: [PLAN.md](PLAN.md), API-Typen in `src/shared/contracts.ts` und Fachlogik in `src/service.ts`. Sprache Deutsch, Zeitzone aus der Anwendungskonfiguration. Keine Japan-Markt- oder Mehrsprachenanforderung.

## Colors

Die fünf benannten Farbwerte im Frontmatter sind die exakte Nutzerpalette; `primary` ist der semantische Alias für Lavender Purple. **`frontend/src/app.css` besitzt die Runtime-Tokens**; dieses Dokument spiegelt die Werte und erläutert ihre Rollen. Komponenten verwenden semantische Variablen statt eigener Farbsammlungen. Abgeleitete Flächen, Linien und Hoverfarben entstehen dort mit `color-mix()`.

| Palette         | Runtime                   | Verwendung                                   |
| --------------- | ------------------------- | -------------------------------------------- |
| Space Indigo    | `--indigo`, `--ink`       | Dunkler Text und Chooser                     |
| Pastel Petal    | `--petal`                 | Fokusrahmen und Namensenthüllung in der Show |
| Lilac           | `--lilac`                 | Dezente Linien und sekundäre Akzente         |
| Lavender Purple | `--lavender`, `--primary` | Primäraktionen und aktive Zustände           |
| Charcoal Blue   | `--charcoal`              | Sekundärer Text, Linien und dezente Flächen  |

Im hellen Modus sind `--paper` und `--surface` Weiß (`#ffffff`); `--surface-muted` mischt Charcoal zu 3 % mit der Arbeitsfläche. Lavender hebt Primäraktionen hervor. Pastellfarben bleiben auf sparsame Zustände und die Show begrenzt. Fehler nutzen eine dunkle Indigo-/Petal-Ableitung und bleiben durch ihren Text erkennbar. Ein globaler Scrollbarstil mit Systemfarben im Forced-Colors-Modus gehört zur gemeinsamen CSS-Datei.

Die Darstellung unterstützt hell und dunkel. Ohne gespeicherte Auswahl gilt beim Start die Systemeinstellung. Der Schalter „Dark Mode“ in der Navigation speichert eine ausdrückliche Wahl im Browser. `frontend/public/assets/theme.js` setzt das Root-Attribut vor dem Laden der Styles; `ThemeSwitch.svelte` besitzt Umschalten und Speichern. Das externe Startskript erfüllt die bestehende Content Security Policy ohne Freigabe von Inline-Skripten.

`app.css` besitzt alle Farbwerte: `:root[data-theme='dark']` mischt für `--paper` Indigo zu 65 % und für `--surface` zu 82 % mit Schwarz. Heller Text nutzt `--on-dark`; sekundärer Text mischt diesen zu 68 % mit Charcoal. Linien, Eingabefelder, Hinweise und Scrollbars wechseln über ihre semantischen Tokens. `--accent-text` trennt lesbare Akzenttexte (dunkel: Lilac) vom violetten Button-Hintergrund; `--focus-ring` und `--focus-halo` sichern sichtbaren Tastaturfokus. Geometrie und Informationshierarchie bleiben gleich. Die Space-Show verwendet weiterhin ihre feste dunkle Palette.

## Typography

Fira Code für Marke, Titel, Fließtext und Zahlen. Unveränderte TTF-Dateien in Regular, Medium und Bold liegen unter `frontend/src/assets/fonts/` und werden mit der Anwendung ausgeliefert. Die Lizenz liegt unter `frontend/public/assets/fonts/FiraCode-LICENSE.txt`. Keine externen Font-Anfragen. Regular wird vorgeladen; `font-display: swap` hält Text während des Ladens sichtbar. 16px Basis und 1,6 Zeilenhöhe. Ligaturen bleiben für Namen und UI-Texte deaktiviert. Deutschsprachige Namen und lange Aufgaben umbrechen statt abgeschnitten zu werden.

## Layout

Maximale Seitenbreite 1120px (`--page-max`). Dokument-Scrolling bleibt erhalten. Aufgaben und Team werden als flache Listen mit Trennlinien dargestellt. Aufgabenname, Beschreibung, aktueller Gewinner und aktive/gesamte Teilnehmer bleiben in der Übersicht sichtbar; mobil stehen dieselben Werte untereinander. Aktive Aufgaben und Teamgröße erscheinen jeweils einmal als kleine Zahlen.

Die Detailseite hat keine Seitenleiste. Aktueller Gewinner und Auswahlbereich stehen am Desktop nebeneinander, mobil untereinander. „Aktuell ausgewählt“ erhält eine dezente Fläche in `--tint`, einen linken Akzent in `--primary` und den größten Namen der Seite (32–52px, fett). Auswahlzeitpunkt und gegebenenfalls Inaktivstatus bleiben darunter sichtbar. Lange Namen brechen vollständig um. Ohne Auswahl bleibt der Bereich zurückhaltend. Kandidatennamen, Teilnehmerstände, Aktivstatus und Verlauf bleiben sichtbar. Auswahlregel und Animationsoptionen sind native, per Tastatur bedienbare Details-Elemente. Es gehen keine Einstellungen verloren. Seitenüberschriften sind 26–32px groß; Abschnittstitel 18px.

Der Introtext der Teamseite ist linksbündig und an Listen beziehungsweise Toolbar ausgerichtet. Die Ausrichtung bleibt auch auf schmalen Displays links; zusätzliche Aktionen ändern diese Textausrichtung nicht.

## Elevation & Depth

Flache Arbeitsflächen mit dünnen Linien. Verwaltungsseiten verwenden keine schwebenden Marketingkarten, Sticker, dekorativen Schatten oder Glows. Ein deutlicher Schatten kennzeichnet dort modale Ebenen. Die Space-Show darf bewusst räumliche Tiefe, dichte Parallaxsterne, Leuchtspuren und den Sprungtunnel einsetzen; diese Effekte bleiben auf die Auswahlpräsentation begrenzt und verwenden die gemeinsame Palette.

## Shapes

6px (`--radius`) als gemeinsame Ecke für Aktionen und Dialoge. Verwaltungslisten verwenden Trennlinien statt Kartenrahmen. Kreisbahnen bleiben auf die Space-Show beschränkt. Keine Asterisk-Sterne als universelles Dekorelement.

## Components

Das Windows-Startfenster ist eine bewusst native Betriebssystemoberfläche. `src/desktop/Launcher.cs` besitzt Dateiauswahl, Buttons, Status und Fokus; WinForms/Systemfarben und Segoe UI besitzen Schrift, Skalierung, Dialoggeometrie und Kontrast. Es dupliziert keine Web-Komponenten oder Farbwerte. Die im Browser geöffnete Anwendung verwendet unverändert die Runtime-Tokens aus `app.css`, Fira Code und ihre vorhandene Theme-Auswahl.

Buttons, Felder, Hinweise und Scrollbars konsumieren die Tokens aus `app.css`. Darstellung und Verhalten der geteilten Formdialoge, Mitgliederliste, Historie und Avatar-Komponente bleiben über Aufgaben und Team konsistent. [UX-CONTRACT.md](UX-CONTRACT.md) dokumentiert die bestehenden Verhaltensverantwortungen.

Tokenpfad: `app.css` besitzt Palette, semantische Farben, `--radius`, `--page-max` und Schriftfamilien; App-Rahmen, Seiten und gemeinsame Komponenten konsumieren diese Variablen direkt. DESIGN.md spiegelt die Werte, es gibt keine generierten Theme-Adapter.

`DataList.svelte` ist die gemeinsame Listenkomponente für Aufgabenübersicht, Teilnehmer einer Aufgabe, Teamliste, Auswahlverlauf, Änderungsprotokoll und Stats-Auswertungen. Sie besitzt Spaltenraster, Zeilenabstände, Trennlinien, Schriftstufen und mobile Feldbeschriftungen. Alle Ansichten liefern nur Daten, Spalteninhalte und Aktionen. Aufgabenzeilen sind native Links, Teilnehmer- und Teamzeilen enthalten einzelne Buttons. Mobil werden alle Listen ohne horizontales Scrollen untereinander angeordnet; die Informationen und Aktionen bleiben vollständig erreichbar.

Der Chooser ist die einzige stark inszenierte Ansicht: benannte Raumschiffe fliegen vor Space Indigo und Parallaxsternen durch ein Asteroidenfeld, weichen Hindernissen aus und springen durch einen Hyperraumtunnel in den finalen Anflug. Pastel Petal und die übrigen Palette-Tokens markieren HUD, Kandidaten und Gewinner. Die Schiffe fliegen sicher; keine Kollision entscheidet über die bereits gespeicherte Auswahl. Sichtbarer Hinweis und Ergebnistext erklären den Präsentationscharakter der Szene.

Die Show dauert zwölf Sekunden: Countdown 2,4 Sekunden, Flottenstart 1,6 Sekunden, Asteroidenfeld 3,2 Sekunden, Hyperraumsprung 2,5 Sekunden und Anflug 2,3 Sekunden. Schnellmodus etwa eine Sekunde; ein einzelner Kandidat erhält etwa 2,4 Sekunden kurzen Start und Anflug. Reduzierte Bewegung zeigt das Ergebnis unmittelbar. Überspringen, optionaler Sound und Vollbild bleiben direkt bedienbar. Namen, Kandidatenmanifest und Gewinner bleiben als DOM-Text zugänglich, während Canvas die Szene zeichnet. Außerhalb der Show rotieren Verwaltungsflächen nicht dauerhaft.

„Person entfernen“ ist eine globale Verwaltungsaktion auf der Teamseite. Sie nutzt den bestehenden ruhigen Bestätigungsdialog mit klarer Benennung der Person und aller Auswirkungen. Die Wirkung darf nicht allein durch eine Farbe oder ein Symbol vermittelt werden. Das Ergebnis ist ein aktualisiertes Team und eine sachliche Statusmeldung; die Space-Show wird dafür nicht verwendet.

Copy ist knapp und sachlich: „Neue Aufgabe“, „Stand korrigieren“, „Ausgewählt“. Leere Zustände erklären die nächste Aktion. Keine allgemeinen Team-Werbesprüche. Quellen technischer Idempotenz und Revisionen bleiben außerhalb der normalen Produktdarstellung.

Die gemeinsame Liste verwendet kompakte Zeilen: 60px Mindesthöhe, 10px vertikales Padding je Seite und 8px bei Spaltenüberschriften. Beschreibungen und Zusatzhinweise folgen mit 4px Abstand. Mobil gelten 12px vertikales Padding und 8px Abstand zwischen Feldern. Schriftgrößen, Zeilenhöhe des Textes und Aktionsflächen bleiben erhalten; lange Inhalte dürfen die Zeilenhöhe weiterhin vergrößern.

Verlauf und Protokoll sind auf der Aufgabenseite gemeinsam standardmäßig eingeklappt; die aktuelle Auswahl und Teilnehmer bleiben sichtbar. Die Stats-Seite übernimmt dieselbe kompakte Listenkomponente, Typografie und semantischen Farbtokens. Eine kleine Textzusammenfassung, Ansichten nach Personen/Aufgaben und filterbare Details ersetzen zusätzliche Dashboard-Karten oder Diagrammdekoration. Native Selects und die aktiven Ansichtsbuttons folgen den vorhandenen Mustern. Die Hauptnavigation enthält Aufgaben, Team und Stats; der Theme-Schalter bleibt rechts erreichbar.

## Do's and Don'ts

Abwesenheiten, Wiederholung, Duplizieren und manuelle Übernahme erweitern die vorhandenen ruhigen Dialoge. Fälligkeiten erscheinen als kurze Datumszeile, fällige Termine in der gemeinsamen Akzenttextfarbe; es entstehen keine zusätzlichen Kacheln. Abwesenheitszeiträume nutzen ebenfalls `DataList.svelte`, native Datumsfelder und gemeinsame Feld-/Buttonstile. Die manuelle Übernahme ist eine sekundäre Aktion unter der normalen Auswahl; ihre kurze Space-Präsentation nutzt den bestehenden Chooser. Palette, Schrift, Listendichte und Formulargeometrie bleiben unverändert.

Der Zeitraumfilter der Stats-Seite steht neben der Überschrift und rückt mobil darunter. Er verwendet das gemeinsame Feldstyling und ein natives Select. Eine kleine Von-/Bis-Zeile macht die Bedeutung des Zeitraums sichtbar. Alle Ansichten behalten dieselbe Listendichte und Farbsemantik.

Bei „Benutzerdefiniert“ erscheinen darunter zwei native Datumsfelder und „Anwenden“. Die Felder folgen dem vorhandenen Feldstil, stehen am Desktop nebeneinander und umbrechen mobil. Inline-Fehler verwenden die semantische Fehlerfarbe. Eine beschriftete Grenze trennt die tatsächlich angezeigte Auswertung von noch nicht angewendeten Eingaben; es entstehen keine zusätzlichen Dashboard-Karten.

- Nutze die fünf Palette-Tokens und deren zentrale semantische Ableitungen.
- Halte Tabellen und Formulare ruhig; konzentriere die visuelle Spannung auf den Chooser.
- Nutze echte Werte und Zustände als Struktur, keine erfundenen Kennzahlen.
- Keine Sticker, Asterisk-Dekoration, Regenbogen-Avatare oder Konfetti nach Routineaktionen.
- Inszeniere die ausdrücklich gewünschte Raumschiff-/Asteroidenszene im Chooser; halte Verwaltungsaktionen und Formdialoge ruhig.
- Halte den Introtext der Teamseite linksbündig und Entfernen-Bestätigungen eindeutig.
- Keine Änderungen an Auswahlregeln, Datenpfaden, lokalen Vorlieben oder Docker-Volumes wegen eines neuen Namens.
