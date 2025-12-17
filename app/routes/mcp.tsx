import { getServer } from "~/lib/mcp";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Route } from "./+types/mcp";
// Generate UUID for session IDs (Cloudflare Workers compatible)
function randomUUID(): string {
  return crypto.randomUUID();
}

// In-memory event store for resumability (in production, use a persistent store)
// This implements the EventStore interface from the MCP SDK
class InMemoryEventStore {
  private events: Map<string, Array<{ id: string; message: any }>> = new Map();

  async storeEvent(sessionId: string, message: any): Promise<string> {
    if (!this.events.has(sessionId)) {
      this.events.set(sessionId, []);
    }
    const eventId = crypto.randomUUID();
    this.events.get(sessionId)!.push({ id: eventId, message });
    return eventId;
  }

  async replayEventsAfter(
    lastEventId: string,
    { send }: { send: (eventId: string, message: any) => Promise<void> }
  ): Promise<string> {
    // Find the session that contains this event ID
    for (const [sessionId, events] of this.events.entries()) {
      const eventIndex = events.findIndex((e) => e.id === lastEventId);
      if (eventIndex >= 0) {
        // Replay all events after this one
        const eventsToReplay = events.slice(eventIndex + 1);
        for (const event of eventsToReplay) {
          await send(event.id, event.message);
        }
        return eventsToReplay.length > 0
          ? eventsToReplay[eventsToReplay.length - 1].id
          : lastEventId;
      }
    }
    return lastEventId;
  }

  async clear(sessionId: string): Promise<void> {
    this.events.delete(sessionId);
  }
}

// Map to store transports by session ID (in production, use a distributed cache)
const transports = new Map<string, StreamableHTTPServerTransport>();

// Convert Fetch API Request/Response to Express-like format for StreamableHTTPServerTransport
async function adaptRequest(request: Request): Promise<{
  body: any;
  headers: Record<string, string>;
  method: string;
  url: string;
}> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body: any = null;
  if (request.method !== "GET" && request.method !== "DELETE") {
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      body = await request.json();
    } else {
      body = await request.text();
    }
  }

  return {
    body,
    headers,
    method: request.method,
    url: request.url,
  };
}

// Convert Express-like response to Fetch API Response
function adaptResponse(
  expressRes: {
    statusCode: number;
    headers: Record<string, string>;
    body?: ReadableStream | string;
  },
  originalRequest: Request
): Response {
  const headers = new Headers();
  Object.entries(expressRes.headers).forEach(([key, value]) => {
    headers.set(key, value);
  });

  // Add CORS headers
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, mcp-session-id, last-event-id"
  );

  let body: BodyInit | null = null;
  if (expressRes.body) {
    if (typeof expressRes.body === "string") {
      body = expressRes.body;
    } else {
      body = expressRes.body;
    }
  }

  return new Response(body, {
    status: expressRes.statusCode,
    headers,
  });
}

// Streaming loader for MCP HTTP endpoint
export async function loader({ request }: Route.LoaderArgs) {
  // Handle OPTIONS for CORS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, mcp-session-id, last-event-id",
      },
    });
  }

  try {
    const sessionId = request.headers.get("mcp-session-id") || undefined;
    const adaptedRequest = await adaptRequest(request);

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport
      const transport = transports.get(sessionId)!;

      // Create a mock Express response object
      const expressRes: any = {
        statusCode: 200,
        headers: {},
        write: (chunk: any) => {
          if (!expressRes.body) {
            expressRes.body = new ReadableStream({
              start(controller) {
                expressRes._controller = controller;
              },
            });
            expressRes._chunks = [];
          }
          expressRes._chunks.push(chunk);
        },
        end: (chunk?: any) => {
          if (chunk) {
            expressRes._chunks.push(chunk);
          }
          if (expressRes._controller) {
            expressRes._chunks.forEach((c: any) => {
              expressRes._controller.enqueue(
                typeof c === "string" ? new TextEncoder().encode(c) : c
              );
            });
            expressRes._controller.close();
          }
        },
        setHeader: (key: string, value: string) => {
          expressRes.headers[key.toLowerCase()] = value;
        },
        getHeader: (key: string) => expressRes.headers[key.toLowerCase()],
        headersSent: false,
      };

      await transport.handleRequest(
        adaptedRequest as any,
        expressRes as any,
        adaptedRequest.body
      );

      return adaptResponse(expressRes, request);
    } else if (!sessionId && isInitializeRequest(adaptedRequest.body)) {
      // New initialization request
      const eventStore = new InMemoryEventStore();
      const newSessionId = randomUUID();

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        eventStore, // Enable resumability
        onsessioninitialized: (sid) => {
          console.log(`Session initialized with ID: ${sid}`);
          transports.set(sid, transport);
        },
      });

      // Set up onclose handler to clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId && transports.has(transport.sessionId)) {
          console.log(
            `Transport closed for session ${transport.sessionId}, removing from transports map`
          );
          transports.delete(transport.sessionId);
        }
      };

      // Connect the transport to the MCP server BEFORE handling the request
      const server = getServer();
      await server.connect(transport);

      // Create a mock Express response object
      const expressRes: any = {
        statusCode: 200,
        headers: {},
        write: (chunk: any) => {
          if (!expressRes.body) {
            expressRes.body = new ReadableStream({
              start(controller) {
                expressRes._controller = controller;
              },
            });
            expressRes._chunks = [];
          }
          expressRes._chunks.push(chunk);
        },
        end: (chunk?: any) => {
          if (chunk) {
            expressRes._chunks.push(chunk);
          }
          if (expressRes._controller) {
            expressRes._chunks.forEach((c: any) => {
              expressRes._controller.enqueue(
                typeof c === "string" ? new TextEncoder().encode(c) : c
              );
            });
            expressRes._controller.close();
          }
        },
        setHeader: (key: string, value: string) => {
          expressRes.headers[key.toLowerCase()] = value;
        },
        getHeader: (key: string) => expressRes.headers[key.toLowerCase()],
        headersSent: false,
      };

      await transport.handleRequest(
        adaptedRequest as any,
        expressRes as any,
        adaptedRequest.body
      );

      return adaptResponse(expressRes, request);
    } else {
      // Invalid request - no session ID or not initialization request
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  } catch (error) {
    console.error("Error handling MCP request:", error);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
          data: error instanceof Error ? error.message : String(error),
        },
        id: null,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
