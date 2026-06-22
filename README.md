# mcp-skiddle

Skiddle MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 902+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `event` | Get a single Skiddle event by id, with full details and venue. |
| `categories` | List Skiddle event category codes (for the search_events `category` filter). |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "skiddle": {
      "url": "https://gateway.pipeworx.io/skiddle/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 902+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Skiddle data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [All tools and guides](https://github.com/pipeworx-io/examples)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
