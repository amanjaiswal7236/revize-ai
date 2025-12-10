import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sparkles, FolderTree, Layers, AlertTriangle, Search, FileQuestion, ChevronDown } from "lucide-react";
import type { AIImprovement } from "@shared/schema";

interface AiInsightsPanelProps {
  improvement: AIImprovement;
  className?: string;
}

const suggestionIcons = {
  reorganize: FolderTree,
  group: Layers,
  duplicate: AlertTriangle,
  seo: Search,
  missing: FileQuestion,
};

const suggestionColors = {
  reorganize: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  group: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  duplicate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  seo: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  missing: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function AiInsightsPanel({ improvement, className }: AiInsightsPanelProps) {
  return (
    <Card className={`${className || ""}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">AI Analysis</CardTitle>
            <CardDescription>Suggested improvements for your sitemap</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {improvement.explanation}
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Recommendations</h4>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2 pr-4">
              {improvement.suggestions.map((suggestion, index) => {
                const Icon = suggestionIcons[suggestion.type] || FileQuestion;
                const colorClass = suggestionColors[suggestion.type] || "";
                
                return (
                  <Collapsible key={index}>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 hover-elevate text-left">
                        <div className={`p-1.5 rounded-md ${colorClass}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="secondary" className="text-xs capitalize">
                              {suggestion.type}
                            </Badge>
                            {suggestion.affectedUrls && suggestion.affectedUrls.length > 0 && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                {suggestion.affectedUrls.length} URL{suggestion.affectedUrls.length > 1 ? "s" : ""}
                                <ChevronDown className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                          <p className="text-sm mt-1">{suggestion.description}</p>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    {suggestion.affectedUrls && suggestion.affectedUrls.length > 0 && (
                      <CollapsibleContent>
                        <div className="ml-10 mt-1 p-2 rounded-md bg-muted/30 space-y-1">
                          {suggestion.affectedUrls.map((url, urlIndex) => (
                            <p key={urlIndex} className="text-xs font-mono text-muted-foreground truncate">
                              {url}
                            </p>
                          ))}
                        </div>
                      </CollapsibleContent>
                    )}
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
