import { z } from "zod";

// User types
export const userSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
});

export type User = z.infer<typeof userSchema>;

export const upsertUserSchema = userSchema.partial().required({ id: true });
export type UpsertUser = z.infer<typeof upsertUserSchema>;

// Registration schema
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// Login schema
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Crawl types
export const crawlSchema = z.object({
  id: z.string(),
  userId: z.string(),
  url: z.string(),
  status: z.enum(["pending", "crawling", "completed", "failed"]).default("pending"),
  pagesFound: z.number().default(0).optional(),
  brokenLinks: z.number().default(0).optional(),
  duplicatePages: z.number().default(0).optional(),
  maxDepth: z.number().default(3).optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  completedAt: z.date().or(z.string()).nullable().optional(),
});

export type Crawl = z.infer<typeof crawlSchema>;

export const insertCrawlSchema = crawlSchema.omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export type InsertCrawl = z.infer<typeof insertCrawlSchema>;

// Sitemap types
export const sitemapSchema = z.object({
  id: z.string(),
  crawlId: z.string(),
  userId: z.string(),
  originalJson: z.any(), // SitemapNode
  improvedJson: z.any().nullable().optional(), // SitemapNode
  xmlContent: z.string().nullable().optional(),
  aiExplanation: z.string().nullable().optional(),
  isImproved: z.boolean().default(false).optional(),
  createdAt: z.date().or(z.string()),
});

export type Sitemap = z.infer<typeof sitemapSchema>;

export const insertSitemapSchema = sitemapSchema.omit({
  id: true,
  createdAt: true,
});
export type InsertSitemap = z.infer<typeof insertSitemapSchema>;

// Sitemap node structure for tree visualization
export const sitemapNodeSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().optional(),
  depth: z.number(),
  children: z.array(z.lazy((): z.ZodType => sitemapNodeSchema)).optional(),
  status: z.enum(["ok", "broken", "duplicate"]).optional(),
  category: z.string().optional(),
});

export type SitemapNode = z.infer<typeof sitemapNodeSchema>;

// AI improvement suggestion schema
export const aiImprovementSchema = z.object({
  reorganizedStructure: sitemapNodeSchema,
  suggestions: z.array(z.object({
    type: z.enum(["reorganize", "group", "duplicate", "seo", "missing"]),
    description: z.string(),
    affectedUrls: z.array(z.string()).optional(),
  })),
  explanation: z.string(),
});

export type AIImprovement = z.infer<typeof aiImprovementSchema>;

// URL input validation schema
export const urlInputSchema = z.object({
  url: z.string().url("Please enter a valid URL").refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    "URL must start with http:// or https://"
  ),
  maxDepth: z.number().min(1).max(5).default(3),
});

export type UrlInput = z.infer<typeof urlInputSchema>;
