import OpenAI from "openai";
import type { SitemapNode, AIImprovement } from "@shared/schema";

// Initialize OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
});

// Models that support JSON mode (response_format: { type: 'json_object' })
const JSON_MODE_SUPPORTED_MODELS = [
  "gpt-4-turbo-preview",
  "gpt-4-0125-preview",
  "gpt-3.5-turbo",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo-1106",
  "gpt-4-1106-preview"
];

// Model context length limits (in tokens)
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4": 8192,
  "gpt-4-turbo-preview": 128000,
  "gpt-4-0125-preview": 128000,
  "gpt-3.5-turbo": 16385,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-3.5-turbo-1106": 16385,
  "gpt-4-1106-preview": 128000,
};

// Get model context limit, default to 8192 for unknown models
const getModelContextLimit = (model: string): number => {
  return MODEL_CONTEXT_LIMITS[model] || 8192;
};

// Use a valid OpenAI model - fallback to gpt-4-turbo-preview or gpt-3.5-turbo
const getModel = (): string => {
  const model = process.env.OPENAI_MODEL || "gpt-4-turbo-preview";
  // Validate model name
  const validModels = [
    "gpt-4-turbo-preview",
    "gpt-4",
    "gpt-4-0125-preview",
    "gpt-3.5-turbo",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo-1106",
    "gpt-4-1106-preview"
  ];
  
  if (validModels.includes(model)) {
    return model;
  }
  
  // Default to gpt-4-turbo-preview if invalid model specified
  console.warn(`[OpenAI] Invalid model "${model}", using gpt-4-turbo-preview`);
  return "gpt-4-turbo-preview";
};

// Check if model supports JSON mode
const supportsJsonMode = (model: string): boolean => {
  return JSON_MODE_SUPPORTED_MODELS.includes(model);
};

// Helper function to create a compact representation of sitemap (URLs only, minimal metadata)
function createCompactSitemap(sitemap: SitemapNode): any {
  function compactNode(node: SitemapNode): any {
    const compact: any = {
      url: node.url,
      title: node.title || node.url.split('/').pop() || 'Untitled',
    };
    
    if (node.children && node.children.length > 0) {
      compact.children = node.children.map(compactNode);
    }
    
    return compact;
  }
  
  return compactNode(sitemap);
}

// Helper function to truncate sitemap if too large
function truncateSitemapForAnalysis(sitemap: SitemapNode, maxDepth: number = 3, maxChildrenPerLevel: number = 20): SitemapNode {
  function truncateNode(node: SitemapNode, depth: number): SitemapNode {
    const truncated: SitemapNode = {
      id: node.id,
      url: node.url,
      title: node.title,
      depth: node.depth,
      status: node.status,
    };
    
    if (node.children && depth < maxDepth) {
      truncated.children = node.children.slice(0, maxChildrenPerLevel).map(child => truncateNode(child, depth + 1));
    }
    
    return truncated;
  }
  
  return truncateNode(sitemap, 0);
}

// Helper function to create a summary representation for very large sitemaps
function createSitemapSummary(sitemap: SitemapNode): string {
  const urlCounts: Record<number, number> = {}; // depth -> count
  const categories: string[] = [];
  
  function analyzeNode(node: SitemapNode, depth: number): void {
    urlCounts[depth] = (urlCounts[depth] || 0) + 1;
    
    // Extract potential category from URL path
    const pathParts = new URL(node.url).pathname.split('/').filter(p => p);
    if (pathParts.length > 0) {
      const category = pathParts[0];
      if (!categories.includes(category)) {
        categories.push(category);
      }
    }
    
    if (node.children) {
      node.children.forEach(child => analyzeNode(child, depth + 1));
    }
  }
  
  analyzeNode(sitemap, 0);
  
  const totalPages = Object.values(urlCounts).reduce((sum, count) => sum + count, 0);
  const maxDepth = Math.max(...Object.keys(urlCounts).map(Number));
  
  return `Sitemap Summary:
- Total pages: ${totalPages}
- Maximum depth: ${maxDepth}
- Root URL: ${sitemap.url}
- Main categories: ${categories.slice(0, 10).join(', ')}${categories.length > 10 ? '...' : ''}
- Structure: ${Object.entries(urlCounts).map(([depth, count]) => `Depth ${depth}: ${count} pages`).join(', ')}`;
}

