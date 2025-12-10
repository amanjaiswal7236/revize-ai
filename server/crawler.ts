import * as cheerio from "cheerio";
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

const USER_AGENT = "SiteMapAI-Crawler/1.0";

function log(message: string) {
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`[${timestamp}] [Crawler] ${message}`);
}

async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

async function getRobotsRules(baseUrl: string): Promise<any> {
  try {
    const robotsUrl = new URL("/robots.txt", baseUrl).href;
    log(`Checking robots.txt: ${robotsUrl}`);
    const response = await fetchWithTimeout(robotsUrl, 5000);
    if (response.ok) {
      const text = await response.text();
      log("✓ robots.txt found and parsed");
      return robotsParser(robotsUrl, text);
    }
  } catch (error) {
    log("⚠ No robots.txt found or couldn't fetch - allowing all");
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
    // Remove hash and query parameters for consistency
    parsed.hash = "";
    parsed.search = "";
    let normalized = parsed.href;
    
    // Remove trailing slash except for root
    if (normalized.endsWith("/") && normalized !== parsed.origin + "/") {
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
    return parsed.origin === baseOrigin;
  } catch {
    return false;
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  
  // Extract links from <a> tags (most common)
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      // Skip anchors, javascript, mailto, tel, and data URIs
      const trimmed = href.trim();
      if (trimmed && 
          !trimmed.startsWith("#") && 
          !trimmed.startsWith("javascript:") && 
          !trimmed.startsWith("mailto:") && 
          !trimmed.startsWith("tel:") &&
          !trimmed.startsWith("data:")) {
        const normalized = normalizeUrl(trimmed, baseUrl);
        if (normalized) {
          links.push(normalized);
        }
      }
    }
  });
  
  // Extract canonical links
  $("link[rel='canonical'][href]").each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      const normalized = normalizeUrl(href, baseUrl);
      if (normalized) {
        links.push(normalized);
      }
    }
  });
  
  // Remove duplicates and return
  return Array.from(new Set(links));
}

function extractTitle(html: string): string {
  const $ = cheerio.load(html);
  const title = $("title").text().trim();
  const h1 = $("h1").first().text().trim();
  return title || h1 || "Untitled";
}

async function crawlPage(url: string, depth: number): Promise<PageInfo | null> {
  try {
    log(`Crawling [Depth ${depth}]: ${url}`);
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      log(`  ✗ Broken (${response.status}): ${url}`);
      return {
        url,
        title: "Error Page",
        status: "broken",
        depth: 0,
        links: [],
      };
    }
    
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      log(`  ⊘ Skipped (non-HTML): ${url}`);
      return null; // Skip non-HTML pages
    }
    
    const html = await response.text();
    const title = extractTitle(html);
    const links = extractLinks(html, url);
    
    const baseOrigin = new URL(url).origin;
    const internalLinks = links.filter(link => isInternalLink(link, baseOrigin));
    log(`  ✓ Found: "${title}" (${links.length} total links, ${internalLinks.length} internal)`);
    return {
      url,
      title,
      status: "ok",
      depth: 0,
      links,
    };
  } catch (error) {
    log(`  ✗ Unreachable: ${url}`);
    return {
      url,
      title: "Unreachable",
      status: "broken",
      depth: 0,
      links: [],
    };
  }
}

export async function crawlWebsite(startUrl: string, maxDepth = 3): Promise<CrawlResult> {
  log(`\n🚀 Starting crawl: ${startUrl}`);
  log(`📊 Max depth: ${maxDepth}, Max pages: 100\n`);
  
  const baseUrl = new URL(startUrl);
  const baseOrigin = baseUrl.origin;
  
  // Get robots.txt rules
  const robots = await getRobotsRules(baseOrigin);
  
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number; parentId: string | null }> = [];
  const pages = new Map<string, PageInfo & { id: string; parentId: string | null }>();
  const duplicates = new Set<string>();
  
  // Normalize start URL
  const normalizedStart = normalizeUrl(startUrl, baseOrigin);
  if (!normalizedStart) {
    throw new Error("Invalid URL");
  }
  
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
    
    const pageInfo = await crawlPage(url, depth);
    if (!pageInfo) continue;
    
    const id = `node-${idCounter++}`;
    pageInfo.depth = depth;
    
    pages.set(url, { ...pageInfo, id, parentId });
    
    // Add internal links to queue
    if (depth < maxDepth && pageInfo.links.length > 0) {
      let linksAdded = 0;
      let linksSkipped = 0;
      let externalLinks = 0;
      for (const link of pageInfo.links) {
        if (isInternalLink(link, baseOrigin)) {
          if (!visited.has(link)) {
            queue.push({ url: link, depth: depth + 1, parentId: id });
            linksAdded++;
          } else {
            linksSkipped++;
          }
        } else {
          externalLinks++;
        }
      }
      if (linksAdded > 0) {
        log(`  ➕ Added ${linksAdded} new link(s) to queue (depth ${depth + 1}/${maxDepth})`);
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
    }
    
    // Small delay to be respectful
    await new Promise((resolve) => setTimeout(resolve, 100));
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
  
  log(`Building sitemap tree structure...`);
  // Build tree structure
  const sitemap = buildTree(pages, normalizedStart);
  
  if (!sitemap) {
    throw new Error("Failed to build sitemap tree");
  }
  
  log(`Sitemap tree built with root: ${sitemap.url}`);
  
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
  
  log(`\n📊 Final Statistics:`);
  log(`   ✓ Pages found: ${pages.size}`);
  log(`   ✗ Broken links: ${brokenCount}`);
  log(`   ⊙ Duplicates: ${duplicates.size}`);
  log(`   📄 XML sitemap generated (${xmlContent.length} chars)\n`);
  
  return {
    sitemap,
    pagesFound: pages.size,
    brokenLinks: brokenCount,
    duplicatePages: duplicates.size,
    xmlContent,
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
