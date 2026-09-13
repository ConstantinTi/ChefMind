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

## Was leicht kaputtgeht

- Rundung ist Küchenlogik, keine Mathematik. Tests in `src/domain/scaling/` halten
  fest, dass „5–8 Zehen" richtig ist und „5–7 1/2 Zehen" falsch.
- Rundung wird **gemeldet, nicht versteckt** (`didRound`): aus 4,5 Eiern still 5 zu
  machen verändert den Kuchen.
- Zeiten und Temperaturen skalieren nie mit.
- `better-sqlite3` braucht `serverExternalPackages` in `next.config.ts`.
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
- Der Kochmodus-Link muss die aktuell gewählte Portionszahl mitgeben. Er lebt
  deshalb im `ServingsScaler` und nicht im Seitenkopf.

## Tests

`npm test` — die Domain-Schicht ist vollständig getestet, dort liegt das ganze
Korrektheitsrisiko. Neue Skalierungs- oder Einheitenlogik bitte zuerst als Test.
