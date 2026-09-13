# ChefMind

Private Rezeptverwaltung für den Eigengebrauch: Rezepte standardisiert erfassen,
Portionen zuverlässig umrechnen, daraus einen Wochenplan und eine Einkaufsliste
erzeugen — und das Ganze zusätzlich über einen **MCP-Server** für einen
KI-Assistenten zugänglich machen.

Kein Login, keine Benutzerverwaltung, keine Cloud. Eine SQLite-Datei, ein
Container, ein Volume.

## Was es kann

- **Rezepte verwalten** — anlegen, bearbeiten, löschen, durchsuchen (auch nach Zutaten)
- **Portionen umrechnen**, ohne dass das Ergebnis unbrauchbar wird (siehe unten)
- **Importieren** aus einer URL, von einem Foto oder aus kopiertem Text
- **Wochenplan** mit Frühstück/Mittag/Abend/Snack
- **Einkaufsliste**, die gleiche Zutaten über alle Rezepte hinweg zusammenfasst
  und nach Warengruppen sortiert
- **Kochmodus** — ein Schritt pro Bildschirm, Wisch-Navigation, hörbarer Timer,
  Display bleibt an
- **Nährwerte je Portion**, KI-geschätzt und von Hand korrigierbar
- **Fotos** je Rezept: hochladen, Titelbild wählen, löschen
- **Installierbar** (PWA) und offline lesbar — was du schon geöffnet hast,
  bleibt erreichbar, wenn das Küchen-WLAN aussetzt
- **Hell und dunkel**, nach Systemeinstellung; Drucklayout für Rezept und
  Einkaufsliste
- **MCP-Server** unter `/mcp` mit 17 Tools

## Der eigentliche Kern: Mengen umrechnen, die man auch abmessen kann

Jede Zutatenmenge wird in vier getrennten Ebenen gespeichert:

| Ebene | Beispiel | Wofür |
|---|---|---|
| Wie eingegeben | „2 EL" | Anzeige — „1 Tasse Mehl" bleibt eine Tasse |
| Kanonisch | 30 ml | Rechnen, Vergleichen, Zusammenfassen |
| Skalierverhalten | `sublinear` | Wie sich die Menge bei anderen Portionen verhält |
| Rundung | `nice` | Wie das Ergebnis am Ende dasteht |

Der Unterschied zeigt sich beim Verdoppeln. Ein naiver Portionsrechner macht aus
einem Rezept für 4 bei 10 Portionen das hier:

```
2,5 mal Öl zum Braten        5–7 1/2 Zehen Knoblauch        1 3/8 EL Majoran
```

ChefMind macht daraus das:

```
Öl zum Braten (nicht skaliert)    5–8 Zehen Knoblauch       4 TL Majoran
```

Dahinter stehen vier Regeln:

- **`fixed`** — „Öl zum Braten", Salzwasser, Mehl zum Ausrollen. Skaliert nie.
- **`sublinear`** — Gewürze mit Exponent 0,8, Triebmittel mit 0,7. Die vierfache
  Menge Teig will nicht die vierfache Hefe.
- **`stepped`** — Dosen und Packungen. Man kauft keine 1,4 Dosen.
- **`linear`** — alles andere, der Normalfall.

Dazu kommt Küchenlogik statt Mathematik: Stückeinheiten (Zehe, Scheibe, Stange)
bleiben ganzzahlig, Löffelmengen runden auf Viertel, Gewichte auf Werte, die eine
Küchenwaage anzeigen kann. **Gerundet wird sichtbar** — neben „5 Eier" steht ein
Hinweis, dass rechnerisch 4,5 herauskämen. Aus 4,5 Eiern still 5 zu machen
verändert einen Kuchen, und das gehört nicht verschwiegen.

Zeiten und Temperaturen skalieren **nie** mit. Ein doppelter Braten braucht
länger, aber nicht um einen Faktor, den man ausrechnen kann.

Für Backrezepte gibt es den Schalter **exakte Mengen**: dann bleibt 106,7 g Mehl
stehen statt auf 105 g gerundet zu werden, weil beim Teig die Hydration zählt.

