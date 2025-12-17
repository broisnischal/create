// import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// // StdioServerTransport removed - using HTTP transport in mcp.tsx instead
// // import {
// //   CallToolRequestSchema,
// //   ListResourcesRequestSchema,
// //   ListToolsRequestSchema,
// //   ListPromptsRequestSchema,
// //   ReadResourceRequestSchema,
// //   GetPromptRequestSchema,
// // } from "@modelcontextprotocol/sdk/types.js";
// import { z } from "zod";

// // Types
// type Category = "frontend" | "backend" | "fullstack" | "mobile" | "ai";
// type Runtime = "bun" | "node" | "deno";
// type PackageManager = "bun" | "npm" | "yarn" | "pnpm";

// interface FrameworkData {
//   name: string;
//   framework: string;
//   category: Category;
//   description: string;
//   github?: string;
//   docs?: string;
//   runtimes: Runtime[];
//   packageManagers: PackageManager[];
//   interactive: boolean;
//   mode?: "ci" | "interactive";
//   notes?: string[];
//   default: {
//     executor: Record<PackageManager, string>;
//     package: string;
//     variants?: Record<string, string>;
//     args?: string[];
//   };
//   commands?: Array<{
//     packageManager: PackageManager;
//     command: string;
//   }>;
//   postSteps?: string[];
//   template?: Record<
//     string,
//     {
//       github?: string;
//       name: string;
//     }
//   >;
// }

// // Framework registry
// const frameworks: Record<string, FrameworkData> = {
//   "tanstack-start": {
//     name: "tanstack-start",
//     framework: "tanstack",
//     category: "frontend",
//     description: "Create a new Tanstack Start project",
//     github: "https://github.com/tanstack/start",
//     docs: "https://tanstack.com/start",
//     runtimes: ["bun", "node"],
//     packageManagers: ["bun", "npm", "yarn", "pnpm"],
//     interactive: true,
//     mode: "ci",
//     notes: ["Requires Bun >= 1.1", "Will prompt for router and server options"],
//     default: {
//       executor: {
//         bun: "bun create",
//         npm: "npm create",
//         yarn: "yarn create",
//         pnpm: "pnpm create",
//       },
//       package: "@tanstack/start",
//       variants: {
//         latest: "@latest",
//         canary: "@canary",
//         beta: "@beta",
//       },
//       args: ["{{projectName}}"],
//     },
//     commands: [
//       {
//         packageManager: "bun",
//         command: "bun create @tanstack/start@latest {{projectName}}",
//       },
//       {
//         packageManager: "npm",
//         command: "npm create @tanstack/start@latest {{projectName}}",
//       },
//       {
//         packageManager: "pnpm",
//         command: "pnpm create @tanstack/start@latest {{projectName}}",
//       },
//       {
//         packageManager: "yarn",
//         command: "yarn create @tanstack/start@latest {{projectName}}",
//       },
//     ],
//     postSteps: [
//       "cd {{projectName}}",
//       "${packageManager} install",
//       "${packageManager} dev",
//     ],
//     template: {
//       cloudflare: {
//         github: "https://github.com/tanstack/start-cloudflare",
//         name: "cloudflare",
//       },
//     },
//   },
// };

// function detectPackageManager(): PackageManager {
//   // In Cloudflare Workers, we can't detect package managers
//   // Default to npm as it's the most common
//   // In a real implementation, this could be passed as a parameter
//   return "npm"; // fallback
// }

// function buildCommand({
//   framework,
//   projectName,
//   packageManager,
//   variant,
// }: {
//   framework: FrameworkData;
//   projectName: string;
//   packageManager?: PackageManager;
//   variant: string;
// }): string {
//   const pm = packageManager || detectPackageManager();

//   if (framework.commands) {
//     const cmd = framework.commands.find((c) => c.packageManager === pm);
//     if (cmd) {
//       return cmd.command.replace("{{projectName}}", projectName);
//     }
//   }

