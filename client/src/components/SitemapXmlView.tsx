import { ScrollArea } from "@/components/ui/scroll-area";

interface SitemapXmlViewProps {
  xml: string;
  className?: string;
}

export function SitemapXmlView({ xml, className }: SitemapXmlViewProps) {
  // Format XML with syntax highlighting colors using Tailwind classes
  const formatXml = (xmlString: string) => {
    return xmlString
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/(&lt;\/?)(\w+)/g, '<span class="text-primary">$1$2</span>')
      .replace(/(\w+)(=)/g, '<span class="text-chart-3">$1</span>$2')
      .replace(/(=)(".*?")/g, '$1<span class="text-chart-5">$2</span>')
      .replace(/(&gt;)([^&<]+)(&lt;)/g, '$1<span class="text-foreground">$2</span>$3');
  };

  return (
    <ScrollArea className={`h-[500px] rounded-md border bg-card ${className || ""}`}>
      <pre 
        className="p-4 text-sm font-mono whitespace-pre-wrap break-all"
        dangerouslySetInnerHTML={{ __html: formatXml(xml) }}
      />
    </ScrollArea>
  );
}
