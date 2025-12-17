import { crawlWebsite } from "./crawler";
import { storage } from "./storage";

export interface CrawlProgress {
  crawlId: string;
  status: "pending" | "crawling" | "completed" | "failed";
  pagesFound: number;
  currentUrl?: string;
  queueSize: number;
  progress: number; // 0-100
  errorMessage?: string;
}

// In-memory progress tracking
const progressMap = new Map<string, CrawlProgress>();

export async function startCrawlWorker(
  crawlId: string,
  url: string,
  maxDepth: number
): Promise<void> {
  // Initialize progress
  progressMap.set(crawlId, {
    crawlId,
    status: "crawling",
    pagesFound: 0,
    queueSize: 1,
    progress: 0,
  });

  // Update database status
  await storage.updateCrawl(crawlId, {
    status: "crawling",
  });

  // Run crawl in background with progress tracking
  (async () => {
    try {
      console.log(`[Worker] Starting crawl ${crawlId} for ${url}`);
      
      // Create a progress callback
      let lastUpdate = Date.now();
      const updateProgress = (progress: Partial<CrawlProgress>) => {
        const current = progressMap.get(crawlId);
        if (current) {
          const updated = { ...current, ...progress };
          progressMap.set(crawlId, updated);
          
          // Throttle database updates (every 2 seconds)
          const now = Date.now();
          if (now - lastUpdate > 2000) {
            lastUpdate = now;
            storage.updateCrawl(crawlId, {
              pagesFound: updated.pagesFound,
              status: updated.status as any,
            }).catch(err => {
              console.error(`[Worker] Failed to update progress:`, err);
            });
          }
        }
      };

      // Start crawling with progress tracking
      // We'll modify crawlWebsite to accept a progress callback
      const result = await crawlWebsiteWithProgress(url, maxDepth, updateProgress);
      
      console.log(`[Worker] Crawl ${crawlId} completed: ${result.pagesFound} pages found`);
      
      // Final update
      progressMap.set(crawlId, {
        crawlId,
        status: "completed",
        pagesFound: result.pagesFound,
        queueSize: 0,
        progress: 100,
      });

      // Update crawl status
      await storage.updateCrawl(crawlId, {
        status: "completed",
        pagesFound: result.pagesFound,
        brokenLinks: result.brokenLinks,
        duplicatePages: result.duplicatePages,
        completedAt: new Date(),
      });

      // Create sitemap record
      try {
        const crawl = await storage.getCrawl(crawlId);
        if (!crawl) {
          throw new Error("Crawl not found");
        }

        await storage.createSitemap({
          crawlId: crawl.id,
          userId: crawl.userId,
          originalJson: result.sitemap,
          xmlContent: result.xmlContent,
          isImproved: false,
        });

        console.log(`[Worker] ✅ Sitemap created for crawl ${crawlId}`);
      } catch (sitemapError: any) {
        console.error(`[Worker] ❌ Failed to create sitemap:`, sitemapError);
        throw new Error(`Crawl completed but sitemap creation failed: ${sitemapError.message}`);
      }
    } catch (error: any) {
      console.error(`[Worker] Error during crawl ${crawlId}:`, error);
      
      progressMap.set(crawlId, {
        crawlId,
        status: "failed",
        pagesFound: 0,
        queueSize: 0,
        progress: 0,
        errorMessage: error.message || "Unknown error",
      });

      await storage.updateCrawl(crawlId, {
        status: "failed",
        errorMessage: error.message || "Unknown error",
      });
    } finally {
      // Clean up progress after 5 minutes
      setTimeout(() => {
        progressMap.delete(crawlId);
      }, 5 * 60 * 1000);
    }
  })();
}

export function getCrawlProgress(crawlId: string): CrawlProgress | undefined {
  return progressMap.get(crawlId);
}

// Modified crawlWebsite to accept progress callback
async function crawlWebsiteWithProgress(
  startUrl: string,
  maxDepth: number,
  onProgress: (progress: Partial<CrawlProgress>) => void
): Promise<CrawlResult> {
  // Wrap the progress callback to match CrawlProgress format
  const wrappedCallback = (progress: {
    pagesFound: number;
    currentUrl?: string;
    queueSize: number;
    progress: number;
  }) => {
    onProgress({
      pagesFound: progress.pagesFound,
      currentUrl: progress.currentUrl,
      queueSize: progress.queueSize,
      progress: progress.progress,
    });
  };
  
  return crawlWebsite(startUrl, maxDepth, wrappedCallback);
}

