import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link2, ChevronDown, Loader2, Sparkles } from "lucide-react";

const formSchema = z.object({
  url: z.string().url("Please enter a valid URL").refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    "URL must start with http:// or https://"
  ),
  maxDepth: z.number().min(1).max(5).default(3),
});

type FormValues = z.infer<typeof formSchema>;

interface UrlInputCardProps {
  onCrawlStart: (crawlId: string) => void;
}

export function UrlInputCard({ onCrawlStart }: UrlInputCardProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: "",
      maxDepth: 3,
    },
  });

  const crawlMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const response = await apiRequest("POST", "/api/crawl", data);
      const json = await response.json();
      return json;
    },
    onSuccess: (data: { crawlId: string }) => {
      console.log("[UrlInputCard] ✅ Crawl started, crawlId:", data.crawlId);
      toast({
        title: "Crawl started",
        description: "We're analyzing your website. This may take a moment...",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/crawls"] });
      onCrawlStart(data.crawlId);
    },
    onError: (error: Error) => {
      // Check if it's an authentication error
      if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        toast({
          title: "Authentication required",
          description: "Please sign in to start a crawl",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Crawl failed",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (data: FormValues) => {
    crawlMutation.mutate(data);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center pb-4">
        <div className="flex justify-center mb-4">
          <div className="p-3 rounded-full bg-primary/10">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl">Analyze Your Website</CardTitle>
        <CardDescription className="text-base">
          Enter any URL to crawl the site and generate an AI-powered sitemap analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Website URL</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        {...field}
                        placeholder="https://example.com"
                        className="pl-10 h-12 text-base"
                        disabled={crawlMutation.isPending}
                        data-testid="input-url"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" type="button" className="w-full justify-between text-muted-foreground" data-testid="button-advanced-options">
                  Advanced Options
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <FormField
                  control={form.control}
                  name="maxDepth"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Crawl Depth</FormLabel>
                        <span className="text-sm font-mono text-muted-foreground">
                          {field.value} level{field.value > 1 ? "s" : ""}
                        </span>
                      </div>
                      <FormControl>
                        <Slider
                          min={1}
                          max={5}
                          step={1}
                          value={[field.value]}
                          onValueChange={([value]) => field.onChange(value)}
                          disabled={crawlMutation.isPending}
                          data-testid="slider-depth"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Higher depth means more pages but longer crawl time
                      </p>
                    </FormItem>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>

            <Button
              type="submit"
              className="w-full h-12 text-base"
              disabled={crawlMutation.isPending}
              data-testid="button-analyze"
            >
              {crawlMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Analyze Website"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