//   // Build from default structure
//   const executor = framework.default.executor[pm];
//   const pkg = framework.default.package;
//   const variantTag = framework.default.variants?.[variant] || "";
//   const args = (framework.default.args || [])
//     .map((arg) => arg.replace("{{projectName}}", projectName))
//     .join(" ");

//   return `${executor} ${pkg}${variantTag} ${args}`.trim();
// }

// // Initialize MCP Server
// export const getServer = () => {
//   const server = new McpServer(
//     {
//       name: "create-mcp",
//       description: "Scaffold your next project with just a few words",
//       title: "Create MCP",
//       version: "0.1.0",
//     },
//     {
//       capabilities: {
//         logging: {},
//         tools: {},
//         resources: {},
//         prompts: {},
//       },
//     }
//   );

//   server.registerTool(
//     "create",
//     {
//       inputSchema: z.object({
//         framework: z.string(),
//         projectName: z.string().optional(),
//       }),
//     },
//     async ({ framework, projectName }) => {
//       const frameworkData = frameworks[framework];
//       if (!frameworkData) {
//         throw new Error(`Framework ${framework} not found`);
//       }

//       const command = buildCommand({
//         framework: frameworkData,
//         projectName: projectName ?? `${framework}-project`,
//         packageManager: detectPackageManager(),
//         variant: "latest",
//       });

//       const res = JSON.stringify({
//         command,
//         notes: frameworkData.notes,
//         message:
//           "run the following command in the terminal to create the project",
//         name: frameworkData.name,
//         postSteps: frameworkData.postSteps,
//       });

//       return {
//         content: [
//           {
//             type: "text" as const,
//             text: res,
//           },
//         ],
//       };
//     }
//   );

//   // server.registerTool(
//   //   "validate_project_name",
//   //   {
//   //     inputSchema: z.object({
//   //       projectName: z.string(),
//   //     }),
//   //   },
//   //   async ({ projectName }) => {
//   //     if (projectName.length < 3) {
//   //       throw new Error("Project name must be at least 3 characters long");
//   //     }

//   //     return {
//   //       content: [
//   //         {
//   //           type: "text",
//   //           text: "Project name is valid",
//   //         },
//   //       ],
//   //     };
//   //   }
//   // );

//   server.registerTool(
//     "get_framework_template",
//     {
//       inputSchema: z.object({
//         framework: z.string(),
//       }),
//     },
//     async ({ framework }) => {
//       const frameworkData = frameworks[framework];
//       if (!frameworkData) {
//         throw new Error(`Framework ${framework} not found`);
//       }
//       return {
//         content: [
//           {
//             type: "text" as const,
//             text: JSON.stringify(frameworkData.template),
//           },
//         ],
//       };
//     }
//   );

//   return server;
// };

// // Export tool handlers for HTTP transport
// export const toolHandlers = {
//   create: async (args: { framework: string; projectName?: string }) => {
//     const frameworkData = frameworks[args.framework];
//     if (!frameworkData) {
//       throw new Error(`Framework ${args.framework} not found`);
//     }

//     const command = buildCommand({
//       framework: frameworkData,
//       projectName: args.projectName ?? `${args.framework}-project`,
//       packageManager: detectPackageManager(),
//       variant: "latest",
//     });

//     const res = JSON.stringify({
//       command,
//       notes: frameworkData.notes,
//       message:
//         "run the following command in the terminal to create the project",
//       name: frameworkData.name,
//       postSteps: frameworkData.postSteps,
//     });

//     return {
//       content: [
//         {
//           type: "text" as const,
//           text: res,
//         },
//       ],
//     };
//   },
//   get_framework_template: async (args: { framework: string }) => {
//     const frameworkData = frameworks[args.framework];
//     if (!frameworkData) {
//       throw new Error(`Framework ${args.framework} not found`);
//     }
//     return {
//       content: [
//         {
//           type: "text" as const,
//           text: JSON.stringify(frameworkData.template),
//         },
//       ],
//     };
//   },
// };

// // Note: The stdio server initialization is removed because we're using HTTP transport
// // in the React Router route handler. The stdio transport doesn't work in Cloudflare Workers.
// // If you need stdio transport for local development, you can create a separate entry point.
