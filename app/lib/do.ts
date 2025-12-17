import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import {
//   CallToolRequestSchema,
//   ListResourcesRequestSchema,
//   ListToolsRequestSchema,
//   ListPromptsRequestSchema,
//   ReadResourceRequestSchema,
//   GetPromptRequestSchema,
// } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Types
type Category = "frontend" | "backend" | "fullstack" | "mobile" | "ai";
type Runtime = "bun" | "node" | "deno";
type PackageManager = "bun" | "npm" | "yarn" | "pnpm";

interface FrameworkData {
  name: string;
  framework: string;
  category: Category;
  description: string;
  github?: string;
  docs?: string;
  runtimes: Runtime[];
  packageManagers: PackageManager[];
  interactive: boolean;
  mode?: "ci" | "interactive";
  notes?: string[];
  default: {
    executor: Record<PackageManager, string>;
    package: string;
    variants?: Record<string, string>;
    args?: string[];
  };
  commands?: Array<{
    packageManager: PackageManager;
    command: string;
  }>;
  postSteps?: string[];
  template?: Record<
    string,
    {
      github?: string;
      name: string;
    }
  >;
}

// Framework registry
const frameworks: Record<string, FrameworkData> = {
  "tanstack-start": {
    name: "tanstack-start",
    framework: "tanstack",
    category: "frontend",
    description: "Create a new Tanstack Start project",
    github: "https://github.com/tanstack/start",
    docs: "https://tanstack.com/start",
    runtimes: ["bun", "node"],
    packageManagers: ["bun", "npm", "yarn", "pnpm"],
    interactive: true,
    mode: "ci",
    notes: ["Requires Bun >= 1.1", "Will prompt for router and server options"],
    default: {
      executor: {
        bun: "bun create",
        npm: "npm create",
        yarn: "yarn create",
        pnpm: "pnpm create",
      },
      package: "@tanstack/start",
      variants: {
        latest: "@latest",
        canary: "@canary",
        beta: "@beta",
      },
      args: ["{{projectName}}"],
    },
    commands: [
      {
        packageManager: "bun",
        command: "bun create @tanstack/start@latest {{projectName}}",
      },
      {
        packageManager: "npm",
        command: "npm create @tanstack/start@latest {{projectName}}",
      },
      {
        packageManager: "pnpm",
        command: "pnpm create @tanstack/start@latest {{projectName}}",
      },
      {
        packageManager: "yarn",
        command: "yarn create @tanstack/start@latest {{projectName}}",
      },
    ],
    postSteps: [
      "cd {{projectName}}",
      "${packageManager} install",
      "${packageManager} dev",
    ],
    template: {
      cloudflare: {
        github: "https://github.com/tanstack/start-cloudflare",
        name: "cloudflare",
      },
    },
  },
};

function detectPackageManager(): PackageManager {
  // Try to detect which package manager is available
  try {
    const bun = Bun.which("bun");
    if (bun) return "bun";
  } catch {}

  try {
    const pnpm = Bun.which("pnpm");
    if (pnpm) return "pnpm";
  } catch {}

  try {
    const yarn = Bun.which("yarn");
    if (yarn) return "yarn";
  } catch {}

  return "npm"; // fallback
}

function buildCommand({
  framework,
  projectName,
  packageManager,
  variant,
}: {
  framework: FrameworkData;
  projectName: string;
  packageManager?: PackageManager;
  variant: string;
}): string {
  const pm = packageManager || detectPackageManager();

  if (framework.commands) {
    const cmd = framework.commands.find((c) => c.packageManager === pm);
    if (cmd) {
      return cmd.command.replace("{{projectName}}", projectName);
    }
  }

  // Build from default structure
  const executor = framework.default.executor[pm];
  const pkg = framework.default.package;
  const variantTag = framework.default.variants?.[variant] || "";
  const args = (framework.default.args || [])
    .map((arg) => arg.replace("{{projectName}}", projectName))
    .join(" ");

  return `${executor} ${pkg}${variantTag} ${args}`.trim();
}

// Initialize MCP Server
const getServer = () => {
  const server = new McpServer(
    {
      name: "create-mcp",
      description: "Scaffold your next project with just a few words",
      title: "Create MCP",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  server.registerTool(
    "create",
    {
      inputSchema: z.object({
        framework: z.string(),
        projectName: z.string().optional(),
      }),
    },
    async ({ framework, projectName }) => {
      const frameworkData = frameworks[framework];
      if (!frameworkData) {
        throw new Error(`Framework ${framework} not found`);
      }

      const command = buildCommand({
        framework: frameworkData,
        projectName: projectName ?? `${framework}-project`,
        packageManager: detectPackageManager(),
        variant: "latest",
      });

      const res = JSON.stringify({
        command,
        notes: frameworkData.notes,
        message:
          "run the following command in the terminal to create the project",
        name: frameworkData.name,
        postSteps: frameworkData.postSteps,
      });

      return {
        content: [
          {
            type: "text",
            text: res,
          },
        ],
      };
    }
  );

  // server.registerTool(
  //   "validate_project_name",
  //   {
  //     inputSchema: z.object({
  //       projectName: z.string(),
  //     }),
  //   },
  //   async ({ projectName }) => {
  //     if (projectName.length < 3) {
  //       throw new Error("Project name must be at least 3 characters long");
  //     }

  //     return {
  //       content: [
  //         {
  //           type: "text",
  //           text: "Project name is valid",
  //         },
  //       ],
  //     };
  //   }
  // );

  server.registerTool(
    "get_framework_template",
    {
      inputSchema: z.object({
        framework: z.string(),
      }),
    },
    async ({ framework }) => {
      const frameworkData = frameworks[framework];
      if (!frameworkData) {
        throw new Error(`Framework ${framework} not found`);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(frameworkData.template),
          },
        ],
      };
    }
  );

  return server;
};

// Start the server
async function main() {
  const server = getServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Create MCP server running on stdio");
}

main().catch(console.error);
