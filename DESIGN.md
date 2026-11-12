---
version: alpha
name: Rotator
description: Teamaufgaben verwalten und die nächste Person bestimmen; ruhige Arbeitsflächen in einem orbitalen Rahmen.
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
  DEFAULT: '8px'
spacing:
  page-max: '1340px'
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

Ein kleines internes Werkzeug für wiederkehrende Teamaufgaben. Die aktuelle Nutzerentscheidung vom 11.11.2026 verwendet die fünf vorgegebenen Farben, Fira Code und den Produktnamen Rotator. Die Verwaltungsansichten bleiben ruhig; der ausdrücklich gewünschte spektakuläre Raumschiff-Chooser ist die gezielte Ausnahme und erhält eine vollständige Space-Show.

Referenz ist ein orbitales Auswahlfeld: dunkler Indigo-Rahmen, helle lesbare Arbeitsflächen und eine klare Marke. Die starke Inszenierung konzentriert sich auf Kandidaten-Raumschiffe, Asteroidenfeld und Hyperraumsprung im Chooser. Die aktuelle Palette ersetzt die vorangegangene Gold-/Pine-Palette; der Name bleibt Rotator.

Geschäftliche Grundlage: [PLAN.md](PLAN.md), API-Typen in `src/shared/contracts.ts` und Fachlogik in `src/service.ts`. Sprache Deutsch, Zeitzone aus der Anwendungskonfiguration. Keine Japan-Markt- oder Mehrsprachenanforderung.

## Colors

Die fünf benannten Farbwerte im Frontmatter sind die exakte Nutzerpalette; `primary` ist der semantische Alias für Lavender Purple. **`frontend/src/app.css` besitzt die Runtime-Tokens**; dieses Dokument spiegelt die Werte und erläutert ihre Rollen. Komponenten verwenden semantische Variablen statt eigener Farbsammlungen. Abgeleitete Flächen, Linien und Hoverfarben entstehen dort mit `color-mix()`.

| Palette         | Runtime                   | Verwendung                                          |
| --------------- | ------------------------- | --------------------------------------------------- |
| Space Indigo    | `--indigo`, `--ink`       | Rahmen, dunkler Text und Chooser                    |
| Pastel Petal    | `--petal`                 | Orbitmarke, Auswahlrahmen und Namensenthüllung      |
| Lilac           | `--lilac`                 | Dezente Linien und sekundäre Akzente                |
| Lavender Purple | `--lavender`, `--primary` | Primäraktionen und aktive Zustände                  |
| Charcoal Blue   | `--charcoal`              | Aktuelle Auswahl, sekundäre dunkle Flächen und Text |

Helle Arbeitsflächen mischen Pastel Petal mit Weiß. Lavender-Aktionen tragen sehr hellen Text. Pastel Petal auf Indigo markiert die Auswahl; ein pastellfarbener Button trägt Indigo-Text. Fehler nutzen eine dunkle Indigo-/Petal-Ableitung und bleiben durch ihren Text erkennbar. Ein globaler Scrollbarstil mit Systemfarben im Forced-Colors-Modus gehört zur gemeinsamen CSS-Datei.

## Typography

Fira Code für Marke, Titel, Fließtext und Zahlen. Unveränderte TTF-Dateien in Regular, Medium und Bold liegen unter `frontend/src/assets/fonts/` und werden mit der Anwendung ausgeliefert. Die Lizenz liegt unter `frontend/public/assets/fonts/FiraCode-LICENSE.txt`. Keine externen Font-Anfragen. Regular wird vorgeladen; `font-display: swap` hält Text während des Ladens sichtbar. 16px Basis und 1,6 Zeilenhöhe. Ligaturen bleiben für Namen und UI-Texte deaktiviert. Deutschsprachige Namen und lange Aufgaben umbrechen statt abgeschnitten zu werden.

## Layout

Maximale Seitenbreite 1340px. Dokument-Scrolling bleibt erhalten. Tabellen besitzen ausschließlich bei schmalen Displays horizontales Overflow; sie verändern nicht die Höhe oder Scrollverantwortung der Formdialoge. Desktop-Detailseite mit Arbeitsbereich und kleiner Regel-/Zusammenfassungsspalte; diese Zusatzspalte entfällt auf schmalen Displays.

