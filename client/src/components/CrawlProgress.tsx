import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Globe, FileSearch } from "lucide-react";

interface CrawlProgressProps {
  status: string;
  pagesFound?: number;
  currentUrl?: string;
  className?: string;
}

export function CrawlProgress({ status, pagesFound = 0, currentUrl, className }: CrawlProgressProps) {
  return (
    <Card className={`${className || ""}`}>
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <div className="p-6 rounded-full bg-primary/10">
              <Globe className="h-12 w-12 text-primary animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-2 rounded-full bg-background border">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">
              {status === "crawling" || status === "pending" ? "Crawling Website..." : status === "completed" ? "Processing Results..." : "Processing..."}
            </h3>
            <p className="text-muted-foreground">
              {status === "completed" 
                ? "Finalizing sitemap..." 
                : pagesFound > 0 
                  ? `Found ${pagesFound} pages so far` 
                  : "Discovering pages..."}
            </p>
          </div>

          <Progress value={undefined} className="w-full max-w-xs h-2" />

          {currentUrl && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground max-w-md">
              <FileSearch className="h-4 w-4 shrink-0" />
              <span className="truncate font-mono text-xs">{currentUrl}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
