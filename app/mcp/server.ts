import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function createMcpServer() {
  const server = new McpServer({
    name: "rr-streamable-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "greet",
    {
      description: "Simple greeting",
      inputSchema: {
        name: z.string(),
      },
    },
    async ({ name }): Promise<CallToolResult> => ({
      content: [{ type: "text", text: `Hello ${name}` }],
    })
  );

  return server;
}
