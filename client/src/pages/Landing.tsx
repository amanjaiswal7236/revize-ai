import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Network, 
  Sparkles, 
  FileJson, 
  FileCode, 
  TreeDeciduous, 
  ArrowRight,
  Shield,
  Zap,
  Globe
} from "lucide-react";

export default function Landing() {
  const features = [
    {
      icon: Globe,
      title: "Smart Crawling",
      description: "Respects robots.txt rules and crawls up to 3 levels deep",
    },
    {
      icon: TreeDeciduous,
      title: "Visual Tree Diagram",
      description: "Interactive visualization of your website structure",
    },
    {
      icon: FileJson,
      title: "Multiple Formats",
      description: "Export as JSON, XML sitemap, or PNG diagram",
    },
    {
      icon: Sparkles,
      title: "AI Analysis",
      description: "Get intelligent suggestions to improve your site structure",
    },
    {
      icon: Shield,
      title: "SEO Optimization",
      description: "Detect issues and improve your search rankings",
    },
    {
      icon: Zap,
      title: "Fast & Efficient",
      description: "Quick analysis with detailed insights",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">revize-ai</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Sign Up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 md:py-32">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center text-center space-y-8 max-w-3xl mx-auto">
              <Badge variant="secondary" className="px-4 py-1">
                Powered by AI
              </Badge>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                Analyze & Improve Your{" "}
                <span className="text-primary">Website Structure</span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
                Enter any URL to crawl your website, generate sitemaps, and get AI-powered 
                suggestions to improve your site's SEO and navigation.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" asChild data-testid="button-get-started">
                  <Link href="/register">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">
                    Sign In
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-muted/50">
          <div className="container px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Everything You Need</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                A complete toolkit for understanding and optimizing your website structure
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {features.map((feature) => (
                <Card key={feature.title} className="hover-elevate">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-md bg-primary/10">
                        <feature.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container px-4 md:px-6">
            <div className="text-center space-y-6 max-w-2xl mx-auto">
              <h2 className="text-3xl font-bold">Ready to Optimize Your Website?</h2>
              <p className="text-muted-foreground">
                Join and start analyzing your website structure today.
              </p>
              <Button size="lg" asChild data-testid="button-cta-bottom">
                <Link href="/register">
                  Start Analyzing
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              <span>revize-ai</span>
            </div>
            <p>Website sitemap analysis powered by artificial intelligence</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
