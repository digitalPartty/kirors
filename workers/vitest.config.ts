import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", ".wrangler/"],
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  assetsInclude: ["**/*.html", "**/*.css"],
  plugins: [
    {
      name: "text-loader",
      transform(code, id) {
        if (id.endsWith(".html") || id.endsWith(".css") || (id.endsWith(".js") && id.includes("admin-ui"))) {
          return {
            code: `export default ${JSON.stringify(code)}`,
            map: null,
          };
        }
      },
    },
  ],
});