Skalierregeln werden pro Zutat **kopiert, nicht verknüpft**. Wird die Heuristik
später verbessert, ändern sich bestehende Rezepte nicht von selbst.

## Schnellstart

```bash
make up
```

Das installiert die Abhängigkeiten, legt `.env` an, wendet die Migrationen an,
spielt zwei Beispielrezepte ein und startet den Entwicklungsserver auf
http://localhost:3000. Jeder Schritt ist idempotent — `make up` lässt sich
gefahrlos wiederholen und überschreibt weder `.env` noch vorhandene Rezepte.

`make` allein zeigt alle Befehle. Ohne `make` geht es genauso von Hand:

```bash
npm install
cp .env.example .env      # für den reinen URL-Import reicht die Datei unverändert
npm run db:migrate
npm run db:seed           # zwei Beispielrezepte, optional
npm run dev               # http://localhost:3000
```

## Konfiguration

Alles über `.env`, Vorlage in `.env.example`.

| Variable | Bedeutung |
|---|---|
| `CHEFMIND_DB_PATH` | Pfad zur SQLite-Datei |
| `CHEFMIND_UPLOAD_DIR` | Ablage der Fotos |
| `CHEFMIND_AI_PROVIDER` | `anthropic`, `openrouter` oder `none` |
| `ANTHROPIC_API_KEY` | Key für Anthropic |
| `OPENROUTER_API_KEY` | Key für OpenRouter |
| `CHEFMIND_AI_MODEL` | Modell — bei Anthropic optional (Standard `claude-opus-5`), bei OpenRouter Pflicht |
| `CHEFMIND_ALLOWED_HOSTS` | Hostnamen **ohne Port**, unter denen die App erreichbar ist |
| `CHEFMIND_ALLOWED_ORIGINS` | Erlaubte Origins für `/mcp` |
| `CHEFMIND_MCP_READONLY` | `1` = nur lesende MCP-Tools |
| `CHEFMIND_MCP_TOKEN` | Optionales Bearer-Token für `/mcp`, leer = kein Auth |

**Ohne KI-Key** funktioniert alles außer dem Foto- und Textimport. Der URL-Import
läuft trotzdem: er liest die `schema.org/Recipe`-Daten, die fast jede Rezeptseite
für Google einbettet — exakt, kostenlos und zuverlässiger als jede Bilderkennung.

Die KI wird nur beim Import eingesetzt, nie beim Kochen oder Rechnen. Ein Foto-
Import kostet je nach Modell etwa 1–3 Cent.

## Rezepte importieren

| Weg | Wie es funktioniert |
|---|---|
| **URL** | `schema.org/Recipe` aus der Seite; nur wenn die fehlt, springt die KI ein |
| **Rezeptfoto** | Kochbuchseite, Rezeptkarte oder Handschrift; mehrere Bilder eines Rezepts werden zusammengesetzt |
| **Foto vom Gericht** | Die KI erkennt das Gericht und **erfindet** ein passendes Rezept |
| **Text** | Kopierter Rezepttext |

Ein aus einem Gerichtsfoto rekonstruiertes Rezept wird als `sourceType: 'ai'`
gespeichert und überall sichtbar gekennzeichnet — in der Liste, auf der
Detailseite und in der MCP-Ausgabe. Eine Rekonstruktion darf sich nicht als
abgeschriebenes Rezept ausgeben.

Jeder Import landet als normales Rezept in der Datenbank und lässt sich sofort
im Editor korrigieren. Unsichere Stellen werden als Hinweis ausgegeben statt
geraten.

## MCP-Server

Erreichbar unter `/mcp`, gleicher Port wie die Weboberfläche.

### Claude Code

```bash
claude mcp add --transport http chefmind http://<server>:3000/mcp
```

### Claude Desktop

Claude Desktop gibt es nur für macOS und Windows, läuft also auf einem anderen
Gerät als der Server. Zwei Wege:

