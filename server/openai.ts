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

// Rough estimate: ~4 characters per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
  
  // Check sitemap size and truncate if needed
  let sitemapToAnalyze = sitemap;
  let truncationDepth = 3;
  let maxChildren = 20;
  
  // Estimate tokens for the full sitemap
  const sitemapStr = JSON.stringify(sitemap);
  const estimatedTokens = estimateTokens(sitemapStr);
  
  if (estimatedTokens > availableInputTokens) {
    console.log(`[OpenAI] Sitemap too large (estimated ${estimatedTokens} tokens), truncating...`);
    
    // Aggressively truncate for small context models
    if (contextLimit <= 8192) {
      truncationDepth = 2;
      maxChildren = 10;
    } else if (contextLimit <= 16385) {
      truncationDepth = 2;
      maxChildren = 15;
    }
    
    sitemapToAnalyze = truncateSitemapForAnalysis(sitemap, truncationDepth, maxChildren);
    
    // Re-estimate after truncation
    const truncatedStr = JSON.stringify(sitemapToAnalyze);
    const truncatedTokens = estimateTokens(truncatedStr);
    console.log(`[OpenAI] After truncation: estimated ${truncatedTokens} tokens`);
    
    // If still too large, truncate more aggressively
    if (truncatedTokens > availableInputTokens) {
      console.log(`[OpenAI] Still too large, applying more aggressive truncation...`);
      truncationDepth = 1;
      maxChildren = 5;
      sitemapToAnalyze = truncateSitemapForAnalysis(sitemap, truncationDepth, maxChildren);
    }
  }

  const prompt = `You are an SEO and website architecture expert. Analyze the following website sitemap and provide suggestions to improve its structure.

The sitemap is in JSON format representing the hierarchical structure of pages:
${JSON.stringify(sitemapToAnalyze, null, 2)}

Your task:
1. Analyze the current structure
2. Identify issues (duplicates, poor hierarchy, missing sections, SEO problems)
3. Suggest a reorganized structure with better grouping
4. Provide specific recommendations

CRITICAL: Respond with ONLY valid JSON. No comments, no explanations outside the JSON, no markdown formatting. Start with { and end with }.

Respond with JSON in exactly this format:
{
  "reorganizedStructure": { /* improved version of the sitemap with same structure but reorganized - MUST include all original URLs */ },
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
- The reorganizedStructure must preserve ALL URLs from the original sitemap. Only reorganize the hierarchy, do not remove any pages.
- Your response must be valid JSON only - no comments (// or /* */), no text before or after the JSON object.
- Do not include any explanatory text outside the JSON structure.

Focus on:
- Grouping related pages under logical sections
- Improving navigation depth (keep important pages closer to root)
- Identifying potential duplicate content
- SEO-friendly URL structure
- Logical categorization

Keep the same URLs but reorganize the tree structure.`;

  try {
    console.log(`[OpenAI] Using model: ${model}`);
    console.log(`[OpenAI] JSON mode supported: ${useJsonMode}`);
    
    const finalSitemapStr = JSON.stringify(sitemapToAnalyze);
    const finalEstimatedTokens = estimateTokens(finalSitemapStr);
    console.log(`[OpenAI] Final sitemap size: ${finalSitemapStr.length} characters (~${finalEstimatedTokens} tokens)`);
    
    // Build request parameters
    const requestParams: any = {
      model: model,
      messages: [
        {
          role: "system",
          content: "You are an expert in website architecture, SEO, and user experience. Provide actionable, specific recommendations for improving website structure. CRITICAL: Always respond with ONLY valid JSON - no comments, no markdown, no explanatory text outside the JSON object.",
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
      requestParams.messages[0].content += " CRITICAL: You MUST respond with ONLY valid JSON, no other text before or after.";
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
        throw new Error("AI response was truncated due to token limit. The sitemap may be too large. Try with a smaller sitemap.");
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
      
      // Remove single-line comments (// ...)
      jsonContent = jsonContent.replace(/\/\/.*$/gm, '');
      
      // Remove multi-line comments (/* ... */)
      jsonContent = jsonContent.replace(/\/\*[\s\S]*?\*\//g, '');
      
      // Find the complete JSON object by matching braces
      let braceCount = 0;
      let jsonEnd = -1;
      for (let i = 0; i < jsonContent.length; i++) {
        if (jsonContent[i] === '{') {
          braceCount++;
        } else if (jsonContent[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
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
      
      const result = JSON.parse(jsonContent);
      
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
        throw new Error(`Failed to parse AI response as JSON. The response may contain comments or invalid JSON syntax. Please try again or use a model that supports JSON mode. Original error: ${parseError.message}`);
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
    } else if (error.status === 500) {
      throw new Error("OpenAI API server error. Please try again later.");
    } else if (error.message?.includes("model")) {
      throw new Error(`Invalid OpenAI model. Please check your OPENAI_MODEL environment variable. Error: ${error.message}`);
    } else if (error.message) {
      throw new Error(`OpenAI API error: ${error.message}`);
    } else {
      throw new Error(`Failed to analyze sitemap: ${error.toString()}`);
    }
  }
}
