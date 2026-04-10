/**
 * Admin UI Handler Tests
 */

import { describe, it, expect } from "vitest";
import { handleAdminUI } from "./admin-ui";

describe("Admin UI Handler", () => {
  it("should serve HTML for /admin", async () => {
    const request = new Request("https://example.com/admin");
    const response = await handleAdminUI(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    
    const html = await response.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Kiro Admin");
  });

  it("should serve HTML for /admin/", async () => {
    const request = new Request("https://example.com/admin/");
    const response = await handleAdminUI(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  });

  it("should serve CSS for /admin/styles.css", async () => {
    const request = new Request("https://example.com/admin/styles.css");
    const response = await handleAdminUI(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    
    const css = await response.text();
    expect(css).toContain("--primary-color");
  });

  it("should serve JavaScript for /admin/app.js", async () => {
    const request = new Request("https://example.com/admin/app.js");
    const response = await handleAdminUI(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    
    const js = await response.text();
    expect(js).toContain("class AdminApp");
  });

  it("should return 404 for unknown admin routes", async () => {
    const request = new Request("https://example.com/admin/unknown");
    const response = await handleAdminUI(request);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("should set no-cache headers for HTML", async () => {
    const request = new Request("https://example.com/admin");
    const response = await handleAdminUI(request);

    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-store, must-revalidate");
  });

  it("should set cache headers for static assets", async () => {
    const cssRequest = new Request("https://example.com/admin/styles.css");
    const cssResponse = await handleAdminUI(cssRequest);
    expect(cssResponse.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const jsRequest = new Request("https://example.com/admin/app.js");
    const jsResponse = await handleAdminUI(jsRequest);
    expect(jsResponse.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });
});