// Rough estimate: ~4 characters per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Function to sanitize JSON string by fixing control characters
function sanitizeJsonString(str: string): string {
  // Use a state machine to properly handle strings and escape control characters
  let result = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    
    if (inString) {
      // Inside a string, escape control characters
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else if (char === '\f') {
        result += '\\f';
      } else if (char === '\b') {
        result += '\\b';
      } else if (char === '\v') {
        result += '\\v';
      } else if (char.charCodeAt(0) < 32) {
        // Other control characters
        result += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }
  
  return result;
}

export async function analyzeSitemap(sitemap: SitemapNode): Promise<AIImprovement> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  console.log("[OpenAI] Starting sitemap analysis...");
  
  const model = getModel();
  const contextLimit = getModelContextLimit(model);
  const useJsonMode = supportsJsonMode(model);
  
  // Reserve tokens for: system message (~100), user prompt template (~500), completion (~2000-3000)
  const reservedTokens = 1000; // System + prompt template
  const maxCompletionTokens = Math.min(3000, Math.floor(contextLimit * 0.3)); // Use max 30% for completion
  const availableInputTokens = contextLimit - reservedTokens - maxCompletionTokens;
  
  console.log(`[OpenAI] Model context limit: ${contextLimit} tokens`);
  console.log(`[OpenAI] Available for input: ~${availableInputTokens} tokens`);
  console.log(`[OpenAI] Max completion tokens: ${maxCompletionTokens}`);
  
  // Check sitemap size and use appropriate representation
  let sitemapToAnalyze: any = sitemap;
  let useCompactFormat = false;
  let useSummaryFormat = false;
  let truncationDepth = 3;
  let maxChildren = 20;
  
  // First, try compact format (removes unnecessary fields)
  const compactSitemap = createCompactSitemap(sitemap);
  const compactStr = JSON.stringify(compactSitemap);
  const compactTokens = estimateTokens(compactStr);
  
  console.log(`[OpenAI] Full sitemap: ~${estimateTokens(JSON.stringify(sitemap))} tokens`);
  console.log(`[OpenAI] Compact sitemap: ~${compactTokens} tokens`);
  
  // If compact format fits, use it
  if (compactTokens <= availableInputTokens * 0.8) {
    sitemapToAnalyze = compactSitemap;
    useCompactFormat = true;
    console.log(`[OpenAI] Using compact format`);
  } else {
    // Try truncation with compact format
    console.log(`[OpenAI] Sitemap too large (estimated ${compactTokens} tokens), truncating...`);
    
    // Determine truncation parameters based on model context
    if (contextLimit <= 8192) {
      truncationDepth = 2;
      maxChildren = 8;
    } else if (contextLimit <= 16385) {
      truncationDepth = 2;
      maxChildren = 12;
    } else if (contextLimit <= 32000) {
      truncationDepth = 3;
      maxChildren = 15;
    } else {
      truncationDepth = 3;
      maxChildren = 20;
    }
    
    // Truncate and use compact format
    const truncated = truncateSitemapForAnalysis(sitemap, truncationDepth, maxChildren);
    sitemapToAnalyze = createCompactSitemap(truncated);
    useCompactFormat = true;
    
    const truncatedStr = JSON.stringify(sitemapToAnalyze);
    const truncatedTokens = estimateTokens(truncatedStr);
    console.log(`[OpenAI] After truncation: estimated ${truncatedTokens} tokens`);
    
    // If still too large, apply more aggressive truncation
    if (truncatedTokens > availableInputTokens * 0.9) {
      console.log(`[OpenAI] Still too large, applying more aggressive truncation...`);
      truncationDepth = Math.max(1, truncationDepth - 1);
      maxChildren = Math.max(5, Math.floor(maxChildren * 0.6));
      
      const moreTruncated = truncateSitemapForAnalysis(sitemap, truncationDepth, maxChildren);
      sitemapToAnalyze = createCompactSitemap(moreTruncated);
      
      const finalTruncatedStr = JSON.stringify(sitemapToAnalyze);
      const finalTruncatedTokens = estimateTokens(finalTruncatedStr);
      console.log(`[OpenAI] After aggressive truncation: estimated ${finalTruncatedTokens} tokens`);
      
      // If still too large, use summary format
      if (finalTruncatedTokens > availableInputTokens * 0.9) {
        console.log(`[OpenAI] Sitemap still too large, using summary format`);
        useSummaryFormat = true;
        useCompactFormat = false;
        sitemapToAnalyze = createSitemapSummary(sitemap);
      }
    }
  }

  // Build prompt based on format used
  let sitemapContent: string;
  let promptInstructions: string;
  
  if (useSummaryFormat) {
    sitemapContent = sitemapToAnalyze;
    promptInstructions = `The sitemap is very large, so here's a summary of its structure:
${sitemapContent}

Since the full sitemap is too large to analyze in detail, provide high-level recommendations based on this summary. Focus on general structural improvements, categorization strategies, and SEO best practices that would apply to this type of website structure.`;
  } else {
    sitemapContent = JSON.stringify(sitemapToAnalyze, null, 2);
    if (useCompactFormat) {
      promptInstructions = `The sitemap is provided in a compact format (URLs and titles only). Some pages may have been truncated due to size limitations.`;
    } else {
      promptInstructions = `The sitemap is provided in full detail.`;
    }
    promptInstructions += ` Analyze the hierarchical structure and provide improvement suggestions.`;
  }

  const prompt = `You are an SEO and website architecture expert. Analyze the following website sitemap and provide suggestions to improve its structure.

${promptInstructions}

${useSummaryFormat ? 'Sitemap Summary:' : 'Sitemap Structure (JSON format):'}
${useSummaryFormat ? sitemapContent : sitemapContent}

Your task:
1. Analyze the current structure
2. Identify issues (duplicates, poor hierarchy, missing sections, SEO problems)
3. Suggest a reorganized structure with better grouping
4. Provide specific recommendations

${useSummaryFormat ? 'NOTE: Since only a summary is available, provide general recommendations and structural patterns that would improve this type of website.' : 'IMPORTANT: The reorganizedStructure should preserve the URLs from the original sitemap. Only reorganize the hierarchy, do not remove pages.'}

CRITICAL: Respond with ONLY valid JSON. No comments, no explanations outside the JSON, no markdown formatting. Start with { and end with }.

Respond with JSON in exactly this format:
{
  "reorganizedStructure": { ${useSummaryFormat ? '/* provide a suggested structure pattern based on the summary - use example URLs that match the pattern */' : '/* improved version of the sitemap with same structure but reorganized - MUST include all original URLs */'} },
  "suggestions": [
    {
      "type": "reorganize" | "group" | "duplicate" | "seo" | "missing",
      "description": "explanation of the issue and fix",
      "affectedUrls": ["list of affected URLs if applicable"]
    }
  ],
  "explanation": "A clear, concise explanation (2-3 paragraphs) of the main improvements made and why they will help the website's SEO and user experience"
}

IMPORTANT: 
${useSummaryFormat ? '- Since only a summary is available, provide a representative structure pattern rather than the full sitemap.' : '- The reorganizedStructure must preserve ALL URLs from the original sitemap. Only reorganize the hierarchy, do not remove any pages.'}
- Your response must be valid JSON only - no comments (// or /* */), no text before or after the JSON object.
- Do not include any explanatory text outside the JSON structure.

Focus on:
- Grouping related pages under logical sections
- Improving navigation depth (keep important pages closer to root)
- Identifying potential duplicate content
- SEO-friendly URL structure
- Logical categorization

${useSummaryFormat ? 'Provide a structural pattern that would work well for this type of website.' : 'Keep the same URLs but reorganize the tree structure.'}`;

  try {
    console.log(`[OpenAI] Using model: ${model}`);
    console.log(`[OpenAI] JSON mode supported: ${useJsonMode}`);
    
    // Prepare system message
    const systemMessage = "You are an expert in website architecture, SEO, and user experience. Provide actionable, specific recommendations for improving website structure. CRITICAL: Always respond with ONLY valid JSON - no comments, no markdown, no explanatory text outside the JSON object.";
    
    // Estimate final token usage
    const finalSitemapStr = useSummaryFormat ? sitemapToAnalyze : JSON.stringify(sitemapToAnalyze);
    const promptStr = prompt;
    const finalEstimatedTokens = estimateTokens(finalSitemapStr) + estimateTokens(promptStr) + estimateTokens(systemMessage);
    console.log(`[OpenAI] Final input size: ~${finalEstimatedTokens} tokens (available: ~${availableInputTokens} tokens)`);
    
    // Final safety check - if still too large, throw a helpful error
    if (finalEstimatedTokens > availableInputTokens) {
      const errorMsg = `Sitemap is too large to analyze (estimated ${finalEstimatedTokens} tokens, available ${availableInputTokens} tokens). ` +
        `The website has too many pages (${JSON.stringify(sitemap).length} characters). ` +
        `Try crawling with a lower max depth or use a model with a larger context window (e.g., gpt-4-turbo or gpt-4o).`;
      console.error(`[OpenAI] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // Build request parameters
    const requestParams: any = {
      model: model,
      messages: [
        {
          role: "system",
          content: systemMessage,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: maxCompletionTokens,
      temperature: 0.7,
    };
    
    // Only add response_format for models that support it
    if (useJsonMode) {
      requestParams.response_format = { type: "json_object" };
    } else {
      // For models that don't support JSON mode, emphasize JSON in the prompt
      requestParams.messages[0].content = systemMessage + " CRITICAL: You MUST respond with ONLY valid JSON, no other text before or after.";
    }
    
    const response = await openai.chat.completions.create(requestParams);

    console.log(`[OpenAI] Response received, choices: ${response.choices.length}`);
    
    const choice = response.choices[0];
    if (!choice) {
      console.error("[OpenAI] No choices in response:", JSON.stringify(response, null, 2));
      throw new Error("No choices in AI response");
    }

    console.log(`[OpenAI] Finish reason: ${choice.finish_reason}`);
    console.log(`[OpenAI] Choice message role: ${choice.message?.role}`);
    console.log(`[OpenAI] Choice message content length: ${choice.message?.content?.length || 0}`);

    const content = choice.message?.content;
    if (!content) {
      console.error("[OpenAI] No content in response. Full response:", JSON.stringify({
        id: response.id,
        model: response.model,
        finishReason: choice.finish_reason,
        message: choice.message,
        usage: response.usage
      }, null, 2));
      
      // Provide more helpful error message based on finish reason
      if (choice.finish_reason === "length") {
        throw new Error("AI response was truncated due to token limit. The sitemap may be too large. Try crawling with a lower max depth or use a model with a larger context window.");
      } else if (choice.finish_reason === "content_filter") {
        throw new Error("AI response was filtered. The content may have been flagged by OpenAI's safety filters.");
      } else if (choice.finish_reason === "stop") {
        throw new Error("AI response was empty. This may be a temporary issue. Please try again.");
      } else {
        throw new Error(`No response from AI. Finish reason: ${choice.finish_reason || "unknown"}. Please check your API key and try again.`);
      }
    }

    console.log(`[OpenAI] Content length: ${content.length} characters`);

    try {
      // Try to extract JSON from response (in case model doesn't support JSON mode)
      let jsonContent = content.trim();
      
      // Remove markdown code blocks if present
      if (jsonContent.startsWith("```json")) {
        jsonContent = jsonContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (jsonContent.startsWith("```")) {
        jsonContent = jsonContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      
      // Try to find JSON object in the response (look for opening brace)
      const firstBrace = jsonContent.indexOf('{');
      if (firstBrace !== -1) {
        jsonContent = jsonContent.substring(firstBrace);
      }
      
      // Remove single-line comments (// ...) - but be careful not to remove // in URLs
      jsonContent = jsonContent.replace(/\/\/(?![^"]*"(?:(?:[^"\\]|\\.)*"[^"]*)*$)/g, '');
      // Better approach: remove comments that are on their own line
      jsonContent = jsonContent.replace(/^\s*\/\/.*$/gm, '');
      
      // Remove multi-line comments (/* ... */)
      jsonContent = jsonContent.replace(/\/\*[\s\S]*?\*\//g, '');
      
      // Find the complete JSON object by matching braces (accounting for strings)
      let braceCount = 0;
      let jsonEnd = -1;
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < jsonContent.length; i++) {
        const char = jsonContent[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
      }
      
      if (jsonEnd > 0) {
        jsonContent = jsonContent.substring(0, jsonEnd);
      } else {
        // Fallback: try to find JSON object with regex
        const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
      }
      
      // Clean up any trailing commas before closing braces/brackets
      jsonContent = jsonContent.replace(/,(\s*[}\]])/g, '$1');
      
      // Remove any remaining whitespace issues
      jsonContent = jsonContent.trim();
      
      console.log(`[OpenAI] Extracted JSON length: ${jsonContent.length} characters`);
      
      // Try parsing with better error handling
      let result;
      try {
        result = JSON.parse(jsonContent);
      } catch (parseError: any) {
        // If parsing fails, try sanitizing control characters
        console.log(`[OpenAI] Initial parse failed, sanitizing control characters...`);
        const sanitized = sanitizeJsonString(jsonContent);
        
        try {
          result = JSON.parse(sanitized);
          console.log(`[OpenAI] Successfully parsed after sanitization`);
        } catch (secondError: any) {
          // Last resort: provide helpful error message
          const errorPos = parseError.message.match(/position (\d+)/)?.[1];
          if (errorPos) {
            const pos = parseInt(errorPos);
            const start = Math.max(0, pos - 100);
            const end = Math.min(jsonContent.length, pos + 100);
            console.error(`[OpenAI] JSON parse error at position ${pos}`);
            console.error(`[OpenAI] Error context: ${jsonContent.substring(start, end)}`);
          }
          throw parseError;
        }
      }
      
      // Validate response structure
      if (!result.reorganizedStructure) {
        console.warn("[OpenAI] Response missing reorganizedStructure, using original");
        result.reorganizedStructure = sitemap;
      }
      
      // Ensure we have all required fields
      const improvement: AIImprovement = {
        reorganizedStructure: result.reorganizedStructure || sitemap,
        suggestions: result.suggestions || [],
        explanation: result.explanation || "Analysis complete. The sitemap structure has been analyzed and reorganized for better SEO and user experience.",
      };
      
      console.log("[OpenAI] ✅ Analysis complete");
      return improvement;
    } catch (parseError) {
      console.error("[OpenAI] Failed to parse JSON response:", parseError);
      console.error("[OpenAI] Response content (first 1000 chars):", content.substring(0, 1000));
      console.error("[OpenAI] Response content (last 500 chars):", content.substring(Math.max(0, content.length - 500)));
      
      // Try to provide more helpful error message
      if (parseError instanceof SyntaxError) {
        const errorMsg = parseError.message;
        if (errorMsg.includes("control character")) {
          throw new Error(`Failed to parse AI response: The response contains unescaped control characters. This is a known issue with some models. Please try using a model that supports JSON mode (e.g., gpt-4-turbo, gpt-4o) or try again. Original error: ${errorMsg}`);
        } else {
          throw new Error(`Failed to parse AI response as JSON. The response may contain invalid JSON syntax. Please try again or use a model that supports JSON mode (e.g., gpt-4-turbo, gpt-4o). Original error: ${errorMsg}`);
        }
      } else {
        throw new Error(`Failed to parse AI response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
      }
    }
  } catch (error: any) {
    console.error("[OpenAI] Error calling OpenAI API:", error);
    
    // Provide more specific error messages
    if (error.status === 401) {
      throw new Error("Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.");
    } else if (error.status === 429) {
      throw new Error("OpenAI API rate limit exceeded. Please try again later.");
    } else if (error.status === 400 && error.message?.includes("token")) {
      throw new Error("Sitemap is too large for the selected model. Try using a model with a larger context window (e.g., gpt-4-turbo or gpt-4o) or crawl with a lower max depth.");
    } else if (error.status === 500) {
      throw new Error("OpenAI API server error. Please try again later.");
    } else if (error.message?.includes("parse") || error.message?.includes("JSON") || error.message?.includes("control character")) {
      // JSON parsing errors should be re-thrown as-is (they already have helpful messages)
      throw error;
    } else if (error.message?.includes("model")) {
      throw new Error(`Invalid OpenAI model. Please check your OPENAI_MODEL environment variable. Error: ${error.message}`);
    } else if (error.message?.includes("token") || error.message?.includes("context")) {
      throw new Error(`Token limit exceeded: ${error.message}. The sitemap is too large. Try using a model with a larger context window (e.g., gpt-4-turbo or gpt-4o) or crawl with a lower max depth.`);
    } else if (error.message) {
      throw new Error(`OpenAI API error: ${error.message}`);
    } else {
      throw new Error(`Failed to analyze sitemap: ${error.toString()}`);
    }
  }
}
