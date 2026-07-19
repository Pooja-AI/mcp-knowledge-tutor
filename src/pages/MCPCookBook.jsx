import { useState } from "react";

const MCP = [
  {
    id: "mcp-server-basic",
    category: "Foundations",
    title: "Your First MCP Server",
    difficulty: "Beginner",
    time: "~15 min",
    description: "Scaffold a minimal MCP server that exposes one tool. The entry point for understanding how hosts, clients, and servers connect.",
    tags: ["server", "stdio", "tools"],
    steps: [
      { label: "Install SDK", icon: "📦", detail: "npm install @modelcontextprotocol/sdk — the official TypeScript SDK handles protocol framing, schema validation, and transport." },
      { label: "Create Server", icon: "🖥️", detail: "Instantiate a Server with a name and version. This becomes the identity your MCP host (e.g. Claude Desktop) sees in its registry." },
      { label: "Register Tools", icon: "🔧", detail: "Call server.tool(name, description, zodSchema, handler). The SDK auto-generates the JSON Schema from Zod and routes incoming calls to your handler." },
      { label: "Connect Transport", icon: "🔌", detail: "Wrap the server in a StdioServerTransport — the server reads JSON-RPC messages from stdin and writes responses to stdout." },
      { label: "Run & Test", icon: "🧪", detail: "Point Claude Desktop or the MCP Inspector at your server binary. Use the Inspector's UI to call tools and inspect raw protocol messages." },
    ],
    code: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 1. Create the server
const server = new McpServer({
  name: "my-first-mcp-server",
  version: "1.0.0",
});

// 2. Register a tool
server.tool(
  "get_time",
  "Returns the current UTC time",
  {}, // no input params
  async () => ({
    content: [{ type: "text", text: new Date().toUTCString() }],
  })
);

// 3. Register a tool with input schema
server.tool(
  "add_numbers",
  "Adds two numbers together",
  { a: z.number().describe("First number"), b: z.number().describe("Second number") },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }],
  })
);

// 4. Connect stdio transport and start
const transport = new StdioServerTransport();
await server.connect(transport);

