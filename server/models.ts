import mongoose, { Schema, Document } from "mongoose";
import type { SitemapNode } from "@shared/schema";

// User Model
export interface IUser extends Document {
  _id: string;
  email?: string | null;
  password?: string | null; // Hashed password
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    _id: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    password: String, // Hashed password
    firstName: String,
    lastName: String,
    profileImageUrl: String,
  },
  {
    _id: false,
    timestamps: true,
  }
);

// Crawl Model
export interface ICrawl extends Document {
  _id: string;
  userId: string;
  url: string;
  status: "pending" | "crawling" | "completed" | "failed";
  pagesFound?: number;
  brokenLinks?: number;
  duplicatePages?: number;
  maxDepth?: number;
  errorMessage?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

const CrawlSchema = new Schema<ICrawl>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, ref: "User" },
    url: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "crawling", "completed", "failed"],
      default: "pending",
      required: true,
    },
    pagesFound: { type: Number, default: 0 },
    brokenLinks: { type: Number, default: 0 },
    duplicatePages: { type: Number, default: 0 },
    maxDepth: { type: Number, default: 3 },
    errorMessage: String,
    completedAt: Date,
  },
  {
    _id: false,
    timestamps: true,
  }
);

CrawlSchema.index({ userId: 1, createdAt: -1 });

// Sitemap Model
export interface ISitemap extends Document {
  _id: string;
  crawlId: string;
  userId: string;
  originalJson: SitemapNode;
  improvedJson?: SitemapNode | null;
  xmlContent?: string | null;
  aiExplanation?: string | null;
  isImproved?: boolean;
  createdAt: Date;
}

const SitemapSchema = new Schema<ISitemap>(
  {
    _id: { type: String, required: true },
    crawlId: { type: String, required: true, ref: "Crawl" },
    userId: { type: String, required: true, ref: "User" },
    originalJson: { type: Schema.Types.Mixed, required: true },
    improvedJson: Schema.Types.Mixed,
    xmlContent: String,
    aiExplanation: String,
    isImproved: { type: Boolean, default: false },
  },
  {
    _id: false,
    timestamps: true,
  }
);

SitemapSchema.index({ crawlId: 1 });
SitemapSchema.index({ userId: 1 });

export const User = mongoose.model<IUser>("User", UserSchema);
export const Crawl = mongoose.model<ICrawl>("Crawl", CrawlSchema);
export const Sitemap = mongoose.model<ISitemap>("Sitemap", SitemapSchema);

