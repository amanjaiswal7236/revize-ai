import puppeteer, { type Browser, type Page } from "puppeteer";
import robotsParser from "robots-parser";
import type { SitemapNode } from "@shared/schema";

interface CrawlResult {
  sitemap: SitemapNode;
  pagesFound: number;
  brokenLinks: number;
  duplicatePages: number;
  xmlContent: string;
}

interface PageInfo {
  url: string;
  title: string;
  status: "ok" | "broken" | "duplicate";
  depth: number;
  links: string[];
}

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT = 15000; // 15 seconds - optimized for faster crawling
const MAX_RETRIES = 2; // Reduced retries for faster failure handling
const RETRY_DELAY = 500; // 0.5 second between retries
const PAGE_LOAD_WAIT_TIME = 2000; // Wait 2 seconds for dynamic content to load
const SPA_WAIT_TIME = 3000; // Wait 3 seconds for SPA content to fully render
const NETWORK_IDLE_TIMEOUT = 5000; // 5 seconds max wait for network requests
const CONTENT_CHECK_TIMEOUT = 5000; // 5 seconds max wait for content
const DOM_MUTATION_TIMEOUT = 3000; // 3 seconds max wait for DOM mutations

function log(message: string) {
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`[${timestamp}] [Crawler] ${message}`);
}

function getErrorMessage(error: any): string {
  if (error.message) {
    return error.message;
  }
    if (error.name === "AbortError") {
    return "Request timeout";
  }
  if (error.code === "ENOTFOUND") {
    return "DNS lookup failed - domain not found";
  }
  if (error.code === "ECONNREFUSED") {
    return "Connection refused - server not responding";
  }
  if (error.code === "ETIMEDOUT") {
    return "Connection timeout";
  }
  if (error.code === "ECONNRESET") {
    return "Connection reset by server";
  }
  if (error.message?.includes("certificate") || error.message?.includes("SSL") || error.message?.includes("TLS")) {
    return "SSL/TLS certificate error";
  }
  if (error.message?.includes("fetch failed")) {
    return "Network error - fetch failed";
  }
  return error.toString() || "Unknown error";
}

// Safe page evaluation wrapper that handles execution context destruction
async function safeEvaluate<T>(
  page: Page,
  fn: () => T | Promise<T>,
  fallback?: T,
  retries?: number
): Promise<T | null>;
async function safeEvaluate<T, P>(
  page: Page,
  fn: (param: P) => T | Promise<T>,
  param: P,
  fallback?: T,
  retries?: number
): Promise<T | null>;
async function safeEvaluate<T, P = void>(
  page: Page,
  fn: (() => T | Promise<T>) | ((param: P) => T | Promise<T>),
  paramOrFallback?: P | T,
  fallbackOrRetries?: T | number,
  retries?: number
): Promise<T | null> {
  // Determine which overload was called
  // If the second arg is a function parameter (not a fallback), it's the param overload
  const isParamOverload = paramOrFallback !== undefined && 
    (typeof paramOrFallback === 'string' || typeof paramOrFallback === 'number' || 
     (typeof paramOrFallback === 'object' && paramOrFallback !== null && !Array.isArray(paramOrFallback)));
  
  const param = isParamOverload ? (paramOrFallback as P) : undefined;
  const fallback = isParamOverload ? (fallbackOrRetries as T | undefined) : (paramOrFallback as T | undefined);
  const maxRetries = isParamOverload ? (retries ?? 2) : (typeof fallbackOrRetries === 'number' ? fallbackOrRetries : 2);
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Check if page is closed
      if (page.isClosed()) {
        log(`  ⚠ Page is closed, cannot evaluate`);
        return fallback ?? null;
      }

      // Wait a bit to ensure navigation has settled
      // Always wait before first attempt to ensure page is stable
      await new Promise(resolve => setTimeout(resolve, 500 + (attempt * 300)));

      // Try to evaluate with timeout
      const evaluatePromise = param !== undefined 
        ? page.evaluate(fn as any, param)
        : page.evaluate(fn as any);
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Evaluation timeout")), 5000);
      });
      
      const result = await Promise.race([evaluatePromise, timeoutPromise]);
      return result;
    } catch (error: any) {
      const errorMsg = error.message || error.toString();
      
      // Check for execution context errors
      if (
        errorMsg.includes("execution context destroyed") ||
        errorMsg.includes("Target closed") ||
        errorMsg.includes("Session closed") ||
        errorMsg.includes("Protocol error") ||
        errorMsg.includes("Navigation") ||
        errorMsg.includes("Execution context") ||
        errorMsg.includes("Evaluation timeout") ||
        error.name === "ProtocolError" ||
        error.name === "TargetClosedError"
      ) {
        if (attempt < maxRetries) {
          // Wait longer between retries
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        } else {
          return fallback ?? null;
        }
      }
      
      // For other errors, throw them
      throw error;
    }
  }
  return fallback ?? null;
}

