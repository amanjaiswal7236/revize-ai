import { ScrollArea } from "@/components/ui/scroll-area";
import type { SitemapNode } from "@shared/schema";

interface SitemapJsonViewProps {
  data: SitemapNode;
  className?: string;
}

export function SitemapJsonView({ data, className }: SitemapJsonViewProps) {
  const jsonString = JSON.stringify(data, null, 2);

  return (
    <ScrollArea className={`h-[500px] rounded-md border bg-card ${className || ""}`}>
      <pre className="p-4 text-sm font-mono text-foreground whitespace-pre-wrap break-all">
        {jsonString}
      </pre>
    </ScrollArea>
  );
}
