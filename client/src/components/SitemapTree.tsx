import { useMemo, useEffect } from "react";
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
  useReactFlow,
  Handle,
} from "reactflow";
import "reactflow/dist/style.css";
import { Badge } from "@/components/ui/badge";
import type { SitemapNode } from "@shared/schema";

interface SitemapTreeProps {
  data: SitemapNode;
  className?: string;
}

const nodeWidth = 220;
const nodeHeight = 80;
const horizontalSpacing = 50; // Spacing between sibling nodes
const verticalSpacing = 120; // Spacing between levels

interface TreeNodeLayout {
  node: SitemapNode;
  x: number;
  y: number;
  width: number;
  children: TreeNodeLayout[];
}

function CustomNode({ data }: { data: { label: string; url: string; status?: string; depth: number } }) {
  const statusColors = {
    ok: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    broken: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    duplicate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  };

  return (
    <div className="px-4 py-3 rounded-md border bg-card shadow-sm min-w-[200px] max-w-[260px] relative">
      {/* Top handle for incoming connections */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{ 
          background: "hsl(var(--primary))",
          border: "2px solid hsl(var(--background))",
          width: "10px",
          height: "10px",
        }}
      />
      
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
      
      {/* Bottom handle for outgoing connections */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{ 
          background: "hsl(var(--primary))",
          border: "2px solid hsl(var(--background))",
          width: "10px",
          height: "10px",
        }}
      />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

/**
 * Calculate the width needed for a subtree
 * Returns the total width including the node and all its descendants
 */
function calculateSubtreeWidth(node: SitemapNode): number {
  const children = node.children || [];
  
  if (children.length === 0) {
    // Leaf node: just needs its own width
    return nodeWidth;
  }
  
  // Calculate total width of all children
  let childrenWidth = 0;
  children.forEach((child, index) => {
    const childWidth = calculateSubtreeWidth(child);
    childrenWidth += childWidth;
    // Add spacing between siblings (except for the last one)
    if (index < children.length - 1) {
      childrenWidth += horizontalSpacing;
    }
  });
  
  // Return the maximum of node width and children width
  return Math.max(nodeWidth, childrenWidth);
}

/**
 * Build a hierarchical layout for the tree
 * This creates a proper tree structure with correct positioning
 */
function buildTreeLayout(
  node: SitemapNode,
  depth: number,
  xOffset: number
): TreeNodeLayout {
  const children = node.children || [];
  
  if (children.length === 0) {
    // Leaf node: positioned at xOffset
    return {
      node,
      x: xOffset,
      y: depth * verticalSpacing,
      width: nodeWidth,
      children: [],
    };
  }
  
  // First, calculate widths for all children
  const childWidths = children.map(child => calculateSubtreeWidth(child));
  
  // Calculate total width needed for all children (including spacing)
  const totalChildrenWidth = childWidths.reduce((sum, width, index) => {
    return sum + width + (index < childWidths.length - 1 ? horizontalSpacing : 0);
  }, 0);
  
  // Process children and position them with proper spacing
  const childLayouts: TreeNodeLayout[] = [];
  let currentX = xOffset;
  
  children.forEach((child, index) => {
    const childLayout = buildTreeLayout(child, depth + 1, currentX);
    childLayouts.push(childLayout);
    // Move to next position: current child's end position + spacing
    currentX = childLayout.x + childLayout.width;
    if (index < children.length - 1) {
      currentX += horizontalSpacing;
    }
  });
  
  // Calculate the actual span of children (from first child's left to last child's right)
  const firstChildX = childLayouts[0].x;
  const lastChildX = childLayouts[childLayouts.length - 1].x;
  const lastChildRight = lastChildX + childLayouts[childLayouts.length - 1].width;
  const childrenSpan = lastChildRight - firstChildX;
  
  // Center the parent node over its children
  const childrenCenterX = firstChildX + childrenSpan / 2;
  const nodeX = childrenCenterX - nodeWidth / 2;
  
  // The total width of this subtree is the max of node width and children span
  const subtreeWidth = Math.max(nodeWidth, childrenSpan);
  
  return {
    node,
    x: nodeX,
    y: depth * verticalSpacing,
    width: subtreeWidth,
    children: childLayouts,
  };
}

/**
 * Convert tree layout to ReactFlow nodes and edges
 */
function layoutToReactFlow(
  layout: TreeNodeLayout,
  parentId: string | null,
  nodes: Node[],
  edges: Edge[]
): void {
  const nodeId = layout.node.id;
  
  // Add this node with explicit dimensions
  nodes.push({
    id: nodeId,
    type: "custom",
    position: { x: layout.x, y: layout.y },
    data: {
      label: layout.node.title || layout.node.url,
      url: layout.node.url,
      status: layout.node.status,
      depth: layout.node.depth,
    },
    width: nodeWidth,
    height: nodeHeight,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  });
  
  // Add edge from parent to this node with explicit handles
  if (parentId) {
    edges.push({
      id: `${parentId}-${nodeId}`,
      source: parentId,
      target: nodeId,
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "smoothstep",
      animated: false,
      markerEnd: { 
        type: MarkerType.ArrowClosed, 
        width: 20, 
        height: 20,
        color: "hsl(var(--muted-foreground))"
      },
      style: { 
        stroke: "hsl(var(--muted-foreground))", 
        strokeWidth: 2,
        strokeOpacity: 0.8
      },
    });
  }
  
  // Process children
  layout.children.forEach((childLayout) => {
    layoutToReactFlow(childLayout, nodeId, nodes, edges);
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
      // Build tree layout
      const treeLayout = buildTreeLayout(data, 0, 0);
      
      // Convert layout to ReactFlow nodes and edges
      layoutToReactFlow(treeLayout, null, nodes, edges);
      
      // Center the entire tree horizontally (optional - fitView will handle centering)
      // We just ensure it starts from a reasonable position
      if (nodes.length > 0) {
        const minX = Math.min(...nodes.map(n => n.position.x));
        // Shift so the leftmost node is at x=0 (fitView will center it in the viewport)
        const offsetX = -minX;
        
        nodes.forEach(node => {
          node.position.x += offsetX;
        });
      }
      
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
    <div className={`w-full rounded-md border bg-background overflow-hidden ${className || "h-[600px]"}`}>
      <ReactFlowProvider>
        <SitemapTreeInner 
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
        />
      </ReactFlowProvider>
    </div>
  );
}

function SitemapTreeInner({ 
  nodes, 
  edges, 
  onNodesChange, 
  onEdgesChange, 
  nodeTypes 
}: { 
  nodes: Node[]; 
  edges: Edge[]; 
  onNodesChange: any; 
  onEdgesChange: any; 
  nodeTypes: any;
}) {
  const { fitView } = useReactFlow();
  
  useEffect(() => {
    // Fit view after nodes are rendered
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 100);
    return () => clearTimeout(timer);
  }, [nodes, edges, fitView]);

  return (
    <div className="w-full h-full">
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
    </div>
  );
}