async function getRobotsRules(baseUrl: string): Promise<any> {
  try {
    const robotsUrl = new URL("/robots.txt", baseUrl).href;
    log(`Checking robots.txt: ${robotsUrl}`);
    const response = await fetch(robotsUrl, {
      headers: {
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const text = await response.text();
      log("✓ robots.txt found and parsed");
      return robotsParser(robotsUrl, text);
    }
  } catch (error: any) {
    const errorMsg = getErrorMessage(error);
    log(`⚠ No robots.txt found or couldn't fetch (${errorMsg}) - allowing all`);
  }
  return null;
}

function normalizeUrl(url: string, baseUrl: string): string | null {
  try {
    // Handle protocol-relative URLs
    if (url.startsWith("//")) {
      url = new URL(baseUrl).protocol + url;
    }
    
    const parsed = new URL(url, baseUrl);
    
    // Preserve hash fragments that look like routes (SPA hash routing)
    // Hash routes typically start with #/ (e.g., #/products/content-packages)
    // Remove simple anchor links (just #section) as they don't change the page
    const hash = parsed.hash;
    if (hash && !hash.startsWith("#/")) {
      // Simple anchor link, remove it
    parsed.hash = "";
    }
    // If hash starts with #/, keep it (it's a route)
    
    // KEEP query parameters - they're important for pagination and dynamic content!
    // Only normalize the path, protocol, and host
    
    let normalized = parsed.href;
    
    // Remove trailing slash except for root (but preserve hash)
    if (normalized.endsWith("/") && !normalized.includes("#") && normalized !== parsed.origin + "/") {
      normalized = normalized.slice(0, -1);
    }
    
    return normalized;
  } catch (error) {
    // Invalid URL, skip it
    return null;
  }
}

function isInternalLink(url: string, baseOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    // baseOrigin can be either a full origin (protocol://host:port) or just host:port
    let baseUrlObj: URL;
    try {
      baseUrlObj = new URL(baseOrigin);
    } catch {
      // If baseOrigin is not a full URL, try to construct it
      baseUrlObj = new URL(`http://${baseOrigin}`);
    }
    
    // Check if same host (ignore protocol differences - http vs https)
    // This handles cases where sites redirect between http and https
    const sameHost = parsed.hostname === baseUrlObj.hostname;
    
    // Normalize ports: default ports are 80 for http, 443 for https
    const parsedPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const basePort = baseUrlObj.port || (baseUrlObj.protocol === "https:" ? "443" : "80");
    
    const samePort = parsedPort === basePort;
    
    return sameHost && samePort;
  } catch {
    return false;
  }
}

async function extractLinks(page: Page, baseUrl: string): Promise<string[]> {
  const links: string[] = [];
  
  // Get the actual current URL from the page (may have changed due to hash routing)
  let currentPageUrl: string;
  try {
    if (page.isClosed()) {
      currentPageUrl = baseUrl;
    } else {
      currentPageUrl = page.url();
    }
  } catch (error: any) {
    // If we can't get the URL, use the base URL
    log(`  ⚠ Could not get page URL: ${error.message}`);
    currentPageUrl = baseUrl;
  }
  const effectiveBaseUrl = currentPageUrl || baseUrl;
  
  // Wait a moment for any dynamically added links to appear
  // Also trigger any lazy-loaded navigation menus
  await safeEvaluate(page, () => {
    // Try to expand any collapsed navigation menus
    const navToggles = document.querySelectorAll("[aria-expanded='false'], [class*='collapsed'], [class*='menu-toggle']");
    navToggles.forEach((toggle) => {
      try {
        (toggle as HTMLElement).click();
      } catch {
        // Ignore errors
      }
    });
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Extract links from <a> tags using browser DOM
  const anchorLinks = await safeEvaluate<string[], string>(page, (base: string) => {
    const links: string[] = [];
    const anchors = document.querySelectorAll("a[href]");
    anchors.forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (href) {
        const trimmed = href.trim();
        // Allow hash-based routes (#/path) but skip simple anchors (#section)
        const isHashRoute = trimmed.startsWith("#/");
        const isSimpleAnchor = trimmed.startsWith("#") && !trimmed.startsWith("#/");
        if (trimmed && 
            !isSimpleAnchor && 
            !trimmed.startsWith("javascript:") && 
            !trimmed.startsWith("mailto:") && 
            !trimmed.startsWith("tel:") &&
            !trimmed.startsWith("data:") &&
            !trimmed.startsWith("file:")) {
          try {
            // Handle hash-only routes (e.g., #/products) - they're relative to current page
            if (isHashRoute) {
              // For hash routes, combine with base URL (use origin + pathname, preserve existing hash if any)
              const baseUrl = new URL(base);
              // If base already has a hash route, replace it; otherwise add the new one
              baseUrl.hash = trimmed;
              links.push(baseUrl.href);
            } else {
              // Resolve relative URLs normally
              const url = new URL(trimmed, base);
              // Preserve hash routes in resolved URLs
              if (url.hash && url.hash.startsWith("#/")) {
                links.push(url.href);
              } else if (!url.hash) {
                // No hash, add as-is
                links.push(url.href);
              }
              // Skip URLs with simple anchor hashes
            }
          } catch {
            // Invalid URL, skip
          }
        }
      }
    });
    
    // Also check for router links that might use data attributes or classes
    // Some SPAs use data-href, data-route, or router-link attributes
    const routerLinks = document.querySelectorAll("[data-href], [data-route], [router-link], [ng-href], [to]");
    routerLinks.forEach((element) => {
      const href = (element as HTMLElement).getAttribute("data-href") || 
                   (element as HTMLElement).getAttribute("data-route") ||
                   (element as HTMLElement).getAttribute("router-link") ||
                   (element as HTMLElement).getAttribute("ng-href") ||
                   (element as HTMLElement).getAttribute("to");
      if (href) {
        const trimmed = href.trim();
        const isHashRoute = trimmed.startsWith("#/");
        if (trimmed && isHashRoute) {
          try {
            const baseUrl = new URL(base);
            baseUrl.hash = trimmed;
            links.push(baseUrl.href);
          } catch {
            // Invalid URL, skip
          }
        } else if (trimmed && !trimmed.startsWith("http") && !trimmed.startsWith("/") && !trimmed.includes(":")) {
          // Relative route path (like "products" or "/products") - convert to hash route
          try {
            const routePath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
            const baseUrl = new URL(base);
            baseUrl.hash = `#${routePath}`;
            links.push(baseUrl.href);
          } catch {
            // Invalid URL, skip
          }
        }
      }
    });
    
    // Check for click handlers that might navigate to hash routes
    // Some SPAs use onclick handlers with hash navigation
    const clickableElements = document.querySelectorAll("[onclick*='#/'], [onclick*='location.hash'], [onclick*='router']");
    clickableElements.forEach((element) => {
      const onclick = (element as HTMLElement).getAttribute("onclick");
      if (onclick) {
        // Try to extract hash route from onclick handler
        const hashMatch = onclick.match(/#\/[^\s'"]+/);
        if (hashMatch) {
          try {
            const baseUrl = new URL(base);
            baseUrl.hash = hashMatch[0];
            links.push(baseUrl.href);
          } catch {
            // Invalid URL, skip
          }
        }
      }
    });
    
    return links;
  }, effectiveBaseUrl, []) || [];
  
  links.push(...anchorLinks);
  
  // Extract links from <area> tags (image maps)
  const areaLinks = await safeEvaluate<string[], string>(page, (base: string) => {
    const links: string[] = [];
    const areas = document.querySelectorAll("area[href]");
    areas.forEach((area) => {
      const href = area.getAttribute("href");
    if (href) {
      const trimmed = href.trim();
        // Allow hash-based routes (#/path) but skip simple anchors (#section)
        const isHashRoute = trimmed.startsWith("#/");
        const isSimpleAnchor = trimmed.startsWith("#") && !trimmed.startsWith("#/");
      if (trimmed && 
            !isSimpleAnchor && 
          !trimmed.startsWith("javascript:") && 
          !trimmed.startsWith("mailto:") && 
          !trimmed.startsWith("tel:") &&
          !trimmed.startsWith("data:")) {
          try {
            // Handle hash-only routes (e.g., #/products) - they're relative to current page
            if (isHashRoute) {
              // For hash routes, combine with base URL
              const baseUrl = new URL(base);
              baseUrl.hash = trimmed;
              links.push(baseUrl.href);
            } else {
              // Resolve relative URLs normally, but preserve hash routes
              const url = new URL(trimmed, base);
              if (url.hash && url.hash.startsWith("#/")) {
                links.push(url.href);
              } else if (!url.hash) {
                links.push(url.href);
              }
            }
          } catch {
            // Invalid URL, skip
          }
      }
    }
  });
    return links;
  }, effectiveBaseUrl, []) || [];
  
  links.push(...areaLinks);
  
  // Extract canonical links
  const canonicalLinks = await safeEvaluate<string[], string>(page, (base: string) => {
    const links: string[] = [];
    const canonical = document.querySelector("link[rel='canonical'][href]");
    if (canonical) {
      const href = canonical.getAttribute("href");
    if (href) {
        try {
          const url = new URL(href, base);
          links.push(url.href);
        } catch {
          // Invalid URL, skip
        }
      }
    }
    return links;
  }, effectiveBaseUrl, []) || [];
  
  links.push(...canonicalLinks);
  
  // Normalize all links and remove duplicates
  // Important: Use the current page URL as base to properly resolve hash routes
  const normalizedLinks = links
    .map(link => {
      // For hash-only links, ensure they're resolved relative to current page
      if (link.startsWith("#/")) {
        try {
          const baseUrl = new URL(effectiveBaseUrl);
          baseUrl.hash = link;
          return normalizeUrl(baseUrl.href, effectiveBaseUrl);
        } catch {
          return null;
        }
      }
      return normalizeUrl(link, effectiveBaseUrl);
    })
    .filter((link): link is string => link !== null && link !== undefined);
  
  // Remove duplicates while preserving hash routes
  return Array.from(new Set(normalizedLinks));
}

async function extractTitle(page: Page): Promise<string> {
  const title = await safeEvaluate(page, () => {
    const titleEl = document.querySelector("title");
    const h1El = document.querySelector("h1");
    const title = titleEl?.textContent?.trim() || "";
    const h1 = h1El?.textContent?.trim() || "";
  return title || h1 || "Untitled";
  }, undefined, "Untitled") || "Untitled";
  return title;
}

async function crawlPage(
  browser: Browser,
  url: string,
  depth: number,
  baseOrigin: string,
  retryCount = 0
): Promise<PageInfo | null> {
  let page: Page | null = null;
  try {
    log(`Crawling [Depth ${depth}]: ${url}`);
    
    page = await browser.newPage();
    
    // Set user agent and viewport
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Track navigation state to prevent evaluation during navigation
    let navigationInProgress = false;
    let navigationPromise: Promise<void> | null = null;
    let navigationResolve: (() => void) | null = null;
    let navigationTimeout: NodeJS.Timeout | null = null;
    
    // Listen for navigation start
    page.on("request", (request: any) => {
      if (request.isNavigationRequest()) {
        navigationInProgress = true;
      }
    });
    
    // Listen for navigation events
    page.on("framenavigated", () => {
      navigationInProgress = true;
      // Clear any existing timeout
      if (navigationTimeout) {
        clearTimeout(navigationTimeout);
      }
      // Set a timeout to mark navigation as complete
      navigationTimeout = setTimeout(() => {
        navigationInProgress = false;
        if (navigationResolve) {
          navigationResolve();
          navigationResolve = null;
        }
      }, 500);
    });
    
    // Wait for navigation to fully complete
    const waitForNavigationComplete = async (timeout = 3000) => {
      if (navigationInProgress) {
        return new Promise<void>((resolve) => {
          const startTime = Date.now();
          const checkNavigation = () => {
            if (!navigationInProgress || Date.now() - startTime > timeout) {
              navigationInProgress = false;
              resolve();
            } else {
              setTimeout(checkNavigation, 100);
            }
          };
          checkNavigation();
        });
      }
      // Small delay to ensure DOM is stable
      await new Promise(resolve => setTimeout(resolve, 200));
    };
    
    // Track network requests to wait for API calls to complete
    let pendingRequests = 0;
    let networkIdlePromise: Promise<void> | null = null;
    let networkIdleResolve: (() => void) | null = null;
    
    // Set request interception to block unnecessary resources for faster loading
    // BUT keep stylesheets for SPAs as they might need CSS to render properly
    await page.setRequestInterception(true);
    
    // Set up network request tracking and interception
    page.on("request", (request: any) => {
      try {
        if (!page || page.isClosed()) return;
        const resourceType = request.resourceType();
        
        // Track XHR and fetch requests (API calls)
        if (resourceType === "xhr" || resourceType === "fetch") {
          pendingRequests++;
          try {
            log(`  📡 API request started (${pendingRequests} pending): ${request.url().substring(0, 80)}`);
          } catch {
            // Ignore errors getting URL
          }
        }
        
        // Block images, fonts, and media for faster crawling
        // Keep stylesheets, scripts, and xhr/fetch requests for SPAs
        if (["image", "font", "media"].includes(resourceType)) {
          request.abort().catch(() => {
            // Ignore abort errors
          });
        } else {
          request.continue().catch(() => {
            // Ignore continue errors (page might be closed)
          });
        }
      } catch (error: any) {
        // Ignore errors in request handler (page might be closed)
        if (!error.message?.includes("Target closed") && 
            !error.message?.includes("execution context destroyed")) {
          // Log unexpected errors
        }
      }
    });
    
    page.on("response", (response: any) => {
      try {
        if (!page || page.isClosed()) return;
        const resourceType = response.request().resourceType();
        // Track completion of API calls
        if (resourceType === "xhr" || resourceType === "fetch") {
          pendingRequests = Math.max(0, pendingRequests - 1);
          if (pendingRequests === 0 && networkIdleResolve) {
            log(`  ✅ All API requests completed`);
            networkIdleResolve();
            networkIdleResolve = null;
          }
        }
      } catch (error: any) {
        // Ignore errors in response handler
      }
    });
    
    // Check if URL has a hash route
    const urlObj = new URL(url);
    const hasHashRoute = urlObj.hash && urlObj.hash.startsWith("#/");
    
    let response;
    
    if (hasHashRoute) {
      // For hash-based routing, navigate to base URL first, then set hash
      // This ensures the SPA loads properly before routing
      const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}${urlObj.search}`;
      log(`  ↪ Hash route detected, navigating to base first: ${baseUrl}`);
      
      // Navigate to base URL first - use faster loading strategy
      try {
        response = await page.goto(baseUrl, {
          waitUntil: "domcontentloaded", // Faster than networkidle2
          timeout: DEFAULT_TIMEOUT,
        });
        
        if (!response) {
          throw new Error("No response received");
        }
      } catch (error: any) {
        // If navigation fails due to context destruction, try to recover
        if (error.message?.includes("execution context destroyed") || 
            error.message?.includes("Target closed") ||
            error.message?.includes("Navigation")) {
          log(`  ⚠ Navigation error, attempting to recover...`);
          // Try to get a new page if the old one is closed
          if (page.isClosed()) {
            page = await browser.newPage();
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1920, height: 1080 });
            response = await page.goto(baseUrl, {
              waitUntil: "domcontentloaded",
              timeout: DEFAULT_TIMEOUT,
            });
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      
      // Wait for navigation to fully complete after initial load
      await waitForNavigationComplete(2000);
      
      // Wait for initial page load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Now set the hash to trigger the route
      log(`  ↪ Setting hash route: ${urlObj.hash}`);
      try {
        // Ensure navigation is stable before setting hash
        await waitForNavigationComplete(1000);
        await safeEvaluate<void, string>(page, (hash: string) => {
          window.location.hash = hash;
        }, urlObj.hash);
      } catch (error: any) {
        log(`  ⚠ Error setting hash: ${error.message}`);
      }
      
      // Wait for hashchange event and route to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Wait for any navigation to complete after hash change
      await waitForNavigationComplete(3000);
      
      // Wait for route content to render
      try {
        // Wait for DOM to update and content to appear
        if (!page.isClosed()) {
          await page.waitForFunction(
            () => {
              const body = document.body;
              if (!body) return false;
              
              // Check for loading indicators disappearing
              const loadingIndicators = body.querySelectorAll("[class*='loading'], [class*='spinner'], [id*='loading'], [class*='skeleton'], [class*='loader']");
              const hasLoading = Array.from(loadingIndicators).some(el => {
                const style = window.getComputedStyle(el);
                return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
              });
              
              // Check for meaningful content
              const text = body.innerText || body.textContent || "";
              const hasContent = text.length > 100 || 
                                body.querySelector("main, article, [role='main'], .content, .app-content") ||
                                body.querySelectorAll("a[href]").length > 3 ||
                                body.querySelectorAll("nav a, .nav a, [role='navigation'] a").length > 0;
              
              return !hasLoading && (hasContent || document.readyState === "complete");
            },
            { timeout: CONTENT_CHECK_TIMEOUT }
          ).catch((error: any) => {
            // Handle execution context errors
            if (error.message?.includes("execution context destroyed") || 
                error.message?.includes("Target closed") ||
                error.message?.includes("Navigation")) {
              log(`  ⚠ Execution context destroyed during wait, continuing...`);
            } else {
              log(`  ⚠ Timeout waiting for content, continuing anyway...`);
            }
          });
        }
      } catch (error: any) {
        // Continue even if timeout - some pages might load differently
        if (error.message?.includes("execution context destroyed")) {
          log(`  ⚠ Execution context destroyed, continuing...`);
        } else {
          log(`  ⚠ Error waiting for content, continuing anyway...`);
        }
      }
      
      // Wait for network requests to complete
      if (pendingRequests > 0) {
        log(`  ⏳ Waiting for ${pendingRequests} API request(s) to complete...`);
        networkIdlePromise = new Promise<void>((resolve) => {
          networkIdleResolve = resolve;
          // Timeout after reduced time
          setTimeout(() => {
            log(`  ⚠ Timeout waiting for API requests, continuing...`);
            resolve();
          }, NETWORK_IDLE_TIMEOUT);
        });
        await networkIdlePromise;
      }
      
      // Additional wait for lazy-loaded content and async operations
      await new Promise(resolve => setTimeout(resolve, SPA_WAIT_TIME));
      
      // Reduced scroll actions to trigger lazy loading (only 2 positions instead of 5)
      const scrollPositions = [0.5, 1.0];
      for (const position of scrollPositions) {
        await safeEvaluate<void, number>(page, (pos: number) => {
          window.scrollTo(0, document.body.scrollHeight * pos);
        }, position);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Wait a bit more after scrolling
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      // Normal navigation for non-hash URLs - use faster loading strategy
      try {
        response = await page.goto(url, {
          waitUntil: "domcontentloaded", // Faster than networkidle2
          timeout: DEFAULT_TIMEOUT,
        });
        
        if (!response) {
          throw new Error("No response received");
        }
      } catch (error: any) {
        // If navigation fails due to context destruction, try to recover
        if (error.message?.includes("execution context destroyed") || 
            error.message?.includes("Target closed") ||
            error.message?.includes("Navigation")) {
          log(`  ⚠ Navigation error, attempting to recover...`);
          // Try to get a new page if the old one is closed
          if (page.isClosed()) {
            page = await browser.newPage();
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1920, height: 1080 });
            response = await page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: DEFAULT_TIMEOUT,
            });
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      
      // Wait for navigation to fully complete first
      await waitForNavigationComplete(2000);
      
      // Wait for initial page load
      await new Promise(resolve => setTimeout(resolve, PAGE_LOAD_WAIT_TIME));
      
      // ALWAYS treat as potential SPA - apply aggressive waiting
      // This ensures we catch SPAs that don't have obvious framework indicators
      log(`  🔄 Applying SPA-optimized waiting strategy...`);
      
      // Wait for DOM mutations to settle (indicates content has loaded)
      try {
        await safeEvaluate(page, () => {
          return new Promise<void>((resolve) => {
            let lastMutationTime = Date.now();
            let timeoutId: any;
            
            const observer = new MutationObserver(() => {
              lastMutationTime = Date.now();
              // Clear existing timeout
              if (timeoutId) clearTimeout(timeoutId);
              
              // If no mutations for 2 seconds, consider DOM stable
              timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve();
              }, 2000);
            });
            
            if (document.body) {
              observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true,
              });
            }
            
            // Timeout after reduced time
            setTimeout(() => {
              observer.disconnect();
              if (timeoutId) clearTimeout(timeoutId);
              resolve();
            }, DOM_MUTATION_TIMEOUT);
          });
        });
        log(`  ✓ DOM mutations settled`);
      } catch (error) {
        log(`  ⚠ Mutation observer failed: ${error}`);
      }
      
      // For SPAs, wait for content to be rendered
      // Try to detect if it's an SPA by checking for common SPA indicators
      const isSPA = await safeEvaluate(page, () => {
        // Check for common SPA frameworks
        const hasReact = !!(window as any).React || !!(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
        const hasVue = !!(window as any).Vue || !!(window as any).__VUE__;
        const hasAngular = !!(window as any).ng || !!(window as any).angular;
        const hasRouter = !!(window as any).router || document.querySelector("[router-outlet]") || document.querySelector("[data-router]");
        // Also check for single-page app indicators
        const hasSinglePageApp = document.querySelector("[id*='app'], [id*='root'], [class*='app'], [class*='root']") && 
                                 document.querySelectorAll("a[href]").length < 10; // Few links might indicate SPA
        return hasReact || hasVue || hasAngular || !!hasRouter || !!hasSinglePageApp;
      }, undefined, false) || false;
      
      // ALWAYS apply SPA waiting, even if not detected (better safe than sorry)
      if (true) { // Always apply SPA strategy
        if (isSPA) {
          log(`  🔄 SPA detected, waiting for content to render...`);
        } else {
          log(`  🔄 Applying SPA-optimized strategy (precautionary)...`);
        }
        
        // Wait for SPA content
        await new Promise(resolve => setTimeout(resolve, SPA_WAIT_TIME));
        
        // Wait for meaningful content to appear - reduced to single check for speed
        try {
          if (!page.isClosed()) {
            await page.waitForFunction(
              () => {
                const body = document.body;
                if (!body) return false;
                
                // Check for loading indicators
                const loadingIndicators = body.querySelectorAll("[class*='loading'], [class*='spinner'], [id*='loading'], [class*='skeleton'], [class*='loader']");
                const hasLoading = Array.from(loadingIndicators).some(el => {
                  const style = window.getComputedStyle(el);
                  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
                });
                
                // Check for common content indicators - be more lenient
                const text = body.innerText || body.textContent || "";
                const hasContent = body.querySelector("main, article, [role='main'], .content, .app-content, [id*='app'], [id*='root']") ||
                                  text.length > 50 || // Lower threshold
                                  body.querySelectorAll("a[href]").length > 0 || // Any links
                                  body.querySelectorAll("nav a, .nav a, [role='navigation'] a, header a, footer a").length > 0 ||
                                  body.querySelectorAll("button, [role='button']").length > 0; // Any interactive elements
                return !hasLoading && hasContent && document.readyState === "complete";
              },
              { timeout: CONTENT_CHECK_TIMEOUT }
            ).catch((error: any) => {
              // Handle execution context errors
              if (error.message?.includes("execution context destroyed") || 
                  error.message?.includes("Target closed") ||
                  error.message?.includes("Navigation")) {
                log(`  ⚠ Execution context destroyed during wait, continuing...`);
              } else {
                log(`  ⚠ Timeout waiting for content, continuing anyway...`);
              }
            });
          }
        } catch (error: any) {
          if (error.message?.includes("execution context destroyed")) {
            log(`  ⚠ Execution context destroyed, continuing...`);
          } else {
            log(`  ⚠ Timeout waiting for content, continuing anyway...`);
          }
        }
        
        // Wait for network requests to complete
        if (pendingRequests > 0) {
          log(`  ⏳ Waiting for ${pendingRequests} API request(s) to complete...`);
          networkIdlePromise = new Promise<void>((resolve) => {
            networkIdleResolve = resolve;
            // Timeout after reduced time
            setTimeout(() => {
              log(`  ⚠ Timeout waiting for API requests, continuing...`);
              resolve();
            }, NETWORK_IDLE_TIMEOUT);
          });
          await networkIdlePromise;
        }
        
        // Reduced scroll operations for lazy loading (only 2 positions)
        await safeEvaluate(page, () => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await new Promise(resolve => setTimeout(resolve, 300));
        await safeEvaluate(page, () => {
          window.scrollTo(0, 0);
        });
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Reduced additional waiting for all pages
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Check for rate limiting
    if (response && response.status() === 429) {
      const retryAfter = response.headers()["retry-after"];
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
      log(`  ⚠ Rate limited (429), waiting ${delay}ms...`);
      await page.close();
      await new Promise(resolve => setTimeout(resolve, delay));
      return crawlPage(browser, url, depth, baseOrigin, retryCount + 1);
    }
    
    if (response && !response.ok()) {
      const status = response.status();
      const errorMsg = status === 403 
        ? "Forbidden (403) - Access denied"
        : status === 404
        ? "Not Found (404)"
        : status === 500
        ? "Server Error (500)"
        : status === 503
        ? "Service Unavailable (503)"
        : `HTTP ${status}`;
      log(`  ✗ Broken (${status}): ${url} - ${errorMsg}`);
      await page.close();
      return {
        url,
        title: `Error ${status}`,
        status: "broken",
        depth: 0,
        links: [],
      };
    }
    
    // Get the final URL after redirects and hash routing
    let finalUrl: string;
    try {
      if (page.isClosed()) {
        finalUrl = url; // Use original URL if page is closed
      } else {
        finalUrl = page.url();
      }
    } catch (error: any) {
      // If we can't get the URL, use the original URL
      log(`  ⚠ Could not get final URL: ${error.message}`);
      finalUrl = url;
    }
    
    // Verify hash route was set correctly
    if (hasHashRoute && !finalUrl.includes(urlObj.hash)) {
      log(`  ⚠ Hash route may not have loaded correctly. Expected: ${urlObj.hash}, Got: ${finalUrl}`);
      // Try to set it again
      try {
        if (!page.isClosed()) {
          await safeEvaluate<void, string>(page, (hash: string) => {
            window.location.hash = hash;
          }, urlObj.hash);
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Wait for navigation if it occurs
          try {
            await page.waitForNavigation({ timeout: 2000, waitUntil: "domcontentloaded" }).catch((error: any) => {
              // Handle execution context errors gracefully
              if (error.message?.includes("execution context destroyed") || 
                  error.message?.includes("Target closed") ||
                  error.message?.includes("Navigation")) {
                log(`  ⚠ Navigation context destroyed, continuing...`);
              }
            });
          } catch (error: any) {
            // Ignore navigation timeout and context errors
            if (!error.message?.includes("execution context destroyed") && 
                !error.message?.includes("Target closed")) {
              // Log other errors
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }
    
    // Final check: ensure page has content before extracting
    // This is especially important for SPAs
    const hasContent = await safeEvaluate(page, () => {
      const body = document.body;
      if (!body) return false;
      const text = body.innerText || body.textContent || "";
      const links = body.querySelectorAll("a[href]");
      // Check for common SPA content containers
      const hasMainContent = body.querySelector("main, article, [role='main'], .content, .app-content, [class*='content'], [id*='content'], [class*='app'], [id*='app']");
      // Check for loading indicators
      const loadingIndicators = body.querySelectorAll("[class*='loading'], [class*='spinner'], [id*='loading'], [class*='skeleton']");
      const isLoading = Array.from(loadingIndicators).some(el => {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      });
      return (text.length > 50 || links.length > 0 || !!hasMainContent) && !isLoading;
    }, undefined, false) || false;
    
    if (!hasContent) {
      log(`  ⚠ Page appears to have no content or still loading, waiting for SPA to render...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try scrolling to trigger lazy loading
      await safeEvaluate(page, () => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      await safeEvaluate(page, () => {
        window.scrollTo(0, 0);
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try clicking common navigation elements that might reveal content
      try {
        await safeEvaluate(page, () => {
          // Try to find and click menu/nav buttons that might reveal links
          const menuButtons = document.querySelectorAll("button[aria-label*='menu'], button[aria-label*='Menu'], [class*='menu-toggle'], [class*='nav-toggle']");
          if (menuButtons.length > 0) {
            (menuButtons[0] as HTMLElement).click();
          }
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch {
        // Ignore errors
      }
    }
    
    // Wait for any remaining network activity to settle
    // Check if there are still pending requests
    if (pendingRequests > 0) {
      log(`  ⏳ Waiting for ${pendingRequests} remaining request(s)...`);
      networkIdlePromise = new Promise<void>((resolve) => {
        networkIdleResolve = resolve;
        setTimeout(() => {
          log(`  ⚠ Timeout waiting for remaining requests, continuing...`);
          resolve();
        }, NETWORK_IDLE_TIMEOUT);
      });
      await networkIdlePromise;
    }
    
    // Wait for navigation to fully complete before extraction
    await waitForNavigationComplete(2000);
    
    // Reduced wait for network to settle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reduced final wait for any dynamically added links
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if page is still valid before extracting
    if (!page || page.isClosed()) {
      log(`  ⚠ Page is closed, cannot extract content`);
      if (page) {
        await page.close().catch(() => {});
      }
      return {
        url: finalUrl || url,
        title: "Error: Page closed",
        status: "broken",
        depth: 0,
        links: [],
      };
    }
    
    // Extract title and links from the rendered page
    let title: string;
    let links: string[];
    try {
      // Wait one more time to ensure everything is stable
      await waitForNavigationComplete(1000);
      title = await extractTitle(page);
      await waitForNavigationComplete(1000);
      links = await extractLinks(page, finalUrl);
    } catch (error: any) {
      // If extraction fails due to context destruction, return error info
      if (error.message?.includes("execution context destroyed") || 
          error.message?.includes("Target closed")) {
        log(`  ⚠ Execution context destroyed during extraction`);
        if (page && !page.isClosed()) {
          await page.close().catch(() => {});
        }
        return {
          url: finalUrl || url,
          title: "Error: Context destroyed",
          status: "broken",
          depth: 0,
          links: [],
        };
      }
      throw error;
    }
    
    // If no links found, wait a bit more and try again (for SPAs that load links dynamically)
    if (links.length === 0) {
      log(`  ⚠ No links found, waiting for dynamic content...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Scroll to trigger any lazy-loaded navigation
      await safeEvaluate(page, () => {
        window.scrollTo(0, 0);
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try extracting links again
      const retryLinks = await extractLinks(page, finalUrl);
      if (retryLinks.length > 0) {
        log(`  ✓ Found ${retryLinks.length} links on retry`);
        links.push(...retryLinks);
      }
    }
    
    const internalLinks = links.filter(link => isInternalLink(link, baseOrigin));
    
    // Count hash-based routes specifically
    const hashRoutes = links.filter(link => link.includes("#/"));
    const internalHashRoutes = internalLinks.filter(link => link.includes("#/"));
    
    // Enhanced logging to help debug link extraction
    if (links.length === 0) {
      log(`  ⚠ No links found on page`);
      // Debug: Log what's actually on the page
      const pageDebug = await safeEvaluate(page, () => {
        const body = document.body;
        if (!body) return { error: "No body" };
        return {
          textLength: (body.innerText || body.textContent || "").length,
          anchorCount: body.querySelectorAll("a").length,
          anchorWithHref: body.querySelectorAll("a[href]").length,
          allLinks: Array.from(body.querySelectorAll("a[href]")).slice(0, 10).map(a => ({
            href: a.getAttribute("href"),
            text: a.textContent?.substring(0, 50)
          })),
          hasMain: !!body.querySelector("main, article, [role='main']"),
          readyState: document.readyState,
          url: window.location.href
        };
      }, undefined, null) || null;
      if (pageDebug) {
        log(`  🔍 Debug info: ${JSON.stringify(pageDebug, null, 2)}`);
      }
    } else if (internalLinks.length === 0 && links.length > 0) {
      log(`  ⚠ Found ${links.length} links but none are internal (all external)`);
      // Log first few external links for debugging
      const sampleExternal = links.slice(0, 3);
      log(`     Sample links: ${sampleExternal.join(", ")}`);
    }
    
    // Log hash route information
    if (hashRoutes.length > 0) {
      log(`  🔗 Found ${hashRoutes.length} hash-based route(s), ${internalHashRoutes.length} internal`);
    }
    
    log(`  ✓ Found: "${title}" (${links.length} total links, ${internalLinks.length} internal)`);
    
    await page.close();
    
    return {
      url: finalUrl, // Use final URL after redirects
      title,
      status: "ok",
      depth: 0,
      links,
    };
  } catch (error: any) {
    if (page) {
      try {
        await page.close();
      } catch {
        // Ignore errors when closing
      }
    }
    
    // Retry on transient errors
    if (retryCount < MAX_RETRIES) {
      const isRetryable = 
        error.message?.includes("timeout") ||
        error.message?.includes("Navigation timeout") ||
        error.message?.includes("net::ERR") ||
        error.name === "TimeoutError";
      
      if (isRetryable) {
        const delay = RETRY_DELAY * (retryCount + 1);
        log(`  ⏳ Retrying (${retryCount + 1}/${MAX_RETRIES}) after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return crawlPage(browser, url, depth, baseOrigin, retryCount + 1);
      }
    }
    
    const errorMsg = getErrorMessage(error);
    log(`  ✗ Unreachable: ${url} - ${errorMsg}`);
    
    // Log more details for debugging
    if (error.code) {
      log(`     Error code: ${error.code}`);
    }
    if (error.stack && process.env.NODE_ENV === "development") {
      log(`     Stack: ${error.stack.substring(0, 200)}`);
    }
    
    return {
      url,
      title: `Error: ${errorMsg}`,
      status: "broken",
      depth: 0,
      links: [],
    };
  }
}

export type ProgressCallback = (progress: {
  pagesFound: number;
  currentUrl?: string;
  queueSize: number;
  progress: number; // 0-100
}) => void;

export async function crawlWebsite(
  startUrl: string, 
  maxDepth = 3,
  onProgress?: ProgressCallback
): Promise<CrawlResult> {
  log(`\n🚀 Starting crawl: ${startUrl}`);
  log(`📊 Max depth: ${maxDepth}, Max pages: 100\n`);
  
  const baseUrl = new URL(startUrl);
  const baseOrigin = baseUrl.origin;
  
  // Launch browser
  log(`🌐 Launching headless browser...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--disable-web-security",
    ],
  });
  
  try {
  // Get robots.txt rules
  const robots = await getRobotsRules(baseOrigin);
  
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number; parentId: string | null }> = [];
  const pages = new Map<string, PageInfo & { id: string; parentId: string | null }>();
  const duplicates = new Set<string>();
  
    // Normalize start URL - use the startUrl itself as base to preserve hash routes
    const normalizedStart = normalizeUrl(startUrl, startUrl);
  if (!normalizedStart) {
    throw new Error("Invalid URL");
  }
    
    // Log the normalized start URL to verify hash is preserved
    log(`📍 Starting URL: ${normalizedStart}`);
  
  queue.push({ url: normalizedStart, depth: 0, parentId: null });
  
  let idCounter = 0;
  let lastProgressLog = Date.now();
  
  // Main crawling loop - continue until queue is empty or page limit reached
  while (queue.length > 0 && pages.size < 100) { // Limit to 100 pages
    const { url, depth, parentId } = queue.shift()!;
    
    if (visited.has(url)) {
      if (!duplicates.has(url)) {
        duplicates.add(url);
        log(`  ⊙ Duplicate detected: ${url}`);
      }
      continue;
    }
    
    if (depth > maxDepth) {
      log(`  ⊘ Skipped (max depth reached): ${url}`);
      continue;
    }
    
    // Check robots.txt
    if (robots && !robots.isAllowed(url, USER_AGENT)) {
      log(`  ⊘ Blocked by robots.txt: ${url}`);
      continue;
    }
    
    visited.add(url);
    
      const pageInfo = await crawlPage(browser, url, depth, baseOrigin);
    if (!pageInfo) continue;
    
    const id = `node-${idCounter++}`;
    pageInfo.depth = depth;
    
    pages.set(url, { ...pageInfo, id, parentId });
    
    // Add internal links to queue
    if (depth < maxDepth && pageInfo.links.length > 0) {
      let linksAdded = 0;
      let linksSkipped = 0;
      let externalLinks = 0;
      let hashRoutesAdded = 0;
      for (const link of pageInfo.links) {
        if (isInternalLink(link, baseOrigin)) {
          if (!visited.has(link)) {
            queue.push({ url: link, depth: depth + 1, parentId: id });
            linksAdded++;
            // Track hash routes specifically
            if (link.includes("#/")) {
              hashRoutesAdded++;
            }
          } else {
            linksSkipped++;
          }
        } else {
          externalLinks++;
        }
      }
      if (linksAdded > 0) {
        const hashInfo = hashRoutesAdded > 0 ? ` (${hashRoutesAdded} hash route(s))` : "";
        log(`  ➕ Added ${linksAdded} new link(s) to queue${hashInfo} (depth ${depth + 1}/${maxDepth})`);
      }
      if (linksSkipped > 0) {
        log(`  ⊙ Skipped ${linksSkipped} already visited link(s)`);
      }
      if (externalLinks > 0) {
        log(`  ⊘ Skipped ${externalLinks} external link(s)`);
      }
    } else if (depth >= maxDepth && pageInfo.links.length > 0) {
      log(`  ⊘ Max depth (${maxDepth}) reached, skipping ${pageInfo.links.length} link(s)`);
    } else if (pageInfo.links.length === 0 && depth < maxDepth) {
      log(`  ℹ No links found on this page`);
    }
    
    // Progress update every 2 seconds
    const now = Date.now();
    if (now - lastProgressLog > 2000) {
      log(`\n📈 Progress: ${pages.size} pages found | ${queue.length} in queue | ${duplicates.size} duplicates\n`);
      lastProgressLog = now;
      
      // Call progress callback if provided
      if (onProgress) {
        const totalEstimated = Math.max(pages.size + queue.length, 1);
        const progressPercent = Math.min(95, Math.round((pages.size / totalEstimated) * 100));
        onProgress({
          pagesFound: pages.size,
          currentUrl: url,
          queueSize: queue.length,
          progress: progressPercent,
        });
      }
    }
    
    // Small delay to be respectful (reduced for faster crawling)
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  
  log(`\n✅ Crawl complete! Processing results...\n`);
  
  // Ensure we have at least one page (the starting page)
  if (pages.size === 0) {
    log(`⚠️  No pages found, creating root page...`);
    const rootId = `node-0`;
    pages.set(normalizedStart, {
      id: rootId,
      url: normalizedStart,
      title: "Home",
      status: "ok",
      depth: 0,
      links: [],
      parentId: null,
    });
  }
  
  // Mark duplicates
  for (const url of Array.from(duplicates)) {
    const page = pages.get(url);
    if (page) {
      page.status = "duplicate";
    }
  }
  
  // Detect if this is an SPA (check for hash routes or SPA characteristics)
  const isSPA = Array.from(pages.keys()).some(url => url.includes("#/")) ||
                Array.from(pages.values()).some(page => page.links.some(link => link.includes("#/")));
  
  log(`Building sitemap tree structure...`);
  
  let sitemap: SitemapNode;
  
  if (isSPA) {
    log(`  🔄 SPA detected - building flat URL list structure`);
    // For SPAs, create a flat list structure with all URLs as direct children of root
    sitemap = buildFlatSitemap(pages, normalizedStart);
  } else {
    // For traditional websites, build hierarchical tree
    sitemap = buildTree(pages, normalizedStart);
  }
  
  if (!sitemap) {
    throw new Error("Failed to build sitemap tree");
  }
  
  log(`Sitemap built with root: ${sitemap.url} (${sitemap.children?.length || 0} direct children)`);
  
  log(`Generating XML sitemap...`);
  let xmlContent = generateXml(pages);
  
  if (!xmlContent || xmlContent.length === 0) {
    log(`⚠️  XML content is empty, generating minimal XML...`);
    xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(normalizedStart)}</loc>
    <priority>1.0</priority>
  </url>
</urlset>`;
    log(`Generated minimal XML sitemap`);
  }
  
  const brokenCount = Array.from(pages.values()).filter((p) => p.status === "broken").length;
  const allUrls = Array.from(pages.values())
    .filter((p) => p.status === "ok")
    .map((p) => p.url)
    .sort();
  
  log(`\n📊 Final Statistics:`);
  log(`   ✓ Pages found: ${pages.size}`);
  log(`   ✗ Broken links: ${brokenCount}`);
  log(`   ⊙ Duplicates: ${duplicates.size}`);
  log(`   📄 XML sitemap generated (${xmlContent.length} chars)`);
  
  if (isSPA && allUrls.length > 0) {
    log(`\n📋 All URLs discovered (${allUrls.length} total):`);
    allUrls.forEach((url, index) => {
      const page = pages.get(url);
      const title = page?.title || "Untitled";
      log(`   ${index + 1}. ${url} - "${title}"`);
    });
  }
  
  log(``);
  
  // Final progress update
  if (onProgress) {
    onProgress({
      pagesFound: pages.size,
      currentUrl: undefined,
      queueSize: 0,
      progress: 100,
    });
  }
  
  return {
    sitemap,
    pagesFound: pages.size,
    brokenLinks: brokenCount,
    duplicatePages: duplicates.size,
    xmlContent,
  };
  } finally {
    // Always close the browser
    log(`🔒 Closing browser...`);
    await browser.close();
  }
}

function buildFlatSitemap(pages: Map<string, PageInfo & { id: string; parentId: string | null }>, rootUrl: string): SitemapNode {
  const pageArray = Array.from(pages.values()).filter(p => p.status === "ok");
  
  if (pageArray.length === 0) {
    log(`⚠️  No pages to build sitemap from, creating root node`);
    return {
      id: "root",
      url: rootUrl,
      title: "Root",
      depth: 0,
      children: [],
      status: "ok",
    };
  }
  
  const rootPage = pageArray.find((p) => p.url === rootUrl) || pageArray[0];
  
  if (!rootPage) {
    log(`⚠️  Root page not found, using first page`);
    return {
      id: "root",
      url: rootUrl,
      title: "Root",
      depth: 0,
      children: [],
      status: "ok",
    };
  }
  
  log(`Building flat SPA sitemap with root: ${rootPage.url} (${rootPage.title})`);
  log(`  📋 Listing all ${pageArray.length} URLs as flat structure...`);
  
  // Create a flat list: root with all other pages as direct children
  const allUrls: SitemapNode[] = [];
  
  for (const page of pageArray) {
    // Skip the root page itself (it will be the parent)
    if (page.url === rootUrl) {
      continue;
    }
    
    allUrls.push({
      id: page.id,
      url: page.url,
      title: page.title || page.url,
      depth: 1, // All at depth 1 in flat structure
      status: page.status,
    });
  }
  
  // Sort URLs for better readability
  allUrls.sort((a, b) => a.url.localeCompare(b.url));
  
  log(`  ✓ Created flat list with ${allUrls.length} URLs`);
  
  return {
    id: rootPage.id,
    url: rootPage.url,
    title: rootPage.title || rootPage.url,
    depth: 0,
    status: rootPage.status,
    children: allUrls,
  };
}

function buildTree(pages: Map<string, PageInfo & { id: string; parentId: string | null }>, rootUrl: string): SitemapNode {
  const pageArray = Array.from(pages.values());
  
  if (pageArray.length === 0) {
    log(`⚠️  No pages to build tree from, creating root node`);
    return {
      id: "root",
      url: rootUrl,
      title: "Root",
      depth: 0,
      children: [],
      status: "ok",
    };
  }
  
  const rootPage = pageArray.find((p) => p.url === rootUrl) || pageArray[0];
  
  if (!rootPage) {
    log(`⚠️  Root page not found, using first page`);
    return {
      id: "root",
      url: rootUrl,
      title: "Root",
      depth: 0,
      children: [],
      status: "ok",
    };
  }
  
  log(`Building tree with root: ${rootPage.url} (${rootPage.title})`);
  
  const buildNode = (page: PageInfo & { id: string; parentId: string | null }): SitemapNode => {
    const children = pageArray
      .filter((p) => p.parentId === page.id)
      .map(buildNode);
    
    const node: SitemapNode = {
      id: page.id,
      url: page.url,
      title: page.title || page.url,
      depth: page.depth,
      status: page.status,
    };
    
    if (children.length > 0) {
      node.children = children;
    }
    
    return node;
  };
  
  const tree = buildNode(rootPage);
  log(`Tree built: root has ${tree.children?.length || 0} children`);
  return tree;
}

function generateXml(pages: Map<string, PageInfo & { id: string; parentId: string | null }>): string {
  const urls = Array.from(pages.values())
    .filter((p) => p.status === "ok")
    .map((p) => {
      const priority = Math.max(0.1, 1 - p.depth * 0.2).toFixed(1);
      return `  <url>
    <loc>${escapeXml(p.url)}</loc>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
