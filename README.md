# mcp-readwise-server

An MCP server that exposes the [Readwise v2 API](https://readwise.io/api_deets) so any MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc.) can read your books, highlights, daily review, and tags.

## Design: progressive discovery via catalog

The server exposes only **two** tools regardless of how many Readwise endpoints it covers:

| Tool | What it does |
| --- | --- |
| `list-operations` | Returns the catalog: every available operation, its description, and a JSON Schema for its arguments. |
| `invoke-operation` | Executes an operation by name with the given arguments. |

This keeps the visible tool surface tiny — clients don't have to load 10+ schemas into context up front. The model calls `list-operations` to discover what's available, then `invoke-operation { operation, args }` to dispatch.

Currently 10 operations are registered:

- **Books:** `list-books`, `get-book`, `list-book-tags`, `get-book-tag`
- **Highlights:** `list-highlights`, `get-highlight`, `list-highlight-tags`, `get-highlight-tag`, `export-highlights`
- **Daily review:** `daily-highlights`

Each operation returns the raw Readwise JSON response as text. On non-2xx responses, the result has `isError: true` with the status code and response body. Argument validation errors (wrong type, missing required field) also return `isError: true` with the Zod failure details.

To add a new endpoint, append an entry to the `operations` table in [src/index.ts](src/index.ts) — the catalog and dispatcher pick it up automatically.

## Requirements

- Node.js 18+ (uses global `fetch`) — installed on the host that will run the server
- A Readwise API token from <https://readwise.io/access_token>

## Install in Claude Desktop (recommended)

The repository ships a [Claude Desktop Extension](https://www.anthropic.com/engineering/desktop-extensions) (`.mcpb` bundle). Installing it is a one-click flow that handles the API token securely via the OS keychain — no JSON editing, no plaintext token in a config file.

1. Build (or download) the bundle:

   ```bash
   npm install
   npm run package
   ```

   Produces `mcp-readwise-server-<version>.mcpb` in the project root. The same file works on macOS, Windows, and Linux.

2. **Install in Claude Desktop**: open Claude Desktop, go to **Settings → Extensions**, and either drag the `.mcpb` onto the window or click **Install Extension** and pick the file.

3. Claude Desktop prompts for the **Readwise API Token** (declared as `sensitive` in [manifest.json](manifest.json), so it's stored in the OS keychain — macOS Keychain, Windows Credential Manager, libsecret on Linux). Paste your token and enable the extension.

4. Restart Claude Desktop. The `readwise` server appears under **Connectors**; `list-operations` and `invoke-operation` are now available.

To update the token later, go to **Settings → Extensions → Readwise → Configure**.

## Install in Claude Code (CLI)

Claude Code doesn't read `.mcpb` bundles — use `claude mcp add` instead. First build the server:

```bash
npm install   # triggers `prepare`, which compiles to build/
```

**Quick install (token in config)** — adds `readwise` at user scope so it's available across all your Claude Code projects:

```bash
claude mcp add readwise -s user \
  -e READWISE_TOKEN=YOUR_TOKEN \
  -- node /absolute/path/to/mcp-readwise-server/build/index.js
```

Unlike Claude Desktop, Claude Code has no OS-keychain integration — `-e READWISE_TOKEN=...` writes the token in **plaintext** to `~/.claude.json`. For a personal machine that's no different from any other dotfile config. If you'd rather not store the literal token in a file, use the env-sourced approach below.

**Source the token from the environment (recommended)** — keeps the token out of any committed or synced config file. Create `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "readwise": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-readwise-server/build/index.js"],
      "env": { "READWISE_TOKEN": "${READWISE_TOKEN}" }
    }
  }
}
```

Then export the token from your shell — either statically:

```bash
# in ~/.zshrc or ~/.bashrc
export READWISE_TOKEN="rw_..."
```

…or pulled from a secret manager at shell start (preferred for shared machines):

```bash
export READWISE_TOKEN="$(op item get Readwise --fields token)"   # 1Password CLI
export READWISE_TOKEN="$(bw get password readwise)"              # Bitwarden CLI
```

Claude Code prompts once for trust the first time it sees `.mcp.json`. Only the `${READWISE_TOKEN}` *reference* lives in the file — safe to commit.

If `READWISE_TOKEN` is unset when the server starts, it exits early with an instructional error message pointing to this section.

**Verify:**

```bash
claude mcp list                # readwise should appear
claude mcp get readwise        # full config including command + env
```

## Install manually (other MCP clients)

For clients without their own `mcp add` flow (Cursor, custom integrations), build the server and reference it directly:

```bash
npm install
```

Then add to the client's MCP server config:

```json
{
  "mcpServers": {
    "readwise": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-readwise-server/build/index.js"],
      "env": { "READWISE_TOKEN": "your_token_here" }
    }
  }
}
```

On Windows, use `C:\\Users\\...` (escaped backslashes) or forward slashes in the path. If `node` is not on PATH, use the full path to `node.exe`.

Restart the client after editing its config.

## Packaging the `.mcpb` bundle

[scripts/pack.mjs](scripts/pack.mjs) is a pure-Node script that builds a clean, cross-platform bundle:

1. Compiles TypeScript (`npm run build`).
2. Stages `build/`, `manifest.json`, `package.json`, `package-lock.json`, `README.md` into a temporary `dist-pack/`.
3. Runs `npm install --omit=dev --ignore-scripts` in the staging dir so the bundle ships **production deps only** (no `typescript`, `@types/node`).
4. Invokes `@anthropic-ai/mcpb pack` to produce `mcp-readwise-server-<version>.mcpb`.
5. Cleans the staging dir.

Run it with:

```bash
npm run package
```

A current build is ~3 MB and works on all three desktop OSes — the manifest declares Node ≥18 as the only runtime requirement.

The bundle's behavior is defined entirely by [manifest.json](manifest.json), notably:

- `server.mcp_config` — the command Claude Desktop runs, with `${__dirname}` resolving to the unpacked bundle location.
- `user_config.readwise_token` — declares the required token, marked `sensitive: true` so the value is encrypted at rest and substituted into `READWISE_TOKEN` at launch.

To validate manifest edits before packaging:

```bash
npx --yes @anthropic-ai/mcpb validate manifest.json
```

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # compile to build/
READWISE_TOKEN=... node build/index.js   # run the server over stdio
```

The server logs to stderr; stdout is reserved for the MCP JSON-RPC protocol.
