import type { Express } from "express";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { startCrawlWorker, getCrawlProgress } from "./worker";
import { analyzeSitemap } from "./openai";
import { urlInputSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<void> {
  // Setup authentication
  await setupAuth(app);

  // Start a new crawl (requires authentication)
  app.post("/api/crawl", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Validate input
      const validation = urlInputSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid URL", 
          errors: validation.error.errors 
        });
      }
      
      const { url, maxDepth } = validation.data;
      
      // Create crawl record
      const crawl = await storage.createCrawl({
        userId,
        url,
        status: "pending",
        maxDepth,
      });
      
      // Start crawl worker (runs in background)
      startCrawlWorker(crawl.id, url, maxDepth).catch((error) => {
        console.error(`[Routes] Failed to start crawl worker:`, error);
      });
      
      res.json({ crawlId: crawl.id });
    } catch (error: any) {
      console.error("Error starting crawl:", error);
      res.status(500).json({ message: error.message || "Failed to start crawl" });
    }
  });

  // Get user's crawls
  app.get("/api/crawls", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const crawls = await storage.getCrawlsByUser(userId);
      res.json(crawls);
    } catch (error) {
      console.error("Error fetching crawls:", error);
      res.status(500).json({ message: "Failed to fetch crawls" });
    }
  });

  // Get single crawl
  app.get("/api/crawls/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const crawlId = req.params.id;
      
      console.log(`[API] Fetching crawl ${crawlId} for user ${userId}`);
      
      const crawl = await storage.getCrawl(crawlId);
      
      if (!crawl) {
        console.log(`[API] Crawl ${crawlId} not found`);
        return res.status(404).json({ message: "Crawl not found" });
      }
      
      if (crawl.userId !== userId) {
        console.log(`[API] Access denied: crawl ${crawlId} belongs to user ${crawl.userId}, not ${userId}`);
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get real-time progress if available
      const progress = getCrawlProgress(crawlId);
      
      console.log(`[API] ✅ Crawl ${crawlId} found:`, {
        status: crawl.status,
        pagesFound: crawl.pagesFound,
        url: crawl.url,
        hasProgress: !!progress,
      });
      
      // Merge progress data if available
      const response = progress ? {
        ...crawl,
        currentUrl: progress.currentUrl,
        queueSize: progress.queueSize,
        progress: progress.progress,
      } : crawl;
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching crawl:", error);
      res.status(500).json({ message: "Failed to fetch crawl" });
    }
  });

  // Get crawl progress (real-time updates)
  app.get("/api/crawls/:id/progress", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const crawlId = req.params.id;
      
      // Verify crawl exists and belongs to user
      const crawl = await storage.getCrawl(crawlId);
      if (!crawl) {
        return res.status(404).json({ message: "Crawl not found" });
      }
      
      if (crawl.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get real-time progress
      const progress = getCrawlProgress(crawlId);
      
      if (progress) {
        res.json(progress);
      } else {
        // Return database status if no real-time progress available
        res.json({
          crawlId,
          status: crawl.status,
          pagesFound: crawl.pagesFound || 0,
          queueSize: 0,
          progress: crawl.status === "completed" ? 100 : crawl.status === "failed" ? 0 : 50,
        });
      }
    } catch (error) {
      console.error("Error fetching crawl progress:", error);
      res.status(500).json({ message: "Failed to fetch crawl progress" });
    }
  });

  // Get sitemap by crawl ID
  app.get("/api/sitemaps/:crawlId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const crawlId = req.params.crawlId;
      
      console.log(`[API] Fetching sitemap for crawl ${crawlId} by user ${userId}`);
      
      // First check if crawl exists and belongs to user
      const crawl = await storage.getCrawl(crawlId);
      if (!crawl) {
        return res.status(404).json({ message: "Crawl not found" });
      }
      
      if (crawl.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Check if crawl is still in progress
      if (crawl.status === "crawling" || crawl.status === "pending") {
        return res.status(202).json({ 
          message: "Crawl in progress", 
          status: crawl.status 
        });
      }
      
      // Get sitemap
      const sitemap = await storage.getSitemapByCrawlId(crawlId);
      
      if (!sitemap) {
        console.log(`[API] Sitemap not found for crawl ${crawlId}, crawl status: ${crawl.status}`);
        // If crawl is completed but sitemap not found, return 202 to indicate it's still processing
        if (crawl.status === "completed") {
          return res.status(202).json({ 
            message: "Sitemap is being generated. Please try again in a moment.",
            crawlStatus: crawl.status 
          });
        }
        return res.status(404).json({ 
          message: "Sitemap not found. The crawl may have failed or is still processing.",
          crawlStatus: crawl.status 
        });
      }
      
      if (sitemap.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      console.log(`[API] ✅ Sitemap found for crawl ${crawlId}:`, {
        sitemapId: sitemap.id,
        hasOriginalJson: !!sitemap.originalJson,
        hasImprovedJson: !!sitemap.improvedJson,
        hasXmlContent: !!sitemap.xmlContent,
        isImproved: sitemap.isImproved,
        originalJsonType: typeof sitemap.originalJson,
        originalJsonKeys: sitemap.originalJson ? Object.keys(sitemap.originalJson as any) : [],
        sitemapKeys: Object.keys(sitemap),
      });
      res.json(sitemap);
    } catch (error) {
      console.error("[API] Error fetching sitemap:", error);
      res.status(500).json({ message: "Failed to fetch sitemap" });
    }
  });

  // Improve sitemap with AI
  app.post("/api/sitemaps/:crawlId/improve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const crawlId = req.params.crawlId;
      
      console.log(`[API] 🚀 Starting AI improvement for crawl ${crawlId}`);
      
      // Check if OpenAI API key is configured
      if (!process.env.OPENAI_API_KEY) {
        console.error("[API] ❌ OPENAI_API_KEY not configured");
        return res.status(500).json({ message: "OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables." });
      }
      
      const sitemap = await storage.getSitemapByCrawlId(crawlId);
      
      if (!sitemap) {
        console.log(`[API] ❌ Sitemap not found for crawl ${crawlId}`);
        return res.status(404).json({ message: "Sitemap not found" });
      }
      
      if (sitemap.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (sitemap.isImproved) {
        return res.status(400).json({ message: "Sitemap already improved" });
      }
      
      if (!sitemap.originalJson) {
        return res.status(400).json({ message: "No sitemap data available to improve" });
      }
      
      console.log(`[API] 📊 Analyzing sitemap with ${JSON.stringify(sitemap.originalJson).length} characters`);
      
      // Analyze with AI
      const improvement = await analyzeSitemap(sitemap.originalJson as any);
      
      console.log(`[API] ✅ AI analysis complete, updating sitemap ${sitemap.id}`);
      
      // Update sitemap
      const updated = await storage.updateSitemap(sitemap.id, {
        improvedJson: improvement.reorganizedStructure,
        aiExplanation: improvement.explanation,
        isImproved: true,
      });
      
      console.log(`[API] ✅ Sitemap updated successfully`);
      
      res.json(updated);
    } catch (error: any) {
      console.error("[API] ❌ Error improving sitemap:", error);
      res.status(500).json({ 
        message: error.message || "Failed to improve sitemap",
        error: process.env.NODE_ENV === "development" ? error.stack : undefined
      });
    }
  });

}
