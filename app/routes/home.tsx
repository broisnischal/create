import { Link } from "react-router";

export function meta() {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold">Create</h1>
      <p className="text-lg">Create a new project</p>
      <Link to="/mcp">MCP</Link>
    </div>
  );
}
