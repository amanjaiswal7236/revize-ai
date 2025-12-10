import { useCallback, useMemo, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { Badge } from "@/components/ui/badge";
import type { SitemapNode } from "@shared/schema";

interface SitemapTreeProps {
  data: SitemapNode;
  className?: string;
}

const nodeWidth = 220;
const nodeHeight = 60;
const horizontalSpacing = 280;
const verticalSpacing = 100;

function CustomNode({ data }: { data: { label: string; url: string; status?: string; depth: number } }) {
  const statusColors = {
    ok: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    broken: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    duplicate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  };

  return (
    <div className="px-4 py-3 rounded-md border bg-card shadow-sm min-w-[200px] max-w-[260px]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={data.label}>
            {data.label || "Untitled"}
          </p>
          <p className="text-xs text-muted-foreground truncate font-mono" title={data.url}>
            {new URL(data.url).pathname || "/"}
          </p>
        </div>
        {data.status && data.status !== "ok" && (
          <Badge variant="secondary" className={`text-[10px] shrink-0 ${statusColors[data.status as keyof typeof statusColors] || ""}`}>
            {data.status}
          </Badge>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

function calculateTreeWidth(node: SitemapNode): number {
  const children = node.children || [];
  if (children.length === 0) {
    return nodeWidth + horizontalSpacing;
  }
  
  let totalWidth = 0;
  children.forEach((child) => {
    totalWidth += calculateTreeWidth(child);
  });
  
  return totalWidth;
}

function flattenTree(
  node: SitemapNode,
  parentId: string | null,
  depth: number,
  xOffset: number,
  nodes: Node[],
  edges: Edge[]
): void {
  const nodeId = node.id;
  const children = node.children || [];
  
  // Calculate widths of all children first
  const childWidths: number[] = [];
  let totalWidth = 0;
  
  children.forEach((child) => {
    const width = calculateTreeWidth(child);
    childWidths.push(width);
    totalWidth += width;
  });
  
  // If no children, use default width
  if (children.length === 0) {
    totalWidth = nodeWidth + horizontalSpacing;
  }

  // Calculate x position for this node (centered over its children)
  const x = xOffset + totalWidth / 2 - nodeWidth / 2;
  const y = depth * verticalSpacing;

  // Add this node to the nodes array
  nodes.push({
    id: nodeId,
    type: "custom",
    position: { x, y },
    data: {
      label: node.title || node.url,
      url: node.url,
      status: node.status,
      depth: node.depth,
    },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  });

  // Add edge from parent to this node
  if (parentId) {
    edges.push({
      id: `${parentId}-${nodeId}`,
      source: parentId,
      target: nodeId,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
      style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5 },
    });
  }

  // Recursively process children
  let childXOffset = xOffset;
  children.forEach((child, index) => {
    flattenTree(child, nodeId, depth + 1, childXOffset, nodes, edges);
    childXOffset += childWidths[index] || 0;
  });
}

export function SitemapTree({ data, className }: SitemapTreeProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!data) {
      console.warn("[SitemapTree] No data provided");
      return { nodes: [], edges: [] };
    }
    
    // Validate data structure
    if (!data.id || !data.url) {
      console.error("[SitemapTree] Invalid data structure - missing id or url:", data);
      return { nodes: [], edges: [] };
    }
    
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    try {
      flattenTree(data, null, 0, 0, nodes, edges);
      console.log("[SitemapTree] ✅ Generated tree:", { 
        nodeCount: nodes.length, 
        edgeCount: edges.length,
        rootId: data.id,
        rootTitle: data.title,
        rootUrl: data.url,
        hasChildren: !!(data.children && data.children.length > 0),
        childrenCount: data.children?.length || 0
      });
      
      if (nodes.length === 0) {
        console.warn("[SitemapTree] ⚠️ No nodes generated from data");
      }
    } catch (error) {
      console.error("[SitemapTree] ❌ Error generating tree:", error);
      console.error("[SitemapTree] Data that caused error:", data);
    }
    
    return { nodes, edges };
  }, [data]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when data changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // If no nodes, show a message
  if (nodes.length === 0) {
    return (
      <div className={`w-full h-full min-h-[500px] rounded-md border bg-background flex items-center justify-center ${className || ""}`}>
        <div className="text-center text-muted-foreground">
          <p className="text-sm">No tree data available</p>
          <p className="text-xs mt-1">The sitemap structure could not be visualized</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full min-h-[500px] rounded-md border bg-background ${className || ""}`}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor="hsl(var(--primary))"
            maskColor="hsl(var(--background) / 0.8)"
            className="!bg-card border rounded-md"
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
