<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ChefMind — Projektkonventionen

Private Rezeptverwaltung: Next.js 16 (App Router) + SQLite/Drizzle, deutschsprachige
Oberfläche, dazu ein MCP-Server unter `/mcp` im selben Prozess.

## Schichten — die eine Regel, die alles zusammenhält

```
src/domain/     rein & isomorph — keine I/O, kein Framework, keine DB
src/contracts/  Zod-Schemas: UI-Formulare, REST und MCP validieren gegen dieselben Objekte
src/services/   der EINZIGE Ort mit Datenbankzugriff; importiert niemals next/*
src/mcp/        MCP-Tools — dünne Hüllen um services/
src/app/        Routen, Server Actions, UI — dünne Hüllen um services/
src/components/ UI-Bausteine; `forms.tsx` kapselt jeden Server-Action-Absender
src/lib/forms   der Adapter zwischen HTML-Formularen und den Contracts
src/lib/network Wer überhaupt antworten darf — Adressen und Host-Namen
src/proxy.ts    läuft vor jeder Route und wendet genau das an
```

Zwei Grenzen sind in `eslint.config.mjs` als `no-restricted-imports` erzwungen:

- `src/domain/**` darf nichts importieren, was I/O macht. Der Grund ist konkret:
  der Portionsrechner läuft im Browser, damit der Regler ohne Server-Roundtrip
  reagiert — derselbe Code läuft serverseitig in den MCP-Tools.
- `src/services/**` und `src/mcp/**` dürfen `next/*` nicht importieren. Cache-
  Invalidierung gehört in die Server Action, nicht in den Service. Dadurch bliebe
  der MCP-Server auch als eigener Prozess lauffähig.

## Mengen: vier Ebenen, bewusst getrennt

1. Wie eingegeben (`Quantity`-Union) — das ist die Anzeigewahrheit
2. Kanonisch in g/ml/Stück — die Rechenwahrheit, **beim Schreiben** abgeleitet
3. `ScalingPolicy` — linear, fixed, sublinear, stepped
4. `RoundingRule` — wie es am Ende dasteht

Beim Umrechnen wird **immer von der gespeicherten Basis** gerechnet, nie vom
zuletzt angezeigten Wert. 4 → 6 → 3 → 4 Portionen landet exakt wieder am Original.

Skalierungsregeln werden pro Zutat **kopiert, nicht verknüpft**: Ändert sich später
die Heuristik, ändern sich bestehende Rezepte nicht. Das ist Absicht.

## Formulare sind der unbequemste Aufrufer

Dieselben Zod-Schemas bedienen HTML-Formulare, REST und MCP. Nur Formulare können
ausschließlich Strings senden — und eine nicht angehakte Checkbox sendet **gar
nichts**. Beides wird in `src/lib/forms.ts` geglättet, nicht im Schema:

- `fromForm()` — FormData → Objekt; leere Strings fallen raus, damit `.nullish()`
  „nicht angegeben" sieht und nicht `""`.
- `fromFormWithBooleans()` — wandelt benannte Felder in echte Booleans.
  Bewusst **nicht** als Union im Contract: die landet sonst im JSON Schema der
  MCP-Tools, und ein Sprachmodell bekäme `boolean | "true" | "false" | …` zu
  sehen, wo die ehrliche Antwort „das ist ein Boolean" lautet.

Ein Server Action, der direkt als `<form action={…}>` hängt, bekommt FormData.
Einer aus `.bind()` bekommt sein gebundenes Argument zuerst. Diese Asymmetrie hat
schon zweimal für „expected string, received undefined" gesorgt.

## Zugriff: zwei Prüfungen, zwei verschiedene Angriffe

Es gibt kein Login. Stattdessen prüft `src/proxy.ts` bei jeder Anfrage zweierlei,
und die beiden sind **nicht** austauschbar:

- **Adresse** (`isPrivateAddress`) — woher die Anfrage kam. Fängt einen
  versehentlich offenen Port ab. Alle privaten Bereiche sind fest erlaubt,
  inklusive Tailscale (100.64.0.0/10 und fc00::/7), damit nichts pro Deployment
  eingetragen werden muss.
- **Host-Name** (`isAllowedHost`) — unter welchem Namen sie hereinkam. Das ist
  der Schutz gegen DNS-Rebinding, bei dem eine Seite, die du besuchst, ihre
  eigene Domain auf deine private IP umbiegt und dann aus deinem Browser heraus
  die MCP-Tools bedient. Diese Anfrage kommt **von deinem eigenen Rechner** —
  die Adressprüfung sieht sie also nicht, nur der Host-Header verrät sie.

Wer eine davon streicht, streicht einen ganzen Angriff mit. Erlaubt sind ohne
Konfiguration alle Namen, die niemand öffentlich registrieren kann: private
IP-Literale, Hostnamen ohne Punkt, `.local`, `.lan`, `.internal`, `.home.arpa`
und `.ts.net`. Eine echte Domain braucht `CHEFMIND_ALLOWED_HOSTS`.

