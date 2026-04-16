# Inspatch

Select any UI element on your local app, describe the change you want, and Claude edits the source code for you.

## How it works

1. The Chrome extension lets you click any element on `localhost`
2. It captures the element's React component, source location, and styles
3. The local server sends that context to Claude, which reads and edits your source files directly

## Requirements

- [Bun](https://bun.sh) v1.0+ — bundled automatically when you run `npx @inspatch/server`; install manually only if you want to run the server directly with `bun`
- [Claude Code CLI](https://claude.ai/code) installed and logged in (`claude` in your PATH)
- Chrome browser
- A locally-running web app on `localhost`

## Quick start

### 1. Install the Chrome extension

Download the latest `inspatch-extension-*.zip` from the [Releases](../../releases) page, then:

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the unzipped folder

### 2. Start the server

Point the server at your project directory:

```bash
npx @inspatch/server --project ./my-react-app
```

The server starts on `ws://127.0.0.1:9377` by default.

```
Options:
  --project <dir>   Target project directory (required)
  --port <number>   WebSocket port (default: 9377)
  -h, --help        Show help
```

### 3. Use it

1. Open your app on `localhost` in Chrome
2. Click the Inspatch icon to open the side panel
3. Click **Inspect** and select an element
4. Describe the change you want (e.g. "make this button red and rounded")
5. Hit **Send** — Claude will locate the component and apply the edit

## Features

- **Element inspection** — captures XPath, React component name, source file, computed styles
- **Visual overlay** — highlights selected elements with a box model view
- **Screenshot attachment** — include a visual reference alongside your description
- **Real-time status** — streams progress as Claude analyzes, locates, and applies changes
- **Git diff output** — shows exactly what changed after each edit
- **Request queue** — handles multiple requests sequentially without conflicts

## Development

```bash
# Install dependencies
bun install

# Start the extension dev server
bun dev

# Start the backend server (point at any local app)
bun server --project ./path/to/app

# Run tests
bun test
```

## Release

Releases are automated via [Changesets](https://github.com/changesets/changesets). Pushing to `main` triggers the release workflow:

- **If changeset files are present** → GitHub Actions opens a "chore: release packages" PR with version bumps and changelogs
- **If no changeset files** → nothing happens

### Publishing a new version

**1. Create a changeset** (after making your changes):

```bash
bunx changeset
# → select which packages changed: @inspatch/server, @inspatch/shared, or both
# → select bump type: patch / minor / major
# → write a short description
```

This creates a `.changeset/*.md` file — commit it alongside your code changes.

**2. Push to main**

The action detects the changeset and opens a PR titled "chore: release packages". Review the version bumps and changelog, then merge.

**3. Merge the PR**

The action publishes `@inspatch/shared` and `@inspatch/server` to npm, creates a GitHub Release, and attaches the Chrome extension zip automatically.

### Commit message conventions

Use [Conventional Commits](https://www.conventionalcommits.org) — the changeset description is what appears in the changelog:

| Prefix  | When to use               |
| ------- | ------------------------- |
| `feat`  | New feature               |
| `fix`   | Bug fix                   |
| `chore` | Maintenance, deps, config |
