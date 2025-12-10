import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Download, FileJson, FileCode, Image } from "lucide-react";
import type { SitemapNode } from "@shared/schema";

interface ExportModalProps {
  sitemap: SitemapNode;
  xml?: string;
  trigger?: React.ReactNode;
}

type ExportFormat = "json" | "xml" | "png";

export function ExportModal({ sitemap, xml, trigger }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [open, setOpen] = useState(false);

  const handleExport = () => {
    if (format === "json") {
      const blob = new Blob([JSON.stringify(sitemap, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sitemap.json";
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === "xml" && xml) {
      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sitemap.xml";
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === "png") {
      // For PNG export, we'll capture the React Flow viewport
      const flowElement = document.querySelector(".react-flow") as HTMLElement;
      if (flowElement) {
        import("html-to-image").then(({ toPng }) => {
          toPng(flowElement, { backgroundColor: "white" }).then((dataUrl) => {
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = "sitemap.png";
            a.click();
          });
        }).catch(() => {
          // Fallback: Just download a text representation
          const blob = new Blob([JSON.stringify(sitemap, null, 2)], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "sitemap.txt";
          a.click();
          URL.revokeObjectURL(url);
        });
      }
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" data-testid="button-export">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Sitemap</DialogTitle>
          <DialogDescription>
            Choose a format to download your sitemap
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)} className="space-y-3 py-4">
          <div className="flex items-center space-x-3 p-3 rounded-md border hover-elevate cursor-pointer" onClick={() => setFormat("json")}>
            <RadioGroupItem value="json" id="json" />
            <Label htmlFor="json" className="flex items-center gap-3 cursor-pointer flex-1">
              <FileJson className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium">JSON</p>
                <p className="text-sm text-muted-foreground">Structured data format</p>
              </div>
            </Label>
          </div>

          <div 
            className={`flex items-center space-x-3 p-3 rounded-md border hover-elevate cursor-pointer ${!xml ? "opacity-50" : ""}`} 
            onClick={() => xml && setFormat("xml")}
          >
            <RadioGroupItem value="xml" id="xml" disabled={!xml} />
            <Label htmlFor="xml" className="flex items-center gap-3 cursor-pointer flex-1">
              <FileCode className="h-5 w-5 text-green-500" />
              <div>
                <p className="font-medium">XML</p>
                <p className="text-sm text-muted-foreground">Google-compatible sitemap format</p>
              </div>
            </Label>
          </div>

          <div className="flex items-center space-x-3 p-3 rounded-md border hover-elevate cursor-pointer" onClick={() => setFormat("png")}>
            <RadioGroupItem value="png" id="png" />
            <Label htmlFor="png" className="flex items-center gap-3 cursor-pointer flex-1">
              <Image className="h-5 w-5 text-purple-500" />
              <div>
                <p className="font-medium">PNG Image</p>
                <p className="text-sm text-muted-foreground">Visual tree diagram</p>
              </div>
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleExport} data-testid="button-download">
            <Download className="mr-2 h-4 w-4" />
            Download {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
