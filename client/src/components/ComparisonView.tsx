import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SitemapTree } from "./SitemapTree";
import { SitemapJsonView } from "./SitemapJsonView";
import type { SitemapNode } from "@shared/schema";
import { GitCompare, TreeDeciduous, FileJson } from "lucide-react";

interface ComparisonViewProps {
  original: SitemapNode;
  improved: SitemapNode;
  className?: string;
}

export function ComparisonView({ original, improved, className }: ComparisonViewProps) {
  const [viewMode, setViewMode] = useState<"tree" | "json">("tree");

  const countNodes = (node: SitemapNode): number => {
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += countNodes(child);
      }
    }
    return count;
  };

  const originalCount = countNodes(original);
  const improvedCount = countNodes(improved);

  return (
    <div className={`space-y-4 ${className || ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Before & After Comparison</h3>
        </div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "tree" | "json")}>
          <TabsList>
            <TabsTrigger value="tree" className="gap-2" data-testid="button-view-tree">
              <TreeDeciduous className="h-4 w-4" />
              Tree
            </TabsTrigger>
            <TabsTrigger value="json" className="gap-2" data-testid="button-view-json">
              <FileJson className="h-4 w-4" />
              JSON
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Original Structure</CardTitle>
              <Badge variant="secondary">{originalCount} pages</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {viewMode === "tree" ? (
              <SitemapTree data={original} className="h-[500px]" />
            ) : (
              <SitemapJsonView data={original} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Improved Structure</CardTitle>
              <Badge variant="default">{improvedCount} pages</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {viewMode === "tree" ? (
              <SitemapTree data={improved} className="h-[500px]" />
            ) : (
              <SitemapJsonView data={improved} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
