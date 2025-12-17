import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";
import { Globe, FileText, AlertTriangle, Copy, Eye, History as HistoryIcon } from "lucide-react";
import type { Crawl } from "@shared/schema";

export default function History() {
  const { data: crawls, isLoading } = useQuery<Crawl[]>({
    queryKey: ["/api/crawls"],
  });
  const [, setLocation] = useLocation();

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    crawling: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const handleRowClick = (crawl: Crawl) => {
    if (crawl.status === "completed") {
      setLocation(`/?crawl=${crawl.id}`);
    }
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
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-12 flex-1" />
                      <Skeleton className="h-12 w-24" />
                      <Skeleton className="h-12 w-24" />
                      <Skeleton className="h-12 w-32" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Pages</TableHead>
                      <TableHead className="text-right">Broken</TableHead>
                      <TableHead className="text-right">Duplicates</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crawls.map((crawl) => (
                      <TableRow
                        key={crawl.id}
                        className={crawl.status === "completed" ? "cursor-pointer hover:bg-muted/50" : ""}
                        onClick={() => handleRowClick(crawl)}
                      >
                        <TableCell className="font-medium max-w-md">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate" title={crawl.url}>
                              {crawl.url}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="secondary" 
                            className={statusColors[crawl.status as keyof typeof statusColors]}
                          >
                            {crawl.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {crawl.status === "completed" ? (
                            <span className="flex items-center justify-end gap-1">
                              <FileText className="h-4 w-4" />
                              {crawl.pagesFound || 0}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {crawl.status === "completed" && (crawl.brokenLinks || 0) > 0 ? (
                            <span className="flex items-center justify-end gap-1 text-red-500">
                              <AlertTriangle className="h-4 w-4" />
                              {crawl.brokenLinks}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {crawl.status === "completed" && (crawl.duplicatePages || 0) > 0 ? (
                            <span className="flex items-center justify-end gap-1 text-yellow-500">
                              <Copy className="h-4 w-4" />
                              {crawl.duplicatePages}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {crawl.createdAt ? (
                            formatDistanceToNow(new Date(crawl.createdAt), { addSuffix: true })
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {crawl.status === "completed" ? (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLocation(`/?crawl=${crawl.id}`);
                              }}
                              className="gap-2"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