**Wie belastbar die Adressprüfung ist, hängt davor ab.** Sie liest
`x-forwarded-for`. Im ausgelieferten Aufbau lauscht die App nur auf Loopback und
alles kommt über Caddy oder `tailscale serve` — beide überschreiben den Header
mit der echten Gegenstelle, er ist dann nicht fälschbar. Wer stattdessen den
App-Port direkt veröffentlicht, verliert das: Next füllt den Header nur, wenn
der Client keinen mitschickt, einem selbst gesetzten glaubt es. Dann ist die
Prüfung nur noch eine Leitplanke gegen Scanner und Fehlkonfiguration.

## HTTPS und Portionen

TLS wird **nicht** in Next terminiert — `next start` kann das in Produktion
nicht. Davor steht entweder `tailscale serve` (echtes Let's-Encrypt-Zertifikat
für den `.ts.net`-Namen, erneuert sich selbst) oder der `caddy`-Dienst aus der
Compose-Datei mit einem selbst signierten Zertifikat aus
`scripts/generate-cert.sh`. Für eine private IP kann es gar nichts anderes
geben: keine öffentliche CA kann sie validieren.

Gebraucht wird HTTPS nicht aus Prinzip, sondern weil Claude Desktop MCP-Server
nur darüber anspricht und Service Worker außerhalb von `localhost` einen
sicheren Kontext verlangen.

Rezepte öffnen sich mit `CHEFMIND_DEFAULT_SERVINGS` (Standard 4) statt mit ihrer
eigenen Portionszahl — aber nur, wenn sie überhaupt in Portionen rechnen.
`initialServings()` lässt alles andere in Ruhe: ein Hefezopf mit 12 Scheiben und
„1 Zopf, ca. 35 cm" ist nichts, wovon man vier backt. Die gespeicherte Basis
bleibt unangetastet, im Regler steht sie weiterhin als „Original" daneben.

## Was leicht kaputtgeht

- Rundung ist Küchenlogik, keine Mathematik. Tests in `src/domain/scaling/` halten
  fest, dass „5–8 Zehen" richtig ist und „5–7 1/2 Zehen" falsch.
- Rundung wird **gemeldet, nicht versteckt** (`didRound`): aus 4,5 Eiern still 5 zu
  machen verändert den Kuchen.
- Zeiten und Temperaturen skalieren nie mit.
- `better-sqlite3` braucht `serverExternalPackages` in `next.config.ts`.
- **Das Datenverzeichnis darf auf dem Server nicht im Checkout liegen.**
  `actions/checkout` führt `git clean -ffdx` aus, und `-x` löscht auch
  ignorierte Dateien — `./data` ist ignoriert. Jeder Deploy würde Datenbank,
  Fotos, Backups und die TLS-CA mitnehmen. Dafür gibt es `CHEFMIND_DATA_DIR`.
- **Die Palette gehört nicht in `@theme`.** Tailwind v4 zieht jeden `@theme`-Block
  in ein gemeinsames `:root` und wirft die umgebende Media Query weg — ein zweiter
  `@theme` in `prefers-color-scheme: dark` überschreibt damit die hellen Werte für
  alle, dauerhaft. Die Farben stehen deshalb als normale Custom Properties in
  `:root`; `@theme inline` bildet nur die Namen auf Tailwind-Utilities ab.
- **Kein `loading.tsx` im App-Root.** Es legt eine Suspense-Boundary um jede Seite,
  Next streamt daraufhin die Antwort — und eine gestreamte Antwort hat ihre 200
  längst gesendet, wenn `notFound()` läuft. Jedes fehlende Rezept antwortete so mit
  200 statt 404. Loading-Skelette nur in Routen, die nie `notFound()` aufrufen.
- Der Editor schickt **jedes** Zutatenfeld zurück, auch die, die er nicht anzeigt
  (`scaling`, `category`, `rounding`, `note`). Lässt man sie weg, leitet der Service
  sie neu her und verwirft still jede Übersteuerung — einen Tippfehler zu
  korrigieren würde dann ändern, wie das Rezept skaliert.
- In Next 16 heißt die Datei `proxy.ts`, nicht `middleware.ts` — letztere ist
  deprecated. Sie muss neben `app/` liegen, in diesem Projekt also unter `src/`,
  sonst wird sie stillschweigend ignoriert. Im Build-Output taucht sie als
  „ƒ Proxy (Middleware)" auf; fehlt die Zeile, greift der Zugriffsschutz nicht.
- Der Kochmodus-Link muss die aktuell gewählte Portionszahl mitgeben. Er lebt
  deshalb im `ServingsScaler` und nicht im Seitenkopf.

## Tests

`npm test` — die Domain-Schicht ist vollständig getestet, dort liegt das ganze
Korrektheitsrisiko. Neue Skalierungs- oder Einheitenlogik bitte zuerst als Test.
