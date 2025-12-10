import { Card, CardContent } from "@/components/ui/card";
import { FileText, AlertTriangle, Copy, Clock } from "lucide-react";

interface CrawlStatsProps {
  pagesFound: number;
  brokenLinks: number;
  duplicatePages: number;
  crawlTime?: number;
  className?: string;
}

export function CrawlStats({ pagesFound, brokenLinks, duplicatePages, crawlTime, className }: CrawlStatsProps) {
  const stats = [
    {
      label: "Pages Found",
      value: pagesFound,
      icon: FileText,
      color: "text-blue-500",
    },
    {
      label: "Broken Links",
      value: brokenLinks,
      icon: AlertTriangle,
      color: brokenLinks > 0 ? "text-red-500" : "text-green-500",
    },
    {
      label: "Duplicates",
      value: duplicatePages,
      icon: Copy,
      color: duplicatePages > 0 ? "text-yellow-500" : "text-green-500",
    },
    ...(crawlTime !== undefined ? [{
      label: "Crawl Time",
      value: `${(crawlTime / 1000).toFixed(1)}s`,
      icon: Clock,
      color: "text-muted-foreground",
    }] : []),
  ];

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className || ""}`}>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-md bg-muted ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