**Als Custom Connector** — Einstellungen › Connectors › „Add custom connector",
dann die URL `http://<server>:3000/mcp` eintragen. Der einfachere Weg, sofern
Claude Desktop die Klartext-HTTP-Adresse akzeptiert (die Oberfläche erwartet
üblicherweise `https://`).

**Über `mcp-remote`** — funktioniert sicher, auch ohne TLS. In
`claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`,
Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "chefmind": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "http://192.168.1.250:3000/mcp",
        "--allow-http",
        "--transport", "http-only"
      ]
    }
  }
}
```

Danach Claude Desktop vollständig beenden und neu starten.

`make mcp-desktop` gibt diesen Block mit der echten LAN-Adresse dieses Rechners
aus. Ist `CHEFMIND_MCP_TOKEN` gesetzt, kommt
`"--header", "Authorization: Bearer <token>"` dazu.

Damit ein anderes Gerät überhaupt herankommt, sind zwei Dinge nötig — beides
schlägt sonst mit einer wenig aussagekräftigen Meldung fehl:

1. In `docker-compose.yml` das Port-Binding von `127.0.0.1:3000:3000` auf die
   LAN-Adresse ändern, z. B. `192.168.1.250:3000:3000`.
2. Dieselbe Adresse in `CHEFMIND_ALLOWED_HOSTS` und `CHEFMIND_ALLOWED_ORIGINS`
   eintragen — **ohne Port**. Sonst antwortet der Endpunkt mit
   `Invalid Host`, weil der DNS-Rebinding-Schutz greift.

17 Tools: `list_recipes`, `get_recipe`, `scale_recipe`, `suggest_recipes`,
`create_recipe`, `update_recipe`, `delete_recipe`, `import_recipe_from_url`,
`import_recipe_text`, `import_recipe_from_photo`, `get_meal_plan`,
`set_meal_plan_entry`, `delete_meal_plan_entry`, `build_shopping_list`,
`get_shopping_list`, `add_shopping_item`, `check_shopping_item`.

`get_recipe` nimmt optional `servings` und liefert die Mengen **fertig
umgerechnet und formatiert**. Sprachmodelle rechnen Einheiten schlecht und
formatieren „1,3333 Tassen" noch schlechter — „1 1/3 Tassen" fertig zu liefern
entfernt diese Fehlerquelle vollständig.

Damit lässt sich zum Beispiel sagen: *„Plane mir eine vegetarische Woche aus
meinen Rezepten und mach die Einkaufsliste für 3 Personen."*

### Sicherheit

Der Endpunkt hat **kein Auth** — so gewollt, für ein privates Netz. Zwei Dinge
sind trotzdem eingebaut:

- **Host- und Origin-Prüfung** gegen DNS-Rebinding. Ohne sie könnte eine
  beliebige Webseite, die du besuchst, ihren eigenen Namen auf deinen Server
  auflösen und `delete_recipe` aufrufen. Deshalb muss `CHEFMIND_ALLOWED_HOSTS`
  den Hostnamen enthalten, unter dem du die App aufrufst.
- **`CHEFMIND_MCP_READONLY=1`** registriert nur lesende Tools.

Sollte die App je aus dem Internet erreichbar sein, setze zusätzlich
`CHEFMIND_MCP_TOKEN` — ein gemeinsames Geheimnis, kein Benutzerkonto.

## Deployment

Gebaut und gestartet wird direkt auf dem Server über einen **self-hosted
GitHub-Runner**. Kein Registry-Push, kein eingehendes SSH von GitHub.

Einmalig auf dem Server:

1. Runner installieren, mit den Labels `chefmind` und `prod`:
   `https://github.com/ConstantinTi/ChefMind/settings/actions/runners`
2. Docker samt Compose v2 installieren und den Dienst starten
3. Runner-Benutzer in die `docker`-Gruppe: `sudo usermod -aG docker <user>`

   Danach den **Runner-Dienst neu starten**
   (`sudo ./svc.sh stop && sudo ./svc.sh start` im Runner-Verzeichnis). Eine neue
   Gruppenmitgliedschaft greift erst in einer neuen Sitzung — ein bereits
   laufender Dienst sieht sie nicht und scheitert weiter mit
   „permission denied" oder „command not found".
