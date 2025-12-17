import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { UrlInputCard } from "@/components/UrlInputCard";
import { CrawlProgress } from "@/components/CrawlProgress";
import { CrawlStats } from "@/components/CrawlStats";
import { SitemapTree } from "@/components/SitemapTree";
import { SitemapJsonView } from "@/components/SitemapJsonView";
import { SitemapXmlView } from "@/components/SitemapXmlView";
import { AiInsightsPanel } from "@/components/AiInsightsPanel";
import { ComparisonView } from "@/components/ComparisonView";
import { ExportModal } from "@/components/ExportModal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Sparkles, 
  TreeDeciduous, 
  FileJson, 
  FileCode, 
  ArrowLeft,
  Loader2,
  RefreshCw
} from "lucide-react";
import type { Crawl, Sitemap, SitemapNode, AIImprovement } from "@shared/schema";

type ViewState = "input" | "crawling" | "results";

export default function Home() {
  const [location] = useLocation();
  const [viewState, setViewState] = useState<ViewState>("input");
  const [activeCrawlId, setActiveCrawlId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("tree");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  // Read crawl query parameter from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const crawlId = urlParams.get("crawl");
    if (crawlId && crawlId !== activeCrawlId) {
      console.log("[Home] Found crawl query parameter:", crawlId);
      setActiveCrawlId(crawlId);
      // Invalidate queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/crawls", crawlId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sitemaps", crawlId] });
    }
  }, [location, activeCrawlId, queryClient]);

  // Poll for crawl status - keep enabled even after completion to get final status
  const { data: crawl, isLoading: crawlLoading, error: crawlError, refetch: refetchCrawl } = useQuery<Crawl & { progress?: number; currentUrl?: string; queueSize?: number }>({
    queryKey: ["/api/crawls", activeCrawlId],
    enabled: !!activeCrawlId,
    queryFn: async () => {
      if (!activeCrawlId) throw new Error("No activeCrawlId");
      const res = await fetch(`/api/crawls/${activeCrawlId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as Crawl | undefined;
      // Continue polling until we get a final status
      if (data?.status === "completed" || data?.status === "failed") {
        return false; // Stop polling once we have final status
      }
      return 2000; // Poll every 2 seconds while crawling
    },
    // Refetch once immediately when query becomes enabled
    refetchOnMount: true,
    retry: 2,
    retryDelay: 1000,
    onSuccess: (data) => {
      console.log("[Home] ✅ Crawl query succeeded:", {
        crawlId: data?.id,
        status: data?.status,
        pagesFound: data?.pagesFound,
        progress: data?.progress,
        activeCrawlId,
      });
    },
    onError: (error: any) => {
      console.error("[Home] ❌ Crawl query error:", {
        message: error.message,
        status: error?.status,
        activeCrawlId,
        error,
      });
    },
  });

  // Poll for real-time progress (separate endpoint for more frequent updates)
  const { data: progress } = useQuery<{ progress: number; currentUrl?: string; queueSize: number; pagesFound: number }>({
    queryKey: ["/api/crawls", activeCrawlId, "progress"],
    enabled: !!activeCrawlId && (crawl?.status === "crawling" || crawl?.status === "pending"),
    queryFn: async () => {
      if (!activeCrawlId) throw new Error("No activeCrawlId");
      const res = await fetch(`/api/crawls/${activeCrawlId}/progress`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    refetchInterval: 1000, // Poll every second for real-time updates
    refetchOnMount: true,
  });

  // Debug activeCrawlId and crawl state
  useEffect(() => {
    console.log("[Home] State check:", {
      activeCrawlId,
      hasCrawl: !!crawl,
      crawlStatus: crawl?.status,
      crawlId: crawl?.id,
      viewState,
      crawlLoading,
      crawlError: crawlError ? (crawlError as any).message : null,
    });
  }, [activeCrawlId, crawl, viewState, crawlLoading, crawlError]);

  // Get sitemap data - enable when crawl is completed or in results view
  const { data: sitemap, isLoading: sitemapLoading, refetch: refetchSitemap, error: sitemapError } = useQuery<Sitemap>({
    queryKey: ["/api/sitemaps", activeCrawlId],
    enabled: !!activeCrawlId && (crawl?.status === "completed" || viewState === "results"),
    queryFn: async () => {
      if (!activeCrawlId) throw new Error("No activeCrawlId");
      const res = await fetch(`/api/sitemaps/${activeCrawlId}`, {
        credentials: "include",
      });
      if (res.status === 202 || res.status === 404) {
        // Still processing or not found yet - throw to trigger retry
        const text = await res.text();
        const error: any = new Error(`${res.status}: ${text}`);
        error.status = res.status;
        throw error;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    // Always refetch when enabled changes to true
    refetchOnMount: true,
    retry: (failureCount, error: any) => {
      // Retry on 202 (processing) or 404 (not found yet), but not on other errors
      if (error?.status === 202 || error?.status === 404) {
        return failureCount < 10; // Retry up to 10 times
      }
      return false;
    },
    refetchInterval: (query) => {
      // If crawl is completed but no sitemap yet, keep polling
      const data = query.state.data;
      if (crawl?.status === "completed" && !data) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
    onSuccess: (data) => {
      console.log("[Home] ✅ Sitemap query succeeded:", {
        hasData: !!data,
        hasOriginalJson: !!data?.originalJson,
        hasImprovedJson: !!data?.improvedJson,
        isImproved: data?.isImproved,
        dataKeys: data ? Object.keys(data) : [],
      });
    },
    onError: (error: any) => {
      console.error("[Home] ❌ Sitemap query error:", {
        message: error.message,
        status: error?.status,
        error,
      });
    },
  });

  // Check crawl status and update view
  useEffect(() => {
    if (!activeCrawlId) {
      console.log("[Home] No activeCrawlId, skipping status check");
      return;
    }

    if (!crawl) {
      if (crawlError) {
        console.error("[Home] Crawl query failed:", crawlError);
      } else if (crawlLoading) {
        console.log("[Home] Crawl data loading...", { activeCrawlId });
      } else {
        console.warn("[Home] No crawl data and not loading - query may not be enabled", { activeCrawlId });
      }
      return;
    }

    console.log("[Home] Crawl status changed:", crawl.status, "Current viewState:", viewState, "Crawl ID:", crawl.id);

    if (crawl.status === "completed") {
      // Always transition to results when completed
      if (viewState !== "results") {
        console.log("[Home] ✅ Crawl completed! Transitioning to results view");
        queryClient.invalidateQueries({ queryKey: ["/api/sitemaps", activeCrawlId] });
        refetchSitemap();
        setViewState("results");
      }
    } else if (crawl.status === "failed") {
      console.log("[Home] ❌ Crawl failed");
      toast({
        title: "Crawl failed",
        description: crawl.errorMessage || "An error occurred while crawling the website",
        variant: "destructive",
      });
      setViewState("input");
      setActiveCrawlId(null);
    } else if (crawl.status === "crawling" && viewState !== "crawling") {
      // Ensure we're in crawling view when crawl is in progress
      console.log("[Home] Crawl in progress, ensuring viewState is crawling");
      setViewState("crawling");
    }
  }, [crawl?.status, crawl, viewState, toast, refetchSitemap, queryClient, activeCrawlId, crawlLoading, crawlError]);

  // AI improvement mutation
  const improveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCrawlId) {
        throw new Error("No active crawl");
      }
      const response = await apiRequest("POST", `/api/sitemaps/${activeCrawlId}/improve`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Failed to improve sitemap" }));
        throw new Error(error.message || "Failed to improve sitemap");
      }
      const data = await response.json();
      return data;
    },
    onSuccess: async (data) => {
      console.log("[Home] ✅ AI improvement successful:", {
        hasData: !!data,
        isImproved: data?.isImproved,
        hasImprovedJson: !!data?.improvedJson,
        hasAiExplanation: !!data?.aiExplanation,
        improvedJsonType: typeof data?.improvedJson,
        dataKeys: data ? Object.keys(data) : [],
      });
      
      // Update the query cache immediately with the new data
      queryClient.setQueryData(["/api/sitemaps", activeCrawlId], (oldData: any) => {
        console.log("[Home] Updating query cache:", {
          oldData: oldData ? Object.keys(oldData) : null,
          newData: data ? Object.keys(data) : null,
        });
        return data;
      });
      
      // Force a refetch to ensure we have the latest data from server
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/sitemaps", activeCrawlId],
        refetchType: 'active' 
      });
      
      // Small delay to ensure cache update is processed
      await new Promise(resolve => setTimeout(resolve, 200));
      
      await refetchSitemap();
      
      toast({
        title: "AI Analysis Complete",
        description: "Your sitemap has been analyzed and improved",
      });
    },
    onError: (error: Error) => {
      console.error("[Home] ❌ AI improvement failed:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to improve sitemap. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCrawlStart = (crawlId: string) => {
    console.log("[Home] 🚀 Starting crawl with ID:", crawlId);
    setActiveCrawlId(crawlId);
    setViewState("crawling");
    // Invalidate and refetch crawl immediately
    queryClient.invalidateQueries({ queryKey: ["/api/crawls", crawlId] });
    // Manually trigger a refetch after a short delay to ensure query is enabled
    setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ["/api/crawls", crawlId] });
    }, 100);
  };

  const handleNewCrawl = () => {
    setViewState("input");
    setActiveCrawlId(null);
  };

  // Debug logging
  useEffect(() => {
    if (sitemap) {
      console.log("[Home] Sitemap data received:", {
        hasOriginalJson: !!sitemap.originalJson,
        hasImprovedJson: !!sitemap.improvedJson,
        isImproved: sitemap.isImproved,
        sitemapKeys: Object.keys(sitemap),
      });
    }
  }, [sitemap]);

  // Helper function to recursively add IDs to all nodes in the tree
  const addIdsToSitemap = (node: any, parentIndex: number = 0, depth: number = 0): any => {
    if (!node) return node;
    
    // Generate id if missing
    if (!node.id) {
      if (node.url) {
        // Use URL to generate a stable ID
        node.id = `node-${node.url.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50)}`;
      } else {
        // Fallback to index-based ID
        node.id = `node-${depth}-${parentIndex}`;
      }
    }
    
    // Recursively process children
    if (node.children && Array.isArray(node.children)) {
      node.children = node.children.map((child: any, index: number) => 
        addIdsToSitemap(child, index, depth + 1)
      );
    }
    
    return node;
  };

  // Extract sitemap data - handle both originalJson and direct sitemap object
  // The sitemap might have originalJson as a nested object or the sitemap itself might be the data
  const parseSitemapData = (data: any): SitemapNode | undefined => {
    if (!data) {
      console.log("[Home] parseSitemapData: no data provided");
      return undefined;
    }
    // If it's a string, try to parse it
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.url) {
          const withIds = addIdsToSitemap(parsed);
          console.log("[Home] parseSitemapData: parsed string, has id/url:", !!withIds?.id, !!withIds?.url);
          return withIds as SitemapNode;
        }
      } catch (error) {
        console.error("[Home] parseSitemapData: failed to parse string:", error);
        return undefined;
      }
    }
    // If it's already an object, validate it has required fields
    if (typeof data === 'object') {
      // URL is required, but id can be generated if missing
      if (data.url) {
        // Make a copy to avoid mutating the original
        const dataCopy = JSON.parse(JSON.stringify(data));
        const withIds = addIdsToSitemap(dataCopy);
        console.log("[Home] parseSitemapData: valid object with url (id generated if needed):", {
          hasId: !!withIds.id,
          hasUrl: !!withIds.url,
          hasChildren: !!(withIds.children && withIds.children.length > 0),
        });
        return withIds as SitemapNode;
      } else {
        console.warn("[Home] parseSitemapData: object missing url:", {
          hasId: !!data.id,
          hasUrl: !!data.url,
          keys: Object.keys(data),
        });
      }
    }
    return undefined;
  };

  const originalSitemap = parseSitemapData(sitemap?.originalJson || (sitemap as any)?.sitemap);
  const improvedSitemap = parseSitemapData(sitemap?.improvedJson);
  const aiExplanation = sitemap?.aiExplanation;
  
  // Log the actual values for debugging
  useEffect(() => {
    if (sitemap) {
      console.log("[Home] 🔍 Detailed sitemap data:", {
        isImproved: sitemap.isImproved,
        hasImprovedJson: !!sitemap.improvedJson,
        improvedJsonValue: sitemap.improvedJson ? (typeof sitemap.improvedJson === 'string' ? sitemap.improvedJson.substring(0, 100) : JSON.stringify(sitemap.improvedJson).substring(0, 100)) : null,
        improvedJsonType: typeof sitemap.improvedJson,
        hasAiExplanation: !!sitemap.aiExplanation,
        aiExplanationValue: sitemap.aiExplanation ? sitemap.aiExplanation.substring(0, 100) : null,
        parsedImprovedSitemap: improvedSitemap ? {
          hasId: !!improvedSitemap.id,
          hasUrl: !!improvedSitemap.url,
          hasChildren: !!(improvedSitemap.children && improvedSitemap.children.length > 0),
        } : null,
      });
    }
  }, [sitemap, improvedSitemap]);

  // Debug logging for sitemap extraction
  useEffect(() => {
    console.log("[Home] Sitemap extraction:", {
      hasSitemap: !!sitemap,
      isImproved: sitemap?.isImproved,
      hasOriginalSitemap: !!originalSitemap,
      hasImprovedSitemap: !!improvedSitemap,
      hasAiExplanation: !!aiExplanation,
      improvedJsonType: typeof sitemap?.improvedJson,
      improvedJsonIsString: typeof sitemap?.improvedJson === 'string',
      improvedJsonLength: sitemap?.improvedJson ? (typeof sitemap.improvedJson === 'string' ? sitemap.improvedJson.length : JSON.stringify(sitemap.improvedJson).length) : 0,
      sitemapLoading,
      viewState,
      crawlStatus: crawl?.status,
    });
  }, [sitemap, originalSitemap, improvedSitemap, aiExplanation, sitemapLoading, viewState, crawl?.status]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container px-4 md:px-6 py-8">
        {viewState === "input" && (
          <div className="max-w-2xl mx-auto py-12">
            {!isAuthenticated && (
              <div className="mb-6 p-4 rounded-lg border bg-muted/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">Sign in to save your crawls</h3>
                    <p className="text-sm text-muted-foreground">
                      Create an account to save and access your crawl history
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" asChild>
                      <Link href="/login">Sign In</Link>
                    </Button>
                    <Button asChild>
                      <Link href="/register">Sign Up</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <UrlInputCard onCrawlStart={handleCrawlStart} />
          </div>
        )}

        {viewState === "crawling" && (
          <div className="max-w-2xl mx-auto py-12">
            <CrawlProgress
              status={crawl?.status || "pending"}
              pagesFound={progress?.pagesFound ?? crawl?.pagesFound ?? 0}
              currentUrl={progress?.currentUrl ?? crawl?.currentUrl}
              progress={progress?.progress ?? crawl?.progress}
              queueSize={progress?.queueSize ?? crawl?.queueSize ?? 0}
            />
          </div>
        )}

        {viewState === "results" && (
          <>
            {sitemapLoading && !sitemap && crawl?.status === "completed" && (
              <div className="max-w-2xl mx-auto py-12 text-center">
                <div className="space-y-4">
                  <div className="animate-pulse text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p>Loading sitemap...</p>
                  </div>
                  <Button onClick={() => refetchSitemap()} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                </div>
              </div>
            )}
            {!sitemapLoading && !sitemap && crawl?.status === "completed" && (
              <div className="max-w-2xl mx-auto py-12 text-center">
                <div className="space-y-4">
                  <div className="text-muted-foreground mb-4">
                    {(sitemapError as any)?.status === 202 
                      ? "Sitemap is being generated. This may take a few moments..."
                      : "Sitemap not found. The crawl completed but the sitemap may still be processing."}
                  </div>
                  <Button onClick={() => refetchSitemap()} disabled={sitemapLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${sitemapLoading ? 'animate-spin' : ''}`} />
                    {sitemapLoading ? 'Loading...' : 'Retry'}
                  </Button>
                </div>
              </div>
            )}
            {(originalSitemap || sitemap) ? (
              <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={handleNewCrawl} data-testid="button-new-crawl">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold">Sitemap Analysis</h1>
                  <p className="text-muted-foreground font-mono text-sm truncate max-w-md">
                    {crawl?.url}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                {!sitemap?.isImproved && (
                  <Button 
                    onClick={() => improveMutation.mutate()} 
                    disabled={improveMutation.isPending}
                    data-testid="button-improve"
                  >
                    {improveMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Improve with AI
                      </>
                    )}
                  </Button>
                )}
                <ExportModal 
                  sitemap={improvedSitemap || originalSitemap} 
                  xml={sitemap?.xmlContent || undefined}
                />
              </div>
            </div>

            <CrawlStats
              pagesFound={crawl?.pagesFound || 0}
              brokenLinks={crawl?.brokenLinks || 0}
              duplicatePages={crawl?.duplicatePages || 0}
            />

            {sitemap?.isImproved && improvedSitemap && aiExplanation ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <ComparisonView 
                    original={originalSitemap || improvedSitemap} 
                    improved={improvedSitemap} 
                  />
                </div>
                <AiInsightsPanel 
                  improvement={{
                    reorganizedStructure: improvedSitemap,
                    suggestions: [],
                    explanation: aiExplanation,
                  }}
                />
              </div>
            ) : sitemap?.isImproved && (!improvedSitemap || !aiExplanation) ? (
              <Card>
                <CardContent className="py-8">
                  <div className="text-center text-muted-foreground">
                    <p className="text-sm">Improved sitemap is being processed...</p>
                    <Button 
                      onClick={() => refetchSitemap()} 
                      variant="outline" 
                      className="mt-4"
                      disabled={sitemapLoading}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${sitemapLoading ? 'animate-spin' : ''}`} />
                      {sitemapLoading ? 'Refreshing...' : 'Refresh'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : !sitemap?.isImproved ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>Website Structure</CardTitle>
                      <CardDescription>
                        Visual representation of your website's pages
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">
                      {crawl?.pagesFound || 0} pages
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-4">
                      <TabsTrigger value="tree" className="gap-2" data-testid="tab-tree">
                        <TreeDeciduous className="h-4 w-4" />
                        Tree View
                      </TabsTrigger>
                      <TabsTrigger value="json" className="gap-2" data-testid="tab-json">
                        <FileJson className="h-4 w-4" />
                        JSON
                      </TabsTrigger>
                      <TabsTrigger value="xml" className="gap-2" data-testid="tab-xml">
                        <FileCode className="h-4 w-4" />
                        XML
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="tree" className="mt-0">
                      <SitemapTree data={originalSitemap} className="h-[600px]" />
                    </TabsContent>
                    
                    <TabsContent value="json" className="mt-0">
                      <SitemapJsonView data={originalSitemap} className="h-[600px]" />
                    </TabsContent>
                    
                    <TabsContent value="xml" className="mt-0">
                      {sitemap?.xmlContent ? (
                        <SitemapXmlView xml={sitemap.xmlContent} className="h-[600px]" />
                      ) : (
                        <div className="h-[600px] flex items-center justify-center text-muted-foreground">
                          XML content not available
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : null}
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
