# Obsidian Note Widget for Übersicht

Display and edit notes from your Obsidian vault directly on your macOS desktop using [Übersicht](https://tracesof.net/uebersicht/).

## Features

- Browse your vault's folder tree and pin any note to a floating panel
- Rendered markdown with support for headings, tables, task lists, code blocks, callouts, tags, and wikilinks
- Interactive checkboxes — click to check/uncheck and the change is saved directly to the `.md` file
- Inline editing — save changes back to the `.md` file without leaving your desktop
- Multiple panels — pin different notes side by side
- Drag to reposition and resize each panel independently
- Positions and pins persist across refreshes via a local JSON config file

## Requirements

- [Übersicht](https://tracesof.net/uebersicht/)
- [pandoc](https://pandoc.org/) — used to render markdown to HTML

```bash
brew install pandoc
```

## Installation

1. Copy `obsidian_widget.jsx` to your Übersicht widgets folder:

   ```
   ~/Library/Application Support/Übersicht/widgets/
   ```

2. Open the file and set the two variables at the top:

   ```js
   const VAULT_PATH = "/path/to/your/vault";
   const WIDGET_NAME = "obsidian-note"; // used for the config file name
   ```

3. Übersicht will load the widget automatically. A panel will appear in the top-right corner of your desktop.

## Usage

| Action | How |
|---|---|
| Browse vault | Click the menu (⋮) → **Change note** |
| Pin a note | Click any file in the browser |
| Toggle a checkbox | Click any `- [ ]` / `- [x]` item — saves to the file immediately |
| Edit a note | Click the pencil icon in the panel header |
| Open in Obsidian | Click the menu (⋮) → **Open in Obsidian** |
| Reposition | Click the menu (⋮) → **Reposition**, then drag the header |
| Resize | Click the menu (⋮) → **Resize**, then drag the bottom-right corner |
| Add a panel | Remove all panels; a **+** button appears in the bottom-left |
| Remove a panel | Click the menu (⋮) → **Remove widget** |

## Configuration

Panel state (position, pinned note, size) is saved automatically to:

```
~/Library/Application Support/Übersicht/widgets/<WIDGET_NAME>.config.json
```

No manual editing of this file is needed.
