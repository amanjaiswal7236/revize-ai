import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { Globe, FileText, AlertTriangle, Copy, ArrowRight, History as HistoryIcon } from "lucide-react";
import type { Crawl } from "@shared/schema";

export default function History() {
  const { data: crawls, isLoading } = useQuery<Crawl[]>({
    queryKey: ["/api/crawls"],
  });

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    crawling: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container px-4 md:px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <HistoryIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Crawl History</h1>
                <p className="text-muted-foreground">Your recent website analyses</p>
              </div>
            </div>
            <Button asChild>
              <Link href="/">New Analysis</Link>
            </Button>
          </div>

          {isLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Skeleton className="h-10 w-10 rounded-md" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-4 w-1/3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isLoading && crawls && crawls.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="flex justify-center mb-4">
                  <div className="p-4 rounded-full bg-muted">
                    <Globe className="h-8 w-8 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">No analyses yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start by analyzing your first website
                </p>
                <Button asChild>
                  <Link href="/">Analyze Website</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && crawls && crawls.length > 0 && (
            <div className="space-y-4">
              {crawls.map((crawl) => (
                <Card key={crawl.id} className="hover-elevate">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0 flex-1">
                        <div className="p-2 rounded-md bg-muted shrink-0">
                          <Globe className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate" title={crawl.url}>
                            {crawl.url}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                            <Badge 
                              variant="secondary" 
                              className={statusColors[crawl.status as keyof typeof statusColors]}
                            >
                              {crawl.status}
                            </Badge>
                            {crawl.createdAt && (
                              <span>
                                {formatDistanceToNow(new Date(crawl.createdAt), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                          
                          {crawl.status === "completed" && (
                            <div className="flex items-center gap-4 mt-3 text-sm">
                              <span className="flex items-center gap-1">
                                <FileText className="h-4 w-4" />
                                {crawl.pagesFound} pages
                              </span>
                              {(crawl.brokenLinks || 0) > 0 && (
                                <span className="flex items-center gap-1 text-red-500">
                                  <AlertTriangle className="h-4 w-4" />
                                  {crawl.brokenLinks} broken
                                </span>
                              )}
                              {(crawl.duplicatePages || 0) > 0 && (
                                <span className="flex items-center gap-1 text-yellow-500">
                                  <Copy className="h-4 w-4" />
                                  {crawl.duplicatePages} duplicates
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {crawl.status === "completed" && (
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/?crawl=${crawl.id}`}>
                            <ArrowRight className="h-5 w-5" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