// claude_desktop_config.json entry:
// {
//   "mcpServers": {
//     "my-server": {
//       "command": "node",
//       "args": ["/absolute/path/to/server.js"]
//     }
//   }
// }`,
  },
  {
    id: "mcp-resources",
    category: "Foundations",
    title: "Exposing Resources",
    difficulty: "Beginner",
    time: "~20 min",
    description: "Resources let your server expose readable content — files, DB rows, API responses — that the host can embed directly into the LLM context.",
    tags: ["resources", "context", "URIs"],
    steps: [
      { label: "Define URI Scheme", icon: "🔗", detail: "Choose a URI scheme for your resource namespace, e.g. file://, db://, or myapp://. URIs uniquely identify each resource." },
      { label: "List Resources", icon: "📋", detail: "Implement the resources/list handler to return an array of {uri, name, description, mimeType}. The host calls this to discover what's available." },
      { label: "Read Handler", icon: "📖", detail: "Implement resources/read: given a URI, return {contents: [{uri, mimeType, text|blob}]}. Text is passed as-is; blobs are base64-encoded." },
      { label: "Resource Templates", icon: "🗂️", detail: "Use URI templates (RFC 6570) like file:///{path} for dynamic resources. The host fills in parameters before calling read." },
      { label: "Change Notifications", icon: "🔔", detail: "Emit notifications/resources/updated when a resource changes. Hosts that support subscriptions will re-fetch and update their context." },
    ],
    code: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

const server = new McpServer({ name: "file-resources", version: "1.0.0" });
const DOCS_DIR = "./docs";

// List available resources
server.resource(
  "docs-list",
  "docs://list",
  { mimeType: "application/json" },
  async () => {
    const files = await readdir(DOCS_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    return {
      contents: [{
        uri: "docs://list",
        mimeType: "application/json",
        text: JSON.stringify(mdFiles.map((f) => ({
          uri: \`docs://\${f}\`,
          name: f,
          description: \`Markdown file: \${f}\`,
          mimeType: "text/markdown",
        }))),
      }],
    };
  }
);

// Read a specific file resource
server.resource(
  "doc-file",
  new URL("docs://{filename}"),  // URI template
  { mimeType: "text/markdown" },
  async (uri) => {
    const filename = uri.pathname.replace(/^\\//, "");
    const content = await readFile(join(DOCS_DIR, filename), "utf-8");
    return {
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }],
    };
  }
);

// Notify host when a file changes (e.g. on file watcher event)
function notifyResourceChanged(filename) {
  server.server.notification({
    method: "notifications/resources/updated",
    params: { uri: \`docs://\${filename}\` },
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);`,
  },
  {
    id: "mcp-prompts",
    category: "Foundations",
    title: "Reusable Prompts",
    difficulty: "Beginner",
    time: "~15 min",
    description: "Register prompt templates on your server so any MCP host can invoke them by name with typed arguments — a shared prompt library across clients.",
    tags: ["prompts", "templates", "reusability"],
    steps: [
      { label: "Define Prompt", icon: "📝", detail: "Call server.prompt(name, description, argsSchema, handler). Args are typed via Zod; descriptions help the host surface them in UI." },
      { label: "Build Messages", icon: "💬", detail: "Return an array of {role, content} objects. Prompts can mix user and assistant turns to set up a conversation scaffold." },
      { label: "Embed Resources", icon: "🔗", detail: "Reference resource URIs inside prompt content using {type: 'resource', resource: {uri}}. The host resolves and embeds the resource at runtime." },
      { label: "List & Get", icon: "📋", detail: "The host calls prompts/list to discover prompts and prompts/get with args to render them. Your handler receives the filled-in arguments." },
      { label: "Prompt Chaining", icon: "🔄", detail: "Compose complex prompt chains by referencing other prompts as resources, enabling modular, reusable conversation patterns." },
    ],
    code: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "prompt-library", version: "1.0.0" });

// Simple prompt template
server.prompt(
  "code-review",
  "Review code for bugs, style, and performance",
  {
    language: z.string().describe("Programming language"),
    code: z.string().describe("The code to review"),
    focus: z.enum(["bugs", "performance", "style", "all"]).default("all"),
  },
  async ({ language, code, focus }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: \`Please review the following \${language} code focusing on \${focus}.
Provide specific, actionable feedback with line references where possible.

\\\`\\\`\\\`\${language}
\${code}
\\\`\\\`\\\`\`,
        },
      },
    ],
  })
);

// Prompt that embeds a resource
server.prompt(
  "summarize-doc",
  "Summarize a documentation file",
  {
    filename: z.string().describe("The doc filename to summarize"),
    audience: z.enum(["technical", "executive", "beginner"]),
  },
  async ({ filename, audience }) => ({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: \`Summarize the following document for a \${audience} audience in 3–5 bullet points:\`,
          },
          {
            type: "resource",
            resource: { uri: \`docs://\${filename}\` }, // host resolves this
          },
        ],
      },
    ],
  })
);

// Multi-turn prompt scaffold
server.prompt(
  "debugging-session",
  "Start a structured debugging conversation",
  { error: z.string(), context: z.string().optional() },
  async ({ error, context }) => ({
    messages: [
      {
        role: "user",
        content: { type: "text", text: \`I'm seeing this error:\n\n\${error}\n\nContext: \${context ?? "none"}\` },
      },
      {
        role: "assistant",
        content: { type: "text", text: "I'll help you debug this. Let me start by asking a few questions to narrow down the root cause." },
      },
    ],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);`,
  },
  {
    id: "mcp-client",
    category: "Client",
    title: "MCP Client Integration",
    difficulty: "Intermediate",
    time: "~30 min",
    description: "Build an MCP client that connects to a server, discovers its capabilities, and passes tools to Claude — the bridge between your server and the LLM.",
    tags: ["client", "discovery", "Claude API"],
    steps: [
      { label: "Launch Server", icon: "🚀", detail: "Spawn the MCP server as a child process. The client manages its lifecycle, restarting on crash if needed." },
      { label: "Create Client", icon: "🔌", detail: "Instantiate a Client with name/version and connect via StdioClientTransport pointed at the server process." },
      { label: "Discover Tools", icon: "🔍", detail: "Call client.listTools() to get the full tool catalog: name, description, and inputSchema for each tool the server exposes." },
      { label: "Convert Schemas", icon: "🔄", detail: "Map MCP tool schemas to Anthropic tool format — both use JSON Schema, so conversion is typically a direct pass-through with minor reshaping." },
      { label: "Claude Tool Loop", icon: "🤖", detail: "Pass converted tools to claude.messages.create. When Claude returns tool_use blocks, route them back through client.callTool() on your MCP server." },
      { label: "Return Results", icon: "📤", detail: "Feed tool_result blocks back to Claude and continue the loop until stop_reason === 'end_turn'." },
    ],
    code: `import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const anthropic = new Anthropic();

async function createMCPClient(serverCommand, serverArgs = []) {
  const transport = new StdioClientTransport({
    command: serverCommand,
    args: serverArgs,
  });

  const client = new Client({ name: "my-mcp-client", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

function mcpToolsToAnthropic(mcpTools) {
  return mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

async function runWithMCP(userMessage, serverCommand, serverArgs) {
  const client = await createMCPClient(serverCommand, serverArgs);

  // Discover all tools the server exposes
  const { tools: mcpTools } = await client.listTools();
  const anthropicTools = mcpToolsToAnthropic(mcpTools);

  console.log(\`Connected to MCP server. Available tools: \${mcpTools.map((t) => t.name).join(", ")}\`);

  const messages = [{ role: "user", content: userMessage }];

  // Agentic loop
  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      tools: anthropicTools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      await client.close();
      return response.content.find((b) => b.type === "text")?.text;
    }

    // Execute tool calls via MCP
    const toolResults = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        console.log(\`Calling MCP tool: \${block.name}\`, block.input);

        const result = await client.callTool({
          name: block.name,
          arguments: block.input,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.content.map((c) => ({ type: c.type, text: c.text })),
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }
}

// Connect to a local MCP server and ask Claude to use it
const answer = await runWithMCP(
  "What files are in the docs folder and summarize the first one?",
  "node",
  ["./my-mcp-server.js"]
);
console.log(answer);`,
  },
  {
    id: "mcp-auth",
    category: "Production",
    title: "OAuth & Remote Servers",
    difficulty: "Advanced",
    time: "~60 min",
    description: "Serve MCP over HTTP with Server-Sent Events and protect it with OAuth 2.1. Enables multi-tenant, cloud-hosted MCP servers.",
    tags: ["OAuth", "HTTP", "SSE", "multi-tenant"],
    steps: [
      { label: "HTTP + SSE Transport", icon: "🌐", detail: "Replace stdio with StreamableHTTPServerTransport. The client POSTs JSON-RPC to /mcp and receives streamed responses via SSE." },
      { label: "OAuth 2.1 Flow", icon: "🔐", detail: "Implement the MCP OAuth spec: discovery endpoint at /.well-known/oauth-authorization-server, authorization, token, and revocation endpoints." },
      { label: "Token Validation", icon: "✅", detail: "Validate Bearer tokens on every request in middleware. Reject with 401 if missing, expired, or tampered. Attach the user identity to the request context." },
      { label: "Dynamic Registration", icon: "📋", detail: "Support RFC 7591 dynamic client registration at /register so MCP hosts can self-register without manual setup." },
      { label: "Session Management", icon: "🗝️", detail: "Maintain per-session server instances keyed by Mcp-Session-Id header. Clean up on session close or timeout to avoid resource leaks." },
      { label: "PKCE + HTTPS", icon: "🛡️", detail: "Require PKCE for all authorization code flows. Enforce HTTPS in production — the MCP spec mandates this for remote servers." },
    ],
    code: `import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import jwt from "jsonwebtoken";
import { z } from "zod";

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
const sessions = new Map(); // sessionId → { server, transport }

// ── OAuth endpoints ──────────────────────────────────────────────────────────

// Discovery document (RFC 8414)
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const base = \`\${req.protocol}://\${req.get("host")}\`;
  res.json({
    issuer: base,
    authorization_endpoint: \`\${base}/oauth/authorize\`,
    token_endpoint: \`\${base}/oauth/token\`,
    revocation_endpoint: \`\${base}/oauth/revoke\`,
    registration_endpoint: \`\${base}/oauth/register\`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
  });
});

// Dynamic client registration (RFC 7591)
const registeredClients = new Map();
app.post("/oauth/register", (req, res) => {
  const clientId = crypto.randomUUID();
  const clientSecret = crypto.randomUUID();
  registeredClients.set(clientId, { ...req.body, clientId, clientSecret });
  res.status(201).json({ client_id: clientId, client_secret: clientSecret });
});

// Token endpoint — simplified; use a real auth server in production
app.post("/oauth/token", (req, res) => {
  const { grant_type, code, client_id } = req.body;
  if (grant_type !== "authorization_code") return res.status(400).json({ error: "unsupported_grant_type" });

  const token = jwt.sign({ sub: client_id, scope: "mcp:read mcp:write" }, JWT_SECRET, { expiresIn: "1h" });
  const refresh = jwt.sign({ sub: client_id, type: "refresh" }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ access_token: token, token_type: "Bearer", expires_in: 3600, refresh_token: refresh });
});

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "unauthorized" });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

// ── MCP endpoint ─────────────────────────────────────────────────────────────

function createServerForUser(userId) {
  const server = new McpServer({ name: "remote-mcp-server", version: "1.0.0" });

  server.tool("get_user_data", "Get data for the authenticated user", { key: z.string() }, async ({ key }) => ({
    content: [{ type: "text", text: \`Data for user \${userId}, key \${key}: [mock result]\` }],
  }));

  return server;
}

app.all("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  let session = sessions.get(sessionId);

  if (!session) {
    const server = createServerForUser(req.user.sub);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
    await server.connect(transport);
    session = { server, transport };
    if (sessionId) sessions.set(sessionId, session);
  }

  await session.transport.handleRequest(req, res, req.body);
});

// Cleanup on session close
app.delete("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const session = sessions.get(sessionId);
  if (session) {
    await session.transport.handleRequest(req, res, req.body);
    sessions.delete(sessionId);
  } else {
    res.status(404).json({ error: "session not found" });
  }
});

app.listen(3000, () => console.log("MCP server listening on :3000"));`,
  },
  {
    id: "mcp-sampling",
    category: "Advanced",
    title: "Sampling & Roots",
    difficulty: "Advanced",
    time: "~40 min",
    description: "Use MCP's sampling primitive to let your server call the LLM through the host, and roots to understand the client's file system workspace.",
    tags: ["sampling", "roots", "LLM-in-server"],
    steps: [
      { label: "Declare Capability", icon: "📢", detail: "Advertise {sampling: {}} in your server capabilities. Hosts that support sampling will enable the createMessage API on your server instance." },
      { label: "Call createMessage", icon: "💬", detail: "Inside a tool handler, call server.server.createMessage({messages, maxTokens}). The host proxies this to its LLM — your server never needs its own API key." },
      { label: "Human-in-the-Loop", icon: "👤", detail: "The host may show the user a confirmation dialog before forwarding the sampling request. Design your tool to handle both approval and rejection gracefully." },
      { label: "List Roots", icon: "📁", detail: "Call client.listRoots() (from server context) to discover the directories the user has opened in their IDE or file explorer — your workspace context." },
      { label: "Watch Root Changes", icon: "🔔", detail: "Subscribe to roots/list_changed notifications to stay in sync when the user opens or closes project folders during a session." },
      { label: "Scoped Access", icon: "🔒", detail: "Restrict all file operations to the declared roots. Never traverse outside them — the roots define the security boundary the user has explicitly granted." },
    ],
    code: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "fs/promises";
import { join } from "path";

const server = new McpServer(
  { name: "sampling-server", version: "1.0.0" },
  {
    capabilities: {
      sampling: {}, // ← advertise sampling support
      roots: { listChanged: true }, // ← advertise roots support
    },
  }
);

// Tool that uses sampling to call the LLM through the host
server.tool(
  "explain_code",
  "Explain what a source file does using the host LLM",
  { filepath: z.string().describe("Path to the file, relative to a root") },
  async ({ filepath }) => {
    // 1. Get the user's workspace roots
    let fileContent;
    try {
      const { roots } = await server.server.listRoots();
      if (roots.length === 0) throw new Error("No roots available");

      // Try reading from the first root
      const rootPath = new URL(roots[0].uri).pathname;
      fileContent = await readFile(join(rootPath, filepath), "utf-8");
    } catch (err) {
      return { content: [{ type: "text", text: \`Error reading file: \${err.message}\` }] };
    }

    // 2. Use sampling to call the LLM through the host (no API key needed!)
    const response = await server.server.createMessage({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: \`Explain what this code does in 3–5 sentences:\\n\\n\\\`\\\`\\\`\\n\${fileContent}\\n\\\`\\\`\\\`\`,
          },
        },
      ],
      maxTokens: 512,
      // The host may show this to the user before approving
      includeContext: "thisServer",
    });

    const explanation = response.content.type === "text" ? response.content.text : "Could not generate explanation";
    return { content: [{ type: "text", text: explanation }] };
  }
);

// Tool that lists files scoped to workspace roots
server.tool(
  "list_workspace_files",
  "List files in the user's workspace roots",
  { extension: z.string().optional().describe("Filter by extension, e.g. '.ts'") },
  async ({ extension }) => {
    const { roots } = await server.server.listRoots();
    const files = [];

    for (const root of roots) {
      const rootPath = new URL(root.uri).pathname;
      const { readdir } = await import("fs/promises");
      const entries = await readdir(rootPath, { recursive: true });
      const filtered = extension ? entries.filter((e) => e.endsWith(extension)) : entries;
      files.push(...filtered.map((f) => \`\${root.name}/\${f}\`));
    }

    return { content: [{ type: "text", text: files.join("\\n") || "No files found" }] };
  }
);

// React to root changes
server.server.setNotificationHandler(
  { method: "notifications/roots/list_changed" },
  async () => {
    const { roots } = await server.server.listRoots();
    console.log("Workspace roots updated:", roots.map((r) => r.name));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);`,
  },
  {
    id: "mcp-testing",
    category: "Production",
    title: "Testing & Debugging",
    difficulty: "Intermediate",
    time: "~30 min",
    description: "Test MCP servers with the official Inspector, write automated unit tests for tools, and debug protocol messages without a full host.",
    tags: ["testing", "inspector", "debugging"],
    steps: [
      { label: "MCP Inspector", icon: "🔬", detail: "Run npx @modelcontextprotocol/inspector node ./server.js to open a browser UI. Call tools, browse resources, and inspect raw JSON-RPC messages interactively." },
      { label: "In-Memory Transport", icon: "🧪", detail: "Use InMemoryTransport for unit tests — no child processes needed. Create linked client/server pairs and test tool logic directly in your test runner." },
      { label: "Test Tool Schemas", icon: "📋", detail: "Verify your tool input schemas reject invalid inputs. The SDK validates against JSON Schema before calling your handler — test that validation too." },
      { label: "Mock Tool Results", icon: "🎭", detail: "In integration tests, mock external services (APIs, DBs) at the tool handler boundary. Keep MCP protocol behavior real; fake only the I/O side effects." },
      { label: "Protocol Logging", icon: "📝", detail: "Set MCP_LOG_LEVEL=debug to stream all JSON-RPC traffic to stderr. Pipe to jq for pretty-printing: node server.js 2>&1 | grep MCP | jq ." },
    ],
    code: `import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

// ── Server factory (same code as your real server) ───────────────────────────

function createServer() {
  const server = new McpServer({ name: "test-server", version: "1.0.0" });

  server.tool(
    "add",
    "Add two numbers",
    { a: z.number(), b: z.number() },
    async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] })
  );

  server.tool(
    "fetch_user",
    "Fetch user by ID",
    { id: z.string().uuid() },
    async ({ id }) => {
      // In tests we mock this at the DB layer
      const user = await mockDb.getUser(id);
      if (!user) return { content: [{ type: "text", text: "User not found" }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(user) }] };
    }
  );

  return server;
}

// ── Mock dependencies ─────────────────────────────────────────────────────────

const mockDb = {
  users: new Map([["123e4567-e89b-12d3-a456-426614174000", { name: "Alice", role: "admin" }]]),
  getUser: (id) => Promise.resolve(mockDb.users.get(id) ?? null),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe("MCP Server", () => {
  let client;
  let cleanup;

  beforeEach(async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    cleanup = async () => { await client.close(); };
  });

  afterEach(() => cleanup());

  it("lists available tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["add", "fetch_user"]);
  });

  it("add tool returns correct sum", async () => {
    const result = await client.callTool({ name: "add", arguments: { a: 3, b: 4 } });
    expect(result.content[0].text).toBe("7");
  });

  it("add tool rejects non-numbers", async () => {
    await expect(
      client.callTool({ name: "add", arguments: { a: "three", b: 4 } })
    ).rejects.toThrow();
  });

  it("fetch_user returns user for valid UUID", async () => {
    const result = await client.callTool({
      name: "fetch_user",
      arguments: { id: "123e4567-e89b-12d3-a456-426614174000" },
    });
    const user = JSON.parse(result.content[0].text);
    expect(user.name).toBe("Alice");
  });

  it("fetch_user returns isError for unknown user", async () => {
    const result = await client.callTool({
      name: "fetch_user",
      arguments: { id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(result.isError).toBe(true);
  });
});

// Run: npx vitest run
// Inspector: npx @modelcontextprotocol/inspector node ./server.js`,
  },
];

const CATEGORIES = ["All", "Foundations", "Client", "Production", "Advanced"];
const DIFFICULTIES = { Beginner: "#0F6E56", Intermediate: "#185FA5", Advanced: "#993C1D" };
const DIFFICULTY_BG = { Beginner: "#E1F5EE", Intermediate: "#E6F1FB", Advanced: "#FAECE7" };

function StepFlow({ steps }) {
  const [active, setActive] = useState(null);
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => setActive(active === i ? null : i)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 20, border: active === i ? "1.5px solid #185FA5" : "0.5px solid var(--color-border-tertiary)",
                background: active === i ? "#E6F1FB" : "var(--color-background-primary)",
                color: active === i ? "#185FA5" : "var(--color-text-primary)",
                cursor: "pointer", fontSize: 13, fontWeight: active === i ? 500 : 400,
                transition: "all 0.15s",
              }}
            >
              <span>{step.icon}</span>
              <span>{step.label}</span>
            </button>
            {i < steps.length - 1 && (
              <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>→</span>
            )}
          </div>
        ))}
      </div>
      {active !== null && (
        <div style={{
          marginTop: 10, padding: "10px 14px", borderRadius: 8,
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6,
        }}>
          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{steps[active].label}: </span>
          {steps[active].detail}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div style={{ position: "relative", marginTop: 16 }}>
      <button
        onClick={copy}
        style={{
          position: "absolute", top: 8, right: 8, padding: "4px 10px",
          borderRadius: 6, border: "0.5px solid var(--color-border-secondary)",
          background: "var(--color-background-secondary)", cursor: "pointer",
          fontSize: 12, color: "var(--color-text-secondary)", zIndex: 1,
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
      <pre style={{
        margin: 0, padding: "14px 16px", borderRadius: 10, overflowX: "auto",
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        fontSize: 12, lineHeight: 1.65, fontFamily: "var(--font-mono)",
        color: "var(--color-text-primary)", whiteSpace: "pre",
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function RecipeCard({ recipe, onSelect, selected }) {
  return (
    <div
      onClick={() => onSelect(recipe)}
      style={{
        padding: "16px 18px", borderRadius: 12, cursor: "pointer",
        border: selected ? "1.5px solid #185FA5" : "0.5px solid var(--color-border-tertiary)",
        background: selected ? "#061320" : "var(--color-background-primary)",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 400 }}>
          {recipe.category}
        </span>
        <span style={{
          fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500,
          background: DIFFICULTY_BG[recipe.difficulty], color: DIFFICULTIES[recipe.difficulty],
        }}>
          {recipe.difficulty}
        </span>
      </div>
      <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4, color: "var(--color-text-primary)" }}>
        {recipe.title}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        {recipe.description}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {recipe.tags.map((t) => (
          <span key={t} style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 20,
            background: "var(--color-background-tertiary)",
            color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)",
          }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function RecipeDetail({ recipe }) {
  const [tab, setTab] = useState("steps");
  return (
    <div style={{ padding: "24px", borderRadius: 14, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{recipe.category}</span>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 500 }}>{recipe.title}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4 }}>
          <span style={{
            fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 500,
            background: DIFFICULTY_BG[recipe.difficulty], color: DIFFICULTIES[recipe.difficulty],
          }}>{recipe.difficulty}</span>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>⏱ {recipe.time}</span>
        </div>
      </div>
      <p style={{ margin: "0 0 20px", color: "var(--color-text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
        {recipe.description}
      </p>

      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "0.5px solid var(--color-border-tertiary)", paddingBottom: 0 }}>
        {["steps", "code"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: tab === t ? 500 : 400,
              color: tab === t ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              borderBottom: tab === t ? "2px solid #185FA5" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.12s",
            }}
          >
            {t === "steps" ? "Pipeline Steps" : "Code"}
          </button>
        ))}
      </div>

      {tab === "steps" && <StepFlow steps={recipe.steps} />}
      {tab === "code" && <CodeBlock code={recipe.code} />}
    </div>
  );
}

function Sidebar({ recipes, selected, onSelect, category, setCategory, search, setSearch }) {
  const filtered = recipes.filter((r) => {
    const matchCat = category === "All" || r.category === category;
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      <div style={{ padding: "0 0 16px" }}>
        <input
          type="text"
          placeholder="Search recipes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", padding: "8px 12px",
            borderRadius: 8, border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary)",
            color: "var(--color-text-primary)", fontSize: 13,
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: category === c ? "1.5px solid #185FA5" : "0.5px solid var(--color-border-tertiary)",
              background: category === c ? "#E6F1FB" : "var(--color-background-primary)",
              color: category === c ? "#185FA5" : "var(--color-text-secondary)",
              fontWeight: category === c ? 500 : 400,
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ color: "var(--color-text-tertiary)", fontSize: 13, padding: "12px 0" }}>No recipes found.</div>
        ) : filtered.map((r) => (
          <RecipeCard key={r.id} recipe={r} onSelect={onSelect} selected={selected?.id === r.id} />
        ))}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={{
      padding: "20px 32px 16px",
      borderBottom: "0.5px solid var(--color-border-tertiary)",
      display: "flex", alignItems: "center", gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: "#FAECE7", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>
        🔌
      </div>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.3px" }}>MCP Cookbook</h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
          End-to-end Model Context Protocol recipes
        </p>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 20 }}>
        {[
          { label: "Recipes", value: MCP.length },
          { label: "Patterns", value: CATEGORIES.length - 1 },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [selected, setSelected] = useState(MCP[0]);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", fontFamily: "var(--font-sans, system-ui, sans-serif)",
      background: "var(--color-background-tertiary, radial-gradient(circle at top, #0f172a, #020617);)",
      color: "var(--color-text-primary)",
    }}>
      <Header />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{
          width: 320, minWidth: 260, padding: "20px 20px",
          borderRight: "0.5px solid var(--color-border-tertiary)",
          background: "var(--color-background-primary)",
          overflowY: "auto",
        }}>
          <Sidebar
            recipes={MCP}
            selected={selected}
            onSelect={setSelected}
            category={category}
            setCategory={setCategory}
            search={search}
            setSearch={setSearch}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {selected ? (
            <RecipeDetail recipe={selected} />
          ) : (
            <div style={{ color: "var(--color-text-tertiary)", padding: 40, textAlign: "center" }}>
              Select a recipe to get started
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