4. `~/chefmind.env` anlegen (Vorlage `.env.example`) — im Home des
   **Runner-Benutzers**, nicht im eigenen. Secrets bleiben so außerhalb des Repos
   und überleben jeden Checkout.

Der Workflow prüft diese Punkte vorab und sagt genau, welcher fehlt.

Danach baut und deployt jeder Push auf `main` automatisch
(`.github/workflows/deploy.yml`): `docker compose build`, `up -d`, Warten auf
`healthy`, alte Images aufräumen. Schlägt der Healthcheck fehl, bricht der
Workflow mit den Logs ab.

Von Hand:

```bash
docker compose up -d --build
```

Der Port ist absichtlich auf `127.0.0.1` gebunden. Für den Zugriff aus dem LAN in
`docker-compose.yml` auf die LAN-Adresse ändern und den Hostnamen in
`CHEFMIND_ALLOWED_HOSTS` ergänzen. **Nicht ins offene Internet stellen** — es gibt
kein Login.

### Datensicherung

Alles liegt in `./data`: die SQLite-Datei und die Fotos. Ein Backup-Container legt
nächtlich einen Snapshot nach `data/backups/` und behält 14 Stück. Ein manuelles
Backup:

```bash
docker compose exec chefmind sqlite3 /data/chefmind.db ".backup '/data/backups/manuell.db'"
```

`sqlite3 .backup` ist auch im laufenden Betrieb sicher — die Datei einfach zu
kopieren, während WAL gerade schreibt, ist es nicht.

## Entwicklung

`make` zeigt die vollständige Liste. Die wichtigsten:

| Befehl | Wirkung |
|---|---|
| `make up` | Erststart: einrichten, Beispieldaten, Server |
| `make dev` | Entwicklungsserver (`PORT=4000` für einen anderen Port) |
| `make stop` | Laufenden Server beenden |
| `make check` | typecheck + lint + test — dasselbe wie die CI |
| `make watch` | Tests im Watch-Modus |
| `make mcp` | Prüft, ob `/mcp` antwortet, und listet die Tools |
| `make reset` | Datenbank neu aufbauen (fragt nach, sichert vorher) |
| `make backup` | Snapshot nach `data/backups/` |
| `make docker-up` | Lokal im Container starten, wie auf dem Server |
| `make sql` | SQLite-Shell auf der Datenbank |
| `npm run icons` | App-Icons aus `public/icon.svg` neu rendern |

Ohne `make` stehen dieselben Dinge als npm-Skripte bereit (`npm run dev`,
`npm test`, `npm run typecheck`, `npm run lint`, `npm run db:generate`,
`npm run db:studio`).

### Aufbau

```
src/domain/     rein & isomorph: Einheiten, Skalierung, Aggregation. Keine I/O.
src/contracts/  Zod-Schemas — geteilt zwischen Formular, REST und MCP
src/services/   der einzige Ort mit Datenbankzugriff
src/mcp/        MCP-Tools, dünne Hüllen um services/
src/app/        Routen, Server Actions, UI
src/components/ UI-Bausteine; forms.tsx kapselt jeden Server-Action-Absender
src/lib/forms   Adapter zwischen HTML-Formularen und den Contracts
```

Zwei Grenzen sind per ESLint erzwungen: `src/domain/**` darf keine I/O
importieren (der Portionsrechner läuft im Browser), und `src/services/**` sowie
`src/mcp/**` dürfen `next/*` nicht importieren (der MCP-Server bliebe damit auch
als eigener Prozess lauffähig).

Das gesamte Korrektheitsrisiko steckt in `src/domain/` — Brüche, Rundung,
Einheitenwechsel, Zusammenfassen. Deshalb ist genau diese Schicht vollständig
getestet und braucht dafür keine Datenbank.

## Lizenz

GPL-3.0-or-later, siehe [LICENSE](LICENSE).
