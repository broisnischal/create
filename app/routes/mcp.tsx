import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "~/mcp/server";
import { transports } from "~/mcp/transportRegistry";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";

// Convert Fetch API Request to Express-like request object
function adaptRequest(request: Request): any {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    method: request.method,
    url: request.url,
    headers,
    get: (name: string) => headers[name.toLowerCase()],
  };
}

// Create Express-like response object that returns a Fetch Response
function createExpressResponse(): {
  statusCode: number;
  headers: Record<string, string>;
  writeHead: (status: number, headers?: Record<string, string>) => void;
  write: (chunk: any) => void;
  end: (chunk?: any) => void;
  setHeader: (key: string, value: string) => void;
  getHeader: (key: string) => string | undefined;
  headersSent: boolean;
  _promise: Promise<Response>;
  _resolve: (response: Response) => void;
} {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const chunks: Uint8Array[] = [];
  let headersSent = false;
  let resolveResponse: (response: Response) => void;

  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  return {
    statusCode,
    headers,
    headersSent,
    _promise: promise,
    _resolve: resolveResponse!,
    writeHead: (status: number, responseHeaders?: Record<string, string>) => {
      statusCode = status;
      if (responseHeaders) {
        Object.assign(headers, responseHeaders);
      }
      headersSent = true;
    },
    write: (chunk: any) => {
      if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      } else if (typeof chunk === "string") {
        chunks.push(new TextEncoder().encode(chunk));
      }
    },
    end: (chunk?: any) => {
      if (chunk) {
        if (chunk instanceof Uint8Array) {
          chunks.push(chunk);
        } else if (typeof chunk === "string") {
          chunks.push(new TextEncoder().encode(chunk));
        }
      }

      // Combine all chunks into a single stream
      const body =
        chunks.length > 0
          ? new ReadableStream({
              start(controller) {
                for (const chunk of chunks) {
                  controller.enqueue(chunk);
                }
                controller.close();
              },
            })
          : null;

      const response = new Response(body, {
        status: statusCode,
        headers: {
          ...headers,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, mcp-session-id, last-event-id",
        },
      });

      resolveResponse!(response);
    },
    setHeader: (key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    },
    getHeader: (key: string) => headers[key.toLowerCase()],
  };
}

// Handle GET requests (SSE streams) via loader
export async function loader({ request }: LoaderFunctionArgs) {
  const method = request.method;
  const sessionId = request.headers.get("mcp-session-id") ?? undefined;

  // Only handle GET requests in loader
  if (method !== "GET") {
    return new Response("Method not allowed in loader", { status: 405 });
  }

  // -----------------------
  // GET (SSE stream)
  // -----------------------
  if (!sessionId || !transports.has(sessionId)) {
    return new Response("Invalid session", { status: 400 });
  }

  const transport = transports.get(sessionId)!;
  const expressReq = adaptRequest(request);
  const expressRes = createExpressResponse();

  await transport.handleRequest(expressReq, expressRes, undefined);

  return expressRes._promise;
}

// Handle POST and DELETE requests via action
export async function action({ request }: ActionFunctionArgs) {
  const method = request.method;
  const sessionId = request.headers.get("mcp-session-id") ?? undefined;

  // -----------------------
  // POST (MCP protocol messages)
  // -----------------------
  if (method === "POST") {
    const body = await request.json();
    const expressReq = adaptRequest(request);
    const expressRes = createExpressResponse();

    // Resume existing session
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(expressReq, expressRes, body);
      return expressRes._promise;
    }

    // Initialize new session
    if (!sessionId && isInitializeRequest(body)) {
      const eventStore = new InMemoryEventStore();

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => globalThis.crypto.randomUUID(),
        eventStore,
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
        }
      };

      const server = createMcpServer();
      await server.connect(transport);

      await transport.handleRequest(expressReq, expressRes, body);
      return expressRes._promise;
    }

    return new Response("Bad Request", { status: 400 });
  }

  // -----------------------
  // DELETE (terminate)
  // -----------------------
  if (method === "DELETE") {
    if (!sessionId || !transports.has(sessionId)) {
      return new Response("Invalid session", { status: 400 });
    }

    const transport = transports.get(sessionId)!;
    const expressReq = adaptRequest(request);
    const expressRes = createExpressResponse();

    await transport.handleRequest(expressReq, expressRes, undefined);
    return expressRes._promise;
  }

  return new Response("Method Not Allowed", { status: 405 });
}