Der Introtext der Teamseite ist linksbündig und an Listen beziehungsweise Toolbar ausgerichtet. Die Ausrichtung bleibt auch auf schmalen Displays links; zusätzliche Aktionen ändern diese Textausrichtung nicht.

## Elevation & Depth

Flache Arbeitsflächen mit dünnen Linien. Verwaltungsseiten verwenden keine schwebenden Marketingkarten, Sticker, dekorativen Schatten oder Glows. Ein deutlicher Schatten kennzeichnet dort modale Ebenen. Die Space-Show darf bewusst räumliche Tiefe, dichte Parallaxsterne, Leuchtspuren und den Sprungtunnel einsetzen; diese Effekte bleiben auf die Auswahlpräsentation begrenzt und verwenden die gemeinsame Palette.

## Shapes

8px als gemeinsame Ecke für Flächen und Aktionen. Kreisbahnen und runde Initialen haben eine erkennbare Funktion und sind die Ausnahme. Keine Asterisk-Sterne als universelles Dekorelement.

## Components

Buttons, Felder, Hinweise und Scrollbars konsumieren die Tokens aus `app.css`. Darstellung und Verhalten der geteilten Formdialoge, Mitgliederliste, Historie und Avatar-Komponente bleiben über Aufgaben und Team konsistent. [UX-CONTRACT.md](UX-CONTRACT.md) dokumentiert die bestehenden Verhaltensverantwortungen.

Der Chooser ist die einzige stark inszenierte Ansicht: benannte Raumschiffe fliegen vor Space Indigo und Parallaxsternen durch ein Asteroidenfeld, weichen Hindernissen aus und springen durch einen Hyperraumtunnel in den finalen Anflug. Pastel Petal und die übrigen Palette-Tokens markieren HUD, Kandidaten und Gewinner. Die Schiffe fliegen sicher; keine Kollision entscheidet über die bereits gespeicherte Auswahl. Sichtbarer Hinweis und Ergebnistext erklären den Präsentationscharakter der Szene.

Die Show dauert zwölf Sekunden: Countdown 2,4 Sekunden, Flottenstart 1,6 Sekunden, Asteroidenfeld 3,2 Sekunden, Hyperraumsprung 2,5 Sekunden und Anflug 2,3 Sekunden. Schnellmodus etwa eine Sekunde; ein einzelner Kandidat erhält etwa 2,4 Sekunden kurzen Start und Anflug. Reduzierte Bewegung zeigt das Ergebnis unmittelbar. Überspringen, optionaler Sound und Vollbild bleiben direkt bedienbar. Namen, Kandidatenmanifest und Gewinner bleiben als DOM-Text zugänglich, während Canvas die Szene zeichnet. Außerhalb der Show rotieren Verwaltungsflächen nicht dauerhaft.

„Person entfernen“ ist eine globale Verwaltungsaktion auf der Teamseite. Sie nutzt den bestehenden ruhigen Bestätigungsdialog mit klarer Benennung der Person und aller Auswirkungen. Die Wirkung darf nicht allein durch eine Farbe oder ein Symbol vermittelt werden. Das Ergebnis ist ein aktualisiertes Team und eine sachliche Statusmeldung; die Space-Show wird dafür nicht verwendet.

Copy ist knapp und sachlich: „Neue Aufgabe“, „Stand korrigieren“, „Ausgewählt“. Leere Zustände erklären die nächste Aktion. Keine allgemeinen Team-Werbesprüche. Quellen technischer Idempotenz und Revisionen bleiben außerhalb der normalen Produktdarstellung.

## Do's and Don'ts

- Nutze die fünf Palette-Tokens und deren zentrale semantische Ableitungen.
- Halte Tabellen und Formulare ruhig; konzentriere die visuelle Spannung auf den Chooser.
- Nutze echte Werte und Zustände als Struktur, keine erfundenen Kennzahlen.
- Keine Sticker, Asterisk-Dekoration, Regenbogen-Avatare oder Konfetti nach Routineaktionen.
- Inszeniere die ausdrücklich gewünschte Raumschiff-/Asteroidenszene im Chooser; halte Verwaltungsaktionen und Formdialoge ruhig.
- Halte den Introtext der Teamseite linksbündig und Entfernen-Bestätigungen eindeutig.
- Keine Änderungen an Auswahlregeln, Datenpfaden, lokalen Vorlieben oder Docker-Volumes wegen eines neuen Namens.
