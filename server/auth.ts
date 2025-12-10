import session from "express-session";
import type { Express, RequestHandler } from "express";
import MongoStore from "connect-mongo";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { User } from "./models";
import { randomUUID } from "crypto";
import { registerSchema, loginSchema } from "@shared/schema";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const mongoStore = MongoStore.create({
    mongoUrl: process.env.DATABASE_URL,
    ttl: sessionTtl / 1000, // TTL in seconds
    autoRemove: "native",
  });
  
  return session({
    secret: process.env.SESSION_SECRET || "change-me-in-production",
    store: mongoStore,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Middleware to load user if session exists (don't auto-create)
  app.use(async (req: any, res, next) => {
    if (req.session.userId) {
      // Load user from database if session exists
      const user = await storage.getUser(req.session.userId);
      if (user) {
        req.user = { id: user.id, ...user };
      } else {
        // Session exists but user was deleted, clear session
        req.session.userId = null;
        req.user = null;
      }
    } else {
      // No session, user is not authenticated
      req.user = null;
    }
    next();
  });

  // Auth routes
  app.get("/api/auth/user", async (req: any, res) => {
    try {
      // Return user if authenticated, otherwise return 401
      if (!req.user?.id) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const user = await storage.getUser(req.user.id);
      if (!user) {
        // User was deleted, clear session
        req.session.userId = null;
        return res.status(401).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/login", (req, res) => {
    // Simple login - just redirect to home (user is auto-created)
    res.redirect("/");
  });

  app.get("/api/logout", (req: any, res) => {
    req.session.destroy((err: any) => {
      if (err) {
        console.error("Error destroying session:", err);
      }
      res.redirect("/");
    });
  });

  // Registration endpoint
  app.post("/api/auth/register", async (req: any, res) => {
    try {
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: validation.error.errors,
        });
      }

      const { email, password, firstName, lastName } = validation.data;

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        profileImageUrl: null,
      });

      // Set session
      req.session.userId = user.id;
      req.user = { id: user.id };

      res.status(201).json(user);
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: error.message || "Registration failed" });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: validation.error.errors,
        });
      }

      const { email, password } = validation.data;

      // Find user by email (need to get with password)
      const userWithPassword = await User.findOne({ email }).lean();
      if (!userWithPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check password
      if (!userWithPassword.password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValidPassword = await bcrypt.compare(password, userWithPassword.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Set session
      req.session.userId = userWithPassword._id;
      req.user = { id: userWithPassword._id };

      // Get user without password
      const user = await storage.getUser(userWithPassword._id);
      if (!user) {
        return res.status(500).json({ message: "Failed to fetch user" });
      }

      res.json(user);
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: error.message || "Login failed" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

