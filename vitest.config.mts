import { defineConfig } from "vitest/config";

/**
 * `resolve.tsconfigPaths` is what makes the `@/` alias resolve. Without it every import of
 * `@/lib/...` fails in a test. Vite resolves tsconfig paths natively, so the
 * `vite-tsconfig-paths` plugin the project's testing skill suggests is no longer needed.
 *
 * `@vitejs/plugin-react` is deliberately absent: its current release requires Babel 8 while
 * `shadcn` pins Babel 7, so installing it fails to resolve. Nothing here needs it. Vite's
 * esbuild transform compiles `.tsx` using the `jsx: "react-jsx"` setting already in
 * `tsconfig.json`, and Fast Refresh has no meaning in a test run.
 */
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "jsdom",
		globals: true,
		include: ["src/**/*.test.{ts,tsx}"],
	},
});
