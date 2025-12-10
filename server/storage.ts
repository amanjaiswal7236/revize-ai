import { User, Crawl, Sitemap, type IUser, type ICrawl, type ISitemap } from "./models";
import type { User as UserType, UpsertUser, Crawl as CrawlType, InsertCrawl, Sitemap as SitemapType, InsertSitemap } from "@shared/schema";
import { randomUUID } from "crypto";

// Convert MongoDB document to plain object
// Maps _id to id for compatibility with frontend
function toPlainObject<T>(doc: T | null): T | undefined {
  if (!doc) return undefined;
  const obj = JSON.parse(JSON.stringify(doc));
  // Convert _id to id
  if (obj._id) {
    obj.id = obj._id;
    delete obj._id;
  }
  // Remove password field for security
  if (obj.password !== undefined) {
    delete obj.password;
  }
  // Ensure dates are strings for JSON compatibility
  if (obj.createdAt && obj.createdAt instanceof Date) {
    obj.createdAt = obj.createdAt.toISOString();
  }
  if (obj.updatedAt && obj.updatedAt instanceof Date) {
    obj.updatedAt = obj.updatedAt.toISOString();
  }
  if (obj.completedAt && obj.completedAt instanceof Date) {
    obj.completedAt = obj.completedAt.toISOString();
  }
  return obj;
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<UserType | undefined>;
  getUserByEmail(email: string): Promise<UserType | undefined>;
  createUser(user: Omit<UpsertUser, "id"> & { password?: string }): Promise<UserType>;
  upsertUser(user: UpsertUser): Promise<UserType>;
  
  // Crawl operations
  createCrawl(crawl: InsertCrawl): Promise<CrawlType>;
  getCrawl(id: string): Promise<CrawlType | undefined>;
  getCrawlsByUser(userId: string): Promise<CrawlType[]>;
  updateCrawl(id: string, updates: Partial<CrawlType>): Promise<CrawlType | undefined>;
  
  // Sitemap operations
  createSitemap(sitemap: InsertSitemap): Promise<SitemapType>;
  getSitemapByCrawlId(crawlId: string): Promise<SitemapType | undefined>;
  updateSitemap(id: string, updates: Partial<SitemapType>): Promise<SitemapType | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<UserType | undefined> {
    const user = await User.findById(id).lean();
    return toPlainObject(user as any);
  }

  async getUserByEmail(email: string): Promise<UserType | undefined> {
    const user = await User.findOne({ email }).lean();
    return toPlainObject(user as any);
  }

  async createUser(userData: Omit<UpsertUser, "id"> & { password?: string }): Promise<UserType> {
    const userId = randomUUID();
    const { password, ...rest } = userData;
    const newUser = await User.create({
      _id: userId,
      ...rest,
      password: password || null,
    });
    const result = toPlainObject(newUser.toObject() as any) as UserType;
    // Remove password from result
    if (result && "password" in result) {
      delete (result as any).password;
    }
    return result;
  }

  async upsertUser(userData: UpsertUser): Promise<UserType> {
    const { id, ...rest } = userData;
    const user = await User.findByIdAndUpdate(
      id,
      {
        _id: id,
        ...rest,
        updatedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).lean();
    return toPlainObject(user as any) as UserType;
  }

  // Crawl operations
  async createCrawl(crawl: InsertCrawl): Promise<CrawlType> {
    const crawlId = randomUUID();
    console.log(`[Storage] Creating crawl with ID: ${crawlId}`);
    const newCrawl = await Crawl.create({
      _id: crawlId,
      ...crawl,
    });
    const result = toPlainObject(newCrawl.toObject() as any) as CrawlType;
    console.log(`[Storage] Crawl created: ${result.id}`);
    return result;
  }

  async getCrawl(id: string): Promise<CrawlType | undefined> {
    const crawl = await Crawl.findById(id).lean();
    return toPlainObject(crawl as any);
  }

  async getCrawlsByUser(userId: string): Promise<CrawlType[]> {
    const crawls = await Crawl.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    return crawls.map(c => toPlainObject(c as any)).filter(Boolean) as CrawlType[];
  }

  async updateCrawl(id: string, updates: Partial<CrawlType>): Promise<CrawlType | undefined> {
    console.log(`[Storage] Updating crawl ${id} with:`, updates);
    const crawl = await Crawl.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    ).lean();
    if (!crawl) {
      console.error(`[Storage] Crawl ${id} not found for update`);
      return undefined;
    }
    const result = toPlainObject(crawl as any);
    console.log(`[Storage] Crawl updated: ${result?.id}`);
    return result;
  }

  // Sitemap operations
  async createSitemap(sitemap: InsertSitemap): Promise<SitemapType> {
    const sitemapId = randomUUID();
    console.log(`[Storage] Creating sitemap with ID: ${sitemapId} for crawl: ${sitemap.crawlId}`);
    try {
      const newSitemap = await Sitemap.create({
        _id: sitemapId,
        ...sitemap,
      });
      const result = toPlainObject(newSitemap.toObject() as any) as SitemapType;
      console.log(`[Storage] Sitemap created successfully: ${result.id}`);
      return result;
    } catch (error: any) {
      console.error(`[Storage] Error creating sitemap:`, error);
      console.error(`[Storage] Sitemap data:`, JSON.stringify(sitemap, null, 2).substring(0, 500));
      throw error;
    }
  }

  async getSitemapByCrawlId(crawlId: string): Promise<SitemapType | undefined> {
    const sitemap = await Sitemap.findOne({ crawlId }).lean();
    return toPlainObject(sitemap as any);
  }

  async updateSitemap(id: string, updates: Partial<SitemapType>): Promise<SitemapType | undefined> {
    const sitemap = await Sitemap.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    ).lean();
    return toPlainObject(sitemap as any);
  }
}

export const storage = new DatabaseStorage();
